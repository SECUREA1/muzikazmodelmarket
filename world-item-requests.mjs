import {randomUUID} from 'node:crypto';

const fail=(message,statusCode=409)=>{throw Object.assign(new Error(message),{statusCode});};
const whole=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const text=(value,max=120)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);
const key=value=>typeof value==='string'&&value.length>0&&value.length<=500&&!['__proto__','prototype','constructor'].includes(value);
const terminal=record=>['delivered','cancelled'].includes(record.phase);
const sourceFor=lot=>lot.origin==='traditional-forge'?'forge':lot.origin==='production'?'factory':null;
const profileName=(data,wallet)=>text(data.users?.[wallet]?.memory?.profile?.displayName||data.users?.[wallet]?.memory?.profile?.username||'World maker');
const copy=value=>structuredClone(value);

export function ensureWorldItemRequests(ledger){ledger.itemRequests ||= {};return ledger.itemRequests;}
function requestFor(ledger,input){
 const id=input?.inventoryRequestId;
 if(!key(id)||!Object.hasOwn(ensureWorldItemRequests(ledger),id))fail('Choose a current world inventory request.',404);
 return ledger.itemRequests[id];
}
function member(data,wallet){const user=data.users?.[wallet];if(!user)fail('Sign in to use world inventory requests.',401);return user;}
function validAddress(record,addressValid){return typeof addressValid==='function'&&addressValid(record)===true;}
function requireAddress(record,addressValid){if(!validAddress(record,addressValid))fail('The receiving address or owner changed. Review this request before continuing.');}

/** Only canonical, paid and fully finished creation lots count as a maker's
 * supply. Seeded warehouse stock and editable map objects are never evidence. */
function completedOwnedLot(data,ledger,wallet,lot,now){
 if(!lot||!whole(lot.quantity,1)||!key(lot.id)||!key(lot.itemId))return false;
 if(lot.origin==='traditional-forge'){
  if(lot.forgeWalletId!==wallet||!lot.packingReceipt?.sealed||lot.packingReceipt?.id!==lot.forgeExportReceiptId)return false;
  if(!['heat','hammer','quench','temper','finish'].every(stage=>lot.qualityReceipt?.completedStages?.includes(stage)))return false;
  return (data.transactions||[]).some(receipt=>receipt.id===lot.forgeExportReceiptId&&receipt.type==='FORGE_FREIGHT_EXPORT'&&receipt.walletId===wallet&&receipt.lotId===lot.id&&receipt.itemId===lot.itemId&&receipt.quantity===1)
   &&(data.transactions||[]).some(receipt=>receipt.id===lot.forgeReceiptId&&receipt.type==='FORGE_ITEM_CREATED');
 }
 if(lot.origin!=='production')return false;
 const job=ledger.production?.[lot.productionId];
 return !!(job&&job.ownerId===wallet&&job.schemaVersion>=3&&job.phase==='ready'&&job.itemId===lot.itemId&&job.outputRecorded&&job.outputLotId===lot.id&&job.readyAt<=now&&job.completedAt<=now
  &&job.stages?.length===4&&job.stages.every(stage=>stage.phase==='complete'&&Array.isArray(stage.operations)&&stage.operations.length>0&&stage.operations.every(operation=>operation.phase==='complete'))
  &&/^[a-f0-9]{64}$/.test(job.packingReceipt?.sealHash||'')&&lot.packingReceipt?.sealHash===job.packingReceipt.sealHash);
}

export function eligibleWorldItemRequestLots(data,ledger,wallet,requestOrItemId,{now=Date.now()}={}){
 const itemId=typeof requestOrItemId==='string'?requestOrItemId:requestOrItemId?.itemId,source=requestOrItemId&&typeof requestOrItemId==='object'?requestOrItemId.source:'any';
 return Object.values(ledger.factoryLots||{}).filter(lot=>(!itemId||lot.itemId===itemId)&&whole(lot.availableQuantity,1)&&!lot.reservedOrderId&&(!source||source==='any'||sourceFor(lot)===source)&&completedOwnedLot(data,ledger,wallet,lot,now))
  .sort((a,b)=>(a.createdAt||0)-(b.createdAt||0)||a.id.localeCompare(b.id)).slice(0,1000)
  .map(lot=>({id:lot.id,itemId:lot.itemId,quantity:lot.quantity,availableQuantity:lot.availableQuantity,source:sourceFor(lot),productionId:lot.productionId||null,createdAt:lot.createdAt}));
}

