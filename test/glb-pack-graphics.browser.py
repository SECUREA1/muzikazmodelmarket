"""Load and render every public GLB through the production game graphics path.

One small WebGL context is reused. The report records real model geometry,
textures, submitted triangles, foreground pixels, and per-model failures.
"""
import argparse
import base64
from html import escape
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import struct
from threading import Thread
import time
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML = '''<!doctype html><html><head><meta charset="utf-8"><title>Game GLB pack graphics validation</title>
<style>body{margin:0;background:#0c1820;color:white;font:14px system-ui}canvas{display:block}p{margin:8px}</style></head>
<body><canvas></canvas><p id="status">Loading game renderer…</p><script type="module">
import * as THREE from '/public/vendor/three/three.module.min.js';
import {createGameModelLoader,loadGameModel,disposeGameModel} from '/public/js/game-model-loader.js';
import {configureRenderer,applyWorldQuality} from '/public/js/environments/environment-quality.js';
const contexts=new Set(),nativeContext=HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext=function(type,...args){const result=nativeContext.call(this,type,...args);if(result&&/^webgl/.test(type))contexts.add(this);return result;};
const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:true,preserveDrawingBuffer:true});
configureRenderer(renderer,'balanced');renderer.setPixelRatio(1);renderer.setSize(256,192,false);
const scene=new THREE.Scene();scene.background=new THREE.Color(0x0c1820);
const hemi=new THREE.HemisphereLight(0xe6f7ff,0x26321b,1.75);scene.add(hemi);
const fill=new THREE.DirectionalLight(0xbfe7ff,.8),sun=new THREE.DirectionalLight(0xfff4dc,2.45);scene.add(fill,sun,fill.target,sun.target);
const pmrem=new THREE.PMREMGenerator(renderer),environment=pmrem.fromScene(Object.assign(new THREE.Scene(),{background:new THREE.Color(0x879ba8)}),.04);scene.environment=environment.texture;
const loader=createGameModelLoader(renderer),camera=new THREE.PerspectiveCamera(38,256/192,.01,1000),gl=renderer.getContext(),pixels=new Uint8Array(256*192*4);
renderer.render(scene,camera);gl.readPixels(0,0,256,192,gl.RGBA,gl.UNSIGNED_BYTE,pixels);const background=[pixels[0],pixels[1],pixels[2]];
window.glbHarness={
 async render(url,timeout){
  const started=performance.now(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);let model,mixer;
  try{
   document.querySelector('#status').textContent=url;model=await loadGameModel(loader,url,{signal:controller.signal});
   if(!model.scene)throw Error('The GLB has no scene.');
   const materials=new Set(),textures=new Set(),invalid=[],stats={meshes:0,vertices:0,triangles:0,skinnedMeshes:0,animations:model.animations?.length||0};
   model.scene.traverse(node=>{
    if(node.matrix.elements.some(value=>!Number.isFinite(value)))invalid.push((node.name||node.type)+': non-finite transform');
    if(!node.isMesh)return;stats.meshes++;if(node.isSkinnedMesh)stats.skinnedMeshes++;
    const position=node.geometry?.getAttribute('position');if(!position||!position.count){invalid.push((node.name||node.type)+': no vertices');return;}
    stats.vertices+=position.count;stats.triangles+=Math.floor((node.geometry.index?.count||position.count)/3)*(node.isInstancedMesh?node.count:1);
    for(let i=0;i<position.count;i++)if(!Number.isFinite(position.getX(i))||!Number.isFinite(position.getY(i))||!Number.isFinite(position.getZ(i))){invalid.push((node.name||node.type)+': non-finite vertex');break;}
    for(const material of [].concat(node.material||[])){
     materials.add(material);
     for(const key of ['opacity','roughness','metalness','emissiveIntensity'])if(material[key]!==undefined&&!Number.isFinite(material[key]))invalid.push((node.name||node.type)+': non-finite '+key);
     if(material.color&&[material.color.r,material.color.g,material.color.b].some(value=>!Number.isFinite(value)))invalid.push((node.name||node.type)+': non-finite color');
     for(const texture of Object.values(material))if(texture?.isTexture){textures.add(texture);const images=Array.isArray(texture.image)?texture.image:[texture.image];if(images.some(image=>!image||!(image.width>0)||!(image.height>0)))invalid.push((node.name||node.type)+': undecoded texture');}
    }
   });
   if(invalid.length)throw Error(invalid.slice(0,8).join('; '));
   if(!stats.meshes||!stats.vertices||!stats.triangles)throw Error('The GLB contains no triangle geometry.');
   applyWorldQuality(model.scene,renderer);scene.add(model.scene);
   if(model.animations?.length){mixer=new THREE.AnimationMixer(model.scene);mixer.clipAction(model.animations[0]).play();mixer.update(Math.min(.2,model.animations[0].duration*.25));}
   model.scene.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(model.scene),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
   if(bounds.isEmpty()||[...size.toArray(),...center.toArray()].some(value=>!Number.isFinite(value)))throw Error('The model has invalid rendered bounds.');
   const radius=Math.max(.001,size.length()/2),distance=radius/Math.sin(camera.fov*Math.PI/360)*1.15;
   camera.near=Math.max(.00001,distance/10000);camera.far=distance+radius*5;camera.updateProjectionMatrix();
   sun.position.copy(center).add(new THREE.Vector3(12,18,8).normalize().multiplyScalar(radius*4));sun.target.position.copy(center);
   fill.position.copy(center).add(new THREE.Vector3(-10,9,-12).normalize().multiplyScalar(radius*4));fill.target.position.copy(center);
   let foregroundPixels=0,angle=0;
   for(const direction of [[1,.6,1.6],[-1,.5,-1.6],[1.6,.55,0]]){
    camera.position.copy(center).add(new THREE.Vector3(...direction).normalize().multiplyScalar(distance));camera.lookAt(center);camera.updateMatrixWorld();
    if(renderer.compileAsync)await renderer.compileAsync(scene,camera);
    while(gl.getError()!==gl.NO_ERROR){}
    renderer.render(scene,camera);gl.readPixels(0,0,256,192,gl.RGBA,gl.UNSIGNED_BYTE,pixels);foregroundPixels=0;
    for(let i=0;i<pixels.length;i+=4)if(Math.max(Math.abs(pixels[i]-background[0]),Math.abs(pixels[i+1]-background[1]),Math.abs(pixels[i+2]-background[2]))>6)foregroundPixels++;
    if(foregroundPixels>32)break;angle++;
   }
   const error=gl.getError();if(error!==gl.NO_ERROR)throw Error('WebGL error '+error);
   if(gl.isContextLost())throw Error('The graphics context was lost.');
   if(contexts.size!==1)throw Error('Model validation created more than one WebGL context.');
   if(!renderer.info.render.triangles||foregroundPixels<=32)throw Error('Loaded model did not produce visible triangle pixels.');
   const result={...stats,materials:materials.size,textures:textures.size,bounds:size.toArray(),submittedTriangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,foregroundPixels,cameraAngle:angle,contextLost:false,contextCount:contexts.size,seconds:Number(((performance.now()-started)/1000).toFixed(3)),image:renderer.domElement.toDataURL('image/png')};
   return result;
  }finally{clearTimeout(timer);mixer?.stopAllAction();if(model){model.scene?.removeFromParent();model.scene?.traverse(node=>node.skeleton?.dispose());disposeGameModel(model);}renderer.renderLists.dispose();}
 },
 dispose(){loader.dracoLoader?.dispose();loader.ktx2Loader?.dispose();environment.dispose();pmrem.dispose();renderer.dispose();}
};
window.ready=true;
</script></body></html>'''


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_GET(self):
        if urlsplit(self.path).path != '/__glb_pack':
            return super().do_GET()
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.end_headers()
        self.wfile.write(HTML.encode())


