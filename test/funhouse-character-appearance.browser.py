"""Funhouse character costumes preserve the player's real avatar and inventory.

Checks actual local/native resident meshes, then leaves for an ordinary world.
Run against a fresh npm run build so the server serves current client modules.
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
ARTIFACTS = ROOT.parent / 'scratch'
ARTIFACTS.mkdir(exist_ok=True)
with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]
base = f'http://127.0.0.1:{port}'
with tempfile.TemporaryDirectory(prefix='funhouse-character-browser-') as directory:
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
                    login = context.request.post(base + '/api/access/free-play', data={'username': 'ClownThemeVisitor', 'password': 'funhouse-appearance-browser'})
                    assert login.ok, login.text()
                    csrf = login.json()['data']['csrfToken']
                    selected = context.request.put(base + '/api/profile/avatar', headers={'X-CSRF-Token': csrf}, data={'assetId': 'starter-avatar'})
                    assert selected.ok, selected.text()

                    def get(path):
                        response = context.request.get(base + path)
                        assert response.ok, (path, response.status, response.text())
                        return response.json()['data']

                    def command(action, **fields):
                        response = context.request.post(base + '/api/rooms/' + WORLD + '/gameplay', headers={'X-CSRF-Token': csrf}, data={'action': action, 'requestId': str(uuid.uuid4()), **fields})
                        assert response.ok, (action, response.status, response.text())
                        return response.json()['data']

                    def identity():
                        account = get('/api/account')
                        profile = get('/api/profile/avatar')
                        economy = get('/api/economy')
                        return {'selectedAvatarId': account['selectedAvatarId'], 'avatar': {key: (profile.get('profile') or {}).get(key) for key in ['assetId', 'modelUrl', 'buildAssetId']}, 'ownedItems': sorted((item['id'], item.get('economySku')) for item in economy['ownedAssets']), 'balance': economy['balance']}

                    before = identity()
                    assert before['selectedAvatarId'] == 'starter-avatar', before
                    assert not any('funhouse-' in item[0] for item in before['ownedItems'])
                    page = context.new_page()
                    errors = []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.route('https://**/*', lambda route: route.abort())
                    page.goto(base + '/model-explorer.html?environment=' + WORLD + '&mode=multiplayer&autoplay=1', wait_until='domcontentloaded', timeout=90000)
                    page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().controlsReady', timeout=90000)
                    page.wait_for_function('(()=>{const s=window.MuzikazHouseExplorer.snapshot();return s.funhouseClownAppearance && s.localNativeAvatar && s.localAvatarAppearance?.startsWith("funhouse-")})()', timeout=30000)
                    page.wait_for_function('(()=>{const r=window.MuzikazHouseExplorer.snapshot().funhouseResidents;return r.total>0 && r.themed===r.total && r.rendered===r.total})()', timeout=30000)
                    snapshot = page.evaluate('window.MuzikazHouseExplorer.snapshot()')
                    assert snapshot['avatarBuildAssetId'] is None, snapshot
                    state = command('input', input={})
                    assert state['players'][state['selfId']]['avatarBuildAssetId'] is None
                    assert state['players'][state['selfId']]['modelUrl'] == before['avatar']['modelUrl']
                    residents = [actor for actor in state['actors'].values() if actor.get('resident')]
                    assert residents and all(actor['resident'].get('funhouseClown') for actor in residents)
                    assert identity() == before, 'a map costume cannot select, purchase or grant an avatar'
                    print('Funhouse visitor and all live AI residents render as creepy clowns; saved starter identity and Backpack unchanged.', flush=True)
                    arrival = command('map-access', position={'x': 7, 'z': 42})
                    target = arrival['players'][arrival['selfId']]['position']
                    page.wait_for_function('(target)=>{const p=window.MuzikazHouseExplorer.snapshot().player.position;return Math.hypot(p[0]-target.x,p[2]-target.z)<1.5}', arg=target, timeout=15000)
                    page.screenshot(path=str(ARTIFACTS / 'funhouse-creepy-characters.png'), timeout=20000)
                    page.locator('#house-explorer-canvas').focus()
                    page.keyboard.press('v')
                    page.wait_for_function('window.MuzikazHouseExplorer.snapshot().indicatorVisible', timeout=15000)
                    page.screenshot(path=str(ARTIFACTS / 'funhouse-creepy-player.png'), timeout=20000)
                    page.goto(base + '/model-explorer.html?environment=muzikaz-fitness-centre&mode=multiplayer&autoplay=1', wait_until='domcontentloaded', timeout=90000)
                    page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().controlsReady', timeout=90000)
                    page.wait_for_function('!window.MuzikazHouseExplorer.snapshot().funhouseClownAppearance && !window.MuzikazHouseExplorer.snapshot().localNativeAvatar', timeout=30000)
                    ordinary = page.evaluate('window.MuzikazHouseExplorer.snapshot()')
                    assert ordinary['roomId'] == 'muzikaz-fitness-centre' and ordinary['avatarBuildAssetId'] is None
                    assert ordinary['funhouseResidents']['themed'] == ordinary['funhouseResidents']['rendered'] == 0
                    assert identity() == before, 'leaving restores the original character without editing ownership or selection'
                    assert not errors, errors
                    print('Ordinary-map appearance restored after travel; account/profile/Backpack unchanged and no JavaScript errors.', flush=True)
                    browser.close()
                finally:
                    if browser.is_connected():
                        browser.close()
        finally:
            server.terminate()
            server.wait(timeout=10)
