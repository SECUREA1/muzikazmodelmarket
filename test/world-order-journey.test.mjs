import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {attachOrderJourneys,projectOrderJourney} from '../world-order-journey.mjs';
import {WorldSupplyService} from '../server-world-supply.mjs';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';

const maps=[{id:'world-item-factory',name:'World item factory',regionId:'workshops',regionName:'Workshop region'}, {id:'hormuz-shipping',name:'Strait',regionId:'coastal',regionName:'Coastal region',airport:{enabled:true}}, {id:'plot-home',name:'Home deed',regionId:'gardens',regionName:'Garden region',builderScene:{layout:'grand-floor',mapSize:80,objects:[]}}];
function fixture({air=false,addressed=true,quantity=5}={}){
 const order={id:'order',ownerId:'owner',deedId:addressed?'home':null,deedName:'Home',destinationMapId:'plot-home',shippingMapId:'hormuz-shipping',contractId:'peninsula-relief',onwardMode:air?'air':'road',quantity,itemId:'build:frontier-pickup',productionId:'production',shipmentIds:['shipment'],phase:'awaiting-shipping'};
 const shipment={...order,id:'shipment',orderId:order.id,...(addressed?{deliverySchemaVersion:1}:{}),sourceMapId:'factory',originPortId:'jebel-ali',destinationPortId:'khasab',phase:'queued'};delete shipment.shipmentIds;
 const ledger={orders:{order},shipments:{shipment},production:{production:{id:'production',phase:'ready',quantity,packingReceipt:{quantity}}},portReceipts:{},airTasks:{},airReceipts:{},deliveryTasks:{},deliveryRoutes:{},dropoffReceipts:{},factoryStockReceipts:{},worldStock:{'build:frontier-pickup':1000},maps:{'plot-home':{stock:{}}}};
 return {ledger,order,shipment,view:()=>projectOrderJourney(ledger,order,{maps})};
}
function sea(f){
 const {shipment,ledger}=f;shipment.phase='port-received';shipment.seaReceipt={id:'untrusted-embedded-copy'};
 ledger.portReceipts[shipment.id]={id:'port:shipment',shipmentId:shipment.id,shippingMapId:shipment.shippingMapId,itemId:shipment.itemId,quantity:shipment.quantity};
}
function road(f,{id='road',quantity=f.shipment.quantity,airTaskId,delivered=false}={}){
 const task={id,shipmentId:f.shipment.id,orderId:f.order.id,itemId:f.shipment.itemId,quantity,mapId:f.order.destinationMapId,phase:delivered?'delivered':'loading',portHandling:{phase:'complete'},route:{id:'route',status:'ready',hub:{id:'hub',position:{x:0,y:0,z:0}},dropoff:{id:'door',position:{x:4,y:0,z:6}}},...(airTaskId?{airTaskId}:{})};
 f.ledger.deliveryTasks[id]=task;
 if(delivered)f.ledger.dropoffReceipts[id]={id:'door:'+id,deliveryTaskId:id,shipmentId:f.shipment.id,itemId:f.shipment.itemId,quantity,destinationMapId:f.shipment.destinationMapId};
 return task;
}

test('order quest cannot complete from map visits, claimed phases or an embedded sea copy',()=>{
 const f=fixture(),before=JSON.stringify(f.ledger);let view=f.view();assert.equal(view.status,'active');assert.equal(view.nextStop.id,'departure');assert.equal(view.stages.find(stage=>stage.id==='sea').completedQuantity,0);assert.equal(JSON.stringify(f.ledger),before,'journey inspection must never advance timers or stock');
 f.order.phase='delivered';f.order.visitedMaps=maps.map(map=>map.id);f.shipment.phase='delivered';f.shipment.seaReceipt={quantity:5};road(f,{delivered:true});
 view=f.view();assert.equal(view.status,'active');assert.equal(view.deliveredQuantity,0,'a door-shaped record is not valid before the matching sea receipt');assert.equal(view.stages.find(stage=>stage.id==='sea').status,'locked');
 assert.deepEqual(f.ledger.maps['plot-home'].stock,{});assert.equal(f.ledger.worldStock[f.order.itemId],1000);
});

