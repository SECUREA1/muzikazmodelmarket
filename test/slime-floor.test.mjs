import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createSlimeFloor} from '../public/js/environments/slime-floor.js';

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
test('invisible collider meshes and unsupported materials keep their original materials',()=>{
 const hidden=new THREE.Mesh(new THREE.PlaneGeometry(),new THREE.MeshStandardMaterial());hidden.visible=false;
 const unlit=new THREE.Mesh(hidden.geometry,new THREE.MeshBasicMaterial());
 const hiddenMaterial=hidden.material,unlitMaterial=unlit.material,effect=createSlimeFloor([hidden,unlit]);
 assert.equal(effect.meshCount,0);assert.equal(hidden.material,hiddenMaterial);assert.equal(unlit.material,unlitMaterial);
 effect.dispose();hidden.geometry.dispose();hiddenMaterial.dispose();unlitMaterial.dispose();
});
