"""Render every native humanoid family using one real WebGL renderer.

Optional --baseline compares GPU draws/triangles and combined resource bytes.
This tests visual work only; it makes no game, account or server requests.
"""
import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import subprocess
from threading import Thread
from urllib.parse import urlparse, unquote
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--baseline')
parser.add_argument('--revision', help='Serve browser modules from an exact git revision for a reproducible baseline')
parser.add_argument('--report', default='/tmp/character-graphics-webgl.json')
parser.add_argument('--screenshot', default='/tmp/character-graphics-webgl.png')
args = parser.parse_args()
os.chdir(ROOT)
FIXTURE = '''<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{margin:0;padding:24px;background:#09171f;color:#def1ef;font:14px system-ui}h1{margin:0 0 8px;font-size:24px}p{color:#8eb3bd;margin:0 0 20px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}article{overflow:hidden;border:1px solid #29404d;border-radius:12px;background:#10232e}article img{width:100%;display:block}strong,small{display:block;padding:0 12px 8px}small{color:#9dbbc6}canvas{display:none}@media(max-width:600px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}</style>
<h1>Character graphics · native designs</h1><p>Shared scene lighting · bounded geometry and joint data · actual gameplay factories</p><main class="grid"></main><canvas></canvas><script type="module">
import * as T from '/public/vendor/three/three.module.min.js';
import {createBuilderModel,updateBuilderModels} from '/public/js/builder-models-3d.js';
import {createBasketballAIAvatar,animateBasketballAIAvatar} from '/public/js/basketball-ai-avatar.js';
import {seatedPilot} from '/public/js/aircraft-seat.js';
import {createConstructionScene} from '/public/js/construction-scene.js';
import {createPrisonLand} from '/public/js/prison-world.js';
import {disposeModelResources} from '/public/js/game-graphics-resources.js';
const rig=__LEGACY_PLAYERS__?null:await import('/public/js/articulated-character-rig.js');
const ids=['world-resident','hero-spawn','scout-avatar','rad-tox','rogue-bot','forest-ranger','desert-merchant','clockwork-knight','moss-golem','funhouse-ringmaster-avatar','funhouse-juggler-avatar','funhouse-greeter-avatar','funhouse-driver-avatar','funhouse-scare-clown-avatar','basketball-ai','seated-pilot','construction-worker','prison-resident','remote-player','local-player'];
const renderer=new T.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:false,preserveDrawingBuffer:true});renderer.setSize(320,360);renderer.setPixelRatio(1);renderer.setClearColor('#10232e');renderer.outputColorSpace=T.SRGBColorSpace;
const scene=new T.Scene(),light=new T.HemisphereLight('#d9ffff','#24313b',2.3),key=new T.DirectionalLight('#fff0d9',2.1);key.position.set(-3,6,4);scene.add(light,key);
const camera=new T.PerspectiveCamera(34,320/360,.01,100),items=[],errors=[];
let uploads=0;const gl=renderer.getContext();for(const method of ['texImage2D','texSubImage2D']){const original=gl[method];gl[method]=function(...args){uploads++;return original.apply(this,args);};}
const frameTransforms=root=>{const values=[];root.traverse(node=>values.push(...node.position,...node.quaternion,...node.scale));return values;};
const jointTransforms=root=>{const values=[];root.traverse(node=>{if(/BEND|END|HIPS|HIP|KNEE|ANKLE|ELBOW/.test(node.name))values.push(...node.quaternion);});return values;};
function gpuBytes(root){const arrays=new Set(),maps=new Set(),skeletons=new Set();let geometryBytes=0,textureBytes=0,boneTextureBytes=0;root.traverseVisible(node=>{if(node.geometry)for(const attribute of [...Object.values(node.geometry.attributes),node.geometry.index]){const data=attribute?.array;if(data&&!arrays.has(data)){arrays.add(data);geometryBytes+=data.byteLength;}}for(const material of [].concat(node.material||[]))for(const value of Object.values(material))if(value?.isTexture)maps.add(value);if(node.skeleton?.boneTexture)skeletons.add(node.skeleton);});for(const map of maps){const image=map.image;if(image?.width&&image?.height){const bytes=image.data?.byteLength||image.width*image.height*4;textureBytes+=bytes*(map.generateMipmaps?4/3:1);}}for(const skeleton of skeletons)boneTextureBytes+=skeleton.boneTexture.image.data.byteLength;return {geometryBytes,textureBytes,boneTextureBytes,totalGPUBytes:geometryBytes+textureBytes+boneTextureBytes,boneTextures:skeletons.size};}
for(const id of ids){
 let root,customUpdate;if(id==='construction-worker'){const view=createConstructionScene(T,new T.Scene());view.update({construction:{crew:{workers:[{id:'budget',state:'walking',position:{x:0,y:0,z:0}}]}},actors:{}});root=view.root.getObjectByName('CONSTRUCTION_WORKER_budget');customUpdate=time=>view.animate(time);}
 else if(id==='prison-resident'){const world=createPrisonLand();root=world.userData.prisonNpcs.values().next().value;root.position.set(0,0,0);root.userData.state='walking';customUpdate=time=>world.userData.updatePrisonEffects(time);}
 else if(id==='remote-player'||id==='local-player'){if(rig){root=rig.createArticulatedPlayer(T);customUpdate=time=>rig.updateArticulatedCharacter(root,time,{moving:true});}else if(id==='remote-player'){root=new T.Mesh(new T.CapsuleGeometry(.3,1.1,4,8),new T.MeshStandardMaterial({color:0x63eaff}));root.position.y=.85;}else{root=new T.Group();const material=new T.MeshStandardMaterial({color:0xcaff49}),body=new T.Mesh(new T.CapsuleGeometry(.24,.65,3,8),material),head=new T.Mesh(new T.SphereGeometry(.2,10,8),material),nose=new T.Mesh(new T.ConeGeometry(.15,.45,3),new T.MeshBasicMaterial());body.position.y=.8;head.position.y=1.5;nose.position.set(0,1.52,-.38);nose.rotation.x=-Math.PI/2;root.add(body,head,nose);}}
 else root=id==='basketball-ai'?createBasketballAIAvatar(T):id==='seated-pilot'?seatedPilot():createBuilderModel(id);if(!root)throw Error('Missing '+id);
 const group=new T.Group();group.add(root);scene.add(group);if(id==='world-resident')root.userData.residentState={moving:true,name:'Graphics review',appearance:{hairstyle:'short'}};
 root.userData.avatarMotion={moving:true,speed:2};
 const update=customUpdate||(time=>id==='basketball-ai'?animateBasketballAIAvatar(root,true,time):id==='seated-pilot'||id.endsWith('-player')?null:updateBuilderModels(group,time));
 for(let frame=0;frame<30;frame++)update(frame/30);
 const box=new T.Box3().setFromObject(root),center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3()),radius=Math.max(size.y,size.x*.8,size.z*.8);
 camera.position.copy(center).add(new T.Vector3(-radius*.85,radius*.22,radius*(id.startsWith('funhouse-')?1.85:-1.85)));camera.lookAt(center);camera.updateMatrixWorld();
 renderer.render(scene,camera);const before={calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,...gpuBytes(root)},first=frameTransforms(root),firstJoints=jointTransforms(root);
 // Diagnostic median for batches of 200 updates; never a device-independent
 // frame-time promise. Render uploads are measured separately from CPU posing.
 const cpu=[];for(let batch=0;batch<7;batch++){const start=performance.now();for(let frame=0;frame<200;frame++)update(1+frame/120);cpu.push((performance.now()-start)/200);}cpu.sort((a,b)=>a-b);
 const uploadStart=uploads;for(let frame=0;frame<30;frame++){update(1+frame/30);renderer.render(scene,camera);}const sampleUploads=uploads-uploadStart;update(1.25);renderer.render(scene,camera);
 const second=frameTransforms(root);if(second.some(value=>!Number.isFinite(value)))throw Error('Nonfinite pose '+id);
 if(renderer.info.render.calls!==before.calls||renderer.info.render.triangles!==before.triangles)throw Error('Animation grew geometry '+id);
 const pixels=new Uint8Array(320*360*4);gl.readPixels(0,0,320,360,gl.RGBA,gl.UNSIGNED_BYTE,pixels);const colors=new Set();for(let i=0;i<pixels.length;i+=4)colors.add((pixels[i]<<16)|(pixels[i+1]<<8)|pixels[i+2]);if(colors.size<10)throw Error('Blank render '+id);
 const finalJoints=jointTransforms(root),jointPoseChanges=finalJoints.some((value,index)=>Math.abs(value-firstJoints[index])>1e-6);
 if(rig&&id!=='seated-pilot'&&!jointPoseChanges)throw Error('Joint pose did not change '+id);
 const item={id,...before,uploadsPerFrame:sampleUploads/30,boneUploadBytesPerFrame:before.boneTextureBytes,cpuUpdateMedianMs:cpu[3],colors:colors.size,jointPoseChanges,animated:second.some((value,index)=>Math.abs(value-first[index])>1e-6)};items.push(item);
 const card=document.createElement('article'),image=document.createElement('img'),name=document.createElement('strong'),details=document.createElement('small');image.src=renderer.domElement.toDataURL();image.alt=id;name.textContent=id.replaceAll('-',' ');details.textContent=item.calls+' draws · '+item.triangles.toLocaleString()+' triangles';card.append(image,name,details);document.querySelector('.grid').append(card);
 scene.remove(group);disposeModelResources(root);
}
window.report={items,rendererContexts:1,requests:performance.getEntriesByType('resource').filter(entry=>!entry.name.includes('/public/js/')&&!entry.name.includes('/public/vendor/')).map(entry=>entry.name),errors};window.ready=true;
</script></html>'''


