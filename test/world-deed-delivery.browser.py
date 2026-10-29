"""Real-server port escrow, calculated trucking, and final deed-door delivery.

The fixture creates a paid factory order and a verified internal sea receipt.
The browser cannot complete shipping or claim stock: it removes its own saved
blocking walls through the normal room API, then observes automatic delivery.
"""
import json
import os
import socket
import subprocess
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = Path('/workspace/scratch')
USERNAME = 'DoorstepBrowser'
PASSWORD = 'doorstep-browser-password'
os.chdir(ROOT)
ARTIFACTS.mkdir(parents=True, exist_ok=True)


def data(response):
    assert response.ok, f'{response.status}: {response.text()[:2000]}'
    payload = response.json()
    assert payload.get('success') is not False, payload
    return payload['data']


def state(context, base):
    return data(context.request.get(base + '/api/world-supply/workspace'))


def stock(snapshot, fixture):
    return next(row['stock'] for row in snapshot['maps'] if row['id'] == fixture['mapId']).get(fixture['itemId'], 0)


def task_rows(snapshot, fixture):
    return [row for row in snapshot['deliveryTasks'] if row['shipmentId'] == fixture['shipmentId']]


def route_row(snapshot, fixture):
    return next(row for row in snapshot['deliveryRoutes'] if row['deedId'] == fixture['deedId'])


