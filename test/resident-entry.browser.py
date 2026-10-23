"""Native sports entry links open the same world's social walkthrough on mobile."""
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import sync_playwright

os.chdir(Path(__file__).resolve().parents[1])
with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]
base = f'http://127.0.0.1:{port}'
with tempfile.TemporaryDirectory(prefix='resident-entry-') as directory:
    with open(Path(directory) / 'server.log', 'w') as log:
        server = subprocess.Popen(['node', 'server.mjs'], env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory}, stdout=log, stderr=log)
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                try:
                    context = browser.new_context(service_workers='block', viewport={'width': 390, 'height': 844}, device_scale_factor=.8, reduced_motion='reduce')
                    for _ in range(100):
                        try:
                            if context.request.get(base + '/api/health', timeout=1000).ok:
                                break
                        except Exception:
                            time.sleep(.1)
                    else:
                        raise AssertionError('Server startup failed: ' + Path(directory, 'server.log').read_text()[-2000:])
                    assert context.request.post(base + '/api/access/guest', data={}).status == 201
                    results = []
                    games = set(os.environ.get('RESIDENT_ENTRY_GAMES', 'hockey,arcade').split(','))
                    for game, map_id in [('hockey', 'hockey-arena'), ('arcade', 'neon-junction')]:
                        if game not in games:
                            continue
                        page = context.new_page()
                        errors = []
                        joins = []
                        page.on('pageerror', lambda error: errors.append(str(error)))
                        def record_join(request):
                            if request.method == 'POST' and '/gameplay' in request.url:
                                body = request.post_data_json or {}
                                if body.get('action') == 'join':
                                    joins.append(body)
                        page.on('request', record_join)
                        page.route('https://**/*', lambda route: route.abort())
                        try:
                            page.goto(base + '/' + game + '.html?environment=' + map_id, wait_until='domcontentloaded', timeout=60000)
                            link = page.locator('.resident-world-link:visible').first
                            link.wait_for(state='visible', timeout=30000)
                            link.scroll_into_view_if_needed()
                            bounds = link.bounding_box()
                            assert 0 <= bounds['x'] and bounds['x'] + bounds['width'] <= 391 and bounds['height'] >= 40, bounds
                            destination = parse_qs(urlparse(link.get_attribute('href')).query)
                            assert destination['environment'] == [map_id] and destination['house'] == [map_id], destination
                            assert destination['walkthrough'] == ['1'] and destination['mode'] == ['multiplayer'], destination
                            print(game + ': mobile People & favors link reaches the same map', flush=True)
                            # Click the actual in-game mobile affordance; do not
                            # replace this with a direct model-explorer URL.
                            link.click()
                            page.wait_for_url('**/model-explorer.html?**', timeout=60000)
                            page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().gameplayStarted && window.MuzikazHouseExplorer.snapshot().serverReady || document.querySelector("[data-house-start]")?.textContent === "Try again"', timeout=90000)
                            assert page.evaluate('window.MuzikazHouseExplorer?.snapshot().gameplayStarted'), page.locator('#house-status').text_content()
                            page.wait_for_function('window.MuzikazHouseExplorer.snapshot().controlsReady', timeout=30000)
                            state = page.evaluate('window.MuzikazHouseExplorer.snapshot()')
                            assert state['roomId'] == map_id and state['serverHostedRoom'] and state['serverReady'], state
                            response = context.request.get(base + '/api/rooms/' + map_id + '/gameplay')
                            assert response.ok, response.text()
                            room = response.json()['data']
                            residents = [actor for actor in room['actors'].values() if actor.get('resident') and actor.get('active', True)]
                            assert len(residents) >= 2, {'map': map_id, 'residents': residents}
                            assert all(actor['resident'].get('personality') and actor['resident'].get('context') for actor in residents)
                            assert room['players'][state['serverSelfId']]['radToxEnabled'] is False
                            assert joins and joins[-1].get('residentWalkthrough') is True, joins
                            toggle = page.get_by_role('button', name='Residents, conversations and daily objectives', exact=True)
                            toggle.click()
                            panel = page.locator('.world-resident-panel')
                            panel.wait_for(state='visible')
                            assert panel.locator('[data-resident-talk]').count() >= 2
                            assert panel.locator('[data-resident-talk]:enabled').count() >= 1, {'map': map_id, 'player': room['players'][state['serverSelfId']]['position'], 'residents': [{'id': npc['id'], 'position': npc['position']} for npc in residents], 'joins': joins}
                            panel.locator('[data-resident-talk]:enabled').first.click()
                            panel.get_by_label('Quest conversation transcript', exact=True).wait_for(state='visible', timeout=15000)
                            assert panel.locator('.resident-contact-profile').is_visible()
                            page.wait_for_timeout(1200)
                            assert urlparse(page.url).path.endswith('/model-explorer.html'), page.url
                            assert parse_qs(urlparse(page.url).query)['walkthrough'] == ['1'], page.url
                            assert not errors, errors
                            page.screenshot(path='/workspace/resident-entry-' + map_id + '.png')
                            result = {'map': map_id, 'residents': len(residents), 'sameMapWalkthrough': True, 'mobileEntry': True, 'browserErrors': errors}
                            results.append(result)
                            print(json.dumps(result), flush=True)
                        except Exception:
                            print('Entry diagnostic', json.dumps({'map': map_id, 'url': page.url, 'errors': errors, 'joins': joins, 'native': page.evaluate('({snapshot:window.MuzikazHouseExplorer?.snapshot(),status:document.querySelector("#house-status")?.textContent})')}), flush=True)
                            page.screenshot(path='/workspace/resident-entry-diagnostic.png', timeout=15000)
                            print('Server diagnostic', Path(directory, 'server.log').read_text()[-2500:], flush=True)
                            raise
                        finally:
                            page.close()
                    print(json.dumps({'checks': results}), flush=True)
                finally:
                    browser.close()
        finally:
            server.terminate()
            server.wait(timeout=10)
