"""Real counted sea -> shore road -> aircraft -> truck -> deed freight.

The fixture seeds a paid production/verified sea receipt. Flight proof then comes
only from the live server's aircraft physics and normal gameplay commands.
"""
import json
import os
import socket
import subprocess
import tempfile
import time
from uuid import uuid4
from pathlib import Path
from urllib.parse import quote

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = Path('/workspace/scratch')
os.chdir(ROOT)
ARTIFACTS.mkdir(parents=True, exist_ok=True)


def data(response):
    assert response.ok, f'{response.status}: {response.text()[:3000]}'
    payload = response.json()
    assert payload.get('success') is not False, payload
    return payload.get('data', payload)


with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]
base = f'http://127.0.0.1:{port}'
with tempfile.TemporaryDirectory(prefix='strait-air-supply-') as directory:
    seed = r'''
import {MzkAccountStore} from './loadout-code-store.mjs';
import {UserJsonDatabase} from './user-json-database.mjs';
import {WorldSupplyService} from './server-world-supply.mjs';
import {ServerBuilderCollision} from './server-builder-collision.mjs';
import {memberPlotEnvironment} from './member-plots.mjs';
import {shippingWorld} from './shipping-world.mjs';
import {GAME_ECONOMY} from './game-economy.mjs';
import {SHIPPING_ROUTES,SHIPPING_RULES} from './public/js/shipping-config.js';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const dir=process.argv[2],accounts=new MzkAccountStore(join(dir,'accounts.json')),db=new UserJsonDatabase(join(dir,'users.json'));
const account=await accounts.freePlayLogin('AirSupplyPilot','air-supply-test-password'),wallet=(await db.ensureAccount(account)).walletId;
await db.transaction(data=>{data.users[wallet].tokens.MZK=1000000;data.users[wallet].memory.profile={displayName:'Counted Air Supplier'};return {};});
const scene={id:'air-supply-base',name:'Air Supply Store',version:3,layout:'grand-floor',mapSize:180,streets:[{id:'air-store-access',name:'Air Supply Road',from:{x:0,y:0,z:55},to:{x:0,y:0,z:-45},width:8}],layoutMeta:{delivery:{hub:{name:'Air goods distribution bay',position:{x:0,y:0,z:55}}}},objects:[{id:'air-receiving-store',modelId:'general-store',name:'Air Supplied Store',position:{x:25,y:0,z:-25},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1}}]};
const authored={id:scene.id,name:scene.name,visibility:'public',playable:true,multiplayer:true,source:'custom-builder',ownerId:'account:'+account.accountId,ownerName:'Counted Air Supplier',proceduralLand:true,spawn:{x:12,y:.02,z:35},builderScene:scene,contentUpdatedAt:'air-supply-fixture-v1'};
const claimed=await db.claimLand({walletId:wallet,worldId:'air-supply-home',name:'Air Supply Deed',priceMzk:0,requestId:'air-supply-deed'}),deed=await db.configurePlot(wallet,claimed.id,{environmentId:authored.id,name:'Air Supply Receiving Deed'}),plot=memberPlotEnvironment(deed,[authored]),sea=shippingWorld();
await writeFile(join(dir,'custom-maps.json'),JSON.stringify([authored]));
let now=Date.now()-700000;const collision=new ServerBuilderCollision(),service=new WorldSupplyService(db,{now:()=>now,maps:async()=>[sea,authored,plot],collision});
const address=(await service.addresses({mapId:plot.id})).addresses.find(row=>row.objectId==='air-receiving-store'),item=GAME_ECONOMY.find(row=>row.buildAssetId==='frontier-pickup'),quantity=5,contract=SHIPPING_ROUTES.find(row=>row.id==='peninsula-relief');
const quote=await service.action(wallet,'quote',{itemId:item.sku,quantity}),order=await service.action(wallet,'order-address',{addressId:address.id,itemId:item.sku,quantity,onwardMode:'air',shippingMapId:sea.id,contractId:contract.id,expectedPriceMzk:quote.priceMzk,expectedAddressRevision:address.revision,requestId:'air-supply-paid-order'});
let state=await service.state({walletId:wallet,mapId:plot.id});now=state.production.find(job=>job.id===order.productionId).readyAt;state=await service.state({walletId:wallet,mapId:plot.id});const shipment=state.shipments.find(row=>row.orderId===order.id);if(state.shipments.filter(row=>row.orderId===order.id).length!==1)throw Error('Fixture must fit exactly one sea manifest.');
now=Date.now()-240000;const identity={walletId:wallet},player={shipping:{}};await service.shippingAction(identity,{},player,sea,{operation:'reserve',shipmentId:shipment.id,contractId:contract.id});const startedAt=now,jobId='air-supply-verified-sea';player.shipping.job={id:jobId,phase:'loading',contractId:contract.id,environmentId:sea.id,startedAt,deadline:startedAt+SHIPPING_RULES.contractLimitMs};await service.shippingAction(identity,{},player,sea,{operation:'bind',shipmentId:shipment.id,jobId});now=Date.now()-120000;
await service.deliver(identity,{type:'delivery',shipmentId:shipment.id,jobId,deliveryId:jobId,contractId:contract.id,cargoId:contract.cargoId,units:contract.units,quality:100,startedAt,departedAt:startedAt+10000,deliveredAt:now},sea);now=Date.now();state=await service.state({walletId:wallet,mapId:plot.id});const tasks=state.airTasks.filter(row=>row.shipmentId===shipment.id).sort((a,b)=>a.offset-b.offset);
if(tasks.length!==2||tasks[0].quantity!==4||tasks[1].quantity!==1||tasks.some(task=>task.phase!=='awaiting-pilot'))throw Error('Five sealed units require two source-road-complete flights of 4+1 units. '+JSON.stringify(tasks));
if(state.deliveryTasks.length||state.maps.find(row=>row.id===plot.id).stock[item.sku])throw Error('Sea arrival and road handling must create neither receiving stock nor final-mile tasks.');collision.clearWorlds();
console.log(JSON.stringify({mapId:plot.id,addressId:address.id,deedId:deed.id,orderId:order.id,shipmentId:shipment.id,itemId:item.sku,actorId:'account:'+account.accountId,airTaskId:tasks[0].id,remainingAirTaskId:tasks[1].id,sourcePort:tasks[0].sourcePortId,destinationPort:tasks[0].destinationPortId,aircraftId:'shipping-'+tasks[0].sourcePortId+'-cargo-aircraft',destinationRunway:tasks[0].route.destination.runwayId,quantity,flightQuantity:tasks[0].quantity}));
'''
    seeded = subprocess.run(['node', '--input-type=module', '-', directory], input=seed, text=True, check=True, capture_output=True)
    fixture = json.loads(seeded.stdout.strip().splitlines()[-1])
    with open(Path(directory, 'server.log'), 'w') as log:
        server = subprocess.Popen(['node', 'server.mjs'], env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory, 'MUZIKAZ_STATIC_SOURCE': 'repository'}, stdout=log, stderr=log)
        errors, phases, observations = [], [], []
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                context = browser.new_context(viewport={'width': 1280, 'height': 950}, device_scale_factor=.5, service_workers='block', reduced_motion='reduce')
                for _ in range(150):
                    try:
                        if context.request.get(base + '/api/health', timeout=1000).ok:
                            break
                    except Exception:
                        time.sleep(.1)
                else:
                    raise AssertionError(Path(directory, 'server.log').read_text()[-4000:])
                data(context.request.post(base + '/api/access/free-play', data={'username': 'AirSupplyPilot', 'password': 'air-supply-test-password'}))
                session = data(context.request.get(base + '/api/market/session'))
                headers = {'X-CSRF-Token': session['csrfToken']}

                def workspace():
                    return data(context.request.get(base + '/api/world-supply/workspace?mapId=' + quote(fixture['mapId'])))

                def stock(state):
                    return next(row for row in state['maps'] if row['id'] == fixture['mapId'])['stock'].get(fixture['itemId'], 0)

                def command(action, **fields):
                    return data(context.request.post(base + '/api/rooms/hormuz-shipping/gameplay', headers=headers, data={'action': action, 'requestId': str(uuid4()), **fields}))

                def snapshot():
                    return data(context.request.get(base + '/api/rooms/hormuz-shipping/gameplay'))

                def self_state(state):
                    return state['players'][fixture['actorId']]

                baseline = data(context.request.get(base + '/api/wallet/state'))['tokens']['MZK']
                initial = workspace()
                assert stock(initial) == 0 and len(initial['airTasks']) == 2
                assert all('reservationId' not in row and 'captainId' not in row for row in initial['airTasks'])
                assert initial['airReceipts'] == []
                world = data(context.request.get(base + '/api/environments/hormuz-shipping'))
                airport = data(context.request.get(base + '/api/environments/muzikaz-airport'))
                assert len(world['airport']['runways']) == 5 and len(world['streets']) >= 6
                assert any(row['id'] == fixture['aircraftId'] for row in world['builderScene']['objects'])
                assert any(row.get('functionalSettings', {}).get('portal', {}).get('targetMapId') == 'muzikaz-airport' for row in world['builderScene']['objects'])
                assert any(row.get('functionalSettings', {}).get('portal', {}).get('targetMapId') == 'hormuz-shipping' for row in airport['builderScene']['objects'])

                page = context.new_page()
                page.set_default_timeout(30000)
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.route('https://**/*', lambda route: route.abort())
                page.goto(base + '/model-explorer.html?environment=muzikaz-airport&autoplay=1&mode=multiplayer', wait_until='domcontentloaded', timeout=90000)
                page.wait_for_function('window.MuzikazHouseExplorer && (()=>{const s=MuzikazHouseExplorer.snapshot();return s.serverPlayerInitialized&&s.controlsReady&&s.gameplayStarted;})()', timeout=90000)
                page.goto(base + '/model-explorer.html?environment=hormuz-shipping&autoplay=1&mode=multiplayer', wait_until='domcontentloaded', timeout=90000)
                page.wait_for_function('window.MuzikazHouseExplorer && (()=>{const s=MuzikazHouseExplorer.snapshot();return s.serverPlayerInitialized&&s.controlsReady&&s.gameplayStarted;})()', timeout=90000)
                command('map-access', entityId=fixture['aircraftId'])
                page.wait_for_function('(id)=>window.MuzikazHouseExplorer?.snapshot().vehicleId===id || window.MuzikazHouseExplorer?.snapshot().serverVehicleId===id', arg=fixture['aircraftId'], timeout=30000)
                page.evaluate('document.querySelector(".world-supply-toggle").click()')
                panel = page.locator('#world-supply-panel')
                expect(panel).to_be_visible()
                task = panel.locator('[data-air-task="' + fixture['airTaskId'] + '"]')
                expect(task).to_contain_text('4')
                expect(task).to_contain_text('cargo')
                assert data(context.request.get(base + '/api/wallet/state'))['tokens']['MZK'] == baseline
                forged = context.request.post(base + '/api/rooms/hormuz-shipping/gameplay', headers=headers, data={'action': 'world-supply-air', 'requestId': str(uuid4()), 'operation': 'unload', 'airTaskId': fixture['airTaskId'], 'quantity': 999999, 'departedAt': 1, 'landedAt': 2, 'phase': 'landed'})
                assert forged.status == 409 and stock(workspace()) == 0
                task.locator('[data-air-action=reserve]').click()
                expect(task.locator('[data-air-action=load]')).to_be_enabled()
                job = self_state(snapshot())['airFreight']
                assert job['phase'] == 'reserved' and 'reservationId' not in job
                task.locator('[data-air-action=load]').click()
                expect(task.locator('[data-air-action=secure]')).to_be_enabled(timeout=15000)
                task.locator('[data-air-action=secure]').click()
                expect(task.locator('[data-air-action=fly]')).to_be_enabled()
                # A scripted spectator GET is not an authenticated pilot input.
                # Send the same neutral control heartbeat as a centered flight
                # stick, keeping the live pilot present during software WebGL.
                flight_baseline = snapshot()
                scene_version = flight_baseline['sceneVersion']
                page.evaluate('''({csrf,sceneVersion})=>{
                  let busy=false,revision=null;
                  window.__airSupplyHeartbeat=setInterval(async()=>{
                    if(busy)return;busy=true;
                    try{const response=await fetch('/api/rooms/hormuz-shipping/gameplay',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({action:'input',requestId:crypto.randomUUID(),input:{},snapshotMode:'compact',sceneVersion,actorSetRevision:revision})});if(response.ok){const payload=await response.json();revision=payload.data?.actorSetRevision||revision;}}
                    finally{busy=false;}
                  },200);
                }''', {'csrf': session['csrfToken'], 'sceneVersion': scene_version})
                page.screenshot(path=str(ARTIFACTS / 'strait-air-supply-desktop.png'))
                task.locator('[data-air-action=fly]').click()
                expect(panel).not_to_be_visible()
                started = time.monotonic()
                last_report = started
                last_stock_check = started
                last_motion = started
                previous_position = None
                while time.monotonic() - started < 300:
                    state = command('input', input={}, snapshotMode='compact', sceneVersion=scene_version)
                    player = self_state(state)
                    job = player.get('airFreight', {})
                    phase = job.get('phase')
                    if not phases or phases[-1] != phase:
                        phases.append(phase)
                    assert phase != 'cancelled', job
                    aircraft = state['actors'][fixture['aircraftId']]
                    assert aircraft['active'] is not False and aircraft['health'] > 0, aircraft
                    position = aircraft['position']
                    if previous_position is None or sum((position[axis] - previous_position[axis]) ** 2 for axis in ('x', 'y', 'z')) > .01:
                        last_motion = time.monotonic()
                        previous_position = dict(position)
                    assert aircraft.get('flight', {}).get('phase') != 'hold' or time.monotonic() - last_motion < 15, 'The approved cargo route is blocked by geometry or the map flight boundary: ' + json.dumps({'position': position, 'flight': aircraft.get('flight')})
                    if time.monotonic() - last_stock_check >= 4 or phase == 'landed':
                        assert stock(workspace()) == 0, 'Neither airborne progress nor a safe landing may award map stock.'
                        last_stock_check = time.monotonic()
                    apron = job.get('route', {}).get('destination', {}).get('cargoApron', {})
                    on_receiving_apron = all(axis in apron for axis in ('x', 'y', 'z')) and abs(position['x'] - apron['x']) <= 12 and abs(position['z'] - apron['z']) <= 75 and abs(position['y'] - apron['y']) <= 1.5
                    if phase == 'approach' and aircraft.get('flight', {}).get('airborne') is False and on_receiving_apron:
                        if not panel.is_visible():
                            page.evaluate('document.querySelector(".world-supply-toggle").click()')
                        expect(task.locator('[data-air-action=park]')).to_be_enabled(timeout=15000)
                        with page.expect_response(lambda response: response.request.method == 'POST' and response.url.split('?')[0].endswith('/api/rooms/hormuz-shipping/gameplay') and response.request.post_data_json.get('action') == 'aircraft-assist' and response.request.post_data_json.get('operation') == 'park') as stop_at_apron:
                            task.locator('[data-air-action=park]').click()
                        data(stop_at_apron.value)
                    if phase == 'landed':
                        break
                    if time.monotonic() - last_report >= 20:
                        flight = aircraft.get('flight', {})
                        print('Live cargo flight:', json.dumps({'phase': phase, 'position': position, 'airborne': flight.get('airborne'), 'assist': flight.get('assist'), 'assistStage': flight.get('assistStage'), 'assistTimeoutMs': flight.get('assistTimeoutMs'), 'assistElapsedMs': state.get('serverTime', 0) - flight.get('assistSince', state.get('serverTime', 0)), 'speed': flight.get('airspeed')}), flush=True)
                        last_report = time.monotonic()
                    page.wait_for_timeout(800)
                else:
                    failure = {'job': {key: job.get(key) for key in ['airTaskId', 'phase', 'quantity', 'message']}, 'aircraft': {key: aircraft.get(key) for key in ['id', 'position', 'rotation', 'health', 'flight']}, 'serverTime': state.get('serverTime')}
                    (ARTIFACTS / 'strait-air-supply-flight-failure.json').write_text(json.dumps(failure, indent=2) + '\n')
                    raise AssertionError('Actual assisted flight did not reach its receiving apron: ' + json.dumps(failure))
                assert 'airborne' in phases and 'approach' in phases, phases
                if not panel.is_visible():
                    page.evaluate('document.querySelector(".world-supply-toggle").click()')
                expect(panel).to_be_visible()
                expect(task.locator('[data-air-action=unload]')).to_be_enabled(timeout=15000)
                task.locator('[data-air-action=unload]').click()
                expect(task.locator('[data-air-action=unload]')).to_be_enabled(timeout=15000)
                with page.expect_response(lambda response: response.request.method == 'POST' and response.url.split('?')[0].endswith('/api/rooms/hormuz-shipping/gameplay') and response.request.post_data_json.get('action') == 'world-supply-air' and response.request.post_data_json.get('operation') == 'unload') as final_unload:
                    task.locator('[data-air-action=unload]').click()
                data(final_unload.value)
                after_air = workspace()
                assert stock(after_air) == 0
                receipts = [row for row in after_air['airReceipts'] if row['shipmentId'] == fixture['shipmentId']]
                assert len(receipts) == 1 and receipts[0]['quantity'] == 4
                assert 'reservationId' not in receipts[0] and 'captainId' not in receipts[0]
                replay = command('world-supply-air', operation='unload', airTaskId=fixture['airTaskId'])
                assert replay['result']['airReceipt']['quantity'] == 4
                assert len(workspace()['airReceipts']) == 1
                page.set_viewport_size({'width': 390, 'height': 844})
                expect(panel).to_be_visible()
                assert panel.evaluate('(node)=>node.scrollWidth<=node.clientWidth+1')
                page.screenshot(path=str(ARTIFACTS / 'strait-air-supply-mobile.png'))
                started = time.monotonic()
                while time.monotonic() - started < 180:
                    received = workspace()
                    amount = stock(received)
                    observations.append(amount)
                    assert amount in (0, 4), 'The undelivered second flight must never enter stock.'
                    if amount == 4:
                        break
                    page.wait_for_timeout(800)
                else:
                    raise AssertionError('Receiving trucks never completed their exact four-unit doorstep delivery.')
                doors = [row for row in received['dropoffReceipts'] if row['shipmentId'] == fixture['shipmentId']]
                assert sum(row['quantity'] for row in doors) == 4 and all(row['addressId'] == fixture['addressId'] for row in doors)
                assert next(row for row in received['airTasks'] if row['id'] == fixture['remainingAirTaskId'])['phase'] == 'awaiting-pilot'
                data(context.request.post(base + '/api/world-supply/cancel', headers=headers, data={'orderId': fixture['orderId'], 'requestId': 'air-partial-hold'}))
                held = workspace()
                assert stock(held) == 4
                assert next(row for row in held['airTasks'] if row['id'] == fixture['remainingAirTaskId'])['phase'] == 'port-held'
                assert data(context.request.get(base + '/api/wallet/state'))['tokens']['MZK'] == baseline
                assert not errors, errors
                report = {'phases': phases, 'stockObservations': observations, 'airReceiptQuantity': 4, 'doorReceiptQuantity': sum(row['quantity'] for row in doors), 'heldQuantity': 1, 'renderResolution': .5, 'pageErrors': errors, 'fixture': fixture}
                (ARTIFACTS / 'strait-air-supply-browser.json').write_text(json.dumps(report, indent=2) + '\n')
                print('PASS: paid sea escrow -> live cargo flight -> receiving trucks -> exact addressed doorstep; 4 delivered and 1 held.', flush=True)
                browser.close()
        except Exception:
            try:
                page.screenshot(path=str(ARTIFACTS / 'strait-air-supply-failure.png'))
            except Exception:
                pass
            print(Path(directory, 'server.log').read_text()[-5000:], flush=True)
            raise
        finally:
            server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait(timeout=5)
