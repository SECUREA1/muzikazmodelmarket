"""Render the production model factories in real WebGL at desktop and phone sizes."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os
os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()
gallery='''<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}body{margin:0;background:#0c1612;color:#e8f3e8;font:14px system-ui}canvas{position:fixed;inset:0;width:100%;height:100%}#labels{position:fixed;inset:0;display:grid;grid-template-columns:repeat(3,1fr);pointer-events:none}article{padding:16px;border:1px solid #66834b55;display:flex;align-items:flex-end;justify-content:center}strong{padding:8px 14px;background:#0b1b16ee;border:1px solid #829a58;border-radius:12px;text-align:center}@media(max-width:600px){#labels{grid-template-columns:1fr}article{padding:7px}strong{font-size:12px;padding:6px 10px}}
</style></head><body><canvas></canvas><div id="labels"></div><script type="module">
import * as T from '/public/vendor/three/three.module.min.js';
import {createBuilderModel,updateBuilderModels} from '/public/js/builder-models-3d.js';
const renderer=new T.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:true});renderer.setSize(innerWidth,innerHeight,false);renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
let entries=[];
window.showItems=ids=>{entries=[];document.querySelector('#labels').replaceChildren();for(const id of ids){const scene=new T.Scene();scene.background=new T.Color('#102019');const root=createBuilderModel(id);scene.add(root);const bounds=new T.Box3().setFromObject(root),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3()),span=Math.max(size.x,size.y,size.z);scene.add(new T.HemisphereLight(0xcce9ff,0x35402a,2));const sun=new T.DirectionalLight(0xffedc9,3.2);sun.position.set(-3,6,-4);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);scene.add(sun);const fill=new T.DirectionalLight(0x80caff,.8);fill.position.set(3,2,2);scene.add(fill);const floor=new T.Mesh(new T.CircleGeometry(8,48),new T.MeshStandardMaterial({color:0x243e2c,roughness:.94}));floor.rotation.x=-Math.PI/2;floor.position.y=bounds.min.y-.012;floor.receiveShadow=true;scene.add(floor);const camera=new T.PerspectiveCamera(38,1,.05,100);entries.push({scene,root,camera,center,span});const article=document.createElement('article'),label=document.createElement('strong');label.textContent=root.name;article.append(label);document.querySelector('#labels').append(article);}
window.drawItems();return entries.length;};
window.drawItems=()=>{const cols=innerWidth<600?1:3,rows=Math.ceil(entries.length/cols),w=innerWidth/cols,h=innerHeight/rows;renderer.setScissorTest(true);entries.forEach((e,i)=>{const x=i%cols*w,y=innerHeight-(Math.floor(i/cols)+1)*h;e.camera.aspect=w/h;e.camera.updateProjectionMatrix();e.camera.position.copy(e.center).add(new T.Vector3(1,.58,-1.7).normalize().multiplyScalar(e.span*2.25/Math.min(1,w/h)));e.camera.lookAt(e.center);updateBuilderModels(e.scene,1);renderer.setViewport(x,y,w,h);renderer.setScissor(x,y,w,h);renderer.render(e.scene,e.camera);});};
window.graphicsStats=()=>entries.map(e=>{let meshes=0,triangles=0,screen=0,idle=0;e.root.traverse(n=>{if(n.isMesh){meshes++;triangles+=(n.geometry.index?.count||n.geometry.attributes.position.count)/3*(n.isInstancedMesh?n.count:1);}if(n.userData.mediaScreen)screen++;if(n.name==='DEVICE_IDLE_DISPLAY')idle++;});return{meshes,triangles,screen,idle,finish:e.root.userData.visualFinish};});
window.reusesDisplay=id=>{const maps=[createBuilderModel(id),createBuilderModel(id)].map(root=>{let map;root.traverse(n=>{if(n.name==='DEVICE_IDLE_DISPLAY')map=n.material.map;});return map;});return maps[0]===maps[1]&&maps[0].image.width<=512&&maps[0].image.height<=512;};
window.ready=true;
</script></body></html>'''
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
  for width,height in ((1440,900),(390,844)):
   page=browser.new_page(viewport={'width':width,'height':height},service_workers='block');errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.route('https://**/*',lambda r:r.abort())
   page.route('**/__item_graphics',lambda r:r.fulfill(body=gallery,content_type='text/html'))
   page.goto(f'http://127.0.0.1:{server.server_port}/__item_graphics');page.wait_for_function('window.ready')
   machines=['retro-pong-cabinet','arcade-slot-machine','market-atm','media-boombox','video-poker-table','shared-video-player']
   selected=machines if width>600 else machines[:3]
   assert page.evaluate('(ids)=>showItems(ids)',selected)==len(selected)
   assert page.evaluate('reusesDisplay("retro-pong-cabinet")'), 'Repeated cabinets should share a bounded display texture'
   page.wait_for_timeout(700);page.evaluate('drawItems()')
   stats=page.evaluate('graphicsStats()')
   assert all(s['screen']==1 and s['idle']==1 and s['finish']=='mzk-game-items-v2' and s['triangles']<6000 for s in stats),stats
   page.screenshot(path=f'/tmp/muzikaz-game-machines-{width}.png')
   selected=['treasure-crystal','healing-potion','quest-scroll','rogue-bot','void-wolf','portal-door'] if width>600 else ['healing-potion','rogue-bot','void-wolf']
   page.evaluate('(ids)=>showItems(ids)',selected);page.wait_for_timeout(100);page.evaluate('drawItems()')
   page.screenshot(path=f'/tmp/muzikaz-game-items-{width}.png')
   assert not errors,errors
   print({'viewport':[width,height],'production_meshes_and_displays':'passed','machine_triangles':sum(s['triangles'] for s in stats)},flush=True)
   page.close()
  browser.close()
finally:server.shutdown()
