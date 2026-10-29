const fail=message=>{throw Object.assign(new Error(message),{statusCode:409});};
const clone=value=>JSON.parse(JSON.stringify(value));
export function ensureFactoryLineage(ledger,{now=Date.now()}={}){
 ledger.factoryLots ||= {};ledger.factoryLotAllocations ||= {};ledger.factoryStockReceipts ||= {};
 if(!ledger.lineageVersion){
  // Existing balances have already been awarded. Adopt their provenance without
  // generating more inventory when upgrading or reopening the database.
  for(const job of Object.values(ledger.production||{}))if(job.phase==='ready')job.outputRecorded=true;
  ledger.lineageVersion=1;
 }
 for(const [itemId,quantity] of Object.entries(ledger.factoryStock||{})){
  const tracked=Object.values(ledger.factoryLots).filter(lot=>lot.itemId===itemId).reduce((sum,lot)=>sum+lot.availableQuantity,0);
  if(tracked>quantity)fail('Factory lot quantities do not match warehouse stock.');
  if(tracked<quantity){const id='legacy:'+itemId+':'+Object.keys(ledger.factoryLots).length;ledger.factoryLots[id]={id,itemId,quantity:quantity-tracked,availableQuantity:quantity-tracked,origin:'legacy-stock',productionId:null,createdAt:now,stageConfirmations:[]};}
 }
 return ledger;
}
export function recordFactoryOutput(ledger,job,{now=Date.now()}={}){
 ensureFactoryLineage(ledger,{now});const id='production:'+job.id;
 if(ledger.factoryLots[id])return ledger.factoryLots[id];
 if(job.outputRecorded)return null;
 if(job.phase!=='ready'||job.readyAt>now||!Number.isSafeInteger(job.quantity)||job.quantity<1)fail('Only completed, packed production can create a factory lot.');
 if(job.schemaVersion>=2&&(job.stages?.length!==4||job.stages.some(stage=>stage.phase!=='complete'||stage.operations?.some(operation=>operation.phase!=='complete'))))fail('Every manufacturing operation must finish before creating a stock lot.');
 if(job.schemaVersion>=3&&!/^[a-f0-9]{64}$/.test(job.packingReceipt?.sealHash||''))fail('A verified packing seal is required for factory output.');
 const lot={id,itemId:job.itemId,quantity:job.quantity,availableQuantity:job.quantity,origin:'production',legacyCompletion:job.schemaVersion<3,productionId:job.id,itemPlanId:job.itemPlanId||job.recipe?.itemPlanId||null,fingerprint:job.fingerprint||job.recipe?.fingerprint||null,blueprint:clone(job.blueprint||job.recipe?.blueprint||{}),qualityReceipt:clone(job.qualityReceipt||null),packingReceipt:clone(job.packingReceipt||null),stageConfirmations:(job.stages||[]).map(stage=>({stageId:stage.id,completedAt:stage.completedAt||stage.readyAt,operationIds:(stage.operations||[]).map(operation=>operation.id)})),createdAt:job.completedAt||now};
 ledger.factoryLots[id]=lot;ledger.factoryStock[job.itemId]=(ledger.factoryStock[job.itemId]||0)+job.quantity;job.outputRecorded=true;job.outputLotId=id;return lot;
}
export function allocateFactoryLots(ledger,shipment,{now=Date.now(),lotId,orderId}={}){
 ensureFactoryLineage(ledger,{now});const prior=ledger.factoryLotAllocations[shipment.id];if(prior)return prior;
 const factory=!shipment.sourceMapId||shipment.sourceMapId==='factory',allocation={shipmentId:shipment.id,itemId:shipment.itemId,quantity:shipment.quantity,phase:'allocated',sourceMapId:shipment.sourceMapId||'factory',origin:factory?'factory-output':'warehouse-transfer',lots:[],createdAt:now};
 if(factory){
  if((ledger.factoryStock[shipment.itemId]||0)<shipment.quantity)fail('Factory stock is insufficient for this shipment.');
  let remaining=shipment.quantity;
  for(const lot of Object.values(ledger.factoryLots).filter(lot=>lot.itemId===shipment.itemId&&lot.availableQuantity>0&&(!lotId||lot.id===lotId)&&(!lot.reservedOrderId||lot.reservedOrderId===orderId)).sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id))){const quantity=Math.min(remaining,lot.availableQuantity);lot.availableQuantity-=quantity;remaining-=quantity;allocation.lots.push({lotId:lot.id,quantity});if(!remaining)break;}
  if(remaining)fail('The factory shipment could not reserve its production lots.');
  ledger.factoryStock[shipment.itemId]-=shipment.quantity;
 }
 ledger.factoryLotAllocations[shipment.id]=allocation;return allocation;
}
export function returnFactoryLots(ledger,shipment,{now=Date.now()}={}){
 const allocation=ledger.factoryLotAllocations?.[shipment.id];
 if(!allocation)return false; // Legacy escrow is returned by the existing source-count path.
 if(allocation.phase==='returned')return true;
 if(allocation.phase!=='allocated')fail('Delivered stock cannot be returned to the factory.');
 if(allocation.origin==='factory-output'){
  for(const line of allocation.lots){const lot=ledger.factoryLots[line.lotId];if(!lot)fail('The reserved factory lot is unavailable.');lot.availableQuantity+=line.quantity;}
  ledger.factoryStock[shipment.itemId]=(ledger.factoryStock[shipment.itemId]||0)+shipment.quantity;
 }
 allocation.phase='returned';allocation.returnedAt=now;return allocation.origin==='factory-output';
}
export function deliverFactoryLots(ledger,shipment,{now=Date.now()}={}){
 const allocation=ledger.factoryLotAllocations?.[shipment.id];if(!allocation)return null;
 if(allocation.phase==='delivered')return allocation;
 if(allocation.phase!=='allocated')fail('The source stock reservation is no longer available.');
 allocation.phase='delivered';allocation.deliveredAt=now;allocation.deliveryId=shipment.deliveryId;allocation.destinationMapId=shipment.destinationMapId;return allocation;
}