with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]
base = f'http://127.0.0.1:{port}'
with tempfile.TemporaryDirectory(prefix='deed-doorstep-browser-') as directory:
    seed = r'''
import {MzkAccountStore} from './loadout-code-store.mjs';
import {UserJsonDatabase} from './user-json-database.mjs';
import {WorldSupplyService} from './server-world-supply.mjs';
import {ServerBuilderCollision} from './server-builder-collision.mjs';
import {SharedRoomStore} from './shared-room-store.mjs';
import {memberPlotEnvironment} from './member-plots.mjs';
import {shippingWorld} from './shipping-world.mjs';
import {GAME_ECONOMY} from './game-economy.mjs';
import {SHIPPING_ROUTES,SHIPPING_RULES} from './public/js/shipping-config.js';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const directory=process.argv[2],accounts=new MzkAccountStore(join(directory,'accounts.json')),
 database=new UserJsonDatabase(join(directory,'users.json')),rooms=new SharedRoomStore(join(directory,'shared-rooms.json'));
const account=await accounts.freePlayLogin('DoorstepBrowser','doorstep-browser-password'),wallet=(await database.ensureAccount(account)).walletId,actorId='account:'+account.accountId;
await database.transaction(data=>{data.users[wallet].tokens.MZK=1000000;return {};});
const scene={version:3,layout:'grand-floor',mapSize:160,streets:[{id:'delivery-road',name:'Front-door delivery lane',from:{x:0,y:0,z:60},to:{x:0,y:0,z:-26},width:8,speedLimitKph:20}],layoutMeta:{delivery:{hub:{name:'Receiving truck bay',position:{x:0,y:0,z:60}},dropoff:{name:'Front door drop-off',kind:'doorstep',position:{x:0,y:0,z:-30}}}},objects:[{id:'front-door',modelId:'glass-door',name:'Front door',position:{x:0,y:0,z:-31.5},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},functionalSettings:{behavior:'door'}}],gameplay:{multiplayer:true,friendlyFire:false}};
const authored={id:'doorstep-browser-base',name:'Doorstep Delivery Test',visibility:'public',playable:true,multiplayer:true,source:'custom-builder',ownerId:wallet,proceduralLand:true,spawn:{x:10,y:.02,z:-28},builderScene:scene,contentUpdatedAt:'doorstep-browser-v1'};
await writeFile(join(directory,'custom-maps.json'),JSON.stringify([authored]));
const claimed=await database.claimLand({walletId:wallet,worldId:'doorstep-browser-home',name:'Doorstep Test Home',priceMzk:0,requestId:'doorstep-test-deed'}),deed=await database.configurePlot(wallet,claimed.id,{environmentId:authored.id,name:'Doorstep Test Home'}),plot=memberPlotEnvironment(deed,[authored]),sea=shippingWorld();
await rooms.update(plot.id,room=>{room.revision=2;room.objects={};for(const [index,x]of [-60,-20,20,60].entries()){const id='door-block-'+index;room.objects[id]={id,ownerId:actorId,revision:index+1,materialId:'wall',position:[x,2.4,0],rotation:[0,0,0],scale:[20,2,4],paint:[]};}return room;});
let now=Date.now()-400000;
const service=new WorldSupplyService(database,{now:()=>now,maps:async()=>[sea,authored,plot],rooms:async ids=>Object.fromEntries(await Promise.all(ids.map(async id=>[id,await rooms.get(id)]))),collision:new ServerBuilderCollision()}),item=GAME_ECONOMY.find(item=>item.buildAssetId==='harbor-skiff'),quantity=5,contract=SHIPPING_ROUTES.find(route=>route.id==='northern-materials');
if(!item)throw Error('A one-per-container watercraft fixture is required.');
const quote=await service.action(wallet,'quote',{itemId:item.sku,quantity}),order=await service.action(wallet,'order',{deedId:deed.id,itemId:item.sku,quantity,shippingMapId:sea.id,contractId:contract.id,expectedPriceMzk:quote.priceMzk,requestId:'doorstep-test-order'});
let snapshot=await service.state({walletId:wallet});now=snapshot.production.find(job=>job.id===order.productionId).readyAt;snapshot=await service.state({walletId:wallet});
const shipment=snapshot.shipments.find(shipment=>shipment.orderId===order.id);
if(snapshot.shipments.filter(shipment=>shipment.orderId===order.id).length!==1)throw Error('The larger sea manifest should contain the whole fixture batch.');
const duration=Math.max(180000,SHIPPING_RULES.loadingSeconds*((contract.units||4)*2-2)*1000+1000);now=Date.now()-duration;
const identity={walletId:wallet},player={shipping:{}};
await service.shippingAction(identity,{},player,sea,{operation:'reserve',shipmentId:shipment.id,contractId:contract.id});
const startedAt=now,jobId='doorstep-verified-sea-voyage';player.shipping.job={id:jobId,phase:'loading',contractId:contract.id,environmentId:sea.id,startedAt,deadline:startedAt+SHIPPING_RULES.contractLimitMs};
await service.shippingAction(identity,{},player,sea,{operation:'bind',shipmentId:shipment.id,jobId});now=Date.now();
const result={type:'delivery',shipmentId:shipment.id,jobId,deliveryId:jobId,contractId:contract.id,cargoId:contract.cargoId,units:contract.units||4,quality:100,startedAt,departedAt:startedAt+10000,deliveredAt:now};
await service.deliver(identity,result,sea);snapshot=await service.state({walletId:wallet});
const tasks=snapshot.deliveryTasks.filter(task=>task.shipmentId===shipment.id),receiving=snapshot.maps.find(map=>map.id===plot.id).stock;
if(tasks.length!==2||tasks.map(task=>task.quantity).sort((a,b)=>a-b).join(',')!=='1,4')throw Error('Five individually packed items must split into two four-slot trucks.');
if(receiving[item.sku]||tasks.some(task=>task.phase!=='blocked'))throw Error('Blocked doorstep route must retain all port cargo without crediting inventory.');
await rooms.flush();
console.log(JSON.stringify({wallet,actorId,mapId:plot.id,deedId:deed.id,orderId:order.id,shipmentId:shipment.id,itemId:item.sku,quantity,taskIds:tasks.map(task=>task.id),blockerIds:['door-block-0','door-block-1','door-block-2','door-block-3'],routeRevision:snapshot.deliveryRoutes.find(route=>route.deedId===deed.id).revision}));
'''
    seeded = subprocess.run(['node', '--input-type=module', '-', directory], input=seed, text=True, check=True, capture_output=True)
    fixture = json.loads(seeded.stdout.strip().splitlines()[-1])
    with open(Path(directory) / 'server.log', 'w') as log:
        server = subprocess.Popen(['node', 'server.mjs'], env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory, 'MUZIKAZ_STATIC_SOURCE': 'repository'}, stdout=log, stderr=log)
        errors = []
        page = None
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                try:
                    context = browser.new_context(viewport={'width': 1280, 'height': 950}, service_workers='block', reduced_motion='reduce')
                    for _ in range(120):
                        try:
                            if context.request.get(base + '/api/health', timeout=1000).ok:
                                break
                        except Exception:
                            time.sleep(.1)
                    else:
                        raise AssertionError(Path(directory, 'server.log').read_text()[-3000:])
                    data(context.request.post(base + '/api/access/free-play', data={'username': USERNAME, 'password': PASSWORD}))
                    session = data(context.request.get(base + '/api/market/session'))
                    # The production server enables its real geometry worker.
                    # An independent public projection starts its cold route
                    # calculation while health remains served by the event loop.
                    projection_url = base + '/api/world-supply/deliveries?mapId=' + fixture['mapId']
                    with ThreadPoolExecutor(max_workers=1) as pool:
                        pending_projection = pool.submit(lambda: json.loads(urlopen(projection_url, timeout=30).read()))
                        time.sleep(.03)
                        projection_pending_at_health = not pending_projection.done()
                        health_started = time.monotonic()
                        assert context.request.get(base + '/api/health', timeout=3000).ok
                        health_latency_ms = (time.monotonic() - health_started) * 1000
                        initial_projection = pending_projection.result(timeout=30)
                    assert initial_projection.get('success') is not False, initial_projection
                    assert health_latency_ms < 2000, health_latency_ms
                    initial = state(context, base)
                    assert stock(initial, fixture) == 0
                    assert route_row(initial, fixture)['status'] == 'blocked'
                    assert 'temporarily unavailable' not in route_row(initial, fixture).get('reason', '').lower(), route_row(initial, fixture)
                    assert all(task['phase'] == 'blocked' for task in task_rows(initial, fixture))
                    assert sum(row['remainingQuantity'] for row in initial['portEscrow'] if row['shipmentId'] == fixture['shipmentId']) == fixture['quantity']
                    page = context.new_page()
                    page.set_default_timeout(20000)
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.route('https://**/*', lambda route: route.abort())
                    url = base + '/model-explorer.html?environment=' + fixture['mapId'] + '&autoplay=1&supplyDeed=' + fixture['deedId']
                    page.goto(url, wait_until='domcontentloaded', timeout=90000)
                    page.wait_for_function('(id)=>window.MuzikazHouseExplorer?.snapshot().roomId===id&&window.MuzikazHouseExplorer.snapshot().serverPlayerInitialized', arg=fixture['mapId'], timeout=90000)
                    panel = page.locator('#world-supply-panel')
                    expect(panel).to_be_visible(timeout=30000)
                    expect(panel.locator('[data-deed]')).to_have_value(fixture['deedId'])
                    expect(panel.locator('[data-deed-delivery-route]')).to_contain_text('on hold', timeout=30000)
                    page.wait_for_function('window.MuzikazHouseExplorer.snapshot().deedDelivery.dropoffs>0', timeout=30000)
                    blocked_revision = route_row(state(context, base), fixture)['revision']
                    page.screenshot(path=str(ARTIFACTS / 'deed-doorstep-blocked.png'))
                    print('Port escrow holds exact cargo; the blocked current-map route and marked deed drop-off are visible.', flush=True)

                    room = data(context.request.get(base + '/api/rooms/' + fixture['mapId'] + '/objects'))
                    for object_id in fixture['blockerIds']:
                        data(context.request.post(base + '/api/rooms/' + fixture['mapId'] + '/objects', headers={'X-CSRF-Token': session['csrfToken']}, data={'id': object_id, 'revision': room['objects'][object_id]['revision'], 'action': 'delete'}))
                    resumed = state(context, base)
                    ready_route = route_row(resumed, fixture)
                    assert ready_route['status'] == 'ready', ready_route
                    assert ready_route['revision'] != blocked_revision
                    assert ready_route['dropoff']['kind'] == 'doorstep'
                    assert ready_route['truckDistanceMeters'] > 5 and ready_route['courierDistanceMeters'] > 0
                    assert all(task['phase'] in ['awaiting-truck', 'loading', 'driving'] for task in task_rows(resumed, fixture))
                    departures = sorted(task['departureAt'] for task in task_rows(resumed, fixture))
                    assert departures[1] - departures[0] >= 1500, departures
                    assert stock(resumed, fixture) == 0, 'Opening the route starts delivery; it cannot instantly award all the held stock.'
                    panel.locator('[data-delivery-refresh]').click()
                    expect(panel.locator('[data-deed-delivery-route]')).to_contain_text('Clear approach', timeout=30000)
                    page.keyboard.press('Escape')
                    page.wait_for_function('window.MuzikazHouseExplorer.snapshot().deedDelivery.vehicles.some(vehicle=>!vehicle.isCourier&&vehicle.loaded)', timeout=20000)
                    page.screenshot(path=str(ARTIFACTS / 'deed-doorstep-truck-in-world.png'))

                    seen_phases = set()
                    positions = {}
                    deadline = time.monotonic() + 75
                    while time.monotonic() < deadline:
                        current = state(context, base)
                        tasks = task_rows(current, fixture)
                        seen_phases.update(task['phase'] for task in tasks)
                        for task in tasks:
                            if task.get('truckPosition'):
                                positions.setdefault(task['id'], set()).add(tuple(round(task['truckPosition'][axis], 2) for axis in ['x', 'y', 'z']))
                        delivered_quantity = sum(task['quantity'] for task in tasks if task['phase'] == 'delivered')
                        assert stock(current, fixture) == delivered_quantity, 'Only confirmed doorstep quantities can enter the deed inventory.'
                        if all(task['phase'] == 'delivered' for task in tasks):
                            break
                        time.sleep(.45)
                    else:
                        raise AssertionError('Automatic delivery did not finish: ' + json.dumps(tasks))
                    assert 'driving' in seen_phases and 'courier' in seen_phases, seen_phases
                    assert any(len(samples) > 1 for samples in positions.values()), positions
                    assert stock(current, fixture) == fixture['quantity']
                    receipts = [row for row in current['dropoffReceipts'] if row['shipmentId'] == fixture['shipmentId']]
                    assert sorted(row['quantity'] for row in receipts) == [1, 4]
                    assert all(row['dropoffId'] == ready_route['dropoff']['id'] and row['routeRevision'] == ready_route['revision'] for row in receipts)
                    assert next(row for row in current['orders'] if row['id'] == fixture['orderId'])['phase'] == 'delivered'
                    repeated = state(context, base)
                    assert stock(repeated, fixture) == fixture['quantity']
                    assert len([row for row in repeated['dropoffReceipts'] if row['shipmentId'] == fixture['shipmentId']]) == 2
                    public = data(context.request.get(base + '/api/world-supply/deliveries?mapId=' + fixture['mapId']))
                    for record in public.get('vehicles', []) + public.get('couriers', []):
                        assert not {'itemId', 'itemName', 'quantity', 'ownerId', 'orderId'}.intersection(record), record
                    page.get_by_role('button', name='World item factory', exact=True).click()
                    expect(panel).to_be_visible()
                    panel.locator('[data-delivery-refresh]').click()
                    expect(panel.locator('[data-orders]')).to_contain_text('Delivered', timeout=30000)
                    page.screenshot(path=str(ARTIFACTS / 'deed-doorstep-delivered-desktop.png'))
                    print('Two exact truck loads drove the recalculated route, completed courier handover, and credited five units once.', flush=True)

                    phone = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=1, service_workers='block', reduced_motion='reduce', storage_state=context.storage_state())
                    mobile = phone.new_page()
                    mobile.set_default_timeout(20000)
                    mobile.on('pageerror', lambda error: errors.append(str(error)))
                    mobile.route('https://**/*', lambda route: route.abort())
                    mobile.goto(url, wait_until='domcontentloaded', timeout=90000)
                    mobile.wait_for_function('window.MuzikazHouseExplorer?.snapshot().serverPlayerInitialized', timeout=90000)
                    mobile_panel = mobile.locator('#world-supply-panel')
                    expect(mobile_panel).to_be_visible(timeout=30000)
                    expect(mobile_panel.locator('[data-deed-delivery-route]')).to_contain_text('Doorstep drop-off', timeout=30000)
                    expect(mobile_panel.locator('[data-orders]')).to_contain_text('Delivered', timeout=30000)
                    assert mobile.evaluate('document.documentElement.scrollWidth<=innerWidth')
                    assert mobile_panel.evaluate('(node)=>node.scrollWidth<=node.clientWidth+1')
                    mobile.screenshot(path=str(ARTIFACTS / 'deed-doorstep-delivered-mobile.png'))
                    assert not errors, errors
                    server_log = Path(directory, 'server.log').read_text()
                    assert 'ERR_WORKER_INVALID_EXEC_ARGV' not in server_log and 'Cannot find module' not in server_log, server_log[-3000:]
                    (ARTIFACTS / 'deed-doorstep-browser.json').write_text(json.dumps({'mapId': fixture['mapId'], 'deedId': fixture['deedId'], 'truckQuantities': [1, 4], 'observedPhases': sorted(seen_phases), 'deliveredQuantity': stock(repeated, fixture), 'dropoffReceipts': len(receipts), 'routeRecalculated': True, 'backgroundRouting': True, 'projectionPendingAtHealth': projection_pending_at_health, 'healthLatencyMs': round(health_latency_ms, 1), 'truckDepartureHeadwayMs': departures[1] - departures[0], 'desktop': True, 'mobile': True, 'pageErrors': errors}, indent=2))
                    phone.close()
                    context.close()
                    print('Fresh phone context retains the deed route, delivered order and stock without layout overflow.', flush=True)
                finally:
                    browser.close()
        except Exception:
            try:
                page.screenshot(path=str(ARTIFACTS / 'deed-doorstep-failure.png'))
            except Exception:
                pass
            print(Path(directory, 'server.log').read_text()[-6000:])
            raise
        finally:
            server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait()
