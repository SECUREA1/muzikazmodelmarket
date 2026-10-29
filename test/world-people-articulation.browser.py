"""Exercise actual GPU skinning and constant render budgets for prison/crew joints."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os

os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
 def do_GET(self):
  if self.path=='/world-people-joints':
   self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(b'<!doctype html><title>World people joints</title>')
  else:super().do_GET()
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
  page=browser.new_page(viewport={'width':1000,'height':650},service_workers='block')
  errors=[]
  page.on('pageerror',lambda error:errors.append(str(error)))
  page.on('console',lambda message: errors.append(message.text) if message.type=='error' and ('Shader Error' in message.text or 'VALIDATE_STATUS' in message.text) else None)
  page.goto(f'http://127.0.0.1:{server.server_port}/world-people-joints',wait_until='domcontentloaded')
  result=page.evaluate('''async()=>{
   const T=await import('/public/vendor/three/three.module.min.js'),{createPrisonLand}=await import('/public/js/prison-world.js'),{createConstructionScene}=await import('/public/js/construction-scene.js');
   document.body.innerHTML='';document.body.style.cssText='margin:0;background:#152b35';
   const renderer=new T.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(1000,650);renderer.setPixelRatio(1);renderer.setClearColor(0x152b35);document.body.append(renderer.domElement);
   const scene=new T.Scene();scene.add(new T.HemisphereLight(0xe7f5ff,0x8d7355,2.6));const sun=new T.DirectionalLight(0xffecd2,2.4);sun.position.set(4,8,5);scene.add(sun);
   const camera=new T.PerspectiveCamera(42,1000/650,.05,100);camera.position.set(4,3.2,6.5);camera.lookAt(.2,1.2,0);
   const prison=createPrisonLand(),people=[...prison.userData.prisonNpcs.values()].slice(0,3),npcs={};
   people.forEach((person,index)=>{person.removeFromParent();person.position.set(-1.8+index*1.3,0,0);scene.add(person);npcs[person.userData.prisonNpcId]={id:person.userData.prisonNpcId,state:'walking'};});prison.userData.setPrisonState({npcs});
   const crew=createConstructionScene(T,scene);crew.update({construction:{crew:{workers:[{id:'showcase',name:'Articulated crew',state:'walking',position:{x:2.3,y:0,z:0},heading:Math.PI}]}}});crew.root.traverse(node=>{if(node.isSprite){node.scale.multiplyScalar(.55);node.position.y=2.65;}});
   const leg=people[0].getObjectByName('PRISON_RESIDENT_LEG');prison.userData.updatePrisonEffects(0);crew.animate(0);renderer.render(scene,camera);
   const initial=renderer.domElement.toDataURL(),calls=renderer.info.render.calls,triangles=renderer.info.render.triangles,start=Array.from({length:leg.geometry.attributes.position.count},(_,index)=>leg.getVertexPosition(index,new T.Vector3()).toArray());
   for(let frame=1;frame<=20;frame++){prison.userData.updatePrisonEffects(frame/60);crew.animate(frame/60);renderer.render(scene,camera);}
   const end=Array.from({length:leg.geometry.attributes.position.count},(_,index)=>leg.getVertexPosition(index,new T.Vector3()).toArray()),vertexChanged=start.some((point,index)=>point.some((value,axis)=>Math.abs(value-end[index][axis])>1e-7));if(!vertexChanged)throw Error('The actual limb vertices did not bend');
   if(initial===renderer.domElement.toDataURL())throw Error('Joints did not produce visible movement');
   if(calls!==renderer.info.render.calls||triangles!==renderer.info.render.triangles)throw Error('Joint animation increased render budget');
   if(renderer.getContext().getError()!==0)throw Error('WebGL error during real joint skinning');
   const finite=people.every(person=>{let ok=true;person.traverse(node=>{if(!node.position.toArray().every(Number.isFinite)||!node.rotation.toArray().slice(0,3).every(Number.isFinite))ok=false;});return ok;});if(!finite)throw Error('Nonfinite pose');
   return {prisonPeople:people.length,crew:1,drawCalls:calls,triangles,skinVertices:leg.geometry.attributes.position.count,vertexChanged};
  }''')
  page.screenshot(path='/workspace/world-people-joints.png')
  assert result['prisonPeople']==3 and result['crew']==1,result
  assert result['drawCalls']<=67,result
  assert not errors,errors
  browser.close()
 print('Real GPU prison and construction articulation:',result)
finally:
 server.shutdown()
