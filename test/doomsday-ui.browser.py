"""Emergency menu, phase effects, voice, movement, retry and resource lifecycle."""
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
        const THREE=await import('/public/vendor/three/three.module.min.js');
        const {mountDoomsdayUI}=await import('/public/js/doomsday-ui.js'),{createDoomsdayScene}=await import('/public/js/doomsday-scene.js');
        const {doomsdayView,doomsdayCommand}=await import('/public/js/doomsday-rules.js');
        const {gameplayOverlayOpen}=await import('/public/js/game-menu-controls.js');
        window.env={id:'demo-airport',name:'Airport response',spawn:{x:0,y:0,z:0}};window.position={x:0,y:0,z:0};window.sim={};window.spoken=[];window.commands=[];window.moves=0;window.fail=false;window.shared=true;
        window.scene=new THREE.Scene();scene.background=new THREE.Color('#14252d');
        window.camera=new THREE.PerspectiveCamera(65,innerWidth/innerHeight,.1,700);camera.position.set(0,6,22);camera.lookAt(0,4,-100);
        window.renderer=new THREE.WebGLRenderer({canvas:document.querySelector('canvas')});renderer.setSize(innerWidth,innerHeight);
        const ground=new THREE.Mesh(new THREE.PlaneGeometry(150,150),new THREE.MeshBasicMaterial({color:'#304139'}));ground.rotation.x=-Math.PI/2;ground.position.y=-.01;scene.add(ground);
        window.effects=createDoomsdayScene({scene,performanceMode:true});
        window.ui=mountDoomsdayUI({stage:document.querySelector('main'),getEnvironment:()=>env,getPosition:()=>position,getState:()=>doomsdayView(sim,env),isShared:()=>shared,effects,voice:{announce:(text)=>spoken.push(text)},getActors:()=>({plane:{id:'plane',modelId:'doomsday-command-aircraft',name:'Nightfall'}}),board:async id=>({id}),send:async fields=>{
          const requestSim=sim,requestEnv=env;commands.push(fields);await new Promise(resolve=>setTimeout(resolve,240));if(fail)throw new Error('Connection interrupted. Retry.');return doomsdayCommand(requestSim,{id:'pilot',health:100,position},requestEnv,fields,Date.now());
        }});
        window.blocked=gameplayOverlayOpen;document.querySelector('#walk').onclick=()=>moves++;document.addEventListener('keydown',event=>{if(event.key==='w'&&!blocked())moves++;});
        window.reachNext=()=>{position={...ui.getState().objectives.find(o=>o.phase===ui.getState().phase).position};};
        renderer.setAnimationLoop(time=>{ui.tick(time/1000);renderer.render(scene,camera);});
      }''')
      page.locator('.doomsday-toggle').tap()
      assert page.evaluate('blocked()') is False
      page.locator('[data-operation=start]').tap()
      assert page.locator('.game-action-loading').is_visible()
      page.keyboard.press('w')
      page.wait_for_function("ui.getState()?.phase==='warning' && !document.querySelector('[data-operation=stop]')?.disabled")
      assert page.evaluate('moves')==1
      assert page.evaluate('commands.length')==1
      assert page.evaluate('effects.root.visible')
      assert any('Next objective' in s for s in page.evaluate('spoken'))
      # Server rejects remote check-ins; menu recovers with a usable retry.
      page.evaluate('position={x:100,y:0,z:100}')
      page.locator('[data-objective=shelter]').tap()
      page.wait_for_function("document.querySelector('[data-feedback]').textContent.includes('4.5 metres')")
      for phase in ['warning','fallout','recovery']:
        page.evaluate('reachNext()')
        page.locator('[data-objective]').tap()
        page.wait_for_function("ui.getState().canAdvance && !document.querySelector('[data-operation=advance]').disabled")
        page.locator('[data-operation=advance]').tap()
        page.wait_for_function('(phase)=>ui.getState().phase!==phase',arg=phase)
        if phase=='warning':
          page.wait_for_function("document.querySelector('.doomsday-banner').dataset.phase==='fallout'")
          page.screenshot(path=f'/workspace/doomsday-fallout-{width}.png')
          assert page.evaluate('effects.root.visible')
      page.wait_for_function("!effects.root.visible && ui.getState().phase==='all-clear'")
      assert page.locator('.doomsday-banner').is_hidden()
      assert len(page.evaluate('spoken'))>=7
      # A failed start does not leave a disabled menu or a stuck progress state.
      page.evaluate('fail=true')
      page.locator('[data-operation=start]').tap()
      page.wait_for_function("document.querySelector('[data-feedback]').textContent.includes('Connection interrupted')")
      assert page.locator('[data-operation=start]').is_enabled()
      page.evaluate('fail=false')
      page.locator('[data-operation=start]').tap()
      page.wait_for_function("ui.getState().phase==='warning' && !document.querySelector('[data-operation=stop]').disabled")
      page.locator('[data-operation=stop]').tap()
      page.wait_for_function("ui.getState().phase==='idle' && !effects.root.visible")
      # Switching maps discards in-flight local UI feedback; new map is standby.
      page.locator('[data-operation=start]').tap()
      page.evaluate("env={id:'another-map',name:'Recovery island'};sim={}")
      page.wait_for_timeout(500)
      assert page.evaluate("ui.getState().mapId==='another-map' && ui.getState().phase==='idle'")
      # Same playable phase cycle in solo mode.
      page.evaluate('shared=false;ui.open()')
      page.locator('[data-operation=start]').tap()
      page.wait_for_function("ui.getState().phase==='warning'")
      assert page.evaluate('blocked()') is False
      page.keyboard.press('w');assert page.evaluate('moves')==2
      page.evaluate('''()=>{
        effects.reset();renderer.render(scene,camera);const baseline={...renderer.info.memory};
        for(let index=0;index<12;index++){
          const state={id:'replay-'+index,phase:'fallout',objectives:[{id:'supplies',name:'Supplies',phase:'fallout',position:{x:0,y:0,z:0}}]};
          effects.update(state,env,position,index);renderer.render(scene,camera);effects.reset();renderer.render(scene,camera);
        }
        if(renderer.info.memory.geometries>baseline.geometries||renderer.info.memory.textures>baseline.textures)throw Error('Scenario replay retained GPU resources');
      }''')
      assert not errors,errors
      print(f'{width}px: phased response, glow, speech, loading, retry, free movement, shared/solo and map reset passed',flush=True)
      page.close()
    browser.close()
finally: server.shutdown()
