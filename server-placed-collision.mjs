import {isBasketball} from './public/js/basketball.js';
import {createSolidPaint} from './public/js/solid-paint.js';
import * as THREE from './public/vendor/three/three.module.min.js';
import {createBuildingBlock,buildingMaterial} from './public/js/building-materials.js';
import {createBuilderModel} from './public/js/builder-models-3d.js';
import {drawingCollisionModel} from './public/js/placed-item-collision.js';
import {environmentGeometry} from './server-glb-geometry.mjs';
export function placedCollisionWorld(actors={},objects={}){
 const root=new THREE.Group(),boxes=[],meshes=[];
 const add=(model,position,rotation,scale,anchor=false,id)=>{
  if(!model)return;const wrapper=new THREE.Group();wrapper.userData.builderObjectId=id;
  if(anchor){model.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(model);if(!bounds.isEmpty())model.position.y-=bounds.min.y;}
  wrapper.add(model);wrapper.position.set(position.x||0,position.y||0,position.z||0);wrapper.rotation.set(rotation?.x||0,rotation?.y||0,rotation?.z||0);wrapper.scale.set(scale?.x||1,scale?.y||1,scale?.z||1);root.add(wrapper);wrapper.updateMatrixWorld(true);
  wrapper.traverse(mesh=>{if(!mesh.isMesh||mesh.userData.collisionDisabled||mesh.userData.brickPaintPart==='stud')return;const box=new THREE.Box3().setFromObject(mesh);box.objectId=id;boxes.push(box);meshes.push(mesh);});
 };
 for(const object of Object.values(objects)){
  if(object.deleted||object.open||buildingMaterial(object.materialId).solid===false)continue;
  const vector=value=>Object.fromEntries(['x','y','z'].map((axis,index)=>[axis,value?.[index]||0]));
  add(createBuildingBlock(THREE,object.materialId),vector(object.position),vector(object.rotation),vector(object.scale),false,object.id);
 }
 for(const actor of Object.values(actors)){
  if(!actor.spawned||actor.active===false||actor.holderId||actor.loot||isBasketball(actor))continue;
  const asset=actor.asset||{},settings=asset.configuration||{};let model;
  if(asset.renderKind==='paint-stroke')model=createSolidPaint(THREE,asset);
  else if(asset.buildAssetId)model=createBuilderModel(asset.buildAssetId);
  else if(asset.renderKind==='image'||asset.format==='svg')model=drawingCollisionModel(THREE,settings);
  else if(asset.modelUrl){try{model=environmentGeometry({modelUrl:asset.modelUrl});const size=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()),target=Number(asset.targetHeight)||size.y;if(size.y>0)model.scale.multiplyScalar(target/size.y);}catch{model=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial());}}
  if(model){model.scale.multiplyScalar(Number(settings.scale)||1);add(model,actor.position,actor.rotation,actor.scale,true,actor.id);}
 }
 return {root,boxes,meshes};
}
export function disposePlacedCollision(world){world?.root.traverse(mesh=>{mesh.geometry?.dispose();mesh.material?.dispose();});}
