"""Real public store addresses, own-wallet ordering and selected-door freight.

The fixture pays for a real factory order and records a verified internal sea
passage. Browsers can neither claim stock nor complete deliveries: the receiving
owner clears saved walls and the normal background road service delivers cargo.
"""
import json
import os
import socket
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = Path('/workspace/scratch')
SENDER = ('AddressSupplier', 'address-supplier-password')
OWNER = ('AddressStoreOwner', 'address-owner-password')
os.chdir(ROOT)
ARTIFACTS.mkdir(parents=True, exist_ok=True)


def data(response):
    assert response.ok, f'{response.status}: {response.text()[:2500]}'
    payload = response.json()
    assert payload.get('success') is not False, payload
    return payload['data']


def workspace(context, base, map_id=None):
    return data(context.request.get(base + '/api/world-supply/workspace' + ('?mapId=' + quote(map_id) if map_id else '')))


def stock(snapshot, fixture):
    return next(row['stock'] for row in snapshot['maps'] if row['id'] == fixture['mapId']).get(fixture['itemId'], 0)


def address(context, base, address_id):
    result = data(context.request.get(base + '/api/world-supply/addresses?addressId=' + quote(address_id, safe='')))
    return next(row for row in result['addresses'] if row['id'] == address_id)


def route(snapshot, fixture):
    return next(row for row in snapshot['deliveryRoutes'] if row.get('addressId') == fixture['addressId'])


def tasks(snapshot, fixture):
    return [row for row in snapshot['deliveryTasks'] if row['shipmentId'] == fixture['shipmentId']]


