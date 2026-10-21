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
  page=browser.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda msg:errors.append(msg.text) if msg.type=='error' and 'favicon' not in msg.text else None)
  page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
  result=page.evaluate('''async()=>{
    const THREE=await import('/public/vendor/three/three.module.min.js');const {createOutdoorScenery,outdoorProfile}=await import('/public/js/environments/outdoor-scenery.js');
    const scene=new THREE.Scene();scene.fog=new THREE.Fog(0x050807,36,180);scene.add(new THREE.HemisphereLight(0xffffff,0x557755,2));const renderer=new THREE.WebGLRenderer({preserveDrawingBuffer:true});renderer.setSize(192,128);document.body.append(renderer.domElement);const camera=new THREE.PerspectiveCamera(68,1.5,.05,700);camera.position.set(0,30,0);const backdrop=createOutdoorScenery({scene});
    const samples=[];for(const environment of [{id:'public-commons',builderScene:{mapSize:256}},{id:'airport',airport:{enabled:true}},{id:'neon-docks',builderScene:{layoutMeta:{harbor:{extent:256}}}},{id:'mountain-pass'},{id:'desert-outpost'},{id:'stormy-coast',weather:'storm'}]){backdrop.setEnvironment(environment);if(!scene.getObjectByName('WEATHER_SKY_SPHERE')||scene.getObjectByName('DISTANT_LANDSCAPE_RING').count!==64)throw Error('Incomplete surrounding scenery');for(let i=0;i<4;i++){const a=i*Math.PI/2;camera.lookAt(Math.sin(a)*100,35,Math.cos(a)*100);backdrop.update(30,camera);renderer.render(scene,camera);const pixel=new Uint8Array(4),gl=renderer.getContext();gl.readPixels(96,64,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);if(pixel[0]+pixel[1]+pixel[2]<60)throw Error('Black horizon');samples.push(Array.from(pixel));}if(!backdrop.profile)throw Error('Outdoor map missing sky');}
    backdrop.setEnvironment({id:'interior',indoor:true});if(backdrop.profile||scene.getObjectByName('WEATHER_SKY_SPHERE'))throw Error('Indoor sky leaked');backdrop.dispose();renderer.dispose();return samples.length;
  }''')
  assert result==24;assert not errors,errors;browser.close()
 print('Outdoor sky shaders render non-black horizons in every direction for Commons, airport, coast, mountain, desert and storm; indoor transitions clean up.')
finally:server.shutdown()
