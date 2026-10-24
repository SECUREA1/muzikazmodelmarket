"""Verify dynamic Builder and purchased-equipment UI without a WebGL scene.

The UI uses authoritative snapshots while a fake command transport records exact
instance IDs. Server geometry/settlement correctness has separate live tests.
"""
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]
base = f'http://127.0.0.1:{port}'
with tempfile.TemporaryDirectory(prefix='factory-builder-ui-') as directory:
    with open(Path(directory) / 'server.log', 'w') as log:
        server = subprocess.Popen(['node', 'server.mjs'], env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory}, stdout=log, stderr=log)
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
                try:
                    context = browser.new_context(viewport={'width': 1100, 'height': 900}, service_workers='block')
                    for _ in range(100):
                        try:
                            if context.request.get(base + '/api/health', timeout=1000).ok:
                                break
                        except Exception:
                            time.sleep(.1)
                    page = context.new_page()
                    errors = []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.route(base + '/factory-ui-harness', lambda route: route.fulfill(content_type='text/html', body='<html><body><div id="stage" style="position:relative;width:100%;height:850px"></div></body></html>'))
                    page.goto(base + '/factory-ui-harness')
                    page.evaluate('''async()=>{
                      const {mountMissileFactoryUI}=await import('/public/js/missile-factory-ui.js');
                      const {FACTORY_STATIONS,FACTORY_RECIPES}=await import('/public/js/missile-factory-config.js');
                      window.calls=[];
                      const stations=FACTORY_STATIONS.map((station,index)=>({...station,id:'factory-instance:edited-'+station.kind,position:{x:station.position.x+250,y:0,z:station.position.z-120},name:'Edited '+station.name}));
                      const self={position:{...stations[0].position},health:100,factory:{job:null,progress:{completedJobs:0},balance:2000}};
                      const room={selfId:'member',serverTime:Date.now(),actors:{},players:{member:self},factory:{stations,crew:[]}};
                      const environment={id:'ordinary-city'};
                      window.fixture={stations,self,room,environment};
                      window.ui=mountMissileFactoryUI(document.querySelector('#stage'),async(action,fields)=>{
                        window.calls.push({action,...fields});
                        if(action==='factory-start')self.factory={...self.factory,balance:1820,job:{id:'order',recipeId:'training-missile',name:FACTORY_RECIPES[0].name,status:'awaiting',stepIndex:0,steps:FACTORY_RECIPES[0].steps.map(step=>({...step,kind:step.stationId.slice(8),stationId:'factory-instance:edited-'+step.stationId.slice(8)}))}};
                        return {...room,result:{factory:self.factory,message:'Confirmed '+action}};
                      },{getPosition:()=>self.position});
                      ui.update(room,'member',environment);
                    }''')
                    page.locator('.factory-toggle').click()
                    page.locator('[data-build="training-missile"]').wait_for(state='visible')
                    page.wait_for_function('!document.querySelector("[data-build=training-missile]").disabled')
                    assert page.locator('[data-station]').count() == 6
                    assert page.locator('[data-map-station="factory-instance:edited-loading"]').count() == 1
                    page.locator('[data-build="training-missile"]').click()
                    page.wait_for_function('window.calls.some(call=>call.action==="factory-start")')
                    assert page.evaluate('window.calls.find(call=>call.action==="factory-start").stationId') == 'factory-instance:edited-procurement'
                    page.evaluate('''()=>{fixture.self.position={...fixture.stations.find(station=>station.kind==='fabrication').position};ui.update(fixture.room,'member',fixture.environment);}''')
                    page.wait_for_function('!document.querySelector("[data-work]").disabled')
                    page.locator('[data-work]').click()
                    page.wait_for_function('window.calls.some(call=>call.action==="factory-work")')
                    assert page.evaluate('window.calls.find(call=>call.action==="factory-work").stationId') == 'factory-instance:edited-fabrication'
                    # Remove the required machine from the authoritative station list.
                    page.evaluate('''()=>{fixture.room.factory.stations=fixture.stations.filter(station=>station.kind!=='fabrication');ui.update(fixture.room,'member',fixture.environment);}''')
                    assert page.locator('[data-work]').is_disabled()
                    assert page.locator('[data-station="factory-instance:edited-fabrication"]').count() == 0
                    assert page.locator('[data-map-station="factory-instance:edited-fabrication"]').count() == 0
                    assert 'unavailable' in page.locator('[data-timer]').text_content().lower()
                    # New loading/dispatch positions are followed and their IDs reach transport.
                    page.evaluate('''()=>{const station=fixture.stations.find(station=>station.kind==='loading');fixture.self.factory.job.status='haul';fixture.self.vehicleId='truck';fixture.room.actors.truck={position:{...station.position}};ui.update(fixture.room,'member',fixture.environment);}''')
                    page.wait_for_function('!document.querySelector("[data-haul]").disabled')
                    page.locator('[data-haul]').click()
                    page.wait_for_function('window.calls.some(call=>call.action==="factory-haul")')
                    assert page.evaluate('window.calls.find(call=>call.action==="factory-haul").stationId') == 'factory-instance:edited-loading'
                    page.evaluate('''()=>{const station=fixture.stations.find(station=>station.kind==='dispatch');station.position.x=900;station.position.z=-600;fixture.self.factory.job.status='ready';fixture.self.vehicleId=null;fixture.self.position={...station.position};ui.update(fixture.room,'member',fixture.environment);}''')
                    page.wait_for_function('!document.querySelector("[data-collect]").disabled')
                    page.locator('[data-collect]').click()
                    page.wait_for_function('window.calls.some(call=>call.action==="factory-collect")')
                    assert page.evaluate('window.calls.find(call=>call.action==="factory-collect").stationId') == 'factory-instance:edited-dispatch'
                    assert page.locator('[data-map-station="factory-instance:edited-dispatch"] circle').get_attribute('cx') == '900.000'
                    page.set_viewport_size({'width': 390, 'height': 844})
                    assert page.locator('.factory-dialog').evaluate('(node)=>node.scrollWidth<=node.clientWidth+1')
                    page.get_by_role('button', name='Close factory', exact=True).click()
                    page.evaluate('''()=>{fixture.room.factory.stations=[];ui.update(fixture.room,'member',fixture.environment);}''')
                    assert page.locator('.factory-toggle').is_hidden(), 'No phantom station or panel remains in ordinary worlds'
                    assert not errors, errors
                    print('Dynamic UI: ordinary-world factory equipment, moved station map, deleted machine disable, and procurement/work/load/dispatch instance command IDs all pass.')
                finally:
                    browser.close()
        finally:
            server.terminate()
            server.wait(timeout=10)
