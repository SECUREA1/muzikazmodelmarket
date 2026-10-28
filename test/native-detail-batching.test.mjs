import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {batchNativeDesignDetails,NATIVE_DETAIL_BATCH_VERSION} from '../public/js/native-detail-batching.js';
import {placementMeshes} from '../public/js/placed-item-collision.js';
import {cloneBuilderRuntime} from '../public/js/builder-runtime-clone.js';

function detail(parent,name,material,x=0){
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(.3,.15,.07),material);mesh.name=name;mesh.position.x=x;mesh.userData={nativeDesignDetail:true,collisionDisabled:true,collider:false};mesh.castShadow=false;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function worldVertices(root){
 root.updateMatrixWorld(true);const points=[];root.traverse(mesh=>{if(!mesh.isMesh)return;const attribute=mesh.geometry.attributes.position;for(let index=0;index<attribute.count;index++){const point=new THREE.Vector3().fromBufferAttribute(attribute,index).applyMatrix4(mesh.matrixWorld);points.push(point.toArray().map(value=>Math.round(value*100000)).join(','));}});return points.sort();
}
function dispose(root){const resources=new Set();root.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of [].concat(node.material||[]))resources.add(material);});for(const resource of resources)resource.dispose();}

test('static sibling batching retains every transformed surface and source collider while reducing draw meshes',()=>{
 const root=new THREE.Group(),owner=new THREE.Group(),material=new THREE.MeshStandardMaterial({color:0x527d87}),body=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),material);root.add(body,owner);owner.position.set(2,3,-1);owner.rotation.set(.2,.7,-.3);owner.scale.set(1.2,.8,1.1);
 const sources=[detail(owner,'SEAM',material,-.4),detail(owner,'SEAM',material,.4),detail(owner,'FITTED_FASTENER',material,.8)];sources[0].rotation.z=.3;sources[1].position.y=.2;sources[2].scale.set(.7,2,1);
 const positions=worldVertices(root),physical=placementMeshes(root),originalGeometry=sources.map(node=>node.geometry);let sourceDisposed=0;for(const geometry of originalGeometry)geometry.addEventListener('dispose',()=>sourceDisposed++);
 try{
  assert.equal(batchNativeDesignDetails(THREE,root),root);assert.equal(owner.children.length,1);const batch=owner.children[0];assert.equal(batch.parent,owner);assert.equal(batch.material,material);assert.equal(batch.castShadow,false);assert.equal(batch.receiveShadow,true);assert.equal(batch.userData.collisionDisabled,true);assert.equal(batch.userData.collider,false);assert.equal(batch.userData.nativeDetailBatch,NATIVE_DETAIL_BATCH_VERSION);assert.equal(batch.userData.nativeDesignDetailCount,3);assert.deepEqual(batch.userData.nativeDetailSourceNames,['SEAM','SEAM','FITTED_FASTENER']);
  assert.deepEqual(worldVertices(root),positions);assert.deepEqual(placementMeshes(root),physical);assert.equal(root.children[0],body);assert.equal(sourceDisposed,0,'shared source geometries remain owned by their original users');assert.deepEqual(root.userData.nativeDetailBatching,{version:NATIVE_DETAIL_BATCH_VERSION,batches:1,detailsMerged:3,drawCallsSaved:2});
  const geometry=batch.geometry,stats={...root.userData.nativeDetailBatching};batchNativeDesignDetails(THREE,root);assert.equal(owner.children[0],batch);assert.equal(batch.geometry,geometry);assert.deepEqual(root.userData.nativeDetailBatching,stats,'a repeat pass adds no geometry or draw calls');
 }finally{dispose(root);for(const geometry of originalGeometry)geometry.dispose();}
});

