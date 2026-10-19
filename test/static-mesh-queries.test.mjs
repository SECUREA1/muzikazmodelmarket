import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {accelerateStaticMesh,MeshContactQueries,meshWorldBounds} from '../public/js/static-mesh-queries.js';

function comparable(hits) {
  return hits.map(hit=>({distance:hit.distance,point:hit.point.toArray(),faceIndex:hit.faceIndex,materialIndex:hit.face.materialIndex,
    normal:hit.face.normal.toArray(),uv:hit.uv?.toArray(),vertexNormal:hit.normal?.toArray()})).sort((a,b)=>a.distance-b.distance||a.faceIndex-b.faceIndex||a.materialIndex-b.materialIndex);
}

test('accelerated floor and wall rays match native faces, UVs, side culling and draw ranges under transformed parents',()=>{
  for(const indexed of [true,false])for(const side of [THREE.FrontSide,THREE.BackSide,THREE.DoubleSide]) {
    let geometry=new THREE.BoxGeometry(12,8,9,12,10,11);if(!indexed)geometry=geometry.toNonIndexed();
    const materials=Array.from({length:6},()=>new THREE.MeshBasicMaterial({side}));
    const parent=new THREE.Group(),mesh=new THREE.Mesh(geometry,materials);parent.add(mesh);
    parent.position.set(5,-2,3);parent.rotation.set(.1,.7,.2);parent.scale.set(1.2,.8,1.7);mesh.rotation.z=.15;parent.updateMatrixWorld(true);
    geometry.setDrawRange(12,(geometry.index?.count??geometry.attributes.position.count)-27);
    const rays=Array.from({length:28},(_,i)=>new THREE.Raycaster(new THREE.Vector3((i%7-3)*4+5,18,Math.floor(i/7)*4-4),new THREE.Vector3(0,-1,0),i%3,50));
    const native=rays.map(ray=>comparable(ray.intersectObject(mesh,false)));
    assert.equal(accelerateStaticMesh(mesh),true);
    rays.forEach((ray,index)=>{const hits=ray.intersectObject(mesh,false);assert.ok(hits.every(hit=>hit.object===mesh));assert.deepEqual(comparable(hits),native[index]);});
    geometry.dispose();materials.forEach(material=>material.dispose());
  }
});

test('moving meshes retain current transforms and edited vertex buffers rebuild their tree and broad-phase bounds',()=>{
  const geometry=new THREE.PlaneGeometry(20,20,24,24).rotateX(-Math.PI/2),material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),mesh=new THREE.Mesh(geometry,material);
  mesh.updateMatrixWorld(true);assert.equal(accelerateStaticMesh(mesh),true);
  const ray=new THREE.Raycaster(new THREE.Vector3(0,20,0),new THREE.Vector3(0,-1,0));
  assert.equal(ray.intersectObject(mesh,false)[0].point.y,0);
  mesh.position.set(0,3,0);mesh.updateMatrixWorld(true);assert.equal(ray.intersectObject(mesh,false)[0].point.y,3);
  const position=geometry.attributes.position;for(let i=0;i<position.count;i++)position.setXYZ(i,position.getX(i)+100,position.getY(i)+7,position.getZ(i));position.needsUpdate=true;
  ray.ray.origin.x=100;assert.equal(ray.intersectObject(mesh,false)[0].point.y,10);assert.equal(meshWorldBounds(mesh).max.y,10);
  const replacement=new THREE.PlaneGeometry(10,10,20,20).rotateX(-Math.PI/2);mesh.geometry=replacement;
  ray.ray.origin.x=0;assert.equal(ray.intersectObject(mesh,false)[0].point.y,3);
  geometry.dispose();replacement.dispose();material.dispose();
});

test('animated and instanced geometry keeps its native deformation-aware raycast',()=>{
  const geometry=new THREE.SphereGeometry(1,24,20),material=new THREE.MeshBasicMaterial();
  const skin=new THREE.SkinnedMesh(geometry,material),instance=new THREE.InstancedMesh(geometry,material,1),morph=new THREE.Mesh(geometry.clone(),material);
  morph.geometry.morphAttributes.position=[geometry.attributes.position.clone()];
  for(const mesh of [skin,instance,morph]) {const original=mesh.raycast;assert.equal(accelerateStaticMesh(mesh),false);assert.equal(mesh.raycast,original);}
  geometry.dispose();morph.geometry.dispose();material.dispose();
});

test('bounded flame contact distinguishes closed solids from room surfaces and preserves both-sided nearest hits',()=>{
  const geometry=new THREE.BoxGeometry(10,6,10,14,12,14),material=new THREE.MeshBasicMaterial(),mesh=new THREE.Mesh(geometry,material),queries=new MeshContactQueries();
  mesh.position.set(2,3,-4);mesh.rotation.y=.43;mesh.scale.set(1.2,.7,1.8);mesh.updateMatrixWorld(true);
  const center=mesh.localToWorld(new THREE.Vector3()),surface=mesh.localToWorld(new THREE.Vector3(5,0,0)),outside=mesh.localToWorld(new THREE.Vector3(5.5,0,0));
  assert.equal(queries.touching(mesh,center,.1,false),true);assert.equal(queries.touching(mesh,center,.1,true),false);
  assert.equal(queries.touching(mesh,surface,.1,true),true);assert.equal(queries.touching(mesh,outside,.1,false),false);
  const direction=surface.clone().sub(center).normalize(),insideHit=queries.segment(mesh,center,direction,20);
  assert.ok(insideHit.point.distanceTo(surface)<1e-7,'a flame from inside hits the real far wall');
  const outsideHit=queries.segment(mesh,outside,direction.clone().negate(),20);assert.ok(outsideHit.point.distanceTo(surface)<1e-7);
  assert.equal(queries.segment(mesh,outside,direction.clone().negate(),.1),null);
  geometry.dispose();material.dispose();
});
