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
  page=browser.new_page(viewport={'width':390,'height':844});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
  page.evaluate('''async()=>{const {LAND_LOTS}=await import('/public/js/land-lots.js');window.lot=LAND_LOTS[0];window.bought=false;window.orders=[];window.MUZIKAZ_API={fetch:async(path,options={})=>{let data;if(path.includes('/api/land/lots/'))data={...lot,claimed:bought,ownerName:bought?'Test owner':null,visitUrl:'model-explorer.html?environment='+lot.mapId,playUrl:bought?'model-explorer.html?environment=plot-deed-'+lot.id:null};else if(path==='/api/land/claims'){orders.push(JSON.parse(options.body));bought=true;data={playUrl:'model-explorer.html?environment=plot-deed-'+lot.id};}else data={account:{accountId:'buyer'},csrfToken:'csrf'};return {ok:true,json:async()=>({data})};}};const {mountLandSale}=await import('/public/js/land-sale-ui.js');window.panel=mountLandSale(document.body);await panel.open(lot.id);}''')
  assert '5,000 MZK ($50)' in page.locator('.land-sale-dialog').inner_text()
  assert 'Local XYZ -150, 0, -105' in page.locator('.land-sale-dialog').inner_text()
  page.get_by_role('button',name='Buy deed · 5,000 MZK').click()
  page.get_by_role('link',name='Enter your deeded plot').wait_for()
  assert page.evaluate('orders.length===1&&orders[0].expectedPriceMzk===5000&&orders[0].worldId===lot.id')
  assert page.locator('.land-sale-dialog').evaluate('(el)=>el.getBoundingClientRect().width<=innerWidth')
  page.get_by_role('button',name='Close',exact=True).click();page.evaluate('panel.open(lot.id)')
  assert 'Deed claimed' in page.locator('.land-sale-dialog').inner_text()
  assert not page.get_by_role('button',name='Buy deed · 5,000 MZK').is_visible()
  page.screenshot(path='/workspace/land-deed-purchase.png');page.evaluate('panel.dispose()')
  page.set_viewport_size({'width':1440,'height':900})
  page.evaluate('''async()=>{const T=await import('/public/vendor/three/three.module.min.js'),{createBuilderModel}=await import('/public/js/builder-models-3d.js'),{updateAircraftModel}=await import('/public/js/aircraft-model.js'),{cloneBuilderRuntime}=await import('/public/js/builder-runtime-clone.js');document.body.innerHTML='';document.body.style.margin='0';const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(1440,900);renderer.outputColorSpace=T.SRGBColorSpace;document.body.append(renderer.domElement);const scene=new T.Scene();scene.background=new T.Color(0x18303d);scene.add(new T.HemisphereLight(0xf5f8ff,0x4b6055,2.5));const sun=new T.DirectionalLight(0xffedcf,3);sun.position.set(-8,18,10);scene.add(sun);window.models=[];for(const [i,id]of ['corsair-aircraft','diamond-da40','piper-cub'].entries()){const model=cloneBuilderRuntime(createBuilderModel(id));model.position.set((i-1)*14,.4,0);model.rotation.y=.12;scene.add(model);models.push(model);updateAircraftModel(model,{windowOpen:id==='diamond-da40',throttle:0,bank:0,pitch:0},0);}const floor=new T.Mesh(new T.PlaneGeometry(65,36),new T.MeshStandardMaterial({color:0x50636b,roughness:.9}));floor.rotation.x=-Math.PI/2;scene.add(floor);const camera=new T.PerspectiveCamera(43,1440/900,.1,200);camera.position.set(25,24,34);camera.lookAt(0,.9,0);window.draw=()=>renderer.render(scene,camera);draw();window.snapCockpit=id=>{const model=models.find(m=>m.userData.modelId===id),eye=new T.Vector3(...model.userData.cockpitPose.position);model.localToWorld(eye);camera.position.copy(eye);camera.lookAt(eye.clone().add(new T.Vector3(0,-.2,-2).applyQuaternion(model.quaternion)));camera.fov=74;camera.updateProjectionMatrix();draw();};}''')
  page.wait_for_timeout(300);page.evaluate('draw()');page.screenshot(path='/workspace/aircraft-fleet.png')
  for id in ['diamond-da40','piper-cub']:
   page.evaluate('(id)=>snapCockpit(id)',id);page.screenshot(path='/workspace/'+id+'-cockpit.png')
  assert page.evaluate("models[1].userData.aircraftRig.windowHinge.rotation.x<-.5")
  assert not errors,errors;browser.close()
 print('Mobile deed price review, explicit purchase, owned-state lock, and all three native aircraft/cockpit renders passed.')
finally:server.shutdown()
