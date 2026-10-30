"""Header sound, nuclear and response panels toggle independently during events."""
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
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  for width,height in [(320,568),(390,844),(844,390),(1280,800)]:
   page=browser.new_page(viewport={'width':width,'height':height},has_touch=True)
   errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
   page.route('**/__emergency_panels',lambda route:route.fulfill(body=fixture,content_type='text/html'))
   page.goto(f'http://127.0.0.1:{server.server_port}/__emergency_panels')
   page.evaluate('''async()=>{
    const {mountDoomsdayUI}=await import('/public/js/doomsday-ui.js');
    const {mountGameDisplayFlow}=await import('/public/js/game-display-flow.js');
    const {stepDoomsday,doomsdayView}=await import('/public/js/doomsday-rules.js');
    window.clock=100000;window.env={id:'panels-airport',name:'Airport emergency',spawn:{x:0,y:0,z:0}};window.sim={};window.responder={id:'pilot',health:100,position:{x:30,y:0,z:30}};
    window.preferences={masterMuted:true,effectsMuted:true,announcementsMuted:true,effectsVolume:0};window.enableRequests=0;window.boardRequests=[];window.moveCount=0;window.spoken=[];
    stepDoomsday(sim,env,clock,{players:[responder],random:()=>0});
    window.evacuation={canAssist:true,progress:null,aircraft:[{id:'daybreak',name:'Daybreak Evacuation',available:true,own:false}]};
    const voice={state:{speaking:false,outputBusy:false,pending:0},unlock(){return true},announce(text,options){spoken.push(text);options.onStarted?.();options.onFinished?.();return true;}};
    const stage=document.querySelector('.house-stage');window.flow=mountGameDisplayFlow(stage);
    window.ui=mountDoomsdayUI({stage,getEnvironment:()=>env,getState:()=>doomsdayView(sim,env),getPosition:()=>responder.position,getEvacuation:()=>evacuation,onBoardAircraft:async id=>{boardRequests.push(id);return {result:{message:'Boarding accepted'}};},voice,getPreferences:()=>preferences,onEnableAudio:()=>{enableRequests++;preferences={masterMuted:false,effectsMuted:false,announcementsMuted:false,effectsVolume:100};},now:()=>clock});
    window.advance=async at=>{clock=at;stepDoomsday(sim,env,clock,{players:[responder],random:()=>0});ui.tick(clock/1000);};
    document.querySelector('#move').onclick=()=>moveCount++;ui.tick(0);
   }''')
   more=page.get_by_role('button',name='More view controls',exact=True);more.wait_for(state='visible')
   sound=page.get_by_role('button',name='Radio & sound',exact=True)
   nuclear=page.get_by_role('button',name='Nuclear event',exact=True)
   response=page.get_by_role('button',name='Emergency response flow',exact=True)
   sound_panel=page.locator('#emergency-sound-panel');nuclear_panel=page.locator('#emergency-nuclear-panel');flow_panel=page.locator('#emergency-flow-panel')
   assert sound_panel.is_hidden() and nuclear_panel.is_hidden() and flow_panel.is_hidden()
   assert page.locator('.doomsday-banner').is_hidden()
   more.click();sound.wait_for(state='visible');response.wait_for(state='visible')
   assert nuclear.is_hidden() or nuclear.is_disabled(),'Nuclear event should be unavailable during the quiet arrival.'
   deadline=page.evaluate('sim.doomsday.nextEventAt')
   for control,target in [(sound,'emergency-sound-panel'),(response,'emergency-flow-panel')]:
    assert control.get_attribute('aria-controls')==target and control.get_attribute('aria-expanded')=='false'
    control.scroll_into_view_if_needed();box=control.bounding_box();assert box['height']>=44 and box['x']>=0 and box['x']+box['width']<=width+1,(width,box)
   sound.click();assert sound_panel.is_visible() and sound.get_attribute('aria-expanded')=='true'
   assert page.get_by_role('button',name='Enable sounds',exact=True).is_visible()
   page.get_by_role('button',name='Enable sounds',exact=True).tap()
   page.wait_for_function("['ready','playing'].includes(document.querySelector('#doomsday-panel').dataset.audioState)")
   assert page.evaluate('enableRequests')==1 and page.evaluate('sim.doomsday.nextEventAt')==deadline
   response.click();assert flow_panel.is_visible() and sound_panel.is_visible(),'Opening response flow closed sound controls.'
   page.get_by_role('button',name='Board Daybreak Evacuation',exact=True).click()
   assert page.evaluate('boardRequests')==['daybreak']
   page.get_by_role('button',name='Close Radio & sound',exact=True).click()
   assert sound_panel.is_hidden() and sound.get_attribute('aria-expanded')=='false' and flow_panel.is_visible()
   sound.click();assert sound_panel.is_visible();sound.click();assert sound_panel.is_hidden()
   page.get_by_role('button',name='Close Emergency response flow',exact=True).click()
   assert flow_panel.is_hidden() and response.get_attribute('aria-expanded')=='false' and more.get_attribute('aria-expanded')=='true'
   more.click();assert page.locator('.doomsday-guide').is_hidden()
   page.evaluate('(at)=>advance(at)',deadline)
   assert page.evaluate('sim.doomsday.phase')=='warning'
   assert more.get_attribute('aria-expanded')=='true' and nuclear_panel.is_visible(),'The new warning did not restore its countdown panel automatically.'
   nuclear.wait_for(state='visible');assert nuclear.is_enabled()
   assert nuclear.get_attribute('aria-expanded')=='true'
   assert 'Nuclear warning' in nuclear_panel.text_content()
   assert nuclear_panel.locator('.doomsday-banner').is_visible()
   assert nuclear_panel.locator('[data-countdown]').text_content()=='Detonations in 18s'
   sound.click();assert nuclear_panel.is_visible() and sound_panel.is_visible()
   page.get_by_role('button',name='Close Nuclear event',exact=True).click()
   assert nuclear_panel.is_hidden() and sound_panel.is_visible() and more.get_attribute('aria-expanded')=='true'
   assert page.locator('.doomsday-banner').is_hidden(),'Closing only nuclear panel left its countdown on the page.'
   nuclear.click();assert nuclear_panel.is_visible()
   event_id=page.evaluate('sim.doomsday.id')
   page.evaluate('advance(sim.doomsday.detonationAt)')
   assert nuclear_panel.is_visible() and 'Distant detonations' in nuclear_panel.text_content()
   assert nuclear_panel.locator('[data-countdown]').text_content()=='Fallout in 7s'
   page.evaluate('advance(sim.doomsday.falloutAt)')
   assert nuclear_panel.is_visible() and 'Fallout response' in nuclear_panel.text_content()
   assert nuclear_panel.locator('[data-countdown]').text_content()==''
   assert page.evaluate('sim.doomsday.id')==event_id
   nuclear.click();assert nuclear_panel.is_hidden() and sound_panel.is_visible()
   response.click();assert flow_panel.is_visible()
   assert page.locator('[data-flow-step=supplies]').get_attribute('aria-current')=='step'
   assert page.locator('[data-flow-step=recovery]').get_attribute('data-status')=='pending'
   page.evaluate("window.escapeReachedGame=false;window.addEventListener('keydown',event=>{if(event.key==='Escape')escapeReachedGame=true;});")
   sound.focus();page.keyboard.press('Escape')
   assert more.get_attribute('aria-expanded')=='false' and not page.evaluate('escapeReachedGame')
   page.get_by_role('button',name='Move player',exact=True).click();assert page.evaluate('moveCount')==1
   page.evaluate('advance(sim.doomsday.falloutAt+5000)')
   page.evaluate("sim.doomsday.objectives.find(o=>o.id==='supplies').completed=true;advance(clock+1)")
   assert page.evaluate('sim.doomsday.phase')=='recovery' and more.get_attribute('aria-expanded')=='false'
   page.evaluate("sim.doomsday.objectives.find(o=>o.id==='recovery').completed=true;advance(clock+1)")
   page.evaluate('advance(sim.doomsday.clearAt)')
   assert page.evaluate('sim.doomsday.phase')=='all-clear' and more.get_attribute('aria-expanded')=='false',page.evaluate('({phase:sim.doomsday.phase,clock,clearAt:sim.doomsday.clearAt,more:document.querySelector(".game-view-more").getAttribute("aria-expanded")})')
   more.click();nuclear.click();assert nuclear_panel.is_visible()
   page.evaluate('advance(sim.doomsday.clearAt+8001)')
   assert nuclear.is_disabled() and nuclear_panel.is_hidden(),'Completed nuclear panel did not return to standby.'
   assert sound_panel.is_visible(),'Nuclear cleanup closed unrelated sound controls.'
   assert page.evaluate("(()=>{const ids=[...document.querySelectorAll('[id]')].map(n=>n.id);return ids.length===new Set(ids).size;})()"),'Restored panels created duplicate IDs.'
   assert not errors,errors
   print(f'{width}x{height}: independent sound/nuclear/flow panels, sound recovery, boarding, automatic warning popup, phase updates and closed-menu event completion passed',flush=True)
   page.close()
  # Native sports use a header <details>, so their navigation buttons must
  # consume Escape before arcade gameplay sees it as a ride/minigame exit.
  page=browser.new_page(viewport={'width':390,'height':844},has_touch=True)
  page.route('**/__emergency_panels',lambda route:route.fulfill(body=fixture,content_type='text/html'))
  page.goto(f'http://127.0.0.1:{server.server_port}/__emergency_panels')
  page.evaluate('''async()=>{
   const {mountDoomsdayUI}=await import('/public/js/doomsday-ui.js');
   const {stepDoomsday,doomsdayView}=await import('/public/js/doomsday-rules.js');
   window.clock=100000;window.env={id:'native-panels',spawn:{x:0,y:0,z:0}};window.sim={};window.responder={id:'p',health:100,position:{x:30,y:0,z:30}};
   stepDoomsday(sim,env,clock,{players:[responder],random:()=>0});
   const stage=document.querySelector('.house-stage');stage.className='native-doomsday';
   window.ui=mountDoomsdayUI({stage,getEnvironment:()=>env,getState:()=>doomsdayView(sim,env),getPosition:()=>responder.position,now:()=>clock});
   const details=document.createElement('details');details.className='native-radio-menu';const summary=document.createElement('summary');summary.textContent='Game flow & sound';details.append(summary,stage.querySelector('.doomsday-menu'));stage.append(details);ui.tick(0);
   window.gameEscape=0;window.addEventListener('keydown',event=>{if(event.key==='Escape')gameEscape++;});
  }''')
  summary=page.locator('.native-radio-menu > summary');summary.click()
  sound=page.get_by_role('button',name='Radio & sound',exact=True);sound.focus();page.keyboard.press('Escape')
  assert page.locator('.native-radio-menu').get_attribute('open') is None
  assert page.evaluate('gameEscape')==0,'native header navigation propagated Escape before any panel was opened'
  summary.click();sound.click()
  assert page.locator('#emergency-sound-panel').is_visible()
  sound.focus();page.keyboard.press('Escape')
  assert page.locator('.native-radio-menu').get_attribute('open') is None
  assert page.evaluate('gameEscape')==0,'native panel toggle propagated Escape into gameplay'
  summary.click();assert sound.is_visible()
  print('native header: focused navigation consumes Escape and safely closes only its menu',flush=True)
  page.close()
  browser.close()
finally:server.shutdown()