def texture_coordinate_checks(path):
    """Mapped authored materials must reference actual primitive UV streams."""
    data = path.read_bytes()
    length, kind = struct.unpack_from('<II', data, 12)
    assert data[:4] == b'glTF' and kind == 0x4E4F534A, str(path) + ': invalid GLB header'
    document = json.loads(data[20:20 + length].decode().rstrip('\0 '))
    def references(value):
        if isinstance(value, dict):
            for key, item in value.items():
                if key.endswith('Texture') and isinstance(item, dict) and isinstance(item.get('index'), int):
                    yield key, item.get('extensions', {}).get('KHR_texture_transform', {}).get('texCoord', item.get('texCoord', 0))
                yield from references(item)
        elif isinstance(value, list):
            for item in value:
                yield from references(item)
    checked = 0
    for mesh in document.get('meshes', []):
        for primitive in mesh.get('primitives', []):
            material = document.get('materials', [])[primitive['material']] if 'material' in primitive else {}
            for texture, channel in references(material):
                assert 'TEXCOORD_' + str(channel) in primitive.get('attributes', {}), str(path) + ': ' + texture + ' has no texture coordinates'
                checked += 1
    return checked


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', action='append', help='exact public-relative GLB path; repeatable')
    parser.add_argument('--timeout', type=int, default=90000)
    parser.add_argument('--report', type=Path, default=Path('/tmp/glb-pack-graphics-results.json'))
    parser.add_argument('--artifacts', type=Path, default=Path('/tmp/glb-pack-graphics'))
    args = parser.parse_args()
    os.chdir(ROOT)
    models = sorted(path.relative_to(ROOT).as_posix() for path in (ROOT / 'public').rglob('*.glb'))
    if args.model:
        assert set(args.model) <= set(models), 'Unknown requested GLB'
        models = [path for path in models if path in args.model]
    registry = json.loads((ROOT / 'public/models/game-asset-registry.json').read_text())
    records = registry if isinstance(registry, list) else registry.get('assets', [])
    registered = {str(item.get('modelPath', '')).split('?')[0].lstrip('/') for item in records}
    assert all(path in registered for path in models), 'Every tested GLB must belong to the public game registry'
    uv_checks = {path: texture_coordinate_checks(ROOT / path) for path in models}
    args.artifacts.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    Thread(target=server.serve_forever, daemon=True).start()
    results, cards = [], []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
            page = browser.new_page(viewport={'width': 256, 'height': 232}, device_scale_factor=1, service_workers='block')
            page.set_default_timeout(args.timeout)
            errors, shader_errors, http_errors = [], [], []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('console', lambda message: shader_errors.append(message.text) if message.type == 'error' and ('WebGLProgram' in message.text or 'VALIDATE_STATUS' in message.text) else None)
            page.on('response', lambda response: http_errors.append({'url': response.url, 'status': response.status}) if response.status >= 400 else None)
            page.route('https://**/*', lambda route: route.abort())
            page.goto(f'http://127.0.0.1:{server.server_port}/__glb_pack', wait_until='domcontentloaded')
            page.wait_for_function('window.ready===true')
            print(f'Validating {len(models)} registered public GLBs with one WebGL context.', flush=True)
            for index, path in enumerate(models):
                counts = (len(errors), len(shader_errors), len(http_errors))
                record = {'model': path, 'textureCoordinateReferences': uv_checks[path]}
                started = time.monotonic()
                try:
                    value = page.evaluate('([url,timeout])=>glbHarness.render(url,timeout)', ['/' + path, args.timeout])
                    image = value.pop('image')
                    if len(errors) > counts[0] or len(shader_errors) > counts[1] or len(http_errors) > counts[2]:
                        raise AssertionError({'pageErrors': errors[counts[0]:], 'shaderErrors': shader_errors[counts[1]:], 'httpErrors': http_errors[counts[2]:]})
                    record.update(value, passed=True)
                    filename = f'{index:02d}-' + Path(path).stem.replace(' ', '_') + '.png'
                    (args.artifacts / filename).write_bytes(base64.b64decode(image.split(',', 1)[1]))
                    cards.append('<article><img src="' + image + '" alt="' + escape(path) + '"><h2>' + escape(Path(path).stem) + '</h2><p>' + str(value['submittedTriangles']) + ' submitted triangles · ' + str(value['textures']) + ' textures</p></article>')
                except Exception as error:
                    record.update(passed=False, error=str(error), seconds=round(time.monotonic() - started, 3))
                results.append(record)
                print(('PASS' if record['passed'] else 'FAIL') + f' {index+1}/{len(models)} {path} ({record["seconds"]}s)' + ('' if record['passed'] else ': ' + record['error']), flush=True)
                args.report.parent.mkdir(parents=True, exist_ok=True)
                args.report.write_text(json.dumps({'models': len(models), 'passed': sum(item['passed'] for item in results), 'results': results}, indent=2))
            page.evaluate('glbHarness.dispose()')
            browser.close()
        (args.artifacts / 'index.html').write_text('<!doctype html><meta charset="utf-8"><title>Game model graphics validation</title><style>body{background:#0b1520;color:#edf4fa;font:14px system-ui;margin:24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(256px,1fr));gap:18px}article{background:#152331;border:1px solid #344a5f;border-radius:12px;overflow:hidden}img{width:100%;image-rendering:auto}h2,p{padding:0 14px}h2{font-size:15px}</style><h1>Public GLB model graphics</h1><p>Real game loader, renderer and material quality. One reused WebGL context.</p><main>' + ''.join(cards) + '</main>')
        failures = [item for item in results if not item['passed']]
        assert not failures, 'GLB graphics failures: ' + ', '.join(item['model'] for item in failures)
        print(f'GLB pack graphics: {len(results)}/{len(models)} passed; report {args.report}; contact sheet {args.artifacts / "index.html"}.', flush=True)
    finally:
        server.shutdown()


if __name__ == '__main__':
    main()
