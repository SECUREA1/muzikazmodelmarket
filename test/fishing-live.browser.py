"""Play a real boat catch through the mobile UI and persist/sell it via the API."""
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
                page.route('https://**/*', lambda route: route.abort())
                page.goto(base + '/model-explorer.html?environment=' + world + '&autoplay=1&mode=multiplayer', wait_until='domcontentloaded', timeout=90000)
                page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().serverReady && window.MuzikazHouseExplorer.snapshot().controlsReady', timeout=120000)
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
                command('input', input={'anchor': True, 'throttle': 0})
                open_fishing()
                panel = page.locator('.fishing-dialog')
                panel.wait_for(state='visible')
                assert panel.evaluate('(el)=>el.scrollWidth<=el.clientWidth'), 'Fishing overflows mobile viewport'
                panel.locator('[data-side]').select_option('starboard')
                panel.locator('[data-cast]').click()
                page.wait_for_function('document.querySelector("[data-hook]")?.hidden === false', timeout=18000)
                session = room()['players'][self_id]['fishing']['session']
                assert session['side'] == 'starboard' and session['boatId'] == boat['id']
                panel.locator('[data-hook]').click()
                page.wait_for_function('document.querySelector("[data-reel]")?.hidden === false')
                print('Starboard cast hooked; controlling line tension.', flush=True)
                # Control the real rendered Reel button while reading authoritative
                # tension. No fish, score, time or catch result is injected.
                started = time.monotonic()
                held = False
                reel = panel.locator('[data-reel]')
                while time.monotonic() - started < 75:
                    current = page.evaluate('''()=>({status:document.querySelector('[data-water]').dataset.phase,tension:document.querySelector('[data-tension]').value})''')
                    if current['status'] == 'caught':
                        break
                    assert current['status'] == 'reeling', json.dumps(current)
                    wanted = current['tension'] < (.25 if not held else .55)
                    if wanted != held:
                        reel.dispatch_event('pointerdown' if wanted else 'pointerup', {'pointerId': 51, 'button': 0, 'pointerType': 'touch'})
                        held = wanted
                    page.wait_for_timeout(200)
                else:
                    raise AssertionError('The real mobile fishing fight did not land a catch')
                reel.dispatch_event('pointerup', {'pointerId': 51, 'button': 0, 'pointerType': 'touch'})
                page.wait_for_function('document.querySelector("[data-caught]")?.hidden === false')
                panel.locator('[data-keep]').click()
                page.wait_for_function('document.querySelector("[data-stats]")?.textContent.startsWith("1 catches")')
                saved = room()['players'][self_id]['fishing']
                assert len(saved['creel']) == 1
                print('Catch landed and saved.', flush=True)
                # Close and use supported map travel to the fish market, then sell
                # through the same public mobile panel.
                panel.locator('.game-fullscreen-close').click()
                command('map-access', position={'x': 123, 'z': -35})
                open_fishing()
                page.wait_for_function('document.querySelector("[data-sell]")?.disabled === false')
                panel.locator('[data-sell]').click()
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
                print('PASS: real mobile starboard cast, bite, hook, controlled fight, saved catch, fish-market sale, reconnect and gear combat rejection')
        finally:
            server.terminate()
            server.wait(timeout=15)
