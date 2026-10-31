"""Real two-member world inventory requests, creation and counted freight.

The browser mounts the production World Supply module against an isolated real
server. No network route or item completion is mocked. Service tests separately
exercise verified sea voyages and final receiving receipts with a test clock.
Run after npm run build, or set MUZIKAZ_STATIC_SOURCE=repository while developing.
"""
import json
import os
import socket
import subprocess
import tempfile
import time
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = Path('/workspace/scratch')
ARTIFACTS.mkdir(exist_ok=True)
os.chdir(ROOT)
ITEM = 'native:forge-dagger'
REWARD = 700
INITIAL = 50000
SEED = """
import {MzkAccountStore} from './loadout-code-store.mjs';
import {UserJsonDatabase} from './user-json-database.mjs';
import {join} from 'node:path';
const directory=process.argv[2],accounts=new MzkAccountStore(join(directory,'accounts.json')),database=new UserJsonDatabase(join(directory,'users.json'));
for(const [name,password]of [['WorldRequestBuyer','world-request-buyer-password'],['WorldRequestMaker','world-request-maker-password']]){
 const account=await accounts.freePlayLogin(name,password),wallet=(await database.ensureAccount(account)).walletId;
 await database.transaction(data=>{data.users[wallet].tokens.MZK=50000;return {};});
}
"""


def data(response):
    assert response.ok, f'{response.status}: {response.text()[:3000]}'
    result = response.json()
    assert result.get('success') is not False, result
    return result['data']


def wait_until(callback, seconds=30, message='condition was not confirmed'):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        result = callback()
        if result:
            return result
        time.sleep(.2)
    raise AssertionError(message)


def wallet_balance(context, base):
    return data(context.request.get(base + '/api/wallet/state'))['tokens']['MZK']


def workspace(context, base):
    return data(context.request.get(base + '/api/world-supply/workspace?mapId=traditional-forge'))


def mount(context, base, address_id, errors):
    page = context.new_page()
    page.set_default_timeout(20000)
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(base + '/api/health', wait_until='domcontentloaded')
    page.set_content('<!doctype html><html><head><title>Real world request validation</title><style>body{margin:0}main{min-height:100vh}</style></head><body><main id="stage"></main></body></html>')
    page.evaluate('''async ({base,addressId,itemId})=>{
      const {mountWorldSupplyUI}=await import(base+'/public/js/world-supply-ui.js?v=world-requests-browser');
      window.worldRequestPosts=[];window.requestNavigation=[];
      const api=async(path,options={})=>{
        if(options.method==='POST')worldRequestPosts.push({path,body:JSON.parse(options.body)});
        const response=await fetch(path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}}),body=await response.json();
        if(!response.ok||body.success===false)throw new Error(body.message||'Request failed');return body.data;
      };
      window.supplyUI=mountWorldSupplyUI({stage:document.querySelector('#stage'),inventory:{api,session:()=>api('/api/market/session')},onNavigate:(id,options)=>requestNavigation.push({id,options})});
      supplyUI.update({players:{browser:{health:100}}},'browser',{id:'traditional-forge',name:'Traditional Forge'});
      supplyUI.open({addressId,itemId,quantity:1,section:'requests'});
    }''', {'base': base, 'addressId': address_id, 'itemId': ITEM})
    panel = page.locator('#world-supply-panel')
    expect(panel).to_be_visible()
    expect(panel.locator('[data-address]')).to_have_value(address_id, timeout=30000)
    expect(panel.locator('[data-item]')).to_have_value(ITEM)
    return page, panel