export function createWorldItemRequest(data,ledger,wallet,input,{item,address,now=Date.now(),id=randomUUID(),call=null,shippingMapId,contractId,onwardMode='road'}={}){
 const user=member(data,wallet),requests=ensureWorldItemRequests(ledger);
 if(!key(input.requestId))fail('A request identifier is required.',422);
 if(!item||!key(item.supplyId)||item.privateFactoryBlueprint)fail('Choose a publicly available canonical item.',422);
 if(!address||!key(address.id)||!key(address.mapId)||!key(address.recipientId)||!key(address.revision))fail('Choose a current verified receiving address.',422);
 if(input.addressId!==undefined&&input.addressId!==address.id||input.expectedAddressRevision!==undefined&&input.expectedAddressRevision!==address.revision)fail('The receiving address changed. Review its current details.');
 const quantity=input.quantity,rewardMzk=input.rewardMzk,source=call?.source||input.source||'any';
 if(!whole(quantity,1,100))fail('Choose a whole request quantity from 1 to 100.',422);
 if(!whole(rewardMzk,1,1000000))fail('Choose a whole total reward from 1 to 1,000,000 MZK.',422);
 if(!['forge','factory','any'].includes(source))fail('Choose forge, factory or any completed creation.',422);
 const signature=JSON.stringify([item.supplyId,address.id,address.revision,quantity,rewardMzk,source,call?.id||null,shippingMapId||null,contractId||null,onwardMode]);
 const prior=Object.values(requests).find(record=>record.ownerId===wallet&&record.createRequestId===input.requestId);
 if(prior){if(prior.createSignature!==signature)fail('This request identifier was already used with different details.');return prior;}
 if(!key(id)||Object.hasOwn(requests,id))fail('The inventory request identifier is unavailable.');
 if(Object.values(requests).filter(record=>record.ownerId===wallet&&!terminal(record)).length>=20)fail('Finish or cancel an existing request before creating another.');
 if(call?.id&&Object.values(requests).some(record=>record.originCallId===call.id&&!terminal(record)))fail('This inventory call already has an active funded request.');
 if(!Number.isFinite(user.tokens?.MZK)||user.tokens.MZK<rewardMzk)fail('Not enough MZK to fund this request reward.');
 const record={id,ownerId:wallet,claimantId:null,requesterName:call?.contact?text(call.contact):profileName(data,wallet),requesterKind:call&&['ai','shop','deed','member'].includes(call.kind)?call.kind:call?'ai':'member',originCallId:call?.id||null,source,itemId:item.supplyId,itemName:text(item.name||item.supplyId,160),quantity,rewardMzk,escrowMzk:rewardMzk,addressId:address.id,addressRevision:address.revision,recipientId:address.recipientId,address:{id:address.id,name:text(address.name,160),mapId:address.mapId,mapName:text(address.mapName||address.mapId,160),kind:address.kind,revision:address.revision,...(address.position?{position:copy(address.position)}:{}),...(address.addressLine?{addressLine:text(address.addressLine,400)}:{})},destinationMapId:address.mapId,shippingMapId:shippingMapId||null,contractId:contractId||null,onwardMode,phase:'open',shipmentIds:[],bindings:{},deliveredQuantity:0,committedQuantity:0,createdAt:now,updatedAt:now,createRequestId:input.requestId,createSignature:signature};
 user.tokens.MZK-=rewardMzk;requests[id]=record;
 (data.transactions ||= []).push({id:'item-request-fund:'+id,type:'WORLD_ITEM_REQUEST_FUNDED',walletId:wallet,inventoryRequestId:id,requestId:input.requestId,amountMzk:-rewardMzk,balanceAfterMzk:user.tokens.MZK,itemId:item.supplyId,quantity,createdAt:new Date(now).toISOString()});
 return record;
}

export function claimWorldItemRequest(data,ledger,wallet,input,{now=Date.now(),addressValid}={}){
 member(data,wallet);const record=requestFor(ledger,input);requireAddress(record,addressValid);
 if(terminal(record))fail('This inventory request is already complete or cancelled.');
 if(record.claimantId){if(record.claimantId!==wallet)fail('Another maker already accepted this request.');return record;}
 record.claimantId=wallet;record.claimantName=profileName(data,wallet);record.claimedAt=now;record.phase='claimed';record.updatedAt=now;return record;
}

