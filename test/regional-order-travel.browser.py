"""Live regional atlas, multiple deed routes, and receipt-backed order quests.

The browser uses real public directory and authenticated wallet APIs. Map travel
uses the supported local-map floor action and actual gateway trip tokens; no
player pose, freight receipt, order phase, or inventory is written by the test.
"""
import json
import math
import os
import socket
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse
from uuid import uuid4

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = Path('/workspace/scratch')
ARTIFACTS.mkdir(parents=True, exist_ok=True)
os.chdir(ROOT)


def data(response):
    assert response.ok, f'{response.status}: {response.text()[:3000]}'
    value = response.json()
    assert value.get('success') is not False, value
    return value['data']


SEED = r'''
import {MzkAccountStore} from './loadout-code-store.mjs';
import {UserJsonDatabase} from './user-json-database.mjs';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const directory=process.argv[2],accounts=new MzkAccountStore(join(directory,'accounts.json')),database=new UserJsonDatabase(join(directory,'users.json'));
const account=await accounts.freePlayLogin('RegionalTraveler','regional-traveler-password'),wallet=(await database.ensureAccount(account)).walletId;
await database.transaction(data=>{data.users[wallet].tokens.MZK=1000000;return {};});
const scene={id:'regional-travel-base',name:'Regional Delivery Home',version:3,layout:'grand-floor',mapSize:160,streets:[{id:'regional-deed-road',name:'Regional Home Road',from:{x:0,z:60},to:{x:0,z:-24},width:8}],layoutMeta:{delivery:{hub:{name:'Regional truck receiving bay',position:{x:0,y:0,z:60}},dropoff:{name:'Regional home front door',kind:'doorstep',position:{x:0,y:0,z:-28}}}},objects:[{id:'regional-front-door',modelId:'glass-door',name:'Front door',position:{x:0,y:0,z:-29.5},functionalSettings:{behavior:'door'}}],gameplay:{multiplayer:true}};
const base={id:scene.id,name:scene.name,source:'custom-builder',visibility:'public',ownerId:'account:'+account.accountId,ownerName:'RegionalTraveler',proceduralLand:true,builderScene:scene,contentUpdatedAt:'regional-home-v1'};
await writeFile(join(directory,'custom-maps.json'),JSON.stringify([base,{...base,id:'regional-hidden-map',name:'Private regional address',visibility:'private'}]));
const deeds=[];
for(const [worldId,name]of [['volt-city','Volt City Delivery Home'],['echo-gardens','Echo Gardens Delivery Home']]){
 const claim=await database.claimLand({walletId:wallet,worldId,name,priceMzk:0,requestId:'regional-'+worldId});
 const deed=await database.configurePlot(wallet,claim.id,{environmentId:base.id,name});
 deeds.push({id:deed.id,mapId:'plot-'+deed.id,name,worldId});
}
console.log(JSON.stringify({deeds,itemId:'tool:scanner'}));
'''


