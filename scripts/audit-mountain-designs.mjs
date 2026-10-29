import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
import {NATIVE_BUILDER_ITEMS} from '../public/js/native-builder-items.js';
import {GAME_ECONOMY} from '../game-economy.mjs';
import {placementBounds} from '../public/js/placed-item-collision.js';
import {createBuilderLand} from '../public/js/environments/builder-land.js';
import {createSkiResortLand} from '../public/js/environments/ski-resort-land.js';
import {createFactoryProvingGroundsLand,createMountainCompoundLand} from '../public/js/factory-testing-model.js';
import {layoutHeight} from '../public/js/environments/layout-terrain.js';
import {skiHeight} from '../public/js/ski-resort.js';
import {airportWorld} from '../airport-world.mjs';
import {MOUNTAIN_DESIGN_IDS,MOUNTAIN_DESIGN_VERSION} from '../public/js/mountain-design-profile.js';

export const mountainPose=node=>[...node.position,...node.quaternion,...node.scale];
export const mountainAttributeHash=attribute=>attribute?createHash('sha256').update(Buffer.from(attribute.array.buffer,attribute.array.byteOffset,attribute.array.byteLength)).digest('hex'):null;
const boundsObject=bounds=>({min:bounds.min.toArray(),max:bounds.max.toArray()});
const close=(a,b,tolerance=1e-5)=>a.length===b.length&&a.every((value,index)=>Math.abs(value-b[index])<=tolerance);
const closeBounds=(a,b,tolerance=1e-5)=>['min','max'].every(key=>close(a[key],b[key],tolerance));
export function disposeMountainModel(root){
 const resources=new Set();root?.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of [].concat(node.material||[])){resources.add(material);for(const value of Object.values(material))if(value?.isTexture)resources.add(value);}});
 for(const resource of resources)resource.dispose();
}
export function mountainGeometryStats(root){
 let meshes=0,triangles=0,lights=0,uvMissing=0,degenerateTriangles=0,invalidAttributes=false,opposingNormals=0;
 root.traverse(node=>{
  if(node.isLight)lights++;
  if(!mountainPose(node).every(Number.isFinite))invalidAttributes=true;
  if(!node.isMesh)return;meshes++;
  const geometry=node.geometry,position=geometry.attributes.position,index=geometry.index,normal=geometry.attributes.normal,uv=geometry.attributes.uv,count=index?.count||position?.count||0;
  triangles+=count/3*(node.isInstancedMesh?node.count:1);
  if(!uv||uv.count!==position.count)uvMissing++;
  for(const attribute of Object.values(geometry.attributes))for(const value of attribute.array)if(!Number.isFinite(value))invalidAttributes=true;
  for(let i=0;i<count;i+=3){
   const ids=[0,1,2].map(offset=>index?index.getX(i+offset):i+offset),[a,b,c]=ids.map(vertex=>new THREE.Vector3().fromBufferAttribute(position,vertex)),face=b.sub(a).cross(c.sub(a));
   if(face.lengthSq()<1e-15){degenerateTriangles++;continue;}
   if(normal){const authored=ids.reduce((sum,vertex)=>sum.add(new THREE.Vector3().fromBufferAttribute(normal,vertex)),new THREE.Vector3());if(face.dot(authored)<=0)opposingNormals++;}
  }
 });
 return {meshes,triangles,lights,uvMissing,degenerateTriangles,invalidAttributes,opposingNormals};
}
export function mountainCompatibility(id){
 const item=NATIVE_BUILDER_ITEMS[id];
 return {native:{id:item?.id,dimensions:item?.dimensions,behavior:item?.behavior,function_data:item?.function_data},offers:GAME_ECONOMY.filter(offer=>offer.buildAssetId===id).map(offer=>({sku:offer.sku,priceMzk:offer.priceMzk,useCostMzk:offer.useCostMzk,function_data:offer.function_data}))};
}

