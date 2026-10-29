from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from pathlib import Path
from playwright.sync_api import sync_playwright
import os,json
os.chdir(Path(__file__).resolve().parents[1])
Path('work/freeze-fix').mkdir(parents=True,exist_ok=True)
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'],headless=True)
  page=browser.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
  page.evaluate('''async()=>{
   const THREE=await import('/public/vendor/three/three.module.min.js');
   const {mountLocalMap3D}=await import('/public/js/local-map-3d.js');
   document.body.innerHTML='<button id="close-probe">Input probe</button><div id="map"></div><style>.local-map-3d-viewport{width:400px;height:300px}</style>';
   const root=new THREE.Group(),geometry=new THREE.BoxGeometry(),material=new THREE.MeshBasicMaterial();
   for(let i=0;i<100;i++){const mesh=new THREE.Mesh(geometry,material);mesh.position.x=i%10;mesh.position.z=Math.floor(i/10);root.add(mesh);}
   window.view=await mountLocalMap3D(document.querySelector('#map'),{environment:{id:'stress-map',name:'Stress map'},getRoots:()=>[root],getTags:()=>[],refreshInterval:0});
   window.frames=[];const render=view.renderer.render.bind(view.renderer);
   view.renderer.render=(...args)=>{const start=performance.now();while(performance.now()-start<60){}render(...args);frames.push({start,end:performance.now()});};
   window.probeClicked=false;document.querySelector('#close-probe').onclick=()=>{probeClicked=true;view.dispose();};
   const animate=()=>{if(!window.probeClicked){root.rotation.y+=.001;requestAnimationFrame(animate);}};requestAnimationFrame(animate);
   window.timerRan=false;setTimeout(()=>{timerRan=true;},200);
  }''')
  page.wait_for_timeout(1200)
  frames=page.evaluate('frames');assert len(frames)>=2,frames
  for first,second in zip(frames,frames[1:]): assert second['start']-first['end']>=45,frames
  assert page.evaluate('timerRan')
  page.evaluate("()=>{view.renderer.render=()=>{throw Error('Injected GPU render failure');};}")
  page.wait_for_function("document.querySelector('#map').textContent.includes('3D map paused')",timeout=2000)
  page.locator('#close-probe').click(timeout=1500);assert page.evaluate('probeClicked');assert not errors,errors
  result={'frames':frames,'timerRan':True,'inputClickPassed':True,'renderFailureContained':True,'pageErrors':errors,'scope':'Production map mount with 100 meshes and injected 60ms render cost; verifies cooldown and input delivery, not full-game FPS.'}
  Path('work/freeze-fix/browser-result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result));browser.close()
finally:server.shutdown();server.server_close()
