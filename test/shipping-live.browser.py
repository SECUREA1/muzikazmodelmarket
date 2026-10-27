"""Exercise the actual multiplayer portal and mobile cargo loop without injected results."""
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

with tempfile.TemporaryDirectory(prefix='shipping-live-') as directory:
    with open(Path(directory) / 'server.log', 'w') as log:
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

                # Validate the physical sea extension and its one-time arrival
                # proof through the real command API before loading its scene.
                harbor = command('join')
                gateways = [actor for actor in harbor['actors'].values() if (actor.get('worldGateway') or {}).get('destination') == 'hormuz-shipping' or ((actor.get('definition') or {}).get('gameplay', {}).get('portal') or {}).get('targetMapId') == 'hormuz-shipping']
                assert gateways, 'The existing sea has no actual shipping-world gateway'
                gateway = gateways[0]
                command('map-access', locationId='hormuz-shipping-portal')
                trip = command('interact', entityId=gateway['id'])['result']['travel']
                assert trip['to'] == 'hormuz-shipping' and trip['from'] == world
                previous_world = world
                world = 'hormuz-shipping'
                joined = command('join', travelFrom=previous_world, travelToken=trip['token'])
                self_id = joined['selfId']
                assert joined['shipping']['enabled']
                assert any((actor.get('worldGateway') or {}).get('destination') == previous_world or ((actor.get('definition') or {}).get('gameplay', {}).get('portal') or {}).get('targetMapId') == previous_world for actor in joined['actors'].values()), 'Shipping has no return sea portal'
                print('Validated reciprocal physical sea portal and server-authenticated shipping arrival.', flush=True)

                page = context.new_page()
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.route('https://**/*', lambda route: route.abort())
                page.goto(base + '/model-explorer.html?environment=' + world + '&autoplay=1&mode=multiplayer', wait_until='domcontentloaded', timeout=90000)
                page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().serverReady && window.MuzikazHouseExplorer.snapshot().controlsReady', timeout=120000)
                assert not errors, errors
                panel = page.locator('.shipping-hud')
                panel.wait_for(state='visible', timeout=45000)
                primary = panel.locator('[data-shipping-primary]')
                chart_button = panel.locator('[data-shipping-chart]')

                def next_action():
                    primary.wait_for(state='visible')
                    page.wait_for_function('document.querySelector("[data-shipping-primary]")?.disabled === false', timeout=15000)
                    primary.click()

                # Start from the real arrival, using the public map boarding
                # operation if the sea portal's approach is beyond boarding reach.
                current = room()
                if not current['players'][self_id]['shipping'].get('boardingId'):
                    command('map-access', locationId='jebel-ali')
                    page.wait_for_function('MuzikazHouseExplorer.snapshot().shipping?.boardingId')
                next_action()
                page.wait_for_function('MuzikazHouseExplorer.snapshot().vehicleId && MuzikazHouseExplorer.snapshot().shippingView.next.operation === "chart"')
                assert page.locator('dialog:modal').count() == 0
                boat_id = room()['players'][self_id]['vehicleId']
                boat = room()['actors'][boat_id]
                assert boat['modelId'] == 'shipping-feeder'
                page.wait_for_timeout(700)
                page.locator('.house-stage').screenshot(path='/tmp/shipping-live-bridge.png')
                print('Mobile bridge ready; public feeder boarded using shipping sports action.', flush=True)

                chart_button.click()
                chart = page.locator('.shipping-dialog')
                chart.wait_for(state='visible')
                assert chart.locator('[data-shipping-port]').count() >= 6
                assert 'PERSIAN GULF' in chart.inner_text() and 'GULF OF OMAN' in chart.inner_text()
                assert chart.evaluate('(element)=>element.scrollWidth<=element.clientWidth+1'), 'Shipping chart overflows the mobile viewport'
                # A management screen must not steer or fire through its controls.
                before = room()
                page.keyboard.press('f')
                after = room()
                assert after['players'][self_id]['ammo'] == before['players'][self_id]['ammo']
                assert abs(after['actors'][boat_id]['boating'].get('speed', 0)) < .15
                chart.locator('[data-shipping-contract="dock-induction"]').click()
                page.wait_for_function('MuzikazHouseExplorer.snapshot().shipping?.job?.phase === "loading"')
                assert page.locator('dialog:modal').count() == 0, 'Cargo acceptance covered the live bridge'
                for count in range(1, 5):
                    next_action()
                    page.wait_for_function('(count)=>MuzikazHouseExplorer.snapshot().shipping?.job?.loaded?.length === count', arg=count)
                loaded = room()['players'][self_id]['shipping']['job']
                assert loaded['portMass'] == loaded['starboardMass'] and loaded['loadedCount'] == 4
                next_action()
                page.wait_for_function('MuzikazHouseExplorer.snapshot().shipping?.job?.phase === "secured"')
                next_action()
                page.wait_for_function('MuzikazHouseExplorer.snapshot().shipping?.job?.phase === "sailing"')
                print('Balanced four-container manifest secured; sailing the actual authored induction route.', flush=True)
                canvas_exposure = page.evaluate('''()=>{const c=document.querySelector('#house-explorer-canvas'),r=c.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width*.5,r.y+r.height*.35);return hit===c;}''')
                assert canvas_exposure, 'Shipping panel obscures the live water and boat view'
                if os.environ.get('SHIPPING_SMOKE_ONLY') == '1':
                    page.wait_for_timeout(10000)
                    underway = room()
                    live_boat = underway['actors'][boat_id]
                    assert underway['players'][self_id]['shipping']['job']['phase'] == 'sailing'
                    assert live_boat['boating'].get('assist'), 'A delayed handling packet cancelled departure'
                    assert ((live_boat['position']['x'] - boat['position']['x']) ** 2 + (live_boat['position']['z'] - boat['position']['z']) ** 2) ** .5 > 20, 'Depart did not produce actual ship motion'
                    page.locator('.house-stage').screenshot(path='/tmp/shipping-smoke-underway.png')
                    cancelled = command('shipping', operation='cancel')
                    assert cancelled['players'][self_id]['shipping']['job']['phase'] == 'cancelled'
                    assert not errors, errors
                    browser.close()
                    print('PASS: fresh merged server portal, mobile bridge, balanced loading, secure, depart, ten seconds of real sailing and safe cancellation')
                    raise SystemExit(0)
                started = time.monotonic()
                next_report = 30
                max_checkpoint = 0
                while time.monotonic() - started < 300:
                    state = page.evaluate('MuzikazHouseExplorer.snapshot()')
                    job = state['shipping']['job']
                    assert job['phase'] == 'sailing', json.dumps(job)
                    max_checkpoint = max(max_checkpoint, job['checkpointIndex'])
                    if job['checkpointIndex'] >= len(job['waypoints']) and state['shippingView']['next']['operation'] == 'dock':
                        actor = room()['actors'][boat_id]
                        if abs(actor['boating'].get('speed', 0)) <= .8:
                            break
                    elapsed = time.monotonic() - started
                    if elapsed > 10 and job['checkpointIndex'] == 0:
                        actor = room()['actors'][boat_id]
                        assert actor['boating'].get('assist'), 'A delayed handling input cancelled the newly departed automatic passage'
                    if elapsed >= next_report:
                        actor = room()['actors'][boat_id]
                        print(f'Actual passage {elapsed:.0f}s: checkpoint {job["checkpointIndex"]}/{len(job["waypoints"])} · {actor["boating"].get("assistStage")} · {actor["position"]}', flush=True)
                        next_report += 30
                    page.wait_for_timeout(250)
                else:
                    raise AssertionError('The actual induction vessel did not complete its navigated passage: ' + json.dumps({'shipping': state.get('shipping'), 'boat': room()['actors'][boat_id]}))
                assert max_checkpoint >= 4
                next_action()
                page.wait_for_function('MuzikazHouseExplorer.snapshot().shipping?.job?.phase === "unloading"')
                for count in range(1, 5):
                    next_action()
                    if count < 4:
                        page.wait_for_function('(count)=>MuzikazHouseExplorer.snapshot().shipping?.job?.unloaded === count', arg=count)
                page.wait_for_function('MuzikazHouseExplorer.snapshot().shipping?.job?.phase === "delivered"')
                final = room()['players'][self_id]['shipping']
                assert final['stats']['deliveries'] == 1 and final['stats']['totalEarnedMzk'] > 0
                assert final['supplies']['shipping-parts-stock'] == 4
                assert final['job']['quality'] == 100
                inventory_response = context.request.get(base + '/api/wallet/state')
                assert inventory_response.ok, inventory_response.text()
                inventory = inventory_response.json()['data']
                owned_stock = next(item for item in inventory['items'] if item.get('shippingSupplyId') == 'shipping-parts-stock')
                assert owned_stock['quantity'] == 4 and owned_stock['renderKind'] == 'shipping-stock'
                assert room()['actors'][boat_id]['health'] == boat['health'], 'The route damaged the starter ship'
                page.locator('.house-stage').screenshot(path='/tmp/shipping-live-delivered.png')
                print('Actual passage docked and unloaded; wallet reward and four delivered stock units saved.', flush=True)

                # Reconnecting rehydrates earned stock from protected account
                # storage; a client-supplied reward command is never accepted.
                restored = command('join')['players'][self_id]['shipping']
                assert restored['stats']['deliveries'] == 1 and restored['supplies']['shipping-parts-stock'] == 4
                invalid = context.request.post(base + '/api/rooms/' + world + '/gameplay', headers={'X-CSRF-Token': csrf}, data={'action': 'shipping', 'operation': 'reward', 'amountMzk': 99999, 'requestId': str(uuid.uuid4())})
                assert not invalid.ok, 'The server accepted a client-forged shipping reward'
                chart_button.click()
                chart.wait_for(state='visible')
                assert chart.locator('[data-shipping-trade="parts-metal"]').is_enabled(), 'Delivered stock is not connected to the port exchange'
                chart.locator('[data-shipping-trade="parts-metal"]').click()
                page.wait_for_function('MuzikazHouseExplorer.snapshot().shipping?.supplies?.["shipping-parts-stock"] === 3')
                inventory = context.request.get(base + '/api/wallet/state').json()['data']
                assert inventory['memory']['materialCredits']['material:metal'] == 5
                assert next(item for item in inventory['items'] if item.get('shippingSupplyId') == 'shipping-parts-stock')['quantity'] == 3
                print('Delivered stock traded through the connected inventory exchange.', flush=True)
                assert not errors, errors
                browser.close()
                print('PASS: reciprocal sea portal, mobile bridge, real loading/navigation/docking/unloading, durable reward and stock, port trade, management input isolation and forged-reward rejection')
        except Exception:
            if 'page' in locals() and not page.is_closed():
                page.screenshot(path='/tmp/shipping-live-failure.png')
                try:
                    Path('/tmp/shipping-live-failure.json').write_text(json.dumps({'view': page.evaluate('MuzikazHouseExplorer.snapshot()'), 'room': room()}, indent=2))
                except Exception:
                    pass
            print((Path(directory) / 'server.log').read_text()[-7000:], flush=True)
            raise
        finally:
            server.terminate()
            server.wait(timeout=15)
