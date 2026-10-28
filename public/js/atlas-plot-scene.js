import {disposeModelResources} from './game-graphics-resources.js';
import * as THREE from '../vendor/three/three.module.min.js';
import {EnvironmentLoader} from './environments/environment-loader.js';
import {createBuilderModel,createGeneratedAsset} from './builder-models-3d.js';
import {createSavedCustomModel,prepareAuthoredBuilderModel} from './authored-builder-models.js';
import {createBuildingBlock,toggleBuildingObject} from './building-materials.js';
import {placementBounds} from './placed-item-collision.js';
import {createSolidPaint} from './solid-paint.js';
import {prepareGameItems} from './game-load-work.js';
import {isWatercraft} from './harbor-water.js';
export function disposeAtlasObject(root){disposeModelResources(root);root?.clear();}
const xyz=(value,fallback=0)=>Array.isArray(value)?value:[value?.x??fallback,value?.y??fallback,value?.z??fallback];
export async function loadAtlasPlotScene(environment,snapshot,renderer,{current=()=>true}={}){
 const scene=new THREE.Scene(),loader=new EnvironmentLoader({scene,renderer,serverAuthoritative:()=>true}),root=new THREE.Group(),decor=new THREE.Group(),missing=[];
 try{await loader.load(environment);loader.clearFloorEffects();root.add(loader.world,decor);const center=loader.bounds.getCenter(new THREE.Vector3()),floor=loader.bounds.min.y,customModels=new Map((environment.builderScene?.customModels||[]).map(model=>[model.id,model])),definitions=new Map([...(environment.builderScene?.catalogModels||[]),...(environment.builderScene?.placedModels||[])].map(model=>[model.id,model])),sources=new Map((environment.builderScene?.objects||environment.placementScene?.objects||[]).map(item=>[item.id,item]));
  for(const actor of Object.values(snapshot?.actors||{}))sources.set(actor.id,{...sources.get(actor.id),...actor,live:true});
  const place=(object,item)=>{const position=xyz(item.position),rotation=xyz(item.rotation),scale=xyz(item.scale,1);object.userData.atlasItemId=item.id;object.userData.atlasTaggable=!item.modelId?.startsWith('material:');object.userData.atlasItemName=item.name||item.modelId||'Placed item';object.position.set(position[0]||0,position[1]||0,position[2]||0);object.rotation.set(...rotation);object.scale.multiply(new THREE.Vector3(...scale));
   if(item.live&&!['waterline','aircraft-origin'].includes(item.placementAnchor)&&!isWatercraft(item)&&!['corsair-aircraft','diamond-da40','piper-cub'].includes(item.modelId)){object.updateWorldMatrix(true,true);const bounds=placementBounds(THREE,object);if(!bounds.isEmpty())object.position.y+=(position[1]||0)-bounds.min.y;}
   if(!item.live){object.position.x+=center.x;object.position.z+=center.z;const pinned=['collider-base','waterline','aircraft-origin'].includes(item.placementAnchor);if(!pinned){const ray=new THREE.Raycaster(new THREE.Vector3(object.position.x,(position[1]||floor)+2,object.position.z),new THREE.Vector3(0,-1,0),0,10000);const hit=ray.intersectObjects(loader.floorMeshes,false)[0];object.position.y=(hit?.point.y??floor)+(item.groundOffset||0);}object.updateWorldMatrix(true,true);if(!['waterline','aircraft-origin'].includes(item.placementAnchor)){const bounds=placementBounds(THREE,object);if(!bounds.isEmpty())object.position.y-=bounds.min.y-(pinned?(position[1]||0):object.position.y);}}
   object.userData.atlasServerOffset={x:object.position.x-(position[0]||0),y:object.position.y-(position[1]||0),z:object.position.z-(position[2]||0)};decor.add(object);};
  const prepared=await prepareGameItems([...sources.values()],async item=>{
   if(item.active===false||item.deleted||item.loot||item.holderId&&!isWatercraft(item)&&!['corsair-aircraft','diamond-da40','piper-cub'].includes(item.modelId))return;
   const definition=definitions.get(item.modelId),asset=item.asset||{},modelId=asset.buildAssetId||definition?.buildAssetId||item.modelId;
   // Gameplay-only actors, such as range targets, may have no item model.
   let object=customModels.has(item.modelId)?createSavedCustomModel(customModels.get(item.modelId)):modelId?createBuilderModel(modelId):null;
   if(!object&&definition?.generated)object=createGeneratedAsset(definition);
   if(!object&&asset.renderKind==='paint-stroke')object=createSolidPaint(THREE,asset);
   const url=definition?.modelUrl||asset.modelUrl;
   if(!object&&url){try{object=(await loader.loadOne(url,0,1)).scene;prepareAuthoredBuilderModel(object,{...definition,targetHeight:asset.targetHeight||definition?.targetHeight});}catch{missing.push(item.id);}}
   if(object){object.traverse(mesh=>{if(!mesh.isMesh)return;for(const material of [].concat(mesh.material||[])){if(item.paint!==undefined)material.color?.setHex(item.paint);else if(item.materialSettings?.useAccent)material.color?.lerp(new THREE.Color(item.materialSettings.accent),.38);}});place(object,item);}else if(item.modelId)missing.push(item.id);
  },{current});
  if(!prepared)throw Object.assign(new Error('Scene loading cancelled'),{name:'AbortError'});
  for(const item of Object.values(snapshot?.objects||{})){if(item.deleted)continue;const object=createBuildingBlock(THREE,item.materialId);object.userData.atlasItemId=item.id;object.userData.atlasItemName='Building piece · '+item.materialId;object.position.set(...xyz(item.position));object.rotation.set(...xyz(item.rotation));object.scale.set(...xyz(item.scale,1));let face=0;object.traverse(mesh=>{if(mesh.isMesh&&mesh.material?.color){const color=item.paint?.[face++];if(color!==undefined)mesh.material.color.setHex(color);}});if(item.open)toggleBuildingObject(object);decor.add(object);}
  root.updateMatrixWorld(true);
  return {root,decor,missing:[...new Set(missing)],environment,snapshot,updateSnapshot(next){for(const object of decor.children){const actor=next.actors?.[object.userData.atlasItemId];if(!actor)continue;const offset=object.userData.atlasServerOffset||{x:0,y:0,z:0};object.visible=actor.active!==false;if(actor.position)object.position.set(actor.position.x+offset.x,actor.position.y+offset.y,actor.position.z+offset.z);if(actor.rotation)object.rotation.set(...xyz(actor.rotation));}root.updateMatrixWorld(true);},dispose(){loader.unload();disposeAtlasObject(decor);root.clear();}};
 }catch(error){loader.unload();disposeAtlasObject(decor);throw error;}
}
