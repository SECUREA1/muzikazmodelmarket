"""Real animated glTF and dynamic-instance pixels survive quality setup."""
import base64
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import struct
from threading import Thread
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
binary = struct.pack('<9f12H12f16f2f6f3H',
                     99, -1, 0, 101, -1, 0, 100, 1, 0,
                     *([0] * 12), 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0,
                     1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
                     0, 1, 0, 0, 0, -100, 0, 0, 0, 1, 2)
document = {
    'asset': {'version': '2.0'}, 'scene': 0, 'scenes': [{'nodes': [0, 1]}],
    'nodes': [{'mesh': 0, 'skin': 0}, {'name': 'AnimatedJoint'}],
    'skins': [{'joints': [1], 'skeleton': 1, 'inverseBindMatrices': 3}],
    'meshes': [{'primitives': [{'attributes': {'POSITION': 0, 'JOINTS_0': 1, 'WEIGHTS_0': 2}, 'indices': 6, 'material': 0}]}],
    'materials': [{'extensions': {'KHR_materials_unlit': {}}, 'doubleSided': True,
                   'pbrMetallicRoughness': {'baseColorFactor': [1, .1, .1, 1]}}],
    'extensionsUsed': ['KHR_materials_unlit'],
    'buffers': [{'byteLength': len(binary), 'uri': 'data:application/octet-stream;base64,' + base64.b64encode(binary).decode()}],
    'bufferViews': [{'buffer': 0, 'byteOffset': offset, 'byteLength': length} for offset, length in
                    [(0, 36), (36, 24), (60, 48), (108, 64), (172, 8), (180, 24), (204, 6)]],
    'accessors': [
        {'bufferView': 0, 'componentType': 5126, 'count': 3, 'type': 'VEC3', 'min': [99, -1, 0], 'max': [101, 1, 0]},
        {'bufferView': 1, 'componentType': 5123, 'count': 3, 'type': 'VEC4'},
        {'bufferView': 2, 'componentType': 5126, 'count': 3, 'type': 'VEC4'},
        {'bufferView': 3, 'componentType': 5126, 'count': 1, 'type': 'MAT4'},
        {'bufferView': 4, 'componentType': 5126, 'count': 2, 'type': 'SCALAR', 'min': [0], 'max': [1]},
        {'bufferView': 5, 'componentType': 5126, 'count': 2, 'type': 'VEC3'},
        {'bufferView': 6, 'componentType': 5123, 'count': 3, 'type': 'SCALAR'}],
    'animations': [{'samplers': [{'input': 4, 'output': 5, 'interpolation': 'LINEAR'}],
                    'channels': [{'sampler': 0, 'target': {'node': 1, 'path': 'translation'}}]}]}


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/graphics-visibility-fixture':
            payload, kind = b'<!doctype html><canvas id="display"></canvas>', 'text/html'
        elif path == '/animated-visibility.gltf':
            payload, kind = json.dumps(document).encode(), 'model/gltf+json'
        else:
            return super().do_GET()
        self.send_response(200)
        self.send_header('Content-Type', kind)
        self.end_headers()
        self.wfile.write(payload)


server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}'
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                                    args=['--no-sandbox', '--enable-unsafe-swiftshader'])
        page = browser.new_page(viewport={'width': 400, 'height': 300}, service_workers='block')
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(base + '/graphics-visibility-fixture')
        result = page.evaluate('''async () => {
          const THREE=await import('/public/vendor/three/three.module.min.js');
          const {createGameModelLoader}=await import('/public/js/game-model-loader.js');
          const {applyWorldQuality}=await import('/public/js/environments/environment-quality.js');
          const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('#display'),antialias:false,preserveDrawingBuffer:true});
          renderer.setSize(320,240);renderer.setPixelRatio(1);
          const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(60,320/240,.1,1000);
          camera.position.z=5;camera.updateMatrixWorld();
          const gltf=await createGameModelLoader(renderer).loadAsync('/animated-visibility.gltf');
          let skin;gltf.scene.traverse(node=>{if(node.isSkinnedMesh)skin=node;});
          if(!skin)throw Error('The fixture did not load a real skinned glTF mesh.');
          skin.computeBoundingSphere();
          const batch=new THREE.InstancedMesh(new THREE.BoxGeometry(.6,.6,.1),new THREE.MeshBasicMaterial({color:0x00ffff}),1);
          batch.frustumCulled=false;batch.setMatrixAt(0,new THREE.Matrix4().makeTranslation(100,0,0));batch.computeBoundingSphere();
          const root=new THREE.Group();root.add(gltf.scene,batch);scene.add(root);
          applyWorldQuality(root,renderer);
          const gl=renderer.getContext(),pixels=new Uint8Array(320*240*4);
          const sample=()=>{renderer.render(scene,camera);gl.readPixels(0,0,320,240,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let red=0,cyan=0;for(let i=0;i<pixels.length;i+=4){if(pixels[i]>50&&pixels[i]>pixels[i+1]*1.5&&pixels[i]>pixels[i+2]*1.5)red++;if(pixels[i+1]>50&&pixels[i+2]>50&&pixels[i]<pixels[i+1]/2)cyan++;}return {red,cyan};};
          const before=sample(),mixer=new THREE.AnimationMixer(gltf.scene),action=mixer.clipAction(gltf.animations[0]);
          action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();mixer.setTime(.99);
          batch.setMatrixAt(0,new THREE.Matrix4().makeTranslation(-1.6,0,0));batch.instanceMatrix.needsUpdate=true;
          const after=sample();
          mixer.setTime(.98);const subsequent=sample();
          const flags={skinCulling:skin.frustumCulled,dynamicInstanceCulling:batch.frustumCulled};
          mixer.stopAllAction();root.traverse(node=>{node.skeleton?.dispose();node.geometry?.dispose();for(const material of [].concat(node.material||[]))material.dispose();});batch.dispose();renderer.dispose();
          return {before,after,subsequent,...flags};
        }''')
        assert result['before']['red'] == 0 and result['before']['cyan'] == 0, result
        assert result['after']['red'] > 500 and result['subsequent']['red'] > 500, result
        assert result['after']['cyan'] > 50 and result['subsequent']['cyan'] > 50, result
        assert not result['skinCulling'] and not result['dynamicInstanceCulling'], result
        assert not errors, errors
        print(json.dumps({**result, 'pageErrors': errors}), flush=True)
        browser.close()
finally:
    server.shutdown()
