import {SHIPPING_ID,SHIPPING_RULES} from './public/js/shipping-config.js';

// Supply challenges describe fictional game cargo. The saved shipment carries
// the requirements; clients cannot supply scores, stock counts or completion.
const specifications=Object.freeze([
 {id:'rocket-convoy',name:'Rocket supply convoy',description:'Deliver four sealed cargo-rocket collectibles to the proving-ground warehouse.',buildAssetId:'factory-cargo-rocket',quantity:4,destination:/proving|testing-range|factory-test/i,minimumQuality:90},
 {id:'range-restock',name:'Training range resupply',description:'Restock the range with four inert training collectibles.',buildAssetId:'factory-training-missile',quantity:4,destination:/proving|testing-range|factory-test/i,minimumQuality:90},
 {id:'construction-convoy',name:'Builder materials convoy',description:'Deliver construction metal to the building district for its shared stores.',sku:'material:metal',quantity:40,destination:/construction|building|builders/i,minimumQuality:85},
 {id:'port-maintenance',name:'Port maintenance supplies',description:'Bring repair tools to the Strait warehouse for working vessels and dock equipment.',sku:'tool:repair-tool',quantity:8,destination:/hormuz-shipping/,minimumQuality:85},
 {id:'community-care',name:'Community care delivery',description:'Restock a community destination with single-use care supplies.',care:true,quantity:20,destination:/resort|tropical|summer-camp|commons/i,minimumQuality:85},
 {id:'factory-dispatch',name:'Factory distribution network',description:'Ship freight terminals to connect the factory district with its markets.',buildAssetId:'factory-export-terminal',quantity:4,destination:/missile-factory|factory-world/i,minimumQuality:85}
]);
const stock=(value)=>Number.isSafeInteger(value)&&value>=0?value:0;
const field=(map)=>[map.id,map.name].join(' ');

export function distributionChallenges(ledger,{maps=[]}={}){
 const shippingMap=maps.find(map=>map.id===SHIPPING_ID);
 if(!shippingMap)return [];
 const items=Object.values(ledger.catalog),shipments=Object.values(ledger.shipments);
 const result=[];
 function add(specification,item,destinationMapId,destinationName){
  const id=item.supplyId,destinationStock=destinationMapId==='world'?stock(ledger.worldStock[id]):stock(ledger.maps[destinationMapId]?.stock[id]),targetStock=specification.targetStock||specification.quantity;
  const completed=shipments.filter(row=>row.challenge?.id===specification.id&&row.phase==='delivered'&&row.challengeResult?.completed===true);
  result.push({id:specification.id,name:specification.name,description:specification.description,itemId:id,itemName:item.name,quantity:specification.quantity,sourceMapId:'factory',destinationMapId,destinationName,shippingMapId:shippingMap.id,contractId:'gulf-gateway',minimumQuality:specification.minimumQuality,maxVoyageMs:SHIPPING_RULES.contractLimitMs,availableStock:stock(ledger.factoryStock[id]),worldStock:stock(ledger.worldStock[id]),destinationStock,targetStock,shortfall:Math.max(0,targetStock-destinationStock),status:destinationStock>=targetStock?'supplied':'open',completionCount:completed.length,latestDeliveryAt:completed.reduce((latest,row)=>Math.max(latest,row.deliveredAt||0),0)||null});
 }
 for(const specification of specifications){
  const item=items.find(item=>specification.buildAssetId?item.buildAssetId===specification.buildAssetId:specification.sku?item.sku===specification.sku:specification.care&&item.kind==='care');
  const destination=maps.find(map=>specification.destination.test(field(map)));
  if(item&&destination)add(specification,item,destination.id,destination.name||destination.id);
 }
 // Depleting any catalog item creates a genuine central-stock restocking goal.
 // Every native/model alias resolves to its existing single physical count.
 const depleted=items.filter(item=>stock(ledger.worldStock[item.supplyId])<250)
  .sort((a,b)=>stock(ledger.worldStock[a.supplyId])-stock(ledger.worldStock[b.supplyId])||a.supplyId.localeCompare(b.supplyId)).slice(0,6);
 for(const item of depleted)add({id:'world-restock:'+item.supplyId,name:'World stores · '+item.name,description:'Restore the central reserve used by markets across the world.',quantity:4,targetStock:250,minimumQuality:85},item,'world','World stock · central stores');
 return result;
}

export function distributionChallengeForDispatch(ledger,directory,input,item){
 if(input.challengeId===undefined||input.challengeId===null||input.challengeId==='')return null;
 const challenge=distributionChallenges(ledger,directory).find(row=>row.id===input.challengeId);
 if(!challenge)throw Object.assign(new Error('Choose an available distribution challenge.'),{statusCode:422});
 const actual=[item.supplyId,input.quantity,input.sourceMapId||'factory',input.destinationMapId,input.shippingMapId||SHIPPING_ID,input.contractId||'gulf-gateway'];
 const required=[challenge.itemId,challenge.quantity,challenge.sourceMapId,challenge.destinationMapId,challenge.shippingMapId,challenge.contractId];
 if(JSON.stringify(actual)!==JSON.stringify(required))throw Object.assign(new Error('The item, quantity, source, destination and route must match the selected distribution challenge.'),{statusCode:422});
 return {...challenge};
}

export function distributionChallengeResult(shipment,result,now){
 if(!shipment.challenge)return null;
 const challenge=shipment.challenge,elapsedMs=result.deliveredAt-result.departedAt;
 const completed=result.quality>=challenge.minimumQuality&&elapsedMs<=challenge.maxVoyageMs;
 return {completed,quality:result.quality,elapsedMs,...(completed?{completedAt:now}:{}),message:completed?challenge.name+' completed. The delivered items are now in destination stock.':'Cargo delivered to stock. Complete another shipment with at least '+challenge.minimumQuality+'% quality to meet this challenge.'};
}