test('batching respects live parent boundaries, materials, render layers and negative transforms',()=>{
 const root=new THREE.Group(),left=new THREE.Group(),right=new THREE.Group(),material=new THREE.MeshStandardMaterial(),other=new THREE.MeshStandardMaterial({color:0xff0022});root.add(left,right);left.position.x=-2;right.position.x=2;
 for(const owner of [left,right]){detail(owner,'BAND',material,-.2);detail(owner,'BAND',material,.2);}const alternate=detail(left,'OTHER_METAL',other),ordered=detail(left,'OVERLAY',material),reflected=detail(left,'REFLECTED',material);ordered.renderOrder=2;reflected.scale.x=-1;
 try{
  batchNativeDesignDetails(THREE,root);assert.equal(left.children.length,4);assert.equal(right.children.length,1);assert.equal(alternate.parent,left);assert.equal(ordered.parent,left);assert.equal(reflected.parent,left);const a=left.children.find(node=>node.userData.nativeDetailBatch),b=right.children[0];assert.ok(a&&b);assert.notEqual(a,b);assert.equal(a.parent,left);assert.equal(b.parent,right);
  root.updateMatrixWorld(true);const before=b.getWorldPosition(new THREE.Vector3());right.position.z+=3;root.updateMatrixWorld(true);assert.equal(b.getWorldPosition(new THREE.Vector3()).distanceTo(before),3,'decoration follows the original moving assembly');assert.equal(a.parent,left);
 }finally{dispose(root);}
});

test('media, animated state, rigs, vehicle inspection leaves and translucent details remain individually addressable',()=>{
 const root=new THREE.Group(),material=new THREE.MeshStandardMaterial(),transparent=new THREE.MeshStandardMaterial({transparent:true,opacity:.4}),retained=[];
 for(const [name,flags]of [['MEDIA',{mediaScreen:true}],['ANIMATED',{itemFlame:1}],['VEHICLE_HEADLAMP',{vehicleDesignDetail:true}],['PHYSICAL',{collisionDisabled:false}],['CUSTOM_STATE',{inspectionValue:3}]]){const node=detail(root,name,material);Object.assign(node.userData,flags);retained.push(node);}
 const rigLeaf=detail(root,'RIG_NEEDLE',material),callback=detail(root,'CALLBACK',material),glass=detail(root,'GLASS',transparent);callback.onBeforeRender=()=>{};root.userData.rig={nested:[rigLeaf]};retained.push(rigLeaf,callback,glass);
 const pair=[detail(root,'STATIC_BAND',material,-.4),detail(root,'STATIC_BAND',material,.4)];
 try{
  batchNativeDesignDetails(THREE,root);for(const node of retained){assert.equal(node.parent,root,node.name+' retains its exact node');assert.equal(root.getObjectByName(node.name),node);}assert.equal(root.userData.rig.nested[0],rigLeaf);assert.ok(pair.every(node=>node.parent===null));assert.equal(root.children.filter(node=>node.userData.nativeDetailBatch).length,1);
 }finally{dispose(root);for(const node of pair)node.geometry.dispose();}
});

test('batched native copies retain isolated editable materials and rebound ownership references',()=>{
 const root=new THREE.Group(),material=new THREE.MeshStandardMaterial({color:0x625b41});root.userData.nativeDesign={version:'test'};for(let index=0;index<4;index++){const node=detail(root,'SEAM',material,index*.3);node.userData.builderRoot=root;}batchNativeDesignDetails(THREE,root);const batch=root.children[0],copy=cloneBuilderRuntime(root),cloned=copy.children[0];
 try{assert.equal(cloned.userData.builderRoot,copy);assert.notEqual(cloned.material,batch.material);assert.equal(cloned.geometry,batch.geometry);assert.deepEqual(worldVertices(copy),worldVertices(root));const before=batch.material.color.getHex();cloned.material.color.setHex(0xff0011);assert.equal(batch.material.color.getHex(),before);assert.deepEqual(cloned.userData.nativeDetailSourceNames,batch.userData.nativeDetailSourceNames);}finally{dispose(root);dispose(copy);}
});
