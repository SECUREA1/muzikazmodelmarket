"""Isolated browser coverage for factory controls, shipping acceptance and mobile layout."""
import functools
import http.server
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):
        pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
        try:
            page=browser.new_page(viewport={'width':1280,'height':1000})
            errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.goto(base+'/README.md')
            page.set_content('<!doctype html><html><head><style>body{margin:0}#stage{width:100%;min-height:200px}</style></head><body><main id="stage"></main></body></html>')
            page.evaluate('''async base=>{
              const {mountWorldSupplyUI}=await import(base+'/public/js/world-supply-ui.js');
              window.calls=[];window.shippingOpened=0;
              window.supplyData={catalog:Array.from({length:70},(_,i)=>({id:'native:item-'+i,name:'Native item '+i,buildAssetId:'item-'+i,priceMzk:50})),worldStock:{'native:item-0':1000},factoryStock:{'native:item-0':50},maps:[{id:'world',name:'World stock',stock:{}},{id:'hormuz-shipping',name:'Shipping map',stock:{'native:item-0':7}},{id:'city',name:'City store inventory',stock:{}}],production:[{id:'unfinished',itemId:'native:item-0',quantity:3,phase:'building',readyAt:Date.now()+60000}],shipments:[],rules:{bulkDiscountPercent:20,bulkMinimum:10},routes:[{id:'gulf-gateway',name:'Gulf gateway supply run'}],serverTime:Date.now()};
              const inventory={session:async()=>({csrfToken:'fixture-csrf'}),api:async(path,options)=>{
                if(!options)return structuredClone(supplyData);
                const body=JSON.parse(options.body);calls.push({path,body,csrf:options.headers['X-CSRF-Token']});
                if(path.endsWith('/quote'))return {priceMzk:400,subtotalMzk:500,discountPercent:20,buildMs:2000};
                if(path.endsWith('/produce'))supplyData.production.push({id:'p1',itemId:body.itemId,quantity:body.quantity,phase:'ready',readyAt:Date.now()});
                if(path.endsWith('/dispatch')){supplyData.factoryStock[body.itemId]-=body.quantity;supplyData.shipments.push({id:'s1',...body,phase:'queued'});}
                if(path.endsWith('/cancel')){if(body.productionId)supplyData.production.find(row=>row.id===body.productionId).phase='cancelled';else supplyData.shipments[0].phase='cancelled';}
                return {message:'Saved'};
              }};
              window.supplyUI=mountWorldSupplyUI({stage:document.querySelector('#stage'),inventory,command:async(action,fields)=>{calls.push({action,fields});return {selfId:'captain'};},onShipping:()=>shippingOpened++});
              supplyUI.update({},'captain',{id:'hormuz-shipping',name:'Shipping map'});
            }''',base)
            page.get_by_role('button',name='World item factory',exact=True).click()
            panel=page.locator('#world-supply-panel')
            page.wait_for_function('document.querySelector("[data-item]").options.length===70')
            assert page.locator('dialog.world-supply-dialog').evaluate('(node)=>node.open')
            assert 'World: 1,000' in panel.locator('[data-counts]').inner_text()
            assert 'This map: 7' in panel.locator('[data-counts]').inner_text()
            assert panel.locator('[data-stock] tr').count()==30
            panel.get_by_role('button',name='Cancel production & refund',exact=True).click()
            page.wait_for_function('document.querySelector("[data-production]").textContent.includes("cancelled")')
            assert page.evaluate('calls.some(call=>call.body?.productionId==="unfinished")')
            panel.get_by_role('button',name='Next',exact=True).click()
            assert panel.locator('[data-page]').inner_text()=='Page 2 of 3'
            panel.get_by_role('button',name='Get price',exact=True).click()
            page.wait_for_function('!document.querySelector("[data-produce]").disabled')
            assert '400 MZK' in panel.locator('[data-price]').inner_text()
            assert '20%' in panel.locator('[data-price]').inner_text()
            panel.get_by_role('button',name='Start production',exact=True).click()
            page.wait_for_function('document.querySelector("[data-production]").textContent.includes("Ready in factory stock")')
            produce=page.evaluate('calls.find(call=>call.path?.endsWith("/produce"))')
            assert produce['csrf']=='fixture-csrf'
            assert produce['body']['quantity']==10 and produce['body']['expectedPriceMzk']==400
            assert produce['body']['requestId']
            panel.locator('[data-destination]').select_option('city')
            assert panel.locator('[data-source]').input_value()=='factory'
            panel.locator('[data-source]').select_option('city')
            assert panel.locator('[data-dispatch]').is_disabled()
            panel.locator('[data-source]').select_option('hormuz-shipping')
            assert panel.locator('[data-dispatch]').is_disabled()
            panel.locator('[data-quantity]').fill('7')
            assert panel.locator('[data-dispatch]').is_enabled()
            assert '7 units' in panel.locator('[data-source-count]').inner_text()
            panel.locator('[data-quantity]').fill('10')
            panel.locator('[data-source]').select_option('world')
            assert panel.locator('[data-dispatch]').is_enabled()
            panel.locator('[data-source]').select_option('factory')
            panel.get_by_role('button',name='Dispatch selected item & quantity',exact=True).click()
            page.wait_for_function('document.querySelector("[data-accept]")')
            assert 'City store inventory' in panel.locator('[data-shipments]').inner_text()
            assert page.evaluate('calls.find(call=>call.path?.endsWith("/dispatch")).body.sourceMapId')=='factory'
            assert panel.get_by_role('button',name='Return cargo to source',exact=True).count()==1
            panel.get_by_role('button',name='Accept shipping task',exact=True).click()
            page.wait_for_function('shippingOpened===1')
            assert not page.locator('dialog.world-supply-dialog').evaluate('(node)=>node.open')
            accepted=page.evaluate('calls.find(call=>call.action==="shipping")')
            assert accepted['fields']=={'operation':'accept','contractId':'gulf-gateway','shipmentId':'s1'}
            page.set_viewport_size({'width':390,'height':844})
            page.get_by_role('button',name='World item factory',exact=True).click()
            panel.locator('[data-search]').fill('item-0')
            assert panel.locator('[data-item] option').count()==1
            assert panel.locator('[data-stock] tr').count()==1
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),page.evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})')
            assert panel.evaluate('(node)=>node.scrollWidth<=node.clientWidth+1')
            panel.locator('[data-quote]').focus()
            page.keyboard.press('Escape')
            page.wait_for_function('!document.querySelector("dialog.world-supply-dialog").open')
            assert not page.locator('dialog.world-supply-dialog').evaluate('(node)=>node.open')
            assert not errors,errors
            print('World supply UI: stock pagination, authenticated production/cancellation/dispatch, real shipping acceptance, mobile layout and Escape passed.')
            shell_requests=[]
            hockey_map={'id':'hockey-arena','name':'Hockey','multiplayer':False,'game':'hockey','builderScene':{'layout':'hockey-arena','gameplay':{'hockey':{'enabled':True}}},'hockey':{'enabled':True}}
            def shell_api(route):
                path=route.request.url
                if '/api/world-supply' in path:
                    shell_requests.append(path)
                    current='hockey-arena' if 'hockey-arena' in path else 'neon-junction'
                    route.fulfill(json={'success':True,'data':{'catalog':[{'id':'native:crate','name':'Supply crate','buildAssetId':'crate'}],'worldStock':{'native:crate':1000},'factoryStock':{},'maps':[{'id':current,'name':current,'stock':{}}],'production':[],'shipments':[],'routes':[{'id':'gulf-gateway','name':'Gulf gateway'}],'shippingMaps':[{'id':'hormuz-shipping','name':'Hormuz'}]}})
                elif path.split('?')[0].endswith('/api/health'):
                    route.fulfill(json={'success':True,'service':'muzikaz-member-market'})
                elif path.split('?')[0].endswith('/api/environments'):
                    route.fulfill(json={'success':True,'data':[hockey_map]})
                else:
                    route.fulfill(status=404,json={'success':False,'message':'Offline fixture'})
            shell=browser.new_page(viewport={'width':390,'height':844})
            shell_errors=[]
            shell.on('pageerror',lambda error:shell_errors.append(str(error)))
            shell.route('**/api/**',shell_api)
            shell.goto(base+'/hockey.html?mode=solo',wait_until='domcontentloaded')
            shell.wait_for_function('window.MuzikazHockey?.snapshot().ready',timeout=45000)
            shell.locator('.hockey-access-bar .world-supply-toggle').click()
            shell.wait_for_function('document.querySelector("[data-item]").options.length===1')
            assert shell.locator('.world-supply-dialog').is_visible()
            shell.keyboard.press('Escape')
            shell.locator('#start').click()
            shell.wait_for_function('MuzikazHockey.snapshot().running')
            shell.get_by_role('button',name='Game actions',exact=True).click()
            shell.locator('.rad-controller-actions .world-supply-toggle').click()
            assert shell.locator('.world-supply-dialog').is_visible()
            assert shell.locator('.rad-controller-menu[open]').count()==0
            shell.keyboard.press('Escape')
            assert shell.evaluate('MuzikazHockey.snapshot().running')
            shell.goto(base+'/arcade.html?environment=neon-junction&mode=solo',wait_until='domcontentloaded')
            shell.wait_for_function('window.NeonJunction&&document.body.classList.contains("arcade-dashboard")',timeout=45000)
            shell.get_by_role('button',name='World item factory',exact=True).click()
            shell.wait_for_function('document.querySelector("[data-item]").options.length===1')
            assert shell.locator('.world-supply-dialog').is_visible()
            assert 'World: 1,000' in shell.locator('[data-counts]').inner_text()
            shell.keyboard.press('Escape')
            assert not shell.locator('.world-supply-dialog').is_visible()
            assert any('mapId=hockey-arena' in path for path in shell_requests)
            assert any('mapId=neon-junction' in path for path in shell_requests)
            assert not shell_errors,shell_errors
            shell.close()
            print('Standalone hockey pre-match and live-game actions plus arcade shell expose map-scoped factory controls.')

        finally:
            browser.close()
finally:
    server.shutdown()
