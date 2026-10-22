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
  page=browser.new_page(viewport={'width':390,'height':760});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
  page.evaluate('''async()=>{document.body.innerHTML='<main data-shared-market-catalog></main>';const data=await (await fetch('/public/models/backpack-assets.json')).json();window.catalog=data.assets.filter(a=>['alpine-quad','grand-tourer','touring-motorcycle'].includes(a.buildAssetId)).map(a=>({...a,id:'upgrade:backpack:'+a.id,sku:'backpack:'+a.id,assetType:'vehicles',source:'upgrade',kind:'asset',category:'Backpack · vehicles',priceMzk:500,priceUsd:5}));window.MUZIKAZ_API={fetch:async()=>({ok:true,json:async()=>({success:true,data:catalog})})};localStorage.removeItem('muzikazCheckoutCart');await import('/public/js/shared-market-catalog.js');}''')
  page.get_by_role('button',name='Store checkout',exact=True).first.wait_for()
  assert page.locator('[data-catalog-cart]').count()==3
  for index in range(3):
   page.get_by_label('Browse market items',exact=True).fill(str(index+1))
   page.get_by_role('button',name='Store checkout',exact=True).click()
  cart=page.evaluate("JSON.parse(localStorage.getItem('muzikazCheckoutCart'))")
  assert len(cart)==3
  assert {line['deliverable']['buildAssetId'] for line in cart}=={'alpine-quad','grand-tourer','touring-motorcycle'}
  assert all(line['deliverable']['format']=='procedural-3d' and line['price']==5 for line in cart)
  assert page.get_by_role('link',name='Open checkout',exact=True).get_attribute('href')=='checkout.html'
  assert not errors,errors
  browser.close()
 print('All road vehicles appear in the mobile store and add native driving deliverables to checkout with the correct base price.')
finally:server.shutdown()
