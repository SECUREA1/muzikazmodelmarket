"""Render all impacts and exercise real Web Audio through recovery and all-clear."""
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
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
  for width,height in [(390,844),(1280,900)]:
   page=browser.new_page(viewport={'width':width,'height':height});errors=[]
   page.on('pageerror',lambda error:errors.append(str(error)))
   page.on('console',lambda message:errors.append(message.text) if message.type=='error' else None)
   page.route('**/__cinematic',lambda route:route.fulfill(body='<style>body{margin:0}canvas{display:block}</style><canvas></canvas>',content_type='text/html'))
   page.goto(f'http://127.0.0.1:{server.server_port}/__cinematic')
   page.evaluate('''async()=>{
    const T=await import('/public/vendor/three/three.module.min.js'),{createDoomsdayScene}=await import('/public/js/doomsday-scene.js'),{createDoomsdayAudio}=await import('/public/js/doomsday-audio.js');
    window.scene=new T.Scene();scene.background=new T.Color('#4a7694');
    window.camera=new T.PerspectiveCamera(68,innerWidth/innerHeight,.05,700);camera.position.set(0,8,15);camera.lookAt(85,30,-155);
    window.renderer=new T.WebGLRenderer({canvas:document.querySelector('canvas'),preserveDrawingBuffer:true});renderer.setSize(innerWidth,innerHeight);
    window.effects=createDoomsdayScene({scene,performanceMode:true});
    window.audioOscillators=[];window.audioGains=[];window.radioSpeaking=false;
    window.NativeAudioContext=window.AudioContext;window.makeObservedContext=()=>{
     const context=window.audioContext=new NativeAudioContext(),oscillator=context.createOscillator.bind(context),gain=context.createGain.bind(context);
     const observe=(node,list)=>{const record={node,targets:[],disconnected:0};list.push(record);const disconnect=node.disconnect.bind(node);node.disconnect=(...args)=>{record.disconnected++;return disconnect(...args);};return record;};
     context.createOscillator=()=>{const node=oscillator();observe(node,audioOscillators);return node;};
     context.createGain=()=>{const node=gain(),record=observe(node,audioGains),target=node.gain.setTargetAtTime.bind(node.gain);node.gain.setTargetAtTime=(value,...args)=>{record.targets.push(value);return target(value,...args);};return node;};return context;
    };window.audio=createDoomsdayAudio({isSpeaking:()=>radioSpeaking,makeContext:makeObservedContext});
    window.boomCount=()=>audioOscillators.filter(record=>record.node.type==='triangle').length;
    window.activeSiren=()=>audioGains.findLast(record=>!record.disconnected&&record.targets.some(target=>Math.abs(target-.16)<1e-8));
    window.draw=(phase,phaseElapsedMs=0,time=0,reducedMotion=false)=>{const state={id:'render-test',phase,phaseElapsedMs,objectives:[{id:'site',name:'Response site',phase,position:{x:0,y:0,z:-5}}]};effects.update(state,{id:'airport'},{x:0,y:0,z:0},time,{reducedMotion});audio.update(state,time);renderer.render(scene,camera);};
    draw('warning');
   }''')
   assert page.evaluate('audioOscillators.length')==0,'Audio started before a user gesture.'
   page.mouse.click(12,12)
   page.wait_for_function("audioContext?.state==='running'")
   page.evaluate("draw('warning',0,0)")
   assert page.evaluate('audioOscillators.length')==2
   assert page.evaluate('activeSiren().targets.at(-1)')==.16
   page.evaluate("radioSpeaking=true;draw('warning',250,.25)")
   assert page.evaluate('activeSiren().targets.at(-1)')==.05
   page.evaluate('radioSpeaking=false')
   warning=page.evaluate('effects.root.userData.skyColor')
   angle=page.evaluate("effects.root.getObjectByName('ROTATING_SIREN_LAMP').rotation.y")
   pulse=page.evaluate("effects.root.getObjectByName('PULSING_WARNING_LENS').material.opacity")
   page.evaluate("draw('warning',500,.5)")
   assert page.evaluate("effects.root.getObjectByName('ROTATING_SIREN_LAMP').rotation.y")!=angle
   assert page.evaluate("effects.root.getObjectByName('PULSING_WARNING_LENS').material.opacity")!=pulse

   page.evaluate("draw('detonation',0,1)")
   assert page.evaluate('boomCount()')==1
   page.evaluate("draw('detonation',1500,2.5)")
   assert page.evaluate('boomCount()')==1,'A second impact played before its fireball.'
   page.evaluate("draw('detonation',1600,2.6)")
   assert page.evaluate('boomCount()')==2
   page.evaluate("draw('detonation',3200,4.2)")
   assert page.evaluate('boomCount()')==3
   assert page.evaluate("effects.root.getObjectByName('DOOMSDAY_DISTANT_BLAST_3').getObjectByName('GROWING_FIREBALL').visible")
   assert page.evaluate('effects.root.userData.skyColor')!=warning
   assert page.evaluate("effects.root.getObjectByName('GROWING_FIREBALL').visible")
   page.screenshot(path=f'/workspace/doomsday-explosion-{width}.png')
   page.evaluate("draw('detonation',6999,7.999);window.lastBlast=effects.root.getObjectByName('DOOMSDAY_DISTANT_BLAST_3');window.beforeFallout=lastBlast.getObjectByName('GROWING_FIREBALL').scale.x;draw('fallout',0,8)")
   assert page.evaluate("lastBlast.getObjectByName('GROWING_FIREBALL').visible && lastBlast.getObjectByName('EXPANDING_SHOCKWAVE').visible"),'The final impact was cut off by the fallout transition.'
   assert page.evaluate("Math.abs(lastBlast.getObjectByName('GROWING_FIREBALL').scale.x-beforeFallout)<.02")
   page.evaluate("draw('fallout',1300,9.3)")
   assert page.evaluate("effects.root.getObjectByName('DOOMSDAY_FALLING_ASH').visible")
   assert page.evaluate("!lastBlast.getObjectByName('GROWING_FIREBALL').visible && !lastBlast.getObjectByName('EXPANDING_SHOCKWAVE').visible")
   page.screenshot(path=f'/workspace/doomsday-automatic-fallout-{width}.png')
   page.evaluate("draw('fallout',588000,596);draw('recovery',0,1000);draw('recovery',588000,1588)")
   assert page.evaluate('activeSiren().targets.at(-1)')==.16,'A long quest-led recovery silenced the emergency siren.'
   assert page.evaluate("effects.root.visible && effects.root.getObjectByName('DOOMSDAY_FALLING_ASH').visible")
   assert page.evaluate('boomCount()')==3,'Long response phases replayed completed bomb impacts.'
   page.evaluate("draw('clearing',0,1600);window.fadeSiren=activeSiren()")
   start=page.evaluate("effects.root.getObjectByName('DOOMSDAY_COLOURED_SKY').material.uniforms.opacity.value")
   assert page.evaluate('fadeSiren.targets.at(-1)')==.16
   page.evaluate("draw('clearing',4000,1604)")
   assert page.evaluate('effects.root.userData.effectOpacity')==.5
   assert page.evaluate('fadeSiren.targets.at(-1)')==.08,'The siren did not fade with the clearing sky.'
   assert page.evaluate("effects.root.getObjectByName('DOOMSDAY_COLOURED_SKY').material.uniforms.opacity.value")<start
   page.evaluate("draw('clearing',8000,1608)")
   assert page.evaluate("effects.root.getObjectByName('PULSING_WARNING_LENS').material.opacity")==0
   assert page.evaluate('audioGains.every(record=>record.disconnected>0)'),'Audio nodes remained connected after clearing.'
   page.evaluate("draw('all-clear',0,1609)")
   assert page.evaluate('!effects.root.visible')
   assert page.evaluate('audioOscillators.every(record=>record.disconnected>0)')
   page.evaluate("draw('detonation',3000,20,true)")

   assert page.evaluate("!effects.root.getObjectByName('GROWING_FIREBALL').visible && !effects.root.getObjectByName('EXPANDING_SHOCKWAVE').visible")
   page.evaluate('''()=>{
    effects.reset();renderer.render(scene,camera);const base={...renderer.info.memory};
    for(let n=0;n<15;n++){draw('warning',0,n);draw('detonation',3000,n+1);draw('fallout',0,n+2);draw('clearing',8000,n+3);draw('all-clear',0,n+4);effects.reset();renderer.render(scene,camera);}
    if(renderer.info.memory.geometries>base.geometries||renderer.info.memory.textures>base.textures)throw Error('Repeated scenario retained GPU resources');
    effects.dispose();audio.dispose();renderer.render(scene,camera);
   }''')
   # Exercise the actual production UI with its header dropdown left closed.
   # A hidden ancestor must affect controls only, never event playback.
   page.evaluate('''async()=>{
    const {mountDoomsdayUI}=await import('/public/js/doomsday-ui.js'),{mountGameDisplayFlow}=await import('/public/js/game-display-flow.js'),{createDoomsdayScene}=await import('/public/js/doomsday-scene.js');
    window.AudioContext=function(){return makeObservedContext();};
    window.menuStage=document.createElement('main');menuStage.className='house-stage';menuStage.style.cssText='position:absolute;inset:0';document.body.append(menuStage);
    window.flow=mountGameDisplayFlow(menuStage);window.menuEffects=createDoomsdayScene({scene,performanceMode:true});window.headerState=null;
    window.headerUI=mountDoomsdayUI({stage:menuStage,getEnvironment:()=>({id:'airport',name:'Airport'}),getPosition:()=>({x:0,y:0,z:0}),getState:()=>headerState,effects:menuEffects,now:()=>headerState?.serverTime||1000000});
    window.headerDraw=(phase,age=0)=>{
     const offsets={warning:0,detonation:18000,fallout:25000,recovery:600000,clearing:1200000,'all-clear':1208000},start=1000000+offsets[phase];
     headerState={id:'header-closed-event',mapId:'airport',phase,phaseLabel:phase,message:phase,revision:1,active:phase!=='all-clear',startedAt:1000000,phaseStartedAt:start,serverTime:start+age,detonationAt:1018000,falloutAt:1025000,phaseEndsAt:phase==='clearing'?start+8000:null,objectives:[]};
     headerUI.tick((start+age)/1000);renderer.render(scene,camera);
    };
    window.beforeHeaderBooms=boomCount();headerDraw('warning');
   }''')
   page.wait_for_function("document.querySelector('.doomsday-menu')?.closest('.game-view-overflow')")
   assert page.locator('.game-view-overflow').is_hidden()
   assert page.locator('.doomsday-guide,.doomsday-banner').evaluate_all('nodes=>nodes.every(n=>n.hidden)')
   page.mouse.click(width//2,height-20)
   page.wait_for_function("audioContext?.state==='running'")
   page.evaluate("headerDraw('warning',100)")
   assert page.evaluate('activeSiren().targets.at(-1)')==.16
   for age in [0,1600,3200]:
    page.evaluate('(age)=>headerDraw("detonation",age)',age)
   assert page.evaluate('boomCount()-beforeHeaderBooms')==3
   assert page.evaluate("menuEffects.root.getObjectByName('DOOMSDAY_DISTANT_BLAST_3').getObjectByName('GROWING_FIREBALL').visible")
   page.evaluate("headerDraw('fallout',0);headerDraw('recovery',588000)")
   assert page.evaluate("menuEffects.root.visible && menuEffects.root.getObjectByName('DOOMSDAY_FALLING_ASH').visible")
   assert page.evaluate('activeSiren().targets.at(-1)')==.16
   assert page.locator('.game-view-overflow').is_hidden()
   assert page.locator('.doomsday-guide,.doomsday-banner').evaluate_all('nodes=>nodes.every(n=>n.hidden)')
   page.evaluate("headerDraw('clearing',8000);headerDraw('all-clear');headerUI.dispose();flow.dispose();menuStage.remove();renderer.render(scene,camera)")
   assert page.evaluate('audioGains.every(record=>record.disconnected>0) && audioOscillators.every(record=>record.disconnected>0)')
   assert not errors,errors
   print(f'{width}px: all 3 rendered impacts and Web Audio booms, speech ducking, long recovery sirens, synchronized clearing, all-clear cleanup, reduced motion 15 GPU cleanup cycles and full playback with the production header dropdown closed passed',flush=True)
   page.close()
  browser.close()
finally: server.shutdown()
