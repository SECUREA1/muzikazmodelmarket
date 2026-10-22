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
  page=browser.new_page(viewport={'width':1100,'height':850});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
  page.evaluate('''async()=>{
   const {mountDistrictMap}=await import('/public/js/district-map.js'),{airportWorld}=await import('/airport-world.mjs'),{neonMarina}=await import('/neon-marina.mjs');
   document.body.replaceChildren();const stage=document.createElement('main');document.body.append(stage);window.commands=[];
   window.map=mountDistrictMap({stage,command:async(action,fields)=>{commands.push({action,...fields});return {result:{message:'Route active.'}};},fetchAtlas:async()=>({locations:[]})});
   const port=neonMarina();window.harbor={id:'test-harbor',name:'Neon Marina',builderScene:{objects:port.objects,layoutMeta:{harbor:port.harbor,locations:port.locations}}};
   map.update(airportWorld());map.updateLive({actors:{plane:{id:'plane',modelId:'corsair-aircraft',active:true,flight:{airborne:true}}},players:{pilot:{id:'pilot',position:{x:40,y:30,z:0},vehicleId:'plane'}}},'pilot');
  }''')
  page.locator('.district-map-toggle').click();page.wait_for_selector('[data-vehicle-destination="north-runway"]')
  assert page.locator('[data-vehicle-destination]').count()==3
  page.screenshot(path='/workspace/airport-route-preview.png')
  page.locator('[data-vehicle-destination="north-runway"]').click()
  assert page.evaluate('commands.at(-1).action')=='vehicle-navigate'
  assert page.evaluate('commands.at(-1).destinationId')=='north-runway'
  assert page.locator('.district-map-dialog').is_visible(), 'Starting a route must keep the map open'
  page.locator('.district-map-dialog').get_by_role('button',name='Close',exact=True).click()
  page.evaluate("map.update(harbor);map.updateLive({actors:{boat:{id:'boat',modelId:'harbor-yacht',active:true}},players:{pilot:{id:'pilot',position:{x:141,y:.35,z:99},vehicleId:'boat'}}},'pilot')")
  page.locator('.district-map-toggle').click();page.wait_for_selector('[data-vehicle-destination="beacon-east-dock"]')
  assert page.locator('[data-vehicle-destination]').count()==4
  page.locator('[data-vehicle-destination="palm-south-dock"]').click()
  assert page.evaluate('commands.at(-1).destinationId')=='palm-south-dock'
  assert page.locator('.district-map-dialog').is_visible()
  assert not errors,errors
  browser.close()
 print('Map buttons select relevant aircraft and yacht automatic routes successfully.')
finally:server.shutdown()
