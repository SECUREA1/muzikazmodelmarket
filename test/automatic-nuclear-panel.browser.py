"""Each nuclear event presents its real countdown once, without trapping gameplay."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os
os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()
fixture='''<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{margin:0;background:#182a26;color:#efffe9;font:14px system-ui}.house-explorer-shell{position:relative;margin:8px}.house-stage{position:relative;height:calc(100vh - 90px);min-height:230px;background:#142a26}button{border:1px solid #9abfa4;border-radius:6px;background:#233f34;color:#efffe9;padding:8px;font:14px system-ui}#move{min-height:44px;margin-top:8px}
</style><div class="house-explorer-shell"><div class="house-stage"></div><button id="move">Move player</button></div>'''
setup='''async ({native=false,late=false}={})=>{
 const {mountDoomsdayUI}=await import('/public/js/doomsday-ui.js');
 const {mountGameDisplayFlow}=await import('/public/js/game-display-flow.js');
 const {stepDoomsday,doomsdayView}=await import('/public/js/doomsday-rules.js');
 const {gameplayOverlayOpen}=await import('/public/js/game-menu-controls.js');
 window.clock=100000;window.env={id:'automatic-panels',name:'Airport emergency',spawn:{x:0,y:0,z:0}};window.sim={};window.responder={id:'p',health:100,position:{x:30,y:0,z:30}};window.moves=0;window.blocked=gameplayOverlayOpen;
 stepDoomsday(sim,env,clock,{players:[responder],random:()=>0});
 if(late){clock=sim.doomsday.nextEventAt;stepDoomsday(sim,env,clock,{players:[responder],random:()=>0});clock+=6000;stepDoomsday(sim,env,clock,{players:[responder],random:()=>0});}
 const stage=document.querySelector('.house-stage');
 if(native)stage.className='native-doomsday';else window.display=mountGameDisplayFlow(stage);
 window.ui=mountDoomsdayUI({stage,getEnvironment:()=>env,getState:()=>doomsdayView(sim,env),getPosition:()=>responder.position,getPreferences:()=>({masterMuted:true,effectsMuted:true,announcementsMuted:true}),now:()=>clock});
 if(native){const details=document.createElement('details');details.className='native-radio-menu';const summary=document.createElement('summary');summary.textContent='Game flow & sound';details.append(summary,stage.querySelector('.doomsday-menu'));stage.append(details);}
 window.advance=at=>{clock=at;stepDoomsday(sim,env,clock,{players:[responder],random:()=>0});ui.tick(clock/1000);};
 window.revisit=()=>{const originalEnv=env,originalSim=sim;ui.reset();env={id:'other-map',spawn:{x:0,y:0,z:0}};sim={};stepDoomsday(sim,env,clock,{players:[responder],random:()=>0});ui.tick(clock/1000);env=originalEnv;sim=originalSim;ui.tick(clock/1000);};
 document.querySelector('#move').onclick=()=>moves++;document.addEventListener('keydown',event=>{if(event.key==='w'&&!blocked())moves++;});document.querySelector('#move').focus();ui.tick(clock/1000);
}'''
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  for width,height in [(320,568),(390,844),(844,390),(1280,800)]:
   if os.environ.get('AUTO_PANEL_VIEWPORT') and width!=int(os.environ['AUTO_PANEL_VIEWPORT']):continue
   page=browser.new_page(viewport={'width':width,'height':height},has_touch=True);page.set_default_timeout(6000)
   errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
   page.route('**/__automatic_panels',lambda route:route.fulfill(body=fixture,content_type='text/html'))
   page.goto(f'http://127.0.0.1:{server.server_port}/__automatic_panels');page.evaluate(setup,{})
   more=page.get_by_role('button',name='More view controls',exact=True);more.wait_for(state='visible')
   radio=page.get_by_role('button',name='Emergency radio',exact=True)
   nuclear=page.get_by_role('button',name='Nuclear event',exact=True,include_hidden=True)
   popup=page.locator('#emergency-radio-popup');panel=page.locator('#emergency-nuclear-panel');countdown=panel.locator('[data-countdown]')
   assert more.get_attribute('aria-expanded')=='false' and popup.is_hidden()
   assert page.locator('.game-display-flow-views > button').count()==3
   assert nuclear.evaluate('n=>n.parentElement.classList.contains("game-display-flow-views")')
   assert page.evaluate('!blocked()')
   assert page.evaluate('sim.doomsday.nextEventAt+18000-clock>=60000&&sim.doomsday.nextEventAt+18000-clock<=180000')
   page.evaluate('advance(sim.doomsday.nextEventAt)')
   popup.wait_for(state='visible')
   assert page.evaluate('sim.doomsday.phase')=='warning' and panel.is_visible()
   assert more.get_attribute('aria-expanded')=='false'
   assert nuclear.get_attribute('aria-expanded')=='true'
   assert countdown.text_content()=='Detonations in 18s'
   assert page.evaluate("document.activeElement===document.querySelector('#move')"),'automatic popup stole keyboard focus'
   assert page.evaluate('!blocked()')
   page.keyboard.press('w');assert page.evaluate('moves')==1
   assert countdown.evaluate("n=>{const r=n.getBoundingClientRect();return r.height>0&&n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}"),'Live countdown is clipped'
   assert popup.locator('#emergency-announcement-panel [data-transcript]').is_visible()
   # Sound and guidance remain in the same card; More stays a compact action list.
   popup.get_by_text('Radio & sound settings',exact=True).click()
   assert page.locator('#emergency-sound-panel').is_visible() and panel.is_visible()
   popup.get_by_text('Radio & sound settings',exact=True).click()
   more.click();page.get_by_role('button',name='Emergency response flow',exact=True).click()
   assert page.locator('#emergency-flow-panel').is_visible() and popup.is_visible()
   assert more.get_attribute('aria-expanded')=='false'
   page.get_by_role('button',name='Close emergency radio',exact=True).click();assert popup.is_hidden() and nuclear.get_attribute('aria-expanded')=='false'
   # Ticks do not reopen a dismissed call, but the next phase uses this same card.
   page.evaluate('advance(clock+1000)');assert popup.is_hidden()
   page.evaluate('advance(sim.doomsday.detonationAt)')
   assert popup.is_visible() and page.evaluate('sim.doomsday.phase')=='detonation'
   assert countdown.text_content()=='Fallout in 7s'
   page.get_by_role('button',name='Close emergency radio',exact=True).click();assert popup.is_hidden()
   more.click();nuclear.click();assert popup.is_visible() and countdown.text_content()=='Fallout in 7s'
   assert more.get_attribute('aria-expanded')=='false'
   page.evaluate('advance(sim.doomsday.falloutAt)');assert panel.is_visible() and countdown.text_content()==''
   page.get_by_role('button',name='Close emergency radio',exact=True).click()
   page.evaluate('advance(clock+1000)');assert popup.is_hidden() and more.get_attribute('aria-expanded')=='false'
   page.evaluate('revisit()');assert more.get_attribute('aria-expanded')=='false' and popup.is_hidden(),'revisiting the same event reopened a dismissed call'
   # Complete the actual quest-led response, then a new event should present.
   page.evaluate('advance(sim.doomsday.falloutAt+5000)')
   page.evaluate("responder.position={...sim.doomsday.objectives.find(o=>o.id==='supplies').position};advance(clock+1)")
   assert page.evaluate('sim.doomsday.phase')=='recovery'
   page.evaluate("responder.position={...sim.doomsday.objectives.find(o=>o.id==='recovery').position};advance(clock+1)")
   assert page.evaluate('sim.doomsday.phase')=='clearing'
   page.evaluate('advance(sim.doomsday.clearAt)');assert page.evaluate('sim.doomsday.phase')=='all-clear'
   assert more.get_attribute('aria-expanded')=='false'
   page.evaluate('advance(sim.doomsday.nextEventAt)')
   assert page.evaluate('sim.doomsday.cycle')==2 and more.get_attribute('aria-expanded')=='false' and popup.is_visible()
   assert countdown.text_content()=='Detonations in 18s'
   assert page.locator('#emergency-radio-popup').count()==1
   assert page.get_by_role('button',name='Close emergency radio',exact=True).count()==1
   assert page.evaluate("(()=>{const ids=[...document.querySelectorAll('[id]')].map(n=>n.id);return ids.length===new Set(ids).size;})()")
   assert not errors,errors
   print(f'{width}x{height}: first/new-event countdown in one card, per-call dismissal, quest-led completion, focus and movement passed',flush=True)
   page.close()
  # Opting out affects presentation only, and the original nuclear header action still works.
  page=browser.new_page(viewport={'width':390,'height':844},has_touch=True)
  page.route('**/__automatic_panels',lambda route:route.fulfill(body=fixture,content_type='text/html'))
  page.goto(f'http://127.0.0.1:{server.server_port}/__automatic_panels');page.evaluate(setup,{})
  more=page.get_by_role('button',name='More view controls',exact=True);more.wait_for(state='visible')
  page.get_by_role('button',name='Emergency radio',exact=True).click()
  page.get_by_text('Radio & sound settings',exact=True).click()
  automatic=page.get_by_role('switch',name='Auto-show event panel',exact=True);assert automatic.is_checked()
  due=page.evaluate('sim.doomsday.nextEventAt');automatic.uncheck()
  assert page.evaluate('sim.doomsday.nextEventAt')==due
  assert page.evaluate("localStorage.getItem('muzikaz.emergency.panel.automatic')")=='false'
  page.get_by_role('button',name='Close emergency radio',exact=True).click();page.evaluate('advance(sim.doomsday.nextEventAt)')
  assert page.evaluate("sim.doomsday.phase==='warning'&&sim.doomsday.active!==false")
  assert more.get_attribute('aria-expanded')=='false' and page.locator('#emergency-radio-popup').is_hidden()
  more.click();page.get_by_role('button',name='Nuclear event',exact=True).click()
  assert page.locator('#emergency-radio-popup').is_visible()
  assert page.locator('#emergency-nuclear-panel [data-countdown]').text_content()=='Detonations in 18s'
  assert more.get_attribute('aria-expanded')=='false' and page.evaluate('!blocked()')
  print('header: Auto-show opt-out preserves event timing and manual radio access',flush=True)
  page.close()
  # Joining mid-warning shows the shared remaining clock without opening More.
  for native in [False,True]:
   page=browser.new_page(viewport={'width':390,'height':844},has_touch=True)
   page.route('**/__automatic_panels',lambda route:route.fulfill(body=fixture,content_type='text/html'))
   page.goto(f'http://127.0.0.1:{server.server_port}/__automatic_panels');page.evaluate(setup,{'native':native,'late':True})
   popup=page.locator('#emergency-radio-popup');popup.wait_for(state='visible')
   assert popup.locator('[data-countdown]').text_content()=='Detonations in 12s'
   if native:assert page.locator('.native-radio-menu').get_attribute('open') is None
   else:assert page.get_by_role('button',name='More view controls',exact=True).get_attribute('aria-expanded')=='false'
   assert page.evaluate('!blocked()')
   page.get_by_role('button',name='Close emergency radio',exact=True).click();assert popup.is_hidden()
   page.evaluate('advance(clock+1000)');assert popup.is_hidden()
   print(('native' if native else 'header')+': late join uses current countdown and dismissal remains respected',flush=True)
   page.close()
  browser.close()
finally:server.shutdown()
