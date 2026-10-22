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
  page=browser.new_page(viewport={'width':1280,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
  page.evaluate('''async()=>{
   window.worlds={'map-a':{id:'map-a',name:'Creator Garden',proceduralLand:true,builderScene:{layout:'grand-floor',mapSize:40,objects:[{id:'table',name:'Garden Table',modelId:'dining-set',position:{x:6,y:0,z:4},rotation:{x:0,y:.3,z:0},scale:{x:1,y:1,z:1}}]}}};worlds['map-b']={...worlds['map-a'],id:'map-b',name:'Workshop',builderScene:{...worlds['map-a'].builderScene,objects:[]}};
   window.plot=(id,column)=>({mapId:id,name:worlds[id]?.name||id,column,row:0,size:40,streets:[],portalTargets:['map-a'],ownerName:'Builder',playerCount:0,buildingCount:1,savedObjectCount:id==='map-a'?1:0,updatedAt:'1',playUrl:'model-explorer.html?environment='+id});
   window.atlas={revision:1,cellSize:256,locations:[plot('map-a',0),plot('map-b',1)],connections:[{from:'map-a',to:'map-b'}]};window.requests=[];
   window.snapshot={objects:{block:{id:'block',materialId:'wood',position:[10,1,8],rotation:[0,.5,0],scale:[2,1,3],paint:[0x12ab34],open:false}},actors:{},players:{}};
   window.MUZIKAZ_API={fetch:async(path)=>{requests.push(path);let data;if(path==='/api/world-atlas')data=atlas;else if(path.startsWith('/api/environments/'))data=worlds[decodeURIComponent(path.split('/').pop())];else if(path.includes('/gameplay'))data=snapshot;else data={};return {ok:true,json:async()=>({data})};}};
   const {mountWorldAtlas}=await import('/public/js/world-atlas.js');document.body.replaceChildren();const root=document.createElement('section');root.id='world-map';document.body.append(root);mountWorldAtlas(root);
  }''')
  page.wait_for_selector('.connected-world-map canvas',timeout=60000)
  assert page.locator('[data-map-tag^="plot:"]').count()==2
  page.locator('[data-map-tag="plot:map-a"]').click()
  page.wait_for_function("document.querySelector('.connected-world-status').textContent.includes('2 detailed plots loaded')",timeout=60000)
  tag=page.locator('[data-map-tag="map-a:item:block"]');tag.wait_for(state='attached',timeout=10000)
  # A 40m plot uses a uniform 5.76 atlas units per local metre.
  assert abs(float(tag.get_attribute('data-world-x'))-57.6)<.01
  assert abs(float(tag.get_attribute('data-world-z'))-46.08)<.01
  assert page.evaluate("requests.some(path=>path==='/api/rooms/map-a/gameplay')")
  toggle=page.get_by_role('button',name='Destinations',exact=True)
  assert toggle.get_attribute('aria-expanded')=='true'
  assert page.locator('.atlas-browse-toggle svg').evaluate('(el)=>el.getBoundingClientRect().height')==20
  toggle.click();assert not page.locator('.atlas-sidebar').is_visible()
  toggle.click();assert page.locator('.atlas-sidebar').is_visible()
  page.locator('[data-destination-id="map-b"]').click()
  assert page.locator('[data-atlas-destination]').input_value()=='map-b'
  assert page.locator('[data-destination-id="map-b"]').get_attribute('aria-current')=='true'
  page.locator('[data-destination-id="map-a"]').click()
  assert not page.locator('.atlas-advanced').evaluate('(el)=>el.open')
  page.screenshot(path='/workspace/connected-world-preview.png')
  page.evaluate("snapshot.objects.block.position[0]=12")
  page.get_by_role('button',name='Refresh live world',exact=True).click()
  page.wait_for_function("Math.abs(Number(document.querySelector('[data-map-tag=\"map-a:item:block\"]')?.dataset.worldX)-69.12)<.01",timeout=15000)
  page.evaluate("worlds['map-c']={...worlds['map-b'],id:'map-c',name:'New garden'};atlas.locations.push(plot('map-c',3));atlas.revision=2")
  page.get_by_role('button',name='Refresh live world',exact=True).click()
  page.wait_for_function("document.querySelectorAll('[data-map-tag^=\"plot:\"]').length===3",timeout=15000)
  page.get_by_role('button',name='Show all destinations',exact=True).click()
  page.get_by_role('button',name='2D directory',exact=True).click();assert page.locator('[data-atlas-map]').is_visible()
  page.get_by_role('button',name='Connected 3D world',exact=True).click();assert page.locator('.connected-world-map canvas').is_visible()
  page.set_viewport_size({'width':390,'height':844});page.locator('.connected-world-map canvas').scroll_into_view_if_needed();page.wait_for_timeout(200)
  assert page.locator('.connected-world-map').evaluate('(el)=>el.scrollWidth<=el.clientWidth+1')
  assert page.locator('#world-map').evaluate('(el)=>el.scrollWidth<=el.clientWidth+1')
  toggle.click();assert not page.locator('.atlas-sidebar').is_visible()
  assert page.locator('.connected-world-map canvas').is_visible()
  toggle.click();page.locator('[data-atlas-search]').fill('nothing-matches-this')
  assert page.locator('.atlas-empty').is_visible()
  page.locator('[data-atlas-search]').fill('')
  page.screenshot(path='/workspace/connected-world-mobile-preview.png')
  assert not errors,errors;browser.close()
 print('Main-page connected world: real models and building coordinates, zoom detail streaming, growth updates and 2D/3D switching passed.')
finally:server.shutdown()
