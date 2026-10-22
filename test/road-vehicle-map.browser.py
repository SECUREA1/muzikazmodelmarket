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
  page=browser.new_page(viewport={'width':390,'height':760});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
  page.add_style_tag(url='/styles.css')
  page.evaluate('''async()=>{document.body.replaceChildren();const stage=document.createElement('main');stage.className='house-stage';stage.style.cssText='position:relative;height:700px';document.body.append(stage);const {ROAD_VEHICLES}=await import('/public/js/road-vehicles.js'),{mountDistrictMap}=await import('/public/js/district-map.js'),{mountRoadVehicleUI}=await import('/public/js/road-vehicle-ui.js');window.state={serverTime:1000,players:{me:{position:{x:10,y:0,z:10}}},actors:Object.fromEntries(Object.entries(ROAD_VEHICLES).filter(([,config])=>!config.siteOnly).map(([modelId,c],i)=>[modelId,{id:modelId,modelId,asset:{buildAssetId:modelId},active:true,position:{x:0,y:0,z:i*8},driving:{speed:0,parked:true}}]))};window.calls=[];window.command=async(action,data)=>{calls.push({action,...data});if(action==='map-access'){state.players.me.vehicleId=data.entityId;state.actors[data.entityId].holderId='me';}if(action==='interact'){state.actors[state.players.me.vehicleId].holderId=null;state.players.me.vehicleId=null;}map.updateLive(state,'me');dash.update(state,'me');return {result:{message:'Confirmed'}};};window.map=mountDistrictMap({stage,command,fetchAtlas:async()=>({locations:[]})});window.dash=mountRoadVehicleUI(stage,command);map.update({id:'roads',name:'Road plaza',streets:[{id:'Local avenue',from:{x:0,z:-50},to:{x:0,z:50},width:10}],builderScene:{mapSize:160,objects:[]}});map.updateLive(state,'me');}''')
  page.locator('.district-map-toggle').click()
  page.evaluate("""async()=>{const pin=document.querySelector('[data-live-craft] [aria-label="Select Aurelia Grand Tourer"]');window.heldPin=pin;pin.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:12}));map.updateLive(structuredClone(state),'me');if(!pin.isConnected)throw Error('Live update removed the pressed vehicle marker');pin.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:12}));await new Promise(requestAnimationFrame);map.updateLive(structuredClone(state),'me');if(!pin.isConnected)throw Error('Live update removed the marker before delayed touch click');pin.dispatchEvent(new MouseEvent('click',{bubbles:true}));}""")
  assert page.locator('.local-map-visual [data-craft-id="grand-tourer"]').count()==1
  page.locator('.district-map-dialog>header button').click()
  for name in ['Atlas Trail Quad','Aurelia Grand Tourer','Veloce Touring Motorcycle']:
   page.locator('.district-map-toggle').click()
   page.get_by_role('button',name='Vehicles',exact=True).click()
   assert page.locator('[data-craft-choices] article').count()==3
   page.wait_for_function("[...document.querySelectorAll('[data-craft-choices] img')].every(i=>i.complete&&i.naturalWidth>0)")
   assert page.locator('[data-craft-choices] img').evaluate_all('(images)=>images.every(i=>i.complete&&i.naturalWidth>0)')
   page.get_by_role('button',name='Board '+name,exact=True).click()
   assert page.locator('.district-map-dialog').is_visible(), 'Boarding must keep the map open'
   page.locator('.district-map-dialog').get_by_role('button',name='Close',exact=True).click()
   assert page.get_by_role('region',name='Road vehicle dashboard').is_visible()
   page.get_by_role('button',name='Road quests and live objectives',exact=True).click()
   assert page.get_by_label('Quest activity filter').input_value()=='road'
   assert page.locator('.local-map-quests article').count()==5
   assert page.get_by_role('button',name='Accept Road supply delivery',exact=True).is_enabled()
   page.locator('.district-map-dialog>header button').click()
   page.evaluate("state.players.me.vehicleMission={status:'active',mode:'road',title:'Delivery',index:0,deadline:61000,ready:true,checkpoints:[{name:'Collect local supplies',x:0,y:0,z:20,action:'collect'}]};dash.update(state,'me')")
   assert 'Collect local supplies' in page.locator('[data-objective-title]').text_content()
   page.get_by_role('button',name='collect',exact=True).click()
   assert page.evaluate("calls.at(-1).operation==='interact'")
   page.evaluate("state.players.me.vehicleMission=null;dash.update(state,'me')")
   page.get_by_role('button',name='Park / brake',exact=True).click()
   assert page.evaluate("calls.at(-1).operation==='park'")
   page.get_by_role('button',name='Exit',exact=True).click()
  assert not errors,errors
  page.evaluate('map.dispose();dash.dispose()')
  # Render actual models for a visual quality check.
  page.set_viewport_size({'width':1100,'height':650})
  page.evaluate('''async()=>{const T=await import('/public/vendor/three/three.module.min.js'),{createBuilderModel}=await import('/public/js/builder-models-3d.js');document.body.replaceChildren();const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=T.SRGBColorSpace;document.body.append(renderer.domElement);const scene=new T.Scene();scene.background=new T.Color('#152a36');scene.add(new T.HemisphereLight('#edffff','#486057',3));const light=new T.DirectionalLight('#ffe7c6',4);light.position.set(-4,8,5);scene.add(light);const floor=new T.Mesh(new T.PlaneGeometry(100,100),new T.MeshStandardMaterial({color:'#23434c',roughness:.85}));floor.rotation.x=-Math.PI/2;scene.add(floor);for(const [i,id]of ['alpine-quad','grand-tourer','touring-motorcycle'].entries()){const root=createBuilderModel(id);if(root.userData.roadDash.canvas.width!==1024)throw Error('Dashboard resolution');root.position.x=(i-1)*4.5;scene.add(root);}const camera=new T.PerspectiveCamera(42,innerWidth/innerHeight,.05,100);camera.position.set(9,6,-12);camera.lookAt(0,.6,0);renderer.render(scene,camera);}''')
  page.screenshot(path='/workspace/premium-road-vehicles.png')
  browser.close()
 print('All three map cards show artwork, board directly, expose parking and exit; native models render without browser errors.')
finally:server.shutdown()