class Handler(SimpleHTTPRequestHandler):
    sources = {}

    def do_GET(self):
        path = unquote(urlparse(self.path).path).lstrip('/')
        if args.revision and path.startswith('public/js/') and path.endswith('.js') and '..' not in path.split('/'):
            if path not in self.sources:
                result = subprocess.run(['git', 'show', args.revision + ':' + path], capture_output=True, cwd=ROOT)
                self.sources[path] = result.stdout if result.returncode == 0 else None
            source = self.sources[path]
            if source is None:
                self.send_error(404)
            else:
                self.send_response(200)
                self.send_header('Content-Type', 'application/javascript')
                self.send_header('Content-Length', str(len(source)))
                self.end_headers()
                self.wfile.write(source)
            return
        super().do_GET()

    def log_message(self, *unused):
        pass


server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
        page = browser.new_page(viewport={'width': 1360, 'height': 1000}, service_workers='block')
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('console', lambda message: errors.append(message.text) if message.type == 'error' and ('shader' in message.text.lower() or 'webgl' in message.text.lower()) else None)
        page.route('**/__character_graphics', lambda route: route.fulfill(body=FIXTURE.replace('__LEGACY_PLAYERS__', 'true' if args.revision else 'false'), content_type='text/html'))
        page.goto(f'http://127.0.0.1:{server.server_port}/__character_graphics')
        page.wait_for_function('window.ready', timeout=90000)
        report = page.evaluate('window.report')
        report['errors'] = errors
        assert not errors, errors
        assert len(report['items']) == 20, report
        if args.baseline:
            previous = {item['id']: item for item in json.loads(Path(args.baseline).read_text())['items']}
            failures = []
            for item in report['items']:
                for metric in ['calls', 'triangles']:
                    if item[metric] > previous[item['id']][metric]:
                        failures.append([item['id'], metric, previous[item['id']][metric], item[metric]])
            before_bytes = sum(item['totalGPUBytes'] for item in previous.values())
            after_bytes = sum(item['totalGPUBytes'] for item in report['items'])
            report['totalGPUBytes'] = after_bytes
            report['baselineGPUBytes'] = before_bytes
            if after_bytes > before_bytes:
                failures.append(['combined geometry + textures', 'totalGPUBytes', before_bytes, after_bytes])
            report['budgetFailures'] = failures
        Path(args.report).write_text(json.dumps(report, indent=2))
        page.screenshot(path=args.screenshot, full_page=True)
        assert not report.get('budgetFailures'), report['budgetFailures']
        print(json.dumps({'rendered': len(report['items']), 'rendererContexts': report['rendererContexts'], 'errors': errors, 'report': args.report, 'screenshot': args.screenshot}))
        browser.close()
finally:
    server.shutdown()
