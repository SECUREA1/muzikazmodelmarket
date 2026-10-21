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
  for width,height in [(320,568),(390,844),(844,390),(1280,800)]:
   page=browser.new_page(viewport={'width':width,'height':height});page.set_default_timeout(6000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html');page.wait_for_selector('body[data-ready=true]')
   page.evaluate('''async()=>{const {mountHarborOperations}=await import('/public/js/harbor-operations.js');const {neonMarina}=await import('/neon-marina.mjs');const marina=neonMarina();window.env={builderScene:{layoutMeta:{harbor:marina.harbor}}};window.commands=[];window.ops=mountHarborOperations({stage:document.querySelector('.house-stage'),command:async(action,fields)=>{commands.push({action,...fields});return {result:{message:'Moored safely.'}}}});ops.updateEnvironment(env);window.snapshot={players:{pilot:{vehicleId:'boat',fuel:90}},actors:{boat:{id:'boat',modelId:'harbor-sailboat',health:180,position:{x:144,y:0,z:20},rotation:{y:0},boating:{speed:4,speedKnots:7.8,heading:90,windSpeed:6.5,windDirection:35,fuel:90,rpm:1800,sailTrim:.65}}}};ops.update(snapshot,'pilot',env);}''')
   page.get_by_role('button',name='Show boat functions',exact=True).click()
   opener=page.get_by_role('button',name='Harbor navigation and helm',exact=True);opener.click();dialog=page.get_by_role('dialog',name='Harbor navigation and helm',exact=True)
   assert dialog.evaluate('(el)=>el.scrollWidth<=el.clientWidth')
   assert dialog.get_by_text('Beacon Island',exact=False).count()>0
   dialog.get_by_role('slider',name='Boat throttle').fill('-30');assert page.evaluate('ops.inputs(0).throttle')==-.3
   dialog.get_by_role('slider',name='Sail trim').fill('75');assert page.evaluate('ops.inputs(0).sailTrim')==.75
   dialog.get_by_role('button',name='Drop anchor',exact=True).click();assert page.evaluate('ops.inputs(0).anchor')==True
   dialog.get_by_role('button',name='Chase view',exact=True).click();assert page.evaluate('ops.view')=='chase';assert dialog.is_hidden()
   assert page.get_by_role('button',name='Leave stopped boat').is_disabled()
   ahead=page.get_by_role('button',name='Ahead boat');ahead.scroll_into_view_if_needed();box=ahead.bounding_box();page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2);page.mouse.down();assert page.evaluate('ops.ahead')==1;page.mouse.up();assert page.evaluate('ops.ahead')==0
   page.get_by_role('button',name='Open boat instruments',exact=True).click();dialog.get_by_role('button',name='Moor at pier',exact=True).click();assert page.evaluate('commands.at(-1).action')=='harbor-radio';assert page.evaluate('commands.at(-1).operation')=='moor'
   dialog.get_by_role('button',name='Close',exact=True).click();page.evaluate("snapshot.actors.boat.boating.speed=0;snapshot.actors.boat.boating.anchor=true;ops.update(snapshot,'pilot',env)");page.get_by_role('button',name='Leave stopped boat').click();assert page.evaluate('commands.at(-1).action')=='interact'
   assert page.locator('.harbor-helm-controls').evaluate('(el)=>el.scrollWidth<=el.clientWidth')
   page.evaluate('ops.updateEnvironment({})');assert opener.is_hidden();assert page.locator('.harbor-helm-controls').is_hidden();assert not errors,errors;page.close()
  browser.close()
 print('Harbor throttle, trim, anchor, views, mooring, safe exit, passage planner and compact layout passed at four viewport sizes.')
finally:server.shutdown()
