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
  for width in [390,1280]:
   page=browser.new_page(viewport={'width':width,'height':844});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/nearby-action-buttons.html')
   page.evaluate('''async()=>{document.body.innerHTML='<link rel="stylesheet" href="/public/assets/game-menus.css"><style>body{margin:0;background:#102018}.game-fullscreen-dialog{padding:10px!important}</style><section id="picker" aria-label="World map" hidden></section>';const {fullscreenPanel}=await import('/public/js/fullscreen-panels.js');const {mountWorldMapPicker}=await import('/public/js/world-map-picker.js');const panel=document.querySelector('#picker');const screen=fullscreenPanel(panel);window.joins=[];const ids=['neon-docks','muzikaz-airport','muzikaz-main','firing-range','basketball-arena','hockey-arena','neon-junction'];mountWorldMapPicker(panel,ids.map(id=>({env:{id,name:id,proceduralLand:true,builderScene:{layout:'grand-floor',mapSize:40,objects:[]}},count:0})),{onClose:()=>screen.close(),onJoin:async env=>joins.push(env.id)});screen.open();}''')
   page.wait_for_selector('[data-world-preview] canvas',timeout=30000)
   assert page.locator('.world-lobby-wheel').is_visible()
   assert not page.locator('[data-world-cards]').is_visible()
   assert not page.locator('.world-lobby-filter-menu').get_attribute('open')
   assert page.get_by_role('button',name='Close game and server lobby',exact=True).is_visible()==False
   left=page.locator('.world-lobby-browse').bounding_box();right=page.locator('.world-lobby-detail').bounding_box();assert left['x']+left['width']<=right['x']+.5
   page.locator('[data-world-id="muzikaz-main"]').click();assert page.locator('[data-world-name]').inner_text()=='muzikaz-main'
   page.get_by_role('button',name='☰ List',exact=True).click();assert page.locator('[data-world-cards]').is_visible()
   page.get_by_role('button',name='◉ Pie map',exact=True).click();assert page.locator('.world-lobby-wheel').is_visible()
   assert page.locator('dialog').evaluate('(el)=>el.scrollWidth<=el.clientWidth+1')
   if width==390:page.screenshot(path='/workspace/clean-world-picker-mobile.png')
   page.evaluate('''async()=>{await import('/public/js/ar-camera-preview.js');const viewer=document.createElement('model-viewer');viewer.style.cssText='display:block;width:200px;height:200px';viewer.setAttribute('src','/model.glb');document.body.append(viewer);const dialog=document.createElement('dialog');dialog.id='camera-options';const opted=viewer.cloneNode();opted.setAttribute('data-camera-preview-enabled','');dialog.append(opted);document.body.append(dialog);}''')
   page.wait_for_timeout(100);assert page.locator('[data-camera-preview]').count()==0
   page.evaluate("document.querySelector('#camera-options').showModal()")
   page.wait_for_selector('#camera-options [data-camera-preview]')
   page.evaluate("document.querySelector('#camera-options').close()")
   page.wait_for_function("document.querySelectorAll('[data-camera-preview]').length===0")
   page.evaluate('''async()=>{document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());const root=document.createElement('aside');root.id='build-browse';root.className='rad-build-menu';root.style.padding='8px';document.body.append(root);const {mountBuildAssetBrowser}=await import('/public/js/build-asset-browser.js');window.buildUI=mountBuildAssetBrowser(root,{assets:[{id:'sofa',buildAssetId:'sofa',name:'Lounge sofa',owned:true,category:'seats',description:'A shared seat'},{id:'armchair',buildAssetId:'armchair',name:'Armchair',owned:true,category:'seats',description:'A single seat'}]});window.buildActions=[];root.onclick=event=>{const button=event.target.closest('[data-build-asset]');if(button)buildActions.push(button.dataset.buildAsset);};}''')
   build=page.locator('#build-browse');build.locator('[data-build-select]').nth(1).click()
   assert build.locator('[data-build-inspector] h3').inner_text()=='Armchair'
   assert page.evaluate('buildActions')==[]
   build.get_by_role('button',name='Add to build inventory',exact=True).click();assert page.evaluate('buildActions')==['armchair']
   assert build.locator('[data-build-card]').count()==2
   build.get_by_label('Find an item',exact=True).fill('lounge');assert build.locator('[data-build-card]').count()==1
   assert build.locator('[data-build-layout]').evaluate('(el)=>el.scrollWidth<=el.clientWidth+1')
   assert not errors,errors;page.close()
  browser.close()
 print('Pie map and preview open side by side, compact filters, single close control, view toggles and contextual camera controls passed on mobile and desktop.')
finally:server.shutdown()
