"""Independent XR input races: released async actions and held reconnects.

Exercises the real controls module with Chromium WebXR event mocks. It does not
require, or claim testing with, a physical VR headset.
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/__fishing-xr-lifecycle-contract':
            body = b'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><main></main>'
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()

    def log_message(self, *args):
        pass


server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 900, 'height': 700})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/__fishing-xr-lifecycle-contract')
        result = page.evaluate('''async()=>{
          const THREE=await import('/public/vendor/three/three.module.min.js');
          const {mountXRGameControls}=await import('/public/js/xr-game-controls.js');
          const {requestGameInputRelease}=await import('/public/js/game-input-release.js');
          const assert=(condition,message)=>{if(!condition)throw Error(message);};
          const settle=async()=>{await Promise.resolve();await new Promise(resolve=>setTimeout(resolve,0));};
          Object.defineProperty(navigator,'xr',{configurable:true,value:{isSessionSupported:async()=>true}});
          const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),rig=new THREE.Group();scene.add(rig);rig.add(camera);camera.position.y=1.6;
          const controllers=[new THREE.Group(),new THREE.Group()];
          const sources=['left','right'].map(handedness=>({handedness,gamepad:{axes:[0,0,0,0],buttons:Array.from({length:6},()=>({pressed:false,value:0}))}}));
          const session=new THREE.EventDispatcher();session.visibilityState='visible';session.inputSources=sources.slice();
          const xr=new THREE.EventDispatcher();xr.isPresenting=true;xr.setReferenceSpaceType=()=>{};xr.getController=index=>controllers[index];xr.getCamera=()=>camera;xr.getSession=()=>session;
          const status=[],calls={start:0,end:0,grip:0};let deferTrigger=true,rejectTrigger,rejectGrip;
          const controls=mountXRGameControls({renderer:{xr},scene,camera,rig,parent:document.querySelector('main'),menuOnEnter:()=>false,status:message=>status.push(message),
            onTrigger:()=>{calls.start++;return deferTrigger?new Promise((resolve,reject)=>rejectTrigger=reject):undefined;},
            onTriggerEnd:()=>calls.end++,onGrip:()=>{calls.grip++;return new Promise((resolve,reject)=>rejectGrip=reject);},
            menuItems:()=>[{label:'Fishing controls',run:()=>{}}]});
          controllers.forEach((controller,index)=>controller.dispatchEvent({type:'connected',data:sources[index]}));xr.dispatchEvent({type:'sessionstart'});
          const down=async()=>{sources[1].gamepad.buttons[0]={pressed:true,value:1};controllers[1].dispatchEvent({type:'selectstart'});await settle();};
          const up=async()=>{sources[1].gamepad.buttons[0]={pressed:false,value:0};controllers[1].dispatchEvent({type:'selectend'});await settle();};

          await down();assert(calls.start===1,'initial deferred trigger did not dispatch');
          requestGameInputRelease('map-travel');rejectTrigger(Error('obsolete fishing action failed'));await settle();
          assert(calls.end===1,'map travel did not release the trigger');
          assert(!controls.menuOpen&&status.length===0,'an obsolete trigger failure reopened the VR menu or replaced the current status');
          deferTrigger=false;await up();await down();assert(calls.start===2,'fresh trigger failed after the cancelled request');await up();

          controllers[0].dispatchEvent({type:'squeezestart'});await settle();assert(calls.grip===1,'grip action did not dispatch');
          requestGameInputRelease('world-replacement');rejectGrip(Error('obsolete grip action failed'));await settle();
          assert(!controls.menuOpen&&status.length===0,'an obsolete grip failure reopened the VR menu or replaced the current status');

          await down();const beforeReconnect=calls.start;
          controllers[1].dispatchEvent({type:'disconnected'});await settle();
          controllers[1].dispatchEvent({type:'connected',data:sources[1]});
          controllers[1].dispatchEvent({type:'selectstart'});controls.update(.016);await settle();
          assert(calls.start===beforeReconnect,'a still-held trigger replayed an action when its controller reconnected');
          await up();await down();assert(calls.start===beforeReconnect+1,'a fresh press after reconnection did not resume normal play');await up();
          controls.dispose();assert(!scene.getObjectByName('MUZIKAZ_VR_GAME_MENU'),'disposed XR menu remains in the scene');
          return 'stale trigger/grip failures stay silent after map changes; controller reconnection requires a fresh trigger press';
        }''')
        assert not errors, errors
        browser.close()
        print('PASS: ' + result)
finally:
    server.shutdown()
    server.server_close()
