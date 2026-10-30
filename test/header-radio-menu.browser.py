from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os
os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  for width in [320,390,1280]:
   page=browser.new_page(viewport={'width':width,'height':800})
   page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
   page.evaluate('''async()=>{
    const {mountDoomsdayUI}=await import('/public/js/doomsday-ui.js');
    const {mountGameDisplayFlow}=await import('/public/js/game-display-flow.js');
    const {stepDoomsday,doomsdayView}=await import('/public/js/doomsday-rules.js');
    window.env={id:'header-test',spawn:{x:0,y:0,z:0}};window.sim={};window.clock=100000;
    stepDoomsday(sim,env,clock,{players:[{id:'p',health:100,position:{x:20,y:0,z:20}}],random:()=>0});
    const stage=document.querySelector('.house-stage');
    window.flow=mountGameDisplayFlow(stage);
    window.ui=mountDoomsdayUI({stage,getEnvironment:()=>env,getState:()=>doomsdayView(sim,env),getPosition:()=>({x:20,y:0,z:20}),now:()=>clock});ui.tick(0);
   }''')
   more=page.get_by_role('button',name='More view controls',exact=True)
   more.wait_for(state='visible')
   chip=page.get_by_role('button',name='Show emergency guide',exact=True)
   assert chip.is_hidden()
   page.evaluate('clock=sim.doomsday.nextEventAt')
   page.evaluate('''async()=>{const {stepDoomsday}=await import('/public/js/doomsday-rules.js');stepDoomsday(sim,env,clock,{players:[{id:'p',health:100,position:{x:20,y:0,z:20}}]});ui.tick(1);}''')
   assert page.locator('.doomsday-guide').is_hidden()
   assert page.locator('.doomsday-banner').is_hidden()
   more.click();chip.click()
   panel=page.locator('.doomsday-guide');assert panel.is_visible()
   assert panel.evaluate("n=>!!n.closest('.game-view-overflow')")
   assert page.get_by_role('switch',name='Sirens and explosions',exact=True).is_visible()
   more.click();assert panel.is_hidden() and chip.is_hidden()
   more.click();assert panel.is_visible()
   page.get_by_role('button',name='Hide emergency guide',exact=True).click()
   assert panel.is_hidden() and chip.is_visible()
   print(f'{width}px: header dropdown contains radio controls; events never open it; toggle and hide work',flush=True)
   page.close()
  browser.close()
finally:server.shutdown()