test('durable sea, source handling and exact receiving receipts complete a road quest once without mutations',()=>{
 const f=fixture();sea(f);const task=road(f);let view=f.view();assert.equal(view.stages.find(stage=>stage.id==='sea').status,'completed');assert.equal(view.nextStop.id,'local-route');assert.equal(view.status,'active');assert.equal(view.deliveredQuantity,0);
 task.phase='dropoff';assert.equal(f.view().nextStop.id,'dropoff');
 task.phase='delivered';assert.equal(f.view().status,'active','the phase label is not a receipt');
 f.ledger.dropoffReceipts[task.id]={id:'door:road',deliveryTaskId:task.id,shipmentId:f.shipment.id,itemId:f.shipment.itemId,quantity:task.quantity,destinationMapId:f.shipment.destinationMapId};
 const before=JSON.stringify(f.ledger);view=f.view();assert.equal(view.status,'completed');assert.equal(view.nextStop,null);assert.equal(view.deliveredQuantity,5);assert.equal(view.completedStages,view.totalStages);assert.deepEqual(f.view(),view);assert.equal(JSON.stringify(f.ledger),before);
 for(const change of [{quantity:4},{destinationMapId:'other-deed'},{itemId:'other-item'},{shipmentId:'other-shipment'}]){
  const saved=f.ledger.dropoffReceipts[task.id];f.ledger.dropoffReceipts[task.id]={...saved,...change};assert.notEqual(f.view().status,'completed');f.ledger.dropoffReceipts[task.id]=saved;
 }
});

test('split air manifests retain an unfinished flight and exact partial doorstep quantity',()=>{
 const f=fixture({air:true});sea(f);
 for(const [id,quantity] of [['flight-four',4],['flight-one',1]])f.ledger.airTasks[id]={id,shipmentId:f.shipment.id,itemId:f.shipment.itemId,quantity,mapId:'hormuz-shipping',phase:'awaiting-pilot',portHandling:{phase:'complete'}};
 const air=f.ledger.airTasks['flight-four'];air.phase='air-delivered';
 f.ledger.airReceipts[air.id]={id:'air-receipt',airTaskId:air.id,shipmentId:f.shipment.id,itemId:f.shipment.itemId,quantity:4,mapId:'hormuz-shipping'};
 road(f,{quantity:4,airTaskId:air.id,delivered:true});
 let view=f.view();assert.equal(view.status,'active');assert.equal(view.deliveredQuantity,4);assert.equal(view.nextStop.id,'flight');assert.equal(view.stages.find(stage=>stage.id==='flight').completedQuantity,4);assert.equal(view.stages.find(stage=>stage.id==='dropoff').completedQuantity,4);assert.equal(view.stages.filter(stage=>stage.mode==='plane').length,1);
 f.ledger.airTasks['flight-one'].phase='port-held';f.shipment.phase='port-held';view=f.view();assert.equal(view.status,'held');assert.equal(view.deliveredQuantity,4);assert.equal(view.nextStop.status,'held');assert.equal(view.stages.find(stage=>stage.id==='sea').status,'completed');
 f.ledger.airReceipts[air.id].quantity=5;assert.equal(f.view().deliveredQuantity,0,'an air receipt must match its sealed parcel slice');
});

test('map-wide legacy transfers require a matching stock receipt and never invent a doorstep truck',()=>{
 const f=fixture({addressed:false});f.order.phase=f.shipment.phase='delivered';assert.equal(f.view().status,'active');
 f.ledger.factoryStockReceipts[f.shipment.id]={shipmentId:f.shipment.id,itemId:f.shipment.itemId,quantity:5,destinationMapId:'plot-home'};
 const view=f.view();assert.equal(view.status,'completed');assert.deepEqual(view.stages.map(stage=>stage.id),['source','departure','sea','inventory']);assert.equal(view.stages.some(stage=>stage.id==='dropoff'),false);assert.equal(view.deliveredQuantity,5);
});

