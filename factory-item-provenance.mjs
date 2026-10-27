import {GAME_ECONOMY} from './game-economy.mjs';
import {FACTORY_RECIPES} from './public/js/missile-factory-config.js';
import {PROVING_PROFILES,PROVING_ID} from './public/js/factory-test-config.js';

// This index lives beside immutable economy receipts, outside editable user
// items. It preserves ownership after the public trade feed has been trimmed.
const ownerKey=(wallet,itemId)=>wallet+'\n'+itemId;
function receiptOwner(data,receipt,itemId){
 let owner=receipt.walletId;
 for(const trade of data.trades||[])if(trade.itemId===itemId&&trade.sellerId===owner&&String(trade.createdAt)>=String(receipt.createdAt))owner=trade.buyerId;
 return owner;
}
export function ownedFactoryModel(data,wallet,itemId){
 if(typeof itemId!=='string'||!data.users?.[wallet]?.items?.some(item=>item.id===itemId))return null;
 const saved=data.factoryModelOwnership?.[ownerKey(wallet,itemId)];
 // Personal purchase receipts take precedence over another player's identical
 // catalogue instance id. Crafted models already have globally distinct ids.
 for(const ownReceipt of [true,false])for(const receipt of data.transactions||[]){
  if(Boolean(receipt.walletId===wallet)!==ownReceipt||saved&&receipt.id!==saved.proofId)continue;
  let model=null,sku=null;
  if(receipt.type==='FACTORY_ITEM_CREATED'&&receipt.itemId===itemId)model=FACTORY_RECIPES.find(recipe=>recipe.id===receipt.recipeId)?.buildAssetId;
  else if(receipt.type==='GAME_ITEM_PURCHASE'&&itemId==='economy:'+receipt.sku){sku=receipt.sku;model=GAME_ECONOMY.find(item=>item.sku===sku)?.buildAssetId;}
  else if(receipt.type==='GAME_BUNDLE_PURCHASE'){const line=(receipt.items||[]).find(item=>item.kind==='upgrade'&&itemId==='economy:'+item.sku);if(line){sku=line.sku;model=GAME_ECONOMY.find(item=>item.sku===sku)?.buildAssetId;}}
  else if(['STORE_PURCHASE','VERIFIED_STORE_PURCHASE'].includes(receipt.type)){const line=(receipt.items||[]).find(item=>item.id===itemId);if(line)model=line.buildAssetId;}
  const profile=PROVING_PROFILES.find(value=>value.buildAssetId===model);if(!profile)continue;
  if(saved? saved.walletId!==wallet||saved.itemId!==itemId:receiptOwner(data,receipt,itemId)!==wallet)continue;
  return {id:itemId,name:profile.id==='accuracy'?'Aster Training Missile':'Orbit Cargo Rocket',buildAssetId:model,profileId:profile.id,sku,proofId:receipt.id,lockKey:receipt.id+':'+itemId};
 }
 return null;
}
export function transferFactoryModel(data,proof,seller,buyer,now){
 if(!proof)return;
 data.factoryModelOwnership||={};delete data.factoryModelOwnership[ownerKey(seller,proof.id)];
 data.factoryModelOwnership[ownerKey(buyer,proof.id)]={walletId:buyer,itemId:proof.id,proofId:proof.proofId,transferredAt:now};
}
export function factoryModelCertification(data,proof){
 if(!proof)return null;const certificate=data.factoryLogistics?.certificates?.[proof.lockKey];
 if(certificate?.proofId!==proof.proofId||certificate.itemId!==proof.id||certificate.buildAssetId!==proof.buildAssetId)return null;
 const receipts=data.transactions||[],test=receipts.find(row=>row.id===certificate.testReceiptId&&row.type==='FACTORY_TEST_COMPLETE'&&row.walletId===certificate.issuedTo&&row.environmentId===PROVING_ID&&row.itemId===proof.id&&row.proofId===proof.proofId&&row.profileId===proof.profileId&&row.qualified===true&&row.score===certificate.score&&Number.isSafeInteger(row.score)&&row.score>=40&&row.score<=100);
 return test&&receipts.some(row=>row.type==='FACTORY_CERTIFICATE_ISSUED'&&row.certificateId===certificate.id&&row.itemId===proof.id&&row.proofId===proof.proofId)?certificate:null;
}
export function factoryModelTestLocked(data,proof,now=Date.now()){
 const lock=proof&&data.factoryTesting?.itemLocks?.[proof.lockKey];return Boolean(lock&&lock.expiresAt>now);
}
