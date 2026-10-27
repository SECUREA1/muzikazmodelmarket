"""Challenge preparation uses the existing factory controls on touch and desktop."""
import functools
import http.server
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(root)))
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
        for width,height in [(320,568),(390,844),(1280,900)]:
            page=browser.new_page(viewport={'width':width,'height':height})
            errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.goto(base+'/README.md')
            page.set_content('<!doctype html><main id="stage"></main>')
            page.evaluate('''async base=>{
              const {mountWorldSupplyUI}=await import(base+'/public/js/world-supply-ui.js');
              window.calls=[];
              const goal={id:'rocket-convoy',name:'Rocket supply convoy',description:'Deliver sealed game collectibles.',itemId:'rocket',itemName:'Cargo rocket',quantity:4,sourceMapId:'factory',destinationMapId:'range',destinationName:'Proving grounds',shippingMapId:'hormuz-shipping',contractId:'gulf-gateway',minimumQuality:90,availableStock:8,destinationStock:0,completionCount:0};
              window.data={catalog:[{id:'rocket',name:'Cargo rocket',recipe:{name:'Rocket model assembly',unitsPerContainer:1,stages:[]}}],maps:[{id:'world',name:'World',stock:{}},{id:'range',name:'Proving grounds',stock:{}}],worldStock:{rocket:1000},factoryStock:{rocket:8},production:[],shipments:[],challenges:[goal],shippingMaps:[{id:'hormuz-shipping',name:'Strait'}],routes:[{id:'gulf-gateway',name:'Gulf gateway',units:4}],rules:{maxQuantity:10000},serverTime:Date.now()};
              window.ui=mountWorldSupplyUI({stage:document.querySelector('#stage'),inventory:{session:async()=>({csrfToken:'test-csrf'}),api:async(path,options)=>{if(!options)return structuredClone(data);const body=JSON.parse(options.body);calls.push({path,body});return {priceMzk:1000,buildMs:1000,message:'Saved'};}}});
              ui.update({players:{captain:{}}},'captain',{id:'hormuz-shipping'});ui.open();
            }''',base)
            page.locator('[data-prepare-challenge]').wait_for()
            page.locator('[data-prepare-challenge]').click()
            assert page.locator('[data-quantity]').input_value()=='4'
            assert page.locator('[data-destination]').input_value()=='range'
            assert '90%' in page.locator('[data-selected-challenge]').inner_text()
            page.locator('[data-dispatch]').click()
            page.wait_for_function('calls.some(row=>row.path.endsWith("/dispatch"))')
            assert page.evaluate('calls.find(row=>row.path.endsWith("/dispatch")).body.challengeId')=='rocket-convoy'
            page.wait_for_function('!document.querySelector("[data-quantity]").disabled')
            page.locator('[data-quantity]').fill('2')
            assert page.locator('[data-selected-challenge]').inner_text()==''
            page.locator('[data-dispatch]').click()
            page.wait_for_function('calls.filter(row=>row.path.endsWith("/dispatch")).length===2')
            assert page.evaluate('!("challengeId" in calls.filter(row=>row.path.endsWith("/dispatch"))[1].body)')
            page.wait_for_function('!document.querySelector("[data-refresh]").disabled')
            page.evaluate('data.shipments=[{id:"done",itemId:"rocket",quantity:4,sourceMapId:"factory",destinationMapId:"range",shippingMapId:"hormuz-shipping",contractId:"gulf-gateway",phase:"delivered",challenge:data.challenges[0],challengeResult:{completed:true,message:"Rocket supply convoy completed"}}]')
            page.locator('[data-refresh]').click()
            page.locator('[data-task-filter]').select_option('delivered')
            page.wait_for_function('document.querySelector("[data-shipments]").textContent.includes("Rocket supply convoy completed")')
            assert page.evaluate('document.querySelector(".world-supply-dialog").scrollWidth<=document.querySelector(".world-supply-dialog").clientWidth+2')
            page.screenshot(path=f'/tmp/distribution-challenges-{width}.png',full_page=True)
            page.keyboard.press('Escape')
            assert not page.locator('.world-supply-dialog').is_visible()
            assert not errors,errors
            page.close()
            print(f'PASS {width}x{height}: canonical challenge preparation, changed-quantity clearing, dispatch and completion')
        browser.close()
finally:
    server.shutdown()
