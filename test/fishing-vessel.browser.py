"""Render the finished Angler, articulated rods and both side camera poses."""
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
        page = browser.new_page(viewport={'width': 1000, 'height': 700})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
        result = page.evaluate('''async()=>{
          const THREE=await import('/public/vendor/three/three.module.min.js');
          const {createFishingBoat}=await import('/public/js/fishing-models.js');
          const {createFishingScene}=await import('/public/js/fishing-scene.js');
          const {createHarborCamera}=await import('/public/js/harbor-camera.js');
          document.body.replaceChildren();document.body.style.cssText='margin:0;background:#aacbd2';
          window.scene=new THREE.Scene();scene.background=new THREE.Color('#c1dbe0');
          scene.add(new THREE.HemisphereLight(0xeaf8ff,0x51726c,3));
          const sun=new THREE.DirectionalLight(0xffe7c2,3);sun.position.set(5,12,8);scene.add(sun);
          const water=new THREE.Mesh(new THREE.PlaneGeometry(120,120),new THREE.MeshStandardMaterial({color:0x2c7b85,roughness:.35,metalness:.15}));water.rotation.x=-Math.PI/2;water.position.y=-.05;scene.add(water);
          window.boat=createFishingBoat();boat.userData.builderObjectId='angler';scene.add(boat);
          window.renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1000,700);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;document.body.append(renderer.domElement);
          window.camera=new THREE.PerspectiveCamera(45,1000/700,.025,150);camera.position.set(8,5.6,8);camera.lookAt(0,.6,0);
          window.rig=new THREE.Group();scene.add(rig);rig.add(camera);window.controller=createHarborCamera({camera,playerRig:rig});
          window.visuals=createFishingScene(scene,{getRoots:()=>[boat]});window.snapshot={players:{self:{position:{x:1.15,y:.55,z:.8},fishing:{session:{id:'cast',side:'starboard',status:'reeling',reeling:true,boatId:'angler',castPoint:{x:6.15,y:.05,z:.8},tension:.55,progress:.4}}}},actors:{angler:{position:{x:0,y:0,z:0},rotation:{y:0}}}};
          visuals.update(snapshot);visuals.animate(1);visuals.animate(1.1);renderer.render(scene,camera);
          window.showSide=(side)=>{snapshot.players.self.fishing.session.side=side;const sign=side==='port'?-1:1;snapshot.players.self.fishing.session.castPoint={x:sign*6.15,y:.05,z:.8};visuals.update(snapshot);visuals.animate(2);controller.update({boat:{id:'angler',modelId:'harbor-fishing-boat',rotation:{y:0}},model:boat,origin:new THREE.Vector3(),view:'fishing-'+side,fishingTarget:snapshot.players.self.fishing.session.castPoint,immediate:true});renderer.render(scene,camera);const target=new THREE.Vector3(sign*6.15,.05,.8).project(camera);return {target:target.toArray(),origin:boat.position.toArray()};};
          return {joints:boat.userData.fishingRig.flexJoints.flat().length,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles};
        }''')
        assert result['joints'] == 16 and result['triangles'] > 1000, result
        page.screenshot(path='/tmp/fishing-vessel-quality.png')
        for side in ['port', 'starboard']:
            view = page.evaluate('(side)=>showSide(side)', side)
            assert abs(view['target'][0]) < .01 and abs(view['target'][1]) < .01, view
            assert view['origin'] == [0, 0, 0], view
            page.screenshot(path=f'/tmp/fishing-vessel-{side}.png')
        assert not errors, errors
        browser.close()
        print('PASS: finished fishing vessel, articulated rods, floats and both exact-target side cameras render without browser errors.')
finally:
    server.shutdown()
