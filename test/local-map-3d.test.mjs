import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {mirrorMapMeshes} from '../public/js/local-map-3d.js';

// Exercise the actual mount path and the actual adapter helper. Stopping at
// renderer construction keeps these policy cases independent of a GPU/DOM.
const qualitySource=await readFile(new URL('../public/js/environments/environment-quality.js',import.meta.url),'utf8');
const mapSource=await readFile(new URL('../public/js/local-map-3d.js',import.meta.url),'utf8');
const withoutModuleSyntax=source=>source.replace(/^import .*;\n/gm,'').replace(/export /g,'');
for(const {name,masked=false,antialias}of [
 {name:'ANGLE (Google, Vulkan (SwiftShader Device))',antialias:false},
 {name:'ANGLE (NVIDIA GeForce RTX)',antialias:true},
 {name:'SwiftShader',masked:true,antialias:true}
])test('3D map retains low-power adapter and chooses antialiasing for '+(masked?'masked GPU':name),async()=>{
 let options,probeOptions,released=0;
 const stopped=new Error('renderer construction observed'),gl={RENDERER:1,
  getExtension(extension){if(extension==='WEBGL_debug_renderer_info')return masked?null:{UNMASKED_RENDERER_WEBGL:2};if(extension==='WEBGL_lose_context')return {loseContext(){released++;}};return null;},
  getParameter(key){return key===2?name:'WebKit WebGL';}
 };
 const context=vm.createContext({THREE:{...THREE,WebGLRenderer:class{constructor(value){options=value;throw stopped;}}},
  document:{createElement(kind){assert.equal(kind,'canvas');return {getContext(kind,value){assert.equal(kind,'webgl2');probeOptions=value;return gl;}};}}
 });
 vm.runInContext(withoutModuleSyntax(qualitySource)+'\n'+withoutModuleSyntax(mapSource)+'\nglobalThis.mount=mountLocalMap3D;',context);
 await assert.rejects(context.mount({}, {environment:{name:'Policy fixture'},getRoots:()=>[]}),error=>error===stopped);
 assert.equal(options.antialias,antialias);
 assert.equal(options.powerPreference,'low-power');
 assert.equal(probeOptions.powerPreference,'low-power','probe the adapter the map will actually request');
 assert.equal(probeOptions.antialias,false,'the temporary capability probe stays lightweight');
 assert.equal(released,1,'the temporary context is released before map renderer construction');
});

test('map owns disposable wrappers while sharing transformed game mesh data',()=>{
 const texture=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);texture.needsUpdate=true;
 const parent=new THREE.Group(),root=new THREE.Group(),geometry=new THREE.BoxGeometry(2,3,4),material=new THREE.MeshBasicMaterial({map:texture}),mesh=new THREE.Mesh(geometry,material);parent.position.set(10,2,-8);root.rotation.y=.7;root.scale.setScalar(2);mesh.position.set(3,0,9);parent.add(root);root.add(mesh);
 material.onBeforeCompile=()=>{};material.customProgramCacheKey=()=> 'game-shader';
 const textureVersion=texture.source.version,map=mirrorMapMeshes([root]),copy=map.group.children[0];assert.deepEqual(copy.matrix.elements,mesh.matrixWorld.elements);assert.notEqual(copy.geometry,geometry);assert.notEqual(copy.material,material);assert.notEqual(copy.material.map,texture);assert.equal(copy.geometry.attributes.position.array,geometry.attributes.position.array);assert.equal(copy.geometry.index.array,geometry.index.array);assert.equal(copy.geometry.type,geometry.type);assert.equal(copy.material.map.image,texture.image);assert.equal(copy.material.onBeforeCompile,material.onBeforeCompile);assert.equal(copy.material.customProgramCacheKey,material.customProgramCacheKey);assert.equal(texture.source.version,textureVersion);assert.equal(mesh.parent,root);
 assert.equal(map.update(),false,'idle geometry does not request a redraw');mesh.position.x=14;assert.equal(map.update(),true);assert.deepEqual(copy.matrix.elements,mesh.matrixWorld.elements);
 root.visible=false;map.update();assert.equal(copy.visible,false);
 let disposed=0,ownedDisposed=0;for(const resource of [geometry,material,texture])resource.addEventListener('dispose',()=>disposed++);for(const resource of [copy.geometry,copy.material,copy.material.map])resource.addEventListener('dispose',()=>ownedDisposed++);map.dispose();map.dispose();assert.equal(disposed,0);assert.equal(ownedDisposed,3);assert.equal(root.children[0],mesh);assert.equal(texture.source.version,textureVersion);
});
test('instanced map objects retain exact game instance transforms',()=>{
 const root=new THREE.Group(),mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial(),2);mesh.setMatrixAt(1,new THREE.Matrix4().makeTranslation(20,4,-30));mesh.setColorAt(1,new THREE.Color(0x8adeff));root.add(mesh);const map=mirrorMapMeshes([root]),copy=map.group.children[0];assert.equal(copy.instanceMatrix.array,mesh.instanceMatrix.array);assert.equal(copy.instanceColor.array,mesh.instanceColor.array);assert.equal(copy.count,2);mesh.setMatrixAt(1,new THREE.Matrix4().makeTranslation(12,3,-9));mesh.instanceMatrix.needsUpdate=true;map.update();assert.deepEqual(Array.from(copy.instanceMatrix.array),Array.from(mesh.instanceMatrix.array));map.dispose();
});

