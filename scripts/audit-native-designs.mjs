import {access,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {NATIVE_BUILDER_ITEMS} from '../public/js/native-builder-items.js';
import {GAME_ECONOMY} from '../game-economy.mjs';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
import {NATIVE_DESIGN_VERSION} from '../public/js/native-design-system.js';
import {nativeDesignThumbnail} from '../public/js/native-design-profile.js';
import {HELD_TOOL_DESIGN_IDS,createHeldToolModel} from '../public/js/held-tool-design-finish.js';
import {NATIVE_TEMPLATE_LAYOUT_IDS} from '../public/js/environments/native-world-design-finish.js';
import {createBuilderLand} from '../public/js/environments/builder-land.js';

export function disposeNativeAuditModel(root){
 const resources=new Set();
 root?.traverse(node=>{
  if(node.geometry)resources.add(node.geometry);
  for(const material of [].concat(node.material||[])){
   resources.add(material);
   for(const value of Object.values(material))if(value?.isTexture)resources.add(value);
  }
 });
 for(const resource of resources)resource.dispose();
}

export function nativeRenderStats(root){
 let meshes=0,lights=0,vertices=0,triangles=0,screen=0,details=0,texturedSurfaces=0,colouredSurfaces=0;
 const surfaces=[];
 root.traverse(node=>{
  if(node.isLight)lights++;
  if(!node.isMesh)return;
  meshes++;
  const position=node.geometry?.attributes.position;
  vertices+=position?.count||0;
  triangles+=(node.geometry?.index?.count||position?.count||0)/3*(node.isInstancedMesh?node.count:1);
  if(node.userData.mediaScreen)screen++;
  if(node.userData.nativeDesignDetail)details++;
  if(node.geometry?.attributes.color)colouredSurfaces++;
  for(const material of [].concat(node.material||[])){
   if(!node.userData.mediaScreen&&!node.userData.collisionOnly&&(material.map||material.bumpMap||material.normalMap||material.roughnessMap))texturedSurfaces++;
   surfaces.push({name:material.name,color:material.color?.getHex(),roughness:material.roughness,metalness:material.metalness,map:Boolean(material.map),bumpMap:Boolean(material.bumpMap),normalMap:Boolean(material.normalMap),vertexColors:Boolean(material.vertexColors)});
  }
 });
 const bounds=new THREE.Box3().setFromObject(root);
 return {meshes,lights,vertices,triangles,screen,details,texturedSurfaces,colouredSurfaces,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},rootTransform:[...root.position,...root.quaternion,...root.scale],surfaces};
}

function canonicalCompatibility(item){
 return {id:item.id,behavior:item.behavior,dimensions:item.dimensions,function_data:item.function_data,
  offers:GAME_ECONOMY.filter(offer=>offer.buildAssetId===item.id).map(offer=>({sku:offer.sku,priceMzk:offer.priceMzk,behavior:offer.behavior,function_data:offer.function_data}))};
}

