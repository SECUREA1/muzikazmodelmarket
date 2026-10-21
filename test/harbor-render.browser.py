from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os
os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
  page=browser.new_page(viewport={'width':800,'height':500});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda msg:errors.append(msg.text) if msg.type=='error' else None)
  page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
  count=page.evaluate('''async()=>{const THREE=await import('/public/vendor/three/three.module.min.js');const {neonMarina}=await import('/neon-marina.mjs');const {createHarborLand}=await import('/public/js/environments/harbor-land.js');const {createBuilderModel,updateBuilderModels}=await import('/public/js/builder-models-3d.js');const {createHarborCamera}=await import('/public/js/harbor-camera.js');const {createOutdoorScenery}=await import('/public/js/environments/outdoor-scenery.js');const marina=neonMarina(),environment={id:'neon-docks',builderScene:{layoutMeta:{harbor:marina.harbor}}};document.body.replaceChildren();document.body.style.margin='0';window.scene=new THREE.Scene();scene.fog=new THREE.Fog(0xaacddd,120,650);scene.add(new THREE.HemisphereLight(0xd9efff,0x424b39,2.4));const sun=new THREE.DirectionalLight(0xffe7c6,2.8);sun.position.set(20,70,10);scene.add(sun);window.land=createHarborLand(environment);scene.add(land);window.models=new THREE.Group();scene.add(models);for(const item of marina.objects){const model=createBuilderModel(item.modelId);if(!model)throw Error(item.modelId+' unavailable');model.position.set(item.position.x,item.position.y,item.position.z);model.rotation.set(item.rotation.x,item.rotation.y,item.rotation.z);model.scale.set(item.scale.x,item.scale.y,item.scale.z);model.userData.testId=item.id;models.add(model);}window.renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(800,500);document.body.append(renderer.domElement);window.camera=new THREE.PerspectiveCamera(60,1.6,.025,700);camera.position.set(185,35,90);camera.lookAt(112,3,32);const backdrop=createOutdoorScenery({scene});backdrop.setEnvironment(environment);land.userData.updateHarborEffects(20);updateBuilderModels(models,20);backdrop.update(20,camera);renderer.render(scene,camera);window.helmPreview=(type)=>{const item=marina.objects.find(item=>item.modelId===type),model=models.children.find(root=>root.userData.testId===item.id),rig=new THREE.Group();rig.position.copy(model.position).add(new THREE.Vector3(0,.35,0));rig.rotation.y=item.rotation.y;scene.add(rig);rig.add(camera);const control=createHarborCamera({camera,playerRig:rig});control.update({boat:{id:'preview',modelId:type,position:{...item.position},rotation:{...item.rotation}},model,origin:model.position.clone()});renderer.render(scene,camera);};return models.children.length;}''')
  assert count>=300
  page.screenshot(path='/tmp/marina-quality.png');page.evaluate("helmPreview('harbor-skiff')");page.screenshot(path='/tmp/marina-skiff-helm.png');page.evaluate("helmPreview('harbor-sailboat')");page.screenshot(path='/tmp/marina-sailboat-helm.png');assert not errors,errors;browser.close()
 print('Marina properties, animated water shader, both helms and boats rendered successfully with no WebGL errors.')
finally:server.shutdown()
