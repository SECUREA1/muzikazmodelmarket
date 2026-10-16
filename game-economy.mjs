import {INTERACTIVE_DEVICES} from './public/js/interactive-devices.js';
import {catalogItemPrice} from './public/js/game-item-pricing.js';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {BUILDING_MATERIALS} from './public/js/building-materials.js';
import {EXTRA_WEAPONS, RANGED_WEAPONS} from './public/js/game-weapons.js';
import {UTILITY_TOOLS} from './public/js/game-utilities.js';
const json=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const backpack=(await json('./public/models/backpack-assets.json')).assets;
const document=await json('./public/models/glb-models.json');
const models=Array.isArray(document)?document:document.models;
const basicTools=new Set(['laser','bat','spray','brick','repair-tool','recycler']);
const basicMaterials=new Set(['studs','wood','cement']);
const tools={laser:'Starter laser',bat:'Basic bat',spray:'Paint gun',brick:'Building kit',flamethrower:'Flash Igniter',taser:'Taser',toxin:'Toxins Thrower',dynamite:'Dynamite',jetpack:'Jetpack',...Object.fromEntries(Object.entries(RANGED_WEAPONS).map(([id,item])=>[id,item.label])),...Object.fromEntries(Object.entries(UTILITY_TOOLS).map(([id,item])=>[id,item.label]))};
const toolCosts={jetpack:[750,1],dynamite:[300,25],toxin:[250,5],flamethrower:[400,2],taser:[175,1],medkit:[100,5],'shield-kit':[180,5],scanner:[150,2]};
const extraBuildItems=[['bathroom-vanity','Bathroom Vanity'],['dining-set','Dining Set'],['elevator','Working Elevator'],['fireplace','Modern Fireplace'],['glass-door','Glass Entry Door'],['loft-bed','Loft Bed'],['modular-wall','Modular Building Wall'],['studio-desk','Producer Studio Desk'],['wardrobe','Walk-in Wardrobe']];
const raw=[
 ...extraBuildItems.map(([id,name])=>({sku:'backpack:builder-'+id,id:'builder-'+id,name,buildAssetId:id,category:'Builder furniture',kind:'asset',assetType:'props',priceMzk:id==='elevator'?400:150,useCostMzk:1})),
 ...Object.entries(tools).map(([id,name])=>({sku:'tool:'+id,id,name,category:UTILITY_TOOLS[id]?'Utility tools':'Weapons & gear',kind:'tool',basic:basicTools.has(id),priceMzk:toolCosts[id]?.[0]||200,useCostMzk:toolCosts[id]?.[1]||1,toolId:id})),
 ...BUILDING_MATERIALS.map(item=>({sku:'material:'+item.id,id:item.id,name:item.name,category:'Building materials',kind:'material',basic:basicMaterials.has(item.id),priceMzk:item.shape?120:60,useCostMzk:1,materialId:item.id})),
 ...backpack.filter(item=>item.visibility!=='private').map(item=>({...item,sku:'backpack:'+item.id,category:['arcade','poker','slots','trivia'].includes(INTERACTIVE_DEVICES[item.buildAssetId]?.kind)?'Arcade & card machines':'Backpack · '+item.type,kind:'asset',assetType:item.type,basic:item.id==='backpack-dax',priceMzk:item.type==='vehicles'?500:item.type==='avatars'?300:item.type==='lands'?400:100,useCostMzk:item.type==='avatars'?0:item.type==='vehicles'?5:1})),
 ...models.filter(item=>item.visibility!=='private'&&item.modelUrl).map(item=>({...item,sku:'repository:'+item.id,category:'Models',kind:'asset',assetType:item.assetType||'props',priceMzk:Math.round(Number(item.price||25)*100),useCostMzk:item.assetType==='avatar'?0:2}))
];
export const GAME_ECONOMY=raw.map(item=>{const priceMzk=catalogItemPrice(item);return {...item,priceMzk,priceUsd:priceMzk/100,...(item.kind==='material'?{unitPriceMzk:item.basic?0:priceMzk}:{}),useCostMzk:item.basic?0:item.kind==='material'?priceMzk:item.useCostMzk};});
export function economyItem(sku){return GAME_ECONOMY.find(item=>item.sku===sku);}
const modelPath=value=>{try{return decodeURIComponent(String(value||'')).replace(/^\//,'');}catch{return String(value||'').replace(/^\//,'');}};
export function ownsEconomyItem(state,item){return Boolean(item&&(item.basic||state.items?.some(owned=>owned.economySku===item.sku||item.kind==='asset'&&owned.modelUrl&&modelPath(owned.modelUrl)===modelPath(item.modelUrl))));}
export function economyInventory(state){return GAME_ECONOMY.map(item=>({...item,owned:ownsEconomyItem(state,item),...(item.kind==='material'?{stock:Number(state.memory?.materialCredits?.[item.sku]||0)}:{})}));}

export const CARE_SUPPLIES=(await json('./public/models/ioncore-rpg-items.json')).items;
export const BUNDLE_DISCOUNT_PERCENT=20;
const bundleGroups=new Map();
for(const item of GAME_ECONOMY.filter(item=>!item.basic)){
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
