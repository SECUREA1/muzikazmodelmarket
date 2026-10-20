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
  for width in [320,1024]:
   page=browser.new_page(viewport={'width':width,'height':844});page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/nearby-action-buttons.html')
   page.evaluate('''async()=>{document.body.innerHTML='<link rel="stylesheet" href="/public/assets/game-menus.css"><link rel="stylesheet" href="/public/css/main-market-filters.css"><style>body{margin:0;background:#102018;padding:8px}.game-market-popup{max-width:calc(100vw - 16px);width:900px;box-sizing:border-box}button{min-height:44px}</style>';window.marketRequests=[];window.MZKWallet={walletId:()=> 'account:test'};window.items=[{id:'wood',sku:'material:wood',name:'Wood block',kind:'material',materialId:'wood',basic:true,owned:true,priceMzk:0,useCostMzk:0},{id:'gold',sku:'material:gold',name:'Gold block',kind:'material',materialId:'gold',basic:false,owned:false,unitPriceMzk:50,priceMzk:50,useCostMzk:50,stock:0}];window.catalog=[{id:'model-1',name:'Character model',source:'model',category:'Models',priceUsd:5,priceMzk:500,model:{id:'repository-character-1',name:'Character model',modelUrl:'/test-model.glb'}},{id:'land-1',name:'Studio Ridge',source:'land',category:'Land',claimed:true,playUrl:'/model-explorer.html?environment=plot-test',thumbnailUrl:'/public/assets/muzikaz-world-map.svg'}];window.MUZIKAZ_API={fetch:async(path,options={})=>{marketRequests.push({path,...options});let data;if(path==='/api/market/session')data={owner_id:'account:test',account:{accountId:'test'},csrfToken:'token'};else if(path==='/api/economy')data={balance:500,items,bundles:[]};else if(path==='/api/wallet/state')data={tokens:{MZK:500},items:[]};else if(path==='/api/economy/materials/buy'){items[1].owned=true;items[1].stock=1;data={balanceAfterMzk:450};}else if(path==='/api/market/catalog')data=catalog;else data=[];return {ok:true,json:async()=>({success:true,data})};}};const {createGameMarketplace}=await import('/public/js/in-game-market.js');window.usedItems=[];window.market=createGameMarketplace({canUse:()=>true,onUse:async item=>usedItems.push(item.sku)});market.open('upgrades',{sku:'material:gold'});}''')
   page.wait_for_selector('.market-workspace-item');assert page.locator('.is-market-selected h3').inner_text()=='Gold block';assert page.locator('.market-workspace-item').count()==1
   page.get_by_role('button',name='Buy materials',exact=True).click();page.wait_for_function('marketRequests.some(request=>request.path==="/api/economy/materials/buy")')
   payload=page.evaluate('JSON.parse(marketRequests.find(request=>request.path==="/api/economy/materials/buy").body)');assert payload['sku']=='material:gold' and payload['quantity']==1 and payload['expectedPriceMzk']==50
   page.wait_for_function('!document.querySelector("[data-market-body]").hasAttribute("aria-busy")');page.get_by_role('button',name='Use / edit in game',exact=True).click();assert page.evaluate('usedItems')==['material:gold'];page.evaluate('market.close()')
   page.evaluate('''async()=>{const root=document.createElement('section');root.dataset.sharedMarketCatalog='';document.body.append(root);await import('/public/js/shared-market-catalog.js');}''')
   root=page.locator('[data-shared-market-catalog]');root.locator('.market-workspace-item').first.wait_for();assert root.locator('.is-market-selected strong').first.inner_text()=='Character model'
   root.get_by_role('button',name='Add to cart',exact=True).click();cart=page.evaluate('JSON.parse(localStorage.getItem("muzikazCheckoutCart"))');assert cart[0]['deliverable']['id']=='character-1' and cart[0]['price']==5
   root.get_by_label('Browse market items',exact=True).fill('2');assert root.locator('.is-market-selected strong').first.inner_text()=='Studio Ridge';assert root.get_by_role('button',name='Enter plot',exact=True).is_visible()
   if width<=650:root.locator('.market-filter-menu>summary').click()
   root.locator('[data-catalog-source]').select_option('land');assert root.locator('.market-workspace-item').count()==1;assert root.locator('.is-market-selected strong').first.inner_text()=='Studio Ridge'
   box=root.locator('.market-workspace').bounding_box();assert box['x']+box['width']<=width+1;page.close()
  browser.close()
 print('In-game exact-item checkout, public model cart delivery, land links and source filtering passed on mobile and desktop.')
finally:server.shutdown()
