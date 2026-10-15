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
 ...backpack.filter(item=>item.visibility!=='private').map(item=>({...item,sku:'backpack:'+item.id,category:'Backpack · '+item.type,kind:'asset',assetType:item.type,basic:item.id==='backpack-dax',priceMzk:item.type==='vehicles'?500:item.type==='avatars'?300:item.type==='lands'?400:100,useCostMzk:item.type==='avatars'?0:item.type==='vehicles'?5:1})),
 ...models.filter(item=>item.visibility!=='private'&&item.modelUrl).map(item=>({...item,sku:'repository:'+item.id,category:'Models',kind:'asset',assetType:item.assetType||'props',priceMzk:Math.round(Number(item.price||25)*100),useCostMzk:item.assetType==='avatar'?0:2}))
];
export const GAME_ECONOMY=raw.map(item=>({...item,priceMzk:item.basic?0:item.priceMzk,useCostMzk:item.basic?0:item.useCostMzk}));
export function economyItem(sku){return GAME_ECONOMY.find(item=>item.sku===sku);}
const modelPath=value=>{try{return decodeURIComponent(String(value||'')).replace(/^\//,'');}catch{return String(value||'').replace(/^\//,'');}};
export function ownsEconomyItem(state,item){return Boolean(item&&(item.basic||state.items?.some(owned=>owned.economySku===item.sku||item.kind==='asset'&&owned.modelUrl&&modelPath(owned.modelUrl)===modelPath(item.modelUrl))));}
export function economyInventory(state){return GAME_ECONOMY.map(item=>({...item,owned:ownsEconomyItem(state,item)}));}
