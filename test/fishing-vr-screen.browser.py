"""Render the real in-world fishing sports screen and exercise controller rays."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os

os.chdir(Path(__file__).resolve().parents[1])

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass
    def do_GET(self):
        if self.path == '/__fishing-vr-screen':
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            self.wfile.write(b'<!doctype html><body></body>')
        else:
            super().do_GET()

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
        page = browser.new_page(viewport={'width': 1100, 'height': 740})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/__fishing-vr-screen')
        page.evaluate('''async()=>{
          const THREE=await import('/public/vendor/three/three.module.min.js');
          const {createFishingBoat}=await import('/public/js/fishing-models.js');
          const {createFishingScene}=await import('/public/js/fishing-scene.js');
          const {fishingSeatPose}=await import('/public/js/harbor-camera.js');
          const {createFishingVRScreen}=await import('/public/js/fishing-vr-screen.js');
          document.body.replaceChildren();document.body.style.margin='0';
          const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(1100,740);renderer.setPixelRatio(1);document.body.append(renderer.domElement);
          const scene=new THREE.Scene();scene.background=new THREE.Color(0xb6d7dd);scene.add(new THREE.HemisphereLight(0xf0fbff,0x315247,2.8));
          const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(140,10,-30);scene.add(sun);
          const ocean=new THREE.Mesh(new THREE.PlaneGeometry(180,180),new THREE.MeshStandardMaterial({color:0x208c98,roughness:.25}));ocean.rotation.x=-Math.PI/2;ocean.position.set(145,-.01,-38);scene.add(ocean);
          const boat=createFishingBoat();boat.userData.builderObjectId='angler';boat.position.set(145,0,-38);scene.add(boat);
          const point={x:151.15,y:.05,z:-37.2},pose=fishingSeatPose({position:{x:145,y:0,z:-38},rotation:{y:0}},'starboard',point);
          const camera=new THREE.PerspectiveCamera(78,1100/740,.025,200);camera.position.set(pose.eye.x,pose.eye.y,pose.eye.z);camera.lookAt(point.x,point.y,point.z);scene.add(camera);
          const round={id:'cast',status:'reeling',side:'starboard',boatId:'angler',castPoint:point,tension:.65,progress:.48,reeling:true},visuals=createFishingScene(scene,{getRoots:()=>[boat]});visuals.update({players:{self:{position:{x:146,y:.55,z:-37},fishing:{session:round}}},actors:{angler:{position:{x:145,y:0,z:-38}}}});visuals.animate(1);
          window.actions=[];window.holds=[];window.vrFishingScreen=createFishingVRScreen({scene,camera,onAction:action=>actions.push(action),onReel:holding=>holds.push(holding)});window.screenState={enabled:true,playing:true,presenting:true,phase:'reeling',side:'starboard',boatId:'angler',boatPosition:{x:145,y:0,z:-38},anchorPosition:pose.eye,anchorYaw:pose.yaw,primaryEnabled:true,tension:.65,progress:.48,location:'Marina Fishing Grounds',message:'Hold Reel · automatic drag protects the line.'};vrFishingScreen.update(screenState);
          const ray=action=>{const origin=camera.getWorldPosition(new THREE.Vector3()),target=vrFishingScreen.root.getObjectByName('FISHING_VR_ACTION_'+action.toUpperCase()).getWorldPosition(new THREE.Vector3());return {origin,direction:target.sub(origin).normalize()};};
          vrFishingScreen.pointerMove(ray('auto'));vrFishingScreen.pointerDown(ray('auto'),'right');vrFishingScreen.pointerDown(ray('auto'),'left');vrFishingScreen.pointerUp('left');if(!vrFishingScreen.snapshot().reeling)throw Error('Other controller release interrupted fishing');vrFishingScreen.pointerUp('right');if(JSON.stringify(holds)!=='[true,false]')throw Error('VR trigger hold did not release cleanly');
          vrFishingScreen.update({...screenState,phase:'waiting',pending:true,primaryEnabled:false});vrFishingScreen.pointerDown(ray('exit'),'right');if(actions.at(-1)!=='exit')throw Error('Pending cast trapped the player away from the helm');
          vrFishingScreen.update(screenState);renderer.render(scene,camera);window.vrScene={renderer,scene,camera,round,visuals,ray};
        }''')
        page.screenshot(path='/tmp/fishing-vr-sports-screen.png')
        assert not errors, errors
        page.evaluate('''()=>{const {renderer,scene,camera,ray}=vrScene;const before=actions.length;vrFishingScreen.update({...screenState,menuOpen:true});if(vrFishingScreen.pointerDown(ray('auto')))throw Error('Hidden headset panel captured a ray');if(actions.length!==before)throw Error('Hidden panel performed a fishing action');vrFishingScreen.dispose();renderer.dispose();}''')
        browser.close()
        print('PASS: off-boat VR sports screen, live line/rod view, controller rays, independent hold release and pending-cast helm escape render and work')
finally:
    server.shutdown()