export const mountainWorldFactories=[
 ['mountain-pass',()=>createBuilderLand({id:'mountain-baseline',proceduralLand:true,builderScene:{layout:'mountain-pass',mapSize:128}}),node=>node.name==='BUILDER_TEMPLATE_mountain-pass'||node.name==='BUILDER_WALKABLE_FLOOR_mountain-pass'],
 ['ski-resort',()=>createSkiResortLand(),node=>node.name.startsWith('BUILDER_WALKABLE_FLOOR_SKI_MOUNTAIN_')||node.name==='SUMMIT_ROCK_OUTCROP'],
 ['factory-proving-grounds',()=>createFactoryProvingGroundsLand(),node=>node.name==='PROVING_MOUNTAIN_RIDGE'],
 ['mountain-compound',()=>createMountainCompoundLand(),node=>node.name==='COMPOUND_MOUNTAIN_ROCK_FACE'||node.name==='COMPOUND_BACK_ROCK_CUT']
];

export async function auditMountainDesigns({baselinePath}={}){
 const baseline=baselinePath?JSON.parse(await readFile(baselinePath,'utf8')):null,failures=[],items=[],worlds=[];
 const fail=(id,code,message)=>failures.push({id,code,message});
 for(const id of MOUNTAIN_DESIGN_IDS){
  let root;
  try{
   root=createBuilderModel(id);if(!root){fail(id,'MISSING_MODEL','The native mountain renderer is missing.');continue;}
   const stats=mountainGeometryStats(root),previous=baseline?.native.find(item=>item.id===id),bounds=boundsObject(new THREE.Box3().setFromObject(root,true)),physical=boundsObject(placementBounds(THREE,root));
   if(root.userData.mountainDesign?.version!==MOUNTAIN_DESIGN_VERSION||root.userData.mountainDesign?.id!==id)fail(id,'MISSING_DESIGN','The native model does not carry its current mountain design.');
   if(stats.invalidAttributes||stats.uvMissing||stats.degenerateTriangles||stats.opposingNormals)fail(id,'INVALID_SURFACE','A terrain surface has missing UVs, degenerate faces, invalid attributes or normals opposing its winding.');
   if(stats.lights)fail(id,'ADDED_LIGHTS','Native mountain models must use shared scene lighting.');
   if(previous){
    const compatibility=mountainCompatibility(id);if(JSON.stringify(compatibility.native)!==JSON.stringify(previous.native)||JSON.stringify(compatibility.offers)!==JSON.stringify(previous.offers))fail(id,'GAMEPLAY_CHANGED','Mountain identity, dimensions, prices or behavior changed.');
    if(!close(mountainPose(root),previous.pose))fail(id,'ROOT_POSE_CHANGED','The native placement transform changed.');
    if(!closeBounds(bounds,previous.bounds,.01)||!closeBounds(physical,previous.physical,.01))fail(id,'BOUNDS_CHANGED','The native visual or physical placement envelope changed.');
    if(stats.meshes>previous.meshes+8||stats.triangles>previous.triangles+8000)fail(id,'MODEL_BUDGET','The cleanup exceeds its bounded additional geometry budget.');
   }
   items.push({id,version:root.userData.mountainDesign?.version,...stats});
  }catch(error){fail(id,'MODEL_FAILED',error.message);}finally{disposeMountainModel(root);}
 }
 for(const [id,make,accept] of mountainWorldFactories){
  let root;
  try{
   root=make();root.updateMatrixWorld(true);const nodes=[];root.traverse(node=>{if(accept(node))nodes.push(node);});
   const previous=baseline?.worlds.find(world=>world.id===id),stats=mountainGeometryStats(root),groups=new Map();
   for(const node of nodes){if(!groups.has(node.name))groups.set(node.name,[]);groups.get(node.name).push(node);const uv=node.geometry.attributes.uv;if(!uv||uv.count!==node.geometry.attributes.position.count||!Array.from(uv.array).every(Number.isFinite))fail(id,'WORLD_UV_MISSING','A mountain ridge or walkable snow tile has invalid texture coordinates: '+node.name);}
   if(previous){
    if(!close(mountainPose(root),previous.pose)||!closeBounds(boundsObject(new THREE.Box3().setFromObject(root,true)),previous.bounds,.01))fail(id,'WORLD_PLACEMENT_CHANGED','The world root placement or overall envelope changed.');
    if(stats.lights!==previous.lights)fail(id,'WORLD_LIGHTS_CHANGED','The mountain cleanup added scene lights.');
    if(nodes.length!==previous.nodes.length)fail(id,'WORLD_NODE_COUNT_CHANGED','An authored ridge or walkable tile was removed or duplicated.');
    for(const saved of previous.nodes){
     const node=groups.get(saved.name)?.shift();if(!node){fail(id,'WORLD_NODE_MISSING','The authored terrain node is missing: '+saved.name);continue;}
     node.geometry.computeBoundingBox();
     if(node.type!==saved.type||!close(mountainPose(node),saved.pose)||!closeBounds(boundsObject(node.geometry.boundingBox),saved.localBounds,.00001)||node.userData.collisionOnly!==saved.collisionOnly||node.userData.collisionDisabled!==saved.collisionDisabled||node.userData.collider!==saved.collider)fail(id,'WORLD_RIDGE_CHANGED','A ridge placement, local envelope or collision flag changed: '+saved.name);
     if(saved.name.startsWith('BUILDER_WALKABLE_FLOOR'))for(const [key,attribute]of [['position',node.geometry.attributes.position],['normal',node.geometry.attributes.normal],['index',node.geometry.index]])if(mountainAttributeHash(attribute)!==saved.geometry[key])fail(id,'WALKABLE_GEOMETRY_CHANGED','The mountain cleanup changed authoritative walkable '+key+' data: '+saved.name);
    }
   }
   worlds.push({id,ridges:nodes.filter(node=>!node.name.startsWith('BUILDER_WALKABLE_FLOOR')).length,walkableTiles:nodes.filter(node=>node.name.startsWith('BUILDER_WALKABLE_FLOOR')).length,lights:stats.lights});
  }catch(error){fail(id,'WORLD_FAILED',error.message);}finally{disposeMountainModel(root);}
 }
 if(baseline){
  if(layoutHeight.toString()!==baseline.heights.layout||skiHeight.toString()!==baseline.heights.ski||baseline.heights.samples.some(sample=>layoutHeight('mountain-pass',sample.x,sample.z)!==sample.layout||skiHeight(sample.x,sample.z)!==sample.ski))fail('terrain-height','HEIGHTS_CHANGED','Shared mountain-pass or ski height functions changed.');
  if(JSON.stringify(airportWorld().builderScene.objects.filter(object=>object.modelId==='alpine-mountain'))!==JSON.stringify(baseline.airportPeaks))fail('airport','PEAK_PLACEMENTS_CHANGED','The six mountain-airport placements or their gameplay settings changed.');
 }
 return {version:MOUNTAIN_DESIGN_VERSION,counts:{catalog:MOUNTAIN_DESIGN_IDS.length,rendered:items.length,baselineCompared:baseline?items.filter(item=>baseline.native.some(previous=>previous.id===item.id)).length:0,worlds:worlds.length,walkableTiles:worlds.reduce((count,world)=>count+world.walkableTiles,0),ridges:worlds.reduce((count,world)=>count+world.ridges,0)},failures,items,worlds};
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const index=process.argv.indexOf('--baseline'),report=await auditMountainDesigns({baselinePath:index>=0?process.argv[index+1]:undefined});console.log(JSON.stringify(report,null,2));if(report.failures.length||report.counts.rendered!==report.counts.catalog)process.exitCode=1;
}
