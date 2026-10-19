import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {worldPreviewSource,disposePreviewWorld,frameWorldPreview,mountWorldPreview,previewModelExtensions} from '../public/js/world-map-preview.js';
import {bindAtlasPageLifecycle} from '../public/js/world-atlas.js';
import {createBuilderLand} from '../public/js/environments/builder-land.js';

test('sports destinations preview their playable procedural worlds and authored maps retain their GLBs',()=>{
 for(const [id,layout] of [['basketball-arena','basketball-stadium'],['basketball','basketball-stadium'],['hockey-arena','hockey-arena'],['neon-junction','arcade-park'],['firing-range','firing-range']]){
  const source=worldPreviewSource({id});assert.equal(source.procedural,true);assert.equal(source.environment.builderScene.layout,layout);assert.deepEqual(source.urls,[]);
 }
 const authored=worldPreviewSource({id:'interior',modelUrls:['/floor.glb','/furniture.glb']});
 assert.equal(authored.procedural,false);assert.deepEqual(authored.urls,['/floor.glb','/furniture.glb']);
 assert.equal(worldPreviewSource({id:'custom-court',basketball:true}).environment.builderScene.layout,'basketball-stadium');
 assert.deepEqual(worldPreviewSource({id:'hockey-arena',modelUrl:'/replacement.glb'}).urls,['/replacement.glb'],'an actual authored replacement takes precedence over an inferred template');
 const builder=worldPreviewSource({id:'custom',builderScene:{layout:'hockey-arena',objects:[{id:'1'}]},rotation:{y:1}});
 assert.equal(builder.environment.builderScene.objects.length,1);assert.deepEqual(builder.environment.rotation,{x:0,y:1,z:0});
});

class Controls {
 constructor(camera){this.camera=camera;this.target=new THREE.Vector3();this.events=new Map();this.disposed=0;}
 addEventListener(name,fn){this.events.set(name,fn);}
 update(){this.camera.lookAt(this.target);this.camera.updateMatrixWorld();this.events.get('change')?.();}
 saveState(){this.saved=true;}
 reset(){this.update();}
 dispose(){this.disposed++;}
}
test('preview camera fits every court corner in narrow mobile and wide desktop frames',()=>{
 const world=new THREE.Mesh(new THREE.BoxGeometry(46,14,62),new THREE.MeshBasicMaterial());world.position.set(10,8,-20);
 for(const aspect of [.5,1.7]){
  const camera=new THREE.PerspectiveCamera(38,aspect),controls=new Controls(camera);
  frameWorldPreview(THREE,world,camera,controls,aspect);
  for(const x of [-23,23])for(const y of [-7,7])for(const z of [-31,31]){
   const point=new THREE.Vector3(x+10,y+8,z-20).project(camera);
   assert.ok(Math.abs(point.x)<1&&Math.abs(point.y)<1&&Math.abs(point.z)<1,`corner remains visible at aspect ${aspect}`);
  }
  assert.equal(controls.saved,true);assert.ok(camera.far>controls.maxDistance/3);
 }
 disposePreviewWorld(world);
});
test('preview cleanup disposes unique resources once and preserves shared sports textures',()=>{
 const root=new THREE.Group(),geometry=new THREE.BoxGeometry(),texture=new THREE.Texture(),shared=new THREE.Texture();shared.userData.sportsSurfaceShared=true;
 const material=new THREE.MeshStandardMaterial({map:texture,normalMap:shared});let geometries=0,materials=0,textures=0,sports=0;
 geometry.addEventListener('dispose',()=>geometries++);material.addEventListener('dispose',()=>materials++);texture.addEventListener('dispose',()=>textures++);shared.addEventListener('dispose',()=>sports++);
 root.add(new THREE.Mesh(geometry,material),new THREE.Mesh(geometry,[material]));disposePreviewWorld(root);
 assert.deepEqual([geometries,materials,textures,sports],[1,1,1,0]);
});

