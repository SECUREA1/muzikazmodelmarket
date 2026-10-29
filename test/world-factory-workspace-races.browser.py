"""Deterministic workspace poll/registration and context-change regressions.

Uses the real factory UI and live designer with deferred inventory responses.
The race concerns which catalog item is charged, so it verifies the exact item
sent in the subsequent quote and deed order, beyond merely checking UI text.
"""
import functools
import http.server
import threading
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}'
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
        try:
            page = browser.new_page(viewport={'width': 1200, 'height': 950}, reduced_motion='reduce')
            page.set_default_timeout(10000)
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(base + '/README.md')
            page.set_content('<!doctype html><html><head><style>body{margin:0}#stage{width:100%;min-height:200px}</style></head><body><main id="stage"></main></body></html>')
            page.evaluate('''async base=>{
              const {mountWorldSupplyUI}=await import(base+'/public/js/world-supply-ui.js');
              const first={id:'native:first-sku',name:'First catalog item',buildAssetId:'armchair',factoryUnitPriceMzk:50,recipe:{id:'props',name:'General fabrication',unitsPerContainer:100,stages:[]}};
              window.calls=[];window.workspaceReads=[];window.registeredItemId='';window.holdNextWorkspace=false;window.holdRegistration=false;window.pendingWorkspace=null;window.pendingRegistration=null;
              window.fixtureSelf={vehicleId:null,shipping:{availableContracts:[]}};
              window.makeState=()=>({ownerId:'account:race-owner',catalog:[structuredClone(first)],transferCatalog:[],worldStock:{[first.id]:1000},factoryStock:{},maps:[{id:'world',name:'World stock',stock:{}},{id:'world-item-factory',name:'Factory',stock:{}},{id:'other-map',name:'Other map',stock:{}},{id:'hormuz-shipping',name:'Shipping map',stock:{}},{id:'plot-deed-race',name:'Race plot',stock:{}}],deeds:[{id:'deed-race',name:'Race plot deed',destinationMapId:'plot-deed-race',spaceId:'plot-deed-race'}],production:[],orders:[],shipments:[],lots:[],allocations:[],stockReceipts:[],challenges:[],rules:{bulkDiscountPercent:20,bulkMinimum:10,maxQuantity:10000},routes:[{id:'gulf-gateway',name:'Gulf gateway supply run',from:'jebel-ali',to:'bandar-abbas',units:4}],shippingMaps:[{id:'hormuz-shipping',name:'Hormuz shipping'}],serverTime:Date.now()});
              let serial=0;
              const inventory={session:async()=>({owner_id:'account:race-owner',account:{accountId:'race-owner'},csrfToken:'race-csrf'}),api:async(path,options)=>{
                if(!options){
                  if(path==='/api/wallet/state')return {items:[]};
                  if(path.startsWith('/api/world-supply/recipe'))return {recipe:structuredClone(first.recipe)};
                  if(path.startsWith('/api/world-supply/trace'))return {production:[],lots:[],allocations:[],shipments:[],stockReceipts:[],events:[]};
                  if(!path.startsWith('/api/world-supply/workspace'))throw Error('Unexpected fixture read '+path);
                  const snapshot=structuredClone(supplyData);workspaceReads.push(path);
                  if(holdNextWorkspace){holdNextWorkspace=false;return new Promise(resolve=>{pendingWorkspace={resolve,snapshot,path};});}
                  return snapshot;
                }
                const body=JSON.parse(options.body);calls.push({path,body});
                if(path==='/api/custom-items')return {...body,id:'custom-race-'+(++serial),type:'custom-item',renderKind:'image',assetType:'props',creatorId:'account:race-owner'};
                if(path.endsWith('/register-design')){
                  const customId='blueprint:custom:'+body.customItemId;
                  const register=()=>{const item={...first,id:customId,name:'New private custom blueprint',factoryVariant:true,renderKind:'image',factoryProducible:true,configuration:{color:'#89dac6',depth:28}};if(!supplyData.catalog.some(row=>row.id===customId))supplyData.catalog.push(item);registeredItemId=customId;return {itemId:customId};};
                  if(holdRegistration)return new Promise(resolve=>{pendingRegistration={resolve:()=>resolve(register()),customId};});
                  return register();
                }
                if(path.endsWith('/quote'))return {itemId:body.itemId,quantity:body.quantity,unitPriceMzk:50,subtotalMzk:500,priceMzk:400,discountPercent:20,buildMs:2000};
                if(path.endsWith('/order')){
                  const id='order-race-'+serial,productionId='production-race-'+serial,now=Date.now();
                  const order={id,productionId,ownerId:supplyData.ownerId,deedId:body.deedId,deedName:'Race plot deed',itemId:body.itemId,itemName:'New private custom blueprint',quantity:body.quantity,deliveredQuantity:0,destinationMapId:'plot-deed-race',shippingMapId:body.shippingMapId,contractId:body.contractId,shipmentIds:[],phase:'building'};
                  supplyData.orders.push(order);supplyData.production.push({id:productionId,itemId:body.itemId,orderId:id,quantity:body.quantity,phase:'building',startedAt:now,readyAt:now+60000,stages:[]});return order;
                }
                throw Error('Unexpected fixture mutation '+path);
              }};
              window.mountFixture=()=>{
                window.ui?.dispose();document.querySelector('#stage').replaceChildren();
                supplyData=makeState();calls.length=0;workspaceReads.length=0;registeredItemId='';holdNextWorkspace=false;holdRegistration=false;pendingWorkspace=null;pendingRegistration=null;
                window.ui=mountWorldSupplyUI({stage:document.querySelector('#stage'),inventory});
                ui.update({players:{self:fixtureSelf}},'self',{id:'world-item-factory',name:'Factory'});
                ui.open({deedId:'deed-race'});
              };
              window.releaseWorkspace=()=>{const pending=pendingWorkspace;pendingWorkspace=null;pending.resolve(pending.snapshot);};
              window.releaseRegistration=()=>{const pending=pendingRegistration;pendingRegistration=null;holdRegistration=false;pending.resolve();};
              mountFixture();
            }''', base)
            panel = page.locator('#world-supply-panel')

            def ready():
                expect(panel.locator('[data-item]')).to_have_value('native:first-sku')
                expect(panel.locator('[data-deed]')).to_have_value('deed-race')

            def start_design():
                panel.locator('[data-open-designer]').click()
                panel.locator('[data-design-shape="crate"]').click()
                panel.locator('[data-design-save]').click()

            ready()
            # The in-flight poll captured the old catalog before the design was
            # registered. Force-refresh must drain it, fetch the new catalog,
            # then set the selected identity, in that order.
            page.evaluate('holdNextWorkspace=true;void ui.refresh()')
            page.wait_for_function('pendingWorkspace!==null')
            start_design()
            page.wait_for_function('registeredItemId!==""')
            assert page.evaluate('pendingWorkspace.snapshot.catalog.length') == 1
            assert panel.locator('[data-item]').is_disabled()
            page.evaluate('releaseWorkspace()')
            page.wait_for_function('document.querySelector("[data-item]").value===registeredItemId&&!document.querySelector("[data-quote]").disabled')
            expected_item = page.evaluate('registeredItemId')
            expect(panel.locator('[data-design-status]')).to_contain_text('selected for production')
            panel.locator('[data-quote]').click()
            expect(panel.locator('[data-order]')).to_be_enabled()
            panel.locator('[data-order]').click()
            page.wait_for_function('calls.some(call=>call.path.endsWith("/order"))')
            mutations = page.evaluate('calls.filter(call=>call.path.endsWith("/quote")||call.path.endsWith("/order"))')
            assert len(mutations) == 2, mutations
            assert all(call['body']['itemId'] == expected_item for call in mutations), mutations
            assert mutations[1]['body']['deedId'] == 'deed-race'
            print('Old workspace poll cannot replace a newly registered custom SKU before quote/order.', flush=True)

            # A pending registration belongs to the context in which saving
            # started. Neither switching maps nor resetting can let its response
            # reselect the old design or reopen a closed dialog.
            for action in ['map', 'reset', 'dispose']:
                page.evaluate('mountFixture()')
                ready()
                page.evaluate('holdRegistration=true')
                start_design()
                page.wait_for_function('pendingRegistration!==null')
                if action == 'map':
                    page.evaluate('ui.update({players:{self:fixtureSelf}},"self",{id:"other-map",name:"Other map"})')
                    expect(panel.locator('[data-item]')).to_have_value('native:first-sku')
                    page.wait_for_function('workspaceReads.some(path=>path.endsWith("mapId=other-map"))')
                elif action == 'reset':
                    page.evaluate('ui.reset()')
                    assert not page.evaluate('ui.visible()')
                else:
                    page.evaluate('ui.dispose()')
                    assert page.locator('dialog.world-supply-dialog').count() == 0
                page.evaluate('releaseRegistration()')
                if action == 'dispose':
                    page.wait_for_function('registeredItemId!==""')
                    # Yield the promise continuation, not a wall-clock sleep.
                    page.evaluate('()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
                    assert page.locator('dialog.world-supply-dialog').count() == 0
                    assert page.locator('[data-item]').count() == 0
                else:
                    expect(panel.locator('[data-design-status]')).to_contain_text('selected for production')
                    if action == 'reset':
                        assert not page.evaluate('ui.visible()'), 'A stale save response reopened a reset workspace.'
                        page.evaluate('ui.open()')
                    expect(panel.locator('[data-item]')).to_have_value('native:first-sku')
                    assert panel.locator('[data-item]').input_value() != page.evaluate('registeredItemId')
                print(f'Stale registration ignored after workspace {action}.', flush=True)
            assert not errors, errors
            print('Factory workspace registration race regressions passed without page errors.', flush=True)
        finally:
            browser.close()
finally:
    server.shutdown()
    server.server_close()
