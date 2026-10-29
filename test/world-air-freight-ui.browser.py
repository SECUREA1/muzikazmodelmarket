"""Real factory DOM: reviewed onward mode, counted air cargo and command controls."""
import functools
import http.server
import threading
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass
server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}'
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        try:
            for width, height in [(1280, 950), (390, 844)]:
                page = browser.new_page(viewport={'width': width, 'height': height})
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.goto(base + '/README.md')
                page.set_content('<!doctype html><main id="stage"></main>')
                page.evaluate('''async base => {
                  const {mountWorldSupplyUI}=await import(base+'/public/js/world-supply-ui.js');
                  const {SHIPPING_ROUTES}=await import(base+'/public/js/shipping-config.js');
                  const {straitAirRoute}=await import(base+'/public/js/strait-freight-network.js');
                  window.calls=[];window.airRoute=straitAirRoute('fujairah');
                  window.address={id:'address:city:store',mapId:'city',mapName:'Receiving city',objectId:'store',name:'Door Store',addressLine:'9 Market Road',position:{x:9,y:0,z:4},dropoff:{position:{x:9,y:0,z:4}},owner:{kind:'member',name:'Receiving owner'},canOrder:true,revision:'reviewed-v1'};
                  window.airTask={id:'air-task',shipmentId:'sea-shipment',itemId:'native:crate',itemName:'Counted crate',quantity:37,crateCount:4,mapId:'hormuz-shipping',phase:'awaiting-pilot',route:airRoute};
                  window.live={selfId:'pilot',players:{pilot:{vehicleId:'plane'}},actors:{plane:{id:'plane',modelId:'diamond-da40',holderId:'pilot',active:true,flight:{speed:0,airspeed:0,airborne:false}}}};
                  window.workspace={ownerId:'wallet:sender',catalog:[{id:'native:crate',name:'Counted crate',buildAssetId:'crate',priceMzk:10,recipe:{unitsPerContainer:200}}],worldStock:{'native:crate':1000},factoryStock:{},maps:[{id:'world',name:'World stock',stock:{}},{id:'hormuz-shipping',name:'Strait',stock:{}},{id:'city',name:'Receiving city',stock:{}}],addresses:[],addressPage:{mapId:'hormuz-shipping',total:0,offset:0,hasMore:false},production:[],shipments:[],orders:[],airTasks:[airTask],airReceipts:[],routes:SHIPPING_ROUTES.filter(row=>row.from!==row.to&&!row.factoryExport),shippingMaps:[{id:'hormuz-shipping',name:'Strait'}],serverTime:Date.now()};
                  const inventory={session:async()=>({csrfToken:'ui-test-csrf'}),api:async(path,options)=>{
                    if(!options){if(path.includes('/addresses?'))return {addresses:[structuredClone(address)],total:1,hasMore:false};workspace.serverTime=Date.now();return structuredClone(workspace);}
                    const body=JSON.parse(options.body);calls.push({path,body});
                    if(path.endsWith('/quote'))return {priceMzk:80,unitPriceMzk:10,buildMs:2000};
                    return {id:'ui-order',productionId:'ui-production',message:'Order saved'};
                  }};
                  const command=async(action,fields)=>{
                    calls.push({action,fields});const me=live.players.pilot;
                    if(action==='world-supply-air'){
                      if(fields.operation==='reserve'){airTask.phase='reserved';airTask.reservedByMe=true;me.airFreight={airTaskId:airTask.id,aircraftId:'plane',phase:'reserved',route:airRoute};}
                      if(fields.operation==='load'){if(me.airFreight.phase==='reserved'){me.airFreight.phase='loading';me.airFreight.loadReadyAt=Date.now()+500;}else me.airFreight.phase='loaded';}
                      if(fields.operation==='secure')me.airFreight.phase='secured';
                      if(fields.operation==='unload'){if(me.airFreight.phase==='landed'){me.airFreight.phase='unloading';me.airFreight.unloadReadyAt=Date.now()+500;}else{me.airFreight.phase='delivered';airTask.phase='air-delivered';workspace.airReceipts.push({airTaskId:airTask.id,quantity:37});}}
                      if(fields.operation==='release'){me.airFreight=null;airTask.phase='awaiting-pilot';}
                    }
                    if(action==='vehicle-navigate'){me.airFreight.phase='airborne';live.actors.plane.flight.airborne=true;}
                    if(action==='aircraft-assist'&&fields.operation==='park'){live.actors.plane.flight={speed:0,airspeed:0,airborne:false};me.airFreight.phase='landed';}
                    return structuredClone(live);
                  };
                  window.ui=mountWorldSupplyUI({stage:document.querySelector('#stage'),inventory,command,onMap:details=>calls.push({map:details})});
                  ui.update(live,'pilot',{id:'hormuz-shipping',name:'Strait'});ui.open();
                }''', base)
                panel = page.locator('#world-supply-panel')
                expect(panel.locator('[data-air-task="air-task"]')).to_contain_text('Counted crate × 37')
                assert not page.evaluate('calls.length'), 'Opening a factory task cannot start a shipment or charge MZK.'
                panel.locator('[data-address-map]').select_option('city')
                expect(panel.locator('[data-address] option')).to_have_count(2)
                panel.locator('[data-address]').select_option('address:city:store')
                panel.locator('[data-quote]').click()
                expect(panel.locator('[data-address-order]')).to_be_enabled()
                panel.locator('[data-onward-mode]').select_option('air')
                expect(panel.locator('[data-address-order]')).to_be_disabled()
                expect(panel.locator('[data-onward-plan]')).to_contain_text('verified flight')
                panel.locator('[data-quote]').click()
                expect(panel.locator('[data-address-order]')).to_be_enabled()
                panel.locator('[data-address-order]').click()
                page.wait_for_function('calls.some(call=>call.path?.endsWith("/order-address"))')
                order = page.evaluate('calls.find(call=>call.path?.endsWith("/order-address")).body')
                assert order['onwardMode'] == 'air' and order['addressId'] == 'address:city:store' and order['expectedAddressRevision'] == 'reviewed-v1'
                panel.locator('[data-source]').select_option('world')
                panel.locator('[data-dispatch]').click()
                page.wait_for_function('calls.some(call=>call.path?.endsWith("/dispatch"))')
                assert page.evaluate('calls.find(call=>call.path?.endsWith("/dispatch")).body.onwardMode') == 'air'
                panel.locator('[data-route]').select_option('island-provisions')
                expect(panel.locator('[data-address-order]')).to_be_disabled()
                expect(panel.locator('[data-dispatch]')).to_be_disabled()
                expect(panel.locator('[data-onward-plan]')).to_contain_text('no approved airfield')
                panel.locator('[data-onward-mode]').select_option('road')
                panel.locator('[data-route]').select_option('gulf-gateway')
                air = panel.locator('[data-air-task="air-task"]')
                air.locator('[data-air-action="reserve"]').click()
                expect(air.locator('[data-air-action="load"]')).to_be_enabled()
                air.locator('[data-air-action="load"]').click()
                expect(air.locator('[data-air-action="load"]')).to_be_disabled()
                expect(air.locator('[data-air-action="load"]')).to_be_enabled(timeout=4000)
                air.locator('[data-air-action="load"]').click()
                expect(air.locator('[data-air-action="secure"]')).to_be_enabled()
                air.locator('[data-air-action="secure"]').click()
                expect(air.locator('[data-air-action="fly"]')).to_be_enabled()
                air.locator('[data-air-action="fly"]').click()
                page.wait_for_function('calls.some(call=>call.action==="vehicle-navigate")')
                assert page.evaluate('calls.find(call=>call.action==="vehicle-navigate").fields.destinationId') == page.evaluate('airRoute.destination.runwayId||airRoute.destination.id')
                page.evaluate('''() => {live.players.pilot.airFreight.phase='approach';live.actors.plane.position={...airRoute.destination.cargoApron};live.actors.plane.flight={speed:3,airspeed:3,airborne:false};ui.update(structuredClone(live),'pilot',{id:'hormuz-shipping',name:'Strait'});ui.open();}''')
                expect(air.locator('[data-air-action="park"]')).to_be_enabled()
                assert air.locator('[data-air-action="unload"]').count() == 0
                air.locator('[data-air-action="park"]').click()
                page.wait_for_function('calls.some(call=>call.action==="aircraft-assist")')
                assert page.evaluate('calls.find(call=>call.action==="aircraft-assist").fields') == {'operation': 'park'}
                expect(air.locator('[data-air-action="unload"]')).to_be_enabled()
                air.locator('[data-air-action="unload"]').click()
                expect(air.locator('[data-air-action="unload"]')).to_be_disabled()
                expect(air.locator('[data-air-action="unload"]')).to_be_enabled(timeout=4000)
                air.locator('[data-air-action="unload"]').click()
                expect(air).to_have_count(0)
                assert page.evaluate('workspace.maps.find(map=>map.id==="city").stock["native:crate"]||0') == 0
                assert page.evaluate('calls.filter(call=>call.action==="world-supply-air").every(call=>call.fields.airTaskId==="air-task")')
                page.evaluate('''() => {workspace.airTasks=Array.from({length:21},(_,i)=>({...airTask,id:'pending-'+i,phase:'awaiting-pilot'}));ui.refresh();}''')
                expect(panel.locator('[data-air-task]')).to_have_count(8)
                expect(panel.locator('[data-air-next]')).to_be_enabled()
                panel.locator('[data-air-next]').click()
                expect(panel.locator('[data-air-task]')).to_have_count(8)
                panel.locator('[data-air-next]').click()
                expect(panel.locator('[data-air-task]')).to_have_count(5)
                assert panel.evaluate('(node)=>node.scrollWidth<=node.clientWidth+1'), 'Factory air controls must fit the viewport.'
                panel.locator('[data-air-action="map"]').first.click()
                assert page.evaluate('calls.some(call=>call.map?.origin?.cargoApron&&call.map?.destination?.cargoApron)')
                assert not errors, errors
                page.evaluate('ui.dispose()')
                assert page.locator('#world-supply-panel').count() == 0
                print(f'PASS {width}px: reviewed air mode, exact command IDs, load/unload dwell, final-stock hold and bounded task pages.')
                page.close()
        finally:
            browser.close()
finally:
    server.shutdown()
