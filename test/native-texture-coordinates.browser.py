"""Prove the current native surface maps affect real rendered pack geometry."""
import base64
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_GET(self):
        if self.path == '/__native_uv_proof__':
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            self.wfile.write(b'<!doctype html><html><body></body></html>')
        else:
            super().do_GET()


server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                                     args=['--no-sandbox', '--enable-unsafe-swiftshader'])
        page = browser.new_page(viewport={'width': 360, 'height': 280}, service_workers='block')
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.route('https://**/*', lambda route: route.abort())
        page.goto(f'http://127.0.0.1:{server.server_port}/__native_uv_proof__')
        results = page.evaluate("""async () => {
          const T=await import('/public/vendor/three/three.module.min.js');
          const {createBuilderModel}=await import('/public/js/builder-models-3d.js');
          const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
          renderer.setSize(320,240);renderer.setPixelRatio(1);renderer.setClearColor(0x14202b,1);
          renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.8;
          document.body.style.cssText='margin:0;background:#14202b';document.body.replaceChildren(renderer.domElement);
          const scene=new T.Scene(),camera=new T.PerspectiveCamera(36,4/3,.01,1000);
          scene.add(new T.HemisphereLight(0xffffff,0x59636b,2));
          const key=new T.DirectionalLight(0xffeddb,3);key.position.set(4,7,6);scene.add(key);
          const read=()=>{const canvas=document.createElement('canvas');canvas.width=320;canvas.height=240;const context=canvas.getContext('2d');context.drawImage(renderer.domElement,0,0);return context.getImageData(0,0,320,240).data;};
          const results=[];
          try{
            for(const id of ['forest-ranger','harbor-patrol','palm-cluster','material:corner-wedge']){
              const root=createBuilderModel(id),fixed=[];root.updateMatrixWorld(true);
              root.traverse(mesh=>{if(mesh.geometry?.userData.nativeSurfaceUV){fixed.push({mesh,uv:mesh.geometry.getAttribute('uv')});}});
              // Frame the affected physical surface rather than tiny details
              // on a complete vehicle, whose authored finish is restrained.
              root.traverse(mesh=>{if(mesh.isMesh)mesh.visible=false;});
              const box=new T.Box3();for(const {mesh}of fixed){mesh.visible=true;box.union(new T.Box3().setFromObject(mesh));}
              const center=box.getCenter(new T.Vector3()),radius=box.getSize(new T.Vector3()).length()/2;
              root.position.sub(center);scene.add(root);
              const distance=radius/Math.sin(camera.fov*Math.PI/360)*1.1;
              camera.position.set(distance*.6,distance*.3,distance*.8);camera.lookAt(0,0,0);camera.far=distance+radius*5;camera.updateProjectionMatrix();
              // With no UV attribute, the old surface sampled one texture point.
              // An explicit constant attribute reproduces that without relying
              // on the driver's default values for an absent vertex attribute.
              for(const {mesh,uv}of fixed)mesh.geometry.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(uv.count*2),2));
              renderer.render(scene,camera);const flat=read();
              for(const {mesh,uv}of fixed)mesh.geometry.setAttribute('uv',uv);
              renderer.render(scene,camera);const mapped=read();let changedPixels=0,maximumDifference=0;
              for(let i=0;i<mapped.length;i+=4){const difference=Math.max(Math.abs(mapped[i]-flat[i]),Math.abs(mapped[i+1]-flat[i+1]),Math.abs(mapped[i+2]-flat[i+2]));if(difference>1)changedPixels++;maximumDifference=Math.max(maximumDifference,difference);}
              results.push({id,mappedMeshes:fixed.length,changedPixels,maximumDifference,image:renderer.domElement.toDataURL('image/png')});
              scene.remove(root);const resources=new Set();root.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of [].concat(node.material||[])){resources.add(material);for(const value of Object.values(material))if(value?.isTexture)resources.add(value);}});for(const resource of resources)resource.dispose?.();renderer.renderLists.dispose();
            }
          }finally{renderer.dispose();}
          return results;
        }""")
        for result in results:
            assert result['mappedMeshes'] > 0, result
            assert result['changedPixels'] > 100, {key: value for key, value in result.items() if key != 'image'}
            image = result.pop('image')
            Path('/tmp/native-uv-' + result['id'].replace(':', '-') + '.png').write_bytes(base64.b64decode(image.split(',')[1]))
        assert not errors, errors
        report = {'results': results, 'pageErrors': errors}
        Path('/tmp/native-texture-coordinates-browser.json').write_text(json.dumps(report, indent=2))
        print(json.dumps(report), flush=True)
        browser.close()
finally:
    server.shutdown()
