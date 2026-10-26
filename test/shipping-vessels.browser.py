"""Render cargo hulls and verify their playable bridge cameras in real WebGL."""
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
        page.evaluate('''async()=>{
          const THREE=await import('/public/vendor/three/three.module.min.js'),{createBuilderModel}=await import('/public/js/builder-models-3d.js'),{updateHarborBoat}=await import('/public/js/harbor-models.js'),{createHarborCamera}=await import('/public/js/harbor-camera.js');
          document.body.replaceChildren();document.body.style.cssText='margin:0;background:#a8ced5';
          const scene=new THREE.Scene();scene.background=new THREE.Color('#b5d5d9');scene.fog=new THREE.Fog('#b5d5d9',180,500);scene.add(new THREE.HemisphereLight(0xe9f4fa,0x7c7e6b,3));
          const sun=new THREE.DirectionalLight(0xffe2b9,3);sun.position.set(-15,35,20);scene.add(sun);
          const water=new THREE.Mesh(new THREE.PlaneGeometry(1000,1000),new THREE.MeshStandardMaterial({color:0x367f8a,roughness:.3,metalness:.22}));water.rotation.x=-Math.PI/2;water.position.y=-.18;scene.add(water);
          const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1100,700);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;document.body.append(renderer.domElement);
          const rig=new THREE.Group(),camera=new THREE.PerspectiveCamera(50,1100/700,.025,800);rig.add(camera);scene.add(rig);const controller=createHarborCamera({camera,playerRig:rig});let ship=null;
          window.showShipping=(id,helm=false)=>{if(ship)scene.remove(ship);ship=createBuilderModel(id);scene.add(ship);updateHarborBoat(ship,{cargoCount:4,speed:5,throttle:.7,rudder:.15,rpm:3200,wakeStrength:.6},2);const[w,h,l]=ship.userData.dimensions;
            if(helm){controller.update({boat:{id,modelId:id,rotation:{y:0}},model:ship,origin:new THREE.Vector3(),view:'helm',lookPitch:-.12,immediate:true});}else{controller.reset();camera.position.set(l*.65,h+8,l*.7);camera.lookAt(0,h*.3,0);camera.fov=50;camera.updateProjectionMatrix();}
            scene.updateMatrixWorld(true);renderer.render(scene,camera);return {modelId:ship.userData.modelId,watercraft:ship.userData.watercraft,cargoSlots:ship.userData.boatRig.cargoSlots.filter(s=>s.visible).length,camera:camera.position.toArray(),dimensions:[w,h,l],drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles};
          };
        }''')
        for model_id in ['shipping-feeder', 'shipping-container', 'shipping-tanker']:
            result = page.evaluate('(id)=>showShipping(id)', model_id)
            assert result['modelId'] == model_id and result['watercraft'], result
            assert 1000 < result['triangles'] < 100000 and result['drawCalls'] < 500, result
            if model_id != 'shipping-tanker':
                assert result['cargoSlots'] == 4, result
            page.screenshot(path=f'/tmp/{model_id}-quality.png')
            bridge = page.evaluate('(id)=>showShipping(id,true)', model_id)
            assert bridge['camera'][1] > 5, bridge
            page.screenshot(path=f'/tmp/{model_id}-bridge.png')
        assert not errors, errors
        browser.close()
        print('PASS: all three cargo ships, visible deck loads, instruments and bridge views render in WebGL without browser errors.')
finally:
    server.shutdown()
