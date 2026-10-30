"""Automatic radio guide: no start buttons, hidden progression, voice and input."""
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
    window.clock=100000;window.env={id:'radio-airport',name:'Airport response',spawn:{x:0,y:0,z:0}};window.position={x:20,y:0,z:20};window.sim={};window.spoken=[];window.moves=0;window.shared=true;
    window.scene=new THREE.Scene();scene.background=new THREE.Color('#14252d');
    window.camera=new THREE.PerspectiveCamera(65,innerWidth/innerHeight,.1,700);camera.position.set(0,7,24);camera.lookAt(0,10,-160);
    window.renderer=new THREE.WebGLRenderer({canvas:document.querySelector('canvas')});renderer.setSize(innerWidth,innerHeight);
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(150,150),new THREE.MeshBasicMaterial({color:'#304139'}));ground.rotation.x=-Math.PI/2;ground.position.y=-.01;scene.add(ground);
    window.effects=createDoomsdayScene({scene,performanceMode:true});
    window.voice={state:{speaking:false,outputBusy:false},announce(text,options){if(window.deferRadio){(window.waitingRadios||=[]).push(options);return true;}window.radio?.onCancelled?.();window.radio=options;spoken.push({text,voice:options.voice,gender:options.voiceGender,effect:options.effect,priority:options.priority});voice.state.speaking=true;options.onStarted?.();return true;}};
    window.finishRadio=()=>{voice.state.speaking=false;radio?.onFinished?.();};
    window.ui=mountDoomsdayUI({stage:document.querySelector('main'),getEnvironment:()=>env,getPosition:()=>position,getState:()=>doomsdayView(sim,env),isShared:()=>shared,effects,voice,getPreferences:()=>({masterMuted:true}),now:()=>clock});
    window.blocked=gameplayOverlayOpen;document.querySelector('#walk').onclick=()=>moves++;document.addEventListener('keydown',event=>{if(event.key==='w'&&!blocked())moves++;});
    window.reach=id=>{position={...ui.getState().objectives.find(o=>o.id===id).position};};
    renderer.setAnimationLoop(time=>{if(shared)stepDoomsday(sim,env,clock,{players:[{id:'pilot',health:100,position}]});ui.tick(time/1000);renderer.render(scene,camera);});
   }''')
   guide=page.locator('.doomsday-guide')
   page.wait_for_function("ui.getState()?.phase==='warning'")
   assert guide.is_visible()
   assert page.locator('.doomsday-toggle,[data-operation],[data-objective]').count()==0
   assert page.evaluate('blocked()') is False
   assert guide.get_attribute('data-speaking')=='true'
   first=page.evaluate('spoken[0]')
   assert first['gender']=='male' and first['effect']=='walkie' and first['priority']=='emergency'
   assert 'Cole' in first['text']
   page.get_by_role('button',name='Hide emergency guide',exact=True).tap()
   assert guide.is_hidden()
   page.keyboard.press('w');assert page.evaluate('moves')==1
   page.evaluate('window.oldRadio=radio;clock+=18000')
   page.wait_for_function("ui.getState().phase==='detonation'")
   assert guide.is_hidden()
   page.get_by_role('button',name='Show emergency guide',exact=True).tap()
   page.wait_for_function("document.querySelector('.doomsday-guide').dataset.speaking==='true'")
   page.evaluate('oldRadio.onFinished?.()')
   assert guide.get_attribute('data-speaking')=='true','old warning callback stopped the new dispatch portrait'
   page.evaluate('finishRadio()')
   assert guide.get_attribute('data-speaking')=='false'
   page.screenshot(path=f'/workspace/automatic-detonation-guide-{width}.png')
   page.get_by_role('button',name='Hide emergency guide',exact=True).tap()
   page.evaluate('clock+=7000')
   page.wait_for_function("ui.getState().phase==='fallout'")
   assert guide.is_hidden()
   assert page.evaluate("effects.root.userData.phase==='fallout'")
   page.evaluate("reach('supplies')")
   page.wait_for_timeout(100)
   assert page.evaluate("ui.getState().phase==='fallout'"),'fallout must remain visible before automatic supply collection'
   page.evaluate('clock+=5000')
   page.wait_for_function("ui.getState().phase==='recovery'")
   page.evaluate("reach('recovery')")
   page.wait_for_function("ui.getState().phase==='all-clear' && !effects.root.visible")
   assert guide.is_hidden()
   assert guide.locator('progress').get_attribute('value')=='2'
   assert guide.locator('progress').get_attribute('max')=='2'
   assert any('Fallout has begun' in call['text'] for call in page.evaluate('spoken'))
   page.keyboard.press('w');assert page.evaluate('moves')==2
   # The same guide automatically starts a fresh solo map with hidden preference intact.
   page.evaluate("env={id:'solo-island',name:'Island'};shared=false;position={x:10,y:0,z:10}")
   page.wait_for_function("ui.getState().mapId==='solo-island' && ui.getState().phase==='warning'")
   assert guide.is_hidden()
   page.get_by_role('button',name='Show emergency guide',exact=True).tap()
   assert guide.is_visible()
   # A normal queued shelter reply cannot suppress the pending warning animation.
   page.evaluate("deferRadio=true;waitingRadios=[];voice.state.speaking=false;voice.state.outputBusy=true;env={id:'queued-radio-map',name:'Radio checkpoint'};position={x:10,y:0,z:10}")
   page.wait_for_function("ui.getState().mapId==='queued-radio-map' && waitingRadios.length===1")
   page.evaluate("reach('shelter')")
   page.wait_for_function('waitingRadios.length===2')
   page.evaluate('voice.state.speaking=true;waitingRadios[0].onStarted()')
   assert guide.get_attribute('data-speaking')=='true'
   page.evaluate('waitingRadios[0].onFinished();waitingRadios[1].onStarted();waitingRadios[0].onFinished()')
   assert guide.get_attribute('data-speaking')=='true','old completion ended the newer shelter transmission'
   page.evaluate('clock+=18000')
   page.wait_for_function("ui.getState().phase==='detonation' && waitingRadios.length===3")
   page.evaluate('waitingRadios[2].onStarted();waitingRadios[1].onStarted();waitingRadios[1].onFinished()')
   assert guide.get_attribute('data-speaking')=='true'
   assert 'Detonations' in guide.locator('[data-transcript]').inner_text()
   page.evaluate('env=null;ui.reset()')
   assert guide.is_hidden()
   assert not errors,errors
   print(f'{width}px: automatic warning, hidden timed explosions/fallout, male radio callbacks, proximity quests, free movement and solo arrival passed',flush=True)
   page.close()
  browser.close()
finally: server.shutdown()
