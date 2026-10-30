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
   page=browser.new_page(viewport={'width':width,'height':height},has_touch=True)
   errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
   page.route('**/__automatic_panels',lambda route:route.fulfill(body=fixture,content_type='text/html'))
   page.goto(f'http://127.0.0.1:{server.server_port}/__automatic_panels');page.evaluate(setup,{})
   more=page.get_by_role('button',name='More view controls',exact=True);more.wait_for(state='visible')
   nuclear=page.get_by_role('button',name='Nuclear event',exact=True);panel=page.locator('#emergency-nuclear-panel');banner=panel.locator('.doomsday-banner')
   assert more.get_attribute('aria-expanded')=='false' and panel.is_hidden()
   assert page.evaluate('!blocked()')
   page.evaluate('advance(sim.doomsday.nextEventAt)')
   page.wait_for_function("document.querySelector('.game-view-more').getAttribute('aria-expanded')==='true'")
   assert page.evaluate('sim.doomsday.phase')=='warning' and panel.is_visible()
   assert nuclear.get_attribute('aria-expanded')=='true'
   assert banner.locator('[data-countdown]').text_content()=='Detonations in 18s'
   assert page.evaluate("document.activeElement===document.querySelector('#move')"),'automatic popup stole keyboard focus'
   assert page.evaluate('!blocked()')
   page.keyboard.press('w');assert page.evaluate('moves')==1
   try:
    page.wait_for_function("(()=>{const n=document.querySelector('#emergency-nuclear-panel .doomsday-banner'),r=n.getBoundingClientRect();return r.height>0&&n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})()",timeout=5000)
   except Exception:
    print('Popup bounds:',page.evaluate("""()=>[...document.querySelectorAll('.game-view-overflow,.doomsday-menu,.doomsday-panel,.doomsday-panel-content,#emergency-nuclear-panel,.doomsday-banner')].map(n=>({selector:n.className||n.id,bounds:n.getBoundingClientRect().toJSON(),scrollTop:n.scrollTop,clientHeight:n.clientHeight,scrollHeight:n.scrollHeight,overflow:getComputedStyle(n).overflow,centerHit:(()=>{const r=n.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML.slice(0,260)})()}))"""),flush=True)
    page.screenshot(path=f'/workspace/automatic-nuclear-panel-{width}-clipped.png');raise
   # Other header panels remain usable while the event is presented.
   sound=page.get_by_role('button',name='Radio & sound',exact=True);sound.click();assert page.locator('#emergency-sound-panel').is_visible() and panel.is_visible()
   response=page.get_by_role('button',name='Emergency response flow',exact=True);response.click();assert page.locator('#emergency-flow-panel').is_visible() and panel.is_visible()
   page.get_by_role('button',name='Close Nuclear event',exact=True).click();assert panel.is_hidden() and nuclear.get_attribute('aria-expanded')=='false'
   # Phase ticks and new snapshots do not override this event's dismissal.
   page.evaluate('advance(clock+1000)');assert panel.is_hidden()
   page.evaluate('advance(sim.doomsday.detonationAt)');assert panel.is_hidden() and page.evaluate('sim.doomsday.phase')=='detonation'
   nuclear.click();assert panel.is_visible() and banner.locator('[data-countdown]').text_content()=='Fallout in 7s'
   page.evaluate('advance(sim.doomsday.falloutAt)');assert panel.is_visible() and banner.locator('[data-countdown]').text_content()==''
   more.click();assert panel.is_hidden() and more.get_attribute('aria-expanded')=='false'
   page.evaluate('advance(clock+1000)');assert more.get_attribute('aria-expanded')=='false'
   page.evaluate('revisit()');assert more.get_attribute('aria-expanded')=='false' and panel.is_hidden(),'revisiting the same event reopened a dismissed popup'
   # Complete the actual quest-led response, then a new event should present.
   page.evaluate('advance(sim.doomsday.falloutAt+5000)')
   page.evaluate("responder.position={...sim.doomsday.objectives.find(o=>o.id==='supplies').position};advance(clock+1)")
   assert page.evaluate('sim.doomsday.phase')=='recovery'
   page.evaluate("responder.position={...sim.doomsday.objectives.find(o=>o.id==='recovery').position};advance(clock+1)")
   assert page.evaluate('sim.doomsday.phase')=='clearing'
   page.evaluate('advance(sim.doomsday.clearAt)');assert page.evaluate('sim.doomsday.phase')=='all-clear'
   assert more.get_attribute('aria-expanded')=='false'
   page.evaluate('advance(sim.doomsday.nextEventAt)')
   assert page.evaluate('sim.doomsday.cycle')==2 and more.get_attribute('aria-expanded')=='true' and panel.is_visible()
   assert banner.locator('[data-countdown]').text_content()=='Detonations in 18s'
   assert page.evaluate("(()=>{const ids=[...document.querySelectorAll('[id]')].map(n=>n.id);return ids.length===new Set(ids).size;})()")
   assert not errors,errors
   print(f'{width}x{height}: first/new-event automatic countdown, per-event dismiss, independent controls, focus and movement passed',flush=True)
   page.close()
  # Opting out affects presentation only, and manual header controls still work.
  page=browser.new_page(viewport={'width':390,'height':844},has_touch=True)
  page.route('**/__automatic_panels',lambda route:route.fulfill(body=fixture,content_type='text/html'))
  page.goto(f'http://127.0.0.1:{server.server_port}/__automatic_panels');page.evaluate(setup,{})
  more=page.get_by_role('button',name='More view controls',exact=True);more.wait_for(state='visible');more.click()
  automatic=page.get_by_role('switch',name='Auto-show event panel',exact=True);assert automatic.is_checked()
  due=page.evaluate('sim.doomsday.nextEventAt');automatic.uncheck()
  assert page.evaluate('sim.doomsday.nextEventAt')==due
  assert page.evaluate("localStorage.getItem('muzikaz.emergency.panel.automatic')")=='false'
  more.click();page.evaluate('advance(sim.doomsday.nextEventAt)')
  assert page.evaluate("sim.doomsday.phase==='warning'&&sim.doomsday.active!==false")
  assert more.get_attribute('aria-expanded')=='false' and page.locator('#emergency-nuclear-panel').is_hidden()
  more.click();page.get_by_role('button',name='Nuclear event',exact=True).click()
  assert page.locator('#emergency-nuclear-panel').is_visible()
  assert page.locator('#emergency-nuclear-panel [data-countdown]').text_content()=='Detonations in 18s'
  assert page.evaluate('!blocked()')
  print('header: Auto-show opt-out preserves event timing and manual panel access',flush=True)
  page.close()
  # A visitor joining mid-warning sees the remaining clock, never a new18s timer.
  for native in [False,True]:
   page=browser.new_page(viewport={'width':390,'height':844},has_touch=True)
   page.route('**/__automatic_panels',lambda route:route.fulfill(body=fixture,content_type='text/html'))
   page.goto(f'http://127.0.0.1:{server.server_port}/__automatic_panels');page.evaluate(setup,{'native':native,'late':True})
   panel=page.locator('#emergency-nuclear-panel');panel.wait_for(state='visible')
   assert panel.locator('[data-countdown]').text_content()=='Detonations in 12s'
   if native:assert page.locator('.native-radio-menu').get_attribute('open') is not None
   else:assert page.get_by_role('button',name='More view controls',exact=True).get_attribute('aria-expanded')=='true'
   assert page.evaluate('!blocked()')
   page.get_by_role('button',name='Close Nuclear event',exact=True).click();assert panel.is_hidden()
   page.evaluate('advance(clock+1000)');assert panel.is_hidden()
   print(('native' if native else 'header')+': late join uses current countdown and dismissal remains respected',flush=True)
   page.close()
  browser.close()
finally:server.shutdown()
