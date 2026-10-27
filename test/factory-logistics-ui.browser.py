"""Real account/room/market logistics controls, using an isolated data directory.

The seeded models have immutable creation and exact-item test receipts. This
browser issues certificates, writes genuine MZK listings and confirms real
manifests; the UI is mounted without an expensive WebGL scene.
"""
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]
base = f'http://127.0.0.1:{port}'
with tempfile.TemporaryDirectory(prefix='factory-logistics-browser-') as directory:
    seed = '''
import {MzkAccountStore} from './loadout-code-store.mjs';
import {UserJsonDatabase} from './user-json-database.mjs';
import {join} from 'node:path';
const directory=process.argv[2],accounts=new MzkAccountStore(join(directory,'accounts.json')),db=new UserJsonDatabase(join(directory,'users.json'));
const account=await accounts.freePlayLogin('FreightTester','freight-test-password'),wallet=(await db.ensureAccount(account)).walletId;
await db.transaction(data=>{for(const [id,recipeId,buildAssetId,profileId]of [['freight-accuracy','training-missile','factory-training-missile','accuracy'],['freight-cargo','cargo-rocket','factory-cargo-rocket','cargo']]){data.users[wallet].items.push({id,name:id,type:'factory-model',buildAssetId,listing:{active:false}});data.transactions.push({id:'proof-'+id,type:'FACTORY_ITEM_CREATED',walletId:wallet,itemId:id,recipeId,createdAt:new Date().toISOString(),amountMzk:0});data.transactions.push({id:'test-'+id,type:'FACTORY_TEST_COMPLETE',walletId:wallet,itemId:id,proofId:'proof-'+id,buildAssetId,profileId,sessionId:'qualified-'+id,environmentId:'muzikaz-factory-proving-grounds',qualified:true,score:100,createdAt:new Date().toISOString(),amountMzk:0});}data.users[wallet].items.push({id:'forged-model',name:'Unverified',buildAssetId:'factory-cargo-rocket'});data.factoryLogistics={productionCredits:{[wallet]:1}};return {};});
'''
    subprocess.run(['node', '--input-type=module', '-', directory], input=seed, text=True, check=True, capture_output=True)
    with open(Path(directory) / 'server.log', 'w') as log:
        server = subprocess.Popen(['node', 'server.mjs'], env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory}, stdout=log, stderr=log)
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
                try:
                    context = browser.new_context(viewport={'width': 1200, 'height': 950}, service_workers='block', reduced_motion='reduce')
                    for _ in range(120):
                        try:
                            if context.request.get(base + '/api/health', timeout=1000).ok:
                                break
                        except Exception:
                            time.sleep(.1)
                    else:
                        raise AssertionError(Path(directory, 'server.log').read_text()[-3000:])
                    login = context.request.post(base + '/api/access/free-play', data={'username': 'FreightTester', 'password': 'freight-test-password'})
                    assert login.ok, login.text()
                    page = context.new_page()
                    errors = []
                    page.on('pageerror', lambda error: (errors.append(str(error)), print('Page error:', error, flush=True)))
                    page.route(base + '/logistics-ui-harness', lambda route: route.fulfill(content_type='text/html', body='<html><body><div id="stage" class="house-stage" style="position:relative;width:100%;height:900px"></div></body></html>'))
                    page.goto(base + '/logistics-ui-harness')
                    page.evaluate('''async()=>{
                      const {mountFactoryLogisticsUI}=await import('/public/js/factory-logistics-ui.js');
                      const {mountGameDisplayFlow}=await import('/public/js/game-display-flow.js');
                      window.flow=mountGameDisplayFlow(document.querySelector('#stage'));
                      window.roomId='muzikaz-factory-proving-grounds';window.room=null;window.sent=[];let csrf='';
                      const proof=async()=>csrf=(await(await fetch('/api/game/room-session',{credentials:'same-origin'})).json()).data.csrfToken;
                      window.send=async(action,fields={})=>{
                        sent.push({action,...fields});if(!csrf)await proof();
                        const body=JSON.stringify({action,requestId:crypto.randomUUID(),...fields});
                        let response=await fetch('/api/rooms/'+roomId+'/gameplay',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body}),result=await response.json();
                        if(!response.ok&&result.code==='CSRF_INVALID'){await proof();response=await fetch('/api/rooms/'+roomId+'/gameplay',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body});result=await response.json();}
                        if(!response.ok)throw Error(result.message);room=result.data;ui.update(room,room.selfId,{id:roomId});return room;
                      };
                      window.ui=mountFactoryLogisticsUI(document.querySelector('#stage'),send,{getPosition:()=>room?.players?.[room.selfId]?.position,onNavigate:async(mapId)=>travel(mapId),onShipping:()=>true});
                      window.travel=async(mapId)=>{roomId=mapId;await send('join');await send('logistics-status');};
                      window.move=async(x,z)=>send('map-access',{position:{x,z}});
                      await send('join');
                    }''')
                    toggle = page.locator('.factory-logistics-toggle')
                    panel = page.locator('.factory-logistics-dialog')
                    def open_at(map_id, x, z, tab='models'):
                        page.evaluate('async(mapId)=>{if(roomId!==mapId)await travel(mapId)}', map_id)
                        point = page.evaluate('()=>room.logistics.stations.find(station=>station.kind==="shipping").position') if map_id == 'hormuz-shipping' else {'x': x, 'z': z}
                        page.evaluate('async(point)=>move(point.x,point.z)', point)
                        toggle.click()
                        page.wait_for_function('window.ui.snapshot().items.length===2&&!window.ui.snapshot().busy')
                        panel.locator('[data-tab="' + tab + '"]').click()
                    page.wait_for_function('document.querySelector(".factory-logistics-toggle").closest(".game-display-flow-views")')
                    open_at('muzikaz-factory-proving-grounds', -56, 5)
                    assert panel.locator('[data-item] option[value="forged-model"]').count() == 0
                    assert '1 credits' in panel.locator('[data-credits]').text_content()
                    page.wait_for_function('!document.querySelector("[data-certify]").disabled')
                    panel.locator('[data-certify]').click()
                    page.wait_for_function('window.ui.snapshot().items[0].certificate?.score===100')
                    assert 'CERTIFIED' in panel.locator('[data-certificate]').text_content()
                    page.screenshot(path='/workspace/factory-logistics-panel.png')
                    panel.locator('[data-tab="market"]').click()
                    panel.locator('[data-price]').fill('245')
                    panel.locator('[data-list]').click()
                    page.wait_for_function('window.ui.snapshot().items[0].listing?.active===true&&!window.ui.snapshot().busy')
                    listings = context.request.get(base + '/api/market/listings').json()['data']
                    listing = next(value for value in listings if value['itemId'] == 'freight-accuracy')
                    assert listing['priceMzk'] == 245 and listing['certified'], listing
                    panel.locator('[data-unlist]').click()
                    page.wait_for_function('!window.ui.snapshot().items[0].listing?.active&&!window.ui.snapshot().busy')
                    panel.get_by_role('button', name='Close production and freight', exact=True).click()
                    print('Certificate and genuine MZK list/unlist pass.', flush=True)
                    # Walk deliveries use the same certified owned model and persist
                    # their actual statuses into the server manifest history.
                    for destination, point in [('muzikaz-factory-proving-grounds', {'x': -64, 'z': 24}), ('muzikaz-mountain-compound', {'x': 24, 'z': 31})]:
                        open_at('muzikaz-missile-factory', -31, 48, 'manifest')
                        panel.locator('[data-destination]').select_option(destination)
                        page.wait_for_function('!document.querySelector("[data-book]").disabled')
                        panel.locator('[data-book]').click()
                        page.wait_for_function('window.ui.snapshot().manifest?.status==="booked"&&!window.ui.snapshot().busy')
                        assert not page.evaluate('window.ui.snapshot().gates.list'), 'A sealed manifest reserves its market model'
                        panel.get_by_role('button', name='Close production and freight', exact=True).click()
                        open_at(destination, point['x'], point['z'], 'manifest')
                        page.wait_for_function('!document.querySelector("[data-deliver]").disabled', timeout=15000)
                        panel.locator('[data-deliver]').click()
                        page.wait_for_function('!window.ui.snapshot().manifest&&window.ui.snapshot().history[0]?.status==="delivered"&&!window.ui.snapshot().busy')
                        panel.get_by_role('button', name='Close production and freight', exact=True).click()
                        print('Real receiving delivery passed:', destination, flush=True)
                    open_at('muzikaz-missile-factory', -31, 48, 'manifest')
                    panel.locator('[data-destination]').select_option('atlas-export')
                    panel.locator('[data-book]').click()
                    page.wait_for_function('window.ui.snapshot().manifest?.destinationId==="atlas-export"&&!window.ui.snapshot().busy')
                    panel.get_by_role('button', name='Close production and freight', exact=True).click()
                    open_at('hormuz-shipping', -1004, 410, 'manifest')
                    page.wait_for_function('!document.querySelector("[data-stage]").disabled', timeout=10000)
                    panel.locator('[data-stage]').click()
                    page.wait_for_function('window.ui.snapshot().manifest?.status==="staged"&&!window.ui.snapshot().busy')
                    assert 'actual Atlas Export cargo route' in panel.locator('[data-destination-detail]').text_content()
                    panel.locator('[data-cancel]').click()
                    page.wait_for_function('!window.ui.snapshot().manifest&&window.ui.snapshot().history[0]?.status==="cancelled"&&!window.ui.snapshot().busy')
                    page.set_viewport_size({'width': 390, 'height': 844})
                    assert panel.evaluate('(node)=>node.scrollWidth<=node.clientWidth+1')
                    page.keyboard.press('Escape')
                    page.wait_for_function('!document.querySelector(".factory-logistics-dialog").open&&document.querySelector(".factory-logistics-toggle").getAttribute("aria-expanded")==="false"')
                    # Native actions never open the HTML modal and mutate the real
                    # marketplace through the same protected account API.
                    page.evaluate('()=>ui.setPage("market")')
                    page.evaluate('async()=>ui.menuItems().find(item=>item.id==="logistics-list").run()')
                    page.wait_for_function('window.ui.snapshot().items[0].listing?.active&&!window.ui.snapshot().busy')
                    assert not panel.evaluate('(node)=>node.open')
                    page.evaluate('async()=>ui.menuItems().find(item=>item.id==="logistics-unlist").run()')
                    page.wait_for_function('!window.ui.snapshot().items[0].listing?.active&&!window.ui.snapshot().busy')
                    # A later public heartbeat cannot replace private item state;
                    # a valid own command still hydrates after that heartbeat.
                    page.evaluate('''()=>{const state=structuredClone(room),self=state.players[state.selfId];delete state.result;state.sequence+=100;self.logistics={...self.logistics,eligibleItems:[{id:'forged-global'}],manifest:{id:'forged-manifest'}};ui.update(state,state.selfId,{id:roomId});}''')
                    assert page.evaluate('ui.snapshot().items.some(item=>item.id==="forged-global")') is False
                    assert page.evaluate('ui.snapshot().manifest') is None
                    page.evaluate('async()=>ui.menuItems().find(item=>item.id==="logistics-list").run()')
                    page.wait_for_function('ui.snapshot().items[0].listing.active&&!ui.snapshot().busy')
                    page.evaluate('async()=>ui.menuItems().find(item=>item.id==="logistics-unlist").run()')
                    page.wait_for_function('!ui.snapshot().items[0].listing.active&&!ui.snapshot().busy')
                    assert page.evaluate('ui.snapshot().items.length') == 2
                    page.evaluate('()=>ui.update(null,null,{id:"ordinary-map"})')
                    assert toggle.is_hidden() and not page.evaluate('ui.open()')
                    assert not errors, errors
                    print('Live logistics UI passes: exact-item certification, real MZK trade, sealed proving/compound deliveries, export staging/cancel, private-state sequencing, native actions without DOM, and mobile layout.', flush=True)
                finally:
                    browser.close()
        except Exception:
            print('Server tail:', Path(directory, 'server.log').read_text()[-4500:], flush=True)
            raise
        finally:
            server.terminate()
            server.wait(timeout=10)
