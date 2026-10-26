"""Fish from the live boat view using sports actions, then save and sell a catch."""
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import uuid
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]
base = f'http://127.0.0.1:{port}'
world = 'world-district-neon-docks'

with tempfile.TemporaryDirectory(prefix='fishing-live-') as directory:
    with open(Path(directory) / 'server.log', 'w') as log:
        server = subprocess.Popen(['node', 'server.mjs'], env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory}, stdout=log, stderr=log)
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                context = browser.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, service_workers='block', reduced_motion='reduce')
                for _ in range(100):
                    try:
                        if context.request.get(base + '/api/health', timeout=1000).ok:
                            break
                    except Exception:
                        time.sleep(.1)
                login = context.request.post(base + '/api/access/guest', data={})
                assert login.status == 201, login.text()
                csrf = context.request.get(base + '/api/game/room-session').json()['data']['csrfToken']

                def command(action, **fields):
                    response = context.request.post(base + '/api/rooms/' + world + '/gameplay', headers={'X-CSRF-Token': csrf}, data={'action': action, 'requestId': str(uuid.uuid4()), **fields})
                    assert response.ok, response.text()
                    return response.json()['data']

                def room():
                    response = context.request.get(base + '/api/rooms/' + world + '/gameplay')
                    assert response.ok, response.text()
                    return response.json()['data']

                page = context.new_page()
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.add_init_script('window.fishingBrowserErrors=[];window.addEventListener("error",event=>fishingBrowserErrors.push(event.message));')
                page.route('https://**/*', lambda route: route.abort())
                page.goto(base + '/model-explorer.html?environment=' + world + '&autoplay=1&mode=multiplayer', wait_until='domcontentloaded', timeout=90000)
                page.wait_for_function('(window.MuzikazHouseExplorer?.snapshot().serverReady && window.MuzikazHouseExplorer.snapshot().controlsReady) || window.fishingBrowserErrors.length', timeout=120000)
                assert not errors, errors
                assert page.evaluate('window.MuzikazHouseExplorer?.snapshot().controlsReady'), page.locator('#house-status').inner_text()
                print('Live mobile harbor ready.', flush=True)
                state = command('join')
                self_id = state['selfId']
                command('rad-tox-toggle', enabled=False)
                def open_fishing():
                    page.wait_for_function('document.querySelector(".fishing-toggle")?.hidden === false')
                    # Toolbar overflow has separate four-viewport coverage. Open
                    # its public button handler without making camera/toolbar
                    # reflow part of this server-and-fishing integration test.
                    page.locator('.fishing-toggle').evaluate('(button)=>button.click()')

                boat = next(actor for actor in state['actors'].values() if actor.get('modelId') == 'harbor-fishing-boat' and actor['position']['x'] > 100 and actor['position']['z'] < 0)
                command('map-access', entityId=boat['id'])
                page.wait_for_function('(id)=>MuzikazHouseExplorer.snapshot().vehicleId===id', arg=boat['id'])
                page.locator('.district-map-toggle').evaluate('(button)=>button.click()')
                destination = page.locator('.district-map-dialog [data-fishing-destination="marina-fishing"]').first
                destination.wait_for(state='attached')
                destination.evaluate('(button)=>{for(let node=button.parentElement;node;node=node.parentElement)if(node.tagName==="DETAILS")node.open=true;}')
                destination.click()
                panel = page.locator('.fishing-hud')
                panel.wait_for(state='visible', timeout=60000)
                arrived = room()['actors'][boat['id']]
                assert arrived['boating']['navigationDestinationId'] == 'marina-fishing'
                assert arrived['boating']['arrival']['destinationId'] == 'marina-fishing'
                assert arrived['boating']['anchor'] and abs(arrived['boating']['speed']) < .15
                assert abs(arrived['position']['x'] - 151) < 2.5 and abs(arrived['position']['z'] + 37) < 2.5
                assert page.locator('.district-map-dialog').is_hidden(), 'Route map blocked the arrival handoff'
                print('Selected marina route arrived, anchored, and enabled live fishing sports actions.', flush=True)
                assert page.locator('dialog:modal').count() == 0, 'Fishing covered the boat with a modal dashboard'
                assert panel.locator('svg[data-water],.fishing-water').count() == 0, 'Fishing still uses an illustrated substitute for the live water'
                assert page.locator('#house-explorer-canvas').is_visible()
                page.locator('.house-stage').screenshot(path='/tmp/fishing-live-sports-view.png')
                exposure = page.evaluate('''()=>{const canvas=document.querySelector('#house-explorer-canvas'),r=canvas.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width*.5,r.y+r.height*.35);return {clear:hit===canvas,hit:hit?.tagName+':'+hit?.className,top:r.top,height:r.height};}''')
                assert exposure['clear'], ('The fishing panel obscures the live water view', exposure)
                assert panel.evaluate('(el)=>el.scrollWidth<=el.clientWidth'), 'Fishing overflows mobile viewport'
                if panel.get_attribute('data-side') != 'starboard':
                    panel.locator('[data-fishing-side]').click()
                panel.locator('[data-cast]').click()
                page.wait_for_function('document.querySelector("[data-hook]")?.hidden === false', timeout=18000)
                session = room()['players'][self_id]['fishing']['session']
                assert session['side'] == 'starboard' and session['boatId'] == boat['id'] and session['zoneId'] == 'marina-fishing'
                panel.locator('[data-hook]').click()
                page.wait_for_function('document.querySelector("[data-reel]")?.hidden === false')
                print('Starboard cast hooked; holding Reel with automatic drag.', flush=True)
                # Control the real rendered Reel button while reading authoritative
                # tension. No fish, score, time or catch result is injected.
                started = time.monotonic()
                held = False
                reel = panel.locator('[data-fishing-primary]')
                while time.monotonic() - started < 40:
                    current = page.evaluate('''()=>({status:document.querySelector('.fishing-hud').dataset.phase,tension:document.querySelector('[data-tension]').value})''')
                    if current['status'] == 'caught':
                        break
                    assert current['status'] == 'reeling', json.dumps(current)
                    wanted = True
                    if wanted != held:
                        reel.dispatch_event('pointerdown' if wanted else 'pointerup', {'pointerId': 51, 'button': 0, 'pointerType': 'touch'})
                        held = wanted
                    page.wait_for_timeout(200)
                else:
                    raise AssertionError('The real mobile fishing fight did not land a catch')
                reel.dispatch_event('pointerup', {'pointerId': 51, 'button': 0, 'pointerType': 'touch'})
                page.wait_for_function('document.querySelector(".fishing-hud")?.dataset.phase === "caught"')
                page.locator('.house-stage').screenshot(path='/tmp/fishing-live-sports-catch.png')
                panel.locator('[data-keep]').click()
                page.wait_for_function('document.querySelector(".fishing-hud")?.dataset.phase !== "caught"')
                saved = room()['players'][self_id]['fishing']
                assert len(saved['creel']) == 1
                print('Catch landed and saved.', flush=True)
                # Return to the helm, then visit the optional market menu.
                panel.locator('[data-fishing-exit]').click()
                command('map-access', position={'x': 123, 'z': -35})
                open_fishing()
                panel.locator('[data-fishing-menu]').click()
                market = page.locator('.fishing-dialog')
                market.wait_for(state='visible')
                page.wait_for_function('document.querySelector("[data-sell]")?.disabled === false')
                market.locator('[data-sell]').click()
                page.wait_for_function('document.querySelector("[data-creel-count]")?.textContent.startsWith("0 /")')
                final = room()['players'][self_id]['fishing']
                assert not final['creel'] and final['stats']['totalEarnedMzk'] > 0
                # Reconnect from durable account state and reject combat use of gear.
                restored = command('join')['players'][self_id]['fishing']
                assert restored['stats']['catches'] == 1 and not restored['creel']
                invalid = context.request.post(base + '/api/rooms/' + world + '/gameplay', headers={'X-CSRF-Token': csrf}, data={'action': 'fire', 'tool': 'fishing-rod', 'direction': [0, 0, -1], 'requestId': str(uuid.uuid4())})
                assert not invalid.ok, 'A fishing rod was accepted as a firearm'
                assert not errors, errors
                browser.close()
                print('PASS: routed live boat view, unobscured water, sports-panel cast/hook/hold-Reel catch, return helm, optional market sale, reconnect and gear combat rejection')
        finally:
            server.terminate()
            server.wait(timeout=15)
