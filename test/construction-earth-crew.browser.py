from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os

os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
 def do_GET(self):
  if self.path=='/construction-visual-fixture':
   self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(b'<!doctype html><style>body{margin:0;background:#152b35}canvas{display:block}</style><title>Live earth and construction crew</title>')
  else:super().do_GET()
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
  page=browser.new_page(viewport={'width':1000,'height':650},service_workers='block');errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
  page.goto(f'http://127.0.0.1:{server.server_port}/construction-visual-fixture')
  result=page.evaluate('''async()=>{
   const THREE=await import('/public/vendor/three/three.module.min.js'),{createConstructionScene}=await import('/public/js/construction-scene.js'),{createConstructionModel,updateConstructionModel}=await import('/public/js/construction-models.js'),{createConstructionBaseGeometry}=await import('/public/js/construction-terrain.js');
   const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1000,650);renderer.setPixelRatio(1);renderer.setClearColor(0x233d47);renderer.outputColorSpace=THREE.SRGBColorSpace;document.body.append(renderer.domElement);
   const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xe7f5ff,0x8d7355,2.3));const sun=new THREE.DirectionalLight(0xffecd2,2.3);sun.position.set(10,20,10);scene.add(sun);
   const camera=new THREE.PerspectiveCamera(50,1000/650,.05,200);camera.position.set(22,15,24);camera.lookAt(1,0,0);
   const patch={id:'visible-cut',origin:{x:-6,z:-6},cellSize:2,columns:6,rows:6,baseY:0,minY:-8,heights:[],soil:[],gravel:[]};
   for(let r=0;r<6;r++)for(let c=0;c<6;c++){const h=c>=1&&c<=3&&r>=1&&r<=3?-2:c===4&&r>=3?1.3:0;patch.heights.push(h);patch.soil.push(32+h*4);patch.gravel.push(c===4&&r>=3?5.2:0);}
   const base=new THREE.Mesh(createConstructionBaseGeometry(THREE,60,[patch]),new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide}));base.rotation.x=-Math.PI/2;scene.add(base);
   const machine={id:'excavator',modelId:'site-excavator',position:{x:7,y:0,z:0},rotation:{y:-.6},construction:{kind:'excavator',boom:.7,stick:-.8,bucket:-.4,swing:0,load:1,cargo:{soil:1,gravel:0},axes:{boom:.3}},driving:{speed:0,parked:true}},model=createConstructionModel(machine.modelId);model.position.copy(machine.position);model.rotation.y=machine.rotation.y;model.userData.construction=machine.construction;model.userData.driving=machine.driving;scene.add(model);updateConstructionModel(model,0);
   const workers=[{id:'maya',name:'Maya Chen',role:'Excavator operator',appearance:{hardHat:'white',vest:'lime',skin:'tan',shirt:'navy'},state:'operating',machineId:'excavator',position:{x:7,y:0,z:0},heading:0,progress:.35,message:'Bucket filling'},{id:'noor',name:'Noor Williams',role:'Site surveyor',appearance:{hardHat:'yellow',vest:'orange',skin:'brown',shirt:'teal'},state:'walking',machineId:null,position:{x:2,y:0,z:7},heading:1,progress:.7,message:'Walking to next work bay'}],snapshot={actors:{excavator:machine},construction:{earthworks:{revision:1,patches:[patch]},crew:{workers,jobs:[]}}};
   const view=createConstructionScene(THREE,scene);view.update(snapshot);view.animate(0);renderer.render(scene,camera);const initial=renderer.domElement.toDataURL();
   for(let i=1;i<=20;i++){view.animate(i/30);updateConstructionModel(model,i/30);renderer.render(scene,camera);}
   const animated=renderer.domElement.toDataURL(),labels=[];view.root.traverse(node=>{if(node.userData.worldLabel)labels.push(node);});
   if(initial===animated)throw Error('Work crew and machinery did not animate');if(labels.length!==2||!labels.every(label=>label.material.map?.isCanvasTexture))throw Error('Crew name/progress labels have no native canvas textures');
   scene.updateMatrixWorld(true);const ray=new THREE.Raycaster(new THREE.Vector3(-3,10,-3),new THREE.Vector3(0,-1,0),0,20),hits=ray.intersectObjects([base,...view.groundMeshes]);if(!hits.length||Math.abs(hits[0].point.y+2)>.001)throw Error('Base land hides the real excavation');
   return {workers:workers.length,terrainMeshes:view.groundMeshes.length,crewLabels:labels.map(label=>[label.userData.title,label.userData.progress]),drawCalls:renderer.info.render.calls};
  }''')
  page.screenshot(path='/tmp/construction-earth-crew.png')
  assert result['terrainMeshes']==1 and result['workers']==2,result
  assert result['drawCalls']<500,result
  assert not errors,errors
  browser.close()
 print('Real negative terrain cuts, material piles, animated custom workers and native name/progress labels rendered in Chromium:',result)
finally:server.shutdown()
