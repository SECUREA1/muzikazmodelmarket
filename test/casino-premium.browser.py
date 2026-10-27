"""Native premium casino games, saved hands, canonical MZK and mobile controls."""
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
catalogue = json.loads(subprocess.check_output([
    'node', '--input-type=module', '-e',
    "import {CASINO_STATIONS,CASINO_ROOMS} from './public/js/casino-config.js'; process.stdout.write(JSON.stringify({stations:CASINO_STATIONS,rooms:CASINO_ROOMS}));"
], text=True))
stations = {item['id']: item for item in catalogue['stations']}
rooms = {item['id']: item for item in catalogue['rooms']}
with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]
base = f'http://127.0.0.1:{port}'
with tempfile.TemporaryDirectory(prefix='casino-premium-browser-') as directory:
    with open(Path(directory) / 'server.log', 'w') as log:
        server = subprocess.Popen(['node', 'server.mjs'], env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory}, stdout=log, stderr=log)
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                try:
                    context = browser.new_context(service_workers='block', viewport={'width': 1100, 'height': 760}, device_scale_factor=.7, reduced_motion='reduce')
                    for _ in range(100):
                        try:
                            if context.request.get(base + '/api/health', timeout=1000).ok:
                                break
                        except Exception:
                            time.sleep(.1)
                    else:
                        raise AssertionError('Server did not start: ' + Path(directory, 'server.log').read_text()[-2000:])
                    assert context.request.post(base + '/api/access/guest', data={}).status == 201
                    csrf = context.request.get(base + '/api/game/room-session').json()['data']['csrfToken']

                    def post(path, body, expected=200):
                        response = context.request.post(base + path, headers={'X-CSRF-Token': csrf}, data=body)
                        assert response.status == expected, (path, response.status, response.text())
                        return response.json().get('data')

                    def command(action, **fields):
                        return post('/api/rooms/muzikaz-casino/gameplay', {'action': action, 'requestId': str(uuid.uuid4()), **fields})

                    def casino_state():
                        response = context.request.get(base + '/api/casino/state')
                        assert response.ok, response.text()
                        return response.json()['data']

                    balance = casino_state()['balance']
                    assert balance >= 200
                    page = context.new_page()
                    errors = []
                    failed_requests = []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.on('response', lambda response: failed_requests.append({'status': response.status, 'url': response.url}) if response.url.startswith(base + '/api/') and response.status >= 400 else None)
                    page.route('https://**/*', lambda route: route.abort())

                    def start():
                        page.goto(base + '/model-explorer.html?environment=muzikaz-casino&autoplay=1&mode=multiplayer', wait_until='domcontentloaded', timeout=120000)
                        try:
                            page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().gameplayStarted && window.MuzikazHouseExplorer.snapshot().serverReady || document.querySelector("[data-house-start]")?.textContent === "Try again"', timeout=120000)
                            assert page.evaluate('window.MuzikazHouseExplorer?.snapshot().gameplayStarted')
                            page.wait_for_function('window.MuzikazHouseExplorer.snapshot().controlsReady', timeout=45000)
                        except Exception:
                            print('Native startup diagnostic', json.dumps({'errors': errors, 'failedRequests': failed_requests, 'snapshot': page.evaluate('window.MuzikazHouseExplorer?.snapshot()'), 'status': page.locator('[data-house-status]').all_text_contents()}), flush=True)
                            raise

                    start()
                    state = command('input', input={})
                    cast = [actor for actor in state['actors'].values() if actor.get('resident', {}).get('casino')]
                    assert len(cast) == 22
                    assert sum(actor['resident'].get('duty') == 'guard' for actor in cast) == 2
                    assert not any(actor.get('loot') or actor.get('radTox') for actor in state['actors'].values())
                    print('Premium casino: native scene, 22 residents and two guards', flush=True)
                    canvas = page.locator('#house-explorer-canvas')
                    panel = page.locator('.casino-dialog[open] .casino-panel')

                    def travel(x, z):
                        result = command('map-access', position={'x': x, 'z': z})
                        actual = result['players'][result['selfId']]['position']
                        page.wait_for_function('(target)=>{const p=window.MuzikazHouseExplorer.snapshot().player.position;return Math.hypot(p[0]-target.x,p[2]-target.z)<1.5}', arg=actual, timeout=30000)
                        return actual

                    def visit(station_id):
                        station = stations[station_id]
                        x, z = station['position']['x'], station['position']['z']
                        for dx, dz in [(0, 4), (5, 0), (-5, 0), (0, -4)]:
                            try:
                                actual = travel(x + dx, z + dz)
                            except AssertionError:
                                continue
                            if math.hypot(actual['x'] - x, actual['z'] - z) > 7:
                                continue
                            try:
                                page.wait_for_function('(id)=>{const b=document.querySelector(".casino-use");return b&&!b.hidden&&b.dataset.station===id}', arg=station_id, timeout=5000)
                                return
                            except Exception:
                                continue
                        raise AssertionError('No usable public approach to ' + station_id)

                    def open_panel():
                        canvas.focus()
                        page.keyboard.press('e')
                        panel.wait_for(state='visible', timeout=30000)
                        page.wait_for_function("document.querySelector('.casino-panel [data-casino-balance]')?.textContent !== '— MZK'", timeout=30000)

                    def close_panel():
                        page.get_by_role('button', name='Return to walking', exact=True).click()
                        page.locator('.casino-dialog[open]').wait_for(state='detached', timeout=30000)

                    def play_ui(game, operation, click):
                        def matching(response):
                            if not response.url.endswith('/api/casino/play') or response.request.method != 'POST':
                                return False
                            body = response.request.post_data_json
                            return body.get('game') == game and body.get('operation') == operation
                        with page.expect_response(matching, timeout=30000) as completed:
                            click()
                        response = completed.value
                        assert response.ok, response.text()
                        result = response.json()['data']
                        submitted = response.request.post_data_json
                        assert submitted.get('stationId'), submitted
                        expected = result['balance']
                        page.wait_for_function('(expected)=>Number(document.querySelector(".casino-panel [data-casino-balance]")?.textContent.replace(/[^0-9.-]/g,""))===expected', arg=expected, timeout=30000)
                        assert casino_state()['balance'] == expected
                        return result, submitted

                    def account_for(result):
                        global balance
                        expected = balance - result['receipt']['debitedMzk'] + result['receipt']['payoutMzk']
                        assert result['balance'] == expected, (balance, result)
                        balance = result['balance']

                    for room_id in ['aurelia-salon', 'royal-card-room']:
                        entry = rooms[room_id]['entry']
                        travel(entry['x'], entry['z'] + 3)
                        canvas.focus()
                        page.keyboard.down('w')
                        try:
                            page.wait_for_function('(z)=>window.MuzikazHouseExplorer.snapshot().player.position[2]<z', arg=entry['z'] - 1.7, timeout=15000)
                        finally:
                            page.keyboard.up('w')
                    print('Premium casino: both public salon doorways are walkable', flush=True)

                    visit('casino-baccarat-vip')
                    open_panel()
                    bet = panel.locator('[data-bet]')
                    assert int(bet.get_attribute('min')) == 100 and int(bet.get_attribute('max')) == 2500
                    before = casino_state()['balance']
                    for wrong in [
                        {'game': 'baccarat', 'stationId': 'casino-threecard-salon', 'betMzk': 100, 'selection': 'banker'},
                        {'game': 'poker', 'stationId': 'casino-poker-1', 'betMzk': 5},
                        {'game': 'blackjack', 'betMzk': 5},
                    ]:
                        post('/api/casino/play', {'requestId': str(uuid.uuid4()), 'operation': 'bet', **wrong}, expected=409)
                    assert casino_state()['balance'] == before, 'Wrong or remote stations must not debit the canonical wallet'
                    for invalid in [99, 2501]:
                        post('/api/casino/play', {'requestId': str(uuid.uuid4()), 'game': 'baccarat', 'stationId': 'casino-baccarat-vip', 'operation': 'bet', 'betMzk': invalid, 'selection': 'banker'}, expected=400)
                    assert casino_state()['balance'] == before
                    bet.fill('100')
                    panel.locator('[data-selection]').select_option('banker')
                    baccarat, submitted = play_ui('baccarat', 'bet', lambda: panel.locator('[data-wager]').click())
                    assert baccarat['round']['phase'] == 'complete' and baccarat['round']['stationId'] == 'casino-baccarat-vip'
                    account_for(baccarat)
                    assert post('/api/casino/play', submitted) == baccarat
                    assert casino_state()['balance'] == balance
                    panel.locator('.casino-result').wait_for(state='visible')
                    page.screenshot(path='/workspace/casino-premium-baccarat.png')
                    close_panel()
                    print('Premium casino: high-limit baccarat, bounds, native receipt and replay', flush=True)

                    visit('casino-threecard-salon')
                    open_panel()
                    assert int(panel.locator('[data-bet]').get_attribute('min')) == 10
                    assert int(panel.locator('[data-bet]').get_attribute('max')) == 500
                    panel.locator('[data-bet]').fill('10')
                    assert panel.locator('[data-stake-exposure]').is_visible()
                    dealt, _ = play_ui('threecard', 'bet', lambda: panel.locator('[data-wager]').click())
                    account_for(dealt)
                    assert dealt['round']['phase'] == 'playing' and len(dealt['round']['hand']) == 3
                    saved_id = dealt['round']['id']
                    loaded = casino_state()['activeRounds']['threecard']
                    assert loaded['id'] == saved_id and 'deck' not in loaded
                    assert not any(card is not None for card in loaded.get('dealerHand', [])), loaded
                    start()
                    assert casino_state()['activeRounds']['threecard']['id'] == saved_id
                    open_panel()
                    panel.locator('[data-command="play"]').wait_for(state='visible', timeout=30000)
                    played, _ = play_ui('threecard', 'play', lambda: panel.locator('[data-command="play"]').click())
                    account_for(played)
                    assert played['round']['id'] == saved_id and played['round']['phase'] == 'complete'
                    assert played['receipt']['totalStakeMzk'] == 20
                    assert panel.locator('.casino-settlement').is_visible()
                    panel.locator('[data-bet]').fill('10')
                    again, _ = play_ui('threecard', 'bet', lambda: panel.locator('[data-wager]').click())
                    account_for(again)
                    folded, _ = play_ui('threecard', 'fold', lambda: panel.locator('[data-command="fold"]').click())
                    account_for(folded)
                    assert folded['round']['phase'] == 'complete' and folded['receipt']['debitedMzk'] == 0
                    page.set_viewport_size({'width': 390, 'height': 844})
                    box = page.locator('.casino-dialog[open]').bounding_box()
                    assert box['x'] >= 0 and box['x'] + box['width'] <= 391, box
                    assert panel.evaluate('(node)=>node.scrollWidth<=node.clientWidth+1')
                    page.screenshot(path='/workspace/casino-premium-mobile.png')
                    close_panel()
                    print('Premium casino: saved three-card hand, Play/Fold, total exposure and mobile layout', flush=True)

                    page.set_viewport_size({'width': 1100, 'height': 760})
                    visit('casino-blackjack-1')
                    open_panel()
                    for _ in range(6):
                        panel.locator('[data-bet]').fill('5')
                        hand, _ = play_ui('blackjack', 'bet', lambda: panel.locator('[data-wager]').click())
                        account_for(hand)
                        assert hand['round']['betMzk'] == 5 and hand['round']['stationId'] == 'casino-blackjack-1'
                        if hand['round']['phase'] == 'playing':
                            doubled, _ = play_ui('blackjack', 'double', lambda: panel.locator('[data-command="double"]').click())
                            account_for(doubled)
                            assert doubled['round']['phase'] == 'complete' and doubled['receipt']['totalStakeMzk'] == 10
                            break
                    else:
                        raise AssertionError('Could not observe an actionable blackjack hand')
                    close_panel()
                    print('Premium casino: original five-MZK blackjack and Double settled correctly', flush=True)
                    travel(0, -20)
                    locked = context.request.post(base + '/api/rooms/muzikaz-casino/gameplay', headers={'X-CSRF-Token': csrf}, data={'action': 'map-access', 'position': {'x': 0, 'z': -30}, 'requestId': str(uuid.uuid4())})
                    assert locked.status == 403 and locked.json()['code'] == 'CASINO_VAULT_LOCKED', (locked.status, locked.text())
                    assert casino_state()['balance'] == balance
                    assert not errors, errors
                    page.screenshot(path='/workspace/casino-premium-native.png')
                    print(json.dumps({'checks': ['native premium casino', '22 residents and two guards', 'baccarat limits and idempotent MZK settlement', 'saved three-card hand and dealer secrecy', 'Play/Fold and displayed total stake', 'blackjack double', 'mobile layout', 'locked vault'], 'balanceMzk': balance, 'browserErrors': errors}), flush=True)
                finally:
                    browser.close()
        finally:
            server.terminate()
            server.wait(timeout=10)
