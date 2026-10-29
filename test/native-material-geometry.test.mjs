import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as T from '../public/vendor/three/three.module.min.js';
import {BUILDING_MATERIALS,createBuildingBlock} from '../public/js/building-materials.js';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
import {finishNativeDesign} from '../public/js/native-design-system.js';
import {NATIVE_DESIGN_VERSION} from '../public/js/native-design-profile.js';

function materialMeshes(root){const meshes=[];root.traverse(node=>{if(node.isMesh&&!node.userData.nativeDesignDetail)meshes.push(node);});return meshes;}
function geometrySignature(root){
 return materialMeshes(root).map(node=>{
  const geometry=node.geometry,hash=createHash('sha256');
  // Surface finishing may supply missing texture coordinates. Every other
  // authored attribute and index still describes the unchanged physical shape.
  for(const [name,attribute]of Object.entries(geometry.attributes).filter(([name])=>name!=='uv').sort(([a],[b])=>a.localeCompare(b))){hash.update(name);hash.update(Buffer.from(attribute.array.buffer,attribute.array.byteOffset,attribute.array.byteLength));}
  if(geometry.index)hash.update(Buffer.from(geometry.index.array.buffer,geometry.index.array.byteOffset,geometry.index.array.byteLength));
  return {type:geometry.type,signature:hash.digest('hex')};
 });
}
function assertSurfaceCoordinates(raw,native,id){
 const authored=materialMeshes(raw),finished=materialMeshes(native);
 for(const [index,mesh]of authored.entries()){
  const before=mesh.geometry.getAttribute('uv'),after=finished[index].geometry.getAttribute('uv');
  if(before){
   assert.ok(after,id+' retains authored texture coordinates');
   assert.equal(after.itemSize,before.itemSize);assert.equal(after.normalized,before.normalized);
   assert.deepEqual(Array.from(after.array),Array.from(before.array),id+' does not rewrite authored texture coordinates');
  }else if(after){
   assert.equal(after.itemSize,2);assert.equal(after.count,mesh.geometry.getAttribute('position').count);
   assert.ok(after.array.every(Number.isFinite),id+' added texture coordinates stay finite');
  }
 }
}
function dispose(...roots){
 const resources=new Set();for(const root of roots)root.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of [].concat(node.material||[])){resources.add(material);for(const value of Object.values(material))if(value?.isTexture)resources.add(value);}});for(const value of resources)value.dispose();
}
test('every crafted construction material retains its original flat faces, stair treads and shape geometry',()=>{
 for(const definition of BUILDING_MATERIALS){
  const raw=createBuildingBlock(T,definition.id),native=createBuilderModel('material:'+definition.id);
  try{
   assert.ok(native,definition.id);
   assert.deepEqual(geometrySignature(native),geometrySignature(raw),definition.id+' surface finish preserves authored physical geometry');
   assertSurfaceCoordinates(raw,native,definition.id);
   let finished=false;native.traverse(node=>{for(const material of [].concat(node.material||[]))if(material.userData.nativeSurfaceVersion===NATIVE_DESIGN_VERSION&&material.map)finished=true;});
   assert.ok(finished,definition.id+' still receives real crafted surface rendering');
  }finally{dispose(raw,native);}
 }
});
test('construction pieces retain their physical surfaces when a larger native assembly is finished',()=>{
 const compound=new T.Group();
 for(const id of ['paving-tile','floor','stage-platform','stage-steps'])compound.add(createBuilderModel('material:'+id));
 try{
  const before=geometrySignature(compound);
  finishNativeDesign(T,compound,'scene-market-square');
  assert.deepEqual(geometrySignature(compound),before,'finishing the outer scene does not chamfer nested construction support faces');
 }finally{dispose(compound);}
});
