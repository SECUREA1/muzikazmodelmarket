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
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  for width,height in [(320,568),(390,844),(844,390),(1280,800)]:
   page=browser.new_page(viewport={'width':width,'height':height});page.set_default_timeout(6000);errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
   page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html');page.wait_for_selector('body[data-ready=true]')
   page.evaluate("""async()=>{const {mountDistrictMap}=await import('/public/js/district-map.js');window.localMap=mountDistrictMap({stage:document.querySelector('.house-stage'),fetchAtlas:async()=>({locations:[{mapId:'plot-deed-dock',districtId:'world-district-neon-docks',name:'Sailor Harbor',ownerName:'Sailor',deedId:'dock-001'},{mapId:'plot-private-other',districtId:'world-district-echo-gardens',name:'Other District',ownerName:'Other',deedId:'other'}]})});localMap.update({id:'world-district-neon-docks',name:'Neon Docks',atlasDistrict:{id:'neon-docks'},spawn:{x:5,z:5},streets:[{name:'Quay Road',from:{x:-100,z:0},to:{x:100,z:0},width:5}],builderScene:{layoutMeta:{locations:[{id:'quay',name:'Cargo Quay',x:-42,z:-16,width:10,depth:10,description:'Loading and freight.'},{id:'registry',name:'Harbor Registry',x:-42,z:18,width:10,depth:10}]},objects:[{name:'Sailor Harbor',atlasDestination:'plot-deed-dock',atlasDeedId:'dock-001',position:{x:36,z:34}}]}});} """)
   button=page.get_by_role('button',name='Local map and land deeds',exact=True);button.click();dialog=page.get_by_role('dialog',name='Local map and land deeds',exact=True)
   page.wait_for_function("document.querySelector('.district-map-dialog [role=status]').textContent.includes('1 recorded deeds')")
   assert dialog.get_by_role('heading',name='Sailor Harbor',exact=True).is_visible();assert dialog.get_by_text('Other District',exact=True).count()==0
   assert dialog.get_by_role('link',name='Enter Sailor Harbor',exact=True).get_attribute('href')=='model-explorer.html?environment=plot-deed-dock&autoplay=1'
   assert dialog.locator('svg').get_attribute('aria-label')=='Neon Docks locations, roads and portal buildings'
   assert dialog.evaluate('(el)=>el.scrollWidth<=el.clientWidth+1')
   dialog.get_by_role('button',name='Close',exact=True).click();assert not dialog.is_visible();page.wait_for_function("document.querySelector('.district-map-toggle').getAttribute('aria-expanded')==='false'")
   page.evaluate("localMap.update({id:'ordinary-room',name:'Room'})");assert not button.is_visible();assert not errors,errors
   page.close()
  browser.close()
 print('District maps show the actual local scene and regional deed identity/link, exclude other districts, fit mobile and desktop, and close/reset cleanly.')
finally:server.shutdown()
