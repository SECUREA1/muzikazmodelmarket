"""Render confirmed cargo transfers and connected commercial docks in real WebGL."""
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
        page = browser.new_page(viewport={'width': 1100, 'height': 700})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
        result = page.evaluate('''async()=>{
          const THREE=await import('/public/vendor/three/three.module.min.js'),{shippingWorld}=await import('/shipping-world.mjs'),{createHarborLand}=await import('/public/js/environments/harbor-land.js'),{createBuilderModel}=await import('/public/js/builder-models-3d.js'),{updateHarborBoat}=await import('/public/js/harbor-models.js'),{createShippingPortScene}=await import('/public/js/shipping-port-scene.js'),{shippingCommercialTerminals}=await import('/public/js/shipping-port-config.js');
          document.body.replaceChildren();document.body.style.cssText='margin:0;background:#acd1d7';
          const environment=shippingWorld(),terminal=shippingCommercialTerminals()[0],berth=terminal.berth;
          const scene=new THREE.Scene();scene.background=new THREE.Color('#a9cbd4');scene.fog=new THREE.Fog('#a9cbd4',500,1800);scene.add(new THREE.HemisphereLight(0xe9f5fa,0x6f775d,2.7));const sun=new THREE.DirectionalLight(0xffdfb8,3);sun.position.set(-900,120,150);scene.add(sun);scene.add(createHarborLand(environment));
          for(const item of environment.builderScene.objects){if(!item.id.startsWith('shipping-jebel-ali'))continue;const model=createBuilderModel(item.modelId);if(!model)throw Error(item.modelId+' unavailable');model.position.set(item.position.x,item.position.y,item.position.z);model.rotation.set(item.rotation.x,item.rotation.y,item.rotation.z);model.scale.set(item.scale.x,item.scale.y,item.scale.z);scene.add(model);}
          const ship=createBuilderModel('shipping-feeder');ship.position.set(berth.x,0,berth.z);ship.rotation.y=berth.yaw;scene.add(ship);updateHarborBoat(ship,{cargoCount:2,cargoPortCount:1,cargoStarboardCount:1,speed:0,anchor:true},0);
          const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1100,700);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;document.body.append(renderer.domElement);const camera=new THREE.PerspectiveCamera(48,1100/700,.05,2200);camera.position.set(berth.x+80,52,berth.z-90);camera.lookAt(berth.x-5,8,berth.z+28);renderer.render(scene,camera);const before=renderer.info.render.calls;
          const ports=createShippingPortScene(scene),snapshot={sequence:10,serverTime:1800,shipping:{enabled:true,environmentId:environment.id,rivals:[{id:'gulf-link',companyName:'Gulf Link Logistics',shipId:'rival-ship',phase:'loading',job:{originId:'jebel-ali',destinationId:'qeshm'},lastTransfer:{kind:'load',at:1000,endsAt:3000,side:'starboard',unitIndex:1}}],portEconomy:[{portId:'jebel-ali',stock:{'island-provisions':140},imports:4,exports:3}]},actors:{'rival-ship':{id:'rival-ship',modelId:'shipping-feeder',position:{x:berth.x,y:0,z:berth.z},rotation:{y:berth.yaw}}}};
          ports.update(snapshot,null,environment);ports.animate(.3);scene.updateMatrixWorld(true);renderer.render(scene,camera);const first=ports.snapshot();window.portProjection={ports,scene,renderer,camera,first};return {before,after:renderer.info.render.calls,triangles:renderer.info.render.triangles,first};
        }''')
        assert result['first']['enabled'] and len(result['first']['activeTransfers']) == 1, result
        assert result['first']['stockCrates'] == 7, result
        assert result['after'] - result['before'] <= 45, result
        page.screenshot(path='/tmp/shipping-live-terminal-depth.png')
        after = page.evaluate('''()=>{const p=portProjection;p.ports.animate(.7);p.renderer.render(p.scene,p.camera);return p.ports.snapshot();}''')
        assert after['activeTransfers'][0]['hook'] != result['first']['activeTransfers'][0]['hook'], after
        assert not errors, errors
        page.evaluate('''()=>{portProjection.ports.dispose();portProjection.renderer.render(portProjection.scene,portProjection.camera);}''')
        assert not errors, errors
        browser.close()
        print('PASS: connected commercial warehouses, batched live stock and confirmed cargo crane transfers render in WebGL with bounded draw calls.')
finally:
    server.shutdown()
