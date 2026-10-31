import {FORGE_RECIPES,forgeRecipe} from './public/js/forge-recipes.js';
import {forgeNativeItem} from './public/js/forge-items.js';

const products=new Set(FORGE_RECIPES.map(recipe=>recipe.buildAssetId));
const ownerKey=(proofId,itemId)=>proofId+'\n'+itemId;
export const forgeItemLike=item=>Boolean(item&&(item.type==='forge-item'||item.source==='traditional-forge'||String(item.id||'').startsWith('forge-item:')||products.has(item.buildAssetId)));
function receiptOwner(data,receipt,itemId){
 const indexed=data.forgeItemOwnership?.[ownerKey(receipt.id,itemId)];
 if(indexed)return indexed.walletId;
 let owner=receipt.walletId;
 for(const trade of data.trades||[])if(trade.itemId===itemId&&trade.sellerId===owner&&String(trade.createdAt)>=String(receipt.createdAt))owner=trade.buyerId;
 return owner;
}
/** Immutable receipts and a durable transfer index authorize portable outputs. */
export function ownedForgeItem(data,wallet,itemId){
 if(typeof itemId!=='string'||!data.users?.[wallet]?.items?.some(item=>item.id===itemId))return null;
 for(const ownReceipt of [true,false])for(const receipt of data.transactions||[]){
  if(Boolean(receipt.walletId===wallet)!==ownReceipt)continue;
  let buildAssetId=null,sku=null,crafted=false;
  if(receipt.type==='FORGE_ITEM_CREATED'&&receipt.itemId===itemId){buildAssetId=forgeRecipe(receipt.recipeId)?.buildAssetId;crafted=true;}
  else if(receipt.type==='GAME_ITEM_PURCHASE'&&itemId==='economy:'+receipt.sku){sku=receipt.sku;buildAssetId=sku?.startsWith('native:')?sku.slice(7):null;}
  else if(receipt.type==='GAME_BUNDLE_PURCHASE'){const line=receipt.items?.find(line=>line.kind==='upgrade'&&itemId==='economy:'+line.sku);if(line){sku=line.sku;buildAssetId=sku?.startsWith('native:')?sku.slice(7):null;}}
  else if(['STORE_PURCHASE','VERIFIED_STORE_PURCHASE'].includes(receipt.type))buildAssetId=receipt.items?.find(item=>item.id===itemId)?.buildAssetId;
  if(!products.has(buildAssetId))continue;
  if(receiptOwner(data,receipt,itemId)!==wallet)continue;
  return {id:itemId,buildAssetId,recipeId:crafted?receipt.recipeId:null,jobId:crafted?receipt.jobId:null,proofId:receipt.id,crafted,sku,acquiredAt:receipt.createdAt,materials:crafted?forgeRecipe(receipt.recipeId)?.materials:undefined};
 }
 return null;
}
export function transferForgeItem(data,proof,seller,buyer,now){
 if(!proof)return;
 data.forgeItemOwnership ||= {};
 data.forgeItemOwnership[ownerKey(proof.proofId,proof.id)]={walletId:buyer,itemId:proof.id,proofId:proof.proofId,transferredFrom:seller,transferredAt:now};
}
export function canonicalForgeItem(proof){
 const native=forgeNativeItem(proof?.buildAssetId);if(!native)return null;
 const configuration={...native.function_data,buildAssetId:proof.buildAssetId};
 return {...native,id:proof.id,type:proof.crafted?'forge-item':'game-upgrade',assetType:'props',format:'procedural-3d',source:proof.crafted?'traditional-forge':'game-market',...(proof.sku?{economySku:proof.sku}:{}),configuration,function_data:configuration,forgeProvenance:{receiptId:proof.proofId,recipeId:proof.recipeId,jobId:proof.jobId,materials:proof.materials},listing:{active:false},acquiredAt:proof.acquiredAt};
}
