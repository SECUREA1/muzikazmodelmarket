"""Mobile freight controls and native loaded pickup/trailer artwork."""
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
  try:
   page=browser.new_page(viewport={'width':390,'height':844},has_touch=True);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
   page.evaluate('''async()=>{document.body.replaceChildren();document.body.style.margin='0';const stage=document.createElement('main');stage.className='house-stage';stage.style.cssText='position:relative;height:800px;width:390px;background:#112d35';document.body.append(stage);const {mountRoadVehicleUI}=await import('/public/js/road-vehicle-ui.js');window.calls=[];window.state={serverTime:1000,players:{me:{vehicleId:'truck'}},actors:{truck:{id:'truck',modelId:'frontier-pickup',position:{x:0,y:0,z:0},driving:{speed:0},freight:{crates:[],secured:true}}},freightHubs:[{id:'destination',name:'Harbor shipping'}]};window.dash=mountRoadVehicleUI(stage,async(action,data)=>{calls.push({action,...data});return {result:{message:'Confirmed'}};});dash.update(state,'me');}''')
   page.get_by_label('Cargo and trailer controls').click()
   for name in ['Hitch trailer','Load crate','Stack / secure','Unload delivery']:
    page.get_by_role('button',name=name,exact=True).click()
   assert page.evaluate('calls.map(c=>c.operation)')==['hitch','load','secure','unload']
   page.evaluate("state.actors.truck.trailerId='trailer';state.actors.trailer={freight:{crates:[{destinationId:'destination'}],secured:false}};dash.update(state,'me')")
   assert '1/12 crates' in page.locator('[data-cargo]').inner_text()
   assert 'Harbor shipping' in page.locator('[data-cargo-destination]').inner_text()
   assert page.get_by_role('button',name='Hitch trailer',exact=True).is_disabled()
   assert page.get_by_role('button',name='Unhitch',exact=True).is_enabled()
   page.evaluate('state.actors.truck.driving.speed=4;dash.update(state,"me")')
   assert page.get_by_role('button',name='Load crate',exact=True).is_disabled()
   assert page.get_by_role('button',name='Unhitch',exact=True).is_disabled()
   bounds=page.locator('.road-vehicle-controls').bounding_box();assert bounds['x']>=0 and bounds['x']+bounds['width']<=390
   assert not errors,errors
   print('Mobile cargo controls, disabled moving actions and destination/stack display passed.',flush=True)
   page.set_viewport_size({'width':1100,'height':650})
   page.evaluate('''async()=>{document.body.replaceChildren();const T=await import('/public/vendor/three/three.module.min.js'),{createBuilderModel}=await import('/public/js/builder-models-3d.js'),{updateFreightVisual}=await import('/public/js/freight-models.js');const scene=new T.Scene();scene.background=new T.Color('#102630');const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1100,650);document.body.append(renderer.domElement);scene.add(new T.HemisphereLight(0xdaf6ff,0x73634a,2.4));const light=new T.DirectionalLight(0xffe3b7,3);light.position.set(8,12,5);scene.add(light);const floor=new T.Mesh(new T.PlaneGeometry(60,60),new T.MeshStandardMaterial({color:0x3b5255,roughness:1}));floor.rotation.x=-Math.PI/2;scene.add(floor);const truck=createBuilderModel('frontier-pickup'),trailer=createBuilderModel('utility-cargo-trailer');truck.position.x=-3;trailer.position.x=2;for(const [root,count]of [[truck,4],[trailer,8]]){root.userData.freight={crates:Array.from({length:count},()=>({})),secured:true};updateFreightVisual(root);scene.add(root);if(root.getObjectByName('VISIBLE_FREIGHT').children.length<count)throw Error('Cargo stacks missing');}const camera=new T.PerspectiveCamera(42,1100/650,.1,100);camera.position.set(11,8,13);camera.lookAt(0,.7,0);renderer.render(scene,camera);}''')
   page.screenshot(path='/workspace/frontier-hauling.png')
   assert not errors,errors
   print('Native loaded pickup and eight-slot trailer rendered successfully.',flush=True)
  finally:browser.close()
finally:server.shutdown()
