"""Factory startup, live production UI, saved jobs, and mobile layout.

Uses the ordinary guest account and server-validated local-map travel. All test
wallets, room state, and receipts are isolated in a temporary data directory.
"""
import json
import math
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
with tempfile.TemporaryDirectory(prefix='missile-factory-browser-') as directory:
    with open(Path(directory) / 'server.log', 'w') as log:
        server = subprocess.Popen(['node', 'server.mjs'], env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory}, stdout=log, stderr=log)
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                try:
                    context = browser.new_context(service_workers='block', viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
                    for _ in range(150):
                        try:
                            if context.request.get(base + '/api/health', timeout=1000).ok:
                                break
                        except Exception:
                            time.sleep(.1)
                    else:
                        raise AssertionError('Factory server did not start: ' + Path(directory, 'server.log').read_text()[-3000:])
                    assert context.request.post(base + '/api/access/guest', data={}).status == 201
                    csrf = context.request.get(base + '/api/game/room-session').json()['data']['csrfToken']
                    def command(action, **fields):
                        response = context.request.post(base + '/api/rooms/muzikaz-missile-factory/gameplay', headers={'X-CSRF-Token': csrf}, data={'action': action, 'requestId': str(uuid.uuid4()), **fields})
                        assert response.ok, (action, response.status, response.text())
                        return response.json()['data']
                    page = context.new_page()
                    errors = []
                    page.on('pageerror', lambda error: (errors.append(str(error)), print('Browser error:', str(error), flush=True)))
                    page.route('https://**/*', lambda route: route.abort())
                    page.goto(base + '/model-explorer.html?environment=muzikaz-missile-factory&autoplay=1&mode=multiplayer', wait_until='domcontentloaded', timeout=90000)
                    page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().gameplayStarted && window.MuzikazHouseExplorer.snapshot().serverReady', timeout=120000)
                    page.wait_for_function('window.MuzikazHouseExplorer.snapshot().controlsReady', timeout=30000)
                    snapshot = page.evaluate('window.MuzikazHouseExplorer.snapshot()')
                    assert snapshot['roomId'] == 'muzikaz-missile-factory', snapshot
                    assert not snapshot['world']['slimeFloor'], snapshot
                    room = command('input', input={})
                    crew = [a for a in room['actors'].values() if a.get('resident', {}).get('factory')]
                    trucks = [a for a in room['actors'].values() if (a.get('asset', {}).get('buildAssetId') or a.get('modelId')) == 'site-dumptruck']
                    assert len(crew) >= 4, [(a['id'], a.get('resident')) for a in room['actors'].values() if a.get('resident')]
                    assert trucks, 'Factory must contain a working freight truck'
                    assert room.get('factory'), 'Shared factory room view missing'
                    assert len(room['factory']['stations']) == 6
                    assert not any(a.get('loot') or a.get('radTox') for a in room['actors'].values())
                    print('Factory native startup: four AI crew, six stations, freight truck, shared noncombat room.', flush=True)
                    page.screenshot(path='/workspace/missile-factory-preview.png')
                    def travel(x, z):
                        result = command('map-access', position={'x': x, 'z': z})
                        position = result['players'][result['selfId']]['position']
                        assert math.hypot(position['x'] - x, position['z'] - z) < 1.5, position
                        page.wait_for_function('(target)=>{const p=window.MuzikazHouseExplorer.snapshot().player.position;return Math.hypot(p[0]-target.x,p[2]-target.z)<1.5}', arg=position, timeout=15000)
                        return result
                    panel = page.locator('.factory-dialog')
                    toggle = page.get_by_role('button', name='Open missile factory production and jobs', exact=True)
                    travel(-32, 28)
                    toggle.click()
                    page.wait_for_function('document.querySelector(".factory-dialog [data-build]") && !document.querySelector(".factory-dialog [data-build]").disabled')
                    assert panel.get_by_role('img', name='Factory floor plan').count() == 1
                    assert panel.locator('[data-station]').count() == 6
                    initial_balance = int(panel.locator('[data-balance]').inner_text().replace(',', '').split()[0])
                    panel.locator('[data-build="training-missile"]').click()
                    page.wait_for_function('!document.querySelector(".factory-dialog [data-job]").hidden')
                    page.wait_for_function('document.querySelector(".factory-dialog [data-job-name]").textContent.includes("Aster Training Missile")', timeout=15000)
                    print('Factory purchase:', panel.locator('[data-job-name]').inner_text(), panel.locator('[data-status]').inner_text(), flush=True)
                    page.wait_for_function('(balance)=>document.querySelector(".factory-dialog [data-balance]").textContent.replaceAll(",","").includes(String(balance-180))', arg=initial_balance)
                    room = command('factory-status')
                    job_id = room['players'][room['selfId']]['factory']['job']['id']
                    assert room['result']['factory']['balance'] == initial_balance - 180
                    page.screenshot(path='/workspace/missile-factory-production.png')
                    panel.get_by_role('button', name='Close factory', exact=True).click()
                    for station_id, x, z in [('factory-fabrication', -30, 0), ('factory-assembly', 0, 0), ('factory-calibration', 27, 0)]:
                        travel(x, z)
                        toggle.click()
                        page.wait_for_function('!document.querySelector(".factory-dialog [data-work]").disabled')
                        panel.locator('[data-work]').click()
                        page.wait_for_function('document.querySelector(".factory-dialog [data-timer]").textContent.includes("cycle running")')
                        page.wait_for_function('!document.querySelector(".factory-dialog [data-timer]").textContent.includes("cycle")', timeout=25000)
                        panel.get_by_role('button', name='Close factory', exact=True).click()
                        print('Factory station completed:', station_id, flush=True)
                    room = command('factory-status')
                    job = room['players'][room['selfId']]['factory']['job']
                    assert job['status'] == 'haul', job
                    assert len(job['completedSteps']) == 3
                    assert room['result']['factory']['balance'] == initial_balance - 180
                    # A reload must restore this paid build without another purchase.
                    page.reload(wait_until='domcontentloaded', timeout=90000)
                    page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().serverReady && window.MuzikazHouseExplorer.snapshot().controlsReady', timeout=120000)
                    toggle.click()
                    page.wait_for_function('!document.querySelector(".factory-dialog [data-haul]").hidden')
                    assert 'load factory truck' in panel.locator('[data-haul]').inner_text().lower()
                    assert panel.locator('[data-haul]').is_disabled(), 'Haul requires being in the factory truck'
                    restored = command('factory-status')
                    assert restored['players'][restored['selfId']]['factory']['job']['id'] == job_id
                    assert restored['result']['factory']['balance'] == initial_balance - 180
                    page.set_viewport_size({'width': 390, 'height': 844})
                    page.wait_for_timeout(1000)
                    bounds = panel.bounding_box()
                    assert bounds['x'] >= 0 and bounds['x'] + bounds['width'] <= 391, bounds
                    assert panel.evaluate('(node)=>node.scrollWidth<=node.clientWidth+1'), panel.evaluate('(node)=>({scroll:node.scrollWidth,client:node.clientWidth})')
                    panel.get_by_role('button', name='Close factory', exact=True).click()
                    assert not page.evaluate('document.documentElement.classList.contains("game-menu-open")')
                    assert not errors, errors
                    print('Production purchase debits once; all three timed station cycles complete; paid job restores after reload; mobile factory dialog fits 390px and closes cleanly.', flush=True)
                finally:
                    browser.close()
        except Exception:
            print('Factory server tail:', Path(directory, 'server.log').read_text()[-4000:], flush=True)
            raise
        finally:
            server.terminate()
            server.wait(timeout=10)
