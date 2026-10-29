from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os

os.chdir(Path(__file__).resolve().parents[1])


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
        for width, height in [(1280, 900), (390, 844)]:
            page = browser.new_page(viewport={'width': width, 'height': height})
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.route('**/waypoint-map-harness', lambda route: route.fulfill(content_type='text/html', body='<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#182534}.house-stage{position:relative;height:100vh;width:100%}</style><main class="house-stage"><canvas tabindex="0"></canvas></main>'))
            page.goto(f'http://127.0.0.1:{server.server_port}/waypoint-map-harness')
            page.evaluate('''async()=>{
              const T=await import('/public/vendor/three/three.module.min.js');
              const {mountDistrictMap}=await import('/public/js/district-map.js');
              const root=new T.Group();root.add(new T.Mesh(new T.BoxGeometry(10,1,10),new T.MeshBasicMaterial()));
              window.commands=[];window.directoryReads=0;
              window.waypointMap=mountDistrictMap({stage:document.querySelector('.house-stage'),getRoots:()=>[root],fetchAtlas:async()=>{directoryReads++;return {locations:[]};},command:async(action,fields)=>{commands.push({action,fields});return {};}});
              if(waypointMap.openAt({position:{x:1,z:2}})!==false)throw Error('Unready map accepted a waypoint');
              window.world={id:'courier-deed',name:'Courier district',proceduralLand:true,builderScene:{layout:'grand-floor',mapSize:256,objects:[],layoutMeta:{locations:[{id:'dispatch',name:'Dispatch station',x:40,y:0,z:-28,width:8,depth:8}]}}};
              waypointMap.update(world);waypointMap.updateLive({players:{self:{position:{x:5,y:0,z:5}}},actors:{}},'self');
              if(!waypointMap.openAt({locationId:'dispatch',name:'Collect order cargo'}))throw Error('Known dispatch waypoint rejected');
            }''')
            dialog = page.locator('.district-map-dialog')
            assert dialog.is_visible()
            page.get_by_role('button', name='2D plan', exact=True).click()
            page.wait_for_function("document.querySelector('[data-order-journey-waypoint]')?.getAttribute('transform')==='translate(40 -28)'")
            assert 'Collect order cargo' in page.locator('.local-map-selected').inner_text()
            assert page.locator('.local-map-selected button').count() == 0
            page.wait_for_function('directoryReads===1')
            assert page.evaluate("waypointMap.openAt({position:{x:-50,y:2,z:45},name:'Door delivery approach'})")
            assert page.locator('[data-order-journey-waypoint]').count() == 1
            assert page.locator('[data-order-journey-waypoint]').get_attribute('transform') == 'translate(-50 45)'
            assert page.evaluate('directoryReads') == 1
            assert not page.evaluate("waypointMap.openAt({position:{x:NaN,z:Infinity},name:'Invalid point'})")
            assert page.locator('[data-order-journey-waypoint]').get_attribute('transform') == 'translate(-50 45)'
            page.locator('[data-order-journey-waypoint]').click()
            assert page.evaluate('commands') == []
            page.get_by_role('button', name='3D map', exact=True).click()
            page.wait_for_selector('[data-map-tag="order-journey-waypoint"]', state='attached', timeout=60000)
            tag = page.locator('[data-map-tag="order-journey-waypoint"]')
            assert tag.get_attribute('data-world-x') == '-50'
            assert tag.get_attribute('data-world-y') == '2'
            assert tag.get_attribute('data-world-z') == '45'
            assert page.locator('[data-local-map-3d] canvas').count() == 1
            assert page.locator('.local-map-selected button').count() == 0
            assert page.evaluate('commands') == []
            assert dialog.evaluate('(el)=>el.scrollWidth<=el.clientWidth+1')
            page.get_by_role('button', name='Close', exact=True).click()
            assert page.evaluate("waypointMap.openAt({locationId:'dispatch',label:'Return to dispatch'})")
            assert dialog.is_visible()
            page.wait_for_function('directoryReads===2')
            assert 'Return to dispatch' in page.locator('.local-map-selected').inner_text()
            assert page.evaluate('commands') == []
            assert not errors, errors
            page.evaluate('waypointMap.dispose()')
            page.close()
        browser.close()
    print('Order map waypoints passed: desktop/mobile exact 2D and 3D marker, focus, single open, finite validation, no movement or completion commands.')
finally:
    server.shutdown()
