"""Luxury catalogue native previews work in the existing split marketplace."""
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
  page.evaluate('''async()=>{document.head.insertAdjacentHTML('beforeend','<link rel="stylesheet" href="/public/assets/market-workspace.css"><style>body{margin:0;background:#122c35;color:white;font:14px system-ui}*{box-sizing:border-box}</style>');document.body.innerHTML='<main id="products"></main>';const {resortBackpackProducts}=await import('/public/js/resort-products.js');const {marketItemPreview,hydrateMarketPreviews}=await import('/public/js/market-item-preview.js');const {organizeMarketWorkspace}=await import('/public/js/market-workspace.js');const records=resortBackpackProducts(),root=document.querySelector('#products');root.innerHTML=records.map(item=>`<article data-product>${marketItemPreview(item)}<h3>${item.name}</h3><p>${item.description}</p><button data-buy="${item.id}">Buy · ${item.priceMzk} MZK</button></article>`).join('');window.purchases=[];root.onclick=e=>{if(e.target.matches('[data-buy]'))purchases.push(e.target.dataset.buy)};organizeMarketWorkspace(root,{rowSelector:'[data-product]',records});hydrateMarketPreviews(root);}''')
  page.wait_for_function("getComputedStyle(document.querySelector('.market-workspace')).display==='grid'")
  assert page.locator('.market-workspace-item').count()==18
  page.locator('.market-workspace-item').filter(has_text='Alpine Velvet Chaise').click()
  page.locator('.is-market-selected .market-preview-tuning summary').click()
  page.wait_for_selector('canvas[aria-label="Alpine Velvet Chaise interactive 3D preview"]',timeout=30000)
  page.locator('.is-market-selected [data-buy]').click();assert page.evaluate('purchases')==['backpack-alpine-velvet-chaise']
  for name in ['Tideglass Cinema Cabinet','Aerie Executive Sofa']:
   page.locator('.market-workspace-item').filter(has_text=name).click()
   assert page.locator('.is-market-selected h3').inner_text()==name
  assert page.locator('.market-workspace').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
  page.set_viewport_size({'width':1280,'height':900})
  page.evaluate('''async()=>{const T=await import('/public/vendor/three/three.module.min.js');const {RESORT_PRODUCTS}=await import('/public/js/resort-products.js');const {createBuilderModel}=await import('/public/js/builder-models-3d.js');document.body.innerHTML='';const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(1280,900);document.body.append(renderer.domElement);const scene=new T.Scene();scene.background=new T.Color(0x142d37);scene.add(new T.HemisphereLight(0xf5f4ed,0x37515e,2.6));const light=new T.DirectionalLight(0xffead0,3);light.position.set(-10,15,8);scene.add(light);Object.values(RESORT_PRODUCTS).forEach((p,i)=>{const root=createBuilderModel(p.id);root.position.set((i%6-2.5)*3.6,0,(Math.floor(i/6)-1)*4.5);scene.add(root);});const floor=new T.Mesh(new T.PlaneGeometry(28,21),new T.MeshStandardMaterial({color:0x31444d,roughness:.9}));floor.rotation.x=-Math.PI/2;floor.position.y=-.02;scene.add(floor);const camera=new T.PerspectiveCamera(42,1280/900,.1,100);camera.position.set(19,17,23);camera.lookAt(0,1,0);renderer.render(scene,camera);}''')
  page.screenshot(path='/workspace/luxury-products.png')
  assert not errors,errors
  browser.close()
 print('18 luxury products: mobile split catalog, native 3D preview, selection, original buy action and product render passed.')
finally:server.shutdown()