with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]
base = f'http://127.0.0.1:{port}'
with tempfile.TemporaryDirectory(prefix='store-address-browser-') as directory:
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
const directory=process.argv[2],accounts=new MzkAccountStore(join(directory,'accounts.json')),db=new UserJsonDatabase(join(directory,'users.json')),rooms=new SharedRoomStore(join(directory,'shared-rooms.json'));
const ownerAccount=await accounts.freePlayLogin('AddressStoreOwner','address-owner-password'),senderAccount=await accounts.freePlayLogin('AddressSupplier','address-supplier-password');
const owner=(await db.ensureAccount(ownerAccount)).walletId,sender=(await db.ensureAccount(senderAccount)).walletId,ownerActor='account:'+ownerAccount.accountId;
await db.transaction(data=>{for(const id of [owner,sender])data.users[id].tokens.MZK=1000000;data.users[owner].memory.profile={displayName:'Harbor Storekeeper'};data.users[sender].memory.profile={displayName:'Freight Supplier'};return {};});
const scene={id:'store-address-base',name:'Addressed Shops',version:3,layout:'grand-floor',mapSize:180,streets:[{id:'delivery-road',name:'Market Delivery Road',from:{x:0,y:0,z:68},to:{x:0,y:0,z:-16},width:8,speedLimitKph:20}],layoutMeta:{delivery:{hub:{name:'Receiving truck bay',position:{x:0,y:0,z:68}},dropoff:{name:'Default map entrance',kind:'plot-entrance',position:{x:0,y:0,z:58}}}},objects:[
 {id:'market-a',modelId:'general-store',name:'First Store',position:{x:-35,y:0,z:-35},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},functionalSettings:{behavior:'shop'}},
 {id:'market-b',modelId:'community-supermarket',name:'Second Store',position:{x:35,y:0,z:-35},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},functionalSettings:{behavior:'shop'}},
 {id:'private-store',modelId:'general-store',name:'Private Hidden Store',visibility:'private',hidden:true,position:{x:-35,y:0,z:30},functionalSettings:{behavior:'shop'}}
],gameplay:{multiplayer:true,friendlyFire:false}};
const authored={id:scene.id,name:scene.name,visibility:'public',playable:true,multiplayer:true,source:'custom-builder',ownerId:ownerActor,ownerName:'AddressStoreOwner',proceduralLand:true,spawn:{x:15,y:.02,z:-17},builderScene:scene,contentUpdatedAt:'store-address-v1'};
const claimed=await db.claimLand({walletId:owner,worldId:'store-address-home',name:'Harbor Retail Deed',priceMzk:0,requestId:'store-address-deed'}),deed=await db.configurePlot(owner,claimed.id,{environmentId:authored.id,name:'Harbor Retail Stores'});
let plot=memberPlotEnvironment(deed,[authored]),now=Date.now()-400000;const sea=shippingWorld(),collision=new ServerBuilderCollision();
const service=new WorldSupplyService(db,{now:()=>now,maps:async()=>[sea,authored,plot],rooms:async ids=>Object.fromEntries(await Promise.all(ids.map(async id=>[id,await rooms.get(id)]))),collision});
const first=(await service.addresses({mapId:plot.id})).addresses,targetBefore=first.find(row=>row.objectId==='market-b'),other=first.find(row=>row.objectId==='market-a');
if(!targetBefore||!other||first.some(row=>row.objectId==='private-store'))throw Error('Both public stores, but no hidden store, must receive addresses.');
scene.objects.find(row=>row.id==='market-b').position.x=42;authored.contentUpdatedAt='store-address-v2-moved';plot=memberPlotEnvironment(deed,[authored]);
const moved=(await service.addresses({mapId:plot.id})).addresses.find(row=>row.objectId==='market-b');
if(moved.id!==targetBefore.id||moved.revision===targetBefore.revision||moved.position.x!==42)throw Error('Moving a store must preserve its address identity and revise its current position.');
await writeFile(join(directory,'custom-maps.json'),JSON.stringify([authored]));
await rooms.update(plot.id,room=>{room.revision=4;room.objects={};for(const [index,x]of [-67.5,-22.5,22.5,67.5].entries()){const id='store-route-wall-'+index;room.objects[id]={id,ownerId:ownerActor,revision:index+1,materialId:'wall',position:[x,2.4,12],rotation:[0,0,0],scale:[22.5,2,4],paint:[]};}return room;});
await rooms.update('public-commons',room=>{room.simulation={actors:{'player-workshop':{id:'player-workshop',name:'Player Supply Workshop',modelId:'artisan-workshop',asset:{buildAssetId:'artisan-workshop'},spawned:true,active:true,ownerId:owner,position:{x:-32,y:0,z:24},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1}}}};return room;});
const item=GAME_ECONOMY.find(item=>item.buildAssetId==='harbor-skiff'),quantity=5,contract=SHIPPING_ROUTES.find(row=>row.id==='northern-materials');
const quote=await service.action(sender,'quote',{itemId:item.sku,quantity}),order=await service.action(sender,'order-address',{addressId:moved.id,itemId:item.sku,quantity,shippingMapId:sea.id,contractId:contract.id,expectedPriceMzk:quote.priceMzk,requestId:'store-address-paid-order'});
let snapshot=await service.state({walletId:sender,mapId:plot.id});now=snapshot.production.find(job=>job.id===order.productionId).readyAt;snapshot=await service.state({walletId:sender,mapId:plot.id});const shipment=snapshot.shipments.find(row=>row.orderId===order.id);
const duration=Math.max(180000,SHIPPING_RULES.loadingSeconds*((contract.units||4)*2-2)*1000+1000);now=Date.now()-duration;const player={shipping:{}},identity={walletId:sender};
await service.shippingAction(identity,{},player,sea,{operation:'reserve',shipmentId:shipment.id,contractId:contract.id});const startedAt=now,jobId='store-address-verified-sea';player.shipping.job={id:jobId,phase:'loading',contractId:contract.id,environmentId:sea.id,startedAt,deadline:startedAt+SHIPPING_RULES.contractLimitMs};await service.shippingAction(identity,{},player,sea,{operation:'bind',shipmentId:shipment.id,jobId});now=Date.now();
await service.deliver(identity,{type:'delivery',shipmentId:shipment.id,jobId,deliveryId:jobId,contractId:contract.id,cargoId:contract.cargoId,units:contract.units||4,quality:100,startedAt,departedAt:startedAt+10000,deliveredAt:now},sea);snapshot=await service.state({walletId:sender,mapId:plot.id});
const loads=snapshot.deliveryTasks.filter(row=>row.shipmentId===shipment.id);if(loads.length!==2||loads.some(row=>row.phase!=='blocked')||snapshot.maps.find(row=>row.id===plot.id).stock[item.sku])throw Error('Selected blocked store must retain exactly five units at port.');
if(order.ownerId!==sender||order.recipientId!==owner||order.addressId!==moved.id)throw Error('The paying sender and current store deed holder must remain distinct.');await rooms.flush();collision.clearWorlds();
console.log(JSON.stringify({mapId:plot.id,baseId:authored.id,deedId:deed.id,addressId:moved.id,otherAddressId:other.id,selectedDropoff:moved.dropoff,otherDropoff:other.dropoff,orderId:order.id,shipmentId:shipment.id,itemId:item.sku,quantity,owner,sender,ownerName:'Harbor Storekeeper',scene,blockerIds:['store-route-wall-0','store-route-wall-1','store-route-wall-2','store-route-wall-3']}));
'''
    seeded = subprocess.run(['node', '--input-type=module', '-', directory], input=seed, text=True, check=True, capture_output=True)
    fixture = json.loads(seeded.stdout.strip().splitlines()[-1])
    with open(Path(directory) / 'server.log', 'w') as log:
        server = subprocess.Popen(['node', 'server.mjs'], env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory, 'MUZIKAZ_STATIC_SOURCE': 'repository'}, stdout=log, stderr=log)
        page = None
        errors = []
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                try:
                    supplier = browser.new_context(viewport={'width': 1280, 'height': 950}, service_workers='block', reduced_motion='reduce')
                    owner = browser.new_context(service_workers='block')
                    guest = browser.new_context(service_workers='block')
                    for _ in range(120):
                        try:
                            if supplier.request.get(base + '/api/health', timeout=1000).ok:
                                break
                        except Exception:
                            time.sleep(.1)
                    else:
                        raise AssertionError(Path(directory, 'server.log').read_text()[-3000:])
                    for context, credentials in [(supplier, SENDER), (owner, OWNER)]:
                        data(context.request.post(base + '/api/access/free-play', data={'username': credentials[0], 'password': credentials[1]}))
                    sender_session = data(supplier.request.get(base + '/api/market/session'))
                    owner_session = data(owner.request.get(base + '/api/market/session'))
                    headers = {'X-CSRF-Token': sender_session['csrfToken']}
                    owner_headers = {'X-CSRF-Token': owner_session['csrfToken']}
                    public = data(guest.request.get(base + '/api/world-supply/addresses?mapId=' + quote(fixture['mapId'])))
                    selected = next(row for row in public['addresses'] if row['id'] == fixture['addressId'])
                    assert selected['owner']['name'] == fixture['ownerName']
                    assert selected['canOrder'] and selected['orderPolicy'] == 'any-signed-in-sender'
                    assert 'Market Delivery Road' in selected['addressLine'] and selected['dropoff']['position']['x'] == 42
                    assert not any(row.get('objectId') == 'private-store' for row in public['addresses'])
                    serialized = json.dumps(public)
                    assert fixture['owner'] not in serialized and fixture['sender'] not in serialized
                    assert not {'recipientId', 'ownerId', 'walletId', 'csrfToken'}.intersection(selected)
                    curated = data(guest.request.get(base + '/api/world-supply/addresses?mapId=public-commons'))['addresses']
                    assert any(row['kind'] == 'store' and row['owner']['kind'] == 'public' for row in curated)
                    placed = next(row for row in curated if row['objectId'] == 'player-workshop')
                    assert placed['owner']['name'] == fixture['ownerName']

                    baseline = data(supplier.request.get(base + '/api/wallet/state'))['tokens']['MZK']
                    denied = {'addressId': fixture['addressId'], 'itemId': fixture['itemId'], 'quantity': 1, 'requestId': 'address-guest-denied'}
                    assert guest.request.post(base + '/api/world-supply/order-address', data=denied).status == 401
                    no_csrf = supplier.request.post(base + '/api/world-supply/order-address', data=denied)
                    assert no_csrf.status in (401, 403) and no_csrf.json().get('code') == 'CSRF_INVALID', no_csrf.text()
                    forged = supplier.request.post(base + '/api/world-supply/order-address', headers=headers, data={**denied, 'addressId': 'address:missing-map:missing-store', 'requestId': 'address-forged-denied'})
                    assert forged.status in (404, 422), forged.text()
                    assert owner.request.post(base + '/api/world-supply/cancel', headers=owner_headers, data={'orderId': fixture['orderId'], 'requestId': 'receiver-cannot-cancel-sender'}).status == 403
                    assert data(supplier.request.get(base + '/api/wallet/state'))['tokens']['MZK'] == baseline

                    url = base + '/model-explorer.html?environment=world-item-factory&autoplay=1&supplyAddress=' + quote(fixture['addressId'], safe='') + '&supplyItem=' + quote(fixture['itemId'], safe='')
                    params = parse_qs(urlparse(url).query)
                    assert set(params) == {'environment', 'autoplay', 'supplyAddress', 'supplyItem'}
                    before = workspace(supplier, base)
                    page = supplier.new_page()
                    page.set_default_timeout(20000)
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    write_requests = []
                    page.on('request', lambda request: write_requests.append(request.url.split('?')[0]) if request.method == 'POST' else None)
                    page.route('https://**/*', lambda route: route.abort())
                    page.goto(url, wait_until='domcontentloaded', timeout=90000)
                    page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().serverPlayerInitialized', timeout=90000)
                    panel = page.locator('#world-supply-panel')
                    expect(panel).to_be_visible(timeout=30000)
                    expect(panel.locator('[data-address]')).to_have_value(fixture['addressId'], timeout=30000)
                    expect(panel.locator('[data-address-map]')).to_have_value(fixture['mapId'])
                    expect(panel.locator('[data-address-detail]')).to_contain_text('Second Store')
                    expect(panel.locator('[data-address-detail]')).to_contain_text(fixture['ownerName'])
                    assert data(supplier.request.get(base + '/api/wallet/state'))['tokens']['MZK'] == baseline, 'Opening a public address link cannot pay for production.'
                    assert len(workspace(supplier, base)['production']) == len(before['production'])
                    panel.locator('[data-quantity]').fill('2')
                    panel.locator('[data-quote]').click()
                    expect(panel.locator('[data-address-order]')).to_be_enabled(timeout=30000)
                    with page.expect_response(lambda response: response.request.method == 'POST' and response.url.split('?')[0].endswith('/api/world-supply/order-address'), timeout=30000) as pending_order:
                        panel.locator('[data-address-order]').click()
                    accepted = data(pending_order.value)
                    accepted_body = pending_order.value.request.post_data_json
                    assert accepted_body['expectedAddressRevision'] == selected['revision'], accepted_body
                    expect(panel.locator('[data-orders]')).to_contain_text('Second Store', timeout=30000)
                    after_order = workspace(supplier, base)
                    assert any(row['id'] == accepted['id'] for row in after_order['orders'])
                    assert accepted['addressId'] == fixture['addressId'] and accepted['ownerId'] == fixture['sender'] and accepted['recipientId'] == fixture['owner']
                    assert data(supplier.request.get(base + '/api/wallet/state'))['tokens']['MZK'] == baseline - accepted['priceMzk']
                    data(supplier.request.post(base + '/api/world-supply/cancel', headers=headers, data={'orderId': accepted['id'], 'requestId': 'cancel-ui-address-test'}))
                    assert data(supplier.request.get(base + '/api/wallet/state'))['tokens']['MZK'] == baseline
                    page.screenshot(path=str(ARTIFACTS / 'store-address-order-desktop.png'))
                    print('Public addresses identify recipients without wallets; factory links select the second store without charging and own-wallet ordering works.', flush=True)

                    # The owner moves the receiving store through the real map
                    # publication endpoint. The public identity stays stable.
                    moved_scene = fixture['scene']
                    next(row for row in moved_scene['objects'] if row['id'] == 'market-b')['position']['x'] = 46
                    data(owner.request.post(base + '/api/custom-maps', headers=owner_headers, data={'scene': moved_scene}))
                    moved = address(guest, base, fixture['addressId'])
                    assert moved['id'] == selected['id'] and moved['revision'] != selected['revision'] and moved['dropoff']['position']['x'] == 46
                    quote_count = sum(path.endswith('/api/world-supply/quote') for path in write_requests)
                    review_balance = data(supplier.request.get(base + '/api/wallet/state'))['tokens']['MZK']
                    panel.locator('[data-quote]').click()
                    expect(panel.locator('[data-status]')).to_contain_text('This delivery address changed', timeout=30000)
                    expect(panel.locator('[data-address-detail]')).to_contain_text('X 46.0')
                    expect(panel.locator('[data-address-order]')).to_be_disabled()
                    assert sum(path.endswith('/api/world-supply/quote') for path in write_requests) == quote_count, 'A changed receiver must be reviewed before even a quote request is sent.'
                    assert data(supplier.request.get(base + '/api/wallet/state'))['tokens']['MZK'] == review_balance
                    panel.locator('[data-quote]').click()
                    expect(panel.locator('[data-address-order]')).to_be_enabled(timeout=30000)
                    assert sum(path.endswith('/api/world-supply/quote') for path in write_requests) == quote_count + 1
                    assert data(supplier.request.get(base + '/api/wallet/state'))['tokens']['MZK'] == review_balance, 'Reviewing and repricing cannot start paid production.'
                    snapshot = workspace(supplier, base, fixture['mapId'])
                    assert stock(snapshot, fixture) == 0
                    assert all(row['phase'] == 'blocked' for row in tasks(snapshot, fixture))
                    data(owner.request.post(base + '/api/rooms/' + fixture['mapId'] + '/gameplay', headers=owner_headers, data={'action': 'join', 'requestId': 'owner-join-receiving-store', 'radToxEnabled': False}))
                    room = data(owner.request.get(base + '/api/rooms/' + fixture['mapId'] + '/objects'))
                    for object_id in fixture['blockerIds']:
                        data(owner.request.post(base + '/api/rooms/' + fixture['mapId'] + '/objects', headers=owner_headers, data={'id': object_id, 'revision': room['objects'][object_id]['revision'], 'action': 'delete'}))

                    phases = set()
                    deadline = time.monotonic() + 90
                    while time.monotonic() < deadline:
                        current = workspace(supplier, base, fixture['mapId'])
                        loads = tasks(current, fixture)
                        phases.update(row['phase'] for row in loads)
                        confirmed = sum(row['quantity'] for row in loads if row['phase'] == 'delivered')
                        assert stock(current, fixture) == confirmed, 'Sea/port/truck progress cannot credit a store before its door handover.'
                        if loads and all(row['phase'] == 'delivered' for row in loads):
                            break
                        time.sleep(.45)
                    else:
                        raise AssertionError('Selected-store freight did not finish: ' + json.dumps(loads))
                    assert 'driving' in phases and 'courier' in phases, phases
                    receipts = [row for row in current['dropoffReceipts'] if row['shipmentId'] == fixture['shipmentId']]
                    assert sorted(row['quantity'] for row in receipts) == [1, 4]
                    assert all(row['addressId'] == fixture['addressId'] for row in receipts)
                    assert all(abs(row['dropoff']['position']['x'] - 46) < .01 for row in receipts), receipts
                    assert all(abs(row['dropoff']['position']['x'] - fixture['otherDropoff']['position']['x']) > 30 for row in receipts)
                    assert stock(current, fixture) == 5 and stock(workspace(supplier, base), fixture) == 5
                    assert len([row for row in workspace(supplier, base)['dropoffReceipts'] if row['shipmentId'] == fixture['shipmentId']]) == 2
                    print('Current-map store movement retained its address; sea cargo reached the selected second door through two exact truck loads.', flush=True)

                    # Deleting an unrelated public store removes its address;
                    # completed receipts and the receiver's shared stock persist.
                    moved_scene['objects'] = [row for row in moved_scene['objects'] if row['id'] != 'market-a']
                    next(row for row in moved_scene['objects'] if row['id'] == 'market-b')['position']['x'] = 48
                    data(owner.request.post(base + '/api/custom-maps', headers=owner_headers, data={'scene': moved_scene}))
                    refreshed = data(guest.request.get(base + '/api/world-supply/addresses?mapId=' + quote(fixture['mapId'])))['addresses']
                    assert not any(row['id'] == fixture['otherAddressId'] for row in refreshed)
                    latest = next(row for row in refreshed if row['id'] == fixture['addressId'])
                    assert latest['dropoff']['position']['x'] == 48, 'Freshly published placement must supersede an older authored room actor.'
                    assert latest['revision'] != moved['revision']
                    assert stock(workspace(supplier, base), fixture) == 5

                    # Existing world stock follows the same selected store
                    # address when dispatched without another factory build.
                    expect(panel.locator('[data-address]')).to_have_value(fixture['addressId'])
                    panel.locator('[data-source]').select_option('world')
                    panel.locator('[data-quantity]').fill('1')
                    dispatch_count = sum(path.endswith('/api/world-supply/dispatch') for path in write_requests)
                    before_dispatch = workspace(supplier, base)
                    panel.locator('[data-dispatch]').click()
                    expect(panel.locator('[data-status]')).to_contain_text('This delivery address changed', timeout=30000)
                    expect(panel.locator('[data-address-detail]')).to_contain_text('X 48.0')
                    expect(panel.locator('[data-dispatch]')).to_be_enabled(timeout=30000)
                    assert sum(path.endswith('/api/world-supply/dispatch') for path in write_requests) == dispatch_count, 'A changed store cannot reserve cargo before review.'
                    review_dispatch = workspace(supplier, base)
                    assert len(review_dispatch['shipments']) == len(before_dispatch['shipments'])
                    assert review_dispatch['worldStock'][fixture['itemId']] == before_dispatch['worldStock'][fixture['itemId']]
                    reviewed_address = address(guest, base, fixture['addressId'])
                    with page.expect_response(lambda response: response.request.method == 'POST' and response.url.split('?')[0].endswith('/api/world-supply/dispatch'), timeout=30000) as pending_dispatch:
                        panel.locator('[data-dispatch]').click()
                    sent = data(pending_dispatch.value)
                    dispatch_body = pending_dispatch.value.request.post_data_json
                    assert dispatch_body['addressId'] == fixture['addressId'] and dispatch_body['destinationMapId'] == fixture['mapId'], dispatch_body
                    assert dispatch_body['expectedAddressRevision'] == reviewed_address['revision'], dispatch_body
                    assert sent['addressId'] == fixture['addressId'] and sent['sourceMapId'] == 'world' and sent['quantity'] == 1
                    assert stock(workspace(supplier, base), fixture) == 5, 'A queued direct shipment cannot credit its receiving store.'
                    panel.locator('[data-destination]').select_option('world')
                    expect(panel.locator('[data-address]')).to_have_value('')
                    expect(panel.locator('[data-address-order]')).to_be_hidden()

                    phone = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, service_workers='block', reduced_motion='reduce', storage_state=supplier.storage_state())
                    mobile = phone.new_page()
                    mobile.on('pageerror', lambda error: errors.append(str(error)))
                    mobile.route('https://**/*', lambda route: route.abort())
                    mobile.goto(url, wait_until='domcontentloaded', timeout=90000)
                    mobile.wait_for_function('window.MuzikazHouseExplorer?.snapshot().serverPlayerInitialized', timeout=90000)
                    mobile_panel = mobile.locator('#world-supply-panel')
                    expect(mobile_panel).to_be_visible(timeout=30000)
                    expect(mobile_panel.locator('[data-address]')).to_have_value(fixture['addressId'], timeout=30000)
                    expect(mobile_panel.locator('[data-address-detail]')).to_contain_text(fixture['ownerName'])
                    expect(mobile_panel.locator('[data-orders]')).to_contain_text('Delivered', timeout=30000)
                    assert mobile.evaluate('document.documentElement.scrollWidth<=innerWidth')
                    assert mobile_panel.evaluate('(node)=>node.scrollWidth<=node.clientWidth+1')
                    mobile.screenshot(path=str(ARTIFACTS / 'store-address-order-mobile.png'))
                    data(owner.request.put(base + '/api/market/listings', headers=owner_headers, data={'itemId': fixture['deedId'], 'priceMzk': 25, 'active': True}))
                    data(supplier.request.post(base + '/api/market/trades', headers=headers, data={'sellerId': fixture['owner'], 'itemId': fixture['deedId'], 'expectedPriceMzk': 25, 'requestId': 'store-address-deed-resale'}))
                    transferred = address(guest, base, fixture['addressId'])
                    assert transferred['id'] == selected['id'] and transferred['owner']['name'] == 'Freight Supplier', transferred
                    assert transferred['revision'] != moved['revision']
                    resale_balance = data(supplier.request.get(base + '/api/wallet/state'))['tokens']['MZK']
                    resale_production_count = len(workspace(supplier, base)['production'])
                    stale_owner_order = supplier.request.post(base + '/api/world-supply/order-address', headers=headers, data={'addressId': fixture['addressId'], 'itemId': fixture['itemId'], 'quantity': 1, 'expectedAddressRevision': reviewed_address['revision'], 'requestId': 'stale-recipient-after-resale'})
                    assert stale_owner_order.status == 409 and 'changed owner' in stale_owner_order.text(), stale_owner_order.text()
                    assert data(supplier.request.get(base + '/api/wallet/state'))['tokens']['MZK'] == resale_balance
                    assert len(workspace(supplier, base)['production']) == resale_production_count
                    historical = next(row for row in workspace(supplier, base)['orders'] if row['id'] == fixture['orderId'])
                    assert historical['address']['owner']['name'] == fixture['ownerName'], 'A deed resale cannot rewrite the original receiving receipt.'
                    assert stock(workspace(supplier, base), fixture) == 5
                    assert not errors, errors
                    (ARTIFACTS / 'store-address-shipping-browser.json').write_text(json.dumps({'addressId': fixture['addressId'], 'mapId': fixture['mapId'], 'recipientDisplay': fixture['ownerName'], 'senderIsRecipient': False, 'recipientAfterResale': transferred['owner']['name'], 'publicPrivacy': True, 'stableMovedAddress': True, 'deletedAddressRemoved': True, 'selectedDoorX': 46, 'truckQuantities': [1, 4], 'stockQuantity': 5, 'directDispatchAddress': sent['addressId'], 'expectedAddressRevisionSent': True, 'quoteReviewGuard': True, 'dispatchReviewGuard': True, 'resoldRecipientReviewGuard': True, 'staleSelectionCleared': True, 'observedPhases': sorted(phases), 'desktop': True, 'mobile': True, 'pageErrors': errors}, indent=2))
                    phone.close()
                    guest.close()
                    owner.close()
                    supplier.close()
                finally:
                    browser.close()
        except Exception:
            try:
                page.screenshot(path=str(ARTIFACTS / 'store-address-shipping-failure.png'))
            except Exception:
                pass
            print(Path(directory, 'server.log').read_text()[-7000:])
            raise
        finally:
            server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait()
