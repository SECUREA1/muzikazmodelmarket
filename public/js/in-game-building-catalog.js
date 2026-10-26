import {NATIVE_BUILDER_ITEMS} from './native-builder-items.js';
import {normalizeCatalogModel} from './builder-catalog.js';
import {builderSections} from './builder-library.js';
import {deviceDefinition} from './interactive-devices.js';
import {UTILITY_TOOLS} from './game-utilities.js';
import {RANGED_WEAPONS} from './game-weapons.js';

const TOOL_DESCRIPTIONS={
 laser:'Fire a focused energy beam at aimed targets.',
 'pulse-rifle':'Fire fast twin energy pulses at aimed targets.',
 'rail-cannon':'Fire a powerful precision shot at long-range targets.',
 bat:'Swing a baseball bat at close targets.',
 spray:'Paint surfaces with color or draw solid 3D strokes.',
 brick:'Choose a building material, aim a preview, and place stackable pieces.',
 flamethrower:'Ignite the aimed surface; fire burns for 10 seconds.',
 taser:'Shock nearby targets with a short-range electrical hit.',
 toxin:'Launch an illuminated close-range toxin burst.',
 dynamite:'Throw a timed explosive with a 4.5-metre blast radius.',
 jetpack:'Hold jump to rise and forward to fly; powered at 1 MZK per second.'
};
const ROOM_IDS=new Set(['grand-floor','open-studio','connected-suite','garden-courtyard']);
const CATEGORY_LABELS={
 rooms:'Foundations & rooms',materials:'Building materials','scene-layouts':'Maps & layouts',
 buildings:'Buildings',interior:'Furniture & interiors',landscape:'Landscape & gardens',
 plants:'Trees & plants',terrain:'Terrain & water',props:'Props & utilities',
 interactive:'Interactive devices',sports:'Sports',arcade:'Arcade & games',
 fitness:'Fitness & gym',factory:'Factory & engineering',vehicles:'Vehicles',
 characters:'Characters',creatures:'Creatures',weapons:'Weapons & pickups',wearables:'Wearables',
 environments:'GLB maps & environments','summer-camp':'Summer camp',audio:'Music & audio',
 video:'Screens & media',services:'Shops & services',tools:'Tools & equipment'
};
const categoryFor=item=>item.materialId?'materials':ROOM_IDS.has(item.id)?'rooms':item.category==='seating'?'seats':item.category||'props';
const isSeat=item=>(item.behavior||item.function_data?.behavior)==='seat';
const readable=value=>String(value||'').replace(/[-_]/g,' ');
const labelFor=category=>category==='seats'?'Seats & benches':CATEGORY_LABELS[category]||readable(category);
const FUNCTION_LABELS={all:'All functions',decor:'Place & decorate',seat:'Sit',vehicle:'Vehicles',drive:'Drive',fly:'Fly',boat:'Sail & cruise',construction:'Construction',hockey:'Play hockey',talk:'Talk',quest:'Quests',pickup:'Pick up',heal:'Heal',door:'Doors & portals',hostile:'Combat',patrol:'Patrol',interact:'Interact',craft:'Craft & engineer',audio:'Play audio',video:'Show media',services:'Shop & trade',arcade:'Play games',equip:'Equip a tool'};
export const BUILDING_CATALOG_FUNCTIONS=Object.freeze(Object.entries(FUNCTION_LABELS).map(([id,label])=>Object.freeze({id,label})));

function functionsFor(item){
 const values=new Set([item.behavior||item.function_data?.behavior||'decor']),sections=builderSections(item);
 if(item.action&&item.action!=='none')values.add(item.action);
 if(item.vehicleSettings?.mode)values.add(item.vehicleSettings.mode);
 if(item.function_data?.factoryStation)values.add('craft');
 if(item.toolId){values.add('equip');values.add(item.toolId);}
 for(const section of ['audio','video','services','arcade'])if(sections.has(section))values.add(section);
 return Object.freeze([...values]);
}
function describeItem(item,source='native'){
 const catalogCategory=categoryFor(item),catalogCategoryLabel=labelFor(catalogCategory);
 return Object.freeze({...item,catalogCategory,catalogCategoryLabel,catalogSource:source,catalogFunctions:functionsFor(item),
  thumbnailUrl:item.thumbnailUrl||item.thumbnail_url||item.image||'',
  catalogDescription:item.description||`${catalogCategoryLabel} · ${isSeat(item)?'Place a seat in your world.':'Place and configure this item in your world.'}`});
}

// Use the same native identities and settings as the editor and server economy.
// Browsing this catalogue never creates an owned item or copies a live actor.
export const IN_GAME_BUILDING_ITEMS=Object.freeze(Object.values(NATIVE_BUILDER_ITEMS).map(item=>describeItem(item)));

export function buildingCatalogCategories(items=IN_GAME_BUILDING_ITEMS){
 const populated=new Set(items.flatMap(item=>[categoryFor(item),...builderSections(item)]));
 const categoryIds=[...Object.keys(CATEGORY_LABELS).filter(id=>populated.has(id)),
  ...[...new Set(items.map(categoryFor))].filter(id=>id!=='seats'&&!Object.hasOwn(CATEGORY_LABELS,id)).sort()];
 return Object.freeze([
  Object.freeze({id:'all',label:'All items',count:items.length}),
  Object.freeze({id:'seats',label:'Seats & benches',count:items.filter(isSeat).length}),
  ...categoryIds.map(id=>Object.freeze({id,label:labelFor(id),count:items.filter(item=>matchesBuildingCatalogItem(item,id)).length}))
 ]);
}
export const BUILDING_CATALOG_CATEGORIES=buildingCatalogCategories();

