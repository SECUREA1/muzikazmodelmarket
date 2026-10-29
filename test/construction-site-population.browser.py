"""Render the real construction site and its current reusable support models.

Optionally export an identical-camera comparison against an earlier world JSON:
python3 test/construction-site-population.browser.py --before /tmp/construction-world-before.json
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--before',type=Path)
parser.add_argument('--output',type=Path,default=Path('/workspace/construction-upgrade'))
args=parser.parse_args()
os.chdir(ROOT)
world=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {constructionWorld} from './construction-world.mjs';console.log(JSON.stringify(constructionWorld()));"],text=True))
before=json.loads(args.before.read_text()) if args.before else None
args.output.mkdir(parents=True,exist_ok=True)

MARKUP='''<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><style>html,body{margin:0;background:#10201d}canvas{display:block}</style><canvas></canvas><script type="module">
import * as T from '/public/vendor/three/three.module.min.js';
import {createBuilderModel,updateBuilderModels} from '/public/js/builder-models-3d.js';
import {placementBounds} from '/public/js/placed-item-collision.js';
import {createConstructionScene} from '/public/js/construction-scene.js';
import {createEarthworks} from '/public/js/construction-earthworks.js';
const renderer=new T.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(1200,800);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
const scene=new T.Scene();scene.background=new T.Color('#b3c6c2');const camera=new T.PerspectiveCamera(43,1.5,.1,2200);scene.add(new T.HemisphereLight('#fff4df','#45514b',2));const sun=new T.DirectionalLight('#fff0d1',3);sun.position.set(-90,160,70);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=sun.shadow.camera.bottom=-400;sun.shadow.camera.right=sun.shadow.camera.top=400;sun.shadow.camera.far=800;sun.shadow.normalBias=.03;scene.add(sun);
const ground=new T.Mesh(new T.PlaneGeometry(1000,1000),new T.MeshStandardMaterial({color:'#8b765b',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.26;ground.receiveShadow=true;scene.add(ground);
const content=new T.Group();scene.add(content);const progress=createConstructionScene(T,scene);let current;
renderer.debug.onShaderError=(gl,program,vertex,fragment)=>{throw Error('Construction shader failure: '+gl.getProgramInfoLog(program));};
window.loadSite=async world=>{
 current=world;for(const item of world.builderScene.objects){const root=createBuilderModel(item.modelId);if(!root)throw Error('No construction model '+item.modelId);const owned=new Map();root.traverse(node=>{if(node.material){const clone=material=>{if(!owned.has(material))owned.set(material,material.clone());return owned.get(material);};node.material=Array.isArray(node.material)?node.material.map(clone):clone(node.material);if(item.materialSettings?.useAccent&&node.material.color)node.material.color.lerp(new T.Color(item.materialSettings.accent),.38);}});root.position.set(item.position.x,item.position.y,item.position.z);root.rotation.set(item.rotation.x,item.rotation.y,item.rotation.z);root.scale.set(item.scale.x,item.scale.y,item.scale.z);root.updateMatrixWorld(true);const bounds=placementBounds(T,root);root.position.y+=item.position.y-bounds.min.y;root.userData.siteObjectId=item.id;root.userData.siteModelId=item.modelId;root.name=item.name;updateBuilderModels(root,1.75);content.add(root);}
 progress.update({construction:{earthworks:createEarthworks(world.construction)},actors:{}});
 await new Promise(resolve=>setTimeout(resolve,180));
 return {objects:content.children.length,upgraded:content.children.filter(root=>root.userData.constructionSupportModel).map(root=>({id:root.userData.siteObjectId,modelId:root.userData.siteModelId,design:root.userData.nativeDesign.version})),containers:content.children.filter(root=>root.userData.siteModelId==='shipping-container-box').length};
};
window.siteView=async view=>{if(view==='overview'){camera.position.set(-250,230,350);camera.lookAt(60,0,70);}else{camera.position.set(-92,42,76);camera.lookAt(-44,3,-8);}camera.updateProjectionMatrix();await renderer.compileAsync(scene,camera);renderer.render(scene,camera);const pixels=new Uint8Array(1200*800*4);renderer.getContext().readPixels(0,0,1200,800,renderer.getContext().RGBA,renderer.getContext().UNSIGNED_BYTE,pixels);let occupied=0;for(let i=0;i<pixels.length;i+=4)if(Math.max(pixels[i],pixels[i+1],pixels[i+2])-Math.min(pixels[i],pixels[i+1],pixels[i+2])>30)occupied++;return {pixels:occupied,drawCalls:renderer.info.render.calls,contextLost:renderer.getContext().isContextLost()};};
window.ready=true;
</script>'''

class Handler(SimpleHTTPRequestHandler):
    def log_message(self,*_args):pass
    def do_GET(self):
        if self.path=='/__construction_preview__':
            self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(MARKUP.encode())
        else:super().do_GET()

server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT)))
Thread(target=server.serve_forever,daemon=True).start()
results=[]
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
        for label,record in ([('before',before)] if before else [])+[('after',world)]:
            page=browser.new_page(viewport={'width':1200,'height':800},service_workers='block');errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_port}/__construction_preview__',wait_until='domcontentloaded')
            page.wait_for_function('window.ready===true')
            state=page.evaluate('world=>loadSite(world)',record)
            assert state['objects']==len(record['builderScene']['objects']),state
            if label=='after':
                assert len(state['upgraded'])==6 and state['containers']==3,state
                assert {item['design'] for item in state['upgraded']}=={'crafted-native-v3'},state
            for view in ['overview','services']:
                pixels=page.evaluate('view=>siteView(view)',view)
                assert pixels['pixels']>20000 and not pixels['contextLost'],pixels
                page.locator('canvas').screenshot(path=str(args.output/f'construction-{label}-{view}.png'))
                results.append({'release':label,'view':view,**state,**pixels,'pageErrors':errors})
            assert not errors,errors
            page.close()
        browser.close()
    (args.output/'construction-population-report.json').write_text(json.dumps(results,indent=2))
    print(json.dumps(results),flush=True)
finally:
    server.shutdown()
