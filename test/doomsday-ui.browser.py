"""Sporadic emergency scheduling, hidden guide, automatic clearing and radio."""
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
fixture='''<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#18292f}main{position:relative;height:100vh}canvas{width:100%;height:100%}#walk{position:absolute;bottom:12px;left:12px;min-height:44px}</style><main><canvas></canvas><button id="walk">Move forward</button></main>'''
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
  for width,height in [(390,844),(1280,900)]:
   page=browser.new_page(viewport={'width':width,'height':height},has_touch=True)
   errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
   page.route('**/__doomsday',lambda route:route.fulfill(body=fixture,content_type='text/html'))
   page.goto(f'http://127.0.0.1:{server.server_port}/__doomsday')
   page.evaluate('''async()=>{
    localStorage.removeItem('muzikaz.emergency.guide.hidden');
    const THREE=await import('/public/vendor/three/three.module.min.js');
    const {mountDoomsdayUI}=await import('/public/js/doomsday-ui.js'),{createDoomsdayScene}=await import('/public/js/doomsday-scene.js');
    const {doomsdayView,stepDoomsday}=await import('/public/js/doomsday-rules.js');
    const {gameplayOverlayOpen}=await import('/public/js/game-menu-controls.js');
    window.clock=100000;window.enteredAt=clock;window.env={id:'radio-airport',name:'Airport response',spawn:{x:0,y:0,z:0}};window.position={x:20,y:0,z:20};window.sim={};window.spoken=[];window.moves=0;window.shared=true;window.randomDraws=0;window.eventIds=new Set();
    window.random=()=>{randomDraws++;return .25;};
    window.scene=new THREE.Scene();scene.background=new THREE.Color('#14252d');
    window.camera=new THREE.PerspectiveCamera(65,innerWidth/innerHeight,.1,700);camera.position.set(0,7,24);camera.lookAt(0,10,-160);
    window.renderer=new THREE.WebGLRenderer({canvas:document.querySelector('canvas')});renderer.setSize(innerWidth,innerHeight);
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(150,150),new THREE.MeshBasicMaterial({color:'#304139'}));ground.rotation.x=-Math.PI/2;ground.position.y=-.01;scene.add(ground);
    window.effects=createDoomsdayScene({scene,performanceMode:true});
    window.voice={state:{speaking:false,outputBusy:false},announce(text,options){if(window.deferRadio){(window.waitingRadios||=[]).push(options);return true;}window.radio?.onCancelled?.();window.radio=options;spoken.push({text,voice:options.voice,gender:options.voiceGender,effect:options.effect,priority:options.priority});voice.state.speaking=true;options.onStarted?.();return true;}};
    window.finishRadio=()=>{voice.state.speaking=false;radio?.onFinished?.();};
    window.ui=mountDoomsdayUI({stage:document.querySelector('main'),getEnvironment:()=>env,getPosition:()=>position,getState:()=>doomsdayView(sim,env),isShared:()=>shared,effects,voice,getPreferences:()=>({masterMuted:true}),now:()=>clock,random});
    window.blocked=gameplayOverlayOpen;document.querySelector('#walk').onclick=()=>moves++;document.addEventListener('keydown',event=>{if(event.key==='w'&&!blocked())moves++;});
    window.reach=id=>{position={...ui.getState().objectives.find(o=>o.id===id).position};};
    renderer.setAnimationLoop(time=>{if(shared)stepDoomsday(sim,env,clock,{players:[{id:'pilot',health:100,position}],random});ui.tick(time/1000);if(ui.getState()?.id)eventIds.add(ui.getState().id);renderer.render(scene,camera);});
   }''')
   guide=page.locator('.doomsday-guide')
   page.wait_for_function("ui.getState()?.nextEventAt>clock")
   initial=page.evaluate('ui.getState()');first_at=initial['nextEventAt']
   assert initial['phase']=='idle' and not initial['active']
   assert 15000<=first_at-page.evaluate('enteredAt')<=90000
   assert guide.is_hidden() and page.locator('.doomsday-banner').is_hidden()
   assert page.evaluate('!effects.root.visible && spoken.length===0 && eventIds.size===0')
   page.wait_for_timeout(150)
   assert page.evaluate('randomDraws')==1,'idle frames resampled the event deadline'
   page.evaluate('(at)=>clock=at-1',first_at);page.wait_for_timeout(60)
   assert page.evaluate("ui.getState().phase==='idle'")
   page.evaluate('(at)=>clock=at',first_at)
   page.wait_for_function("ui.getState().phase==='warning'")
   first_state=page.evaluate('ui.getState()');first_id=first_state['id'];next_at=first_state['nextEventAt']
   assert first_state['falloutAt']-page.evaluate('enteredAt')<=120000
   assert 180000<=next_at-first_state['startedAt']<=1200000
   assert guide.is_visible() and page.evaluate('eventIds.size')==1
   assert page.locator('.doomsday-toggle,[data-operation],[data-objective]').count()==0
   assert page.evaluate('blocked()') is False
   assert guide.get_attribute('data-speaking')=='true'
   first=page.evaluate('spoken[0]')
   assert first['gender']=='male' and first['effect']=='walkie' and first['priority']=='emergency'
   assert 'Cole' in first['text']
   angle=page.evaluate("effects.root.getObjectByName('DOOMSDAY_ROTATING_BEACON_0').getObjectByName('ROTATING_SIREN_LAMP').rotation.y")
   pulse=page.evaluate("effects.root.getObjectByName('DOOMSDAY_ROTATING_BEACON_0').getObjectByName('PULSING_WARNING_LENS').material.opacity")
   page.evaluate('clock+=500');page.wait_for_timeout(80)
   assert page.evaluate("effects.root.getObjectByName('DOOMSDAY_ROTATING_BEACON_0').getObjectByName('ROTATING_SIREN_LAMP').rotation.y")!=angle
   assert page.evaluate("effects.root.getObjectByName('DOOMSDAY_ROTATING_BEACON_0').getObjectByName('PULSING_WARNING_LENS').material.opacity")!=pulse
   page.get_by_role('button',name='Hide emergency guide',exact=True).tap()
   assert guide.is_hidden()
   page.keyboard.press('w');assert page.evaluate('moves')==1
   page.evaluate('window.oldRadio=radio;clock=ui.getState().detonationAt')
   page.wait_for_function("ui.getState().phase==='detonation'")
   assert guide.is_hidden()
   page.get_by_role('button',name='Show emergency guide',exact=True).tap()
   page.evaluate('oldRadio.onFinished?.()')
   assert guide.get_attribute('data-speaking')=='true','old warning callback stopped the new dispatch portrait'
   page.evaluate('finishRadio()');assert guide.get_attribute('data-speaking')=='false'
   page.screenshot(path=f'/workspace/sporadic-detonation-guide-{width}.png')
   page.get_by_role('button',name='Hide emergency guide',exact=True).tap()
   page.evaluate('clock+=7000')
   page.wait_for_function("ui.getState().phase==='fallout'")
   assert guide.is_hidden() and page.evaluate("effects.root.userData.phase==='fallout'")
   page.evaluate("reach('supplies')")
   page.wait_for_timeout(100)
   assert page.evaluate("ui.getState().phase==='fallout'")
   page.evaluate('clock+=5000')
   page.wait_for_function("ui.getState().phase==='recovery'")
   page.evaluate("reach('recovery')")
   page.wait_for_function("ui.getState().phase==='clearing'")
   assert page.evaluate('effects.root.visible'),'clearing should fade the event before hiding it'
   clearing=page.evaluate('ui.getState()')
   page.evaluate('(at)=>clock=at-1',clearing['clearAt']);page.wait_for_timeout(60)
   assert page.evaluate("ui.getState().phase==='clearing'")
   assert 0<page.evaluate('effects.root.userData.effectOpacity')<.01,'effects did not fade before all clear'
   page.evaluate('(at)=>clock=at',clearing['clearAt'])
   page.wait_for_function("ui.getState().phase==='all-clear' && !effects.root.visible")
   assert guide.is_hidden()
   assert guide.locator('progress').get_attribute('value')=='2'
   assert guide.locator('progress').get_attribute('max')=='2'
   assert page.evaluate('ui.getState().nextEventAt')==next_at,'quest completion resampled the recurring deadline'
   assert any('Fallout has begun' in call['text'] for call in page.evaluate('spoken'))
   page.keyboard.press('w');assert page.evaluate('moves')==2
   page.evaluate('clock=enteredAt+120000');page.wait_for_timeout(80)
   assert page.evaluate("eventIds.size===1 && ui.getState().cycle===1 && ui.getState().phase==='all-clear'"),'more than one catastrophe occurred within the first two minutes'
   # The next event is start-to-start 3–20 minutes later; no early restart.
   page.evaluate('(at)=>{clock=at-1;position={x:20,y:0,z:20};}',next_at)
   page.wait_for_timeout(100)
   assert page.evaluate(f"ui.getState().phase==='all-clear' && ui.getState().id==='{first_id}' && eventIds.size===1")
   page.evaluate('(at)=>clock=at',next_at)
   page.wait_for_function("ui.getState().phase==='warning' && eventIds.size===2")
   second=page.evaluate('ui.getState()');assert second['id']!=first_id and second['completedCount']==0
   assert guide.is_hidden(),'a recurring event overrode the hidden guide preference'
   # This run has no quest visits: the fallout must still clear itself.
   page.evaluate('(at)=>clock=at',second['clearingAt'])
   page.wait_for_function("ui.getState().phase==='clearing'")
   page.evaluate('(at)=>clock=at',second['clearAt'])
   page.wait_for_function("ui.getState().phase==='all-clear' && !effects.root.visible")
   assert page.evaluate('ui.getState().completedCount')==0
   # A solo arrival also waits for its stable first deadline rather than starting immediately.
   page.evaluate("env={id:'solo-island',name:'Island'};shared=false;position={x:10,y:0,z:10}")
   page.wait_for_function("ui.getState().mapId==='solo-island' && ui.getState().phase==='idle'")
   assert guide.is_hidden()
   page.evaluate('clock=ui.getState().nextEventAt')
   page.wait_for_function("ui.getState().phase==='warning'")
   assert guide.is_hidden()
   page.get_by_role('button',name='Show emergency guide',exact=True).tap();assert guide.is_visible()
   # A normal queued shelter reply cannot suppress the pending warning animation.
   page.evaluate("deferRadio=true;waitingRadios=[];voice.state.speaking=false;voice.state.outputBusy=true;env={id:'queued-radio-map',name:'Radio checkpoint'};position={x:10,y:0,z:10}")
   page.wait_for_function("ui.getState().mapId==='queued-radio-map' && ui.getState().phase==='idle'")
   page.evaluate('clock=ui.getState().nextEventAt')
   page.wait_for_function("ui.getState().phase==='warning' && waitingRadios.length===1")
   page.evaluate("reach('shelter')");page.wait_for_function('waitingRadios.length===2')
   page.evaluate('voice.state.speaking=true;waitingRadios[0].onStarted()');assert guide.get_attribute('data-speaking')=='true'
   page.evaluate('waitingRadios[0].onFinished();waitingRadios[1].onStarted();waitingRadios[0].onFinished()')
   assert guide.get_attribute('data-speaking')=='true','old completion ended the newer shelter transmission'
   page.evaluate('clock+=18000')
   page.wait_for_function("ui.getState().phase==='detonation' && waitingRadios.length===3")
   page.evaluate('waitingRadios[2].onStarted();waitingRadios[1].onStarted();waitingRadios[1].onFinished()')
   assert guide.get_attribute('data-speaking')=='true'
   assert 'Detonations' in guide.locator('[data-transcript]').inner_text()
   page.evaluate('env=null;ui.reset()');assert guide.is_hidden()
   assert not errors,errors
   print(f'{width}px: stable first/repeat deadlines, hidden timed phases, male radio, proximity quests, automatic no-quest clearing and free movement passed',flush=True)
   page.close()
  browser.close()
finally: server.shutdown()
