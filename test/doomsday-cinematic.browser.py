"""Render the explosion/sky/ash sequence and verify replay releases GPU resources."""
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
    const T=await import('/public/vendor/three/three.module.min.js'),{createDoomsdayScene}=await import('/public/js/doomsday-scene.js');
    window.scene=new T.Scene();scene.background=new T.Color('#4a7694');
    window.camera=new T.PerspectiveCamera(68,innerWidth/innerHeight,.05,700);camera.position.set(0,8,15);camera.lookAt(85,30,-155);
    window.renderer=new T.WebGLRenderer({canvas:document.querySelector('canvas'),preserveDrawingBuffer:true});renderer.setSize(innerWidth,innerHeight);
    window.effects=createDoomsdayScene({scene,performanceMode:true});
    window.draw=(phase,phaseElapsedMs=0,time=0,reducedMotion=false)=>{effects.update({id:'render-test',phase,phaseElapsedMs,objectives:[{id:'site',name:'Response site',phase,position:{x:0,y:0,z:-5}}]},{id:'airport'},{x:0,y:0,z:0},time,{reducedMotion});renderer.render(scene,camera);};
    draw('warning');
   }''')
   warning=page.evaluate('effects.root.userData.skyColor')
   page.evaluate("draw('detonation',3000,3)")
   assert page.evaluate('effects.root.userData.skyColor')!=warning
   assert page.evaluate("effects.root.getObjectByName('GROWING_FIREBALL').visible")
   page.screenshot(path=f'/workspace/doomsday-explosion-{width}.png')
   page.evaluate("draw('fallout',1000,9)")
   assert page.evaluate("effects.root.getObjectByName('DOOMSDAY_FALLING_ASH').visible")
   page.screenshot(path=f'/workspace/doomsday-automatic-fallout-{width}.png')
   page.evaluate("draw('detonation',3000,10,true)")
   assert page.evaluate("!effects.root.getObjectByName('GROWING_FIREBALL').visible && !effects.root.getObjectByName('EXPANDING_SHOCKWAVE').visible")
   page.evaluate('''()=>{
    effects.reset();renderer.render(scene,camera);const base={...renderer.info.memory};
    for(let n=0;n<15;n++){draw('warning',0,n);draw('detonation',3000,n+1);draw('fallout',0,n+2);effects.reset();renderer.render(scene,camera);}
    if(renderer.info.memory.geometries>base.geometries||renderer.info.memory.textures>base.textures)throw Error('Repeated scenario retained GPU resources');
    effects.dispose();renderer.render(scene,camera);
   }''')
   assert not errors,errors
   print(f'{width}px: rendered sky change, explosion, fallout ash, reduced motion and 15 replay cleanup cycles passed',flush=True)
   page.close()
  browser.close()
finally: server.shutdown()
