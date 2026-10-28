import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {applyWorldQuality} from '../public/js/environments/environment-quality.js';

test('shared textures prepare once while every mesh retains lighting and shadow settings',()=>{
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

test('unchanged cached surfaces survive repeated worlds without forcing another GPU upload',()=>{
 const texture=new THREE.Texture();texture.userData.nativeSurfaceShared=true;
 const geometry=new THREE.BoxGeometry(),firstMaterial=new THREE.MeshStandardMaterial({map:texture}),secondMaterial=new THREE.MeshStandardMaterial({roughnessMap:texture}),first=new THREE.Group(),second=new THREE.Group(),renderer={capabilities:{getMaxAnisotropy:()=>8}};
 first.add(new THREE.Mesh(geometry,firstMaterial));second.add(new THREE.Mesh(geometry,secondMaterial));
 applyWorldQuality(first,renderer);const version=texture.version;
 for(let i=0;i<12;i++)applyWorldQuality(i%2?first:second,renderer);
 assert.equal(texture.version,version,'moving an immutable surface between worlds does not invalidate its existing GPU pixels');
 applyWorldQuality(second,{capabilities:{getMaxAnisotropy:()=>2}});assert.equal(texture.anisotropy,2);assert.equal(texture.version,version+1,'a real filtering change still uploads');
 applyWorldQuality(first,{capabilities:{getMaxAnisotropy:()=>2}});assert.equal(texture.version,version+1);
 geometry.dispose();firstMaterial.dispose();secondMaterial.dispose();texture.dispose();
});

test('quality preserves cosmetic shadow opt-outs through groups and keeps ordinary authored shadows',()=>{
 const root=new THREE.Group(),details=new THREE.Group(),geometry=new THREE.BoxGeometry(),material=new THREE.MeshStandardMaterial();details.userData.collisionDisabled=true;
 const inherited=new THREE.Mesh(geometry,material),marked=new THREE.Mesh(geometry,material),authored=new THREE.Mesh(geometry,material),wall=new THREE.Mesh(geometry,material);
 marked.userData.nativeDesignDetail=true;authored.userData.collisionDisabled=true;authored.castShadow=true;details.add(inherited);root.add(details,marked,authored,wall);
 applyWorldQuality(root,{capabilities:{getMaxAnisotropy:()=>1}});
 assert.equal(inherited.castShadow,false);assert.equal(marked.castShadow,false);assert.equal(authored.castShadow,true);assert.equal(wall.castShadow,true);
 for(const mesh of [inherited,marked,authored,wall])assert.equal(mesh.receiveShadow,true);
 geometry.dispose();material.dispose();
});

test('texture filtering respects the device limit and distinct textures remain independent',()=>{
 const root=new THREE.Group(),a=new THREE.Texture(),b=new THREE.Texture();
 const material=new THREE.MeshBasicMaterial({map:a,alphaMap:b});root.add(new THREE.Mesh(new THREE.BoxGeometry(),material));
 applyWorldQuality(root,{capabilities:{getMaxAnisotropy:()=>2}});
 assert.equal(a.anisotropy,2);assert.equal(b.anisotropy,2);assert.equal(a.version,1);assert.equal(b.version,1);
 root.children[0].geometry.dispose();material.dispose();a.dispose();b.dispose();
});

test('animated skin vertices remain eligible for rendering after leaving their original bounds',()=>{
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute([99,-1,0,101,-1,0,100,1,0],3));
 geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute([0,0,0,0,0,0,0,0,0,0,0,0],4));
 geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0],4));
 const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshBasicMaterial()),bone=new THREE.Bone();
 mesh.add(bone);mesh.bind(new THREE.Skeleton([bone]));mesh.computeBoundingSphere();
 const root=new THREE.Group();root.add(mesh);applyWorldQuality(root,{capabilities:{getMaxAnisotropy:()=>1}});
 bone.position.x=-100;root.updateMatrixWorld(true);mesh.skeleton.update();
 const camera=new THREE.PerspectiveCamera(60,1,.1,1000);camera.position.z=5;camera.updateMatrixWorld();
 const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
 assert.equal(frustum.containsPoint(mesh.getVertexPosition(2,new THREE.Vector3())),true,'the animated character moved into the camera view');
 assert.equal(frustum.intersectsObject(mesh),false,'the bind-pose sphere remains outside the view');
 assert.equal(!mesh.frustumCulled||frustum.intersectsObject(mesh),true,'the visible animated character must reach the renderer');
 mesh.skeleton.dispose();geometry.dispose();mesh.material.dispose();
});

test('quality updates preserve authored dynamic-instance culling flags while static meshes keep culling',()=>{
 const geometry=new THREE.BoxGeometry(),material=new THREE.MeshBasicMaterial();
 const particles=new THREE.InstancedMesh(geometry,material,2),staticMesh=new THREE.Mesh(geometry,material);
 particles.frustumCulled=false;
 const root=new THREE.Group();root.add(particles,staticMesh);
 applyWorldQuality(root,{capabilities:{getMaxAnisotropy:()=>1}});
 assert.equal(particles.frustumCulled,false,'dynamic effects deliberately opt out of bounds-based culling');
 assert.equal(staticMesh.frustumCulled,true,'static world geometry still benefits from frustum culling');
 particles.dispose();geometry.dispose();material.dispose();
});