// --baseline compares against a pre-upgrade snapshot, including all aliases.
// The baseline is optional so this remains useful as the native library grows.
export async function auditNativeDesigns({baselinePath,ids,checkThumbnails=false,includeSupplementary=!ids}={}){
 const baseline=baselinePath?JSON.parse(await readFile(baselinePath,'utf8')):null;
 const previous=new Map((baseline?.records||[]).map(record=>[record.id,record]));
 const definitions=Object.values(NATIVE_BUILDER_ITEMS).filter(item=>!ids||ids.includes(item.id));
 const failures=[],items=[],families={};
 for(const item of definitions){
  let root;
  const fail=(code,message)=>failures.push({id:item.id,code,message});
  try{
   root=createBuilderModel(item.id);
   if(!root){fail('MISSING_RENDERER','The canonical native ID did not create a model.');continue;}
   const stats=nativeRenderStats(root),design=root.userData.nativeDesign,prior=previous.get(item.id);
   if(design?.version!==NATIVE_DESIGN_VERSION)fail('MISSING_FINISH','The runtime model does not carry the current native design.');
   if(item.visualDesign?.version!==NATIVE_DESIGN_VERSION)fail('MISSING_CATALOG_FINISH','The shared item definition does not declare the runtime design version.');
   if(design?.id&&design.id!==item.id)fail('INCORRECT_ID','Finishing changed the canonical native identity.');
   const family=design?.family||'unclassified';families[family]=(families[family]||0)+1;
   if(stats.meshes<1||stats.vertices<3)fail('EMPTY_GEOMETRY','The renderer produced no drawable model.');
   if(!stats.texturedSurfaces&&!stats.colouredSurfaces&&!stats.details)fail('MISSING_RENDER_FINISH','The design has no textured surfaces, vertex surface work or authored detail geometry.');
   if(![...stats.bounds.min,...stats.bounds.max,...stats.rootTransform].every(Number.isFinite))fail('INVALID_BOUNDS','The model contains non-finite bounds or transforms.');
   if(stats.lights!==0)fail('PER_ITEM_LIGHTS','The native design adds item lights instead of using shared world lighting.');
   let invalidVertices=false;
   root.traverse(node=>{const positions=node.geometry?.attributes.position?.array;if(positions&&!invalidVertices)for(const value of positions)if(!Number.isFinite(value)){invalidVertices=true;break;}});
   if(invalidVertices)fail('INVALID_VERTICES','The model contains non-finite geometry.');
   if(prior){
    const current=canonicalCompatibility(item);
    for(const key of ['behavior','dimensions','function_data','offers'])if(JSON.stringify(current[key])!==JSON.stringify(prior[key]))fail('COMPATIBILITY_CHANGED',key+' changed from the recorded native inventory.');
    if(prior.visual){
     if(stats.rootTransform.some((value,index)=>Math.abs(value-prior.visual.rootTransform[index])>1e-8))fail('PLACEMENT_CHANGED','Finishing moved the model root.');
     if(stats.screen!==prior.visual.screen)fail('MEDIA_ANCHORS_CHANGED','The number of shared screen anchors changed.');
     const changed=stats.meshes!==prior.visual.meshes||stats.vertices!==prior.visual.vertices||JSON.stringify(stats.surfaces)!==JSON.stringify(prior.visual.surfaces);
     if(!changed)fail('NO_VISIBLE_CHANGE','The new finish changed no render geometry or material properties.');
    }
   }
   items.push({id:item.id,family,version:design?.version,meshes:stats.meshes,triangles:stats.triangles,details:stats.details,texturedSurfaces:stats.texturedSurfaces,colouredSurfaces:stats.colouredSurfaces});
  }catch(error){fail('RENDER_FAILED',error.message);}
  finally{disposeNativeAuditModel(root);}
 }
 const missingBaselineIds=baseline&&!ids?baseline.records.filter(record=>!NATIVE_BUILDER_ITEMS[record.id]).map(record=>record.id):[];
 for(const id of missingBaselineIds)failures.push({id,code:'REMOVED_ID',message:'A previously owned native identity was removed.'});
 const supplementary={heldTools:[],templateLayouts:[]},offers=[],uniqueDesigns=new Set(items.map(item=>item.id));
 const heldIds=new Set(HELD_TOOL_DESIGN_IDS),layoutIds=new Set(NATIVE_TEMPLATE_LAYOUT_IDS);
 const failSupplement=(id,code,message)=>failures.push({id,code,message});
 const inspectSupplement=(id,root,kind)=>{
  if(!root){failSupplement(id,'MISSING_SUPPLEMENTARY_RENDERER','The native '+kind+' did not create a physical model.');return;}
  const stats=nativeRenderStats(root),design=kind==='held-tool'?root.userData.heldToolDesign:root.userData.nativeWorldDesign;
  if(design?.version!==NATIVE_DESIGN_VERSION)failSupplement(id,'MISSING_SUPPLEMENTARY_FINISH','The physical '+kind+' does not carry the current native design.');
  if(kind==='held-tool'&&design?.id!==id.slice(5))failSupplement(id,'INCORRECT_TOOL_ID','The physical gear changed its native tool identity.');
  if(kind==='map-template'&&design?.layout!==id.slice(7))failSupplement(id,'INCORRECT_TEMPLATE_ID','The native world changed its source layout identity.');
  if(stats.meshes<1||stats.vertices<3)failSupplement(id,'EMPTY_SUPPLEMENTARY_GEOMETRY','The native '+kind+' has no drawable geometry.');
  if(!stats.texturedSurfaces)failSupplement(id,'MISSING_SUPPLEMENTARY_SURFACES','The '+kind+' has no actual textured native surfaces.');
  if(![...stats.bounds.min,...stats.bounds.max,...stats.rootTransform].every(Number.isFinite))failSupplement(id,'INVALID_SUPPLEMENTARY_BOUNDS','The '+kind+' has non-finite bounds or transforms.');
  let invalidVertices=false;root.traverse(node=>{const positions=node.geometry?.attributes.position?.array;if(positions&&!invalidVertices)for(const value of positions)if(!Number.isFinite(value)){invalidVertices=true;break;}});
  if(invalidVertices)failSupplement(id,'INVALID_SUPPLEMENTARY_VERTICES','The '+kind+' contains non-finite geometry.');
  if(kind==='held-tool'&&stats.lights)failSupplement(id,'PER_TOOL_LIGHTS','Held gear must use shared scene lighting.');
  uniqueDesigns.add(id);
  return {id,version:design?.version,meshes:stats.meshes,triangles:stats.triangles,texturedSurfaces:stats.texturedSurfaces,details:stats.details};
 };
 if(includeSupplementary){
  for(const id of HELD_TOOL_DESIGN_IDS){
   let root;try{root=createHeldToolModel(THREE,id);const result=inspectSupplement('tool:'+id,root,'held-tool');if(result)supplementary.heldTools.push(result);}
   catch(error){failSupplement('tool:'+id,'TOOL_RENDER_FAILED',error.message);}finally{disposeNativeAuditModel(root);}
  }
  for(const layout of NATIVE_TEMPLATE_LAYOUT_IDS){
   let root;try{root=createBuilderLand({id:'native-design-'+layout,source:'repository',proceduralLand:true,builderScene:{layout,mapSize:40}});const result=inspectSupplement('layout:'+layout,root,'map-template');if(result)supplementary.templateLayouts.push(result);}
   catch(error){failSupplement('layout:'+layout,'TEMPLATE_RENDER_FAILED',error.message);}finally{disposeNativeAuditModel(root);}
  }
  for(const offer of GAME_ECONOMY.filter(item=>item.native)){
   const canonical=offer.buildAssetId||(offer.materialId?'material:'+offer.materialId:null);
   const designId=NATIVE_BUILDER_ITEMS[canonical]?canonical:offer.kind==='tool'&&heldIds.has(offer.toolId)?'tool:'+offer.toolId:layoutIds.has(offer.builderLayoutId)?'layout:'+offer.builderLayoutId:null;
   if(!designId){failSupplement(offer.sku,'UNRESOLVED_NATIVE_OFFER','A native economy offer has no canonical item, held-tool or map-template renderer.');continue;}
   if(!uniqueDesigns.has(designId))failSupplement(offer.sku,'UNRENDERED_NATIVE_OFFER','The native offer design failed physical renderer coverage.');
   const thumbnailUrl=nativeDesignThumbnail(designId);
   if(offer.visualDesign?.version!==NATIVE_DESIGN_VERSION||offer.visualDesign?.thumbnailUrl!==thumbnailUrl||offer.thumbnailUrl!==thumbnailUrl)failSupplement(offer.sku,'OFFER_DESIGN_MISMATCH','The native offer does not use its current canonical design and thumbnail.');
   offers.push({sku:offer.sku,designId,thumbnailUrl});
  }
 }
 if(checkThumbnails)for(const id of uniqueDesigns){
  const url=nativeDesignThumbnail(id);try{await access(new URL('../'+url.replace(/^\//,''),import.meta.url));}
  catch{failSupplement(id,'MISSING_THUMBNAIL','The current native design thumbnail is missing: '+url);}
 }
 return {version:NATIVE_DESIGN_VERSION,counts:{catalog:definitions.length,rendered:items.length,materials:definitions.filter(item=>item.id.startsWith('material:')).length,baselineCompared:definitions.filter(item=>previous.has(item.id)).length,families,heldTools:supplementary.heldTools.length,templateLayouts:supplementary.templateLayouts.length,nativeOffers:offers.length,uniqueDesigns:uniqueDesigns.size,nativeOfferAliases:includeSupplementary?offers.length-uniqueDesigns.size:0},failures,items,supplementary,offers};
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const index=process.argv.indexOf('--baseline'),baselinePath=index>=0?process.argv[index+1]:undefined;
 const report=await auditNativeDesigns({baselinePath,checkThumbnails:process.argv.includes('--check-thumbnails')});
 console.log(JSON.stringify(report,null,2));
 if(report.failures.length||report.counts.rendered!==report.counts.catalog)process.exitCode=1;
}
