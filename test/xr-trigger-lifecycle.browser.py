"""Actual WebXR controls release held actions across controller and session boundaries.

Uses Chromium and the real controls module with WebXR event/controller mocks;
it does not require, or claim validation on, a physical headset.
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/__xr-trigger-lifecycle':
            body = b'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><main class="house-stage"></main>'
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
        page.goto(f'http://127.0.0.1:{server.server_port}/__xr-trigger-lifecycle')
        result = page.evaluate('''async()=>{
          const THREE=await import('/public/vendor/three/three.module.min.js');
          const {mountXRGameControls}=await import('/public/js/xr-game-controls.js');
          const {requestGameInputRelease}=await import('/public/js/game-input-release.js');
          const assert=(condition,message)=>{if(!condition)throw Error(message);};
          const settle=async()=>{await Promise.resolve();await new Promise(resolve=>setTimeout(resolve,0));};
          Object.defineProperty(navigator,'xr',{configurable:true,value:{isSessionSupported:async()=>true}});
          const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),rig=new THREE.Group();scene.add(rig);rig.add(camera);
          camera.position.set(0,1.65,0);
          const controllers=[new THREE.Group(),new THREE.Group()];controllers[0].position.x=-.2;controllers[1].position.x=.2;
          const sources=['left','right'].map(handedness=>({handedness,gamepad:{axes:[0,0,0,0],buttons:Array.from({length:6},()=>({pressed:false,value:0}))}}));
          const session=new THREE.EventDispatcher();session.visibilityState='visible';session.inputSources=sources;
          session.requestReferenceSpace=async()=>({});
          const xr=new THREE.EventDispatcher();xr.isPresenting=true;xr.setReferenceSpaceType=()=>{};xr.getController=index=>controllers[index];xr.getCamera=()=>camera;xr.getSession=()=>session;xr.setSession=async()=>{};
          session.end=async()=>{xr.isPresenting=false;xr.dispatchEvent({type:'sessionend'});};
          const calls={start:[],end:[],release:[],grip:[],exit:0,menu:0,moves:[],status:[]};let pendingPrimary=false,rejectPrimary=null;
          let menuRows=[{label:'Keep fish',run:()=>calls.menu++}];
          const controls=mountXRGameControls({renderer:{xr},scene,camera,rig,parent:document.querySelector('main'),
            onTrigger:(hand,ray,controller)=>{calls.start.push({hand,controller,ray});if(pendingPrimary){pendingPrimary=false;return new Promise((_resolve,reject)=>rejectPrimary=reject);}},
            onTriggerEnd:(hand,ray,controller,reason)=>calls.end.push({hand,controller,ray,reason}),
            onInputRelease:reason=>calls.release.push(reason),onGrip:hand=>calls.grip.push(hand),
            onMove:value=>calls.moves.push(value),onExit:()=>calls.exit++,menuOnEnter:()=>false,status:value=>calls.status.push(value),
            menuItems:()=>menuRows});
          for(let index=0;index<2;index++)controllers[index].dispatchEvent({type:'connected',data:sources[index]});
          xr.dispatchEvent({type:'sessionstart'});
          const down=async(index=1)=>{sources[index].gamepad.buttons[0].pressed=true;sources[index].gamepad.buttons[0].value=1;controllers[index].dispatchEvent({type:'selectstart'});await settle();};
          const up=async(index=1)=>{sources[index].gamepad.buttons[0].pressed=false;sources[index].gamepad.buttons[0].value=0;controllers[index].dispatchEvent({type:'selectend'});await settle();};
          const fresh=async(index=1)=>{await up(index);await down(index);};

          // A terminal event can reach the game before an asynchronous primary
          // action starts. It must never leave a delayed Reel action behind.
          controllers[1].dispatchEvent({type:'selectstart'});controllers[1].dispatchEvent({type:'selectend'});await settle();
          assert(calls.start.length===0,'same-frame release allowed the deferred primary action to start');calls.end.length=0;

          await down();assert(calls.start.length===1,'right trigger did not begin the primary action');
          assert(calls.start[0].hand==='right'&&calls.start[0].controller===controllers[1],'trigger hand/controller context was lost');
          assert(calls.start[0].ray.direction.isVector3&&Math.abs(calls.start[0].ray.direction.length()-1)<1e-7,'trigger ray was not normalized');
          await down();controls.update(.016);controls.update(.016);await settle();
          assert(calls.start.length===1,'duplicate selectstart or gamepad polling repeated the primary action');
          await up();await up();assert(calls.end.length===1,'selectend must release a held action exactly once');
          assert(calls.end[0].hand==='right'&&calls.end[0].controller===controllers[1],'release lost its controller owner');

          await down();controls.openMenu();await settle();
          assert(calls.end.length===2,'opening the in-headset menu left Reel held');
          assert(controls.menuOpen,'in-headset menu did not open');
          controls.closeMenu();await down();assert(calls.start.length===2,'menu release allowed the same held trigger to rearm');
          await fresh();assert(calls.start.length===3,'fresh trigger after menu dismissal did not work');

          window.dispatchEvent(new Event('blur'));await settle();
          assert(calls.end.length===3,'window blur did not release held primary');
          await down();assert(calls.start.length===3,'window blur permitted an unreleased trigger to restart');
          await fresh();assert(calls.start.length===4,'fresh trigger after blur was not restored');

          requestGameInputRelease('map-travel');await settle();
          assert(calls.end.length===4,'game input release did not release the VR hold');
          assert(calls.release.length>=3,'release notifications were not forwarded to the game');
          await down();assert(calls.start.length===4,'map-travel release permitted a stale trigger to restart');
          await fresh();assert(calls.start.length===5,'fresh trigger after map travel did not work');

          session.visibilityState='hidden';session.dispatchEvent({type:'visibilitychange'});await settle();
          assert(calls.end.length===5,'hidden XR session did not release held primary');
          controls.update(.016);await down();assert(calls.start.length===5,'a hidden headset dispatched gameplay');
          session.visibilityState='visible';session.dispatchEvent({type:'visibilitychange'});await up();await down();
          assert(calls.start.length===6,'fresh visible-session trigger did not work');

          controllers[1].dispatchEvent({type:'disconnected'});await settle();
          assert(calls.end.length===6,'controller disconnect did not release its hold');
          controllers[1].dispatchEvent({type:'connected',data:sources[1]});controls.update(.016);await settle();
          assert(calls.start.length===6,'reconnecting a still-held controller replayed a trigger action');
          await down();assert(calls.start.length===6,'reconnected held trigger accepted selectstart before physical release');
          await fresh();assert(calls.start.length===7,'fresh reconnected controller did not work');
          await down(0);assert(calls.start.length===8,'left trigger did not own a separate hold');
          await session.end();await settle();
          assert(calls.end.length===8&&calls.exit===1,'session end failed to release both controllers exactly once');
          controls.update(.016);await down();assert(calls.start.length===8,'ended XR session accepted a trigger');

          // Sport grip shortcuts and menu selection remain usable in a new
          // session, while menu triggers must not become fishing holds.
          xr.isPresenting=true;xr.dispatchEvent({type:'sessionstart'});await up();for(let index=0;index<2;index++)controllers[index].dispatchEvent({type:'connected',data:sources[index]});
          controllers[0].dispatchEvent({type:'squeezestart'});await settle();assert(calls.grip.at(-1)==='left','existing sport grip shortcut regressed');
          controls.openMenu();const beforeMenuStarts=calls.start.length;await up();await down();
          assert(calls.menu===1&&calls.start.length===beforeMenuStarts,'menu activation leaked into a primary gameplay hold');
          assert(!controls.menuOpen,'menu action did not return to the game');

          // Live game panels change labels and available controls as rounds
          // progress. Preserve the selected control, and safely select Resume
          // when it disappears rather than moving selection onto another action.
          let toggles=0,unexpected=0;
          const liveToggle=()=>({id:'comfort',label:toggles?'Comfort on':'Comfort off',keepOpen:true,run:()=>toggles++});
          menuRows=[liveToggle(),{id:'other',label:'Another action',run:()=>unexpected++}];
          controls.openMenu();await fresh();
          assert(toggles===1&&controls.menuOpen,'keep-open panel action failed');
          menuRows=[liveToggle(),menuRows[1]];controls.refreshMenu();
          assert(controls.snapshot().menuItems[0]==='Comfort on','live control label did not refresh');
          await fresh();assert(toggles===2&&unexpected===0,'label refresh lost the selected control identity');
          menuRows=[menuRows[1]];controls.refreshMenu();await fresh();
          assert(unexpected===0&&!controls.menuOpen,'removed control shifted selection onto a different action');

          // A slow cast request can reject after travel has already released
          // all controls. Its obsolete failure must not resurrect the XR menu.
          pendingPrimary=true;await fresh();assert(typeof rejectPrimary==='function','deferred primary request never began');
          const beforeObsoleteStatus=calls.status.length;
          requestGameInputRelease('map-travel-during-primary');await settle();rejectPrimary(new Error('Obsolete cast failure'));await settle();
          assert(!controls.menuOpen&&calls.status.length===beforeObsoleteStatus,'obsolete primary failure reopened a menu or announced stale status after release');
          await fresh();const beforeDisposeEnd=calls.end.length;
          controls.dispose();await settle();assert(calls.end.length===beforeDisposeEnd+1,'dispose did not release the last held action');
          const disposedCounts=[calls.start.length,calls.end.length,calls.release.length];
          window.dispatchEvent(new Event('blur'));requestGameInputRelease('after-dispose');await down();await up();xr.dispatchEvent({type:'sessionend'});await settle();
          assert(JSON.stringify(disposedCounts)===JSON.stringify([calls.start.length,calls.end.length,calls.release.length]),'disposed controls kept global/controller/session listeners');
          assert(!document.querySelector('.xr-enter-button')&&!scene.getObjectByName('MUZIKAZ_VR_GAME_MENU'),'dispose left visible XR controls/menu behind');
          return 'trigger edges, duplicate/reconnect protection, stale-request cancellation, menu/blur/travel/visibility/disconnect/session releases, sport shortcuts and disposal';
        }''')
        assert not errors, errors
        browser.close()
        print('PASS: ' + result)
finally:
    server.shutdown()
