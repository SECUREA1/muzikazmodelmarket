"""Observe actual rival loading and sailing, shared league entry and safe controls.

This runs the real server and browser on wall-clock time. It does not write the
room database, advance its clock, or inject shipment/competition results.
Run npm run build first so the server's dist modules match the implementation.
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
WORLD = 'hormuz-shipping'


def distance(a, b):
    return ((a['x'] - b['x']) ** 2 + (a['z'] - b['z']) ** 2) ** .5


def rival_id(rival):
    return rival.get('companyId') or rival['id']


def ship_id(rival):
    return rival.get('shipId') or rival.get('actorId') or rival.get('vesselId')


def phase(rival):
    return rival.get('phase') or rival.get('job', {}).get('phase')


with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]
base = f'http://127.0.0.1:{port}'

with tempfile.TemporaryDirectory(prefix='shipping-rivals-live-') as directory:
    log_path = Path(directory) / 'server.log'
    with open(log_path, 'w') as log:
        server = subprocess.Popen(['node', 'server.mjs'], env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory}, stdout=log, stderr=log)
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                context = browser.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, service_workers='block', reduced_motion='reduce')
                for _ in range(120):
                    try:
                        if context.request.get(base + '/api/health', timeout=1000).ok:
                            break
                    except Exception:
                        time.sleep(.1)
                assert context.request.get(base + '/api/health').ok, log_path.read_text()

                def login(ctx):
                    response = ctx.request.post(base + '/api/access/guest', data={})
                    assert response.status == 201, response.text()
                    return ctx.request.get(base + '/api/game/room-session').json()['data']['csrfToken']

                csrf = login(context)

                def send(action, ctx=context, token=csrf, expected=True, **fields):
                    response = ctx.request.post(base + '/api/rooms/' + WORLD + '/gameplay', headers={'X-CSRF-Token': token}, data={'action': action, 'requestId': str(uuid.uuid4()), **fields})
                    assert response.ok == expected, response.text()
                    return response.json()['data'] if expected else response.json()

                def room():
                    response = context.request.get(base + '/api/rooms/' + WORLD + '/gameplay')
                    assert response.ok, response.text()
                    return response.json()['data']

                initial = send('join')
                self_id = initial['selfId']
                rivals = initial['shipping'].get('rivals', [])
                assert len(rivals) >= 3, 'The shared sea did not create its working AI companies'
                companies = {rival_id(rival) for rival in rivals}
                assert len(companies) == len(rivals)
                original = {rival_id(rival): {'position': dict(initial['actors'][ship_id(rival)]['position']), 'phase': phase(rival), 'cargo': initial['actors'][ship_id(rival)].get('boating', {}).get('cargoCount', 0)} for rival in rivals}
                for rival in rivals:
                    actor = initial['actors'][ship_id(rival)]
                    assert actor.get('shippingRival') and actor.get('trafficAI')
                    assert not actor.get('holderId') and actor.get('destructible') is False
                    assert rival.get('companyName') and rival.get('captainName')
                print('Three working shipping companies created as actual protected vessel actors.', flush=True)

                page = context.new_page()
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.route('https://**/*', lambda route: route.abort())
                page.goto(base + '/model-explorer.html?environment=' + WORLD + '&autoplay=1&mode=multiplayer', wait_until='domcontentloaded', timeout=90000)
                page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().serverReady && window.MuzikazHouseExplorer.snapshot().controlsReady', timeout=120000)
                assert not errors, errors
                hud = page.locator('.shipping-hud')
                hud.wait_for(state='visible', timeout=30000)
                assert page.locator('dialog:modal').count() == 0
                assert hud.locator('[data-shipping-live-summary]').inner_text().strip(), 'Live shipping activity has no compact in-game status'
                hud.locator('[data-shipping-chart]').click()
                chart = page.locator('.shipping-dialog')
                chart.wait_for(state='visible')
                assert chart.evaluate('(element)=>element.scrollWidth<=element.clientWidth+1'), 'Live shipping chart overflows mobile width'
                chart.locator('[data-shipping-tab="live"]').click()
                cards = chart.locator('[data-shipping-rivals] [data-rival-id]')
                assert cards.count() >= 3
                first_rival = rivals[0]
                card = chart.locator('[data-shipping-rivals] [data-rival-id="' + rival_id(first_rival) + '"]')
                card.click()
                assert first_rival['captainName'] in chart.locator('[data-shipping-rival-detail]').inner_text()
                assert chart.locator('[data-shipping-port-economy]').inner_text().strip()
                before_menu = room()
                page.keyboard.press('f')
                page.keyboard.press('Space')
                after_menu = room()
                assert after_menu['players'][self_id].get('vehicleId') == before_menu['players'][self_id].get('vehicleId')
                assert after_menu['players'][self_id]['ammo'] == before_menu['players'][self_id]['ammo']
                join = chart.locator('[data-shipping-join-league]')
                join.wait_for(state='visible')
                assert join.is_enabled()
                join.click()
                page.wait_for_function('MuzikazHouseExplorer.snapshot().shipping?.competition?.joined === true')
                league = room()['shipping']['competition']
                assert league.get('id') and league.get('name')
                print('Mobile chart shows real captains, port economy and league entry without leaking movement/fire.', flush=True)

                # A second authenticated visitor sees the same competition and
                # the same AI jobs. Client supplied score cannot grant progress.
                peer = browser.new_context(service_workers='block')
                peer_csrf = login(peer)
                peer_joined = send('join', ctx=peer, token=peer_csrf)
                assert peer_joined['shipping']['competition']['id'] == league['id']
                assert {rival_id(rival) for rival in peer_joined['shipping']['rivals']} == companies
                peer_entered = send('shipping', ctx=peer, token=peer_csrf, operation='join-league', competitionId=league['id'], score=99999, rank=1, deliveries=999)
                peer_state = peer_entered['players'][peer_entered['selfId']]['shipping']['competition']
                assert peer_state['joined'] and peer_state['score'] == 0 and peer_state['deliveries'] == 0
                assert next(entry for entry in peer_entered['shipping']['competition']['leaderboard'] if entry['actorId'] == peer_entered['selfId'])['score'] == 0
                wallet_before = context.request.get(base + '/api/wallet/state').json()['data']['tokens']['MZK']
                send('shipping', operation='claim-league', competitionId=league['id'], expected=False, rank=1, amountMzk=99999)
                assert context.request.get(base + '/api/wallet/state').json()['data']['tokens']['MZK'] == wallet_before
                for rival in rivals:
                    send('map-access', entityId=ship_id(rival), expected=False)
                locked = room()
                assert locked['players'][self_id].get('vehicleId') is None
                for rival in rivals:
                    assert not locked['actors'][ship_id(rival)].get('holderId')

                # Keep sampling actual server state while the browser runs its
                # normal input loop. Never mutate jobs, ship poses or the clock.
                chart.locator('.game-fullscreen-close').click()
                primary = hud.locator('[data-shipping-primary]')
                page.wait_for_function('document.querySelector("[data-shipping-primary]")?.disabled === false')
                primary.click()
                page.wait_for_function('MuzikazHouseExplorer.snapshot().vehicleActive === true')
                human_state = room()
                human_ship_id = human_state['players'][self_id]['vehicleId']
                human_ship = human_state['actors'][human_ship_id]
                assert not human_ship.get('trafficAI')
                moved = set()
                changed = set()
                deadline = time.monotonic() + 40
                last = None
                while time.monotonic() < deadline:
                    last = room()
                    for rival in last['shipping']['rivals']:
                        key = rival_id(rival)
                        actor = last['actors'][ship_id(rival)]
                        if distance(actor['position'], original[key]['position']) >= 10:
                            moved.add(key)
                        if phase(rival) != original[key]['phase'] or actor.get('boating', {}).get('cargoCount', 0) != original[key]['cargo']:
                            changed.add(key)
                    if moved and changed and any(rival.get('job', {}).get('loaded') for rival in last['shipping']['rivals']):
                        break
                    page.wait_for_timeout(1000)
                assert moved, 'No working rival vessel sailed ten metres on real server time: ' + json.dumps(last['shipping']['rivals'])
                assert changed, 'Working AI did not change a cargo or dispatch phase'
                assert last['actors'][human_ship_id]['holderId'] == self_id
                assert distance(last['actors'][human_ship_id]['position'], human_ship['position']) < .05, 'Live rivals interfered with the idle player helm'
                for rival in last['shipping']['rivals']:
                    actor = last['actors'][ship_id(rival)]
                    assert all(isinstance(actor['position'][axis], (int, float)) for axis in ['x', 'y', 'z'])
                    assert actor['health'] > 0
                assert not errors, errors
                page.locator('.house-stage').screenshot(path='/tmp/shipping-live-rivals-boat.png')
                hud.locator('[data-shipping-chart]').click()
                chart.wait_for(state='visible')
                chart.locator('[data-shipping-tab="live"]').click()
                chart.locator('[data-shipping-rivals] [data-rival-id="' + rival_id(first_rival) + '"]').click()
                chart.locator('[data-shipping-rival-detail]').scroll_into_view_if_needed()
                page.locator('.shipping-dialog').screenshot(path='/tmp/shipping-live-rivals-chart.png')
                assert chart.locator('[data-shipping-dispatch]').inner_text().strip(), 'Working shipping activity never reached the dispatch feed'
                print('PASS: actual AI cargo changes and vessel motion, shared competition entry, protected ships, rejected forged rewards, and mobile live chart.', flush=True)
                peer.close()
                browser.close()
        finally:
            server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait(timeout=10)
