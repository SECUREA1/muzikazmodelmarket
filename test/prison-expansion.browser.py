"""Expanded prison QA: authenticated packets, earned Backpack items and UI.

The durable fixture seeds earned milestones only while its isolated test server
is stopped. Claims, ownership, reconnect and cross-world deployment use the real
authenticated HTTP API. UI activities use a deterministic in-memory test room.
"""
from pathlib import Path
import json
import os
import socket
import subprocess
import tempfile
import time
import uuid
from urllib.parse import quote
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
ARTIFACTS = ROOT.parent / 'scratch'
ARTIFACTS.mkdir(exist_ok=True)
WORLD = 'ironwood-prison'
with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]
base = f'http://127.0.0.1:{port}'

with tempfile.TemporaryDirectory(prefix='prison-expansion-browser-') as directory:
    data = Path(directory)
    env = {**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory}
    for variable, filename in [
        ('MUZIKAZ_USER_DATABASE_FILE', 'users.json'),
        ('MUZIKAZ_ACCOUNTS_FILE', 'accounts.json'),
        ('MUZIKAZ_PAYMENT_ORDERS_FILE', 'payment-orders.json'),
        ('MUZIKAZ_ACCOUNT_SESSIONS_FILE', 'account-sessions.json'),
        ('MUZIKAZ_GAME_SESSIONS_FILE', 'game-sessions.json'),
        ('MUZIKAZ_ENVIRONMENT_DATA_FILE', 'environments.json'),
        ('MUZIKAZ_CUSTOM_MAPS_FILE', 'custom-maps.json'),
    ]:
        env[variable] = str(data / filename)
    with open(data / 'server.log', 'w') as log:
        server = None
        def stop_server():
            global server
            if server is not None:
                server.terminate()
                try:
                    server.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    server.kill()
                    server.wait(timeout=5)
                server = None

        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                context = browser.new_context(service_workers='block', viewport={'width': 1280, 'height': 900}, reduced_motion='reduce')
                try:
                    def start_server():
                        global server
                        server = subprocess.Popen(['node', 'server.mjs'], env=env, stdout=log, stderr=log)
                        for _ in range(100):
                            try:
                                if context.request.get(base + '/api/health', timeout=1000).ok:
                                    return
                            except Exception:
                                pass
                            if server.poll() is not None:
                                break
                            time.sleep(.1)
                        raise AssertionError('Expansion server failed: ' + (data / 'server.log').read_text()[-4000:])

                    def api(path, body=None, expected=200):
                        response = context.request.post(base + path, data=body, headers={'X-CSRF-Token': csrf}) if body is not None else context.request.get(base + path)
                        assert response.status == expected, (path, response.status, response.text())
                        return response.json().get('data')

                    def command(action, world=WORLD, expected=200, **fields):
                        return api('/api/rooms/' + world + '/gameplay', {'action': action, 'requestId': str(uuid.uuid4()), **fields}, expected)

                    start_server()
                    assert context.request.post(base + '/api/access/guest', data={}).status == 201
                    csrf = api('/api/game/room-session')['csrfToken']
                    joined = command('join')
                    actor_id = joined['selfId']
                    stop_server()
                    # Set up an already earned radio milestone, never an owned
                    # Backpack item. The server must issue its durable receipt.
                    room_file = data / 'shared-rooms.json'
                    rooms = json.loads(room_file.read_text())
                    simulation = rooms[WORLD]['simulation']
                    simulation['players'][actor_id]['position'] = {'x': 0, 'y': .02, 'z': 83}
                    simulation['players'][actor_id]['grounded'] = True
                    simulation['prison']['players'][actor_id]['completed'] = ['radio']
                    room_file.write_text(json.dumps(rooms))
                    start_server()
                    csrf = api('/api/game/room-session')['csrfToken']
                    command('join')
                    page = context.new_page()
                    errors = []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.route('https://**/*', lambda route: route.abort())
                    page.goto(base + '/model-explorer.html?environment=' + WORLD + '&autoplay=1&mode=multiplayer', wait_until='domcontentloaded', timeout=90000)
                    page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().controlsReady', timeout=90000)
                    trigger = page.get_by_role('button', name='Open Ironwood prison activities', exact=True)
                    if not trigger.is_visible():
                        page.get_by_role('button', name='More view controls', exact=True).click()
                    trigger.click()
                    panel = page.locator('#ironwood-prison-panel')
                    panel.locator('[data-tab="packs"]').click()
                    claim = panel.locator('[data-prison-claim="prison-radio"]')
                    assert claim.is_enabled(), claim.inner_text()
                    with page.expect_response(lambda response: response.url.endswith('/gameplay') and response.request.method == 'POST' and response.request.post_data_json.get('action') == 'prison-claim-item') as claim_response:
                        claim.click()
                    response = claim_response.value
                    assert response.ok, response.text()
                    claimed = response.json()['data']
                    earned = claimed['result']['item']
                    assert earned['buildAssetId'] == 'prison-radio', earned
                    assert claimed['result']['prisonReceipt'], claimed['result']
                    page.wait_for_function('document.querySelector(\'[data-prison-claim="prison-radio"]\').textContent.includes("In your Backpack")')
                    assert claim.is_disabled()
                    page.screenshot(path=str(ARTIFACTS / 'prison-earned-backpack.png'))
                    assert not errors, errors
                    page.close()
                    duplicate = command('prison-claim-item', itemId='prison-radio', stationId='intake')
                    assert duplicate['result']['item']['id'] == earned['id']
                    backpack = api('/api/backpack')
                    owned = [item for item in backpack['catalogAssets'] if item.get('buildAssetId') == 'prison-radio']
                    assert len(owned) == 1 and owned[0]['id'] == earned['id'], owned
                    package = api('/api/backpack/items/' + quote(earned['id'], safe='') + '/export')
                    assert package['schema'] == 'muzikaz-gameplay-package' and package['itemId'] == earned['id'], package
                    reopened = api('/api/backpack/import', package)
                    assert reopened['item']['id'] == earned['id'], reopened
                    placement = api('/api/backpack/use', {'itemId': earned['id']})
                    assert placement['action'] == 'place' and 'useItem=' in placement['playUrl'], placement
                    command('prison-action', expected=422, packet={'protocol': 'ironwood-prison', 'version': 999, 'operation': 'status', 'stationId': 'intake'})
                    command('prison-action', expected=422, packet={'protocol': 'ironwood-prison', 'version': 1, 'operation': 'status', 'stationId': 'intake', 'tokens': 999999})
                    packet_id = str(uuid.uuid4())
                    status_packet = {'protocol': 'ironwood-prison', 'version': 1, 'operation': 'status', 'stationId': 'intake'}
                    command('prison-action', requestId=packet_id, packet=status_packet)
                    command('prison-action', requestId=packet_id, packet=status_packet)
                    command('prison-action', expected=409, requestId=packet_id, packet={'protocol': 'ironwood-prison', 'version': 1, 'operation': 'meal', 'stationId': 'meal'})
                    command('join', world='public-commons', deferRadTox=True, radToxEnabled=False)
                    deployed = command('spawn', world='public-commons', itemId=earned['id'])
                    spawned_id = deployed['result']['spawnedId']
                    assert deployed['actors'][spawned_id]['modelId'] == 'prison-radio', deployed['actors'][spawned_id]
                    stop_server()
                    start_server()
                    csrf = api('/api/game/room-session')['csrfToken']
                    restored = api('/api/backpack')
                    assert len([item for item in restored['catalogAssets'] if item.get('id') == earned['id']]) == 1
                    other_world = command('join', world='public-commons', deferRadTox=True, radToxEnabled=False)
                    assert other_world['actors'][spawned_id]['modelId'] == 'prison-radio'
                    print('Prison expansion API: versioned packets, earned claim, idempotency, durable Backpack and cross-world radio deployment pass.', flush=True)

                    page = context.new_page()
                    errors = []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.goto(base + '/test/fixtures/compact-sports-actions.html')
                    page.add_style_tag(url='/styles.css')
                    page.evaluate("""async()=>{
                        document.body.replaceChildren();document.body.style.margin='0';
                        const {mountPrisonGame,prisonInitialState,prisonAction,prisonView}=await import('/public/js/prison-game.js');
                        const {readPrisonActionPacket}=await import('/public/js/prison-protocol.js');
                        const {prisonContractView}=await import('/public/js/prison-contracts.js');
                        const {PRISON_STATIONS,PRISON_ID}=await import('/public/js/prison-config.js');
                        window.expansionNow=1000000;window.expansionState=prisonInitialState(expansionNow);window.expansionPos={...PRISON_STATIONS.find(s=>s.id==='intake').position};window.expansionEnv={id:PRISON_ID,game:'prison'};
                        prisonAction(expansionState,'prison-action',{operation:'status',stationId:'intake'},{playerId:'me',position:expansionPos,now:expansionNow});
                        Object.assign(expansionState.players.me,{tokens:60,energy:20,health:40,morale:30});
                        const stage=document.createElement('main');stage.className='house-stage';stage.style.cssText='height:100vh;position:relative';document.body.append(stage);
                        const canvas=document.createElement('canvas');canvas.tabIndex=0;stage.append(canvas);
                        window.expansionSent=[];
                        window.expansionSync=()=>expansionUI.update({prison:prisonView(expansionState),serverTime:expansionNow,players:{me:{position:expansionPos}}},'me',expansionEnv);
                        window.expansionUI=mountPrisonGame(stage,{getPosition:()=>expansionPos,onClose:()=>canvas.focus(),command:async(action,fields)=>{
                            if(action!=='prison-action')throw Error('Unexpected UI action '+action);
                            expansionNow+=5500;const intent=readPrisonActionPacket(fields);expansionSent.push(intent);
                            const result=prisonAction(expansionState,action,intent,{playerId:'me',position:expansionPos,now:expansionNow});
                            if(!result.ok)throw Error(result.message);expansionSync();return {prison:prisonView(expansionState),result};
                        }});
                        window.expansionMove=id=>{expansionPos={...PRISON_STATIONS.find(s=>s.id===id).position};expansionSync();expansionUI.open(id);};
                        window.expansionContract=()=>prisonContractView(expansionState.players.me,{day:expansionState.day});
                        expansionSync();expansionUI.open('intake');
                    }""")
                    panel = page.locator('#ironwood-prison-panel')
                    panel.locator('[data-tab="challenges"]').click()
                    assert page.evaluate("""()=>{
                        const button=document.querySelector('[data-contract-accept="recreation-circuit"]');button.focus();
                        for(let i=0;i<30;i++)expansionSync();
                        return button.isConnected&&document.activeElement===button;
                    }"""), 'Repeated snapshots must preserve contract buttons and keyboard focus.'
                    panel.locator('[data-contract-accept="recreation-circuit"]').click()
                    page.wait_for_function('expansionContract().active?.id==="recreation-circuit"')
                    assert panel.locator('.prison-contract-active').is_visible()
                    panel.locator('[data-tab="packs"]').click()
                    assert panel.locator('[data-prison-claim="prison-radio"]').is_disabled()
                    assert page.evaluate("""()=>{
                        const button=document.querySelector('[data-packet-buy="canteen"]');button.focus();
                        for(let i=0;i<30;i++)expansionSync();
                        return button.isConnected&&document.activeElement===button;
                    }"""), 'Repeated snapshots must preserve shop buttons and keyboard focus.'
                    panel.locator('[data-packet-buy="canteen"]').click()
                    page.wait_for_function('expansionState.players.me.supplies?.snack===1')
                    assert page.evaluate('expansionState.players.me.tokens') == 56
                    assert page.evaluate('expansionState.players.me.supplies.water') == 1
                    page.evaluate('expansionPos={x:0,y:.02,z:70};expansionSync()')
                    assert panel.locator('[data-packet-buy="canteen"]').is_disabled(), 'Purchases require a physical shop.'
                    assert panel.locator('[data-supply-use="snack"]').is_enabled(), 'Carried supplies can be consumed away from stations.'
                    panel.locator('[data-supply-use="snack"]').click()
                    page.wait_for_function('expansionState.players.me.supplies.snack===0')
                    assert page.evaluate('expansionState.players.me.energy') == 38
                    assert panel.locator('[data-supply-use="snack"]').is_disabled()
                    page.evaluate("expansionMove('tv')")
                    panel.locator('[data-operation="tv"]').click()
                    page.evaluate("expansionMove('radio')")
                    panel.locator('[data-frequency]').fill('94.7')
                    panel.locator('[data-operation="radio"]').click()
                    page.evaluate("expansionMove('arcade')")
                    panel.locator('[data-operation="arcade-start"]').click()
                    for _ in range(5):
                        cue = page.evaluate('expansionState.players.me.round.inputs[expansionState.players.me.round.index]')
                        panel.locator('[data-operation="arcade-input"][data-input="' + cue + '"]').click()
                    page.evaluate("expansionMove('gym')")
                    panel.locator('[data-operation="boxing-start"]').click()
                    for _ in range(6):
                        cue = page.evaluate('expansionState.players.me.round.inputs[expansionState.players.me.round.index]')
                        panel.locator('[data-operation="boxing-input"][data-input="' + cue + '"]').click()
                    page.wait_for_function('expansionContract().completed.includes("recreation-circuit")')
                    contract_tokens = page.evaluate('expansionContract().lifetime.tokens')
                    assert contract_tokens > 0
                    page.evaluate("expansionMove('intake')")
                    panel.locator('[data-tab="challenges"]').click()
                    completed = panel.locator('[data-contract-accept="recreation-circuit"]')
                    assert completed.is_disabled() and completed.inner_text().casefold() == 'completed today', (completed.is_disabled(), completed.inner_text(), page.evaluate('expansionContract()'))
                    assert page.evaluate('expansionContract().lifetime.completed') == 1
                    assert page.evaluate('expansionContract().lifetime.tokens') == contract_tokens
                    for width, height in [(390, 844), (844, 390), (1280, 900)]:
                        page.set_viewport_size({'width': width, 'height': height})
                        panel.locator('[data-tab="packs"]').click()
                        assert panel.locator('[data-packs]').is_visible()
                        assert panel.locator('[data-prison-claim="prison-radio"]').is_enabled()
                        rect = page.locator('.prison-dialog').bounding_box()
                        assert 0 <= rect['x'] and rect['x'] + rect['width'] <= width + 1, rect
                        assert 0 <= rect['y'] and rect['y'] + rect['height'] <= height + 1, rect
                        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
                        if width == 390:
                            page.screenshot(path=str(ARTIFACTS / 'prison-packets-mobile.png'))
                    page.screenshot(path=str(ARTIFACTS / 'prison-packets.png'))
                    assert page.evaluate('expansionSent.some(p=>p.operation==="packet-buy"&&p.packetId==="canteen")')
                    assert page.evaluate('expansionSent.some(p=>p.operation==="contract-accept"&&p.contractId==="recreation-circuit")')
                    panel.locator('[data-close]').click()
                    assert not panel.is_visible()
                    page.evaluate('expansionUI.dispose()')
                    assert not errors, errors
                    print('Prison expansion UI: accepted contract, earned progression, portable supplies, shop proximity, collectible eligibility and responsive packet panel pass.', flush=True)
                except Exception:
                    if context.pages:
                        try:
                            context.pages[-1].screenshot(path=str(ARTIFACTS / 'prison-expansion-failure.png'))
                        except Exception:
                            pass
                    raise
                finally:
                    browser.close()
        finally:
            stop_server()
