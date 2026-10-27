#!/usr/bin/env python3
"""Render original GLBs to catalog thumbnails with the project's local Three.js.

Requires Pillow, Playwright and Chromium. All files and decoders stay local; no
network services or modified model exports are involved.
"""

import argparse
import hashlib
import io
import json
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from PIL import Image, ImageDraw, ImageOps
from playwright.sync_api import sync_playwright


RENDER_HTML = r'''<!doctype html><meta charset="utf-8"><title>Graphics pack renderer</title>
<style>html,body{margin:0;background:#e2e7ed;width:480px;height:480px}canvas{display:block}</style>
<script type="module">
import * as THREE from '/public/vendor/three/three.module.min.js';
import {GLTFLoader} from '/public/vendor/three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from '/public/vendor/three/addons/loaders/DRACOLoader.js';
import {KTX2Loader} from '/public/vendor/three/addons/loaders/KTX2Loader.js';
import {MeshoptDecoder} from '/public/vendor/three/addons/libs/meshopt_decoder.module.js';

const renderer = new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setSize(480,480);renderer.setPixelRatio(1);
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
document.body.appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#e2e7ed');
scene.add(new THREE.HemisphereLight(0xffffff,0x8b98b0,2.5));
const key=new THREE.DirectionalLight(0xfff3df,3.8);key.position.set(4,7,6);scene.add(key);
const fill=new THREE.DirectionalLight(0xdbeaff,2.1);fill.position.set(-5,3,-3);scene.add(fill);
const envScene=new THREE.Scene();envScene.background=new THREE.Color(0xc7ced8);
for(const [x,y,z] of [[3,3,0],[-3,2,1],[0,3,-3]]){
 const box=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshBasicMaterial({color:0xffffff}));
 box.position.set(x,y,z);envScene.add(box);
}
const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(envScene,.05).texture;
envScene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});pmrem.dispose();
const camera=new THREE.PerspectiveCamera(38,1,.001,1000);
const stage=new THREE.Mesh(new THREE.CircleGeometry(5,80),new THREE.MeshStandardMaterial({color:0xd2dae4,roughness:1,metalness:0}));
stage.rotation.x=-Math.PI/2;stage.position.y=-.015;scene.add(stage);
const draco=new DRACOLoader().setDecoderPath('/public/vendor/three/addons/libs/draco/gltf/');
const ktx=new KTX2Loader().setTranscoderPath('/public/vendor/three/addons/libs/basis/').detectSupport(renderer);
const loader=new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx).setMeshoptDecoder(MeshoptDecoder);
let current;
function dispose(root){
 const geometries=new Set(),materials=new Set(),textures=new Set();
 root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])if(m){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});
 geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>{t.dispose();t.source?.data?.close?.();});
}
window.renderModel=async function(path){
 if(current){scene.remove(current);dispose(current);current=null;renderer.renderLists.dispose();}
 const gltf=await loader.loadAsync('/'+path.split('/').map(encodeURIComponent).join('/'));
 current=new THREE.Group();current.add(gltf.scene);scene.add(current);current.updateMatrixWorld(true);
 const originalBox=new THREE.Box3().setFromObject(current),originalSize=originalBox.getSize(new THREE.Vector3());
 if(originalBox.isEmpty()||!Number.isFinite(originalSize.length())||originalSize.length()<=0)throw new Error('Model has no finite renderable bounds');
 const longest=Math.max(originalSize.x,originalSize.y,originalSize.z);current.scale.setScalar(4/longest);current.updateMatrixWorld(true);
 let box=new THREE.Box3().setFromObject(current),center=box.getCenter(new THREE.Vector3());
 current.position.set(-center.x,-box.min.y,-center.z);current.updateMatrixWorld(true);
 box=new THREE.Box3().setFromObject(current);const size=box.getSize(new THREE.Vector3());center=box.getCenter(new THREE.Vector3());
 const environment=path.includes('/environments/');
 const dir=environment?new THREE.Vector3(.72,.85,1):new THREE.Vector3(.33,.24,1);
 const sphere=box.getBoundingSphere(new THREE.Sphere());const distance=sphere.radius/Math.sin(THREE.MathUtils.degToRad(camera.fov/2))*1.12;
 camera.position.copy(center).add(dir.normalize().multiplyScalar(distance));camera.near=.005;camera.far=1000;camera.lookAt(center);camera.updateProjectionMatrix();
 stage.scale.setScalar(Math.max(size.x,size.z,1)/5*.8);
 renderer.render(scene,camera);await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);renderer.render(scene,camera);
 let meshes=0,triangles=0;const mats=new Set();
 current.traverse(o=>{if(o.isMesh){meshes++;const g=o.geometry;triangles+=(g.index?.count||g.attributes?.position?.count||0)/3;for(const m of Array.isArray(o.material)?o.material:[o.material])if(m)mats.add(m);}});
 return {meshes,materials:mats.size,triangles:Math.round(triangles),animations:gltf.animations.length,dimensions:originalSize.toArray(),renderCalls:renderer.info.render.calls};
};window.rendererReady=true;
</script>'''


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        if urlsplit(self.path).path == '/__graphics_pack_renderer__':
            encoded = RENDER_HTML.encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)
        else:
            super().do_GET()


