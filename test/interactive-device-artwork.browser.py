"""Upload real cabinet SVG artwork in WebGL and verify the ATM screen stays intact."""
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright
import json

ROOT = Path(__file__).resolve().parents[1]
class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass
    def do_GET(self):
        if self.path == '/__device_artwork':
            data = b'<!doctype html><body style="margin:0"></body>'
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        else:
            super().do_GET()
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                                    args=['--no-sandbox', '--enable-unsafe-swiftshader'])
        page = browser.new_page(viewport={'width': 800, 'height': 650}, service_workers='block')
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/__device_artwork')
        result = page.evaluate('''async()=>{
          const T=await import('/public/vendor/three/three.module.min.js'),{createBuilderModel}=await import('/public/js/builder-models-3d.js');
          const {INTERACTIVE_DEVICES,deviceArtworkUrl}=await import('/public/js/interactive-devices.js');
          const renderer=new T.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(800,650);document.body.append(renderer.domElement);
          const gl=renderer.getContext(),uploads=[];
          for(const name of ['texImage2D','texSubImage2D','texStorage2D']){const original=gl[name];gl[name]=function(...args){const value=original.apply(this,args),code=gl.getError();if(code)uploads.push({name,code,source:args.at(-1)?.src||null});return value;};}
          const scene=new T.Scene();scene.background=new T.Color(0x203240);scene.add(new T.HemisphereLight(0xffffff,0x425843,3));const sun=new T.DirectionalLight(0xffffff,3);sun.position.set(-3,5,-4);scene.add(sun);
          const camera=new T.PerspectiveCamera(40,800/650,.01,100);camera.position.set(-3.4,2.3,-4.5);camera.lookAt(0,1.1,0);let cabinet,atm;
          const devices=[];
          for(const [id,profile]of Object.entries(INTERACTIVE_DEVICES)){
            if(['table','deck'].includes(profile.shape))continue;
            const root=createBuilderModel(id),posters=[];root.traverse(n=>{if(n.name==='CABINET_ARTWORK')posters.push(n);});if(!posters.length)continue;
            if(posters.length!==2||posters[0].material.map!==posters[1].material.map)throw Error(id+' must reuse one artwork texture for both cabinet sides');
            const texture=posters[0].material.map;
            await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(id+' artwork failed to decode')),5000),poll=()=>{if(texture.image?.complete&&texture.image.naturalWidth){clearTimeout(timer);resolve();}else setTimeout(poll,10);};poll();});
            if(cabinet)scene.remove(cabinet);cabinet=root;scene.add(root);renderer.render(scene,camera);gl.finish();
            devices.push({id,url:deviceArtworkUrl(id),width:texture.image.naturalWidth,height:texture.image.naturalHeight});if(id==='market-atm')atm=root;
          }
          scene.remove(cabinet);scene.add(atm);renderer.render(scene,camera);gl.finish();window.deviceArtworkRenderer=renderer;window.deviceArtworkScene=scene;window.deviceArtworkCamera=camera;
          const screen=atm.getObjectByName('DEVICE_SCREEN'),idle=atm.getObjectByName('DEVICE_IDLE_DISPLAY'),poster=atm.getObjectByName('CABINET_ARTWORK');
          if(!screen.userData.mediaScreen||screen.geometry.parameters.width<=0||screen.geometry.parameters.height<=0||idle.material.map.image.tagName!=='CANVAS')throw Error('ATM shared media screen was replaced');
          const artScene=new T.Scene();artScene.add(new T.Mesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({map:poster.material.map,toneMapped:false})));const artCamera=new T.OrthographicCamera(-.5,.5,.5,-.5,.1,10);artCamera.position.z=1;renderer.setSize(64,64);renderer.render(artScene,artCamera);gl.finish();
          const pixels=new Uint8Array(64*64*4);gl.readPixels(0,0,64,64,gl.RGBA,gl.UNSIGNED_BYTE,pixels);const colors=new Set();for(let i=0;i<pixels.length;i+=4)colors.add(pixels[i]+','+pixels[i+1]+','+pixels[i+2]);
          if(colors.size<32)throw Error('ATM artwork did not produce readable coloured image data');
          renderer.setSize(800,650);renderer.render(scene,camera);gl.finish();return {devices,uploads,artworkColors:colors.size,screenPreserved:true};
        }''')
        Path('/workspace/interactive-device-artwork-webgl.json').write_text(json.dumps(result, indent=2))
        page.screenshot(path='/workspace/market-atm-artwork-fixed.png')
        assert not errors, errors
        assert not result['uploads'], result['uploads']
        assert all(row['width'] == 320 and row['height'] == 440 for row in result['devices'] if '/interactive-devices/' in row['url']), result['devices']
        assert result['screenPreserved'] and result['artworkColors'] >= 32
        print(json.dumps({'cabinets': len(result['devices']), 'GL_upload_errors': result['uploads'], 'artworkColors': result['artworkColors'], 'screenPreserved': True}), flush=True)
        browser.close()
finally:
    server.shutdown()
