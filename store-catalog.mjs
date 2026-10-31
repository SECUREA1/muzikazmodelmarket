import {GAME_ECONOMY} from './game-economy.mjs';
import {ROAD_ASSETS} from './public/js/cargo-hauling.js';
import {FORGE_ITEMS,forgeNativeItem} from './public/js/forge-items.js';
export const ROAD_STORE_ASSETS=GAME_ECONOMY.filter(item=>ROAD_ASSETS[item.buildAssetId]).map(item=>({...item,assetType:'vehicles',priceUsd:item.priceMzk/100}));
export const FORGE_STORE_ASSETS=GAME_ECONOMY.filter(item=>Object.hasOwn(FORGE_ITEMS,item.buildAssetId||'')).map(item=>({...item,priceMzk:FORGE_ITEMS[item.buildAssetId].priceMzk,priceUsd:FORGE_ITEMS[item.buildAssetId].priceMzk/100}));
export function isForgeStoreDeliverable(item){
 const id=item?.buildAssetId;
 return Boolean(id&&Object.hasOwn(FORGE_ITEMS,id)&&item.format==='procedural-3d'&&item.economySku==='native:'+id&&!item.modelUrl);
}
const COLLECTION_NAMES=Object.freeze({aape:'Originals · Ape',voltwolf:'Legends · Cyber Wolf',sharko:'Beasts · Red Beast',ioncduck:'Crew · Crew Penguin',flaminglow:'Chaos · Chaos Ape'});
export const COLLECTION_PRICES=Object.freeze({aape:39,voltwolf:64,sharko:58,ioncduck:44,flaminglow:69,muzikaz:52,pixella:46,beedeere:55});
export function resolveStoreCart(lines,catalog){
 if(!Array.isArray(lines)||!lines.length||lines.length>50)throw Object.assign(new Error('Choose up to 50 digital models.'),{statusCode:400});
 const items=lines.map(line=>{
  const id=String(line.deliverable?.id||'').replace(/^(?:repository-|store-model-)/,''),asset=[...ROAD_STORE_ASSETS,...FORGE_STORE_ASSETS,...catalog].find(item=>String(item.id).replace(/^(?:repository-|store-model-)/,'')===id||Object.hasOwn(FORGE_ITEMS,item.buildAssetId||'')&&[item.buildAssetId,item.sku].includes(id));
  const forge=asset&&Object.hasOwn(FORGE_ITEMS,asset.buildAssetId||'')?forgeNativeItem(asset.buildAssetId):null;
  if(!asset?.modelUrl&&!ROAD_ASSETS[asset?.buildAssetId]&&!forge)throw Object.assign(new Error('Choose a catalog model with a game deliverable.'),{statusCode:400});
  const quantity=Number(line.quantity);if(!Number.isSafeInteger(quantity)||quantity<1||quantity>100)throw Object.assign(new Error('Invalid model quantity.'),{statusCode:400});
  return {...(forge?{...forge,configuration:{...forge.function_data,buildAssetId:forge.buildAssetId},function_data:forge.function_data,sku:asset.sku,economySku:asset.sku,format:'procedural-3d'}:{}),id:'store-model-'+id,catalogId:id,name:COLLECTION_NAMES[id]||asset.name||asset.title,modelUrl:asset.modelUrl||'',...(ROAD_ASSETS[asset.buildAssetId]?{buildAssetId:asset.buildAssetId,behavior:asset.behavior||'vehicle',format:'procedural-3d',sku:asset.sku,economySku:asset.sku}:{}),thumbnailUrl:asset.thumbnailUrl||forge?.image||'',type:asset.assetType||'prop',assetType:asset.assetType||'prop',quantity,priceUsd:COLLECTION_PRICES[id]??Number(asset.priceUsd??asset.price??25)};
 });
 const subtotal=items.reduce((sum,item)=>sum+item.priceUsd*item.quantity,0),totalUsd=Math.round((subtotal+(subtotal<75?8.95:0)+subtotal*.0825)*100)/100;
 return {items,totalUsd,amountMzk:Math.round(totalUsd*100)};
}
