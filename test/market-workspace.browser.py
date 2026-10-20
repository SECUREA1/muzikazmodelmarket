from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os,base64,struct
os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
  vertices=struct.pack('<9f',-1,-1,0,1,-1,0,0,1,0)
  gltf={'asset':{'version':'2.0'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'mesh':0}],'meshes':[{'primitives':[{'attributes':{'POSITION':0}}]}],'buffers':[{'byteLength':len(vertices),'uri':'data:application/octet-stream;base64,'+base64.b64encode(vertices).decode()}],'bufferViews':[{'buffer':0,'byteLength':len(vertices)}],'accessors':[{'bufferView':0,'componentType':5126,'count':3,'type':'VEC3','min':[-1,-1,0],'max':[1,1,0]}]}
  for width in [320,390,768,1280]:
   page=browser.new_page(viewport={'width':width,'height':844});page.route('**/workspace-triangle.gltf',lambda route:route.fulfill(json=gltf));page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/nearby-action-buttons.html')
   page.evaluate('''async()=>{document.body.innerHTML='<style>body{margin:0;padding:8px;background:#102018;box-sizing:border-box}button{color:#eef8e8;background:#213822;border:1px solid #789560;min-height:44px;border-radius:8px}*{box-sizing:border-box}</style><main id="catalog"></main>';const {marketItemPreview,hydrateMarketPreviews}=await import('/public/js/market-item-preview.js');const {organizeMarketWorkspace}=await import('/public/js/market-workspace.js');window.records=[{id:'wood',sku:'material:wood',name:'Wood block',materialId:'wood',kind:'material',category:'Building materials'},{id:'model',name:'Character GLB',source:'model',model:{name:'Character GLB',modelUrl:'/workspace-triangle.gltf',thumbnailUrl:'/public/assets/muzikaz-world-logo.svg'}},{id:'land',name:'Studio Ridge',source:'land',category:'Land and deeds',thumbnailUrl:'/public/assets/muzikaz-world-map.svg'}];window.actions=[];const root=document.querySelector('#catalog');root.innerHTML=records.map((item,index)=>`<article data-market-row>${marketItemPreview(item)}<div><h3>${item.name}</h3><p>${item.category||item.source}</p></div><div class="game-market-actions"><button data-sale="${item.id}">Buy ${item.name}</button></div></article>`).join('');root.addEventListener('click',event=>{const button=event.target.closest('[data-sale]');if(button)actions.push(button.dataset.sale);});window.refreshWorkspace=()=>organizeMarketWorkspace(root,{rowSelector:'[data-market-row]',records});refreshWorkspace();hydrateMarketPreviews(root);}''')
   page.wait_for_function("getComputedStyle(document.querySelector('.market-workspace')).display==='grid'")
   left=page.locator('.market-workspace-sidebar').bounding_box();right=page.locator('.market-workspace-detail').bounding_box();assert left['x']+left['width']<=right['x'] and right['x']+right['width']<=width
   page.get_by_role('button',name='Buy Wood block',exact=True).click();assert page.evaluate('actions')==['wood']
   page.locator('.market-preview-tuning summary').click();page.wait_for_selector('canvas[aria-label="Wood block interactive 3D preview"]',timeout=20000)
   rotation=page.get_by_label('Preview rotation',exact=True);rotation.fill('75');assert rotation.input_value()=='75'
   page.get_by_role('button',name='Character GLB model',exact=False).first.click();assert page.locator('.is-market-selected h3').inner_text()=='Character GLB'
   page.locator('.is-market-selected .market-preview-tuning summary').click();page.wait_for_selector('canvas[aria-label="Character GLB interactive 3D preview"]',timeout=20000)
   slider=page.get_by_label('Browse market items',exact=True);slider.fill('3');assert page.locator('.is-market-selected h3').inner_text()=='Studio Ridge';page.get_by_role('button',name='Buy Studio Ridge',exact=True).click();assert page.evaluate('actions')==['wood','land']
   toggle=page.get_by_role('button',name='Show or hide marketplace items',exact=True);toggle.click();assert not page.locator('.market-workspace-list').is_visible();toggle.click();assert page.locator('.market-workspace-list').is_visible()
   page.evaluate('document.querySelectorAll("[data-market-row]")[2].hidden=true;refreshWorkspace()');assert page.locator('.is-market-selected h3').inner_text()!='Studio Ridge';assert page.locator('.market-workspace-item').count()==2
   page.close()
  browser.close()
 print('Market split layout, item slider, model/land selection, live preview tuning, filtering and original sale actions passed at 320, 390, 768 and 1280px.')
finally:server.shutdown()
