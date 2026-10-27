"""Purchased native clown avatar, costumes and harmless carried water blaster.

Uses real authenticated purchases and room equipment commands; model flags come
from the explorer's actual scene, and the shot is sent by its rendered button.
"""
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
WORLD = 'muzikaz-clown-funhouse'
with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]
base = f'http://127.0.0.1:{port}'
with tempfile.TemporaryDirectory(prefix='funhouse-equipment-browser-') as directory:
    with open(Path(directory) / 'server.log', 'w') as log:
        server = subprocess.Popen(['node', 'server.mjs'], env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory}, stdout=log, stderr=log)
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                try:
                    context = browser.new_context(service_workers='block', viewport={'width': 1280, 'height': 900}, has_touch=True, reduced_motion='reduce')
                    for _ in range(100):
                        try:
                            if context.request.get(base + '/api/health', timeout=1000).ok:
                                break
                        except Exception:
                            time.sleep(.1)
                    else:
                        raise AssertionError(Path(directory, 'server.log').read_text()[-3000:])
                    login = context.request.post(base + '/api/access/free-play', data={'username': 'EquipmentBrowserPlayer', 'password': 'clown-equipment-browser'})
                    assert login.ok, login.text()
                    csrf = login.json()['data']['csrfToken']
                    def post(path, body):
                        response = context.request.post(base + path, headers={'X-CSRF-Token': csrf}, data=body)
                        assert response.ok, (path, response.status, response.text())
                        return response.json()['data']
                    def command(action, **fields):
                        return post('/api/rooms/' + WORLD + '/gameplay', {'action': action, 'requestId': str(uuid.uuid4()), **fields})
                    for model in ['funhouse-ringmaster-avatar', 'funhouse-propeller-hat', 'funhouse-clown-shoes', 'funhouse-water-gun']:
                        post('/api/economy/buy', {'sku': 'native:' + model, 'requestId': str(uuid.uuid4())})
                    post('/api/backpack/use', {'itemId': 'economy:native:funhouse-ringmaster-avatar'})
                    print('Owned clown character and equipment purchased; native avatar selected.', flush=True)
                    page = context.new_page()
                    errors = []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.route('https://**/*', lambda route: route.abort())
                    page.goto(base + '/model-explorer.html?environment=' + WORLD + '&mode=multiplayer&autoplay=1', wait_until='domcontentloaded', timeout=90000)
                    page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().controlsReady', timeout=90000)
                    page.wait_for_function("window.MuzikazHouseExplorer.snapshot().avatarBuildAssetId==='funhouse-ringmaster-avatar' && window.MuzikazHouseExplorer.snapshot().localNativeAvatar", timeout=20000)
                    state = command('input', input={})
                    assert state['players'][state['selfId']]['avatarBuildAssetId'] == 'funhouse-ringmaster-avatar'
                    for model in ['funhouse-propeller-hat', 'funhouse-clown-shoes', 'funhouse-water-gun']:
                        command('funhouse-equip', itemId='economy:native:' + model, sku='native:' + model, enabled=True)
                    page.wait_for_function('(()=>{const s=window.MuzikazHouseExplorer.snapshot();return s.funhouseCostume.hat && s.funhouseCostume.shoes && s.waterGunVisible && s.localNativeAvatar})()', timeout=20000)
                    canvas = page.locator('#house-explorer-canvas')
                    canvas.focus()
                    page.keyboard.press('v')
                    page.wait_for_function("window.MuzikazHouseExplorer.snapshot().cameraMode==='top-down' && window.MuzikazHouseExplorer.snapshot().indicatorVisible")
                    print('Actual native avatar, hat, shoes and carried water blaster rendered.', flush=True)
                    before = command('input', input={})
                    player_before = before['players'][before['selfId']]
                    def is_water_response(response):
                        if '/api/rooms/' + WORLD + '/gameplay' not in response.url or response.request.method != 'POST':
                            return False
                        try:
                            return response.request.post_data_json.get('action') == 'funhouse-water'
                        except Exception:
                            return False
                    with page.expect_response(is_water_response, timeout=15000) as shot_response:
                        page.locator('.rad-tox-fire-trigger').click()
                    response = shot_response.value
                    assert response.ok, response.text()
                    shot = response.json()['data']
                    assert shot['result']['funhouseEffect']['kind'] == 'water-spray'
                    player_after = shot['players'][shot['selfId']]
                    assert player_after['health'] == player_before['health'] and player_after['ammo'] == player_before['ammo']
                    assert any(event.get('funhouseEffect', {}).get('kind') == 'water-spray' for event in shot['events'])
                    assert not errors, errors
                    artifact = ROOT.parent / 'scratch' / 'funhouse-owned-equipment.png'
                    try:
                        page.screenshot(path=str(artifact), timeout=15000)
                    except Exception:
                        pass
                    command('funhouse-equip', itemId='economy:native:funhouse-water-gun', sku='native:funhouse-water-gun', enabled=False)
                    page.wait_for_function('!window.MuzikazHouseExplorer.snapshot().waterGunVisible')
                    assert not errors, errors
                    print('Rendered Shoot control sends harmless owned water; removal hides the gun. No JavaScript errors.', flush=True)
                    browser.close()
                finally:
                    if browser.is_connected():
                        browser.close()
        finally:
            server.terminate()
            server.wait(timeout=10)
