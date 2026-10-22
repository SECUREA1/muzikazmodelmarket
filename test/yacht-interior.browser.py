from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
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
  page=browser.new_page(viewport={'width':1000,'height':700}); errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
  page.evaluate('''async()=>{
   const T=await import('/public/vendor/three/three.module.min.js');
   const {createBuilderModel,updateBuilderModels}=await import('/public/js/builder-models-3d.js');
   const {mountYachtGames}=await import('/public/js/yacht-games-ui.js');
   const {createYachtBilliards,shootYachtBilliards,stepYachtBilliards}=await import('/public/js/yacht-billiards.js');
   const {Capsule}=await import('/public/vendor/three/addons/math/Capsule.js');
   const {placementTriangles,placementBounds}=await import('/public/js/placed-item-collision.js');
   const {moveWalkingCapsule}=await import('/public/js/walking-capsule.js');
   document.body.replaceChildren();document.body.style.margin='0';
   const stage=document.createElement('main');stage.style.cssText='position:relative;width:100vw;height:100vh;background:#23434b';document.body.append(stage);
   const scene=new T.Scene();scene.background=new T.Color('#80acbd');scene.add(new T.HemisphereLight(0xe4f5ff,0x34372f,2.3));
   const light=new T.DirectionalLight(0xffe7bf,3);light.position.set(10,20,5);scene.add(light);
   const models=new T.Group(),yacht=createBuilderModel('harbor-yacht');models.add(yacht);scene.add(models);yacht.userData.builderObjectId='yacht';
   const actors={yacht:{id:'yacht',modelId:'harbor-yacht',active:true,position:{x:0,y:0,z:0},rotation:{y:0},boating:{speed:0},yachtBilliards:createYachtBilliards()}};window.actors=actors;
   const camera=new T.PerspectiveCamera(70,1000/700,.025,150);camera.position.set(-.3,3.65,12);camera.lookAt(1,2.95,6);
   const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(1000,700);stage.append(renderer.domElement);
   const css=document.createElement('link');css.rel='stylesheet';css.href='/public/assets/game-menus.css';document.head.append(css);
   const ui=window.yachtUI=mountYachtGames({THREE:T,stage,getRoots:()=>[yacht],getActors:()=>actors,getPosition:()=>new T.Vector3(0,1.97,8),getVehicleId:()=>null,send:async(action,command)=>{
    const state=actors.yacht.yachtBilliards;
    if(command.operation==='rack')actors.yacht.yachtBilliards=createYachtBilliards(state.revision+1);else shootYachtBilliards(state,command.angle,command.power);
    return true;
   }});
   let time=0;function frame(){time+=1/60;stepYachtBilliards(actors.yacht.yachtBilliards,1/60);yacht.userData.yachtBilliards=actors.yacht.yachtBilliards;ui.update();updateBuilderModels(models,time);ui.presentCamera(camera,new T.Group());renderer.render(scene,camera);requestAnimationFrame(frame);}frame();
   const capsule=new Capsule(new T.Vector3(-3.9,2.31,15),new T.Vector3(-3.9,3.28,15),.34);yacht.updateMatrixWorld(true);
   const triangleGroups=[{bounds:placementBounds(T,yacht),triangles:placementTriangles(T,[yacht])}];let grounded=true;
   for(let i=0;i<160;i++){const result=moveWalkingCapsule(capsule,{x:0,y:-.02,z:-.05},{triangleGroups,grounded,maxStepHeight:.26,floorGap:.02});grounded=result.onGround;}
   if(capsule.start.y-.34<5.03)throw Error('Upper deck is not walkable.');
   window.yachtPreview={camera,renderer,scene};
  }''')
  assert page.locator('[data-yacht-billiards]').count()==0
  page.evaluate('yachtUI.open()')
  page.locator('[data-aim]').fill('8');page.locator('[data-strength]').fill('70')
  page.locator('[data-shoot]').click()
  page.wait_for_function('actors.yacht.yachtBilliards.shots===1')
  page.screenshot(path='/workspace/yacht-interior-preview.png')
  page.locator('[data-close]').click()
  assert page.evaluate('yachtUI.available()')
  assert not page.locator('dialog[open]').count()
  page.evaluate('yachtUI.open()');page.keyboard.press('Escape')
  assert not page.locator('dialog[open]').count()
  page.evaluate('''()=>{const {camera,renderer,scene}=yachtPreview;camera.position.set(18,15,25);camera.lookAt(0,2,1);renderer.render(scene,camera);}''')
  page.screenshot(path='/workspace/yacht-stairs-preview.png')
  assert not errors, errors
  browser.close()
 print('Browser: stairs reach upper deck; billiards controls take a shot and return to walking; no page errors.')
finally:
 server.shutdown()
