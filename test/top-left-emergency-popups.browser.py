"""One top-left radio card carries event calls and preserves regular controls."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os
os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);Thread(target=server.serve_forever,daemon=True).start()
fixture='''<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{margin:0;background:#142722;color:#efffe9;font:14px system-ui}.house-explorer-shell{margin:8px;position:relative}.house-stage{position:relative;height:calc(100vh - 110px);min-height:240px;background:#16372a}button{min-height:44px;padding:8px;border:1px solid #9ebc9a;border-radius:8px;background:#254033;color:#efffe9}.game-dock-actions{display:flex;gap:6px}.mobile-move-pad{padding:8px}#fire{position:absolute;right:8px;bottom:8px}
</style><div class="house-explorer-shell"><div class="house-stage"><button class="game-camera-toggle">Camera view</button><div class="live-local-map"><header><button data-collapse>Map</button></header><div data-body hidden>Map markers</div></div><button id="fire">Fire</button></div><div class="house-control-dock"><div class="house-bottom-controls"><div class="game-dock-actions"><button>World</button><button>Settings</button><button>Build</button></div></div><div class="mobile-move-pad"><button id="move">Move player</button></div></div></div>'''
setup='''async ({native=false,late=false}={})=>{
 const {mountGameDisplayFlow}=await import('/public/js/game-display-flow.js');
 const {mountDoomsdayUI}=await import('/public/js/doomsday-ui.js');
 const {stepDoomsday,doomsdayView}=await import('/public/js/doomsday-rules.js');
 const {gameplayOverlayOpen}=await import('/public/js/game-menu-controls.js');
 window.clock=100000;window.env={id:'left-popups',name:'Emergency airport',spawn:{x:0,y:0,z:0}};window.sim={};window.player={id:'pilot',health:100,position:{x:30,y:0,z:30}};window.moves=0;window.calls=[];window.blocked=gameplayOverlayOpen;
 stepDoomsday(sim,env,clock,{players:[player],random:()=>0});
 if(late){clock=sim.doomsday.nextEventAt;stepDoomsday(sim,env,clock,{players:[player],random:()=>0});clock+=6000;stepDoomsday(sim,env,clock,{players:[player],random:()=>0});}
 window.voice={state:{speaking:false,outputBusy:false,pending:0},unlock(){return true},announce(text,options){window.currentCall?.onCancelled?.();calls.push({text,options});currentCall=options;voice.state.speaking=true;options.onStarted?.();return true;}};
 window.finishVoice=()=>{voice.state.speaking=false;window.currentCall?.onFinished?.();};
 window.dock=document.querySelector('.game-dock-actions');window.dockParent=dock.parentElement;
 const stage=document.querySelector('.house-stage');if(native){stage.className='native-doomsday';stage.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:80';}else window.display=mountGameDisplayFlow(stage);
 window.ui=mountDoomsdayUI({stage,getEnvironment:()=>env,getState:()=>doomsdayView(sim,env),getPosition:()=>player.position,voice,getPreferences:()=>({masterMuted:true,effectsMuted:true,announcementsMuted:true}),now:()=>clock});
 if(native){const host=document.createElement('details');host.className='native-radio-menu';const summary=document.createElement('summary');summary.textContent='Game flow & sound';host.append(summary,stage.querySelector('.doomsday-menu'));stage.append(host);}
 window.advance=at=>{clock=at;stepDoomsday(sim,env,clock,{players:[player],random:()=>0});ui.tick(clock/1000);};
 document.querySelector('#move').onclick=()=>moves++;document.addEventListener('keydown',event=>{if(event.key==='w'&&!blocked())moves++;});document.querySelector('#move').focus();ui.tick(clock/1000);
}'''
def new_page(browser,width,height,native=False,late=False):
 page=browser.new_page(viewport={'width':width,'height':height},has_touch=True)
 errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
 page.route('**/__left_popups',lambda route:route.fulfill(body=fixture,content_type='text/html'))
 page.goto(f'http://127.0.0.1:{server.server_port}/__left_popups');page.evaluate(setup,{'native':native,'late':late})
 return page,errors

def hit_center(locator):
 locator.scroll_into_view_if_needed()
 return locator.evaluate("n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0&&n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}")

def no_duplicates(page):
 assert page.locator('.emergency-radio-toggle').count()==1
 assert page.locator('.emergency-nuclear-toggle').count()==1
 for selector in ['#emergency-nuclear-panel','#emergency-announcement-panel','.doomsday-dispatch','[data-transcript]','[data-replay]','.emergency-popup-stack','#emergency-radio-popup']:
  assert page.locator(selector).count()==1,selector
 assert page.evaluate('(()=>{const ids=[...document.querySelectorAll("[id]")].map(n=>n.id);return ids.length===new Set(ids).size;})()')
 assert page.get_by_role('button',name='Close emergency radio',exact=True,include_hidden=True).count()==1
 assert page.evaluate('dock.parentElement===dockParent&&!dock.closest(".game-view-overflow")')

try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  for width,height in [(320,568),(390,844),(844,390),(1280,800)]:
   page,errors=new_page(browser,width,height)
   more=page.get_by_role('button',name='More view controls',exact=True);more.wait_for(state='visible')
   nuclear=page.get_by_role('button',name='Nuclear event',exact=True,include_hidden=True)
   popup=page.locator('#emergency-radio-popup')
   assert page.locator('.game-display-flow-views > button').count()==2
   assert nuclear.evaluate('n=>!!n.closest(".game-view-overflow")')
   panel=page.locator('#emergency-nuclear-panel');announcement=page.locator('#emergency-announcement-panel')
   assert panel.is_hidden() and announcement.is_hidden()
   assert more.get_attribute('aria-expanded')=='false'
   page.evaluate('advance(sim.doomsday.nextEventAt)')
   panel.wait_for(state='visible');announcement.wait_for(state='visible')
   assert more.get_attribute('aria-expanded')=='false','Automatic popups opened the regular header menu.'
   assert panel.evaluate('n=>n.closest(".emergency-popup-stack").parentElement.classList.contains("house-stage")&&!n.closest(".game-view-overflow")')
   stage_box=page.locator('.house-stage').bounding_box();stack_box=page.locator('.emergency-popup-stack').bounding_box()
   assert stage_box['x']<=stack_box['x']<=stage_box['x']+20 and stage_box['y']+44<=stack_box['y']<=stage_box['y']+90,(width,stage_box,stack_box)
   assert stack_box['x']+stack_box['width']<=stage_box['x']+stage_box['width']+1
   countdown=panel.locator('[data-countdown]');assert countdown.text_content()=='Detonations in 18s' and hit_center(countdown),(width,'countdown clipped')
   assert 'Cole' in announcement.locator('[data-transcript]').text_content()
   assert hit_center(announcement.locator('[data-transcript]')),(width,'announcement clipped')
   assert page.evaluate('document.activeElement===document.getElementById("move")&&!blocked()'),'Popup stole focus or blocked movement.'
   page.keyboard.press('w');assert page.evaluate('moves')==1
   no_duplicates(page)
   page.get_by_role('button',name='Close emergency radio',exact=True).click();assert popup.is_hidden() and panel.is_hidden() and announcement.is_hidden()
   page.evaluate('currentCall.onStarted?.();ui.tick(clock/1000)');assert popup.is_hidden(),'The same announcement reopened after dismissal.'
   page.evaluate('advance(clock+1000)');assert popup.is_hidden()
   page.evaluate('finishVoice();advance(sim.doomsday.detonationAt)')
   assert popup.is_visible() and panel.is_visible() and announcement.is_visible(),'A new phase should use the one radio card.'
   assert panel.locator('[data-countdown]').text_content()=='Fallout in 7s'
   assert more.get_attribute('aria-expanded')=='false'
   page.get_by_role('button',name='Close emergency radio',exact=True).click();assert popup.is_hidden()
   more.click();nuclear.click();assert popup.is_visible() and panel.locator('[data-countdown]').text_content()=='Fallout in 7s'
   assert more.get_attribute('aria-expanded')=='false','The nuclear action left its control list open.'
   page.get_by_role('button',name='Close emergency radio',exact=True).click();assert popup.is_hidden()
   sound=page.get_by_role('button',name='Emergency radio',exact=True);sound.click()
   popup.get_by_text('Radio & sound settings',exact=True).click()
   assert page.locator('#emergency-sound-panel').is_visible()
   assert more.get_attribute('aria-expanded')=='false'
   page.get_by_role('button',name='Close emergency radio',exact=True).click()
   page.evaluate('finishVoice();advance(sim.doomsday.falloutAt)')
   assert popup.is_visible() and panel.is_visible()
   assert announcement.is_visible() and 'Fallout' in announcement.locator('[data-transcript]').text_content()
   page.evaluate('advance(sim.doomsday.falloutAt+5000);player.position={...sim.doomsday.objectives.find(o=>o.id==="supplies").position};advance(clock+1)')
   page.evaluate('player.position={...sim.doomsday.objectives.find(o=>o.id==="recovery").position};advance(clock+1);advance(sim.doomsday.clearAt)')
   assert page.evaluate('sim.doomsday.phase')=='all-clear'
   page.evaluate('finishVoice();advance(sim.doomsday.nextEventAt)')
   assert panel.is_visible() and panel.locator('[data-countdown]').text_content()=='Detonations in 18s'
   assert more.get_attribute('aria-expanded')=='false'
   # A new map cannot expose the previous map's caption through Latest radio.
   page.evaluate("window.previousCall=currentCall;ui.reset();env={id:'fresh-quiet-map',name:'Fresh map',spawn:{x:0,y:0,z:0}};sim={};advance(clock+100);")
   assert page.evaluate('sim.doomsday.phase')=='idle'
   assert panel.is_hidden() and announcement.is_hidden()
   sound.click();assert popup.is_visible()
   popup.get_by_text('Radio & sound settings',exact=True).click()
   assert page.locator('#emergency-sound-panel').is_visible()
   assert page.get_by_role('button',name='Latest radio announcement',exact=True).is_disabled()
   assert announcement.locator('[data-transcript]').text_content()=='Standing by for emergency dispatch.'
   page.get_by_role('button',name='Close emergency radio',exact=True).click()
   page.evaluate('previousCall.onStarted?.();ui.tick(clock/1000)')
   assert popup.is_hidden(),'A callback from the previous map reopened the radio.'
   assert announcement.locator('[data-transcript]').text_content()=='Standing by for emergency dispatch.'
   assert page.get_by_role('button',name='Latest radio announcement',exact=True,include_hidden=True).is_disabled()
   no_duplicates(page);assert not errors,errors
   print(f'{width}x{height}: one top-left countdown/radio card, single controls, dismissal, world-reset cleanup and regular movement passed',flush=True)
   page.close()
  page,errors=new_page(browser,390,844)
  more=page.get_by_role('button',name='More view controls',exact=True);more.wait_for(state='visible')
  page.get_by_role('button',name='Emergency radio',exact=True).click()
  page.get_by_text('Radio & sound settings',exact=True).click()
  page.get_by_role('switch',name='Auto-show event panel',exact=True).uncheck();page.evaluate('ui.close();advance(sim.doomsday.nextEventAt)')
  assert page.locator('#emergency-radio-popup').is_hidden()
  assert page.evaluate('calls.some(call=>call.text.includes("Cole"))'),'Auto-show preference suppressed event radio calls.'
  more.click();page.get_by_role('button',name='Nuclear event',exact=True).click();assert page.locator('#emergency-nuclear-panel').is_visible()
  assert page.locator('#emergency-radio-popup').is_visible() and more.get_attribute('aria-expanded')=='false'
  no_duplicates(page);assert not errors,errors
  print('header: visual auto-show opt-out preserves event calls and manual nuclear access',flush=True)
  page.close()
  page,errors=new_page(browser,390,844,native=True,late=True)
  panel=page.locator('#emergency-nuclear-panel');panel.wait_for(state='visible')
  assert panel.locator('[data-countdown]').text_content()=='Detonations in 12s'
  assert page.locator('.native-radio-menu').get_attribute('open') is None
  assert panel.evaluate('n=>!!n.closest(".emergency-popup-stack")&&!n.closest("details")')
  no_duplicates(page);assert not errors,errors
  print('native: late event opens top-left popup with current countdown and no header-menu takeover',flush=True)
  page.close();browser.close()
finally:server.shutdown()
