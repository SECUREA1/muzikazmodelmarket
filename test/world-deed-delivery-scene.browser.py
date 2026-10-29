"""Real native truck/courier rendering of authoritative doorstep projections."""
import functools
import http.server
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}'
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
        try:
            for mobile in [False, True]:
                page = browser.new_page(viewport={'width':390 if mobile else 1000,'height':844 if mobile else 700}, has_touch=mobile)
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.goto(base + '/README.md')
                page.set_content('<!doctype html><html><head><style>html,body{margin:0;background:#102631}canvas{display:block;width:100vw;height:100dvh}</style></head><body></body></html>')
                page.evaluate('''async base=>{
                  const THREE=await import(base+'/public/vendor/three/three.module.min.js');
                  const {createWorldDeedDeliveryScene}=await import(base+'/public/js/world-deed-delivery-scene.js');
                  const scene=new THREE.Scene();scene.background=new THREE.Color('#152b36');
                  const camera=new THREE.PerspectiveCamera(42,innerWidth/innerHeight,.1,200);camera.position.set(22,20,28);camera.lookAt(0,1,0);
                  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(1);document.body.append(renderer.domElement);
                  scene.add(new THREE.HemisphereLight(0xffffff,0x34465e,2.5));const sun=new THREE.DirectionalLight(0xfff4db,3);sun.position.set(10,20,8);scene.add(sun);
                  const ground=new THREE.Mesh(new THREE.BoxGeometry(55,.1,45),new THREE.MeshStandardMaterial({color:'#34585d'}));ground.position.y=-.1;scene.add(ground);
                  const building=new THREE.Mesh(new THREE.BoxGeometry(8,5,6),new THREE.MeshStandardMaterial({color:'#7c8f91'}));building.position.set(10,2.5,-8);scene.add(building);
                  const door=new THREE.Mesh(new THREE.BoxGeometry(1.7,2.6,.1),new THREE.MeshStandardMaterial({color:'#203c48'}));door.position.set(10,1.3,-4.9);scene.add(door);
                  window.projection={serverTime:10000,mapId:'plot-a',dropoffs:[{id:'door-a',deedId:'deed-a',kind:'door',mapId:'plot-a',position:{x:10,y:0,z:-3.8}}],routes:[{id:'route-a',mapId:'plot-a',revision:'v1',status:'ready',truckWaypoints:[{x:-15,y:0,z:5},{x:10,y:0,z:5},{x:10,y:0,z:0}],courierWaypoints:[{x:10,y:0,z:0},{x:10,y:0,z:-3.8}]}],vehicles:[{id:'truck-a',mapId:'plot-a',phase:'driving',position:{x:-15,y:0,z:5},stageStartedAt:10000,stageDurationMs:20000,stageProgress:0,waypoints:[{x:-15,y:0,z:5},{x:10,y:0,z:5},{x:10,y:0,z:0}]}],couriers:[{id:'courier-a',mapId:'plot-a',phase:'courier',position:{x:10,y:0,z:0},stageStartedAt:10000,stageDurationMs:8000,stageProgress:0,waypoints:[{x:10,y:0,z:0},{x:10,y:0,z:-3.8}]}]};
                  window.calls=[];window.deliverySignals=[];window.deliveryClock=0;window.deliveryDefer=false;
                  window.deliveryScene=createWorldDeedDeliveryScene({scene,inventory:{api:async(url,options)=>{calls.push(url);deliverySignals.push(options.signal);if(deliveryDefer)return await new Promise(resolve=>window.resolveDelivery=resolve);return structuredClone(projection);}},autoPoll:false,clock:()=>deliveryClock});
                  window.renderDelivery=()=>{deliveryScene.tick();renderer.render(scene,camera);};window.deliveryWorld=scene;window.deliveryRenderer=renderer;
                  deliveryScene.update({id:'public-commons'});await deliveryScene.refresh();if(calls.length)throw Error('An ordinary map subscribed to deed delivery polling.');
                  deliveryScene.update({id:'plot-a',memberPlot:true});await deliveryScene.refresh();
                }''', base)
                page.wait_for_function('deliveryScene.snapshot().vehicles.length===2&&deliveryScene.snapshot().vehicles.every(row=>row.loaded)', timeout=30000)
                page.evaluate('renderDelivery()')
                before = page.evaluate('deliveryScene.snapshot()')
                assert before['dropoffs'] == 1 and before['routes'] == 1 and before['visible']
                assert page.evaluate('deliveryWorld.getObjectByName("PROJECTED_DELIVERY_TRUCK").userData.modelId') == 'frontier-pickup'
                assert page.evaluate('deliveryWorld.getObjectByName("PROJECTED_DELIVERY_COURIER").userData.modelId') == 'scout-avatar'
                assert page.evaluate('deliveryWorld.getObjectByName("DEED_TRUCK_PATH").geometry.attributes.position.count') == 3
                assert page.evaluate('deliveryWorld.getObjectByName("CONFIRMED_DOORSTEP_PARCEL").visible') is False
                page.evaluate('deliveryClock=4000;renderDelivery()')
                moved = page.evaluate('deliveryScene.snapshot().vehicles.find(row=>row.id==="truck-a").position.x')
                assert moved > before['vehicles'][0]['position']['x']
                page.evaluate('deliveryClock=60000;renderDelivery()')
                frozen = page.evaluate('deliveryScene.snapshot().vehicles.find(row=>row.id==="truck-a").position.x')
                page.evaluate('deliveryClock=120000;renderDelivery()')
                assert page.evaluate('deliveryScene.snapshot().vehicles.find(row=>row.id==="truck-a").position.x') == frozen
                assert page.evaluate('deliveryScene.snapshot().vehicles.find(row=>row.id==="truck-a").phase') == 'driving'
                page.evaluate('''()=>{projection.serverTime=12000;projection.vehicles[0].phase='courier';projection.vehicles[0].position={x:10,y:0,z:0};deliveryScene.receive(projection);deliveryClock+=2000;renderDelivery();}''')
                assert page.evaluate('deliveryScene.snapshot().vehicles.find(row=>row.id==="truck-a").position') == {'x':10,'y':0,'z':0}, 'The truck must remain at the curb while the courier carries the parcel.'
                page.evaluate('''()=>{projection.serverTime=14000;projection.dropoffs[0].deliveredAt=14000;projection.vehicles=[];projection.couriers=[];deliveryScene.receive(projection);renderDelivery();}''')
                assert page.evaluate('deliveryWorld.getObjectByName("CONFIRMED_DOORSTEP_PARCEL").visible')
                assert page.evaluate('deliveryScene.snapshot().vehicles.length') == 0
                assert page.evaluate('calls.length') == 1, 'Rendering must never POST stock or completion actions.'
                assert page.evaluate('deliveryRenderer.info.render.calls') > 0
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
                artifacts = Path('/workspace/scratch')
                artifacts.mkdir(parents=True, exist_ok=True)
                page.screenshot(path=str(artifacts / ('deed-delivery-scene-mobile.png' if mobile else 'deed-delivery-scene-desktop.png')))
                page.evaluate('''async()=>{
                  deliveryScene.update({id:'public-commons'});await deliveryScene.refresh();
                  if(calls.length!==1)throw Error('An inactive ordinary world subscribed to freight.');
                  projection.mapId='public-commons';for(const row of [...projection.dropoffs,...projection.routes])row.mapId='public-commons';
                  projection.vehicles=[{id:'public-store-truck',mapId:'public-commons',phase:'driving',position:{x:-15,y:0,z:5},stageStartedAt:14000,stageDurationMs:20000,waypoints:[{x:-15,y:0,z:5},{x:10,y:0,z:0}]}];
                  deliveryScene.update({id:'public-commons'},{deliveryActivity:true});await deliveryScene.refresh();
                  deliveryScene.update({id:'public-commons'},{deliveryActivity:true});
                }''')
                page.wait_for_function('deliveryScene.snapshot().vehicles[0]?.loaded', timeout=30000)
                assert page.evaluate('calls.length') == 2, 'Repeated live snapshots cannot create per-frame supply requests.'
                assert page.evaluate('deliveryScene.snapshot().mapId') == 'public-commons'
                assert page.evaluate('deliveryWorld.getObjectByName("PROJECTED_DELIVERY_TRUCK").userData.modelId') == 'frontier-pickup'
                assert page.evaluate('deliveryWorld.getObjectByName("CONFIRMED_DOORSTEP_PARCEL").visible'), 'An ordinary address can render an authoritative parcel while freight is active.'
                page.evaluate('''()=>{deliveryDefer=true;window.pendingDelivery=deliveryScene.refresh();deliveryScene.update({id:'public-commons'},{deliveryActivity:false});}''')
                assert page.evaluate('deliverySignals.at(-1).aborted')
                page.evaluate('''async()=>{resolveDelivery(structuredClone(projection));await pendingDelivery;deliveryScene.update({id:'another-idle-map'});await deliveryScene.refresh();renderDelivery();}''')
                assert page.evaluate('calls.length') == 3
                assert page.evaluate('deliveryScene.snapshot().visible') is False
                assert page.evaluate('deliveryScene.snapshot().mapId') is None
                assert page.evaluate('deliveryScene.snapshot().vehicles.length') == 0
                page.evaluate('''async base=>{
                  deliveryDefer=false;
                  const {createBuilderModel}=await import(base+'/public/js/builder-models-3d.js');
                  const plane=createBuilderModel('diamond-da40');plane.name='ROOM_PILOT_AIRCRAFT';plane.position.set(-7,.4,-13);deliveryWorld.add(plane);window.existingPilotPlane=plane;
                  projection={mapId:'hormuz-shipping',serverTime:20000,dropoffs:[
                    {id:'port-bay',mapId:'hormuz-shipping',kind:'port-freight-bay',position:{x:-12,y:0,z:6},receivedAt:19000},
                    {id:'air-source',mapId:'hormuz-shipping',kind:'air-cargo-departure',position:{x:-10,y:0,z:-9}},
                    {id:'air-destination',mapId:'hormuz-shipping',kind:'air-cargo-arrival',position:{x:12,y:0,z:-9}},
                    {id:'duplicate-air-destination',mapId:'hormuz-shipping',kind:'air-cargo-arrival',position:{x:12,y:0,z:-9}}
                  ],routes:[
                    {id:'port-road',mapId:'hormuz-shipping',kind:'port-transfer',truckWaypoints:[{x:-12,y:0,z:6},{x:-12,y:0,z:-9},{x:-10,y:0,z:-9}]},
                    {id:'flight-route',mapId:'hormuz-shipping',airWaypoints:[{x:-10,y:0,z:-9},{x:-10,y:12,z:-14},{x:12,y:12,z:-14},{x:12,y:0,z:-9}]},
                    {id:'receiving-room-link',mapId:'hormuz-shipping',kind:'map-transfer',fromMapId:'hormuz-shipping',toMapId:'plot-a',truckWaypoints:[{x:12,y:0,z:-9},{x:10000,y:0,z:10000}]}
                  ],vehicles:[{id:'port-transfer-truck',mapId:'hormuz-shipping',phase:'driving',deliveryPhase:'port-transfer',position:{x:-12,y:0,z:6},stageStartedAt:20000,stageDurationMs:15000,waypoints:[{x:-12,y:0,z:6},{x:-12,y:0,z:-9},{x:-10,y:0,z:-9}]}],aircraft:[{id:'pilot-plane',mapId:'hormuz-shipping',modelId:'diamond-da40',position:{x:-7,y:.4,z:-13}}]};
                  deliveryScene.update({id:'hormuz-shipping'},{deliveryActivity:true});await deliveryScene.refresh();renderDelivery();
                }''', base)
                page.wait_for_function('deliveryScene.snapshot().vehicles[0]?.loaded', timeout=30000)
                page.evaluate('renderDelivery()')
                assert page.evaluate('deliveryScene.snapshot().airRoutes') == 1
                assert page.evaluate('deliveryScene.snapshot().intermediatePads') == 3
                assert page.evaluate('deliveryScene.snapshot().routes') == 2
                assert page.evaluate('deliveryWorld.getObjectsByProperty("name","ROOM_PILOT_AIRCRAFT").length') == 1
                assert page.evaluate('deliveryWorld.getObjectByName("DEED_AIR_PATH").geometry.attributes.position.count') == 4
                assert page.evaluate('deliveryWorld.getObjectByName("CONFIRMED_DOORSTEP_PARCEL")===undefined'), 'Port and apron pads cannot advertise final world-stock delivery.'
                assert page.evaluate('deliveryWorld.getObjectByName("DEED_DELIVERY_ROUTE_receiving-room-link")===undefined'), 'Room transfers must not draw a straight line through unrelated room coordinates.'
                textures = page.evaluate('deliveryRenderer.info.memory.textures')
                page.evaluate('''()=>{for(let i=0;i<30;i++){deliveryScene.receive(projection);renderDelivery();}}''')
                assert page.evaluate('deliveryRenderer.info.memory.textures') == textures, 'Unchanged flight projections must not allocate textures per frame.'
                page.screenshot(path=str(artifacts / ('strait-freight-scene-mobile.png' if mobile else 'strait-freight-scene-desktop.png')))
                page.evaluate('''async()=>{deliveryScene.update({id:'other-idle-map'});await deliveryScene.refresh();renderDelivery();if(deliveryWorld.getObjectByName('DEED_AIR_PATH'))throw Error('A departed room retained its flight path.');existingPilotPlane.removeFromParent();}''')
                page.evaluate('deliveryScene.dispose();deliveryRenderer.dispose();deliveryRenderer.forceContextLoss()')
                assert page.evaluate('deliveryWorld.getObjectByName("WORLD_DEED_DELIVERIES")===undefined')
                assert not errors, errors
                print(('Mobile' if mobile else 'Desktop') + ' delivery scene passed: native truck/courier, port transfer, air route/aprons without duplicate plane, bounded motion, activity gating and late-response cleanup.', flush=True)
                page.close()
        finally:
            browser.close()
finally:
    server.shutdown()
    server.server_close()
