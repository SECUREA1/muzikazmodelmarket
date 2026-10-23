"""Native casino launch, walking, shared residents and authoritative MZK games.

Uses the existing local-map travel command to visit each clear station approach.
No client position, outcome, balance or payout is accepted as authoritative.
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
with tempfile.TemporaryDirectory(prefix='casino-browser-') as directory:
    with open(Path(directory) / 'server.log', 'w') as log:
        server = subprocess.Popen(['node', 'server.mjs'], env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory}, stdout=log, stderr=log)
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                try:
                    context = browser.new_context(service_workers='block', viewport={'width': 1280, 'height': 900}, reduced_motion='reduce')
                    for _ in range(100):
                        try:
                            if context.request.get(base + '/api/health', timeout=1000).ok:
                                break
                        except Exception:
                            time.sleep(.1)
                    else:
                        raise AssertionError('Casino server did not start: ' + Path(directory, 'server.log').read_text()[-2000:])
                    assert context.request.post(base + '/api/access/guest', data={}).status == 201
                    csrf = context.request.get(base + '/api/game/room-session').json()['data']['csrfToken']
                    def post(path, body, status=200):
                        response = context.request.post(base + path, headers={'X-CSRF-Token': csrf}, data=body)
                        assert response.status == status, (path, response.status, response.text())
                        return response.json().get('data')
                    def command(action, **fields):
                        return post('/api/rooms/muzikaz-casino/gameplay', {'action': action, 'requestId': str(uuid.uuid4()), **fields})
                    def casino(body):
                        return post('/api/casino/play', {'requestId': str(uuid.uuid4()), **body})
                    state = context.request.get(base + '/api/casino/state')
                    assert state.ok, state.text()
                    initial_balance = state.json()['data']['balance']
                    assert initial_balance > 100
                    anonymous = p.request.new_context()
                    assert anonymous.get(base + '/api/casino/state').status == 401
                    anonymous.dispose()
                    rejected_csrf = context.request.post(base + '/api/casino/play', headers={'X-CSRF-Token': 'invalid-casino-proof'}, data={'requestId': str(uuid.uuid4()), 'game': 'slots', 'operation': 'bet', 'betMzk': 10})
                    assert rejected_csrf.status == 401
                    assert context.request.get(base + '/api/casino/state').json()['data']['balance'] == initial_balance
                    page = context.new_page()
                    errors = []
                    startup_failures = []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.on('response', lambda response: startup_failures.append(response.json().get('message')) if '/api/rooms/muzikaz-casino/gameplay' in response.url and response.status >= 400 else None)
                    page.route('https://**/*', lambda route: route.abort())
                    page.goto(base + '/model-explorer.html?environment=muzikaz-casino&autoplay=1&mode=multiplayer', wait_until='domcontentloaded', timeout=90000)
                    page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().gameplayStarted && window.MuzikazHouseExplorer.snapshot().serverReady || document.querySelector("[data-house-start]")?.textContent === "Try again"', timeout=90000)
                    assert page.evaluate('window.MuzikazHouseExplorer?.snapshot().gameplayStarted'), startup_failures
                    page.wait_for_function('window.MuzikazHouseExplorer.snapshot().controlsReady', timeout=30000)
                    snapshot = page.evaluate('window.MuzikazHouseExplorer.snapshot()')
                    assert snapshot['roomId'] == 'muzikaz-casino', snapshot
                    assert snapshot['serverPlayerInitialized']
                    assert not snapshot['world']['slimeFloor']
                    room = command('input', input={})
                    residents = [a for a in room['actors'].values() if a.get('resident')]
                    guards = [a for a in residents if a['resident'].get('role') == 'Security guard']
                    assert len(guards) == 2, [(a['id'], a['resident'].get('role')) for a in residents]
                    print('Casino native startup: ready, two guards, resident cast', flush=True)
                    assert len(residents) == 22, [(a['id'], a['resident'].get('role')) for a in residents]
                    assert any('dealer' in a['resident'].get('role', '').lower() for a in residents)
                    assert any(a['resident'].get('role') == 'Casino guest' for a in residents)
                    assert not (room.get('radTox') or {}).get('enemies')
                    assert not any(a.get('loot') for a in room['actors'].values())
                    assert not any(a.get('trafficAI') and not a.get('resident') for a in room['actors'].values())
                    canvas = page.locator('#house-explorer-canvas')
                    canvas.scroll_into_view_if_needed()
                    canvas.focus()
                    before = page.evaluate('window.MuzikazHouseExplorer.snapshot().player.position')
                    page.keyboard.down('w')
                    try:
                        page.wait_for_function('(before)=>{const p=window.MuzikazHouseExplorer.snapshot().player.position;return Math.hypot(p[0]-before[0],p[2]-before[2])>.3}', arg=before, timeout=15000)
                    finally:
                        page.keyboard.up('w')
                    def travel(x, z):
                        result = command('map-access', position={'x': x, 'z': z})
                        position = result['players'][result['selfId']]['position']
                        assert math.hypot(position['x'] - x, position['z'] - z) < 1.5, position
                        page.wait_for_function('(target)=>{const p=window.MuzikazHouseExplorer.snapshot().player.position;return Math.hypot(p[0]-target.x,p[2]-target.z)<1.5}', arg=position, timeout=15000)
                        return result
                    panel = page.locator('.casino-dialog[open] .casino-panel')
                    def open_panel(text):
                        canvas.focus()
                        page.keyboard.press('e')
                        panel.wait_for(state='visible', timeout=10000)
                        page.wait_for_function("document.querySelector('.casino-panel [data-casino-balance]')?.textContent !== '— MZK'", timeout=15000)
                        assert text.lower() in panel.inner_text().lower(), panel.inner_text()
                        return panel
                    def close_panel():
                        page.get_by_role('button', name='Return to walking', exact=True).click()
                        page.locator('.casino-dialog[open]').wait_for(state='detached', timeout=10000)
                    if os.environ.get('CASINO_SMOKE_ONLY') == '1':
                        travel(-5, 33)
                        page.wait_for_function("!document.querySelector('.casino-use').hidden")
                        assert page.locator('.casino-use:visible').count() == 1
                        assert page.locator('.builder-nearby-action:not(.builder-portal-action):visible').count() == 0
                        page.screenshot(path='/workspace/casino-native-desktop.png')
                        canvas.focus()
                        page.keyboard.press('v')
                        page.wait_for_function("window.MuzikazHouseExplorer.snapshot().cameraMode === 'top-down'")
                        page.screenshot(path='/workspace/casino-native-topdown.png')
                        travel(28.5, 13)
                        open_panel('slots')
                        page.set_viewport_size({'width': 390, 'height': 844})
                        box = page.locator('.casino-dialog[open]').bounding_box()
                        assert box['x'] >= 0 and box['x'] + box['width'] <= 391, box
                        assert panel.evaluate('(node)=>node.scrollWidth<=node.clientWidth+1')
                        page.screenshot(path='/workspace/casino-native-mobile.png')
                        close_panel()
                        assert not errors, errors
                        print('Casino latest-build smoke: native rendering, one Use control, top-down view, mobile slot panel, auth/CSRF and no JavaScript errors passed.', flush=True)
                        raise SystemExit(0)
                    travel(-5, 33)
                    open_panel('welcome')
                    close_panel()
                    travel(22, 25)
                    open_panel('wallet is ready')
                    assert panel.locator('[data-casino-balance]').inner_text().endswith('MZK')
                    close_panel()
                    travel(-15, -8)
                    open_panel('Five-card draw poker')
                    panel.locator('[data-bet]').fill('10')
                    panel.locator('[data-wager]').click()
                    panel.locator('[data-hold]').first.wait_for(state='visible', timeout=15000)
                    assert panel.locator('[data-hold]').count() == 5
                    recovered_ui = context.request.get(base + '/api/casino/state').json()['data']['activeRounds']['poker']
                    assert 'deck' not in recovered_ui
                    close_panel()
                    open_panel('Five-card draw poker')
                    panel.locator('[data-hold]').first.wait_for(state='visible', timeout=15000)
                    assert panel.locator('[data-hold]').count() == 5
                    panel.locator('[data-hold="0"]').click()
                    assert panel.locator('[data-hold="0"]').get_attribute('aria-pressed') == 'true'
                    panel.locator('[data-command="draw"]').click()
                    panel.locator('.casino-result').wait_for(state='visible', timeout=15000)
                    close_panel()
                    print('Casino UI: host, cashier, poker holds and draw verified', flush=True)
                    result = casino({'game': 'poker', 'operation': 'bet', 'betMzk': 10})
                    assert len(result['round']['hand']) == 5 and result['round']['phase'] == 'playing'
                    recovered = context.request.get(base + '/api/casino/state').json()['data']['activeRounds']['poker']
                    assert recovered['id'] == result['round']['id']
                    assert 'deck' not in recovered
                    result = casino({'game': 'poker', 'operation': 'draw', 'roundId': recovered['id'], 'revision': recovered['revision'], 'holds': [0, 2]})
                    assert result['round']['phase'] == 'complete'
                    travel(14, -8)
                    result = casino({'game': 'blackjack', 'operation': 'bet', 'betMzk': 10})
                    round_ = result['round']
                    if round_['phase'] == 'playing':
                        assert round_['dealerHand'][1] is None
                        result = casino({'game': 'blackjack', 'operation': 'stand', 'roundId': round_['id'], 'revision': round_['revision']})
                    assert result['round']['phase'] == 'complete'
                    for game, x, z, selection in [('roulette', -15, -24, 'red'), ('dice', 15, -24, 'seven'), ('slots', 28.5, 13, None)]:
                        travel(x, z)
                        body = {'requestId': str(uuid.uuid4()), 'game': game, 'operation': 'bet', 'betMzk': 10}
                        if selection is not None:
                            body['selection'] = selection
                        first = post('/api/casino/play', body)
                        replay = post('/api/casino/play', body)
                        assert first == replay, 'Replayed wager must return one settlement'
                        assert first['round']['phase'] == 'complete'
                        assert first['round']['betMzk'] == 10
                    print('Casino MZK: all five games and duplicate settlement verified', flush=True)
                    travel(-22, 25)
                    served = post('/api/casino/vendor', {'itemId': 'casino-water', 'requestId': str(uuid.uuid4())})
                    assert served['item']['id'] == 'casino-water'
                    print('Casino vendor served and MZK balance updated', flush=True)
                    travel(0, -20)
                    open_panel('Vault secured')
                    page.screenshot(path='/workspace/casino-vault-panel.png')
                    close_panel()
                    canvas.focus()
                    page.keyboard.down('w')
                    page.wait_for_timeout(2200)
                    page.keyboard.up('w')
                    blocked = page.evaluate('window.MuzikazHouseExplorer.snapshot().player.position')
                    assert blocked[2] > -23.5, ('Locked vault door did not stop walking', blocked)
                    travel(28.5, 13)
                    open_panel('slots')
                    page.set_viewport_size({'width': 390, 'height': 844})
                    panel.locator('[data-bet]').fill('5')
                    panel.locator('[data-wager]').click()
                    panel.locator('.casino-result').wait_for(state='visible', timeout=15000)
                    box = page.locator('.casino-dialog[open]').bounding_box()
                    assert box['x'] >= 0 and box['x'] + box['width'] <= 391, box
                    assert panel.evaluate('(node)=>node.scrollWidth<=node.clientWidth+1')
                    page.screenshot(path='/workspace/casino-native-mobile.png')
                    close_panel()
                    canvas.focus()
                    before = page.evaluate('window.MuzikazHouseExplorer.snapshot().player.position')
                    page.keyboard.down('s')
                    try:
                        page.wait_for_function('(before)=>{const p=window.MuzikazHouseExplorer.snapshot().player.position;return Math.hypot(p[0]-before[0],p[2]-before[2])>.15}', arg=before, timeout=15000)
                    finally:
                        page.keyboard.up('s')
                    page.set_viewport_size({'width': 1280, 'height': 900})
                    travel(0, 32)
                    post('/api/casino/play', {'requestId': str(uuid.uuid4()), 'game': 'slots', 'operation': 'bet', 'betMzk': 10}, status=409)
                    assert not errors, errors
                    page.screenshot(path='/workspace/casino-native-desktop.png')
                    print(json.dumps({'checks': ['native casino launch', 'walking', 'two guards and animated resident cast', 'all five authoritative MZK games', 'hidden cards and pending round restoration', 'idempotent settlement', 'vendor and proximity enforcement'], 'residents': len(residents), 'browserErrors': errors}), flush=True)
                finally:
                    browser.close()
        finally:
            server.terminate()
            server.wait(timeout=10)
