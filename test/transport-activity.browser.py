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
  page=browser.new_page(viewport={'width':1100,'height':780});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
  page.evaluate('''async()=>{const T=await import('/public/vendor/three/three.module.min.js'),{mountTransportActivity}=await import('/public/js/transport-activity.js'),{createBuilderModel}=await import('/public/js/builder-models-3d.js'),{projectServerActor}=await import('/public/js/server-scene-projection.js');document.body.innerHTML='';document.body.style.cssText='margin:0;background:#14343e';const stage=document.createElement('main');stage.style.cssText='position:relative;width:100vw;height:100vh;overflow:hidden';document.body.append(stage);const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=T.SRGBColorSpace;stage.append(renderer.domElement);const scene=new T.Scene();scene.background=new T.Color(0x183c4b);scene.add(new T.HemisphereLight(0xeaf7ff,0x2c6659,3));const sun=new T.DirectionalLight(0xffe7bf,3);sun.position.set(10,30,10);scene.add(sun);const sea=new T.Mesh(new T.PlaneGeometry(2000,2000),new T.MeshStandardMaterial({color:0x276e7e,roughness:.3,metalness:.2}));sea.rotation.x=-Math.PI/2;sea.position.y=-.22;scene.add(sea);const camera=new T.PerspectiveCamera(46,innerWidth/innerHeight,.025,2000);camera.position.set(350,9,18);camera.lookAt(337,1,0);const boat={id:'tender',modelId:'harbor-skiff',active:true,trafficAI:true,trafficAngle:0,crew:{name:'Captain Ellis',callsign:'Beacon Tender'},position:{x:337,y:0,z:0},rotation:{y:.25},boating:{speed:4},definition:{gameplay:{behavior:'vehicle'}}},root=createBuilderModel(boat.modelId);projectServerActor(root,boat);scene.add(root);const sail={...boat,id:'sail',modelId:'harbor-sailboat',position:{x:328,y:0,z:-8},rotation:{y:.8}},sailRoot=createBuilderModel(sail.modelId);projectServerActor(sailRoot,sail);scene.add(sailRoot);window.requests=[];window.radio=[];const owned={id:'own',modelId:'harbor-yacht',active:true,position:{x:341,y:0,z:10}};window.state={serverTime:100000,players:{p:{vehicleId:'own',position:owned.position}},actors:{own:owned,tender:boat,sail},transportRadio:[{id:1,at:100000,speaker:'Captain Ellis / Beacon Tender',text:'Underway in the east channel. All crew aboard.'},{id:2,at:100000,speaker:'Harbor Control',text:'Beacon Tender, traffic acknowledged. Maintain separation.'}]};window.world={id:'marina'};window.ui=mountTransportActivity({stage,THREE:T,scene,airportRadio:{receiveTraffic:(...args)=>radio.push(args),trafficAudio:()=>{}},command:async(action,fields)=>{requests.push({action,...fields});if(fields.operation==='start')state.players.p.vehicleMission={title:'Harbor supply patrol',status:'active',vehicleId:'own',startedAt:100000,deadline:700000,index:0,checkpoints:[{name:'East channel supplies',x:337,y:0,z:-20,radius:25}]};else state.players.p.vehicleMission.status='cancelled';ui.update(state,'p',world);return {result:{message:'Dispatch confirmed.'}};}});ui.update(state,'p',world);window.render=()=>renderer.render(scene,camera);render();window.scene=scene;window.root=root;}''')
  page.get_by_role('button',name='Crew radio and vehicle quests',exact=True).click()
  assert page.get_by_label('Recent radio calls').is_visible()
  page.get_by_role('button',name='Request assignment',exact=True).click()
  assert page.evaluate("requests[0].action==='vehicle-mission' && requests[0].operation==='start'")
  assert page.get_by_label('Next mission checkpoint').is_visible()
  assert page.evaluate("scene.getObjectByName('VEHICLE_MISSION_BEACON').visible && root.userData.trafficCrew.visible")
  page.evaluate('render()');page.screenshot(path='/workspace/crew-radio-quests.png')
  page.get_by_role('button',name='Cancel assignment',exact=True).click()
  assert not page.get_by_label('Next mission checkpoint').is_visible()
  for width,height in [(390,844),(844,390)]:
   page.set_viewport_size({'width':width,'height':height})
   assert page.evaluate("document.querySelector('.transport-radio-panel').getBoundingClientRect().left>=0")
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.evaluate("state.players.p.vehicleMission={status:'active',vehicleId:'own'};state.players.p.vehicleId=null;ui.update(state,'p',world)")
  assert not page.get_by_label('Next mission checkpoint').is_visible()
  page.evaluate("ui.dispose()")
  assert not errors,errors;browser.close()
 print('Crewed native traffic, dispatch start/cancel, checkpoint beacon, exit reconciliation, mobile/landscape panel and disposal pass without browser errors.')
finally:server.shutdown()
