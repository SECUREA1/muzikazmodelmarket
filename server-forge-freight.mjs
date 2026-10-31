import {randomUUID} from 'node:crypto';
import {ownedForgeItem,canonicalForgeItem} from './forge-item-provenance.mjs';
import {supplyItem} from './world-supply.mjs';
import {ensureFactoryLineage} from './world-factory-lineage.mjs';
import {recordForgeCommerce} from './forge-commerce.mjs';

const fail=(message,statusCode=409)=>{throw Object.assign(Error(message),{statusCode});};
/** The owner seals one hand-forged creation into one finite warehouse unit.
 * Its original Backpack copy is consumed; destination stock still waits for
 * verified shipping. Call only within the shared account transaction. */
export function exportForgeFreight(data,wallet,input,ledger,now){
 const itemId=String(input.itemId||''),user=data.users?.[wallet];
 if(!user)fail('Sign in to seal a forged creation for shipping.',401);
 const prior=(data.transactions||[]).find(row=>row.type==='FORGE_FREIGHT_EXPORT'&&row.sourceItemId===itemId);
 if(prior)fail('This forged creation is already sealed in the world freight warehouse.');
 const proof=ownedForgeItem(data,wallet,itemId);
 if(!proof?.crafted)fail('Choose a hand-forged creation currently in your Backpack.',403);
 const owned=user.items.find(item=>item.id===itemId);
 if(owned.listing?.active)fail('Remove this creation from the Trading Market before sealing it for freight.');
 const native=canonicalForgeItem(proof),catalog=supplyItem(data,'native:'+proof.buildAssetId);
 if(!native||catalog.buildAssetId!==proof.buildAssetId)fail('The forged item is not available in the shared shipping catalog.',503);
 ensureFactoryLineage(ledger,{now});
 const lotId='forge:'+proof.proofId,receiptId='forge-freight:'+randomUUID();
 if(ledger.factoryLots[lotId])fail('This forge work order has already entered warehouse stock.');
 const available=ledger.factoryStock[catalog.supplyId]||0;
 if(!Number.isSafeInteger(available)||!Number.isSafeInteger(available+1))fail('The warehouse cannot accept another unit.');
 const forged=(data.transactions||[]).find(row=>row.id===proof.proofId&&row.type==='FORGE_ITEM_CREATED');
 if(!forged)fail('The original forging receipt is unavailable.',503);
 ledger.factoryLots[lotId]={id:lotId,itemId:catalog.supplyId,quantity:1,availableQuantity:1,origin:'traditional-forge',productionId:null,forgeWalletId:wallet,forgeReceiptId:proof.proofId,forgeExportReceiptId:receiptId,recipeId:proof.recipeId,blueprint:{buildAssetId:proof.buildAssetId,name:native.name},qualityReceipt:{id:proof.proofId,kind:'traditional-forge',completedStages:['heat','hammer','quench','temper','finish'],materials:structuredClone(proof.materials||[])},packingReceipt:{id:receiptId,sealed:true,source:'traditional-forge'},stageConfirmations:[],createdAt:now};
 ledger.factoryStock[catalog.supplyId]=available+1;
 user.items=user.items.filter(item=>item.id!==itemId);
 const receipt={id:receiptId,type:'FORGE_FREIGHT_EXPORT',walletId:wallet,sourceItemId:itemId,forgeReceiptId:proof.proofId,recipeId:proof.recipeId,buildAssetId:proof.buildAssetId,itemId:catalog.supplyId,lotId,quantity:1,amountMzk:0,requestId:input.requestId,createdAt:new Date(now).toISOString()};
 (data.transactions ||= []).push(receipt);
 const job=data.forge?.accounts?.[wallet]?.job;if(job?.itemId===itemId){job.exportedAt=now;job.exportLotId=lotId;}
 return {itemId:catalog.supplyId,sourceItemId:itemId,lotId,quantity:1,sourceMapId:'factory',forgeReceipt:receipt,message:native.name+' sealed for world freight. Its Backpack copy moved into one counted warehouse unit. Dispatch it and complete the sea delivery to restock a world, shop or deed.'};
}

/** Count real inventory arrival, including each final addressed drop-off.
 * A reservation, departure, sea-only arrival or replay cannot earn credit. */
export function reconcileForgeFreightDeliveries(data,ledger){
 for(const receipt of Object.values(ledger.factoryStockReceipts||{})){
  if(!receipt.shipmentId||!(receipt.quantity>0))continue;
  const allocation=ledger.factoryLotAllocations?.[receipt.shipmentId];
  if(allocation?.phase!=='delivered')continue;
  for(const line of receipt.lotAllocations||allocation.lots||[]){
   const lot=ledger.factoryLots?.[line.lotId];
   if(lot?.origin!=='traditional-forge'||!lot.forgeWalletId||!(line.quantity>0))continue;
   recordForgeCommerce(data,lot.forgeWalletId,'deliveries',receipt.shipmentId+':'+lot.id);
  }
 }
}

export function exportableForgeFreight(data,wallet){
 if(!wallet)return [];
 return (data.users?.[wallet]?.items||[]).filter(item=>String(item.id||'').startsWith('forge-item:')&&!item.listing?.active).flatMap(item=>{const proof=ownedForgeItem(data,wallet,item.id),native=proof?.crafted&&canonicalForgeItem(proof);return native?[{id:item.id,name:native.name,buildAssetId:proof.buildAssetId,thumbnailUrl:native.thumbnailUrl||native.image,recipeId:proof.recipeId}]:[];});
}
