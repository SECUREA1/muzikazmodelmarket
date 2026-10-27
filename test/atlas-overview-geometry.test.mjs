import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createAtlasOverviewGeometry} from '../public/js/atlas-overview-geometry.js';

const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-5,`${actual} != ${expected}`);
function dispose(group){group.traverse(object=>{object.geometry?.dispose();object.material?.dispose();});}
function triangle(){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,2,0,0,0,1,0],3));geometry.setIndex([0,1,2]);geometry.computeVertexNormals();return geometry;}

test('overview merges real transformed geometry and preserves bounds without retaining source resources',()=>{
 const parent=new THREE.Group(),root=new THREE.Group();parent.position.set(9,3,-5);root.rotation.y=.7;root.scale.set(2,3,4);parent.add(root);
 const sourceGeometry=new THREE.BoxGeometry(2,4,6),texture=new THREE.Texture(),sourceMaterial=new THREE.MeshStandardMaterial({color:0x79adcc,map:texture});
 for(let index=0;index<12;index++){const mesh=new THREE.Mesh(sourceGeometry,sourceMaterial);mesh.position.set(index*3,index%3,1);root.add(mesh);}
 root.updateWorldMatrix(true,true);const bounds=new THREE.Box3().setFromObject(root),overview=createAtlasOverviewGeometry(root),copy=overview.children[0];
 assert.equal(overview.children.length,1);assert.equal(overview.userData.triangleCount,12*12);
 const bakedBounds=new THREE.Box3().setFromObject(overview);for(const axis of ['x','y','z']){close(bakedBounds.min[axis],bounds.min[axis]);close(bakedBounds.max[axis],bounds.max[axis]);}
 assert.notEqual(copy.geometry,sourceGeometry);assert.notEqual(copy.material,sourceMaterial);assert.equal(copy.material.map,null);assert.equal(copy.geometry.getAttribute('uv'),undefined);
 let disposed=0;for(const resource of [sourceGeometry,sourceMaterial,texture])resource.addEventListener('dispose',()=>disposed++);dispose(overview);assert.equal(disposed,0);assert.equal(root.children.length,12);
});

test('draw ranges, material groups, transparency and vertex colors retain only rendered triangles',()=>{
 const root=new THREE.Group(),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0,4,0,0,5,0,0,4,1,0,8,0,0,9,0,0,8,1,0],3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(Array.from({length:9},()=>[.5,.25,1,.8]).flat(),4));geometry.setIndex([0,1,2,3,4,5,6,7,8]);geometry.addGroup(0,3,0);geometry.addGroup(3,3,1);geometry.addGroup(6,3,2);geometry.setDrawRange(3,6);
 const hidden=new THREE.MeshBasicMaterial({visible:false}),glass=new THREE.MeshBasicMaterial({color:new THREE.Color(.4,.8,.2),vertexColors:true,transparent:true,opacity:.5,side:THREE.DoubleSide});
 root.add(new THREE.Mesh(geometry,[new THREE.MeshBasicMaterial(),glass,hidden]));const invisible=new THREE.Group();invisible.visible=false;invisible.add(new THREE.Mesh(new THREE.BoxGeometry(100,100,100),glass));root.add(invisible);
 const overview=createAtlasOverviewGeometry(root),copy=overview.children[0],color=copy.geometry.attributes.color;
 assert.equal(overview.children.length,1);assert.equal(overview.userData.triangleCount,1);assert.equal(copy.geometry.attributes.position.count,3);assert.equal(copy.geometry.boundingBox.min.x,4);assert.equal(copy.geometry.boundingBox.max.x,5);assert.equal(copy.material.side,THREE.DoubleSide);assert.equal(copy.material.transparent,true);
 close(color.getX(0),.2);close(color.getY(0),.2);close(color.getZ(0),.2);close(color.getW(0),.4);dispose(overview);
});

test('instances preserve individual transforms, tint and front faces after a mirrored transform',()=>{
 const root=new THREE.Group(),geometry=triangle(),material=new THREE.MeshBasicMaterial({color:0xffffff}),mesh=new THREE.InstancedMesh(geometry,material,2);
 mesh.position.set(4,2,-3);mesh.setMatrixAt(0,new THREE.Matrix4().makeScale(-2,3,1));mesh.setMatrixAt(1,new THREE.Matrix4().makeTranslation(10,0,7));mesh.setColorAt(0,new THREE.Color(1,.2,.3));mesh.setColorAt(1,new THREE.Color(.1,.8,1));root.add(mesh);
 const overview=createAtlasOverviewGeometry(root),copy=overview.children[0],positions=copy.geometry.attributes.position,indices=copy.geometry.index,colors=copy.geometry.attributes.color;
 assert.equal(overview.children.length,1);assert.equal(overview.userData.triangleCount,2);assert.equal(positions.count,6);
 assert.deepEqual([positions.getX(0),positions.getY(0),positions.getZ(0)],[4,2,-3]);assert.deepEqual([positions.getX(3),positions.getY(3),positions.getZ(3)],[14,2,4]);close(colors.getY(0),.2);close(colors.getX(3),.1);
 const points=[0,1,2].map(index=>new THREE.Vector3().fromBufferAttribute(positions,indices.getX(index)));assert.ok(new THREE.Vector3().crossVectors(points[1].sub(points[0]),points[2].sub(points[0])).z>0,'mirrored front face remains visible');assert.equal(mesh.count,2);dispose(overview);
});

test('current morph shape is baked without retaining animation state',()=>{
 const root=new THREE.Group(),geometry=triangle();geometry.morphAttributes.position=[new THREE.Float32BufferAttribute([0,0,2,2,0,2,0,1,2],3)];const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());mesh.morphTargetInfluences[0]=.5;root.add(mesh);
 const overview=createAtlasOverviewGeometry(root),copy=overview.children[0];for(let index=0;index<3;index++)close(copy.geometry.attributes.position.getZ(index),1);assert.equal(copy.geometry.morphAttributes.position,undefined);assert.equal(copy.geometry.attributes.normal.getZ(0),1);dispose(overview);
});