def render_models(repo, output):
    repo = Path(repo).resolve()
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    paths = sorted(p for p in repo.rglob('*.glb')
                   if not any(s in p.relative_to(repo).parts for s in
                              ('.git', 'node_modules', 'dist', '.cache', 'work')))
    report = []
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(repo)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                                        args=['--no-sandbox', '--use-angle=swiftshader',
                                              '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'])
            page = browser.new_page(viewport={'width': 480, 'height': 480}, device_scale_factor=1)
            page.set_default_timeout(120000)
            page.goto(f'http://127.0.0.1:{server.server_port}/__graphics_pack_renderer__')
            page.wait_for_function('window.rendererReady === true')
            for index, path in enumerate(paths):
                source = path.relative_to(repo).as_posix()
                sha = hashlib.sha256(path.read_bytes()).hexdigest()
                target = output / (sha + '.webp')
                record = {'sourcePath': source, 'sha256': sha,
                          'previewPath': 'previews/' + target.name}
                try:
                    metadata = page.evaluate('path => window.renderModel(path)', source)
                    png = page.locator('canvas').screenshot(type='png', timeout=120000)
                    with Image.open(io.BytesIO(png)) as image:
                        image.convert('RGB').save(target, 'WEBP', quality=88, method=6)
                    record.update(status='rendered', model=metadata)
                except Exception as exc:
                    record.update(status='error', error=str(exc)[:600])
                report.append(record)
                print(f'[{index+1}/{len(paths)}] {record["status"]}: {source}', flush=True)
                (output / 'render-report.json').write_text(json.dumps(report, indent=2) + '\n')
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
    make_contact_sheet(report, output)
    return report


def make_contact_sheet(report, output):
    valid = [r for r in report if r['status'] == 'rendered']
    if not valid:
        return
    columns, cell_w, cell_h = 6, 240, 268
    rows = (len(valid) + columns - 1) // columns
    sheet = Image.new('RGB', (columns * cell_w, rows * cell_h), '#f3f5f8')
    draw = ImageDraw.Draw(sheet)
    for index, record in enumerate(valid):
        x, y = index % columns * cell_w, index // columns * cell_h
        with Image.open(output / Path(record['previewPath']).name) as image:
            thumb = ImageOps.contain(image, (232, 232), Image.Resampling.LANCZOS)
            sheet.paste(thumb, (x + (cell_w - thumb.width) // 2, y))
        label = Path(record['sourcePath']).stem
        draw.text((x + 5, y + 234), label[:34], fill='#142038')
        draw.text((x + 5, y + 250), f'{record["model"]["meshes"]} meshes', fill='#536278')
    sheet.save(output / 'model-contact-sheet.jpg', quality=90)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    result = render_models(args.repo, args.output)
    failed = sum(r['status'] != 'rendered' for r in result)
    print(f'{len(result)-failed}/{len(result)} models rendered; {failed} failures.')
    raise SystemExit(bool(failed))