class Element {
 constructor(){this.children=[];this.dataset={};this.clientWidth=360;this.clientHeight=210;this.isConnected=true;this.hidden=false;this.events=new Map();}
 set innerHTML(value){this.html=value;this.nodes=new Map(['stage','status','help','reset'].map(name=>[`[data-preview-${name}]`,new Element()]));}
 querySelector(selector){return this.nodes?.get(selector);}
 prepend(child){this.children.unshift(child);child.parent=this;}
 append(child){this.children.push(child);child.parent=this;}
 setAttribute(){}
 addEventListener(name,fn){this.events.set(name,fn);}
 removeEventListener(name){this.events.delete(name);}
 getClientRects(){return this.visible===false?[]:[{}];}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);}
}
function fixture(t,{loader=class{},builder}={}){
 const frames=new Map(),renderers=[];let frameId=0;
 const document={hidden:false,head:new Element(),querySelector:()=>({}),createElement:()=>new Element(),addEventListener(){},removeEventListener(){}};
 const window={devicePixelRatio:3,addEventListener(){},removeEventListener(){}};
 const values={document,window,location:{href:'https://www.muzikaz.com/index.htm'},requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId;},cancelAnimationFrame:id=>frames.delete(id),matchMedia:()=>({matches:true})};
 for(const [key,value] of Object.entries(values)){
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  t.after(()=>descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key]);
 }
 class Renderer{
  constructor(){this.domElement=new Element();this.renders=0;this.disposals=0;this.losses=0;renderers.push(this);}
  setPixelRatio(value){this.ratio=value;}
  setSize(width,height){this.size=[width,height];}
  render(scene){this.renders++;this.scene=scene;}
  dispose(){this.disposals++;}
  forceContextLoss(){this.losses++;}
 }
 const modules=[{...THREE,WebGLRenderer:Renderer},{GLTFLoader:loader},{OrbitControls:Controls},{createBuilderLand:builder||(()=>new THREE.Mesh(new THREE.BoxGeometry(15,1,28),new THREE.MeshBasicMaterial()))},{createBuilderModel:()=>null}];
 return {modules,host:new Element(),document,renderers,frames,flush(){for(const [id,fn] of frames){frames.delete(id);fn();}}};
}
test('closing the selector before its lazy modules arrive creates no renderer',async t=>{
 const f=fixture(t);let release;const pending=new Promise(resolve=>release=resolve);
 const preview=mountWorldPreview(f.host,{id:'basketball-arena'},{loadModules:()=>pending});preview.dispose();release(f.modules);await preview.ready;
 assert.equal(f.renderers.length,0);assert.equal(f.frames.size,0);
});
test('mobile previews render on demand, skip hidden pages, and release their renderer on close',async t=>{
 const f=fixture(t),preview=mountWorldPreview(f.host,{id:'basketball-arena'},{loadModules:async()=>f.modules});await preview.ready;
 const renderer=f.renderers[0];assert.equal(renderer.ratio,1.25);assert.equal(f.host.querySelector('[data-preview-status]').hidden,true);
 f.document.hidden=true;f.flush();assert.equal(renderer.renders,0);
 f.document.hidden=false;f.host.querySelector('[data-preview-reset]').events.get('click')();f.flush();assert.equal(renderer.renders,1);assert.equal(f.frames.size,0);
 preview.dispose();preview.dispose();assert.equal(renderer.disposals,1);assert.equal(renderer.losses,1);assert.equal(f.frames.size,0);
});
test('switching away during GLB parsing aborts downloads and disposes the late model',async t=>{
 let release,signal;const parsed=new Promise(resolve=>release=resolve);
 const f=fixture(t,{loader:class{parseAsync(){return parsed;}}});
 const original=Object.getOwnPropertyDescriptor(globalThis,'fetch');globalThis.fetch=async(_url,options)=>{signal=options.signal;return {ok:true,arrayBuffer:async()=>new ArrayBuffer(8)};};t.after(()=>Object.defineProperty(globalThis,'fetch',original));
 const preview=mountWorldPreview(f.host,{id:'model',modelUrl:'/court.glb'},{loadModules:async()=>f.modules});
 await new Promise(resolve=>setImmediate(resolve));preview.dispose();assert.equal(signal.aborted,true);
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());let disposed=0;mesh.geometry.addEventListener('dispose',()=>disposed++);
 release({scene:mesh});await preview.ready;assert.equal(disposed,1);assert.equal(f.renderers[0].renders,0);assert.equal(f.frames.size,0);
});

