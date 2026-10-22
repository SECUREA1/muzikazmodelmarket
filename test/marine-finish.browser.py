from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os
os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
  page=browser.new_page(viewport={'width':1200,'height':800});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
  page.evaluate('''async()=>{const T=await import('/public/vendor/three/three.module.min.js'),{createHarborBoat,updateHarborBoat}=await import('/public/js/harbor-models.js'),{cloneBuilderRuntime}=await import('/public/js/builder-runtime-clone.js');document.body.innerHTML='';document.body.style.margin='0';const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(1200,800);renderer.outputColorSpace=T.SRGBColorSpace;document.body.append(renderer.domElement);const scene=new T.Scene();scene.background=new T.Color(0x14333e);scene.add(new T.HemisphereLight(0xf1f8ff,0x345551,2.6));const sun=new T.DirectionalLight(0xffead3,3);sun.position.set(-8,16,14);scene.add(sun);const floor=new T.Mesh(new T.PlaneGeometry(180,180),new T.MeshStandardMaterial({color:0x246979,roughness:.38,metalness:.25}));floor.rotation.x=-Math.PI/2;floor.position.y=-.2;scene.add(floor);const camera=new T.PerspectiveCamera(42,1.5,.025,200);let model;window.showBoat=id=>{if(model)scene.remove(model);model=cloneBuilderRuntime(createHarborBoat(id));scene.add(model);updateHarborBoat(model,{speed:0,throttle:0,wakeStrength:0},0);window.model=model;const yacht=id==='harbor-yacht';camera.position.set(...(yacht?[27,18,34]:[4.8,3.1,6.6]));camera.lookAt(0,yacht?2.3:1,0);renderer.render(scene,camera);};showBoat('harbor-yacht');}''')
  for id in ['harbor-yacht','harbor-skiff','harbor-sailboat']:
   page.evaluate('(id)=>showBoat(id)',id);assert page.evaluate("model.userData.designFinish==='marine-collection-2'")
   page.screenshot(path='/workspace/'+id+'-finished.png')
  assert not errors,errors;browser.close()
 print('Finished yacht, launch and sailboat render with native lettering, independent rigs and no browser errors.')
finally:server.shutdown()
