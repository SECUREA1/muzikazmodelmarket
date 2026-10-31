import {FACTORY_LOGISTICS_ITEMS,factoryLogisticsItemSettings} from './public/js/factory-logistics-items.js';
import {INTERACTIVE_DEVICES} from './public/js/interactive-devices.js';
import {catalogItemPrice} from './public/js/game-item-pricing.js';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {BUILDING_MATERIALS,buildingType} from './public/js/building-materials.js';
import {EXTRA_WEAPONS,RANGED_WEAPONS} from './public/js/game-weapons.js';
import {UTILITY_TOOLS} from './public/js/game-utilities.js';
import {FISHING_GEAR} from './public/js/fishing-config.js';
import {SHIPPING_STOCK_ITEMS,shippingStockQuantity} from './public/js/shipping-market.js';
import {FACTORY_TESTING_ITEMS,factoryTestingItemSettings} from './public/js/factory-testing-items.js';
import {FACTORY_ITEMS,factoryItemSettings} from './public/js/missile-factory-items.js';
import {NATIVE_BUILDER_ITEMS,nativeBuilderItem} from './public/js/native-builder-items.js';
import {NATIVE_DESIGN_VERSION,nativeDesignThumbnail} from './public/js/native-design-profile.js';
const json=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const backpack=(await json('./public/models/backpack-assets.json')).assets;
const document=await json('./public/models/glb-models.json');
const models=Array.isArray(document)?document:document.models;
const assetRegistry=await json('./public/models/game-asset-registry.json');
const normalizedAssetPath=value=>{try{return decodeURIComponent(String(value||'')).replace(/^\//,'');}catch{return String(value||'').replace(/^\//,'');}};
const existingModelPaths=new Set([...backpack,...models].map(item=>normalizedAssetPath(item.modelUrl)).filter(Boolean));
// The discovery registry verifies these authored files exist. SVG artwork and
// generated replacement recipes are not offered as downloadable 3D models.
const discoveredModels=assetRegistry.assets.filter(item=>!item.generated&&/^\/?public\/.*\.(?:glb|gltf)$/i.test(item.modelPath||'')&&!existingModelPaths.has(normalizedAssetPath(item.modelPath)));
const basicTools=new Set(['laser','bat','spray','brick','repair-tool','recycler']);
const basicMaterials=new Set(['studs','wood','cement']);
const tools={laser:'Starter laser',bat:'Basic bat',spray:'Paint gun',brick:'Building kit',flamethrower:'Flash Igniter',taser:'Taser',toxin:'Toxins Thrower',dynamite:'Dynamite',jetpack:'Jetpack',...Object.fromEntries(Object.entries(RANGED_WEAPONS).map(([id,item])=>[id,item.label])),...Object.fromEntries(Object.entries(UTILITY_TOOLS).map(([id,item])=>[id,item.label]))};
const toolCosts={jetpack:[750,1],dynamite:[300,25],toxin:[250,5],flamethrower:[400,2],taser:[175,1],medkit:[100,5],'shield-kit':[180,5],scanner:[150,2]};
const extraBuildItems=[['bathroom-vanity','Bathroom Vanity'],['dining-set','Dining Set'],['elevator','Working Elevator'],['fireplace','Modern Fireplace'],['glass-door','Glass Entry Door'],['loft-bed','Loft Bed'],['modular-wall','Modular Building Wall'],['studio-desk','Producer Studio Desk'],['wardrobe','Walk-in Wardrobe']];
const raw=[
 ...SHIPPING_STOCK_ITEMS,
 ...FISHING_GEAR.map(item=>({...item,sku:'tool:'+item.id,toolId:item.id,buildAssetId:item.id,kind:'tool',category:'Fishing tools & tackle',assetType:'tools',useCostMzk:0})),
 ...extraBuildItems.map(([id,name])=>({sku:'backpack:builder-'+id,id:'builder-'+id,name,buildAssetId:id,category:'Builder furniture',kind:'asset',assetType:'props',priceMzk:id==='elevator'?400:150,useCostMzk:1})),
 ...Object.entries(tools).map(([id,name])=>({sku:'tool:'+id,id,name,category:UTILITY_TOOLS[id]?'Utility tools':'Weapons & gear',kind:'tool',basic:basicTools.has(id),priceMzk:toolCosts[id]?.[0]||200,useCostMzk:toolCosts[id]?.[1]||1,toolId:id})),
 ...BUILDING_MATERIALS.map(item=>({sku:'material:'+item.id,id:item.id,name:item.name,category:'Building materials',kind:'material',buildingType:buildingType(item),shape:item.shape||'block',description:item.type==='entertainment'?'Stage and event construction piece. Stackable, paintable, and walkable.':'',basic:basicMaterials.has(item.id),priceMzk:item.shape?120:60,useCostMzk:1,materialId:item.id})),
 ...backpack.filter(item=>item.visibility!=='private'&&!extraBuildItems.some(([id])=>id===item.buildAssetId)&&!FISHING_GEAR.some(gear=>gear.id===item.buildAssetId)).map(item=>({...item,sku:String(item.buildAssetId||'').startsWith('forge-')?'native:'+item.buildAssetId:'backpack:'+item.id,category:item.collection||(['arcade','poker','slots','trivia'].includes(INTERACTIVE_DEVICES[item.buildAssetId]?.kind)?'Arcade & card machines':'Backpack · '+item.type),kind:'asset',assetType:item.type,basic:item.basic===true||item.id==='backpack-dax',priceMzk:item.priceMzk??(item.type==='vehicles'?500:item.type==='avatars'?300:item.type==='lands'?400:100),useCostMzk:item.earnedOnly?0:item.type==='avatars'?0:item.type==='vehicles'?5:1})),

 ...models.filter(item=>item.visibility!=='private'&&item.modelUrl).map(item=>({...item,sku:'repository:'+item.id,category:'Models',kind:'asset',assetType:item.assetType||'props',priceMzk:Math.round(Number(item.price||25)*100),useCostMzk:item.assetType==='avatar'?0:2})),
 ...discoveredModels.map(item=>({id:'discovered-'+item.assetId,sku:'discovered:'+item.assetId,name:item.name,description:'Authored MUZIKAZ '+(item.assetType==='environment'?'environment model':'3D model')+' for editable maps and shared worlds.',category:item.assetType==='environment'||item.assetType==='terrain'?'Map models & environments':'Models',kind:'asset',assetType:item.assetType==='environment'||item.assetType==='terrain'?'lands':item.assetType==='avatar'?'avatars':item.assetType==='vehicle'?'vehicles':'props',format:item.modelPath.split('.').pop().toLowerCase(),modelUrl:item.modelPath,thumbnailUrl:item.thumbnail,priceMzk:500,useCostMzk:2,source:'repository-discovery'}))
];
// Retain published SKUs/prices so existing ownership and receipts remain valid.
// New native definitions automatically enter the same server purchase flow.
const registered = new Set(raw.map(item=>item.buildAssetId || (item.materialId?'material:'+item.materialId:null)).filter(Boolean));
for(const definition of Object.values(NATIVE_BUILDER_ITEMS))if(!registered.has(definition.id)){
 const funhouse=definition.id.startsWith('funhouse-');
 raw.push({...definition,id:'native-'+definition.id,sku:'native:'+definition.id,kind:'asset',assetType:definition.type,priceMzk:funhouse?definition.priceMzk:100,useCostMzk:funhouse?0:1});
 registered.add(definition.id);
}
export const GAME_ECONOMY=raw.map(record=>{
 const logistics=FACTORY_LOGISTICS_ITEMS[record.buildAssetId],testing=FACTORY_TESTING_ITEMS[record.buildAssetId],factory=logistics||testing||FACTORY_ITEMS[record.buildAssetId],item=factory?{...record,...factory,kind:record.kind,category:logistics?'Factory freight & trade':testing?'Factory testing & containment':'Factory & engineering',builderCategory:testing?'factory-testing':'factory',function_data:logistics?factoryLogisticsItemSettings(record.buildAssetId):testing?factoryTestingItemSettings(record.buildAssetId):factoryItemSettings(record.buildAssetId)}:record;
 const priceMzk=catalogItemPrice(item),native=nativeBuilderItem(item.buildAssetId || (item.materialId?'material:'+item.materialId:null));
 const metadata=native?{...native,...item,buildAssetId:native.buildAssetId,behavior:native.behavior,assetType:['avatar','enemy','vehicle','wearable'].includes(native.type)?native.type:item.assetType,builderCategory:item.builderCategory||native.category,description:native.description||item.description,format:'procedural-3d',function_data:factory?item.function_data:{...native.function_data,...item.function_data,behavior:native.behavior},...Object.fromEntries(['vehicleSettings','movementSettings','aiSettings','questSettings','dialogueSettings','environmentSettings','animationState'].filter(key=>native[key]||item[key]).map(key=>[key,{...native[key],...item[key]}]))}:item;
 const designId=native?.id||(item.kind==='tool'?'tool:'+item.toolId:item.builderLayoutId?'layout:'+item.builderLayoutId:null);
 const design=designId?{visualDesign:{version:NATIVE_DESIGN_VERSION,thumbnailUrl:nativeDesignThumbnail(designId)},thumbnailUrl:nativeDesignThumbnail(designId)}:{};
 return {...metadata,...design,native:Boolean(native||item.kind==='tool'||item.builderLayoutId),nativeFunction:native?.behavior||(item.kind==='tool'?item.toolId:item.builderLayoutId?'map-template':null),priceMzk,priceUsd:priceMzk/100,...(item.kind==='material'?{unitPriceMzk:item.basic?0:priceMzk}:{}),useCostMzk:item.basic||String(item.buildAssetId||'').startsWith('forge-')?0:item.kind==='material'?priceMzk:item.useCostMzk};
});
export function economyItem(sku){return GAME_ECONOMY.find(item=>item.sku===sku);}
const modelPath=value=>{try{return decodeURIComponent(String(value||'')).replace(/^\//,'');}catch{return String(value||'').replace(/^\//,'');}};
export function ownsEconomyItem(state,item){if(item?.kind==='stock')return shippingStockQuantity(state,item.shippingSupplyId)>0;return Boolean(item&&(item.basic||state.items?.some(owned=>owned.economySku===item.sku||item.kind==='asset'&&owned.modelUrl&&modelPath(owned.modelUrl)===modelPath(item.modelUrl))));}
export function economyInventory(state){return GAME_ECONOMY.map(item=>({...item,owned:ownsEconomyItem(state,item),...(item.kind==='material'?{stock:Number(state.memory?.materialCredits?.[item.sku]||0)}:item.kind==='stock'?{stock:shippingStockQuantity(state,item.shippingSupplyId)}:{})}));}

export const CARE_SUPPLIES=(await json('./public/models/ioncore-rpg-items.json')).items;
export const BUNDLE_DISCOUNT_PERCENT=20;
const bundleGroups=new Map();
for(const item of GAME_ECONOMY.filter(item=>!item.basic&&!item.earnedOnly)){
 const category=item.category==='Models'?`Models · ${item.assetType||'props'}`:item.category;
 if(!bundleGroups.has(category))bundleGroups.set(category,[]);
 bundleGroups.get(category).push({kind:'upgrade',sku:item.sku,name:item.name,priceMzk:item.priceMzk});
}
for(const item of CARE_SUPPLIES){
 const category=`Care supplies · ${item.category}`;
 if(!bundleGroups.has(category))bundleGroups.set(category,[]);
 bundleGroups.get(category).push({kind:'care',catalogId:item.id,name:item.name,priceMzk:item.price});
}
export const GAME_BUNDLES=[...bundleGroups].flatMap(([category,items])=>{
 const packs=[];
 for(let index=0;index<items.length;index+=6){
  const entries=items.slice(index,index+6).map(item=>({...item,quantity:item.kind==='care'&&items.length===1?3:1}));
  const id='bundle-'+createHash('sha256').update(entries.map(item=>item.sku||item.catalogId).join('|')).digest('hex').slice(0,20);
  packs.push({id,category,name:`${category} bundle${items.length>6?' '+(index/6+1):''}`,discountPercent:BUNDLE_DISCOUNT_PERCENT,entries});
 }
 return packs;
});
export function economyBundleQuote(state,bundle){
 const entries=bundle.entries.filter(entry=>entry.kind==='care'||!ownsEconomyItem(state,economyItem(entry.sku)));
 const subtotalMzk=entries.reduce((sum,item)=>sum+item.priceMzk*item.quantity,0);
 const priceMzk=Math.floor(subtotalMzk*(100-bundle.discountPercent)/100);
 return {...bundle,entries,subtotalMzk,priceMzk,savingsMzk:subtotalMzk-priceMzk,owned:entries.length===0,ownedCount:bundle.entries.length-entries.length};
}
export function economyBundles(state){return GAME_BUNDLES.map(bundle=>economyBundleQuote(state,bundle));}