test('historical addressed orders complete from their original inventory receipt without invented door proof',()=>{
 const f=fixture();delete f.shipment.deliverySchemaVersion;delete f.ledger.production.production;f.order.phase=f.shipment.phase='delivered';
 f.ledger.factoryStockReceipts[f.shipment.id]={shipmentId:f.shipment.id,itemId:f.shipment.itemId,quantity:5,destinationMapId:'plot-home'};
 const view=f.view();assert.equal(view.status,'completed');assert.equal(view.legacyReceivedQuantity,5);assert.equal(view.completedStages,view.totalStages);assert.deepEqual(view.stages.map(stage=>stage.id),['source','departure','sea','inventory']);assert.equal(view.stages.some(stage=>stage.id==='dropoff'),false);
});

test('mixed migrated orders distinguish historical inventory units from modern exact door units',()=>{
 const f=fixture();f.shipment.quantity=1;const legacy={...f.shipment,id:'old-shipment',quantity:4,phase:'delivered'};delete legacy.deliverySchemaVersion;f.ledger.shipments[legacy.id]=legacy;f.order.shipmentIds.push(legacy.id);
 f.ledger.factoryStockReceipts[legacy.id]={shipmentId:legacy.id,itemId:legacy.itemId,quantity:4,destinationMapId:legacy.destinationMapId};sea(f);
 let view=f.view();assert.equal(view.status,'active');assert.equal(view.deliveredQuantity,4);assert.equal(view.legacyReceivedQuantity,4);assert.equal(view.stages.find(stage=>stage.id==='inventory').quantity,4);assert.equal(view.stages.find(stage=>stage.id==='dropoff').quantity,1);assert.equal(view.stages.find(stage=>stage.id==='dropoff').completedQuantity,0);
 road(f,{quantity:1,delivered:true});view=f.view();assert.equal(view.status,'completed');assert.equal(view.deliveredQuantity,5);assert.equal(view.completedStages,view.totalStages);assert.equal(view.stages.find(stage=>stage.id==='dropoff').completedQuantity,1);
});

test('held and cancelled orders preserve received cargo and canonical navigation excludes private or remote URLs',()=>{
 const f=fixture();sea(f);road(f,{quantity:4,delivered:true});f.order.phase='attention';let view=f.view();assert.equal(view.status,'held');assert.equal(view.deliveredQuantity,4);
 f.order.phase='cancelled';view=f.view();assert.equal(view.status,'cancelled');assert.equal(view.nextStop,null);assert.equal(view.deliveredQuantity,4);
 const supplied=[...maps.map(map=>({...map,playUrl:'https://attacker.invalid/run?token=secret'}))];
 view=projectOrderJourney(f.ledger,f.order,{maps:supplied});for(const stage of view.stages)if(stage.playUrl){assert.match(stage.playUrl,/^model-explorer\.html\?/);assert.equal(stage.playUrl.includes('attacker'),false);assert.equal(stage.playUrl.includes('secret'),false);}
 view=projectOrderJourney(f.ledger,f.order,{maps:maps.map(map=>map.id==='plot-home'?{...map,visibility:'private'}:map)});const door=view.stages.find(stage=>stage.id==='dropoff');assert.equal(door.playUrl,null);assert.equal(door.available,false);
});

test('copied shipping rooms do not receive canonical Strait airfield or shore coordinates',()=>{
 const f=fixture();f.order.shippingMapId=f.shipment.shippingMapId='custom-sea-room';
 const view=projectOrderJourney(f.ledger,f.order,{maps:[...maps,{id:'custom-sea-room',name:'Custom shipping room'}]});
 const shore=view.stages.find(stage=>stage.id==='shore');assert.equal(shore.mapId,'custom-sea-room');assert.equal(shore.position,undefined);assert.equal(view.stages.some(stage=>stage.mode==='plane'),false);assert.equal(shore.available,true);
});

