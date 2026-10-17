import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {applyWorldQuality} from '../public/js/environments/environment-quality.js';

test('shared textures upload once per world while every mesh retains lighting and shadow settings',()=>{
 const root=new THREE.Group(),texture=new THREE.Texture();
 const material=new THREE.MeshStandardMaterial({map:texture,roughnessMap:texture});
 const alternate=new THREE.MeshStandardMaterial({map:texture,transparent:true});
 for(let i=0;i<100;i++){const mesh=new THREE.Mesh(new THREE.BoxGeometry(),i%2?material:[material,alternate]);mesh.name=i===0?'floor':'wall';root.add(mesh);}
 root.add(new THREE.DirectionalLight());const before=texture.version;
 const result=applyWorldQuality(root,{capabilities:{getMaxAnisotropy:()=>16}});
 assert.equal(texture.version-before,1,'mesh and material reuse must not repeatedly dirty the same texture');
 assert.equal(texture.anisotropy,8);assert.equal(result.embeddedLights,1);
 for(const mesh of root.children.filter(n=>n.isMesh)){assert.equal(mesh.receiveShadow,true);assert.equal(mesh.frustumCulled,true);assert.equal(mesh.castShadow,mesh.name!=='floor');}
 assert.equal(alternate.depthWrite,false);
 root.traverse(n=>n.geometry?.dispose());material.dispose();alternate.dispose();texture.dispose();
});

test('texture filtering respects the device limit and distinct textures remain independent',()=>{
 const root=new THREE.Group(),a=new THREE.Texture(),b=new THREE.Texture();
 const material=new THREE.MeshBasicMaterial({map:a,alphaMap:b});root.add(new THREE.Mesh(new THREE.BoxGeometry(),material));
 applyWorldQuality(root,{capabilities:{getMaxAnisotropy:()=>2}});
 assert.equal(a.anisotropy,2);assert.equal(b.anisotropy,2);assert.equal(a.version,1);assert.equal(b.version,1);
 root.children[0].geometry.dispose();material.dispose();a.dispose();b.dispose();
});
