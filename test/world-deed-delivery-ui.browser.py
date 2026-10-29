"""Factory delivery board: port receipts remain distinct from doorstep stock."""
import functools
import http.server
import threading
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}'
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
        try:
            page = browser.new_page(viewport={'width':1280, 'height':900})
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(base + '/README.md')
            page.set_content('<main id="stage"></main>')
            page.evaluate('''async base=>{
              const {mountWorldSupplyUI}=await import(base+'/public/js/world-supply-ui.js');
              window.deliveryCommands=[];window.deliveryVisits=[];
              window.deliveryFixture={ownerId:'owner',serverTime:100000,rules:{maxQuantity:10000},catalog:[{id:'native:crate',name:'Crate',priceMzk:50,recipe:{unitsPerContainer:100}}],worldStock:{'native:crate':1000},factoryStock:{},maps:[{id:'world',name:'Central inventory',stock:{}},{id:'plot-home',name:'Home plot',stock:{}},{id:'hormuz-shipping',name:'Shipping',stock:{}}],deeds:[{id:'deed-home',name:'Home',spaceId:'plot-home',destinationMapId:'plot-home'}],production:[],orders:[{id:'order-home',ownerId:'owner',deedId:'deed-home',deedName:'Home',productionId:'production',itemId:'native:crate',itemName:'Crate',quantity:30,receivedAtPortQuantity:30,deliveredQuantity:0,phase:'land-transit',shipmentIds:['shipment-home']}],shipments:[{id:'shipment-home',ownerId:'owner',orderId:'order-home',deedId:'deed-home',itemId:'native:crate',itemName:'Crate',quantity:30,phase:'land-transit',jobId:'sea-finished',seaReceipt:{id:'sea'},destinationMapId:'plot-home',shippingMapId:'hormuz-shipping',contractId:'gulf-gateway'}],routes:[{id:'gulf-gateway',name:'Gulf gateway',from:'jebel-ali',to:'bandar-abbas',units:4}],shippingMaps:[{id:'hormuz-shipping',name:'Shipping'}],deliveryTasks:[{id:'truck-home',orderId:'order-home',shipmentId:'shipment-home',itemId:'native:crate',quantity:30,crateCount:1,phase:'driving',stageProgress:.5}],deliveryRoutes:[{id:'route-home',deedId:'deed-home',mapId:'plot-home',revision:'map-v1',status:'ready',hub:{position:{x:-30,y:0,z:0}},dropoff:{kind:'doorstep',name:'Front door',mapId:'plot-home',position:{x:20,y:0,z:8}},truckWaypoints:[{x:-30,y:0,z:0},{x:20,y:0,z:0}],courierWaypoints:[{x:20,y:0,z:0},{x:20,y:0,z:8}],truckDistanceMeters:50,courierDistanceMeters:8,estimatedDurationMs:60000}]};
              const inventory={session:async()=>({csrfToken:'test'}),api:async(path,options)=>{if(options)throw Error('No write expected');return structuredClone(deliveryFixture);}};
              window.deliveryUI=mountWorldSupplyUI({stage:document.querySelector('#stage'),inventory,command:async(...args)=>deliveryCommands.push(args),onNavigate:async id=>deliveryVisits.push(id)});
              deliveryUI.update({players:{self:{vehicleId:'ship',shipping:{job:{id:'sea-finished'}}}}},'self',{id:'hormuz-shipping'});
              deliveryUI.open({deedId:'deed-home'});
            }''', base)
            panel = page.locator('#world-supply-panel')
            expect(panel.locator('[data-deed]')).to_have_value('deed-home')
            expect(panel.locator('[data-order-phase]')).to_contain_text('Truck delivery in progress')
            expect(panel.locator('[data-orders]')).to_contain_text('0 / 30 units delivered')
            expect(panel.locator('[data-orders]')).to_contain_text('30 units received at port')
            expect(panel.locator('[data-deed-delivery-route]')).to_contain_text('Truck: 50 m')
            expect(panel.locator('[data-deed-delivery-route]')).to_contain_text('Door approach: 8 m')
            assert panel.locator('[data-deed-delivery-route] polyline').count() == 2
            assert panel.locator('[data-sea-action]').count() == 0, 'A completed sea job cannot be offered again for road cargo.'
            expect(panel.locator('[data-shipments]')).to_contain_text('Automatic truck delivery underway')
            page.evaluate('''()=>{deliveryFixture.deliveryRoutes[0].status='blocked';deliveryFixture.deliveryRoutes[0].reason='A newly placed wall blocks the driveway';deliveryFixture.deliveryTasks[0].phase='blocked';deliveryFixture.deliveryTasks[0].blockedReason='A newly placed wall blocks the driveway';}''')
            panel.locator('[data-delivery-refresh]').click()
            expect(panel.locator('[data-deed-delivery-route]')).to_contain_text('A newly placed wall blocks the driveway')
            expect(panel.locator('[data-orders]')).to_contain_text('Cargo held · route needs clearance')
            expect(panel.locator('[data-orders]')).to_contain_text('0 / 30 units delivered')
            page.set_viewport_size({'width':390, 'height':844})
            assert panel.evaluate('(node)=>node.scrollWidth<=node.clientWidth+1')
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            panel.locator('[data-deed-delivery-route] [data-delivery-navigate]').click()
            page.wait_for_function('deliveryVisits[0]==="plot-home"')
            assert not page.locator('dialog.world-supply-dialog').evaluate('(node)=>node.open')
            assert page.evaluate('deliveryCommands.length') == 0
            page.evaluate('''()=>{deliveryFixture.deliveryRoutes[0].status='ready';deliveryFixture.orders[0].phase='delivered';deliveryFixture.orders[0].deliveredQuantity=30;deliveryFixture.shipments[0].phase='delivered';Object.assign(deliveryFixture.deliveryTasks[0],{phase:'delivered',deliveredAt:100000});deliveryFixture.maps.find(row=>row.id==='plot-home').stock['native:crate']=30;deliveryUI.open({deedId:'deed-home'});}''')
            expect(panel.locator('[data-orders]')).to_contain_text('30 / 30 units delivered')
            expect(panel.locator('[data-orders]')).to_contain_text('Drop-off confirmed')
            assert not errors, errors
            print('Deed delivery board: port/truck/dropoff distinction, current route recalculation, blocked cargo, navigation and mobile layout passed.')
        finally:
            browser.close()
finally:
    server.shutdown()