test('connected portal routes and road lines remain visible in the mirrored world',()=>{
 const root=new THREE.Group(),line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0),new THREE.Vector3(256,0,0)]),new THREE.LineBasicMaterial());root.add(line);root.position.set(10,0,20);const map=mirrorMapMeshes([root]);assert.equal(map.group.children.length,1);assert.equal(map.group.children[0].isLine,true);assert.deepEqual(map.group.children[0].matrix.elements,line.matrixWorld.elements);map.dispose();
});

test('map geometry preserves draw groups, morph targets, bounds and instancing without copying CPU buffers',()=>{
 const geometry=new THREE.InstancedBufferGeometry(),position=new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3),morph=new THREE.Float32BufferAttribute([0,0,1,1,0,1,0,1,1],3);geometry.setAttribute('position',position);geometry.setIndex([0,1,2]);geometry.morphAttributes.position=[morph];geometry.morphTargetsRelative=true;geometry.addGroup(0,3,0);geometry.setDrawRange(0,3);geometry.instanceCount=2;geometry.computeBoundingBox();geometry.computeBoundingSphere();const root=new THREE.Group(),mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());root.add(mesh);
 const map=mirrorMapMeshes([root]),copy=map.group.children[0].geometry;assert.equal(copy.isInstancedBufferGeometry,true);assert.equal(copy.instanceCount,2);assert.equal(copy.type,geometry.type);assert.equal(copy.attributes.position.array,position.array);assert.equal(copy.morphAttributes.position[0].array,morph.array);assert.equal(copy.morphTargetsRelative,true);assert.deepEqual(copy.groups,geometry.groups);assert.deepEqual(copy.drawRange,geometry.drawRange);assert.deepEqual(copy.boundingBox,geometry.boundingBox);assert.deepEqual(copy.boundingSphere,geometry.boundingSphere);map.dispose();
});

test('map shares owned wrappers across repeated geometry, material arrays and shader texture uniforms',()=>{
 const texture=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);texture.needsUpdate=true;const material=new THREE.MeshBasicMaterial({map:texture}),shader=new THREE.ShaderMaterial({uniforms:{diffuse:{value:texture},layers:{value:[texture]}}}),geometry=new THREE.BoxGeometry(),root=new THREE.Group();root.add(new THREE.Mesh(geometry,[material,shader]),new THREE.Mesh(geometry,material));
 const version=texture.source.version,map=mirrorMapMeshes([root]),[first,second]=map.group.children;assert.equal(first.geometry,second.geometry);assert.equal(first.material[0],second.material);assert.equal(first.material[0].map,first.material[1].uniforms.diffuse.value);assert.equal(first.material[0].map,first.material[1].uniforms.layers.value[0]);assert.notEqual(first.material[0].map,texture);assert.equal(first.material[0].map.image,texture.image);assert.equal(texture.source.version,version);map.dispose();assert.equal(texture.source.version,version);
});

test('live map wrappers follow changed source attributes, materials and texture images',()=>{
 const texture=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);texture.needsUpdate=true;const geometry=new THREE.BoxGeometry(),material=new THREE.MeshBasicMaterial({map:texture}),root=new THREE.Group();root.add(new THREE.Mesh(geometry,material));const map=mirrorMapMeshes([root]),copy=map.group.children[0];
 const position=new THREE.Float32BufferAttribute(geometry.attributes.position.array.slice(),3);geometry.setAttribute('position',position);material.color.set(0x83a7d0);material.needsUpdate=true;texture.image={data:new Uint8Array([50,100,150,255]),width:1,height:1};texture.needsUpdate=true;const version=texture.source.version;
 assert.equal(map.update(),true);assert.equal(copy.geometry.attributes.position,position);assert.equal(copy.material.color.getHex(),material.color.getHex());assert.equal(copy.material.map.image,texture.image);assert.equal(texture.source.version,version);assert.equal(map.update(),false,'unchanged resource versions do not force map rendering');map.dispose();
});

