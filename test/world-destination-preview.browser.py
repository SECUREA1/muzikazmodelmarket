"""Destination previews preserve full airport/harbor scenes and authored models."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os

os.chdir(Path(__file__).resolve().parents[1])


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                                    args=['--no-sandbox', '--enable-unsafe-swiftshader'])
        page = browser.new_page(viewport={'width': 1100, 'height': 800})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('console', lambda message: print(message.text, flush=True) if '[world-preview]' in message.text else None)
        page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/nearby-action-buttons.html')
        page.evaluate('''async()=>{
          document.body.innerHTML='<main id="preview" style="width:900px"></main>';
          const THREE=await import('/public/vendor/three/three.module.min.js');
          const projection=THREE.PerspectiveCamera.prototype.updateProjectionMatrix;THREE.PerspectiveCamera.prototype.updateProjectionMatrix=function(...args){window.previewCamera=this;return projection.apply(this,args);};
          const add=THREE.Scene.prototype.add;
          THREE.Scene.prototype.add=function(...objects){window.renderedScene=this;return add.apply(this,objects);};
          window.mount=async (world,resolve=false)=>{window.previewMount?.dispose();window.renderedScene=null;window.world=world;const {mountWorldPreview}=await import('/public/js/world-destination-preview.js');window.previewMount=mountWorldPreview(document.querySelector('#preview'),world,{resolve,autoStart:true});};
          const {airportWorld}=await import('/airport-world.mjs');await mount(airportWorld());
        }''')
        page.wait_for_function("document.querySelector('#preview button').textContent==='Close 3D' && window.renderedScene", timeout=60000)
        airport = page.evaluate('''()=>{
          const roots=[];renderedScene.traverse(object=>{if(object.userData.atlasItemId)roots.push(object);});
          const ids=new Set(roots.map(object=>object.userData.atlasItemId));
          return {camera:previewCamera.position.toArray(),runway:world.airport.runway,total:world.builderScene.objects.length,rendered:roots.length,
            missing:world.builderScene.objects.filter(item=>!ids.has(item.id)).map(item=>item.id),
            craft:roots.filter(object=>object.userData.aircraftModel).map(object=>object.userData.atlasItemId),
            terminal:roots.some(object=>object.userData.atlasItemId.startsWith('airport-terminal-')),
            mountain:roots.some(object=>object.userData.atlasItemId.includes('peak-'))};
        }''')
        assert airport['total'] > 100, airport
        assert sum(value * value for value in airport['camera']) ** .5 < 600, airport
        assert airport['rendered'] == airport['total'] and not airport['missing'], airport
        assert set(airport['craft']) == {'airport-flight-1', 'airport-flight-2', 'airport-flight-3',
                                         'airport-command-flight', 'airport-evacuation-flight'}, airport
        assert airport['terminal'] and airport['mountain'], airport
        page.screenshot(path='/workspace/accurate-airport-preview.png')
        saved_airport = page.evaluate('world')
        page.route('**/api/environments/muzikaz-airport', lambda route: route.fulfill(
            json={'success': True, 'data': saved_airport}))
        page.evaluate('''async()=>{
          await mount({id:'muzikaz-airport',name:'Stale list entry',modelUrl:'/wrong-house.glb',builderScene:{layout:'grand-floor',mapSize:40,objects:[{id:'wrong-house',modelId:'sofa'}]}},true);
        }''')
        page.wait_for_function("document.querySelector('#preview button').textContent==='Close 3D' && window.renderedScene", timeout=60000)
        canonical = page.evaluate('''()=>{
          const ids=[];renderedScene.traverse(object=>{if(object.userData.atlasItemId)ids.push(object.userData.atlasItemId);});
          return {id:document.querySelector('#preview canvas').dataset.worldId,name:document.querySelector('#preview canvas').getAttribute('aria-label'),ids};
        }''')
        assert canonical['id'] == saved_airport['id'] and saved_airport['name'] in canonical['name'], canonical
        assert 'wrong-house' not in canonical['ids'] and len(canonical['ids']) == airport['total'], canonical
        page.evaluate('''async()=>{
          const {neonMarina}=await import('/neon-marina.mjs'),marina=neonMarina();
          await mount({id:'harbor-preview',name:'Neon Docks',proceduralLand:true,builderScene:{layout:'grand-floor',mapSize:1024,objects:marina.objects,layoutMeta:{harbor:marina.harbor}}});
        }''')
        page.wait_for_function("document.querySelector('#preview button').textContent==='Close 3D' && window.renderedScene", timeout=60000)
        harbor = page.evaluate('''()=>{
          const ids=new Set();let boats=0;renderedScene.traverse(object=>{if(object.userData.atlasItemId)ids.add(object.userData.atlasItemId);if(object.userData.watercraft)boats++;});
          return {missing:world.builderScene.objects.filter(item=>!ids.has(item.id)).map(item=>item.id),boats};
        }''')
        assert not harbor['missing'] and harbor['boats'] >= 4, harbor
        page.evaluate('''async()=>{
          const THREE=await import('/public/vendor/three/three.module.min.js');
          const modelUrl=mesh=>{const geometry=mesh.geometry.toNonIndexed(),position=geometry.attributes.position,normal=geometry.attributes.normal,buffer=new Float32Array(position.array.length+normal.array.length);buffer.set(position.array);buffer.set(normal.array,position.array.length);geometry.computeBoundingBox();const base64=btoa(String.fromCharCode(...new Uint8Array(buffer.buffer))),model={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,name:mesh.name}],meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1},material:0}]}],materials:[{pbrMetallicRoughness:{baseColorFactor:[.3,.6,.4,1],metallicFactor:0,roughnessFactor:.8}}],buffers:[{uri:'data:application/octet-stream;base64,'+base64,byteLength:buffer.byteLength}],bufferViews:[{buffer:0,byteOffset:0,byteLength:position.array.byteLength},{buffer:0,byteOffset:position.array.byteLength,byteLength:normal.array.byteLength}],accessors:[{bufferView:0,componentType:5126,count:position.count,type:'VEC3',min:geometry.boundingBox.min.toArray(),max:geometry.boundingBox.max.toArray()},{bufferView:1,componentType:5126,count:normal.count,type:'VEC3'}]};return URL.createObjectURL(new Blob([JSON.stringify(model)],{type:'model/gltf+json'}));};
          const source=new THREE.Mesh(new THREE.BoxGeometry(40,.2,40),new THREE.MeshStandardMaterial({color:0x45846e}));source.name='AUTHORED_BASE_MODEL';
          const baseUrl=modelUrl(source);
          const prop=new THREE.Mesh(new THREE.BoxGeometry(1,2,1),new THREE.MeshStandardMaterial({color:0xff9933}));prop.name='EXACT_PLACED_GLB';
          const propUrl=modelUrl(prop);
          await mount({id:'authored-preview',name:'Authored destination',proceduralLand:true,builderScene:{layout:'grand-floor',baseEnvironment:{modelUrl:baseUrl},customModels:[{id:'drawing',strokes:[{tool:'rectangle',points:[{x:200,y:200},{x:270,y:280}]}]}],placedModels:[{id:'exact-glb',modelUrl:propUrl,targetHeight:3}],objects:[{id:'saved-drawing',modelId:'drawing',placementAnchor:'collider-base',position:{x:-4,y:.2,z:0}},{id:'saved-glb',modelId:'exact-glb',placementAnchor:'collider-base',position:{x:4,y:.2,z:0},scale:{x:1,y:2,z:1}}]}});
        }''')
        page.wait_for_function("document.querySelector('#preview button').textContent==='Close 3D' && window.renderedScene", timeout=30000)
        authored = page.evaluate('''async()=>{
          const THREE=await import('/public/vendor/three/three.module.min.js'),roots=[];renderedScene.traverse(object=>{if(object.userData.atlasItemId)roots.push(object);});
          const glb=roots.find(object=>object.userData.atlasItemId==='saved-glb'),bounds=new THREE.Box3().setFromObject(glb);
          return {base:!!renderedScene.getObjectByName('AUTHORED_BASE_MODEL'),glb:!!renderedScene.getObjectByName('EXACT_PLACED_GLB'),ids:roots.map(object=>object.userData.atlasItemId),height:bounds.max.y-bounds.min.y,feet:bounds.min.y};
        }''')
        assert authored['base'] and authored['glb'], authored
        assert set(authored['ids']) == {'saved-drawing', 'saved-glb'}, authored
        assert abs(authored['height'] - 6) < .01 and abs(authored['feet'] - .2) < .01, authored
        page.evaluate('window.previewMount.dispose()')
        assert page.locator('#preview canvas').count() == 0
        assert not errors, errors
        browser.close()
        print(f"Full airport ({airport['rendered']} objects, terminal, 5 aircraft including command/evacuation and mountain), canonical destination resolution, harbor, authored GLB base, custom drawing, exact placed GLB and disposal passed.")
finally:
    server.shutdown()