test('restoring an atlas from the browser back cache resumes its preview without disposing its controls',()=>{
 const target=new EventTarget(),calls=[];
 const release=bindAtlasPageLifecycle(target,{pause:()=>calls.push('pause'),resume:()=>calls.push('resume'),dispose:()=>calls.push('dispose')});
 const event=(name,persisted)=>Object.assign(new Event(name),{persisted});
 target.dispatchEvent(event('pagehide',true));target.dispatchEvent(event('pageshow',true));
 assert.deepEqual(calls,['pause','resume']);target.dispatchEvent(event('pagehide',false));assert.deepEqual(calls,['pause','resume','dispose']);
 release();target.dispatchEvent(event('pageshow',true));assert.deepEqual(calls,['pause','resume','dispose']);
});

test('basketball previews expose the actual court while the playable stadium keeps its roof',async t=>{
 const environment=worldPreviewSource({id:'basketball-arena'}).environment;
 const land=createBuilderLand(environment),gameplay=createBuilderLand(environment);
 const f=fixture(t,{builder:()=>land}),preview=mountWorldPreview(f.host,environment,{loadModules:async()=>f.modules});await preview.ready;f.flush();
 assert.equal(land.getObjectByName('ARENA_ROOF_CEILING').visible,false);assert.equal(gameplay.getObjectByName('ARENA_ROOF_CEILING').visible,true);
 let courtVisible=false;land.traverseVisible(node=>{if(node.name.includes('COURT'))courtVisible=true;});assert.equal(courtVisible,true);
 preview.dispose();disposePreviewWorld(gameplay);
});

test('builder previews resolve catalog assets, uploaded model definitions, generated objects and saved drawings',async t=>{
 let requests=0,disposals=0;
 const imported=new THREE.Mesh(new THREE.BoxGeometry(2,4,2),new THREE.MeshBasicMaterial());imported.geometry.addEventListener('dispose',()=>disposals++);
 const f=fixture(t,{loader:class{async parseAsync(){return {scene:imported};}}});
 const original=Object.getOwnPropertyDescriptor(globalThis,'fetch');globalThis.fetch=async()=>{requests++;return {ok:true,arrayBuffer:async()=>new ArrayBuffer(8)};};t.after(()=>Object.defineProperty(globalThis,'fetch',original));
 f.modules[4]={createBuilderModel:id=>id==='sofa'?new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial()):null,createGeneratedAsset:()=>new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial())};
 const builderScene={layout:'grand-floor',catalogModels:[{id:'catalog-sofa',buildAssetId:'sofa'}],placedModels:[{id:'upload',modelUrl:'/saved.glb',targetHeight:2},{id:'generated',generated:true,generator:{}}],customModels:[{id:'drawing',strokes:[{tool:'rectangle',points:[{x:200,y:200},{x:300,y:300}]}]}],objects:[{modelId:'catalog-sofa',position:{x:0,z:0}},{modelId:'upload',position:{x:3,z:0}},{modelId:'upload',position:{x:6,z:0}},{modelId:'generated',position:{x:8,z:0}},{modelId:'drawing',position:{x:10,z:0}}]};
 const preview=mountWorldPreview(f.host,{id:'saved-map',builderScene},{loadModules:async()=>f.modules});await preview.ready;f.flush();
 const world=f.renderers[0].scene.children.find(node=>node.isGroup);
 assert.equal(world.children.length,6);assert.equal(requests,1,'repeated uploaded objects reuse one download');
 assert.equal(new THREE.Box3().setFromObject(world.children[2]).getSize(new THREE.Vector3()).y,2,'the uploaded definition keeps its authored height');
 preview.dispose();assert.equal(disposals,1,'shared imported geometry is disposed once');
});

test('compressed models configure only the required decoder before parsing',async t=>{
 const data=new TextEncoder().encode(JSON.stringify({asset:{version:'2.0'},extensionsRequired:['EXT_meshopt_compression']})).buffer;
 assert.deepEqual(previewModelExtensions(data),['EXT_meshopt_compression']);
 const configured=[],decoder={};const f=fixture(t,{loader:class{setMeshoptDecoder(value){assert.equal(value,decoder);configured.push('configured');}async parseAsync(){configured.push('parsed');return {scene:new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial())};}}});
 const original=Object.getOwnPropertyDescriptor(globalThis,'fetch');globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>data});t.after(()=>Object.defineProperty(globalThis,'fetch',original));
 const preview=mountWorldPreview(f.host,{id:'compressed',modelUrl:'/compressed.glb'},{loadModules:async()=>f.modules,loadDecoder:async name=>{assert.equal(name,'meshopt');return {MeshoptDecoder:decoder};}});
 await preview.ready;assert.deepEqual(configured,['configured','parsed']);preview.dispose();
});
