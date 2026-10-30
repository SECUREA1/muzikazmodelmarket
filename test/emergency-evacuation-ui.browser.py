"""Optional emergency aircraft onboarding remains inside the radio dropdown."""
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
  for width,height in [(320,568),(390,844),(844,390),(1280,800)]:
   page=browser.new_page(viewport={'width':width,'height':height},has_touch=True)
   errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
   page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
   page.evaluate('''async()=>{
    const {mountDoomsdayUI}=await import('/public/js/doomsday-ui.js');
    const {mountGameDisplayFlow}=await import('/public/js/game-display-flow.js');
    const {stepDoomsday,doomsdayView}=await import('/public/js/doomsday-rules.js');
    window.env={id:'evacuation-test',name:'Response Airport',spawn:{x:0,y:0,z:0}};window.sim={};window.clock=100000;window.requests=[];window.spoken=[];window.boardFailure=false;window.pendingBoard=false;
    const responder={id:'p',health:100,position:{x:20,y:0,z:20}};stepDoomsday(sim,env,clock,{players:[responder],random:()=>0});clock=sim.doomsday.nextEventAt;stepDoomsday(sim,env,clock,{players:[responder],random:()=>0});
    window.data={canAssist:true,progress:{eventId:sim.doomsday.id,stage:'board',status:'available',boardedAt:null},aircraft:[{id:'command',name:'Nightfall Command',available:true,own:false},{id:'evac',name:'Daybreak Evacuation',available:false,own:false}]};
    window.voice={state:{speaking:false,outputBusy:false,pending:0},unlock(){return true},announce(text,options){spoken.push({text,options});voice.state.speaking=true;window.currentCall=options;options.onStarted?.();return true;}};
    window.finishVoice=()=>{voice.state.speaking=false;currentCall?.onFinished?.();};
    const stage=document.querySelector('.house-stage');window.flow=mountGameDisplayFlow(stage);
    window.ui=mountDoomsdayUI({stage,getEnvironment:()=>env,getState:()=>doomsdayView(sim,env),getPosition:()=>responder.position,getEvacuation:()=>data,onBoardAircraft:async id=>{requests.push(id);if(boardFailure)throw Error('That cockpit is occupied. Choose another aircraft.');if(pendingBoard)await new Promise(resolve=>window.releaseBoard=resolve);return {result:{message:'Boarding accepted'}};},voice,now:()=>clock});ui.tick(0);
   }''')
   assert page.locator('.doomsday-guide').is_hidden()
   assert page.locator('.doomsday-banner').is_hidden()
   more=page.get_by_role('button',name='More view controls',exact=True);more.click()
   page.get_by_role('button',name='Show emergency guide',exact=True).click()
   panel=page.get_by_role('region',name='Emergency aircraft onboarding',exact=True)
   assert panel.is_visible() and panel.evaluate("n=>!!n.closest('.game-view-overflow')")
   occupied=page.get_by_role('button',name='Daybreak Evacuation · Occupied',exact=True);assert occupied.is_disabled()
   board=page.get_by_role('button',name='Board Nightfall Command',exact=True)
   assert board.bounding_box()['height']>=44
   page.evaluate('boardFailure=true');board.tap()
   page.wait_for_function("document.querySelector('[data-evac-status]').textContent.includes('occupied')")
   assert board.is_enabled() and page.evaluate('requests.length')==1
   page.evaluate('boardFailure=false;pendingBoard=true');board.tap()
   assert page.get_by_role('button',name='Boarding…',exact=True).is_disabled()
   assert page.get_by_role('button',name='Boarding…',exact=True).get_attribute('aria-busy')=='true'
   page.evaluate('releaseBoard()')
   page.wait_for_function("document.querySelector('[data-evac-status]').textContent.includes('accepted')")
   page.evaluate("data.progress={...data.progress,stage:'preflight',status:'active',vehicleId:'command',boardedAt:clock};data.aircraft[0].own=true;ui.tick(1)")
   assert 'Cockpit confirmed' in panel.locator('[data-evac-status]').text_content()
   assert page.evaluate("spoken.filter(call=>call.text.includes('Emergency cockpit confirmed')).length")==0,'onboarding interrupted urgent nuclear dispatch'
   page.evaluate("data.progress={...data.progress,stage:'board',status:'available',boardedAt:null};data.aircraft[0].own=false;ui.tick(1.1);finishVoice();ui.tick(1.2)")
   assert page.evaluate("spoken.filter(call=>call.text.includes('Emergency cockpit confirmed')).length")==0,'obsolete cockpit confirmation played after leaving'
   page.evaluate("voice.state.speaking=true;data.progress={...data.progress,stage:'preflight',status:'active',vehicleId:'command',boardedAt:clock};data.aircraft[0].own=true;ui.tick(1.3)")
   page.evaluate('finishVoice();ui.tick(2)')
   assert page.evaluate("spoken.filter(call=>call.text.includes('Emergency cockpit confirmed')).length")==1
   page.evaluate('ui.tick(3);ui.tick(4)')
   assert page.evaluate("spoken.filter(call=>call.text.includes('Emergency cockpit confirmed')).length")==1,'cockpit confirmation repeated'
   page.evaluate("data.progress.stage='depart';ui.tick(5)")
   assert 'Departure in progress' in panel.locator('[data-evac-status]').text_content()
   page.evaluate("data.progress.mode='manual';ui.tick(5.5)")
   assert 'Manual evacuation flight active' in panel.locator('[data-evac-status]').text_content()
   page.evaluate("data.progress.stage='complete';data.progress.status='complete';data.progress.completedAt=clock;finishVoice();ui.tick(6)")
   assert 'Evacuation flight airborne' in panel.locator('[data-evac-status]').text_content()
   assert 'Land' in panel.locator('[data-evac-status]').text_content()
   assert page.evaluate("spoken.filter(call=>call.text.includes('Evacuation flight airborne')).length")==1
   page.evaluate('ui.tick(7);ui.tick(8)')
   assert page.evaluate("spoken.filter(call=>call.text.includes('Evacuation flight airborne')).length")==1
   # A pending completion belongs only to the current active response.
   page.evaluate("finishVoice();sim.doomsday.id+=':next';data.progress={...data.progress,eventId:sim.doomsday.id,stage:'complete',status:'complete'};data.canAssist=false;ui.tick(8.1)")
   assert 'clear landing area' in panel.locator('[data-evac-status]').text_content()
   assert 'assisted return' not in panel.locator('[data-evac-status]').text_content()
   page.evaluate("sim.doomsday.id+=':newer';data.progress={...data.progress,eventId:sim.doomsday.id,stage:'board',status:'available',boardedAt:null};data.aircraft[0].own=false;ui.reset();ui.tick(8.2);finishVoice();ui.tick(8.3)")
   assert page.evaluate("spoken.filter(call=>call.text.includes('Evacuation flight airborne')).length")==1,'old completion survived response reset'
   # Reopen the manually controlled dropdown after resetting the response.
   page.evaluate("document.querySelector('.game-view-overflow').hidden=false;document.querySelector('.game-view-more').setAttribute('aria-expanded','true');ui.open()")
   # A late request cannot place an old aircraft response into a different map.
   page.evaluate("data.progress={...data.progress,stage:'board',status:'available',boardedAt:null};data.aircraft[0].own=false;ui.tick(9)")
   board.tap();assert page.get_by_role('button',name='Boarding…',exact=True).is_disabled()
   page.evaluate("env={...env,id:'other-map'};data={canAssist:false,progress:null,aircraft:[]};sim.doomsday.mapId='other-map';ui.tick(10);releaseBoard()")
   page.wait_for_timeout(40)
   page.evaluate('ui.tick(11)')
   assert 'No emergency aircraft' in page.locator('[data-evac-status]').text_content()
   assert 'accepted' not in page.locator('[data-evac-status]').text_content()
   assert page.locator('.doomsday-guide').is_hidden(),'map change auto-opened radio'
   assert not errors,errors
   print(f'{width}x{height}: dropdown onboarding, occupied/retry/loading, deduped priority-safe radio, completion and stale responses passed',flush=True)
   page.close()
  browser.close()
finally:server.shutdown()
