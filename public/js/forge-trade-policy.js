import {FORGE_ITEMS} from './forge-items.js?v=forge-atelier-20261031';
import {FORGE_RECIPES} from './forge-recipes.js?v=forge-atelier-20261031';

/** Explanations of existing server transactions. These records grant no item,
 * quote, currency, ownership, shipment or delivery permission. */
export const FORGE_TRADE_POLICIES=Object.freeze([
 {id:'kit',title:'A measured kit, paid once',text:'The selected kit price covers its listed metal and coal. Funding commits those materials to one workpiece. Continue the saved order after reconnecting; previews and animations do not buy or complete it.'},
 {id:'backpack',title:'One finished item in your Backpack',text:'Finish the server-confirmed work order to collect its item. The same native model and function are used in the game, Builder and markets. Previewing or copying a map does not grant an owned copy.'},
 {id:'sale',title:'Sell through the current owner',text:'Trading Market checks the item’s purchase or forging receipt and current owner. The completed MZK sale transfers that exact item. The seller chooses the listing price; a listing alone is not a sale.'},
 {id:'seal',title:'Sealing moves the item into freight',text:'Remove an active sale listing before sealing. Sealing removes the exact crafted Backpack copy and creates one counted warehouse unit. It does not leave a second usable copy in your Backpack.'},
 {id:'route',title:'Review the real route and quote',text:'World Supply shows available source stock, destination, route capacity and current prices. Warehouse-to-port links are simulated; the sea passage is playable. Addressed orders continue to their receiving store, building or deed before final stock is credited.'},
 {id:'cancel',title:'A cancelled trip does not recreate the item',text:'An unassigned shipment can return its reserved stock to the source warehouse. After confirmed sea arrival, unfinished onward cargo is held at the receiving port. Cancelling freight does not rebuild the original Backpack item or count as completed delivery.'}
].map(policy=>Object.freeze(policy)));

const list=value=>Array.isArray(value)?value:Object.values(value||{});
const positive=value=>Number.isSafeInteger(value)&&value>0;

export function forgeTradeItem(recipeId){
 const recipe=FORGE_RECIPES.find(value=>value.id===recipeId),item=recipe&&FORGE_ITEMS[recipe.buildAssetId];
 if(!recipe||!item)return null;
 return {recipeId:recipe.id,buildAssetId:recipe.buildAssetId,sku:'native:'+recipe.buildAssetId,name:item.name,kitPriceMzk:recipe.costMzk,marketPriceMzk:item.priceMzk,materials:recipe.materials.map(line=>({...line})),dimensions:[...item.dimensions],image:'/public/images/native-designs/'+recipe.buildAssetId+'.svg?v=forge-atelier-20261031',productUrl:'product.html?id='+encodeURIComponent('upgrade:native:'+recipe.buildAssetId)};
}

/** Link one saved workpiece to its exact public warehouse lot and shipment.
 * Similar item IDs, unrelated shipments and visual route timers are not proof
 * that this workpiece reached destination stock. */
