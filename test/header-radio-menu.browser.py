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
   more=page.get_by_role('button',name='More view controls',exact=True);more.wait_for(state='visible')
   assert page.locator('.doomsday-guide-chip').count()==0
   panel=page.locator('.doomsday-guide');assert panel.is_hidden()
   more.click();assert panel.is_hidden()
   sound=page.get_by_role('button',name='Radio & sound',exact=True)
   sound.click();assert panel.is_visible()
   assert page.locator('#emergency-sound-panel').is_visible()
   assert sound.get_attribute('aria-expanded')=='true'
   assert page.get_by_role('switch',name='Sirens and explosions',exact=True).is_visible()
   assert 'Explore while standing by' in page.locator('[data-flow-title]').text_content()
   page.get_by_role('button',name='Emergency response flow',exact=True).click()
   assert page.locator('#emergency-flow-panel').is_visible()
   if page.locator('.doomsday-game-flow details').get_attribute('open') is None:
    page.get_by_text('View full response flow',exact=True).click()
   assert page.locator('.doomsday-game-flow details').get_attribute('open') is not None
   assert page.locator('[data-flow-step=standby]').get_attribute('aria-current')=='step'
   assert panel.evaluate("n=>!!n.closest('.game-view-overflow')")
   assert page.get_by_role('switch',name='Sirens and explosions',exact=True).is_visible()
   more.click();assert panel.is_hidden()
   page.evaluate('clock=sim.doomsday.nextEventAt')
   page.evaluate('''async()=>{const {stepDoomsday}=await import('/public/js/doomsday-rules.js');stepDoomsday(sim,env,clock,{players:[{id:'p',health:100,position:{x:20,y:0,z:20}}]});ui.tick(1);}''')
   assert more.get_attribute('aria-expanded')=='true' and panel.is_visible()
   assert page.locator('#emergency-nuclear-panel').is_visible()
   assert page.locator('.doomsday-banner').is_visible()
   assert 'shelter' in page.locator('[data-flow-title]').text_content().lower()
   assert page.locator('[data-flow-step=impacts]').get_attribute('aria-current')=='step'
   page.get_by_role('button',name='Close emergency menu',exact=True).click()
   assert panel.is_hidden() and more.get_attribute('aria-expanded')=='false'
   assert more.evaluate('n=>document.activeElement===n')
   page.evaluate('ui.open()');assert panel.is_visible()
   page.evaluate("sim.doomsday.phase='fallout';sim.doomsday.revision++;ui.tick(3)")
   assert page.locator('[data-flow-step=supplies]').get_attribute('aria-current')=='step'
   assert page.locator('[data-flow-step=recovery]').get_attribute('data-status')=='pending'
   page.evaluate("sim.doomsday.phase='recovery';sim.doomsday.objectives.find(o=>o.id==='supplies').completed=true;sim.doomsday.revision++;ui.tick(4)")
   assert page.locator('[data-flow-step=supplies]').get_attribute('data-status')=='complete'
   assert page.locator('[data-flow-step=recovery]').get_attribute('aria-current')=='step'
   page.evaluate("window.escapedToGame=false;window.addEventListener('keydown',event=>{if(event.key==='Escape')escapedToGame=true;});")
   page.locator('[data-flow-title]').click()
   page.get_by_role('button',name='Close emergency menu',exact=True).focus()
   page.keyboard.press('Escape');assert panel.is_hidden()
   assert not page.evaluate('escapedToGame'),'closing emergency menu also triggered the game Escape action'
   page.evaluate('ui.open();ui.reset();ui.tick(2)');assert panel.is_hidden()
   print(f'{width}px: independent sound/flow panels, automatic warning popup, close/Escape/reset preserve visibility',flush=True)
   page.close()
  browser.close()
finally:server.shutdown()
