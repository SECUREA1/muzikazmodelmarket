import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createSlimeFloor,collectSlimeFloorMeshes} from '../public/js/environments/slime-floor.js';

test('slime reuses floor geometry and materials without changing its mesh collider',()=>{
 const geometry=new THREE.PlaneGeometry(4,4),material=new THREE.MeshStandardMaterial(),root=new THREE.Group();
 const a=new THREE.Mesh(geometry,material),b=new THREE.Mesh(geometry,material);a.userData.colliderShape='mesh';root.add(a,b);
 const floor=createSlimeFloor([a,a,b]);
 assert.equal(floor.meshCount,2);assert.equal(a.geometry,geometry);assert.equal(a.material,b.material);assert.notEqual(a.material,material);
 assert.equal(a.userData.colliderShape,'mesh');assert.equal(root.children.length,2);assert.equal(geometry.attributes.position.version,0);
 floor.dispose();assert.equal(a.material,material);assert.equal(b.material,material);
 floor.dispose();geometry.dispose();material.dispose();
});
test('floor shader shares one clock, freezes reduced motion, preserves textures and releases clones',()=>{
 const texture=new THREE.Texture(),original=new THREE.MeshStandardMaterial({map:texture}),mesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2),original);
 const effect=createSlimeFloor([mesh]),material=mesh.material;
 const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
 material.onBeforeCompile(shader,{});
 assert.ok(shader.vertexShader.includes('vSlimeWorldNormal = inverseTransformDirection'));
 assert.ok(shader.fragmentShader.includes('slimeRing'));assert.ok(shader.fragmentShader.includes('roughnessFactor = mix'));
 effect.update(5);assert.equal(shader.uniforms.slimeTime.value,5);effect.update(8,true);assert.equal(shader.uniforms.slimeTime.value,0);
 let texturesDisposed=0,clonesDisposed=0;texture.addEventListener('dispose',()=>texturesDisposed++);material.addEventListener('dispose',()=>clonesDisposed++);
 effect.dispose();assert.equal(clonesDisposed,1);assert.equal(texturesDisposed,0);assert.equal(mesh.material,original);
 mesh.geometry.dispose();original.dispose();texture.dispose();
});
test('invisible colliders stay hidden while image-backed unlit floors receive slime',()=>{
 const hidden=new THREE.Mesh(new THREE.PlaneGeometry(),new THREE.MeshStandardMaterial());hidden.visible=false;
 const unlit=new THREE.Mesh(hidden.geometry,new THREE.MeshBasicMaterial());
 const hiddenMaterial=hidden.material,unlitMaterial=unlit.material,effect=createSlimeFloor([hidden,unlit]);
 assert.equal(effect.meshCount,1);assert.equal(hidden.material,hiddenMaterial);assert.notEqual(unlit.material,unlitMaterial);assert.equal(unlit.material.isMeshStandardMaterial,true);
 effect.dispose();hidden.geometry.dispose();hiddenMaterial.dispose();unlitMaterial.dispose();
});

test('all maps discover terrain and merged GLB floors by geometry, keeping wall faces and hidden helpers out',()=>{
 const root=new THREE.Group(),floorGeometry=new THREE.PlaneGeometry(12,12),material=new THREE.MeshBasicMaterial();
 const floor=new THREE.Mesh(floorGeometry,material);floor.rotation.x=-Math.PI/2;floor.name='wall_room_merged';
 const terrain=new THREE.Mesh(floorGeometry,material);terrain.rotation.x=-Math.PI/2;terrain.userData.colliderShape='mesh';terrain.name='BUILDER_WALKABLE_FLOOR';
 const wall=new THREE.Mesh(floorGeometry,material);wall.name='wall';
 const invisibleParent=new THREE.Group();invisibleParent.visible=false;const hidden=floor.clone();invisibleParent.add(hidden);
 const helper=floor.clone();helper.name='COLLIDER_FLOOR';
 root.add(floor,terrain,wall,invisibleParent,helper);
 assert.deepEqual(collectSlimeFloorMeshes(root),[floor,terrain]);
 const ray=new THREE.Raycaster(new THREE.Vector3(0,2,0),new THREE.Vector3(0,-1,0));
 const before=ray.intersectObject(floor)[0].distance;
 const effect=createSlimeFloor(collectSlimeFloorMeshes(root));
 assert.equal(ray.intersectObject(floor)[0].distance,before,'slime coverage shares the original physical surface');
 effect.dispose();floorGeometry.dispose();material.dispose();
});
test('newly loaded roads and double-sided imported floors are discovered on refresh',()=>{
 const root=new THREE.Group(),material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(10,10),material);floor.rotation.x=Math.PI/2;root.add(floor);
 assert.ok(collectSlimeFloorMeshes(root).includes(floor),'reversed imported floor normals still receive coating');
 const road=new THREE.Mesh(new THREE.BoxGeometry(3,.04,10),material);road.name='';root.add(road);
 const effect=createSlimeFloor(collectSlimeFloorMeshes(root));assert.equal(effect.meshCount,2);
 effect.dispose();floor.geometry.dispose();road.geometry.dispose();material.dispose();
});
