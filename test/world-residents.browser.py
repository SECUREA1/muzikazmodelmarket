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
  page=browser.new_page(viewport={'width':390,'height':740});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
  page.add_style_tag(url='/styles.css')
  page.evaluate('''async()=>{document.body.replaceChildren();const {stepWorldResidents,residentCommand}=await import('/server-world-residents.mjs'),{mountWorldResidentUI}=await import('/public/js/world-resident-ui.js'),{mountGameDisplayFlow}=await import('/public/js/game-display-flow.js');window.world={id:'resident-demo',spawn:{x:0,y:0,z:0},builderScene:{mapSize:100,objects:[],layoutMeta:{locations:[{id:'lounge',name:'Main floor lounge',x:0,z:0},{id:'supplies',name:'Community supplies',x:16,z:0}]}}};window.state={serverTime:100000,actors:{},players:{},events:[]};window.collision={groundAt:(_world,p)=>({...p,y:0}),hasBodyClearance:()=>true,resolve:(_world,_from,to)=>to};stepWorldResidents(state,world,100000,.1,{collision});window.npc=Object.values(state.actors).find(a=>a.resident);state.players.me={actorId:'me',username:'Visitor',health:100,score:0,lastSeen:100000,position:{...npc.position},movementRevision:0};const stage=document.createElement('main');stage.className='house-stage';stage.style.cssText='height:700px;position:relative';document.body.append(stage);mountGameDisplayFlow(stage);window.ui=mountWorldResidentUI(stage,async(action,data)=>{state.serverTime+=1200;state.players.me.lastSeen=state.serverTime;const message=residentCommand(state,state.players.me,world,data,state.serverTime,{collision});ui.update(state,'me',world.id);setTimeout(()=>ui.update(state,'me',world.id),0);return {result:{message,residentId:data.entityId}};});ui.update(state,'me',world.id);}''')
  toggle=page.get_by_role('button',name='Residents, conversations and daily objectives',exact=True)
  assert page.locator('.game-display-flow-views .world-resident-toggle').count()==1
  assert toggle.bounding_box()['width']==44
  toggle.click()
  page.locator('[data-residents] button').first.click()
  page.get_by_label('Question for resident',exact=True).fill('Where am I?')
  page.get_by_role('button',name='Talk to Amira Vale',exact=True).click()
  assert 'Main floor lounge' in page.get_by_label('Quest conversation transcript').inner_text()
  page.get_by_label('Choose quest conversation reply',exact=True).select_option('joke')
  page.get_by_role('button',name='Talk to Amira Vale',exact=True).click()
  page.get_by_label('Choose quest conversation reply',exact=True).select_option('accept')
  page.get_by_role('button',name='Talk to Amira Vale',exact=True).click()
  assert page.locator('[data-daily]').is_visible()
  page.evaluate("state.players.me.position={...state.players.me.residentTask.checkpoints[0]};state.serverTime+=3000;ui.update(state,'me',world.id)")
  page.get_by_role('button',name='Confirm daily objective',exact=True).click()
  page.evaluate("state.players.me.position={...npc.position};state.serverTime+=3000;ui.update(state,'me',world.id)")
  page.get_by_role('button',name='Confirm daily objective',exact=True).click()
  assert page.evaluate("state.players.me.score===100&&state.players.me.residentTask.status==='completed'")
  for width,height in [(390,740),(844,390)]:
   page.set_viewport_size({'width':width,'height':height})
   page.get_by_label('Question for resident',exact=True).scroll_into_view_if_needed()
   box=page.locator('.world-resident-panel').bounding_box()
   assert box['x']>=0 and box['y']>=0 and box['x']+box['width']<=width and box['y']+box['height']<=height,box
   close=page.get_by_role('button',name='Close resident conversations',exact=True).bounding_box()
   assert 0<=close['y']<height-30,close
  page.set_viewport_size({'width':390,'height':740})
  page.screenshot(path='/workspace/world-residents-mobile.png')
  page.get_by_role('button',name='Close resident conversations',exact=True).click()
  assert toggle.get_attribute('aria-expanded')=='false'
  page.evaluate('ui.dispose()')
  page.set_viewport_size({'width':1100,'height':650})
  page.evaluate('''async()=>{const T=await import('/public/vendor/three/three.module.min.js'),{createBuilderModel,updateBuilderModels}=await import('/public/js/builder-models-3d.js');document.body.replaceChildren();document.body.style.margin='0';const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=T.SRGBColorSpace;document.body.append(renderer.domElement);const scene=new T.Scene();scene.background=new T.Color('#153039');scene.add(new T.HemisphereLight('#f1ffef','#648171',3));const light=new T.DirectionalLight('#ffe7c7',3);light.position.set(3,6,-4);scene.add(light);const floor=new T.Mesh(new T.PlaneGeometry(40,40),new T.MeshStandardMaterial({color:'#3a6659'}));floor.rotation.x=-Math.PI/2;scene.add(floor);const group=new T.Group();scene.add(group);for(const [i,actor]of Object.values(state.actors).filter(a=>a.resident).slice(0,4).entries()){const model=createBuilderModel('world-resident');model.position.x=(i-1.5)*2.5;model.userData.residentState={...actor.resident,phase:'working',moving:false,gesture:i===1?'wave':i===2?'laugh':'work',speech:i===0?'Can you help with a daily favor?':i===1?'Good to see you, Visitor!':'',prop:['music','clipboard','ball','crate'][i]};group.add(model);}updateBuilderModels(group,1.2);const camera=new T.PerspectiveCamera(42,innerWidth/innerHeight,.05,100);camera.position.set(2,3.2,-11);camera.lookAt(0,1.1,0);renderer.render(scene,camera);}''')
  page.screenshot(path='/workspace/world-resident-characters.png')
  assert not errors,errors
  browser.close()
 print('Resident icon, contextual questions, humor, daily acceptance/confirmation/reward and scrollable mobile/landscape dialogue pass.')
finally:server.shutdown()