with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]
base = f'http://127.0.0.1:{port}'
with tempfile.TemporaryDirectory(prefix='world-item-requests-browser-') as directory:
    subprocess.run(['node', '--input-type=module', '-', directory], input=SEED, text=True, check=True, capture_output=True)
    with open(Path(directory, 'server.log'), 'w') as log:
        server = subprocess.Popen(['node', 'server.mjs'], env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory, 'MUZIKAZ_STATIC_SOURCE': os.environ.get('MUZIKAZ_STATIC_SOURCE', 'dist')}, stdout=log, stderr=log)
        errors = []
        buyer_page = maker_page = None
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                try:
                    buyer = browser.new_context(service_workers='block', viewport={'width': 1440, 'height': 1000})
                    maker = browser.new_context(service_workers='block', viewport={'width': 1440, 'height': 1000})
                    for _ in range(100):
                        try:
                            if buyer.request.get(base + '/api/health', timeout=1000).ok:
                                break
                        except Exception:
                            pass
                        time.sleep(.1)
                    else:
                        raise AssertionError('server did not start')
                    for context, name, password in [(buyer, 'WorldRequestBuyer', 'world-request-buyer-password'), (maker, 'WorldRequestMaker', 'world-request-maker-password')]:
                        data(context.request.post(base + '/api/access/free-play', data={'username': name, 'password': password}))
                    addresses = data(buyer.request.get(base + '/api/world-supply/addresses?mapId=traditional-forge&limit=200'))
                    rows = addresses if isinstance(addresses, list) else addresses.get('addresses', [])
                    address = next((row for row in rows if row.get('kind') == 'store'), None)
                    assert address, 'the real forge market must expose a receiving store address'
                    buyer_page, buyer_panel = mount(buyer, base, address['id'], errors)
                    composer = buyer_panel.locator('[data-request-form]')
                    composer.locator('[name="quantity"]').fill('1')
                    composer.locator('[name="rewardMzk"]').fill(str(REWARD))
                    composer.locator('[name="source"]').select_option('factory')
                    expect(composer.locator('[data-request-create]')).to_be_enabled()
                    composer.locator('[data-request-create]').click()
                    request = wait_until(lambda: next((row for row in workspace(buyer, base)['inventoryRequests'] if row['itemId'] == ITEM and row['rewardMzk'] == REWARD), None))
                    request_id = request['id']
                    assert request['mine'] and request['source'] == 'factory'
                    assert wallet_balance(buyer, base) == INITIAL - REWARD
                    expect(buyer_panel.locator(f'[data-world-request="{request_id}"]')).to_be_visible()
                    buyer_page.screenshot(path=str(ARTIFACTS / 'world-item-request-funded.png'), full_page=True)
                    print('Buyer funded a real addressed making request; MZK was escrowed once', flush=True)

                    maker_page, maker_panel = mount(maker, base, address['id'], errors)
                    card = maker_panel.locator(f'[data-world-request="{request_id}"]')
                    expect(card.locator('[data-request-action="claim"]')).to_be_enabled()
                    card.locator('[data-request-action="claim"]').click()
                    expect(card.locator('[data-request-action="factory"]')).to_be_visible()
                    ready_dispatch = card.locator('[data-request-action="fulfill"]')
                    if ready_dispatch.count():
                        expect(ready_dispatch).to_be_disabled()
                    assert wallet_balance(maker, base) == INITIAL
                    card.locator('[data-request-action="factory"]').click()
                    wait_until(lambda: maker_page.evaluate('requestNavigation.some(row=>row.id==="world-item-factory")'))
                    expect(maker_panel.locator('[data-item]')).to_have_value(ITEM)
                    expect(maker_panel.locator('[data-quantity]')).to_have_value('1')
                    maker_panel.locator('[data-quote]').click()
                    expect(maker_panel.locator('[data-produce]')).to_be_enabled()
                    maker_panel.locator('[data-produce]').click()
                    job = wait_until(lambda: next((row for row in workspace(maker, base)['production'] if row['itemId'] == ITEM), None))
                    assert job['phase'] == 'building'
                    production_cost = job['priceMzk']
                    assert wallet_balance(maker, base) == INITIAL - production_cost
                    state = wait_until(lambda: (lambda current: current if any(row['id'] == job['id'] and row['phase'] == 'ready' for row in current['production']) else None)(workspace(maker, base)), 150, 'paid factory production did not finish all saved stages')
                    completed = next(row for row in state['production'] if row['id'] == job['id'])
                    assert len(completed['stages']) == 4 and all(stage['phase'] == 'complete' and all(operation['phase'] == 'complete' for operation in stage['operations']) for stage in completed['stages'])
                    assert completed['packingReceipt']['sealHash']
                    maker_page.evaluate('supplyUI.refresh({force:true})')
                    expect(card.locator('[data-request-action="fulfill"]')).to_be_enabled(timeout=30000)
                    card.locator('[data-request-action="fulfill"]').click()
                    fulfilled = wait_until(lambda: next((row for row in workspace(maker, base)['inventoryRequests'] if row['id'] == request_id and row.get('shipmentIds')), None))
                    state = workspace(maker, base)
                    shipment = next(row for row in state['shipments'] if row['id'] == fulfilled['shipmentIds'][0])
                    allocation = next(row for row in state['allocations'] if row['shipmentId'] == shipment['id'])
                    assert allocation['lots'] == [{'lotId': completed['outputLotId'], 'quantity': 1}]
                    assert shipment['addressId'] == address['id'] and shipment['deliverySchemaVersion'] == 1
                    assert fulfilled['deliveredQuantity'] == 0
                    assert wallet_balance(maker, base) == INITIAL - production_cost, 'queued freight cannot collect a receiving reward'
                    assert not any(receipt['shipmentId'] == shipment['id'] for receipt in state['stockReceipts'])
                    print('Another member completed all factory stages, then committed its exact owned lot to real shipping', flush=True)

                    expect(card.locator('[data-request-action="trace"]')).to_be_visible()
                    card.locator('[data-request-action="trace"]').click()
                    inspector = maker_panel.locator('[data-inspector]')
                    expect(inspector).to_contain_text(shipment['id'], timeout=20000)
                    expect(inspector).to_contain_text(completed['outputLotId'])
                    expect(inspector).to_contain_text('no matching stock receipt')
                    maker_page.screenshot(path=str(ARTIFACTS / 'world-item-request-exact-freight.png'), full_page=True)
                    card.locator('[data-request-action="shipping"]').click()
                    expect(maker_panel.locator('[data-shipments]')).to_contain_text(shipment['itemName'])
                    buyer_page.evaluate('supplyUI.refresh({force:true})')
                    buyer_card = buyer_panel.locator(f'[data-world-request="{request_id}"]')
                    expect(buyer_card).to_contain_text('0 / 1 received')
                    assert buyer_card.locator('[data-request-action="cancel"]').count() == 0, 'active shipping stock cannot refund its live reward escrow'
                    maker_page.set_viewport_size({'width': 390, 'height': 844})
                    request_board = maker_panel.locator('[data-world-item-requests]')
                    request_board.scroll_into_view_if_needed()
                    assert request_board.evaluate('(node)=>node.scrollWidth<=node.clientWidth+2'), 'the request board must fit a mobile viewport without horizontal scrolling'
                    maker_page.screenshot(path=str(ARTIFACTS / 'world-item-request-mobile.png'), full_page=True)
                    assert not errors, errors
                    print('Exact freight inspection and shipping controls work; no premature payout, refund or browser errors', flush=True)
                finally:
                    browser.close()
        except Exception:
            for label, page in [('buyer', buyer_page), ('maker', maker_page)]:
                if page:
                    try:
                        page.screenshot(path=str(ARTIFACTS / f'world-item-request-{label}-failure.png'), full_page=True)
                        print(label, page.locator('body').inner_text()[-7000:], flush=True)
                    except Exception:
                        pass
            print(Path(directory, 'server.log').read_text()[-4000:], errors, flush=True)
            raise
        finally:
            server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()
