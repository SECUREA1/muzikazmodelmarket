import {INTERACTIVE_DEVICES} from './interactive-devices.js';
import {ENTERABLE_BUILDINGS} from './building-districts.js';
export const BUILDER_SECTIONS=[['all','All items'],['buildings','Buildings'],['interactive','Interactive'],['arcade','Arcade & cards'],['interior','Furniture & interiors'],['landscape','Outdoor & plants'],['plants','Plants'],['terrain','Terrain'],['characters','Characters'],['creatures','Enemies & creatures'],['vehicles','Vehicles'],['weapons','Weapons'],['backpack','My Backpack'],['custom','Custom items'],['props','Props'],['wearables','Wearables']];
export function builderSections(model){
 const tags=new Set([model.category,model.type].filter(Boolean)),id=model.buildAssetId||model.id,device=INTERACTIVE_DEVICES[model.function_data?.device||id];
 if(tags.has('avatar')||tags.has('character'))tags.add('characters');if(tags.has('enemy')||tags.has('creature'))tags.add('creatures');if(tags.has('vehicle'))tags.add('vehicles');if(tags.has('weapon'))tags.add('weapons');if(tags.has('wearable'))tags.add('wearables');
 if(ENTERABLE_BUILDINGS[id])tags.add('buildings');if(device||['interact','switch','door','heal','quest'].includes(model.behavior))tags.add('interactive');if(device&&['arcade','poker','slots','trivia'].includes(device.kind))tags.add('arcade');
 if(tags.has('plants')||tags.has('outdoor'))tags.add('landscape');if(tags.has('furniture'))tags.add('interior');if(model.ownedBuilder||model.category==='backpack')tags.add('backpack');if(model.custom||model.assetKind==='custom-svg')tags.add('custom');
 return tags;
}
export function libraryModels(models,filter='all',query=''){
 const seen=new Set(),text=String(query).trim().toLowerCase();return models.filter(model=>{
  const tags=builderSections(model);if(filter!=='all'&&!tags.has(filter))return false;
  if(text&&!`${model.name} ${model.description||''} ${[...tags].join(' ')}`.toLowerCase().includes(text))return false;
  const nativeId=model.buildAssetId||(model.procedural&&!model.generated?model.id:null),key=!model.custom&&!model.ownedBuilder&&!model.configuration&&nativeId?'native:'+nativeId:model.id;if(seen.has(key))return false;seen.add(key);return true;
 });
}
export function libraryCounts(models){return Object.fromEntries(BUILDER_SECTIONS.map(([id])=>[id,libraryModels(models,id).length]));}
export function createPlacementSelection({load,onState=()=>{}}){
 let generation=0;
 return {cancel(){generation++;onState({status:'idle'});},async select(model){const token=++generation;onState({status:'loading',model});try{const asset=await load(model);if(token!==generation)return null;if(!asset)throw Error('This item has no 3D preview.');onState({status:'ready',model});return asset;}catch(error){if(token===generation)onState({status:'error',model,error});return null;}}};
}

export function catalogRecords(value){if(Array.isArray(value))return value;const records=value?.models||value?.assets||value?.items||value?.data;return records&&records!==value?catalogRecords(records):[];}