test('exact deed itineraries attach only to authenticated payer or explicit recipient',()=>{
 const f=fixture(),state={orders:[f.order],shipments:[f.shipment]};
 for(const walletId of [undefined,'other']){const filtered=attachOrderJourneys(state,f.ledger,{maps,walletId});assert.equal(filtered.orders[0].journey,undefined);assert.equal(filtered.shipments[0].journey,undefined);}
 const owned=attachOrderJourneys(state,f.ledger,{maps,walletId:'OWNER'});assert.equal(owned.orders[0].journey.nextStop.mapId,'hormuz-shipping');assert.equal(owned.orders[0].journey.stages[0].regionName,'Workshop region');assert.ok(owned.shipments[0].journey);
 assert.equal(state.orders[0].journey,undefined,'responses cannot write projections into persistent order records');
});

test('real paid order acceptance, workspace and trace expose one replay-stable journey without public leakage',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'order-journey-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const db=new UserJsonDatabase(join(dir,'users.json')),deed={id:'home',worldId:'home-world',name:'Home',ownerId:'owner',status:'active',hostedSpace:{environmentId:'public-commons'}};
 await db.put('owner',{tokens:{MZK:1000000},items:[{id:'home',type:'land-deed',worldId:deed.worldId}]});await db.transaction(data=>{data.landDeeds[deed.worldId]=deed;});
 const service=new WorldSupplyService(db,{maps:async()=>maps,collision:new ServerBuilderCollision(),now:()=>100000}),input={requestId:'new-journey-order',deedId:'home',itemId:'tool:scanner',quantity:5,contractId:'peninsula-relief'};
 const accepted=await service.action('owner','order',input);assert.equal(accepted.journey.status,'active');assert.equal(accepted.journey.nextStop.id,'source');assert.equal(accepted.journey.stages[0].status,'active');assert.equal(accepted.journey.destinationMapId,'plot-home');
 assert.deepEqual(await service.action('owner','order',input),accepted);
 const owned=await service.state({walletId:'owner'}),publicView=await service.state();assert.ok(owned.orders[0].journey);assert.equal(publicView.orders[0].journey,undefined);assert.equal((await service.state({walletId:'other'})).orders[0].journey,undefined);
 const trace=await service.trace({productionId:accepted.productionId,walletId:'owner'});assert.equal(trace.journeys.length,1);assert.equal(trace.journeys[0].orderId,accepted.id);assert.deepEqual((await service.trace({productionId:accepted.productionId})).journeys,[]);
 const dispatch=await service.action('owner','dispatch',{itemId:'tool:scanner',quantity:1,sourceMapId:'world',destinationMapId:'plot-home',contractId:'peninsula-relief',requestId:'dispatch-journey'});assert.equal(dispatch.journey.kind,'supply-shipment');assert.equal(dispatch.journey.nextStop.id,'departure');assert.equal(dispatch.journey.destinationMapId,'plot-home');assert.deepEqual(await service.action('owner','dispatch',{itemId:'tool:scanner',quantity:1,sourceMapId:'world',destinationMapId:'plot-home',contractId:'peninsula-relief',requestId:'dispatch-journey'}),dispatch);
 assert.equal((await service.trace({shipmentId:dispatch.id,walletId:'owner'})).journeys[0].id,dispatch.journey.id);
 const data=await db.read();assert.equal(data.orders,undefined);assert.equal(data.worldSupply.orders[accepted.id].journey,undefined);assert.equal(data.transactions.filter(transaction=>transaction.type==='WORLD_FACTORY_PRODUCTION').length,1);assert.deepEqual(data.worldSupply.maps['plot-home'].stock,{});
});
