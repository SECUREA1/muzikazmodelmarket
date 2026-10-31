import {FORGE_ITEMS} from './public/js/forge-items.js';
import {ownedForgeItem,canonicalForgeItem} from './forge-item-provenance.mjs';

const units=value=>Number.isSafeInteger(value)&&value>0?value:0;
const itemName=id=>FORGE_ITEMS[String(id||'').replace(/^native:/,'')]?.name||'Forged metalwork';

/** A bounded, read-only view for the physical dispatch yard. Public counts
 * represent existing forge lots; private shipment details belong to the caller. */
export function forgePresentation(data,wallet,{mapId='traditional-forge',now=Date.now()}={}){
 const ledger=data.worldSupply||{},lots=Object.values(ledger.factoryLots||{}).filter(lot=>lot.origin==='traditional-forge');
 const byId=new Map(lots.map(lot=>[lot.id,lot])),mine=new Set(lots.filter(lot=>lot.forgeWalletId===wallet).map(lot=>lot.id));
 const receipts=Object.values(ledger.factoryStockReceipts||{}).filter(receipt=>{
  const shipment=ledger.shipments?.[receipt.shipmentId];
  return shipment&&receipt.destinationMapId===shipment.destinationMapId&&receipt.itemId===shipment.itemId&&units(receipt.quantity)>0;
 });
 const sealedUnits=lots.reduce((sum,lot)=>sum+units(lot.quantity),0),availableUnits=lots.reduce((sum,lot)=>sum+units(lot.availableQuantity),0);
 let deliveredUnits=0;
 for(const receipt of receipts)for(const line of receipt.lotAllocations||[])if(byId.get(line.lotId)?.itemId===receipt.itemId)deliveredUnits+=units(line.quantity);
 const shipments=Object.values(ledger.shipments||{}).flatMap(shipment=>{
  const allocation=ledger.factoryLotAllocations?.[shipment.id],lines=(allocation?.lots||[]).filter(line=>mine.has(line.lotId));
  if(!lines.length)return [];
  const credited=receipts.filter(receipt=>receipt.shipmentId===shipment.id);
  const lotReceipts=lines.map(line=>{
   const receipts=credited.filter(receipt=>(receipt.lotAllocations||[]).some(entry=>entry.lotId===line.lotId&&units(entry.quantity)>0));
   const quantity=units(line.quantity),stockConfirmedQuantity=receipts.reduce((sum,receipt)=>sum+(receipt.lotAllocations||[]).filter(entry=>entry.lotId===line.lotId).reduce((subtotal,entry)=>subtotal+units(entry.quantity),0),0);
   return {lotId:line.lotId,quantity,stockConfirmedQuantity,stockConfirmed:quantity>0&&stockConfirmedQuantity>=quantity,stockReceiptId:receipts.at(-1)?.id||null};
  });
  const quantity=lotReceipts.reduce((sum,line)=>sum+line.quantity,0),stockConfirmedQuantity=lotReceipts.reduce((sum,line)=>sum+line.stockConfirmedQuantity,0);
  const contributing=credited.filter(receipt=>(receipt.lotAllocations||[]).some(line=>lines.some(own=>own.lotId===line.lotId)&&units(line.quantity)>0));
  return [{id:shipment.id,itemId:shipment.itemId,name:itemName(shipment.itemId),quantity,stockConfirmed:quantity>0&&stockConfirmedQuantity>=quantity,stockConfirmedQuantity,stockReceiptId:contributing.at(-1)?.id||null,lotReceipts,phase:shipment.phase,sourceMapId:shipment.sourceMapId,destinationMapId:shipment.destinationMapId,shippingMapId:shipment.shippingMapId,contractId:shipment.contractId,onwardMode:shipment.onwardMode||'road',portTransferPhase:shipment.portTransferTask?.phase||null,seaConfirmed:!!shipment.seaReceipt,lotIds:lines.map(line=>line.lotId),createdAt:shipment.createdAt}];
 }).sort((a,b)=>(Number(b.createdAt)||0)-(Number(a.createdAt)||0)).slice(0,24);
 const ownLots=lots.filter(lot=>mine.has(lot.id)).slice(-24).reverse().map(lot=>({id:lot.id,itemId:lot.itemId,name:itemName(lot.itemId),quantity:units(lot.quantity),availableQuantity:units(lot.availableQuantity),phase:units(lot.availableQuantity)?'warehouse':'allocated',createdAt:lot.createdAt}));
 const items=(data.users?.[wallet]?.items||[]).filter(item=>String(item.id||'').startsWith('forge-item:')).slice(-24).reverse().flatMap(item=>{
  const proof=ownedForgeItem(data,wallet,item.id),canonical=proof&&canonicalForgeItem(proof);
  return canonical?[{id:item.id,buildAssetId:canonical.buildAssetId,name:canonical.name,listed:!!item.listing?.active,priceMzk:item.listing?.active?item.listing.priceMzk:undefined,thumbnailUrl:canonical.image}]:[];
 });
 return {serverTime:now,mapId,warehouse:{sealedUnits,availableUnits,allocatedUnits:Math.max(0,sealedUnits-availableUnits-deliveredUnits),deliveredUnits,lotCount:lots.length},lots:ownLots,shipments,items};
}