export function forgeRouteView({job=null,supply=null}={}){
 const lotId=job?.exportLotId||null,lot=lotId?list(supply?.lots).find(value=>value.id===lotId):null;
 const allocations=lotId?list(supply?.allocations).filter(value=>(value.lots||[]).some(line=>line.lotId===lotId&&positive(line.quantity))):[];
 let allocation=allocations.filter(value=>value.phase!=='returned').at(-1)||allocations.at(-1)||null;
 const compactShipments=lotId?list(supply?.shipments).filter(value=>(value.lotIds||[]).includes(lotId)):[];
 const shipment=allocation?list(supply?.shipments).find(value=>value.id===allocation.shipmentId):compactShipments.filter(value=>value.phase!=='cancelled').at(-1)||compactShipments.at(-1)||null;
 const compactLotReceipt=Array.isArray(shipment?.lotReceipts)?shipment.lotReceipts.find(value=>value.lotId===lotId):null;
 const compactConfirmation=Array.isArray(shipment?.lotReceipts)?compactLotReceipt:shipment;
 const confirmedStock=compactConfirmation?.stockConfirmed===true&&typeof compactConfirmation?.stockReceiptId==='string'&&compactConfirmation.stockReceiptId.length>0;
 if(!allocation&&shipment)allocation={shipmentId:shipment.id,phase:shipment.phase==='cancelled'?'returned':confirmedStock?'delivered':'allocated'};
 const receipt=shipment?list(supply?.stockReceipts).find(value=>value.shipmentId===shipment.id&&value.destinationMapId===shipment.destinationMapId&&positive(value.quantity)&&(value.lotAllocations||[]).some(line=>line.lotId===lotId&&positive(line.quantity))):null;
 const delivered=!!(allocation?.phase==='delivered'&&(receipt||confirmedStock)),sealed=!!(job?.exportedAt||lotId),collected=job?.status==='collected';
 const seaConfirmed=!!(shipment?.seaReceipt||shipment?.seaConfirmed);
 const cancelled=shipment?.phase==='cancelled'||allocation?.phase==='returned',portHeld=shipment?.phase==='port-held'||cancelled&&seaConfirmed;
 const onward=seaConfirmed&&!delivered&&!portHeld;
 let phase='kit',label='Choose a measured metal & fuel kit';
 if(job&&!collected){phase='work';label='Workpiece in progress · '+(job.stage||'heat treatment');}
 if(collected){phase='backpack';label='Finished workpiece recorded · inspect your current Backpack';}
 if(sealed){phase='warehouse';label='Sealed unit · waiting in warehouse stock';}
 if(shipment&&!cancelled&&!portHeld){phase=onward?'destination':'route';label=onward?'Sea arrival confirmed · final receiving handover pending':'Shipping manifest · '+(shipment.phase||'awaiting confirmation');}
 if(cancelled&&!portHeld){phase='warehouse';label='Reservation returned to source warehouse';}
 if(portHeld){phase='destination';label='Receiving-port hold · destination stock is not credited';}
 if(delivered){phase='delivered';label='Verified receiving receipt · destination stock credited';}
 const phases=['kit','work','backpack','warehouse','route','destination'],index=phase==='delivered'?phases.length:phases.indexOf(phase);
 const labels=['Fund kit','Forge & finish','Backpack / resale','Seal warehouse unit','Sail the manifest','Receive stock'];
 return {phase,label,sealed,delivered,portHeld,hasSupply:!!supply,quantity:positive(lot?.quantity)?lot.quantity:sealed?1:null,references:{workOrderId:job?.id||null,backpackItemId:job?.itemId||null,lotId,shipmentId:shipment?.id||null,routeId:shipment?.contractId||null,destinationMapId:shipment?.destinationMapId||null,stockReceiptId:receipt?.id||confirmedStock&&compactConfirmation.stockReceiptId||null},steps:phases.map((id,i)=>({id,label:labels[i],state:phase==='delivered'||i<index?'complete':i===index?'current':'pending'}))};
}

/** Market browsing follows the selected design. Freight inspection follows the
 * saved workpiece, even after the player selects a different catalogue design. */
export function forgeCommerceTarget({destination,selectedRecipeId,job=null,supply=null}={}){
 const route=forgeRouteView({job,supply}),recipeId=destination==='supply'&&route.sealed?job?.recipeId:selectedRecipeId,item=forgeTradeItem(recipeId);
 if(destination==='market')return {sku:item?.sku,itemId:item?.sku};
 if(destination==='requests')return {itemId:item?.sku,section:'requests',quantity:1};
 if(destination==='supply')return {sku:item?.sku,itemId:item?.sku,...(route.references.lotId?{lotId:route.references.lotId}:{}),...(route.references.shipmentId?{shipmentId:route.references.shipmentId}:{}),section:route.sealed?'trace':'shipments',sourceMapId:'factory',quantity:1};
 return {};
}
