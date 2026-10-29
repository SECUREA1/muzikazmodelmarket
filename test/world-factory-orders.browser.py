"""Real deed ordering, private live designs, packed freight and mobile layout.

The fixture funds a genuine account. Every deed reveal, prototype save, quote,
production order and warehouse reservation then uses the normal server API.
Server-side order tests cover verified sea unloading; this browser deliberately
asserts that neither a finished build nor queued freight credits plot stock.
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
USERNAME = 'DeedFactoryBrowser'
PASSWORD = 'deed-factory-browser-password'
os.chdir(ROOT)
ARTIFACTS.mkdir(exist_ok=True)


def data(response):
    assert response.ok, f'{response.status}: {response.text()[:2000]}'
    payload = response.json()
    assert payload.get('success') is not False, payload
    return payload['data']


def workspace(context, base):
    return data(context.request.get(base + '/api/world-supply/workspace'))


def wait_for_order(context, base, order_id, timeout=150):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        state = workspace(context, base)
        order = next(row for row in state['orders'] if row['id'] == order_id)
        if order['phase'] == 'awaiting-shipping':
            return state, order
        assert order['phase'] in ('building', 'paused'), order
        time.sleep(.35)
    raise AssertionError(f'Order did not finish production: {order}')


def assert_unstocked(state, destination, item_id):
    stock = next(row['stock'] for row in state['maps'] if row['id'] == destination)
    assert stock.get(item_id, 0) == 0, 'Finished production cannot credit the receiving plot before sea delivery.'


def draw_with_pointer(page, canvas):
    canvas.scroll_into_view_if_needed()
    box = canvas.bounding_box()
    assert box and box['width'] > 100 and box['height'] > 100, box
    x, y, width, height = box['x'], box['y'], box['width'], box['height']
    page.mouse.move(x + width * .2, y + height * .25)
    page.mouse.down()
    page.mouse.move(x + width * .8, y + height * .25, steps=8)
    page.mouse.move(x + width * .5, y + height * .8, steps=8)
    page.mouse.move(x + width * .2, y + height * .25, steps=8)
    page.mouse.up()
    assert canvas.evaluate('(node)=>Array.from(node.getContext("2d").getImageData(0,0,node.width,node.height).data).some((value,index)=>index%4===3&&value>96)')


with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]
base = f'http://127.0.0.1:{port}'
with tempfile.TemporaryDirectory(prefix='deed-factory-browser-') as directory:
    seed = '''
import {MzkAccountStore} from './loadout-code-store.mjs';
import {UserJsonDatabase} from './user-json-database.mjs';
import {join} from 'node:path';
const directory=process.argv[2],accounts=new MzkAccountStore(join(directory,'accounts.json')),
 db=new UserJsonDatabase(join(directory,'users.json'));
const account=await accounts.freePlayLogin('DeedFactoryBrowser','deed-factory-browser-password');
const wallet=(await db.ensureAccount(account)).walletId;
await db.transaction(data=>{data.users[wallet].tokens.MZK=1000000;data.users[wallet].items.push({id:'browser-owned-holophone',name:'Owned test Holophone',type:'prop',modelUrl:'/public/models/props/HOLOPHONE_GOLD.glb'});return {};});
'''
    subprocess.run(['node', '--input-type=module', '-', directory], input=seed, text=True, check=True, capture_output=True)
    with open(Path(directory) / 'server.log', 'w') as log:
        server = subprocess.Popen(['node', 'server.mjs'], env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory}, stdout=log, stderr=log)
        page = None
        errors = []
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                try:
                    context = browser.new_context(viewport={'width': 1280, 'height': 950}, service_workers='block', reduced_motion='reduce')
                    for _ in range(120):
                        try:
                            if context.request.get(base + '/api/health', timeout=1000).ok:
                                break
                        except Exception:
                            time.sleep(.1)
                    else:
                        raise AssertionError(Path(directory, 'server.log').read_text()[-3000:])
                    login = data(context.request.post(base + '/api/access/free-play', data={'username': USERNAME, 'password': PASSWORD}))
                    session = data(context.request.get(base + '/api/market/session'))
                    pack = data(context.request.get(base + '/api/backpack'))
                    entitlement = next(row for row in pack['land'] if row['type'] == 'land-entitlement')
                    deed = data(context.request.post(base + '/api/land/reveal', headers={'X-CSRF-Token': session['csrfToken']}, data={'itemId': entitlement['id']}))
                    destination = deed['spaceId']

                    page = context.new_page()
                    page.set_default_timeout(20000)
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.route('https://**/*', lambda route: route.abort())
                    # Render the real owned-plot component, then follow its actual
                    # link into the full game and shared factory room.
                    page.route(base + '/deed-order-test', lambda route: route.fulfill(content_type='text/html', body='<!doctype html><html><body><main data-member-plot-browser></main></body></html>'))
                    page.goto(base + '/deed-order-test')
                    page.evaluate("import('/public/js/member-plot-browser.js')")
                    link = page.locator('[data-plot-supply]').filter(has_text='Order factory supplies').first
                    expect(link).to_be_visible(timeout=20000)
                    assert 'supplyDeed=' in link.get_attribute('href'), link.get_attribute('href')
                    link.click()
                    page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().controlsReady && window.MuzikazHouseExplorer.snapshot().roomId==="world-item-factory"', timeout=90000)
                    panel = page.locator('#world-supply-panel')
                    expect(panel).to_be_visible(timeout=30000)
                    expect(panel.locator('[data-deed]')).to_have_value(deed['id'])
                    assert 'plot' in panel.locator('[data-deed-summary]').inner_text().lower()
                    state = workspace(context, base)
                    # One item per container makes five items require two normal
                    # four-container manifests, without huge synthetic batches.
                    native = next(row for row in state['catalog'] if row.get('buildAssetId') and row.get('recipe', {}).get('unitsPerContainer') == 1 and row['recipe']['id'] == 'watercraft')
                    panel.locator('[data-search]').fill(native['id'])
                    panel.locator('[data-item]').select_option(native['id'])
                    panel.locator('[data-quantity]').fill('5')
                    panel.locator('[data-quote]').click()
                    expect(panel.locator('[data-order]')).to_be_enabled(timeout=20000)
                    assert '2' in panel.locator('[data-order-plan]').inner_text(), panel.locator('[data-order-plan]').inner_text()
                    panel.locator('[data-order]').click()
                    expect(panel.locator('[data-orders]')).to_contain_text(native['name'], timeout=20000)
                    state = workspace(context, base)
                    native_order = next(row for row in state['orders'] if row['itemId'] == native['id'])
                    assert native_order['deedId'] == deed['id'] and native_order['destinationMapId'] == destination
                    assert_unstocked(state, destination, native['id'])
                    print('Deed link, authoritative quote and native production order passed.', flush=True)

                    panel.locator('[data-open-designer]').click()
                    designer = panel.locator('[data-designer]')
                    expect(designer.locator('[data-design-canvas]')).to_be_visible()
                    designer.locator('[data-design-name]').fill('Private painted factory beacon')
                    designer.locator('[data-design-color]').fill('#f95489')
                    designer.locator('[data-design-material]').select_option('neon')
                    designer.locator('[data-design-depth]').fill('44')
                    designer.locator('[data-design-behavior]').select_option('pickup')
                    draw_with_pointer(page, designer.locator('[data-design-canvas]'))
                    expect(designer.locator('[data-design-preview]')).to_have_attribute('data-ready', 'true', timeout=20000)
                    expect(designer.locator('[data-design-preview] canvas')).to_be_visible()
                    designer.locator('[data-design-save]').click()
                    expect(designer.locator('[data-design-status]')).to_contain_text('selected for production', timeout=30000)
                    selected = panel.locator('[data-item]').input_value()
                    assert selected.startswith('blueprint:custom:'), selected
                    state = workspace(context, base)
                    custom = next(row for row in state['catalog'] if row['id'] == selected)
                    assert custom['name'] == 'Private painted factory beacon'
                    assert custom['configuration']['depth'] == 44 and custom['configuration']['material'] == 'neon'
                    assert custom['configuration']['behavior'] == 'pickup'
                    assert state['worldStock'].get(selected, 0) == 0 and state['factoryStock'].get(selected, 0) == 0
                    public = data(context.request.get(base + '/api/world-supply'))
                    assert selected not in json.dumps(public) and custom['name'] not in json.dumps(public), 'A private design must not appear in public stock, recipes or jobs.'
                    panel.locator('[data-quantity]').fill('10')
                    panel.locator('[data-quote]').click()
                    expect(panel.locator('[data-order]')).to_be_enabled()
                    panel.locator('[data-order]').click()
                    expect(panel.locator('[data-orders]')).to_contain_text(custom['name'])
                    state = workspace(context, base)
                    custom_order = next(row for row in state['orders'] if row['itemId'] == selected)
                    assert custom_order['deedId'] == deed['id']
                    assert_unstocked(state, destination, selected)
                    print('Live painted preview, private prototype and exact custom order passed.', flush=True)

                    state, custom_order = wait_for_order(context, base, custom_order['id'])
                    state, native_order = wait_for_order(context, base, native_order['id'])
                    native_shipments = [row for row in state['shipments'] if row.get('orderId') == native_order['id']]
                    custom_shipments = [row for row in state['shipments'] if row.get('orderId') == custom_order['id']]
                    assert sorted(row['quantity'] for row in native_shipments) == [1, 4], native_shipments
                    assert len(custom_shipments) == 1 and custom_shipments[0]['quantity'] == 10
                    for order, shipments in [(native_order, native_shipments), (custom_order, custom_shipments)]:
                        assert len(order['shipmentIds']) == len(shipments)
                        assert all(row['phase'] == 'queued' and row['destinationMapId'] == destination and row['deedId'] == deed['id'] for row in shipments)
                        job = next(row for row in state['production'] if row['id'] == order['productionId'])
                        assert len(job['stages']) == 4 and all(stage['phase'] == 'complete' and len(stage['operations']) == 3 for stage in job['stages'])
                        allocations = [row for row in state['allocations'] if row['shipmentId'] in order['shipmentIds']]
                        assert sum(row['quantity'] for row in allocations) == order['quantity']
                        assert all(line['lotId'] == job['outputLotId'] for row in allocations for line in row['lots']), 'An order must reserve its own produced lot.'
                        assert_unstocked(state, destination, order['itemId'])
                    assert state['factoryStock'].get(selected, 0) == 0
                    assert selected not in json.dumps(data(context.request.get(base + '/api/world-supply')))
                    page.screenshot(path=str(ARTIFACTS / 'deed-factory-orders-desktop.png'))
                    print('Four server stages, capacity-split manifests and exact private lot reservation passed.', flush=True)

                    # A fresh touch context verifies saved-order/deed continuity and
                    # a genuinely narrow viewport rather than only resizing a div.
                    phone = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=1, service_workers='block', reduced_motion='reduce', storage_state=context.storage_state())
                    phone_page = phone.new_page()
                    phone_page.set_default_timeout(20000)
                    phone_page.on('pageerror', lambda error: errors.append(str(error)))
                    phone_page.route('https://**/*', lambda route: route.abort())
                    phone_page.goto(base + '/model-explorer.html?environment=world-item-factory&autoplay=1&supplyDeed=' + deed['id'], wait_until='domcontentloaded', timeout=90000)
                    phone_page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().controlsReady', timeout=90000)
                    mobile = phone_page.locator('#world-supply-panel')
                    expect(mobile).to_be_visible(timeout=30000)
                    expect(mobile.locator('[data-deed]')).to_have_value(deed['id'])
                    expect(mobile.locator('[data-orders]')).to_contain_text('Private painted factory beacon')
                    mobile.locator('[data-open-designer]').click()
                    workshop = mobile.locator('[data-designer]')
                    workshop.locator('[data-design-shape="heart"]').tap()
                    workshop.locator('[data-design-depth]').fill('36')
                    expect(workshop.locator('[data-design-preview]')).to_have_attribute('data-ready', 'true', timeout=20000)
                    # The same workshop also loads an actually owned local GLB;
                    # transform edits survive the authoritative save and private
                    # registration instead of becoming a cosmetic-only preview.
                    expect(workshop.locator('[data-design-source] option[value="browser-owned-holophone"]')).to_have_count(1, timeout=20000)
                    workshop.locator('[data-design-source]').select_option('browser-owned-holophone')
                    workshop.locator('[data-design-name]').fill('Private mobile Holophone edition')
                    workshop.locator('[data-design-scale]').fill('1.4')
                    workshop.locator('[data-design-orientation]').fill('30')
                    workshop.locator('[data-design-material]').select_option('metal')
                    expect(workshop.locator('[data-design-preview]')).to_have_attribute('data-ready', 'true', timeout=20000)
                    workshop.locator('[data-design-save]').tap()
                    expect(workshop.locator('[data-design-status]')).to_contain_text('selected for production', timeout=30000)
                    mobile_selected = mobile.locator('[data-item]').input_value()
                    assert mobile_selected.startswith('blueprint:custom:') and mobile_selected != selected
                    mobile_state = workspace(phone, base)
                    mobile_design = next(row for row in mobile_state['catalog'] if row['id'] == mobile_selected)
                    assert mobile_design['modelUrl'] == '/public/models/props/HOLOPHONE_GOLD.glb'
                    assert mobile_design['configuration']['scale'] == 1.4 and mobile_design['configuration']['orientation'] == 30
                    assert mobile_design['configuration']['material'] == 'metal'
                    assert mobile_state['worldStock'].get(mobile_selected, 0) == 0 and mobile_state['factoryStock'].get(mobile_selected, 0) == 0
                    assert mobile_selected not in json.dumps(data(phone.request.get(base + '/api/world-supply')))
                    assert phone_page.evaluate('document.documentElement.scrollWidth<=innerWidth'), phone_page.evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})')
                    assert mobile.evaluate('(node)=>node.scrollWidth<=node.clientWidth+1'), mobile.evaluate('(node)=>({width:node.clientWidth,scroll:node.scrollWidth})')
                    phone_page.screenshot(path=str(ARTIFACTS / 'deed-factory-orders-mobile.png'))
                    assert not errors, errors
                    print('Fresh mobile deed/order continuity, accessible starter shape and owned GLB custom save passed.', flush=True)
                    report = {'nativeOrderId': native_order['id'], 'customOrderId': custom_order['id'], 'deedId': deed['id'], 'destinationMapId': destination, 'nativeShipmentQuantities': sorted(row['quantity'] for row in native_shipments), 'privateShipmentQuantity': custom_shipments[0]['quantity'], 'desktop': True, 'mobile': True, 'ownedGlbSave': True, 'pageErrors': errors}
                    (ARTIFACTS / 'deed-factory-orders-browser.json').write_text(json.dumps(report, indent=2))
                    phone.close()
                    context.close()
                finally:
                    browser.close()
        except Exception:
            if page:
                try:
                    page.screenshot(path=str(ARTIFACTS / 'deed-factory-orders-failure.png'))
                    print('Supply status:', page.locator('[data-status]').inner_text())
                    print('Designer status:', page.locator('[data-design-status]').inner_text())
                except Exception:
                    pass
            print('Page errors:', errors)
            print(Path(directory, 'server.log').read_text()[-8000:])
            raise
        finally:
            server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait()
