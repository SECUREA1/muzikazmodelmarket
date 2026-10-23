"""Exercise the real mountain fly-in map, routes and quest directory on two screens."""
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
fixture = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#182c35;color:#efffff;font-family:system-ui}main{height:100vh;position:relative}</style></head><body></body></html>'

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                                    args=['--no-sandbox', '--enable-unsafe-swiftshader'])
        for width, height in ((1280, 900), (390, 844)):
            page = browser.new_page(viewport={'width': width, 'height': height},
                                    has_touch=width < 760, service_workers='block')
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.route('**/__mountain_fixture', lambda route: route.fulfill(body=fixture, content_type='text/html'))
            page.goto(f'http://127.0.0.1:{server.server_port}/__mountain_fixture')
            page.evaluate('''async()=>{
                const {mountDistrictMap}=await import('/public/js/district-map.js');
                const {airportWorld}=await import('/airport-world.mjs');
                const {questCatalog}=await import('/public/js/quest-catalog.js');
                const stage=document.createElement('main');document.body.append(stage);
                window.world=airportWorld();window.commands=[];
                window.map=mountDistrictMap({stage,command:async(action,fields)=>{
                    commands.push({action,...fields});return {result:{message:'Assignment or route accepted.'}};
                },fetchAtlas:async()=>({locations:[]})});
                const plane={id:'plane',modelId:'diamond-da40',active:true,health:400,holderId:'pilot',position:{x:40,y:.4,z:0},rotation:{y:0},flight:{airborne:false,speed:0}};
                map.update(world);map.updateLive({serverTime:100000,actors:{plane},questOffers:questCatalog(world),players:{pilot:{id:'pilot',username:'Mountain Pilot',position:{...plane.position},vehicleId:plane.id}}},'pilot');
            }''')
            page.locator('.district-map-toggle').click()
            page.wait_for_selector('[data-vehicle-destination="mountain-runway"]')
            assert page.locator('[data-vehicle-destination]').count() == 4
            for name in ('Alpine Ridge Campground', 'Alpine Ridge Lodge', 'Alpine Valley Lookout'):
                assert page.locator('[data-local-map-plan] svg text').filter(has_text=name).count() == 1, name
                assert page.locator('.local-map-directory-list summary').filter(has_text=name).count() == 1, name
            page.locator('[data-vehicle-destination="mountain-runway"]').click()
            assert page.evaluate('commands.at(-1)') == {'action': 'vehicle-navigate', 'destinationId': 'mountain-runway'}
            assert page.locator('.district-map-dialog').is_visible()
            page.screenshot(path=f'/workspace/mountain-fly-in-map-{width}.png')

            page.get_by_role('button', name='Quests and mission information', exact=True).click()
            page.get_by_label('Quest activity filter', exact=True).select_option('air')
            for quest_id, title in (('air-mountain-supply', 'Alpine Ridge supply flight'),
                                    ('air-mountain-rescue', 'Alpine Ridge camper evacuation')):
                accept = page.get_by_role('button', name='Accept ' + title, exact=True)
                assert accept.is_enabled()
                accept.click()
                assert page.evaluate('commands.at(-1)') == {'action': 'vehicle-mission', 'operation': 'start', 'questId': quest_id}
            page.screenshot(path=f'/workspace/mountain-fly-in-quests-{width}.png')
            box = page.locator('.district-map-dialog').bounding_box()
            assert box['x'] >= 0 and box['y'] >= 0 and box['x'] + box['width'] <= width + 1 and box['y'] + box['height'] <= height + 1, box
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            page.locator('.district-map-dialog').get_by_role('button', name='Close', exact=True).click()
            page.wait_for_function("document.querySelector('.district-map-toggle').getAttribute('aria-expanded')==='false'")
            assert not errors, errors
            print({'viewport': [width, height], 'routes': 4, 'mountain_markers': 3, 'mountain_quest_accepts': 2}, flush=True)
            page.close()

        # Render the actual catalog models and terrain for a reviewable scene,
        # applying the same authored scale/base alignment as the game loader.
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.route('**/__mountain_fixture', lambda route: route.fulfill(body=fixture, content_type='text/html'))
        page.goto(f'http://127.0.0.1:{server.server_port}/__mountain_fixture')
        scene_stats = page.evaluate('''async()=>{
            const T=await import('/public/vendor/three/three.module.min.js');
            const {airportWorld}=await import('/airport-world.mjs');
            const {createBuilderLand}=await import('/public/js/environments/builder-land.js');
            const {createBuilderModel,updateBuilderModels}=await import('/public/js/builder-models-3d.js');
            const {placementBounds}=await import('/public/js/placed-item-collision.js');
            const world=airportWorld(),renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
            renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;
            renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;document.body.append(renderer.domElement);
            const scene=new T.Scene();scene.background=new T.Color('#bdd6e3');scene.fog=new T.Fog('#bdd6e3',700,1700);
            scene.add(new T.HemisphereLight('#fff7eb','#5c7058',2.2));const sun=new T.DirectionalLight('#fff0d7',2.7);sun.position.set(300,600,-150);scene.add(sun);
            const land=createBuilderLand(world);scene.add(land);let count=0;
            for(const item of world.builderScene.objects.filter(item=>/^airport-(alpine-|mountain-)/.test(item.id))){
                const root=createBuilderModel(item.modelId);if(!root)throw Error('Missing model '+item.modelId);
                root.position.set(item.position.x,item.position.y,item.position.z);root.rotation.set(item.rotation.x,item.rotation.y,item.rotation.z);
                const clamp=value=>Math.max(.04,Math.min(20,Number(value)||1));root.scale.multiply(new T.Vector3(clamp(item.scale.x),clamp(item.scale.y),clamp(item.scale.z)));root.updateMatrixWorld(true);
                const bounds=placementBounds(T,root);if(!bounds.isEmpty()&&!['aircraft-origin','waterline'].includes(item.placementAnchor))root.position.y+=item.position.y-bounds.min.y;
                scene.add(root);count++;
            }
            const plane=createBuilderModel('piper-cub');plane.position.set(599,.4,-500);scene.add(plane);
            updateBuilderModels(scene,1.5);const camera=new T.PerspectiveCamera(48,innerWidth/innerHeight,.1,2400);
            window.renderMountain=(close=false)=>{camera.position.set(...(close?[570,58,-355]:[980,390,-140]));camera.lookAt(...(close?[510,2,-466]:[575,9,-550]));renderer.render(scene,camera);};
            renderMountain();return {objects:count,triangles:renderer.info.render.triangles,calls:renderer.info.render.calls};
        }''')
        assert scene_stats['objects'] > 150 and scene_stats['triangles'] > 10000, scene_stats
        page.screenshot(path='/workspace/mountain-fly-in-scene.png')
        page.evaluate('renderMountain(true)')
        page.screenshot(path='/workspace/mountain-fly-in-camp.png')
        assert not errors, errors
        print({'mountain_scene': scene_stats, 'screenshots': '/workspace/mountain-fly-in-*.png'}, flush=True)
        browser.close()
finally:
    server.shutdown()
