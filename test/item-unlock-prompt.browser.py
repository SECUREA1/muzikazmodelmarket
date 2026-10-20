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
  for width in [320,390,1024]:
   page=browser.new_page(viewport={'width':width,'height':640});page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/nearby-action-buttons.html')
   page.evaluate('''async()=>{const style=document.createElement('link');style.rel='stylesheet';style.href='/public/assets/game-menus.css';document.head.append(style);const {createItemUnlockPrompt}=await import('/public/js/item-unlock-prompt.js');window.purchases=[];window.ready=[];window.market=[];window.fail=false;window.promptUI=createItemUnlockPrompt({getItem:sku=>({sku,name:'Gold brick',kind:'material',unitPriceMzk:50,basic:false}),inventory:{buyMaterials:async(...args)=>{purchases.push(args);if(window.fail)throw Error('Insufficient MZK');await new Promise(resolve=>window.finishPurchase=resolve);return {ok:true};}},onMarket:sku=>market.push(sku),onPurchased:sku=>ready.push(sku)});promptUI.open('material:gold');}''')
   dialog=page.get_by_role('dialog',name='Gold brick');dialog.wait_for();buy=dialog.get_by_role('button',name='Buy now · 50 MZK');buy.click();assert buy.is_disabled();assert page.evaluate('purchases.length')==1
   page.evaluate('finishPurchase()');page.wait_for_function('ready.length===1');assert page.evaluate('purchases[0]')==['material:gold',1,50]
   page.evaluate("promptUI.open('material:gold')");dialog.get_by_role('button',name='View in marketplace').click();assert page.evaluate('market')==['material:gold'];assert not dialog.is_visible()
   page.evaluate("window.fail=true;promptUI.open('material:gold')");buy.click();page.get_by_role('status').filter(has_text='Insufficient MZK').wait_for();assert dialog.is_visible();assert buy.is_enabled()
   box=dialog.bounding_box();assert box['x']>=0 and box['x']+box['width']<=width
   dialog.get_by_role('button',name='Keep browsing').click();assert not dialog.is_visible();page.close()
  browser.close()
 print('Buy-now prompt, settlement arguments, duplicate protection, market link and failure recovery passed at 320, 390 and 1024px.')
finally:server.shutdown()
