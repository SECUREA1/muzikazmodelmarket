import {FACTORY_TESTING_ITEMS} from './factory-testing-items.js';
import {FACTORY_ITEMS} from './missile-factory-items.js';
import {FITNESS_ITEMS} from './fitness-equipment.js';
import {deviceDefinition} from './interactive-devices.js';
import {ENTERABLE_BUILDINGS} from './building-districts.js';
import {CAMP_ITEMS} from './summer-camp.js';
import {LAYOUT_SCENES} from './builder-layout-scenes.js';
import {FUNHOUSE_ITEMS} from './clown-funhouse-items.js';
export const BUILDER_SECTIONS=[['all','All items'],['scene-layouts','In-map scenes'],['funhouse','Clown funhouse'],['factory','Factory & rockets'],['factory-testing','Factory tests & facility'],['fitness','Fitness & gym'],['summer-camp','Summer camp'],['buildings','Buildings'],['interactive','Interactive'],['arcade','Arcade & cards'],['audio','Music & audio'],['video','Screens & media'],['services','Shops & services'],['seating','Seating'],['interior','Furniture & interiors'],['landscape','Outdoor & plants'],['plants','Plants'],['terrain','Terrain'],['characters','Characters'],['creatures','Enemies & creatures'],['vehicles','Vehicles'],['weapons','Weapons'],['backpack','My Backpack'],['custom','Custom items'],['props','Props'],['wearables','Wearables']];
export function builderSections(model){
 const tags=new Set([model.category,model.type].filter(Boolean)),id=model.buildAssetId||model.id,device=deviceDefinition(id,model.function_data||{});
 if(FUNHOUSE_ITEMS[id])tags.add('funhouse');
 if(FITNESS_ITEMS[id])tags.add('fitness');
 if(FACTORY_ITEMS[id]||model.function_data?.factoryCrewId)tags.add('factory');
 if(FACTORY_TESTING_ITEMS[id]||model.function_data?.testingStation||model.function_data?.testingTarget){tags.add('factory');tags.add('factory-testing');tags.add('interactive');}
 const camp=CAMP_ITEMS[id];if(camp){tags.add('summer-camp');tags.add(camp.category);}if(id==='campfire')tags.add('summer-camp');
 if(LAYOUT_SCENES[id])tags.add('scene-layouts');
 if(tags.has('avatar')||tags.has('character'))tags.add('characters');if(tags.has('enemy')||tags.has('creature'))tags.add('creatures');if(tags.has('vehicle'))tags.add('vehicles');if(tags.has('weapon'))tags.add('weapons');if(tags.has('wearable'))tags.add('wearables');
 if(ENTERABLE_BUILDINGS[id])tags.add('buildings');if(device||['interact','switch','door','heal','quest'].includes(model.behavior))tags.add('interactive');if(device&&['arcade','poker','slots','trivia'].includes(device.kind))tags.add('arcade');
 if(device?.kind==='audio')tags.add('audio');if(device&&['video','image','board'].includes(device.kind))tags.add('video');if(device?.kind==='market')tags.add('services');if((model.function_data?.behavior||model.behavior)==='seat'||tags.has('seating'))tags.add('seating');
 if(tags.has('plants')||tags.has('outdoor'))tags.add('landscape');if(tags.has('furniture'))tags.add('interior');if(model.ownedBuilder||model.category==='backpack')tags.add('backpack');if(model.custom||model.assetKind==='custom-svg')tags.add('custom');
 return tags;
}
export function libraryModels(models,filter='all',query=''){
 const seen=new Set(),text=String(query).trim().toLowerCase();return models.filter(model=>{
  const tags=builderSections(model);if(filter!=='all'&&!tags.has(filter))return false;
  if(text&&!`${model.name} ${model.id} ${model.buildAssetId||''} ${model.description||''} ${model.behavior||''} ${model.action||''} ${model.function_data?.device||''} ${[...tags].join(' ')}`.toLowerCase().includes(text))return false;
  const nativeId=model.buildAssetId||(model.procedural&&!model.generated?model.id:null),key=!model.custom&&!model.ownedBuilder&&!model.configuration&&nativeId?'native:'+nativeId:model.id;if(seen.has(key))return false;seen.add(key);return true;
 });
}
export function libraryCounts(models){return Object.fromEntries(BUILDER_SECTIONS.map(([id])=>[id,libraryModels(models,id).length]));}
export function createPlacementSelection({load,onState=()=>{}}){
 let generation=0;
 return {cancel(){generation++;onState({status:'idle'});},async select(model){const token=++generation;onState({status:'loading',model});try{const asset=await load(model);if(token!==generation)return null;if(!asset)throw Error('This item has no 3D preview.');onState({status:'ready',model});return asset;}catch(error){if(token===generation)onState({status:'error',model,error});return null;}}};
}

export function catalogRecords(value){if(Array.isArray(value))return value;const records=value?.models||value?.assets||value?.items||value?.data;return records&&records!==value?catalogRecords(records):[];}
