"""Live room-backed testing UI, with isolated accounts and a lightweight shell.

Canonical item receipts are seeded before the local server starts. Browser
controls call the actual room API; no outcomes, clearance or time are mocked.
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
with tempfile.TemporaryDirectory(prefix='factory-testing-browser-') as directory:
    seed = '''
import {MzkAccountStore} from './loadout-code-store.mjs';
import {UserJsonDatabase} from './user-json-database.mjs';
import {join} from 'node:path';
const root=process.argv[2],accounts=new MzkAccountStore(join(root,'accounts.json')),db=new UserJsonDatabase(join(root,'users.json'));
const account=await accounts.freePlayLogin('RangeTester','range-testing-password'),wallet=(await db.ensureAccount(account)).walletId;
await db.transaction(data=>{for(const [id,recipeId,buildAssetId]of [['test-accuracy','training-missile','factory-training-missile'],['test-cargo','cargo-rocket','factory-cargo-rocket']]){data.users[wallet].items.push({id,name:id,type:'factory-model',buildAssetId,source:'missile-factory'});data.transactions.push({id:'test-proof-'+id,type:'FACTORY_ITEM_CREATED',walletId:wallet,itemId:id,recipeId,createdAt:new Date().toISOString(),amountMzk:0});}data.users[wallet].items.push({id:'forged-test-item',name:'Unverified model',buildAssetId:'factory-cargo-rocket'});return {};});
'''
    subprocess.run(['node', '--input-type=module', '-', directory], input=seed, text=True, check=True, capture_output=True)
    with open(Path(directory) / 'server.log', 'w') as log:
        server = subprocess.Popen(['node', 'server.mjs'], env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory}, stdout=log, stderr=log)
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
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
                    response = context.request.post(base + '/api/access/free-play', data={'username': 'RangeTester', 'password': 'range-testing-password'})
                    assert response.ok, response.text()
                    csrf = context.request.get(base + '/api/game/room-session').json()['data']['csrfToken']
                    page = context.new_page()
                    errors = []
                    page.on('pageerror', lambda error: (errors.append(str(error)), print('Page error:', error, flush=True)))
                    page.route(base + '/testing-ui-harness', lambda route: route.fulfill(content_type='text/html', body='<html><body><div id="stage" class="house-stage" style="position:relative;width:100%;height:900px"></div></body></html>'))
                    page.goto(base + '/testing-ui-harness')
                    page.evaluate('''async(csrf)=>{
                      const {mountFactoryTestingUI}=await import('/public/js/factory-testing-ui.js');
                      const {mountGameDisplayFlow}=await import('/public/js/game-display-flow.js');
                      window.flow=mountGameDisplayFlow(document.querySelector('#stage'));
                      window.roomId='muzikaz-factory-proving-grounds';window.room=null;window.calls=[];
                      window.send=async(action,fields={})=>{
                        calls.push({action,...fields});
                        const response=await fetch('/api/rooms/'+roomId+'/gameplay',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({action,requestId:crypto.randomUUID(),...fields})}),body=await response.json();
                        if(!response.ok)throw Error(body.message||'Room command failed');
                        room=body.data;
                        if(room.result?.destination&&room.result.destination!==roomId){roomId=room.result.destination;return send('join');}
                        ui.update(room,room.selfId,{id:roomId});return room;
                      };
                      window.ui=mountFactoryTestingUI(document.querySelector('#stage'),send,{getPosition:()=>room?.players?.[room.selfId]?.position});
                      window.move=async(x,z)=>send('map-access',{position:{x,z}});
                      await send('join');
                    }''', csrf)
                    toggle = page.locator('.factory-testing-toggle')
                    panel = page.locator('.factory-testing-dialog')
                    page.wait_for_function('document.querySelector(".factory-testing-toggle").closest(".game-display-flow-views")')
                    assert toggle.locator('svg[aria-hidden="true"]').count() == 1
                    toggle.focus()
                    toggle.press('Enter')
                    page.wait_for_function('document.querySelector(".factory-testing-dialog").open')
                    page.wait_for_function('document.querySelector("[data-item]").options.length===2')
                    assert panel.locator('[data-item] option[value="forged-test-item"]').count() == 0
                    assert panel.locator('[data-enter]').is_disabled()
                    # Test both canonical profiles through the actual stage controls.
                    for item_id, profile in [('test-accuracy', 'accuracy'), ('test-cargo', 'cargo')]:
                        page.evaluate('async()=>move(-42,35)')
                        panel.locator('[data-item]').select_option(item_id)
                        page.wait_for_function('!document.querySelector("[data-recall]").disabled')
                        panel.locator('[data-recall]').click()
                        page.wait_for_function('window.calls.some(call=>call.action==="proving-recall")')
                        assert panel.locator('[data-profile]').input_value() == profile
                        page.wait_for_function('!document.querySelector("[data-configure]").disabled')
                        panel.locator('[data-configure]').click()
                        page.wait_for_function('window.room?.players?.[room.selfId]?.testing?.session?.status==="configured"')
                        assert panel.locator('[data-deploy]').is_disabled(), 'Deployment requires visiting the launch pad'
                        page.evaluate('async()=>move(0,-10)')
                        page.wait_for_function('!document.querySelector("[data-deploy]").disabled')
                        panel.locator('[data-deploy]').click()
                        page.wait_for_function('window.room.players[room.selfId].testing.session.status==="deployed"')
                        page.evaluate('async()=>move(-24,18)')
                        page.wait_for_function('!document.querySelector("[data-arm]").disabled')
                        panel.locator('[data-arm]').click()
                        page.wait_for_function('window.room.players[room.selfId].testing.session.status==="armed"')
                        panel.locator('[data-launch]').click()
                        page.wait_for_function('document.querySelector("[data-countdown]").textContent.length>0')
                        page.wait_for_function('document.querySelector("[data-flight-phase]").textContent==="Flight"', timeout=10000)
                        assert panel.locator('[data-flight-marker]').is_visible()
                        if profile == 'cargo':
                            assert panel.locator('[data-cargo-zone]').is_visible()
                        page.wait_for_function('!document.querySelector("[data-result]").hidden', timeout=20000)
                        assert '100' in panel.locator('[data-result-title]').text_content()
                        print('Actual live UI test complete:', profile, flush=True)
                    page.evaluate('async()=>move(50,25)')
                    page.wait_for_function('!document.querySelector("[data-enter]").disabled')
                    panel.locator('[data-enter]').click()
                    page.wait_for_function('window.roomId==="muzikaz-mountain-compound"')
                    page.wait_for_function('!document.querySelector("[data-view=compound]").hidden')
                    assert panel.locator('[data-deep-enter]').is_disabled()
                    page.evaluate('async()=>move(0,8)')
                    page.wait_for_function('!document.querySelector("[data-core-start]").disabled')
                    panel.locator('[data-core-start]').click()
                    page.wait_for_function('window.room.players[room.selfId].testing.containment?.status==="active"')
                    for channel in ['coolant', 'shield', 'power']:
                        # The server initializes every value one step above its target.
                        page.wait_for_timeout(180)
                        panel.get_by_role('button', name='Decrease ' + channel + ' channel', exact=True).click()
                        page.wait_for_function('(channel)=>{const state=room.players[room.selfId].testing.containment.channels[channel];return state.value===state.target}', arg=channel)
                    page.wait_for_timeout(1500)
                    panel.locator('[data-core-confirm]').click()
                    page.wait_for_function('window.room.players[room.selfId].testing.containment.status==="solved"')
                    page.evaluate('async()=>move(0,-20)')
                    page.wait_for_function('!document.querySelector("[data-deep-enter]").disabled')
                    panel.locator('[data-deep-enter]').click()
                    page.wait_for_function('room.players[room.selfId].position.z<-26')
                    page.set_viewport_size({'width': 390, 'height': 844})
                    assert panel.evaluate('(node)=>node.scrollWidth<=node.clientWidth+1')
                    page.keyboard.press('Escape')
                    page.wait_for_function('!document.querySelector(".factory-testing-dialog").open&&document.querySelector(".factory-testing-toggle").getAttribute("aria-expanded")==="false"')
                    assert toggle.evaluate('(node)=>document.activeElement===node')
                    page.evaluate('()=>ui.update(null,null,{id:"ordinary-map"})')
                    assert toggle.is_hidden()
                    assert not errors, errors
                    # Load the real shared 3D client once to verify the UI mount,
                    # top-shelf collector, room handshake and effects wrapper.
                    native_context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, service_workers='block', storage_state=context.storage_state(), reduced_motion='reduce')
                    native = native_context.new_page()
                    native_errors = []
                    native.on('pageerror', lambda error: native_errors.append(str(error)))
                    native.route('https://**/*', lambda route: route.abort())
                    native.goto(base + '/model-explorer.html?environment=muzikaz-factory-proving-grounds&autoplay=1&mode=multiplayer', wait_until='domcontentloaded', timeout=90000)
                    native.wait_for_function('window.MuzikazHouseExplorer?.snapshot().serverReady&&window.MuzikazHouseExplorer.snapshot().controlsReady', timeout=120000)
                    native.wait_for_function('!!document.querySelector(".factory-testing-toggle")?.closest(".game-display-flow-views")')
                    assert native.evaluate('window.MuzikazHouseExplorer.snapshot().roomId') == 'muzikaz-factory-proving-grounds'
                    # A narrow shelf may put the testing icon under More.
                    native_toggle = native.locator('.factory-testing-toggle')
                    if not native_toggle.is_visible():
                        native.get_by_role('button', name='More view controls', exact=True).click()
                    native_toggle.click()
                    native.wait_for_function('document.querySelector(".factory-testing-dialog").open')
                    assert native.locator('.factory-testing-dialog').evaluate('(node)=>node.scrollWidth<=node.clientWidth+1')
                    assert not native_errors, native_errors
                    native_context.close()
                    print('Native proving grounds client starts, connects, renders testing controls in the top shelf, and opens a responsive panel.', flush=True)
                    print('Real room-backed UI passes: verified item-only selection, both timed launch profiles, server clearance, locked compound/deep gates, stabilization, deep entry, keyboard and mobile controls.', flush=True)
                finally:
                    browser.close()
        except Exception:
            print('Server tail:', Path(directory, 'server.log').read_text()[-4000:], flush=True)
            raise
        finally:
            server.terminate()
            server.wait(timeout=10)