function matchingReceipts(ledger,record,binding){
 const shipment=ledger.shipments?.[binding.shipmentId];
 if(!shipment||shipment.inventoryRequestId!==record.id||shipment.itemId!==record.itemId||shipment.addressId!==record.addressId||shipment.destinationMapId!==record.destinationMapId||shipment.recipientId!==record.recipientId)return [];
 const allocation=ledger.factoryLotAllocations?.[shipment.id];
 if(!allocation||!['allocated','delivered'].includes(allocation.phase))return [];
 return Object.values(ledger.factoryStockReceipts||{}).filter(receipt=>receipt.shipmentId===shipment.id&&receipt.itemId===record.itemId&&receipt.destinationMapId===record.destinationMapId&&receipt.addressId===record.addressId&&whole(receipt.quantity,1)&&receipt.receivedAt>=binding.boundAt&&Array.isArray(receipt.lotAllocations)&&receipt.lotAllocations.length>0&&receipt.lotAllocations.every(line=>whole(line.quantity,1)&&binding.lots.some(lot=>lot.lotId===line.lotId))&&receipt.lotAllocations.reduce((sum,line)=>sum+line.quantity,0)===receipt.quantity);
}
function bindingDelivered(ledger,record,binding){
 const totals=new Map(),seen=new Set();
 for(const receipt of matchingReceipts(ledger,record,binding)){
  const receiptId=receipt.id||receipt.deliveryId;if(!key(receiptId)||seen.has(receiptId))continue;seen.add(receiptId);
  for(const line of receipt.lotAllocations||[])if(whole(line.quantity,1)&&binding.lots.some(lot=>lot.lotId===line.lotId))totals.set(line.lotId,(totals.get(line.lotId)||0)+line.quantity);
 }
 return Math.min(binding.quantity,binding.lots.reduce((sum,line)=>sum+Math.min(line.quantity,totals.get(line.lotId)||0),0));
}
function cancelledBinding(ledger,binding){const shipment=ledger.shipments?.[binding.shipmentId],allocation=ledger.factoryLotAllocations?.[binding.shipmentId];return shipment?.phase==='cancelled'&&allocation?.phase==='returned'&&!shipment.seaReceipt;}
function refreshCounts(ledger,record){
 let deliveredQuantity=0,committedQuantity=0;
 for(const binding of Object.values(record.bindings||{})){
  const received=bindingDelivered(ledger,record,binding);deliveredQuantity+=received;
  committedQuantity+=cancelledBinding(ledger,binding)&&!received?0:binding.quantity;
 }
 record.deliveredQuantity=Math.min(record.quantity,deliveredQuantity);record.committedQuantity=Math.min(record.quantity,committedQuantity);
}

/** Called after exact, completed lots have been reserved by the existing
 * shipment allocator inside the same account transaction. */
export function attachWorldItemRequestShipment(data,ledger,wallet,input,{now=Date.now(),addressValid}={}){
 member(data,wallet);const record=requestFor(ledger,input);requireAddress(record,addressValid);refreshCounts(ledger,record);
 if(terminal(record)||record.claimantId!==wallet)fail('Accept this active request before preparing its freight.',403);
 const shipment=ledger.shipments?.[input.shipmentId],allocation=ledger.factoryLotAllocations?.[input.shipmentId];
 if(!shipment||shipment.ownerId!==wallet||shipment.sourceMapId!=='factory'||shipment.itemId!==record.itemId||shipment.addressId!==record.addressId||shipment.destinationMapId!==record.destinationMapId||shipment.recipientId!==record.recipientId||shipment.phase!=='queued'||shipment.createdAt<record.claimedAt)fail('Prepare a new matching shipment for this request.');
 if(shipment.inventoryRequestId&&shipment.inventoryRequestId!==record.id)fail('This shipment already belongs to another request.');
 if(Object.values(ledger.factoryStockReceipts||{}).some(receipt=>receipt.shipmentId===shipment.id))fail('Previously received cargo cannot fulfill a new request.');
 if(record.bindings?.[shipment.id])return record;
 if(!whole(shipment.quantity,1)||shipment.quantity>record.quantity-record.committedQuantity)fail('This shipment exceeds the request’s uncommitted quantity.');
 if(!allocation||allocation.phase!=='allocated'||allocation.itemId!==record.itemId||allocation.quantity!==shipment.quantity||!Array.isArray(allocation.lots)||!allocation.lots.length)fail('Reserve the request’s counted creation lots before shipping.');
 const ids=new Set();let count=0;
 for(const line of allocation.lots){
  const lot=ledger.factoryLots?.[line.lotId];
  if(ids.has(line.lotId)||!whole(line.quantity,1)||!lot||lot.itemId!==record.itemId||!completedOwnedLot(data,ledger,wallet,lot,now)||record.source!=='any'&&sourceFor(lot)!==record.source)fail('Only the accepted maker’s completed, sealed creations can fill this request.');
  ids.add(line.lotId);count+=line.quantity;
 }
 if(count!==shipment.quantity)fail('The request shipment and reserved creation counts do not match.');
 shipment.inventoryRequestId=record.id;record.shipmentIds.push(shipment.id);record.bindings[shipment.id]={shipmentId:shipment.id,quantity:shipment.quantity,lots:copy(allocation.lots),boundAt:now};
 record.committedQuantity+=shipment.quantity;record.phase='shipping';record.updatedAt=now;return record;
}

