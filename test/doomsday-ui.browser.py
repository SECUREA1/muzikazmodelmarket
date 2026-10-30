"""Mobile audio controls, personal shelter guidance and complete automatic events."""
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
fixture='''<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#18292f}main{position:relative;height:100vh}canvas{width:100%;height:100%}#walk,#look{position:absolute;bottom:12px;width:142px;height:142px}#walk{left:12px}#look{right:12px}#game-actions{position:absolute;right:10px;top:92px;width:120px;display:grid;gap:8px}#game-actions button{min-height:44px}</style><main><canvas></canvas><button id="walk">Move forward</button><button id="look">Look around</button><div id="game-actions"><button>Use</button><button>Travel</button></div></main>'''
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
  for width,height in [(320,568),(390,844),(740,360),(1280,900)]:
   page=browser.new_page(viewport={'width':width,'height':height},has_touch=True)
   errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
   page.route('**/__doomsday',lambda route:route.fulfill(body=fixture,content_type='text/html'))
   page.goto(f'http://127.0.0.1:{server.server_port}/__doomsday')
   page.evaluate('''async()=>{
    localStorage.removeItem('muzikaz.emergency.guide.hidden');localStorage.removeItem('muzikaz.emergency.challenge.follow');
    // A first mobile resume can stay pending until another trusted gesture.
    // Keep the actual Web Audio graph, but withhold that permission in this fixture.
    window.allowAudioResume=false;
    const NativeAudioContext=window.AudioContext;
    window.AudioContext=function(){const context=new NativeAudioContext(),nativeResume=context.resume.bind(context);let prototype=Object.getPrototypeOf(context),descriptor;while(prototype&&!descriptor){descriptor=Object.getOwnPropertyDescriptor(prototype,'state');prototype=Object.getPrototypeOf(prototype);}let resumed=false;Object.defineProperty(context,'state',{get:()=>resumed?descriptor.get.call(context):'suspended'});context.resume=()=>{if(!allowAudioResume)return new Promise(()=>{});resumed=true;return nativeResume();};return context;};
    const THREE=await import('/public/vendor/three/three.module.min.js');
    const {mountDoomsdayUI}=await import('/public/js/doomsday-ui.js'),{createDoomsdayScene}=await import('/public/js/doomsday-scene.js');
    const {doomsdayView,stepDoomsday}=await import('/public/js/doomsday-rules.js');
    const {gameplayOverlayOpen}=await import('/public/js/game-menu-controls.js');
    window.clock=100000;window.enteredAt=clock;window.env={id:'radio-airport',name:'Airport response',spawn:{x:0,y:0,z:0}};window.position={x:20,y:0,z:20};window.sim={};window.spoken=[];window.notices=[];window.preferences={effectsMuted:true};window.enableRequests=0;window.moves=0;window.shared=true;window.otherPlayers=[];window.randomDraws=0;window.eventIds=new Set();
    window.random=()=>{randomDraws++;return .25;};
    window.scene=new THREE.Scene();scene.background=new THREE.Color('#14252d');
    window.camera=new THREE.PerspectiveCamera(65,innerWidth/innerHeight,.1,700);camera.position.set(0,7,24);camera.lookAt(0,10,-160);
    window.renderer=new THREE.WebGLRenderer({canvas:document.querySelector('canvas')});renderer.setSize(innerWidth,innerHeight);
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(150,150),new THREE.MeshBasicMaterial({color:'#304139'}));ground.rotation.x=-Math.PI/2;ground.position.y=-.01;scene.add(ground);
    window.effects=createDoomsdayScene({scene,performanceMode:true});
    window.voice={state:{speaking:false,outputBusy:false,pending:0},unlock(){this.state.unlocked=true;return true;},announce(text,options){if(window.deferRadio){(window.waitingRadios||=[]).push(options);return true;}window.radio?.onCancelled?.();window.radio=options;spoken.push({text,voice:options.voice,gender:options.voiceGender,effect:options.effect,priority:options.priority});voice.state.speaking=true;options.onStarted?.();return true;}};
    window.finishRadio=()=>{voice.state.speaking=false;radio?.onFinished?.();};
    window.ui=mountDoomsdayUI({stage:document.querySelector('main'),getEnvironment:()=>env,getPosition:()=>position,getState:()=>doomsdayView(sim,env),isShared:()=>shared,effects,voice,announce:text=>notices.push(text),getPreferences:()=>preferences,onEnableAudio:()=>{enableRequests++;preferences={...preferences,masterMuted:false,effectsMuted:false,announcementsMuted:false,effectsVolume:100};},now:()=>clock,random});
    window.blocked=gameplayOverlayOpen;document.querySelector('#walk').onclick=()=>moves++;document.addEventListener('keydown',event=>{if(event.key==='w'&&!blocked())moves++;});
    window.reach=id=>{position={...ui.getState().objectives.find(o=>o.id===id).position};};
    window.arrivalCount=()=>spoken.filter(call=>call.text.includes('Shelter reached.')).length;
    window.beginShelterCase=(suffix,inside=false)=>{
     deferRadio=false;voice.state.speaking=voice.state.outputBusy=false;voice.state.pending=0;otherPlayers=[];shared=true;sim={};clock+=10000;
     env={id:'shelter-'+suffix,name:'Shelter arrival check',doomsday:{objectives:[{id:'shelter',position:{x:0,y:0,z:0},arrivalArea:{minX:-5,maxX:5,minZ:-4,maxZ:4}},{id:'supplies',position:{x:12,y:0,z:-12}},{id:'recovery',position:{x:20,y:0,z:-20}}]}};
     position=inside?{x:4.8,y:0,z:3.8}:{x:20,y:0,z:20};window.beforeArrival=arrivalCount();window.beforeCaseSpeech=spoken.length;
    };
    renderer.setAnimationLoop(time=>{if(shared&&env)stepDoomsday(sim,env,clock,{players:[{id:'pilot',health:100,position},...otherPlayers],random});ui.tick(time/1000);if(ui.getState()?.id)eventIds.add(ui.getState().id);renderer.render(scene,camera);});
   }''')
   guide=page.locator('.doomsday-guide')
   page.wait_for_function("ui.getState()?.nextEventAt>clock")
   initial=page.evaluate('ui.getState()');first_at=initial['nextEventAt']
   assert initial['phase']=='idle' and not initial['active']
   assert 15000<=first_at-page.evaluate('enteredAt')<=90000
   assert guide.is_hidden() and page.locator('.doomsday-banner').is_hidden()
   assert page.evaluate('!effects.root.visible && spoken.length===0 && eventIds.size===0')
   # Audio controls are discoverable during the quiet arrival, without starting
   # a scenario or automatically covering the map with a popup.
   chip=page.get_by_role('button',name='Show emergency guide',exact=True)
   assert chip.is_visible()
   chip.tap();assert guide.is_visible()
   page.wait_for_function("document.querySelector('#doomsday-panel').dataset.audioState==='effects-muted'")
   assert 'muted' in guide.locator('[data-audio-status]').inner_text().lower()
   assert guide.locator('[data-follow-state]').inner_text()=='Off'
   effect_switch=guide.get_by_role('switch',name='Sirens and explosions',exact=True)
   assert not effect_switch.is_checked()
   assert guide.get_by_role('button',name='Enable sounds',exact=True).is_enabled()
   guide.get_by_role('button',name='Enable sounds',exact=True).tap()
   page.wait_for_function("document.querySelector('#doomsday-panel [data-audio-status]').textContent==='Enabling sound…'")
   assert guide.get_by_role('button',name='Enable sounds',exact=True).is_enabled(),'A pending mobile resume trapped the only retry button.'
   assert page.evaluate('enableRequests')==1
   page.evaluate('allowAudioResume=true')
   guide.get_by_role('button',name='Enable sounds',exact=True).tap()
   page.wait_for_function("['ready','playing'].includes(document.querySelector('#doomsday-panel').dataset.audioState)")
   assert page.evaluate('enableRequests')==2 and effect_switch.is_checked()
   assert guide.locator('[data-sound-state]').inner_text()=='On'
   assert page.evaluate("ui.getState().phase==='idle' && ui.getState().nextEventAt>clock && randomDraws===1"),'Sound preview started or rescheduled the world event.'
   test_sounds=guide.get_by_role('button',name='Test sounds',exact=True)
   page.wait_for_function("document.querySelector('#doomsday-panel [data-test]').textContent==='Test sounds' && !document.querySelector('#doomsday-panel [data-test]').disabled",timeout=10000)
   test_sounds.tap()
   page.wait_for_function("document.querySelector('#doomsday-panel [data-test]').textContent==='Playing test…'")
   assert page.evaluate("ui.getState().phase==='idle' && eventIds.size===0 && spoken.length===0")
   effect_switch.uncheck()
   page.wait_for_function("document.querySelector('#doomsday-panel').dataset.audioState==='muted'")
   assert guide.locator('[data-sound-state]').inner_text()=='Off'
   assert 'radio calls on' in guide.locator('.doomsday-audio-help').inner_text()
   assert 'media volume' in guide.locator('.doomsday-device-hint').inner_text()
   quiet_follow=guide.get_by_role('switch',name='Follow emergency challenge',exact=True)
   quiet_follow.check();assert guide.locator('[data-follow-state]').inner_text()=='On'
   quiet_follow.uncheck();assert guide.locator('[data-follow-state]').inner_text()=='Off'
   assert page.evaluate('blocked()') is False
   # Every control retains a full touch target, stays inside the scroll drawer,
   # and leaves both full-size movement sticks plus the right action buttons uncovered.
   panel_box=guide.bounding_box()
   assert panel_box['x']>=0 and panel_box['y']>=0 and panel_box['x']+panel_box['width']<=width+1 and panel_box['y']+panel_box['height']<=height+1,panel_box
   def overlap(a,b): return min(a['x']+a['width'],b['x']+b['width'])>max(a['x'],b['x']) and min(a['y']+a['height'],b['y']+b['height'])>max(a['y'],b['y'])
   for control in ['#walk','#look','#game-actions']:
    assert not overlap(panel_box,page.locator(control).bounding_box()),(width,height,control,panel_box)
   for selector in ['[data-hide]','[data-enable]','[data-test]','[data-siren]','[data-follow-challenge]','[data-replay]']:
    target=guide.locator(selector);target.scroll_into_view_if_needed();box=target.bounding_box()
    assert box['width']>=44 and box['height']>=44,(selector,box)
    assert box['x']>=panel_box['x'] and box['x']+box['width']<=panel_box['x']+panel_box['width']+1,(selector,box,panel_box)
   guide.evaluate('node=>node.scrollTop=0')
   page.screenshot(path=f'/workspace/mobile-emergency-panel-{width}x{height}.png')
   page.get_by_role('button',name='Hide emergency guide',exact=True).tap();assert guide.is_hidden() and chip.is_visible()
   page.screenshot(path=f'/workspace/mobile-emergency-collapsed-{width}x{height}.png')
   chip.tap();assert guide.is_visible()
   page.evaluate('preferences.effectsMuted=true')
   page.wait_for_timeout(150)
   assert page.evaluate('randomDraws')==1,'idle frames resampled the event deadline'
   page.evaluate('(at)=>clock=at-1',first_at);page.wait_for_timeout(60)
   assert page.evaluate("ui.getState().phase==='idle'")
   page.evaluate('(at)=>clock=at',first_at)
   page.wait_for_function("ui.getState().phase==='warning'")
   first_state=page.evaluate('ui.getState()');first_id=first_state['id']
   assert first_state['falloutAt']-page.evaluate('enteredAt')<=120000
   assert first_state['nextEventAt'] is None,'An active quest-led event scheduled an overlapping repeat.'
   assert guide.is_visible() and page.evaluate('eventIds.size')==1
   assert page.locator('.doomsday-toggle,[data-operation],[data-objective]').count()==0
   assert page.evaluate('blocked()') is False
   assert guide.get_attribute('data-speaking')=='true'
   first=page.evaluate('spoken[0]')
   assert first['gender']=='male' and first['effect']=='walkie' and first['priority']=='emergency'
   assert 'Cole' in first['text']
   follow=page.get_by_role('switch',name='Follow emergency challenge',exact=True)
   assert not follow.is_checked() and not page.evaluate('ui.followingChallenge()')
   assert guide.locator('[data-challenge]').is_hidden()
   assert page.evaluate("effects.root.getObjectByName('DOOMSDAY_RESPONSE_SITES').children.length===0")
   assert 'continuity shelter' not in first['text'].lower(),'Unfollowed event assigned a response quest.'
   stable=page.evaluate('({id:ui.getState().id,nextEventAt:ui.getState().nextEventAt,phase:ui.getState().phase,draws:randomDraws})')
   follow.check()
   page.wait_for_function("ui.followingChallenge() && effects.root.getObjectByName('DOOMSDAY_RESPONSE_SITES').children.length>0")
   assert guide.locator('[data-challenge]').is_visible()
   assert page.evaluate("localStorage.getItem('muzikaz.emergency.challenge.follow')")=='true'
   assert 'Following the emergency challenge' in page.evaluate('spoken.at(-1).text')
   follow.uncheck()
   page.wait_for_function("!ui.followingChallenge() && effects.root.getObjectByName('DOOMSDAY_RESPONSE_SITES').children.length===0")
   assert guide.locator('[data-challenge]').is_hidden()
   assert 'Emergency supply cache' not in page.locator('.doomsday-banner').inner_text()
   assert 'Challenge tracking off' in page.evaluate('spoken.at(-1).text')
   assert page.evaluate("effects.root.visible && effects.root.getObjectByName('DOOMSDAY_ROTATING_BEACON_0').visible"),'Unfollowing hid the ambient warning.'
   assert page.evaluate('({id:ui.getState().id,nextEventAt:ui.getState().nextEventAt,phase:ui.getState().phase,draws:randomDraws})')==stable,'Following changed the shared event or its random schedule.'
   follow.check()
   page.wait_for_function('ui.followingChallenge()')
   angle=page.evaluate("effects.root.getObjectByName('DOOMSDAY_ROTATING_BEACON_0').getObjectByName('ROTATING_SIREN_LAMP').rotation.y")
   pulse=page.evaluate("effects.root.getObjectByName('DOOMSDAY_ROTATING_BEACON_0').getObjectByName('PULSING_WARNING_LENS').material.opacity")
   page.evaluate('clock+=500');page.wait_for_timeout(80)
   assert page.evaluate("effects.root.getObjectByName('DOOMSDAY_ROTATING_BEACON_0').getObjectByName('ROTATING_SIREN_LAMP').rotation.y")!=angle
   assert page.evaluate("effects.root.getObjectByName('DOOMSDAY_ROTATING_BEACON_0').getObjectByName('PULSING_WARNING_LENS').material.opacity")!=pulse
   page.get_by_role('button',name='Hide emergency guide',exact=True).tap()
   assert guide.is_hidden()
   assert page.evaluate('ui.followingChallenge()'),'Hiding the guide unfollowed the challenge.'
   page.keyboard.press('w');assert page.evaluate('moves')==1
   page.evaluate('window.oldRadio=radio;clock=ui.getState().detonationAt')
   page.wait_for_function("ui.getState().phase==='detonation'")
   assert guide.is_hidden()
   page.get_by_role('button',name='Show emergency guide',exact=True).tap()
   assert follow.is_checked(),'Reopening the guide lost the follow choice.'
   page.evaluate('oldRadio.onFinished?.()')
   assert guide.get_attribute('data-speaking')=='true','old warning callback stopped the new dispatch portrait'
   page.evaluate('finishRadio()');assert guide.get_attribute('data-speaking')=='false'
   page.screenshot(path=f'/workspace/sporadic-detonation-guide-{width}.png')
   page.get_by_role('button',name='Hide emergency guide',exact=True).tap()
   page.evaluate('clock+=7000')
   page.wait_for_function("ui.getState().phase==='fallout'")
   assert guide.is_hidden() and page.evaluate("effects.root.userData.phase==='fallout'")
   # Radio and visible notices continue while this full-length event holds,
   # even with the guide hidden. There is one reminder per quiet interval.
   page.evaluate('window.beforeReminder=spoken.length;finishRadio();clock+=44999')
   page.wait_for_timeout(80)
   assert page.evaluate('spoken.length===beforeReminder'),'Status reminder arrived before its interval.'
   page.evaluate('clock+=1')
   page.wait_for_function('spoken.length===beforeReminder+1')
   reminder=page.evaluate('spoken.at(-1)')
   assert reminder['priority']=='normal' and reminder['gender']=='male' and reminder['effect']=='walkie'
   assert 'supply beacon' in reminder['text'].lower() and guide.is_hidden()
   assert 'fallout warning remains active' in page.evaluate('notices.at(-1)').lower()
   # The original fallout and recovery phases hold until their quests finish.
   page.evaluate('clock=enteredAt+120000');page.wait_for_timeout(80)
   assert page.evaluate("eventIds.size===1 && ui.getState().cycle===1 && ui.getState().phase==='fallout'"),'More than one catastrophe occurred in the first two minutes.'
   page.evaluate('clock+=600000');page.wait_for_timeout(100)
   assert page.evaluate("ui.getState().phase==='fallout' && ui.getState().nextEventAt===null && eventIds.size===1"),'The full fallout challenge was cut short.'
   assert page.evaluate('spoken.length===beforeReminder+1'),'A status update interrupted a transmission.'
   page.evaluate('finishRadio();voice.state.pending=1');page.wait_for_timeout(80)
   assert page.evaluate('spoken.length===beforeReminder+1'),'A reminder queued behind pending speech.'
   page.evaluate('voice.state.pending=0;voice.state.outputBusy=true');page.wait_for_timeout(80)
   assert page.evaluate('spoken.length===beforeReminder+1'),'A reminder interrupted loading speech.'
   page.evaluate('voice.state.outputBusy=false')
   page.wait_for_function('spoken.length===beforeReminder+2')
   page.evaluate('finishRadio()');page.wait_for_timeout(100)
   assert page.evaluate('spoken.length===beforeReminder+2'),'A long clock jump created a backlog of reminders.'
   page.get_by_role('button',name='Show emergency guide',exact=True).tap()
   assert follow.is_checked() and guide.locator('[data-challenge]').is_visible()
   assert page.locator('.doomsday-banner [data-countdown]').inner_text()=='','Fallout displayed a forced cleanup countdown.'
   # Unfollowing changes presentation only; reaching supplies still registers.
   follow.uncheck();page.wait_for_function('!ui.followingChallenge()')
   assert guide.locator('[data-challenge]').is_hidden()
   page.get_by_role('button',name='Hide emergency guide',exact=True).tap()
   page.evaluate("reach('supplies')")
   page.wait_for_function("ui.getState().phase==='recovery'")
   page.evaluate('clock+=600000');page.wait_for_timeout(80)
   assert page.evaluate("ui.getState().phase==='recovery' && ui.getState().nextEventAt===null && eventIds.size===1"),'Recovery was cut short while the relay quest was unfinished.'
   page.evaluate('window.beforeAmbientReminder=spoken.length;finishRadio()')
   page.wait_for_function('spoken.length===beforeAmbientReminder+1')
   assert 'alert remains active' in page.evaluate('spoken.at(-1).text').lower()
   assert 'relay' not in page.evaluate('spoken.at(-1).text').lower(),'Unfollowed status reminder assigned a quest.'
   assert 'Emergency response active' in page.locator('.doomsday-banner').inner_text()
   assert guide.is_hidden()
   page.evaluate('finishRadio();voice.state.muted=true;window.beforeMutedReminder=spoken.length;window.beforeMutedNotice=notices.length;clock+=45000')
   page.wait_for_function('notices.length===beforeMutedNotice+1')
   assert page.evaluate('spoken.length===beforeMutedReminder'),'Muted radio played a recurring status message.'
   assert 'alert remains active' in guide.locator('[data-transcript]').inner_text().lower(),'Muting radio removed ongoing captions.'
   page.evaluate("voice.state.muted=false;Object.defineProperty(document,'hidden',{configurable:true,value:true});clock+=45000")
   page.wait_for_timeout(80)
   assert page.evaluate('spoken.length===beforeMutedReminder && notices.length===beforeMutedNotice+1'),'A hidden tab queued overdue notices.'
   page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:false})")
   page.wait_for_function('spoken.length===beforeMutedReminder+1')
   page.evaluate('finishRadio()');page.wait_for_timeout(80)
   assert page.evaluate('spoken.length===beforeMutedReminder+1'),'Returning to the map created a reminder backlog.'
   page.evaluate("reach('recovery')")
   page.wait_for_function("ui.getState().phase==='clearing'")
   assert page.evaluate('effects.root.visible'),'Clearing should fade the event before hiding it.'
   clearing=page.evaluate('ui.getState()')
   assert clearing['nextEventAt'] is None
   page.evaluate('(at)=>clock=at-1',clearing['clearAt']);page.wait_for_timeout(60)
   assert page.evaluate("ui.getState().phase==='clearing'")
   assert 0<page.evaluate('effects.root.userData.effectOpacity')<.01,'Effects did not fade before all clear.'
   page.evaluate('(at)=>clock=at',clearing['clearAt'])
   page.wait_for_function("ui.getState().phase==='all-clear' && !effects.root.visible")
   assert 'All clear' in page.evaluate('spoken.at(-1).text')
   page.evaluate('finishRadio();window.afterClearNotices=spoken.length;clock+=45000')
   page.wait_for_timeout(100)
   assert page.evaluate('spoken.length===afterClearNotices'),'An active-alert reminder continued after all-clear.'
   assert guide.is_hidden()
   assert guide.locator('progress').get_attribute('value')=='2'
   assert guide.locator('progress').get_attribute('max')=='2'
   next_at=page.evaluate('ui.getState().nextEventAt')
   assert 180000<=next_at-clearing['clearAt']<=1200000,'The quiet break must begin after the full event finishes.'
   page.keyboard.press('w');assert page.evaluate('moves')==2
   # No repeat can interrupt an active quest; after completion it waits for the quiet deadline.
   page.evaluate('(at)=>{clock=at-1;position={x:20,y:0,z:20};}',next_at)
   page.wait_for_timeout(100)
   assert page.evaluate(f"ui.getState().phase==='all-clear' && ui.getState().id==='{first_id}' && eventIds.size===1")
   page.evaluate('(at)=>clock=at',next_at)
   page.wait_for_function("ui.getState().phase==='warning' && eventIds.size===2")
   second=page.evaluate('ui.getState()');assert second['id']!=first_id and second['completedCount']==0
   assert guide.is_hidden(),'A recurring event overrode the hidden guide preference.'
   assert not page.evaluate('ui.followingChallenge()'),'A new event forced challenge tracking back on.'
   # A solo arrival also waits for its stable first deadline rather than starting immediately.
   page.evaluate("env={id:'solo-island',name:'Island'};shared=false;position={x:10,y:0,z:10}")
   page.wait_for_function("ui.getState().mapId==='solo-island' && ui.getState().phase==='idle'")
   assert guide.is_hidden()
   assert not page.evaluate('ui.followingChallenge()'),'Map change reset the persisted unfollow choice.'
   page.evaluate('clock=ui.getState().nextEventAt')
   page.wait_for_function("ui.getState().phase==='warning'")
   assert guide.is_hidden()
   page.get_by_role('button',name='Show emergency guide',exact=True).tap();assert guide.is_visible()
   follow.check();page.wait_for_function('ui.followingChallenge()')
   # A normal queued shelter reply cannot suppress the pending warning animation.
   page.evaluate("deferRadio=true;waitingRadios=[];voice.state.speaking=false;voice.state.outputBusy=true;env={id:'queued-radio-map',name:'Radio checkpoint'};position={x:10,y:0,z:10}")
   page.wait_for_function("ui.getState().mapId==='queued-radio-map' && ui.getState().phase==='idle'")
   page.evaluate('clock=ui.getState().nextEventAt')
   page.wait_for_function("ui.getState().phase==='warning' && waitingRadios.length===1")
   page.evaluate("reach('shelter')");page.wait_for_function('waitingRadios.length===2')
   page.evaluate('voice.state.speaking=true;waitingRadios[0].onStarted()');assert guide.get_attribute('data-speaking')=='true'
   assert 'Shelter reached' in guide.locator('[data-transcript]').inner_text(),'An older queued warning overwrote the confirmed arrival.'
   page.evaluate('waitingRadios[0].onFinished();waitingRadios[1].onStarted();waitingRadios[0].onFinished()')
   assert guide.get_attribute('data-speaking')=='true','old completion ended the newer shelter transmission'
   page.evaluate('clock+=18000')
   page.wait_for_function("ui.getState().phase==='detonation' && waitingRadios.length===3")
   page.evaluate('waitingRadios[2].onStarted();waitingRadios[1].onStarted();waitingRadios[1].onFinished()')
   assert guide.get_attribute('data-speaking')=='true'
   assert 'Detonations' in guide.locator('[data-transcript]').inner_text()
   # A player already in the shelter footprint is recognized on the first
   # warning snapshot, even with tracking off and the guide hidden.
   page.evaluate('deferRadio=false;voice.state.outputBusy=false')
   follow.uncheck()
   page.get_by_role('button',name='Hide emergency guide',exact=True).tap()
   page.evaluate("beginShelterCase('already-inside',true)")
   page.wait_for_function("ui.getState()?.mapId==='shelter-already-inside' && ui.getState().phase==='idle'")
   page.evaluate('clock=ui.getState().nextEventAt')
   page.wait_for_function("ui.getState().phase==='warning' && arrivalCount()===beforeArrival+1")
   assert page.evaluate('spoken.length===beforeCaseSpeech+1'),'Initial arrival queued an obsolete get-to-shelter briefing.'
   assert guide.is_hidden() and not page.evaluate('ui.followingChallenge()')
   assert 'Shelter reached' in page.locator('.doomsday-banner').inner_text()
   assert 'arrival is confirmed' in guide.locator('.doomsday-phase p').inner_text()
   assert page.evaluate("ui.getState().objectives.find(o=>o.id==='shelter').completed")
   arrival=page.evaluate('spoken.at(-1)')
   assert arrival['gender']=='male' and arrival['effect']=='walkie' and arrival['priority']=='emergency'
   assert 'supply response' in arrival['text'].lower() and 'Stay under cover' in arrival['text']
   first_arrival=page.evaluate('arrivalCount()')
   page.evaluate('finishRadio();position={x:20,y:0,z:20};clock+=100');page.wait_for_timeout(80)
   page.evaluate('position={x:4.8,y:0,z:3.8};clock+=100');page.wait_for_timeout(80)
   assert page.evaluate('arrivalCount()')==first_arrival,'Reentering the same event repeated shelter check-in.'
   page.evaluate('clock=ui.getState().falloutAt')
   page.wait_for_function("ui.getState().phase==='fallout'")
   assert 'Relief supply collection is the next response step' in page.evaluate('spoken.at(-1).text')
   assert not page.evaluate('ui.followingChallenge()')
   assert page.evaluate('effects.root.visible && ui.getState().nextEventAt===null'),'Shelter arrival stopped the event.'
   # A room-wide completion cannot confirm a distant viewer. On their own
   # late arrival, even outside the old center radius, give current next steps.
   page.evaluate("beginShelterCase('other-responder')")
   page.wait_for_function("ui.getState()?.mapId==='shelter-other-responder' && ui.getState().phase==='idle'")
   page.evaluate('clock=ui.getState().nextEventAt')
   page.wait_for_function("ui.getState().phase==='warning'")
   page.evaluate("otherPlayers=[{id:'other',actorId:'other',health:100,position:{x:0,y:0,z:0}}]")
   page.wait_for_function("ui.getState().objectives.find(o=>o.id==='shelter').completedBy==='other'")
   assert page.evaluate('arrivalCount()===beforeArrival'),'Another responder falsely acknowledged this viewer.'
   page.evaluate('clock=ui.getState().falloutAt+6000;position={x:4.8,y:4,z:3.8}')
   page.wait_for_function("ui.getState().phase==='fallout'");page.wait_for_timeout(80)
   assert page.evaluate('arrivalCount()===beforeArrival'),'Flying over a shelter acknowledged arrival.'
   page.evaluate('position.y=0')
   page.wait_for_function('arrivalCount()===beforeArrival+1')
   assert 'Relief supply collection is the next response step' in page.evaluate('spoken.at(-1).text')
   assert page.evaluate("ui.getState().objectives.find(o=>o.id==='shelter').completedBy==='other'")
   assert guide.is_hidden() and not page.evaluate('ui.followingChallenge()')
   # Shelter recognition also works during the blasts, then advances the
   # instructions automatically to supply collection without skipping fallout.
   page.evaluate("beginShelterCase('during-blasts')")
   page.wait_for_function("ui.getState()?.mapId==='shelter-during-blasts' && ui.getState().phase==='idle'")
   page.evaluate('clock=ui.getState().nextEventAt')
   page.wait_for_function("ui.getState().phase==='warning'")
   page.evaluate('clock=ui.getState().detonationAt')
   page.wait_for_function("ui.getState().phase==='detonation'")
   page.evaluate('position={x:4.8,y:0,z:3.8}')
   page.wait_for_function('arrivalCount()===beforeArrival+1')
   assert page.evaluate("ui.getState().phase==='detonation' && ui.getState().objectives.find(o=>o.id==='shelter').completed")
   assert 'Stay under cover until the blast passes' in page.evaluate('spoken.at(-1).text')
   assert 'Detonations' in page.evaluate('spoken.at(-1).text')
   page.get_by_role('button',name='Show emergency guide',exact=True).tap();follow.check()
   assert 'shelter arrival is confirmed' in page.evaluate('spoken.at(-1).text')
   page.get_by_role('button',name='Hide emergency guide',exact=True).tap()
   page.evaluate('clock=ui.getState().falloutAt+6000')
   page.wait_for_function("ui.getState().phase==='fallout'")
   assert 'supply cache' in page.evaluate('spoken.at(-1).text').lower()
   page.evaluate("reach('supplies')")
   page.wait_for_function("ui.getState().phase==='recovery'")
   assert 'recovery relay' in page.evaluate('spoken.at(-1).text').lower()
   # First entry during recovery gives the relay step, never an obsolete
   # warning or supply instruction, and still leaves the full event active.
   page.evaluate("beginShelterCase('during-recovery')")
   page.wait_for_function("ui.getState()?.mapId==='shelter-during-recovery' && ui.getState().phase==='idle'")
   page.evaluate('clock=ui.getState().nextEventAt')
   page.wait_for_function("ui.getState().phase==='warning'")
   page.evaluate("clock=ui.getState().falloutAt+6000;reach('supplies')")
   page.wait_for_function("ui.getState().phase==='recovery'")
   page.evaluate('position={x:4.8,y:0,z:3.8}')
   page.wait_for_function('arrivalCount()===beforeArrival+1')
   assert 'marked recovery relay' in page.evaluate('spoken.at(-1).text')
   assert 'supply beacon' not in page.evaluate('spoken.at(-1).text')
   assert page.evaluate("ui.getState().phase==='recovery' && ui.getState().active && ui.getState().nextEventAt===null")
   assert guide.is_hidden() and page.evaluate('ui.followingChallenge()')
   page.evaluate('env=null;ui.reset()');assert guide.is_hidden()
   assert not errors,errors
   print(f'{width}x{height}: clear mobile sound controls, full touch targets, unblocked movement areas, personal shelter arrival in every active stage, automatic next steps, optional challenge toggle, full quest-led event, ongoing notices and movement passed',flush=True)
   page.close()
  # Real explorer styles constrain buttons differently from the isolated canvas.
  # Its embedded scene is only 316px tall and puts movement controls below it.
  for width,height in [(390,844),(320,568)]:
   page=browser.new_page(viewport={'width':width,'height':height},has_touch=True);errors=[]
   page.on('pageerror',lambda error:errors.append(str(error)))
   embedded='''<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/public/assets/game-display-flow.css"><link rel="stylesheet" href="/public/assets/game-menus.css"><style>body{margin:0!important;min-height:100vh!important}.house-explorer-shell{display:block!important;position:static!important;margin:0!important;width:100%!important;height:auto!important}#embedded-stage{position:absolute!important;left:11px;top:180px;width:calc(100% - 22px)!important;height:316px!important;max-height:316px!important;min-height:0!important;margin:0!important;padding:0!important;flex:none!important;overflow:hidden!important;border:0!important}#embedded-quests{position:absolute;left:2px;top:60px;width:min(330px,calc(100% - 4px));height:130px;background:#183221;border:1px solid #a9d493;z-index:20}#close-quests{position:absolute;top:12px;right:6px;width:44px!important;height:44px;min-height:44px;padding:4px}#embedded-move{position:absolute;left:12px;top:520px;width:142px!important;min-height:44px}</style><body class="model-explorer-page"><div class="house-explorer-shell"><main id="embedded-stage" class="house-stage"><canvas></canvas><section id="embedded-quests">Local quests<button id="close-quests" aria-label="Close local quests">×</button></section></main></div><button id="embedded-move">Move</button></body>'''
   page.route('**/__embedded',lambda route:route.fulfill(body=embedded,content_type='text/html'))
   page.route('https://**/*',lambda route:route.abort())
   page.goto(f'http://127.0.0.1:{server.server_port}/__embedded')
   page.evaluate('''async()=>{
    localStorage.removeItem('muzikaz.emergency.guide.hidden');localStorage.removeItem('muzikaz.emergency.challenge.follow');
    const {mountDoomsdayUI}=await import('/public/js/doomsday-ui.js');
    window.preferences={effectsMuted:true};window.audioNodes=0;window.allowAudioResume=false;window.pendingAudio=[];
    const NativeAudioContext=window.AudioContext;
    window.AudioContext=function(){const context=new NativeAudioContext(),resume=context.resume.bind(context),oscillator=context.createOscillator.bind(context);let prototype=Object.getPrototypeOf(context),descriptor;while(prototype&&!descriptor){descriptor=Object.getOwnPropertyDescriptor(prototype,'state');prototype=Object.getPrototypeOf(prototype);}let resumed=false;Object.defineProperty(context,'state',{get:()=>resumed?descriptor.get.call(context):'suspended'});context.resume=()=>{if(!allowAudioResume)return new Promise(resolve=>pendingAudio.push(resolve));resumed=true;return resume();};context.createOscillator=()=>{audioNodes++;return oscillator();};window.holdAudio=()=>{allowAudioResume=false;resumed=false;};window.releaseAudio=async()=>{allowAudioResume=true;resumed=true;await resume();for(const resolve of pendingAudio.splice(0))resolve();};return context;};
    window.embeddedEnv={id:'embedded-airport',name:'Airport shelter',spawn:{x:0,y:0,z:0}};
    window.ui=mountDoomsdayUI({stage:document.querySelector('#embedded-stage'),getEnvironment:()=>embeddedEnv,getPosition:()=>({x:20,y:0,z:20}),isShared:()=>false,getPreferences:()=>preferences,onEnableAudio:()=>preferences={effectsMuted:false,effectsVolume:100},now:()=>100000,random:()=>0});
    document.querySelector('#close-quests').onclick=()=>document.querySelector('#embedded-quests').hidden=true;
    ui.tick(0);
   }''')
   page.wait_for_function("getComputedStyle(document.querySelector('.doomsday-guide-chip')).maxWidth.includes('144px')")
   chip=page.get_by_role('button',name='Show emergency guide',exact=True)
   chip_box=chip.bounding_box();close_box=page.locator('#close-quests').bounding_box()
   assert chip_box['width']<width-144 and not overlap(chip_box,close_box),(chip_box,close_box)
   page.get_by_role('button',name='Close local quests',exact=True).tap()
   assert page.locator('#embedded-quests').is_hidden(),'The emergency chip covered the existing quest close button.'
   chip.tap();guide=page.locator('.doomsday-guide')
   assert guide.is_visible()
   panel_box=guide.bounding_box();stage_box=page.locator('#embedded-stage').bounding_box()
   assert panel_box['height']>=200 and panel_box['y']+panel_box['height']<=stage_box['y']+stage_box['height']+1,(panel_box,stage_box)
   assert not overlap(panel_box,page.locator('#embedded-move').bounding_box())
   # An old map's hung enable request cannot play a preview or leave a busy
   # latch after changing worlds or explicitly resetting the guide.
   for action in ['world-change','reset']:
    page.get_by_role('button',name='Enable sounds',exact=True).tap()
    page.wait_for_function("document.querySelector('[data-audio-status]').textContent==='Enabling sound…'")
    if action=='world-change':page.evaluate("embeddedEnv={...embeddedEnv,id:'embedded-airport-next'};ui.tick(0);ui.open()")
    else:page.evaluate('ui.reset();ui.tick(0);ui.open()')
    assert 'Enabling' not in guide.locator('[data-audio-status]').inner_text()
    page.evaluate('releaseAudio()');page.evaluate('ui.tick(0)');page.wait_for_timeout(50)
    assert page.evaluate('audioNodes')==0,'A stale audio enable played a preview in a new map.'
    if action=='world-change':page.evaluate('holdAudio();ui.tick(0)')
   page.screenshot(path=f'/workspace/mobile-emergency-embedded-{width}x{height}.png')
   page.get_by_role('button',name='Test sounds',exact=True).tap();page.evaluate('ui.tick(0)')
   page.wait_for_function('audioNodes>0')
   assert page.evaluate("ui.getState().phase==='idle'")
   page.evaluate('ui.dispose()')
   assert not errors,errors
   print(f'{width}x{height}: real explorer styles, 316px embedded drawer, quest-close access and stale audio enable cancellation passed',flush=True)
   page.close()
  browser.close()
finally: server.shutdown()