def main():
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        port = probe.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    with tempfile.TemporaryDirectory(prefix='regional-order-travel-') as directory:
        fixture = json.loads(subprocess.run(['node', '--input-type=module', '-', directory], input=SEED, text=True, check=True, capture_output=True).stdout.strip().splitlines()[-1])
        with open(Path(directory) / 'server.log', 'w') as log:
            server = subprocess.Popen(['node', 'server.mjs'], env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory, 'MUZIKAZ_STATIC_SOURCE': 'repository'}, stdout=log, stderr=log)
            try:
                with sync_playwright() as p:
                    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                    try:
                        context = browser.new_context(viewport={'width':1280,'height':950}, service_workers='block', reduced_motion='reduce')
                        guest = browser.new_context(service_workers='block')
                        for _ in range(120):
                            try:
                                if context.request.get(base + '/api/health', timeout=1000).ok:
                                    break
                            except Exception:
                                time.sleep(.1)
                        else:
                            raise AssertionError(Path(directory, 'server.log').read_text()[-4000:])
                        data(context.request.post(base + '/api/access/free-play', data={'username':'RegionalTraveler','password':'regional-traveler-password'}))
                        session = data(context.request.get(base + '/api/market/session'))
                        headers = {'X-CSRF-Token': session['csrfToken']}
                        atlas = data(guest.request.get(base + '/api/world-atlas'))
                        graph = atlas['connectivity']
                        places = {place['mapId']:place for place in graph['locations']}
                        assert len(graph['regions']) == 8
                        assert 'regional-hidden-map' not in places
                        for deed in fixture['deeds']:
                            assert places[deed['mapId']]['regionId'] == deed['worldId']
                            assert places[deed['mapId']]['kind'] == 'deed'
                        assert all(link['mode'] == 'map-transfer' for link in graph['links'])
                        assert {'road','boat','plane'}.issubset({link['mode'] for link in graph['localLinks']})
                        assert not any(place['kind']=='airfield' and place.get('portId')=='qeshm' for place in places['hormuz-shipping']['localPlaces'])

                        orders = []
                        for index,deed in enumerate(fixture['deeds']):
                            quote_data = data(context.request.post(base + '/api/world-supply/quote', headers=headers, data={'itemId':fixture['itemId'],'quantity':2}))
                            order = data(context.request.post(base + '/api/world-supply/order', headers=headers, data={'deedId':deed['id'],'itemId':fixture['itemId'],'quantity':2,'shippingMapId':'hormuz-shipping','contractId':'gulf-gateway','onwardMode':'air' if index==0 else 'road','expectedPriceMzk':quote_data['priceMzk'],'requestId':'regional-browser-'+str(index)}))
                            assert order['journey']['status'] == 'active'
                            assert order['journey']['destinationMapId'] == deed['mapId']
                            assert order['journey']['deliveredQuantity'] == 0
                            orders.append(order)
                        workspace = data(context.request.get(base + '/api/world-supply/workspace'))
                        owned = {order['id']:order for order in workspace['orders']}
                        assert {'factory','boat','plane','road','map-transfer','foot'}.issubset({stage['mode'] for stage in owned[orders[0]['id']]['journey']['stages']})
                        public = data(guest.request.get(base + '/api/world-supply'))
                        assert not any(order.get('journey') for order in public.get('orders',[]))
                        balance = data(context.request.get(base + '/api/wallet/state'))['tokens']['MZK']

                        # Real room transitions: enter a regional gateway and
                        # then its own deed building using server trip tokens.
                        command_count = 0
                        def command(map_id, action, **fields):
                            nonlocal command_count
                            command_count += 1
                            return data(context.request.post(base + '/api/rooms/'+quote(map_id,safe='')+'/gameplay', headers=headers, data={'action':action,'requestId':'regional-travel-'+str(command_count),'radToxEnabled':False,**fields}))
                        current = 'public-commons'
                        live = command(current, 'join')
                        target_deed = fixture['deeds'][0]['mapId']
                        district = next(row['districtId'] for row in atlas['locations'] if row['mapId']==target_deed)
                        for destination in [district,target_deed]:
                            gate = next(actor for actor in live['actors'].values() if (actor.get('worldGateway') or {}).get('destination')==destination)
                            position = gate['position']
                            entered = None
                            for dx,dz in [(0,-4),(0,4),(-4,0),(4,0),(0,-5.5)]:
                                response = context.request.post(base + '/api/rooms/'+quote(current,safe='')+'/gameplay', headers=headers, data={'action':'map-access','requestId':str(uuid4()),'position':{'x':position['x']+dx,'z':position['z']+dz},'radToxEnabled':False})
                                if not response.ok:
                                    continue
                                near = data(response)
                                player = near['players'][near['selfId']]
                                if math.hypot(player['position']['x']-position['x'],player['position']['z']-position['z'])>6:
                                    continue
                                entered = command(current,'interact',entityId=gate['id'])
                                break
                            assert entered, (current,destination,'No supported clear gateway approach')
                            travel = entered['result']['travel']
                            assert travel['from']==current and travel['to']==destination
                            live = command(destination,'join',travelFrom=current,travelToken=travel['token'])
                            reciprocal = next(actor for actor in live['actors'].values() if (actor.get('worldGateway') or {}).get('destination')==current)
                            arrived = live['players'][live['selfId']]['position']
                            assert math.hypot(arrived['x']-reciprocal['position']['x'],arrived['z']-reciprocal['position']['z']) < 12
                            current=destination
                        after_travel = data(context.request.get(base + '/api/world-supply/workspace'))
                        assert data(context.request.get(base + '/api/wallet/state'))['tokens']['MZK'] == balance
                        for order in orders:
                            saved = next(row for row in after_travel['orders'] if row['id']==order['id'])
                            assert saved['journey']['status']=='active' and saved['journey']['deliveredQuantity']==0
                            assert not next(stage for stage in saved['journey']['stages'] if stage['id']=='sea')['completedQuantity']
                            assert next(row for row in after_travel['maps'] if row['id']==saved['destinationMapId'])['stock'].get(fixture['itemId'],0)==0
                        print('Live region/deed gateways preserve counted orders: map visits credit neither stock nor delivery completion.',flush=True)

                        errors = []
                        for width,height in [(1280,950),(390,844)]:
                            page = context.new_page()
                            page.set_viewport_size({'width':width,'height':height})
                            page.on('pageerror',lambda error:errors.append(str(error)))
                            page.route('https://**/*',lambda route:route.abort())
                            page.route('**/__regional-travel*',lambda route:route.fulfill(content_type='text/html',body='<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;background:#14252d;color:white;font-family:sans-serif}main{padding:12px;box-sizing:border-box;max-width:100%;overflow-wrap:anywhere}button,select,input{font:inherit}#supply-stage{position:relative}</style><main><section id="regional-atlas"></section><section id="supply-stage"></section></main>'))
                            page.goto(base+'/__regional-travel?from=public-commons&stop='+quote(fixture['deeds'][0]['mapId'])+'&stop='+quote(fixture['deeds'][1]['mapId']))
                            page.evaluate('''async()=>{
                              const {mountWorldAtlas}=await import('/public/js/world-atlas.js');
                              const {mountWorldSupplyUI}=await import('/public/js/world-supply-ui.js');
                              const {SharedGameInventory}=await import('/public/js/shared-game-inventory.js');
                              window.regionalVisits=[];window.regionalLocalVisits=[];window.regionalWrites=[];
                              mountWorldAtlas(document.querySelector('#regional-atlas'),{onTravel:async url=>regionalVisits.push(url)});
                              const inventory=new SharedGameInventory({getMapId:()=> 'world-item-factory'});
                              window.regionalSupply=mountWorldSupplyUI({stage:document.querySelector('#supply-stage'),inventory,command:async(...args)=>regionalWrites.push(args),onNavigate:async id=>regionalVisits.push(id),onMap:point=>regionalLocalVisits.push(point)});
                              regionalSupply.update({players:{self:{health:100}}},'self',{id:'world-item-factory'});
                            }''')
                            atlas_root=page.locator('#regional-atlas')
                            expect(atlas_root.locator('[data-atlas-region] option')).to_have_count(9)
                            expect(atlas_root.locator('[data-atlas-journey-status]')).to_contain_text('2 planned stops')
                            expect(atlas_root.locator('[data-atlas-journey-stops] li')).to_have_count(2)
                            share = atlas_root.locator('[data-atlas-journey-link]').get_attribute('href')
                            assert parse_qs(urlparse(share).query)['stop']==[deed['mapId'] for deed in fixture['deeds']]
                            assert 'order' not in parse_qs(urlparse(share).query)
                            atlas_root.locator('[data-atlas-region]').select_option('volt-city')
                            visible_ids=atlas_root.locator('[data-atlas-destination] option').evaluate_all('(options)=>options.map(option=>option.value)')
                            assert visible_ids and all(places[map_id]['regionId']=='volt-city' for map_id in visible_ids)
                            assert atlas_root.locator('[data-atlas-destination] option[value="'+fixture['deeds'][0]['mapId']+'"]').count()==1
                            assert atlas_root.locator('[data-atlas-destination] option[value="'+fixture['deeds'][1]['mapId']+'"]').count()==0
                            atlas_root.locator('[data-atlas-region]').select_option('')
                            atlas_root.locator('[data-atlas-destination]').select_option('hormuz-shipping')
                            local=atlas_root.locator('[data-atlas-local-connections]')
                            expect(local).to_contain_text('Boats / shipping')
                            expect(local).to_contain_text('Planes / air freight')
                            # Transport locations must be discoverable before
                            # unrelated landmarks, and local routes retain
                            # their actual mode, endpoints and own-map points.
                            for port in ['jebel-ali','ras-tanura','bandar-abbas','qeshm','khasab','fujairah']:
                                expect(local.locator('[data-atlas-local-place="port:'+port+'"]').first).to_be_visible()
                            local_places={place['id']:place for place in places['hormuz-shipping']['localPlaces']}
                            for mode,label in [('boat','Boats / shipping'),('plane','Planes / air freight')]:
                                local.locator('[data-atlas-local-mode]').select_option(mode)
                                rendered=local.locator('[data-atlas-local-route]')
                                assert 0<rendered.count()<=8
                                ids=rendered.evaluate_all('(rows)=>rows.map(row=>row.dataset.atlasLocalRoute)')
                                source={route['id']:route for route in graph['localLinks'] if route['mapId']=='hormuz-shipping' and route['mode']==mode}
                                assert set(ids).issubset(source)
                                first=rendered.first
                                route=source[ids[0]]
                                expect(first).to_contain_text(label)
                                expect(first).to_contain_text(local_places[route['fromLocationId']]['name'])
                                expect(first).to_contain_text(local_places[route['toLocationId']]['name'])
                                first.locator('summary').click()
                                expect(first.locator('details li')).to_have_count(len(route['waypoints']))
                                assert all('Local X ' in text and ' / Z ' in text for text in first.locator('details li').all_text_contents())
                                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), (width,mode)
                            approved={place['id'] for place in places['hormuz-shipping']['localPlaces'] if place['kind']=='airfield'}
                            assert len(approved)==5
                            shown=set(local.locator('[data-atlas-local-place]').evaluate_all('(rows)=>rows.map(row=>row.dataset.atlasLocalPlace)'))
                            assert approved.issubset(shown)
                            page.screenshot(path=str(ARTIFACTS/f'regional-local-air-routes-{width}.png'))
                            atlas_root.locator('[data-atlas-destination]').select_option(fixture['deeds'][0]['mapId'])
                            atlas_root.locator('[data-atlas-enter]').click()
                            page.wait_for_function('regionalVisits.length===1')
                            traveled=parse_qs(urlparse(page.evaluate('regionalVisits[0]')).query)
                            assert traveled['from']==[fixture['deeds'][0]['mapId']]
                            assert traveled['stop']==[fixture['deeds'][1]['mapId']]

                            page.evaluate('(id)=>regionalSupply.open({deedId:id})',fixture['deeds'][0]['id'])
                            panel=page.locator('#world-supply-panel')
                            expect(panel).to_be_visible()
                            card=panel.locator('[data-order-id="'+orders[0]['id']+'"]')
                            expect(card.locator('[data-order-journey]')).to_have_attribute('data-journey-status','active')
                            expect(card.locator('[data-order-journey]')).to_contain_text('Delivery quest in progress')
                            card.locator('[data-order-journey] summary').click()
                            expect(card.locator('[data-journey-stage="sea"]')).to_contain_text('Boat')
                            expect(card.locator('[data-journey-stage="flight"]')).to_contain_text('Plane')
                            assert card.locator('[data-journey-stage="dropoff"]').get_attribute('data-stage-status')!='completed'
                            journey_link=card.locator('[data-journey-plan]').get_attribute('href')
                            assert set(parse_qs(urlparse(journey_link).query)).issubset({'from','stop'})
                            assert orders[0]['id'] not in journey_link
                            assert fixture['deeds'][0]['id'] not in journey_link.replace(fixture['deeds'][0]['mapId'],'')
                            card.locator('[data-journey-visit]').click()
                            page.wait_for_function('regionalVisits.length>1||regionalLocalVisits.length>0')
                            assert page.evaluate('regionalWrites.length')==0
                            assert not panel.evaluate('(node)=>node.open')
                            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), (width,page.evaluate('document.documentElement.scrollWidth'))
                            page.screenshot(path=str(ARTIFACTS/f'regional-order-travel-{width}.png'),full_page=True)
                            print(f'Regional atlas and receipt-backed order quests: {width}px boat/plane routes, region filter, multi-deed links and navigation passed.',flush=True)
                            page.close()
                        assert not errors,errors
                        final = data(context.request.get(base+'/api/world-supply/workspace'))
                        assert all(next(row for row in final['orders'] if row['id']==order['id'])['journey']['deliveredQuantity']==0 for order in orders)
                        assert data(context.request.get(base+'/api/wallet/state'))['tokens']['MZK']==balance
                        (ARTIFACTS/'regional-order-travel.json').write_text(json.dumps({'regions':len(graph['regions']),'maps':len(graph['locations']),'localLinks':len(graph['localLinks']),'deeds':[deed['mapId'] for deed in fixture['deeds']],'orders':len(orders),'gatewaysTraversed':2,'viewports':[1280,390],'errors':errors,'stockCreditedByVisits':0},indent=2))
                    finally:
                        browser.close()
            finally:
                server.terminate()
                server.wait(timeout=15)


if __name__=='__main__':
    main()
