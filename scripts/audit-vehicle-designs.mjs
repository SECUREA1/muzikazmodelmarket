import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
import {NATIVE_BUILDER_ITEMS} from '../public/js/native-builder-items.js';
import {GAME_ECONOMY} from '../game-economy.mjs';
import {placementBounds} from '../public/js/placed-item-collision.js';
import {VEHICLE_DESIGN_IDS,VEHICLE_DESIGN_VERSION} from '../public/js/vehicle-design-system.js';

export function disposeVehicleModel(root){
 const resources=new Set();root?.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of [].concat(node.material||[])){resources.add(material);for(const value of Object.values(material))if(value?.isTexture)resources.add(value);}});
 for(const resource of resources)resource.dispose();
}
export const vehicleTransform=node=>[...node.position,...node.quaternion,...node.scale];
export function vehicleVisualStats(root){
 let meshes=0,triangles=0,lights=0,details=0,uvMissing=0,invalidVertices=false,invalidDetailCollision=false;
 root.traverse(node=>{
  if(node.isLight)lights++;
  if(!node.isMesh)return;meshes++;
  const positions=node.geometry?.attributes.position;
  triangles+=(node.geometry?.index?.count||positions?.count||0)/3*(node.isInstancedMesh?node.count:1);
  if(!node.geometry?.attributes.uv)uvMissing++;
  if(node.userData.vehicleDesignDetail){details++;if(node.userData.collisionDisabled!==true||node.userData.collider===true)invalidDetailCollision=true;}
  if(positions&&!invalidVertices)for(const value of positions.array)if(!Number.isFinite(value)){invalidVertices=true;break;}
 });
 const bounds=new THREE.Box3().setFromObject(root,true),physical=placementBounds(THREE,root);
 return {meshes,triangles,lights,details,uvMissing,invalidVertices,invalidDetailCollision,rootTransform:vehicleTransform(root),bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},physicalBounds:{min:physical.min.toArray(),max:physical.max.toArray()}};
}

export function vehicleCompatibility(id){
 const item=NATIVE_BUILDER_ITEMS[id];
 return {native:{behavior:item?.behavior,dimensions:item?.dimensions,function_data:item?.function_data,vehicleSettings:item?.vehicleSettings},offers:GAME_ECONOMY.filter(offer=>offer.buildAssetId===id).map(offer=>({sku:offer.sku,priceMzk:offer.priceMzk,useCostMzk:offer.useCostMzk,function_data:offer.function_data,vehicleSettings:offer.vehicleSettings}))};
}
const close=(actual,expected,tolerance=1e-5)=>actual.length===expected.length&&actual.every((value,index)=>Math.abs(value-expected[index])<=tolerance);
const attributeHash=attribute=>attribute?createHash('sha256').update(Buffer.from(attribute.array.buffer,attribute.array.byteOffset,attribute.array.byteLength)).digest('hex'):null;

function checkBaselineAnchors(root,previous,fail){
 const descendants=new Set();root.traverse(node=>descendants.add(node));
 for(const saved of previous.rigRefs||[]){
  const node=saved.path.split('.').reduce((value,key)=>value?.[key],root.userData);
  if(!node?.isObject3D||!descendants.has(node)||node.name!==saved.name||node.type!==saved.type||!close(vehicleTransform(node),saved.transform))fail('RIG_CHANGED','A live rig reference, anchor or authored pose changed: '+saved.path);
 }
 const colliders=[];root.traverse(node=>{if(node.isMesh&&node.userData.collisionOnly)colliders.push({name:node.name,transform:vehicleTransform(node),position:attributeHash(node.geometry.attributes.position),collisionDisabled:node.userData.collisionDisabled===true,collider:node.userData.collider,collisionOnly:true});});
 if(JSON.stringify(colliders)!==JSON.stringify((previous.primary||[]).filter(node=>node.collisionOnly)))fail('COLLIDER_CHANGED','An explicit collision mesh, collision flag or authored collider pose changed.');
}

export async function auditVehicleDesigns({baselinePath}={}){
 const baseline=baselinePath?JSON.parse(await readFile(baselinePath,'utf8')):null,prior=new Map((baseline?.records||[]).map(item=>[item.id,item])),items=[],failures=[],families={};
 for(const id of VEHICLE_DESIGN_IDS){
  let root;const fail=(code,message)=>failures.push({id,code,message});
  try{
   root=createBuilderModel(id);if(!root){fail('MISSING_VEHICLE','The canonical vehicle renderer is missing.');continue;}
   const design=root.userData.vehicleDesign,stats=vehicleVisualStats(root),previous=prior.get(id);
   if(design?.version!==VEHICLE_DESIGN_VERSION||design.id!==id)fail('MISSING_DESIGN','The vehicle does not carry its current canonical design.');
   if(!design?.family)fail('MISSING_FAMILY','The vehicle has no declared design family.');
   if(!stats.details)fail('NO_CRAFTED_DETAILS','The model has no actual crafted vehicle detail geometry.');
   if(stats.invalidVertices||![...stats.bounds.min,...stats.bounds.max,...stats.rootTransform].every(Number.isFinite))fail('INVALID_GEOMETRY','Vehicle geometry or placement contains non-finite values.');
   if(stats.invalidDetailCollision)fail('COSMETIC_COLLISION','A new cosmetic vehicle detail became a physical obstacle.');
   if(stats.lights)fail('PER_VEHICLE_LIGHTS','The finish adds per-vehicle lights instead of sharing scene lighting.');
   if(previous){
    const compatibility=vehicleCompatibility(id);
    if(JSON.stringify(compatibility.native)!==JSON.stringify(previous.native)||JSON.stringify(compatibility.offers)!==JSON.stringify(previous.offers))fail('GAMEPLAY_CHANGED','Vehicle identity, prices, use costs or gameplay settings changed.');
    if(!close(stats.rootTransform,previous.rootTransform))fail('PLACEMENT_CHANGED','The vehicle root pose changed.');
    checkBaselineAnchors(root,previous,fail);
    for(const key of ['min','max']){
     if(!close(stats.bounds[key],previous.bounds[key],.01))fail('VISUAL_BOUNDS_CHANGED','The vehicle footprint or placement datum changed.');
     if(!close(stats.physicalBounds[key],previous.physicalBounds[key],.01))fail('PHYSICAL_BOUNDS_CHANGED','The vehicle physical collision bounds changed.');
    }
    if(stats.meshes>previous.meshes+80)fail('DRAW_BUDGET','The finish exceeds an additional 80 draw meshes.');
    if(stats.triangles>previous.triangles+30000)fail('TRIANGLE_BUDGET','The finish exceeds an additional 30,000 triangles.');
   }
   const family=design?.family||'unclassified';families[family]=(families[family]||0)+1;
   items.push({id,family,version:design?.version,details:stats.details,meshes:stats.meshes,triangles:stats.triangles,uvMissing:stats.uvMissing,uvGeometries:design?.uvGeometries||0});
  }catch(error){fail('VEHICLE_RENDER_FAILED',error.message);}finally{disposeVehicleModel(root);}
 }
 return {version:VEHICLE_DESIGN_VERSION,counts:{catalog:VEHICLE_DESIGN_IDS.length,rendered:items.length,baselineCompared:VEHICLE_DESIGN_IDS.filter(id=>prior.has(id)).length,families},failures,items};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const index=process.argv.indexOf('--baseline'),report=await auditVehicleDesigns({baselinePath:index>=0?process.argv[index+1]:undefined});console.log(JSON.stringify(report,null,2));
 if(report.failures.length||report.counts.rendered!==report.counts.catalog)process.exitCode=1;
}