export function cancelWorldItemRequest(data,ledger,wallet,input,{now=Date.now(),addressValid}={}){
 const user=member(data,wallet),record=requestFor(ledger,input);refreshCounts(ledger,record);
 if(record.ownerId!==wallet)fail('Only the requester can cancel its funded reward.',403);
 if(record.phase==='cancelled')return record;
 if(record.phase==='delivered'||record.deliveredQuantity>0)fail('Received items cannot be cancelled or refunded.');
 if(Object.values(record.bindings||{}).some(binding=>!cancelledBinding(ledger,binding)))fail('Cancel unassigned freight first. In-transit or port-held cargo cannot be refunded.');
 if(!whole(record.escrowMzk,1)||!Number.isFinite(user.tokens?.MZK)||!Number.isSafeInteger(user.tokens.MZK+record.escrowMzk))fail('The funded reward cannot be refunded right now.');
 const refunded=record.escrowMzk;user.tokens.MZK+=refunded;record.escrowMzk=0;record.refundedMzk=refunded;record.phase='cancelled';record.cancelledAt=now;record.updatedAt=now;
 (data.transactions ||= []).push({id:'item-request-refund:'+record.id,type:'WORLD_ITEM_REQUEST_REFUND',walletId:wallet,inventoryRequestId:record.id,requestId:input.requestId,amountMzk:refunded,balanceAfterMzk:user.tokens.MZK,createdAt:new Date(now).toISOString()});return record;
}

/** Destination stock receipts are the sole completion proof. A preview, ready
 * factory job, reservation, sea arrival or editable completion flag pays nothing. */
export function reconcileWorldItemRequests(data,ledger,{now=Date.now(),addressValid}={}){
 const requests=ensureWorldItemRequests(ledger);
 for(const record of Object.values(requests)){
  if(terminal(record))continue;refreshCounts(ledger,record);
  if(!validAddress(record,addressValid)){record.phase='attention';record.attentionReason='The receiving address or its owner changed.';record.updatedAt=now;continue;}
  delete record.attentionReason;
  if(record.deliveredQuantity===record.quantity&&record.claimantId){
   const user=data.users?.[record.claimantId],amount=record.escrowMzk,id='item-request-payout:'+record.id,prior=(data.transactions||[]).find(receipt=>receipt.id===id);
   if(!prior){
    if(!user||!whole(amount,1)||!Number.isFinite(user.tokens?.MZK)||!Number.isSafeInteger(user.tokens.MZK+amount)){record.phase='attention';record.attentionReason='The maker’s funded reward is awaiting account settlement.';continue;}
    user.tokens.MZK+=amount;
    (data.transactions ||= []).push({id,type:'WORLD_ITEM_REQUEST_PAID',walletId:record.claimantId,ownerId:record.ownerId,inventoryRequestId:record.id,amountMzk:amount,balanceAfterMzk:user.tokens.MZK,itemId:record.itemId,quantity:record.quantity,shipmentIds:[...record.shipmentIds],createdAt:new Date(now).toISOString()});
   }
   record.paidMzk=prior?.amountMzk??amount;record.escrowMzk=0;record.payoutId=id;record.phase='delivered';record.completedAt=now;
  }else record.phase=record.deliveredQuantity?'partial':record.committedQuantity?'shipping':record.claimantId?'claimed':'open';
  record.updatedAt=now;
 }
 return requests;
}

export function publicWorldItemRequest(record,wallet){
 const mine=record.ownerId===wallet,claimedByMe=record.claimantId===wallet,active=!terminal(record),remainingQuantity=Math.max(0,record.quantity-record.deliveredQuantity),fulfillableQuantity=Math.max(0,record.quantity-record.committedQuantity);
 return {id:record.id,itemId:record.itemId,itemName:record.itemName,quantity:record.quantity,rewardMzk:record.rewardMzk,escrowMzk:record.escrowMzk,paidMzk:record.paidMzk||0,phase:record.phase,source:record.source,requesterName:record.requesterName,requesterKind:record.requesterKind,claimantName:record.claimantName||null,originCallId:record.originCallId,address:copy(record.address),destinationMapId:record.destinationMapId,shippingMapId:record.shippingMapId,contractId:record.contractId,onwardMode:record.onwardMode,deliveredQuantity:record.deliveredQuantity,committedQuantity:record.committedQuantity,remainingQuantity,fulfillableQuantity,shipmentIds:[...record.shipmentIds],lotIds:[...new Set(Object.values(record.bindings||{}).flatMap(binding=>binding.lots.map(line=>line.lotId)))],mine,claimedByMe,canClaim:!!wallet&&active&&!record.claimantId&&record.phase!=='attention',canCancel:mine&&active&&!record.deliveredQuantity&&!record.committedQuantity,canFulfill:claimedByMe&&active&&record.phase!=='attention'&&fulfillableQuantity>0,...(record.attentionReason?{attentionReason:record.attentionReason}:{}),createdAt:record.createdAt,updatedAt:record.updatedAt,...(record.completedAt?{completedAt:record.completedAt}:{})};
}