test('opening maps around a video texture does not start extra video frame loops',()=>{
 let callbacks=0;const video={requestVideoFrameCallback(){return ++callbacks;}},texture=new THREE.VideoTexture(video),root=new THREE.Group();root.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial({map:texture})));const baseline=callbacks;let disposed=0;texture.addEventListener('dispose',()=>disposed++);
 for(let index=0;index<12;index++){const map=mirrorMapMeshes([root]),copy=map.group.children[0].material.map;assert.equal(copy.isVideoTexture,true);assert.equal(copy.image,video);assert.equal(callbacks,baseline);map.dispose();}
 assert.equal(disposed,0);assert.equal(callbacks,baseline);
});

test('live shader uniforms retain renderer bindings while copying changed values',()=>{
 const material=new THREE.ShaderMaterial({uniforms:{amount:{value:.2},color:{value:new THREE.Color(0x123456)},points:{value:[new THREE.Vector3(1,2,3),4]},weights:{value:new Float32Array([1,2])}}}),root=new THREE.Group();root.add(new THREE.Mesh(new THREE.BoxGeometry(),material));const map=mirrorMapMeshes([root]),copy=map.group.children[0].material,uniforms=copy.uniforms,amount=uniforms.amount,points=uniforms.points.value,weights=uniforms.weights.value;
 assert.notEqual(uniforms.color.value,material.uniforms.color.value);material.uniforms.amount.value=.9;material.uniforms.color.value.set(0xabcdef);material.uniforms.points.value[0].x=5;material.uniforms.points.value[1]=8;material.uniforms.weights.value[0]=3;
 assert.equal(map.update(),true);assert.equal(copy.uniforms,uniforms);assert.equal(copy.uniforms.amount,amount);assert.equal(copy.uniforms.amount.value,.9);assert.equal(copy.uniforms.color.value.getHex(),0xabcdef);assert.equal(copy.uniforms.points.value,points);assert.equal(points[0].x,5);assert.equal(points[1],8);assert.equal(copy.uniforms.weights.value,weights);assert.deepEqual([...weights],[3,2]);assert.equal(map.update(),false);map.dispose();
});

test('live material colors and scalar properties update without a source shader version change',()=>{
 const material=new THREE.MeshPhysicalMaterial({color:0x223344,emissive:0x111111,emissiveIntensity:.2,opacity:.8,roughness:.4,metalness:.2,clearcoat:.2,transmission:.1,iridescence:.1}),root=new THREE.Group();root.add(new THREE.Mesh(new THREE.BoxGeometry(),material));const map=mirrorMapMeshes([root]),copy=map.group.children[0].material,version=material.version,copyVersion=copy.version,color=copy.color,normalScale=copy.normalScale;
 material.color.set(0x88aacc);material.emissive.set(0x446688);material.emissiveIntensity=.9;material.opacity=.3;material.roughness=.8;material.metalness=.6;material.normalScale.set(.4,.7);material.clearcoat=.7;material.transmission=.6;material.iridescence=.5;material.iridescenceThicknessRange[0]=120;material.depthWrite=false;
 assert.equal(material.version,version);assert.equal(map.update(),true);assert.equal(copy.version,copyVersion,'uniform/state changes retain the map shader version');assert.equal(copy.color,color);assert.equal(copy.normalScale,normalScale);
 for(const key of ['emissiveIntensity','opacity','roughness','metalness','clearcoat','transmission','iridescence','depthWrite'])assert.equal(copy[key],material[key],key);
 assert.equal(copy.color.getHex(),material.color.getHex());assert.equal(copy.emissive.getHex(),material.emissive.getHex());assert.deepEqual(copy.normalScale,material.normalScale);assert.deepEqual(copy.iridescenceThicknessRange,material.iridescenceThicknessRange);assert.notEqual(copy.iridescenceThicknessRange,material.iridescenceThicknessRange);assert.equal(map.update(),false);map.dispose();
});