// The server economy already includes the deposited GLBs, discovered environment
// files and their distinct companion/wearable variants. Keep its purchase IDs;
// looking through the catalog never grants ownership or fabricates a new SKU.
export function createBuildingCatalog(economyItems=[]){
 const native=IN_GAME_BUILDING_ITEMS.map(item=>{
  const matches=economyItems.filter(record=>record.buildAssetId===item.buildAssetId||item.materialId&&record.materialId===item.materialId);
  const upgrade=matches.find(record=>record.owned===true||record.basic===true)||matches[0];
  if(!upgrade)return item;
  return describeItem({...item,economySku:upgrade.sku||upgrade.economySku,owned:upgrade.owned===true,basic:upgrade.basic===true,
   ...Object.fromEntries(['priceMzk','useCostMzk','unitPriceMzk','stock'].filter(key=>upgrade[key]!==undefined).map(key=>[key,upgrade[key]]))});
 });
 const seen=new Set(),glb=[];
 for(const raw of economyItems){
  if(raw.buildAssetId||raw.visibility==='private'||raw.status==='inactive')continue;
  const modelUrl=raw.modelUrl||raw.glb_url;
  if(!/\.(?:glb|gltf)(?:[?#]|$)/i.test(modelUrl||''))continue;
  const normalized=normalizeCatalogModel(raw,glb.length);if(!normalized)continue;
  const sku=raw.sku||raw.economySku,key=sku||raw.id||modelUrl;if(seen.has(key))continue;seen.add(key);
  const kind=String(raw.assetType||raw.type||'').toLowerCase();
  const category=/\/environments\//i.test(modelUrl)||kind==='environment'?'environments':/pet|companion/.test(kind)?'creatures':normalized.category;
  // Match authoritative-room's purchased-asset spawn contract. The editor's
  // generic avatar defaults (talk, 1.8 m) do not describe deployed GLB items.
  const settings={...raw.function_data,...raw.interaction_data,...raw.configuration};
  const device=deviceDefinition(raw.id,raw.function_data||{});
  const behavior=settings.behavior||raw.behavior||(device?'interact':['vehicle','vehicles'].includes(raw.assetType)?'vehicle':raw.assetType==='pets'?'patrol':'interact');
  glb.push(describeItem({...raw,...normalized,id:'glb:'+key,sourceId:raw.id||normalized.sourceId,
   category,modelUrl,modelScale:typeof raw.scale==='number'?raw.scale:1,economySku:sku,
   targetHeight:raw.targetHeight??null,behavior,action:settings.action||raw.action,
   function_data:{...settings,behavior},
   vehicleSettings:raw.vehicleSettings,movementSettings:raw.movementSettings,aiSettings:raw.aiSettings,
   questSettings:raw.questSettings||settings.quest,dialogueSettings:raw.dialogueSettings||settings.dialogue,
   environmentSettings:raw.environmentSettings,animationState:raw.animationState,
   // Keep explicit authored sizing through tray JSON and saved drafts, too.
   owned:raw.owned===true,basic:raw.basic===true,description:raw.description||'',thumbnailUrl:raw.thumbnailUrl||raw.thumbnail_url||raw.image||''},'glb'));
 }
 const tools=economyItems.filter(raw=>raw.kind==='tool'&&raw.toolId&&raw.visibility!=='private'&&raw.status!=='inactive')
  .filter((raw,index,records)=>records.findIndex(record=>(record.sku||record.economySku||record.toolId)===(raw.sku||raw.economySku||raw.toolId))===index)
  .map(raw=>describeItem({...raw,id:'tool:'+raw.toolId,sourceId:raw.id,economySku:raw.sku||raw.economySku,
   type:'tool',category:'tools',buildAssetId:undefined,modelUrl:undefined,behavior:'equip',action:'equip',owned:raw.owned===true,basic:raw.basic===true,
   description:raw.description||UTILITY_TOOLS[raw.toolId]?.description||RANGED_WEAPONS[raw.toolId]?.description||TOOL_DESCRIPTIONS[raw.toolId]||`Equip ${raw.name||readable(raw.toolId)} from your tools pouch to use it in this world.`},'tool'));
 return Object.freeze([...native,...glb,...tools]);
}

export function matchesBuildingCatalogItem(item,category='all',query='',{source='all',functionId='all'}={}){
 if(!item)return false;
 if(source!=='all'&&(item.catalogSource||'native')!==source)return false;
 if(functionId!=='all'&&!(item.catalogFunctions||functionsFor(item)).includes(functionId))return false;
 const matchesCategory=category==='all'||category==='seats'&&isSeat(item)
  ||category==='map'&&item.id==='grand-floor'
  ||category==='room'&&ROOM_IDS.has(item.id)&&item.id!=='grand-floor'
  ||category!=='seats'&&(categoryFor(item)===category||!['materials','rooms','terrain'].includes(category)&&builderSections(item).has(category));
 if(!matchesCategory)return false;
 const words=String(query||'').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
 if(!words.length)return true;
 const text=[item.name,item.description,item.catalogDescription,item.catalogCategoryLabel,
  labelFor(categoryFor(item)),item.category,item.type,item.behavior,item.action,item.id,
  item.function_data?.prompt,item.function_data?.behavior,item.function_data?.action,item.catalogSource,
  ...(item.catalogFunctions||functionsFor(item)),...builderSections(item),
  ...(Array.isArray(item.tags)?item.tags:[]),...(Array.isArray(item.keywords)?item.keywords:[])].filter(Boolean).join(' ').toLocaleLowerCase();
 return words.every(word=>text.includes(word));
}
