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
  for width,height,kind in [(1280,900,'airport'),(390,844,'marina'),(1280,900,'house')]:
   page=browser.new_page(viewport={'width':width,'height':height});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
   page.evaluate('''async(kind)=>{
    const T=await import('/public/vendor/three/three.module.min.js');const {mountDistrictMap}=await import('/public/js/district-map.js');const {EnvironmentLoader}=await import('/public/js/environments/environment-loader.js');const {createBuilderModel}=await import('/public/js/builder-models-3d.js');const {airportWorld}=await import('/airport-world.mjs');const {neonMarina}=await import('/neon-marina.mjs');
    const marina=neonMarina();window.world=kind==='airport'?airportWorld():kind==='marina'?{id:'neon-docks',name:'Neon Docks',proceduralLand:true,spawn:{x:5,y:.02,z:5},builderScene:{layout:'community-park',mapSize:512,layoutMeta:{harbor:marina.harbor,locations:marina.locations},objects:marina.objects}}:(await(await fetch('/public/models/environments/environments.json')).json()).find(env=>env.id==='muzikaz-main');
    const renderer=new T.WebGLRenderer(),scene=new T.Scene(),loader=new EnvironmentLoader({scene,renderer,serverAuthoritative:()=>true});await loader.load(world);window.gameWorld=loader.world;window.gameDecor=new T.Group();for(const item of world.builderScene?.objects||[]){const object=createBuilderModel(item.modelId);if(!object)continue;object.userData.builderObjectId=item.id;object.position.set(item.position.x,item.position.y,item.position.z);object.rotation.set(item.rotation?.x||0,item.rotation?.y||0,item.rotation?.z||0);object.scale.set(item.scale?.x||1,item.scale?.y||1,item.scale?.z||1);gameDecor.add(object);}
    window.commands=[];window.localMap=mountDistrictMap({stage:document.querySelector('.house-stage'),getRoots:()=>[gameWorld,gameDecor],fetchAtlas:async()=>({locations:[]}),command:async(action,fields)=>{commands.push({action,...fields});return {result:{message:'Arrived'}};}});localMap.update(world);window.live={players:{self:{id:'self',username:'Pilot',position:{x:5,y:0,z:5}}},actors:{}};localMap.updateLive(live,'self');window.sourceMesh=null;gameWorld.traverse(node=>{if(!sourceMesh&&node.isMesh)sourceMesh=node;});window.disposals=0;sourceMesh.geometry.addEventListener('dispose',()=>disposals++);
   }''',kind)
   page.get_by_role('button',name='Local map and land deeds',exact=True).click()
   page.wait_for_selector('[data-local-map-3d] canvas',state='attached',timeout=20000)
   page.wait_for_function("document.querySelector('[data-local-map-3d]').getAttribute('aria-busy')==='false'",timeout=60000)
   page.wait_for_timeout(300)
   assert page.locator('[data-local-map-3d] canvas').get_attribute('aria-label').endswith('accurate 3D local map')
   assert page.locator('[data-map-tag="player:self"]').get_attribute('data-world-x')=='5'
   page.evaluate("live.players.self.position={x:20,y:3,z:-12};localMap.updateLive(live,'self')")
   assert page.locator('[data-map-tag="player:self"]').get_attribute('data-world-x')=='20'
   if kind=='airport':
    assert page.locator('[data-map-tag="location:north-runway"]').get_attribute('data-world-x')=='-280'
    page.get_by_role('button',name='Top view',exact=True).click();page.get_by_role('button',name='Fit map',exact=True).click()
   if kind=='marina':
    assert page.locator('[data-map-tag="location:superyacht-berth"]').count()==1
    page.get_by_role('button',name='Fit map',exact=True).click()
   page.screenshot(path=f'/workspace/local-map-{kind}-3d.png')
   assert page.locator('.district-map-dialog').evaluate('(el)=>el.scrollWidth<=el.clientWidth+1')
   page.get_by_role('button',name='2D plan',exact=True).click();assert page.locator('[data-local-map-plan]').is_visible()
   page.get_by_role('button',name='3D map',exact=True).click();assert page.locator('[data-local-map-3d]').is_visible()
   page.get_by_role('button',name='Close',exact=True).click();assert page.locator('[data-local-map-3d] canvas').count()==0
   assert page.evaluate('disposals')==0
   page.get_by_role('button',name='Local map and land deeds',exact=True).click();page.wait_for_selector('[data-local-map-3d] canvas',timeout=60000)
   page.get_by_role('button',name='Close',exact=True).click();assert not errors,errors;page.close()
  browser.close()
 print('Airport, marina and GLB house 3D maps: actual geometry, coordinate tags, live updates, mobile fit, view switching, reopen and shared resource safety passed.')
finally:server.shutdown()
