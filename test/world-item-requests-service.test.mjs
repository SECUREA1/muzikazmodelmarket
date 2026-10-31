import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {WorldSupplyService} from '../server-world-supply.mjs';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {forgeCommand} from '../server-forge.mjs';
import {FORGE_STATIONS} from '../public/js/forge-config.js';
import {FORGE_RECIPES,FORGE_STRIKE_COOLDOWN_MS} from '../public/js/forge-recipes.js';
import {SHIPPING_ROUTES,SHIPPING_RULES} from '../public/js/shipping-config.js';
import {plotSpaceId} from '../member-plots.mjs';

const BUYER='account:world-request-buyer',MAKER='account:world-request-maker',OTHER='account:world-request-other';
const ITEM='native:forge-dagger',REWARD=1200,INITIAL=100000;

async function fixture(t){
 const directory=await mkdtemp(join(tmpdir(),'world-item-requests-service-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const db=new UserJsonDatabase(join(directory,'users.json'));
 for(const wallet of [BUYER,MAKER,OTHER])await db.put(wallet,{tokens:{MZK:INITIAL},items:[],memory:{profile:{displayName:wallet===BUYER?'Shop keeper':wallet===MAKER?'Working smith':'Other member'}}});
 let now=1000000,sequence=0;
 const maps=[{id:'hormuz-shipping',name:'Playable Shipping',visibility:'public'},
  {id:'traditional-forge',name:'Traditional Forge',game:'forge',visibility:'public'},
  {id:'request-city',name:'Request City',ownerId:BUYER,visibility:'public',builderScene:{layout:'grand-floor',mapSize:80,objects:[{id:'request-shop',modelId:'market-stall',name:'The smith’s shop',position:{x:12,y:0,z:12},deliveryDropoff:{x:3,y:.03,z:0},functionalSettings:{behavior:'shop',storeProductIds:['forge-dagger']}}]},spawn:{x:0,y:0,z:0}}];
 const options={maps:async()=>maps,collision:new ServerBuilderCollision(),now:()=>now},service=new WorldSupplyService(db,options);
 const f={db,service,maps,options,get now(){return now;},set now(value){now=value;},id:prefix=>prefix+'-'+ ++sequence};
 f.state=(wallet=BUYER)=>service.state({walletId:wallet,mapId:'request-city'});
 f.address=async()=>{const state=await f.state();return state.addresses.find(row=>row.objectId==='request-shop')||state.addresses.find(row=>row.kind==='store');};
 f.create=async(fields={},wallet=BUYER)=>{const address=await f.address();assert.ok(address,'the actual shop has a receiving address');return service.action(wallet,'request-create',{itemId:ITEM,quantity:1,rewardMzk:REWARD,addressId:address.id,expectedAddressRevision:address.revision,shippingMapId:'hormuz-shipping',contractId:'gulf-gateway',requestId:f.id('create'),...fields});};
 f.claim=(request,wallet=MAKER,fields={})=>service.action(wallet,'request-claim',{inventoryRequestId:request.id,requestId:f.id('claim'),...fields});
 f.fulfill=(request,fields={},wallet=MAKER)=>service.action(wallet,'request-fulfill',{inventoryRequestId:request.id,requestId:f.id('fulfill'),...fields});
 f.produce=async(quantity=1,wallet=MAKER)=>service.action(wallet,'produce',{itemId:ITEM,quantity,requestId:f.id('produce')});
 f.finish=async job=>{now=Math.max(now,job.readyAt);await f.state(MAKER);return 'production:'+job.id;};
 f.craft=async()=>{
  const recipe=FORGE_RECIPES.find(row=>row.buildAssetId==='forge-dagger'),player={actorId:MAKER,walletId:MAKER,position:{...FORGE_STATIONS[0].approach},health:100,grounded:true},sim={actors:{},players:{}};sim.players[MAKER]=player;
  const send=(action,fields={})=>forgeCommand(sim,player,maps[1],{action,requestId:f.id('forge'),...fields},now,{database:db,walletId:MAKER});
  const at=kind=>player.position={...FORGE_STATIONS.find(station=>station.kind===kind).approach};
  at('sourcing');const start=await send('forge-start',{recipeId:recipe.id}),jobId=start.forge.job.id;
  at('heat');await send('forge-heat',{jobId});now+=recipe.heatMs;await send('forge-status');at('hammer');
  for(let index=0;index<recipe.hammerStrikes;index++){now+=FORGE_STRIKE_COOLDOWN_MS;await send('forge-hammer',{jobId});}
  at('quench');await send('forge-quench',{jobId});at('temper');await send('forge-temper',{jobId});now+=recipe.temperMs;await send('forge-status');at('finish');
  return (await send('forge-finish',{jobId})).item;
 };
 return f;
}
const requestOf=(state,id)=>state.inventoryRequests.find(row=>row.id===id);
const balance=(f,wallet)=>f.db.get(wallet).then(user=>user.tokens.MZK);

test('authored village street names preserve an in-flight request to the same verified doorway and recipient',async t=>{
 const f=await fixture(t),request=await f.create();await f.claim(request);const job=await f.produce();await f.finish(job);
 const fulfilled=await f.fulfill(request),shipment=(await f.state(MAKER)).shipments.find(row=>row.id===fulfilled.shipmentIds[0]);
 await sail(f,shipment);const before=await balance(f,MAKER),oldAddress=await f.address();
 f.maps[2].streets=[{id:'village-prom',name:'Coppergate Promenade',from:{x:0,z:0},to:{x:25,z:0},width:6}];
 const renamed=await f.address();assert.notEqual(renamed.revision,oldAddress.revision);assert.deepEqual(renamed.position,oldAddress.position);
 const state=await receive(f,shipment.id);assert.equal(requestOf(state,request.id).phase,'delivered');assert.equal(await balance(f,MAKER),before+REWARD);assert.equal(state.maps.find(row=>row.id==='request-city').stock[ITEM],1);
});
async function sail(f,shipment){
 const route=SHIPPING_ROUTES.find(row=>row.id===shipment.contractId),identity={walletId:OTHER},environment=f.maps[0],player={shipping:{}},startedAt=f.now,jobId='request-sea:'+shipment.id;
 await f.service.shippingAction(identity,{},player,environment,{operation:'reserve',shipmentId:shipment.id,contractId:route.id});
 player.shipping.job={id:jobId,phase:'loading',contractId:route.id,environmentId:environment.id,startedAt,deadline:startedAt+SHIPPING_RULES.contractLimitMs};
 await f.service.shippingAction(identity,{},player,environment,{operation:'bind',shipmentId:shipment.id,jobId});
 const result={type:'delivery',shipmentId:shipment.id,jobId,deliveryId:jobId,contractId:route.id,cargoId:route.cargoId,units:route.units||4,quality:100,startedAt,departedAt:startedAt+10000,deliveredAt:startedAt+120000};
 f.now=result.deliveredAt;await f.service.deliver(identity,result,environment,f.now);return {identity,result,environment};
}
async function receive(f,shipmentId){
 for(let step=0;step<30;step++){
  const state=await f.state(MAKER),shipment=state.shipments.find(row=>row.id===shipmentId);
  if(shipment?.phase==='delivered')return state;
  const tasks=state.deliveryTasks.filter(row=>row.shipmentId===shipmentId);assert.ok(tasks.length,'addressed sea cargo must have a real last-mile delivery task');
  assert.equal(tasks.some(row=>row.phase==='blocked'),false,'the simple real receiving map must allow its delivery route');
  f.now+=Math.max(1000,...tasks.map(row=>Number(row.totalDurationMs)||0))+10;
 }
 assert.fail('The real truck/courier delivery did not finish within its bounded phases.');
}

test('a funded world request escrows once, validates its address and exposes public maker controls without wallet identities',async t=>{
 const f=await fixture(t),address=await f.address(),input={itemId:ITEM,quantity:2,rewardMzk:REWARD,addressId:address.id,expectedAddressRevision:address.revision,requestId:'request-once'};
 const created=await f.service.action(BUYER,'request-create',input);
 assert.equal(created.itemId,ITEM);assert.equal(created.quantity,2);assert.equal(created.rewardMzk,REWARD);assert.equal(created.mine,true);assert.ok(created.id);
 assert.equal(await balance(f,BUYER),INITIAL-REWARD);assert.deepEqual(await f.service.action(BUYER,'request-create',input),created);
 await assert.rejects(f.service.action(BUYER,'request-create',{...input,rewardMzk:REWARD+1}),/different|changed|reus/i);
 assert.equal(await balance(f,BUYER),INITIAL-REWARD);
 const before=await f.db.read();await assert.rejects(f.create({expectedAddressRevision:'outdated'}));assert.deepEqual(await f.db.read(),before);
 const publicRow=requestOf(await f.state(MAKER),created.id);assert.equal(publicRow.mine,false);assert.equal(publicRow.canClaim,true);assert.equal(publicRow.claimedByMe,false);
 assert.ok(!JSON.stringify(publicRow).includes(BUYER));assert.ok(!JSON.stringify(publicRow).includes(MAKER));
 const claimed=await f.claim(created);assert.equal(claimed.claimedByMe,true);
 const awaitingStock=requestOf(await f.state(MAKER),created.id);assert.equal(awaitingStock.canFulfill,false);assert.equal(awaitingStock.fulfillableQuantity,0,'claiming a request does not imply finished owned stock exists');
 await assert.rejects(f.claim(created,OTHER));assert.equal(await balance(f,MAKER),INITIAL);
});

test('a real shop inventory call remains unfunded until a member escrows its reward, and cannot be funded twice concurrently',async t=>{
 const f=await fixture(t),initial=await f.state(),call=initial.aiCalls.find(row=>row.itemId===ITEM&&row.addressId===(initial.addresses.find(address=>address.objectId==='request-shop')?.id));
 assert.ok(call,'the actual shop’s canonical product and receiving stock create a real restock call');assert.equal(call.funded,false);assert.ok(call.shortfall>0);
 assert.equal(await balance(f,BUYER),INITIAL);assert.equal(initial.maps.find(row=>row.id==='request-city').stock[ITEM]||0,0);
 const funded=await f.create({sourceCallId:call.id,itemId:call.itemId,addressId:call.addressId,expectedAddressRevision:call.addressRevision,quantity:Math.min(1,call.shortfall)});
 assert.equal(funded.originCallId,call.id);assert.equal(funded.requesterKind,call.kind);assert.equal(await balance(f,BUYER),INITIAL-REWARD);
 const makerBefore=await balance(f,MAKER);await assert.rejects(f.create({sourceCallId:call.id,itemId:call.itemId,addressId:call.addressId,expectedAddressRevision:call.addressRevision},MAKER),/call|fund|changed|active/i);
 assert.equal(await balance(f,MAKER),makerBefore);assert.ok(!(await f.state()).aiCalls.some(row=>row.id===call.id),'the funded call no longer advertises another simultaneous reward');
});

test('an owned deed receives requested completed stock through its real entrance, while a later deed sale blocks unshipped work',async t=>{
 const f=await fixture(t),deed={id:'request-home-deed',worldId:'request-home-world',name:'The maker’s customer home',ownerId:BUYER,status:'active',hostedSpace:{environmentId:'public-commons'}},destination=plotSpaceId(deed);
 f.maps.push({id:destination,name:deed.name,memberPlot:true,deedId:deed.id,ownerId:BUYER,visibility:'public',spawn:{x:0,y:0,z:0},builderScene:{layout:'grand-floor',mapSize:80,objects:[{id:'decorative-dagger',modelId:'forge-dagger',asset:{buildAssetId:'forge-dagger'},position:{x:20,y:0,z:20},functionalSettings:{behavior:'pickup'}}]}});
 await f.db.transaction(data=>{data.landDeeds[deed.worldId]={...deed};data.users[BUYER].items.push({id:deed.id,type:'land-deed',worldId:deed.worldId,name:deed.name});return {};});
 const address=(await f.service.addresses({mapId:destination})).addresses.find(row=>row.kind==='deed-entrance');assert.ok(address);assert.equal(address.deedId,deed.id);
 const create=()=>f.service.action(BUYER,'request-create',{itemId:ITEM,quantity:1,rewardMzk:REWARD,addressId:address.id,expectedAddressRevision:address.revision,source:'factory',shippingMapId:'hormuz-shipping',contractId:'gulf-gateway',requestId:f.id('deed-request')});
 const request=await create();assert.equal(request.destinationMapId,destination);assert.equal(request.address.kind,'deed-entrance');await f.claim(request);
 await assert.rejects(f.fulfill(request),/lot|stock|complete|available/i,'a saved pickup model on the deed is not completed owned creation stock');
 assert.equal((await f.state()).maps.find(row=>row.id===destination).stock[ITEM]||0,0);assert.equal((await f.db.get(BUYER)).items.some(item=>item.buildAssetId==='forge-dagger'),false);
 const job=await f.produce(),lotId=await f.finish(job),fulfilled=await f.fulfill(request,{lotIds:[lotId]}),stored=await f.db.read(),shipment=stored.worldSupply.shipments[fulfilled.shipmentIds[0]];
 assert.equal(shipment.recipientId,BUYER);assert.equal(shipment.deedId,deed.id);assert.equal(shipment.addressId,address.id);assert.deepEqual(stored.worldSupply.factoryLotAllocations[shipment.id].lots,[{lotId,quantity:1}]);
 assert.equal(stored.worldSupply.factoryLots[lotId].availableQuantity,0);assert.equal(stored.worldSupply.maps[destination].stock[ITEM]||0,0,'reserving freight cannot credit the plot');
 await sail(f,shipment);const received=await receive(f,shipment.id);assert.equal(received.maps.find(row=>row.id===destination).stock[ITEM],1);assert.equal(requestOf(received,request.id).deliveredQuantity,1);
 const next=await create();await f.claim(next);const secondJob=await f.produce(),secondLot=await f.finish(secondJob),makerPaid=await balance(f,MAKER);
 await f.db.transaction(data=>{data.landDeeds[deed.worldId].ownerId=OTHER;const entitlement=data.users[BUYER].items.find(item=>item.id===deed.id);data.users[BUYER].items=data.users[BUYER].items.filter(item=>item.id!==deed.id);data.users[OTHER].items.push(entitlement);return {};});
 await assert.rejects(f.fulfill(next,{lotIds:[secondLot]}),/address|owner|hold|changed|available/i);
 const held=await f.state(MAKER);assert.equal(requestOf(held,next.id).phase,'attention');assert.equal((await f.db.read()).worldSupply.factoryLots[secondLot].availableQuantity,1);assert.equal(await balance(f,MAKER),makerPaid);assert.equal(held.maps.find(row=>row.id===destination).stock[ITEM],1,'the completed earlier receipt remains received without granting the new owner unshipped work');
});

test('a busy world board retains the viewer’s earlier funded work instead of hiding it behind newer requests from other members',async t=>{
 const f=await fixture(t),mine=await f.create();await f.claim(mine);
 await f.db.transaction(data=>{
  const ledger=data.worldSupply,original=ledger.itemRequests[mine.id];
  for(let index=0;index<110;index++){
   const id='other-world-request-'+index;
   ledger.itemRequests[id]={...structuredClone(original),id,ownerId:OTHER,claimantId:null,claimantName:null,phase:'open',createdAt:original.createdAt+index+1,updatedAt:original.updatedAt+index+1};
  }
  return {};
 });
 for(const wallet of [BUYER,MAKER]){
  const rows=(await f.state(wallet)).inventoryRequests;assert.equal(rows.length,100);assert.ok(rows.some(row=>row.id===mine.id),'the viewer’s existing funded or claimed request must remain reachable');
 }
});

test('a claimed request rejects incomplete production, seed inventory and another member’s completed lot',async t=>{
 const f=await fixture(t),request=await f.create();await f.claim(request);
 const own=await f.produce(),foreign=await f.produce(1,OTHER);
 await assert.rejects(f.fulfill(request,{lotIds:['production:'+own.id]}),/complete|packed|stock|lot|ready/i);
 await assert.rejects(f.fulfill(request,{sourceMapId:'world',lotIds:['legacy:'+ITEM]}),/complete|packed|stock|lot|ready/i);
 await f.finish(foreign);await assert.rejects(f.fulfill(request,{lotIds:['production:'+foreign.id]}),/own|lot|stock|available/i);
 assert.equal((await f.db.read()).worldSupply.shipments&&Object.keys((await f.db.read()).worldSupply.shipments).length,0);
 const ownLot=await f.finish(own),ready=requestOf(await f.state(MAKER),request.id);assert.equal(ready.canFulfill,true);assert.equal(ready.fulfillableQuantity,1);
 const fulfilled=await f.fulfill(request,{lotIds:[ownLot]});
 assert.equal(fulfilled.shipmentIds.length,1);
 const data=await f.db.read(),shipment=data.worldSupply.shipments[fulfilled.shipmentIds[0]],allocation=data.worldSupply.factoryLotAllocations[shipment.id];
 assert.deepEqual(allocation.lots,[{lotId:ownLot,quantity:1}]);assert.equal(shipment.addressId,(await f.address()).id);assert.equal(shipment.destinationMapId,'request-city');assert.equal(shipment.deliverySchemaVersion,1);
 assert.equal(data.worldSupply.factoryLots['production:'+foreign.id].availableQuantity,1,'a request cannot consume another member’s completed work');
});

test('exact final addressed receipts complete the request and release its MZK reward once; sea arrival alone earns nothing',async t=>{
 const f=await fixture(t),request=await f.create();await f.claim(request);
 const job=await f.produce(),lotId=await f.finish(job),makerAfterProduction=await balance(f,MAKER),fulfilled=await f.fulfill(request,{lotIds:[lotId]});
 let state=await f.state(MAKER),shipment=state.shipments.find(row=>row.id===fulfilled.shipmentIds[0]);assert.equal(await balance(f,MAKER),makerAfterProduction);
 const voyage=await sail(f,shipment);state=await f.state(MAKER);
 assert.equal(requestOf(state,request.id).deliveredQuantity,0);assert.equal(state.stockReceipts.filter(row=>row.shipmentId===shipment.id).length,0);
 assert.equal(await balance(f,MAKER),makerAfterProduction);assert.equal(state.maps.find(row=>row.id==='request-city').stock[ITEM]||0,0);
 state=await receive(f,shipment.id);const completed=requestOf(state,request.id);
 assert.equal(completed.deliveredQuantity,1);assert.ok(['delivered','completed'].includes(completed.phase));assert.equal(await balance(f,MAKER),makerAfterProduction+REWARD);assert.equal(await balance(f,BUYER),INITIAL-REWARD);
 const receipt=state.stockReceipts.find(row=>row.shipmentId===shipment.id);assert.ok(receipt);assert.equal(receipt.addressId,shipment.addressId);assert.deepEqual(receipt.lotAllocations,[{lotId,quantity:1}]);
 assert.equal(state.maps.find(row=>row.id==='request-city').stock[ITEM],1);
 await f.service.deliver(voyage.identity,voyage.result,voyage.environment,f.now);await f.state(MAKER);await f.state(BUYER);
 assert.equal(await balance(f,MAKER),makerAfterProduction+REWARD);assert.equal((await f.state()).maps.find(row=>row.id==='request-city').stock[ITEM],1);
 await assert.rejects(f.service.action(BUYER,'request-cancel',{inventoryRequestId:request.id,requestId:'cancel-delivered-request'}));
});

test('hand forging must finish and seal its original Backpack item before fulfilling another user’s request',async t=>{
 const f=await fixture(t),request=await f.create();await f.claim(request);
 const crafted=await f.craft();assert.equal(crafted.buildAssetId,'forge-dagger');
 await assert.rejects(f.fulfill(request),/lot|stock|complete|seal|available/i);
 assert.ok((await f.db.get(MAKER)).items.some(item=>item.id===crafted.id));
 const sealed=await f.service.action(MAKER,'export-forge',{itemId:crafted.id,requestId:'seal-request-forged-item'}),fulfilled=await f.fulfill(request,{lotIds:[sealed.lotId]});
 const data=await f.db.read(),shipment=data.worldSupply.shipments[fulfilled.shipmentIds[0]];
 assert.deepEqual(data.worldSupply.factoryLotAllocations[shipment.id].lots,[{lotId:sealed.lotId,quantity:1}]);assert.equal(data.worldSupply.factoryLots[sealed.lotId].qualityReceipt.kind,'traditional-forge');
 assert.equal(data.users[MAKER].items.some(item=>item.id===crafted.id),false);assert.equal(await balance(f,BUYER),INITIAL-REWARD);
});

test('split fulfillment keeps escrow until every requested unit has its own final receiving receipt',async t=>{
 const f=await fixture(t),request=await f.create({quantity:2});await f.claim(request);
 const job=await f.produce(2),lot=await f.finish(job),paid=await balance(f,MAKER);
 let staged=await f.fulfill(request,{quantity:1,lotIds:[lot]}),state=await f.state(MAKER),first=state.shipments.find(row=>row.id===staged.shipmentIds[0]);
 assert.equal(first.quantity,1);await sail(f,first);state=await receive(f,first.id);
 assert.equal(requestOf(state,request.id).deliveredQuantity,1);assert.equal(await balance(f,MAKER),paid,'one of two delivered units cannot collect the full reward');
 staged=await f.fulfill(request,{quantity:1,lotIds:[lot]});state=await f.state(MAKER);const second=state.shipments.find(row=>staged.shipmentIds.includes(row.id)&&row.id!==first.id);
 assert.ok(second);await sail(f,second);state=await receive(f,second.id);
 assert.equal(requestOf(state,request.id).deliveredQuantity,2);assert.equal(await balance(f,MAKER),paid+REWARD);
 assert.equal(state.maps.find(row=>row.id==='request-city').stock[ITEM],2);assert.equal((await f.db.read()).worldSupply.factoryLots[lot].availableQuantity,0);
 const third=await f.create();await f.claim(third);
 await assert.rejects(f.fulfill(third,{shipmentId:first.id,lotIds:[lot]}),/lot|stock|complete|available/i,'completed shipping evidence cannot be reused to fulfil another request');
 assert.equal(await balance(f,MAKER),paid+REWARD);
});

test('cancelling an unshipped request refunds escrow once, while a live shipping commitment prevents refund',async t=>{
 const f=await fixture(t),first=await f.create();await f.claim(first);
 const cancellation={inventoryRequestId:first.id,requestId:'cancel-request-once'},cancelled=await f.service.action(BUYER,'request-cancel',cancellation);
 assert.equal(cancelled.phase,'cancelled');assert.equal(await balance(f,BUYER),INITIAL);assert.deepEqual(await f.service.action(BUYER,'request-cancel',cancellation),cancelled);
 assert.equal((await f.service.action(BUYER,'request-cancel',{...cancellation,requestId:'refund-twice'})).phase,'cancelled');assert.equal(await balance(f,BUYER),INITIAL,'a fresh cancellation identifier cannot refund the same escrow twice');
 const next=await f.create();await f.claim(next);const job=await f.produce();await f.finish(job);await f.fulfill(next);
 await assert.rejects(f.service.action(BUYER,'request-cancel',{inventoryRequestId:next.id,requestId:'refund-live-freight'}));
 assert.equal(await balance(f,BUYER),INITIAL-REWARD);
});

test('a receiving shop that moves or changes owner puts its request on hold without paying a maker or consuming new stock',async t=>{
 const f=await fixture(t),request=await f.create();await f.claim(request);const job=await f.produce(),lot=await f.finish(job);
 const paid=await balance(f,MAKER);f.maps[2].ownerId=OTHER;
 await assert.rejects(f.fulfill(request,{lotIds:[lot]}),/address|owner|hold|changed|available/i);
 const state=await f.state(MAKER),record=requestOf(state,request.id);assert.equal(record.phase,'attention');assert.equal(record.deliveredQuantity,0);
 assert.equal(await balance(f,MAKER),paid);assert.equal((await f.db.read()).worldSupply.factoryLots[lot].availableQuantity,1);
});

test('moving the same receiving shop after sea unloading holds last-mile cargo and cannot credit destination stock or the bounty',async t=>{
 const f=await fixture(t),request=await f.create();await f.claim(request);const job=await f.produce();await f.finish(job);
 const paid=await balance(f,MAKER),fulfilled=await f.fulfill(request),shipment=(await f.state(MAKER)).shipments.find(row=>row.id===fulfilled.shipmentIds[0]);
 await sail(f,shipment);
 const atPort=await f.state(MAKER);assert.ok(atPort.deliveryTasks.some(task=>task.shipmentId===shipment.id));assert.equal(atPort.maps.find(row=>row.id==='request-city').stock[ITEM]||0,0);
 f.maps[2].builderScene.objects[0].deliveryDropoff.x+=4;
 f.now+=600000;
 const held=await f.state(MAKER),record=requestOf(held,request.id),tasks=held.deliveryTasks.filter(task=>task.shipmentId===shipment.id);
 assert.equal(record.phase,'attention');assert.equal(record.deliveredQuantity,0);assert.equal(await balance(f,MAKER),paid);
 assert.equal(held.maps.find(row=>row.id==='request-city').stock[ITEM]||0,0,'an edited doorway cannot silently receive stock for the earlier requested address revision');
 assert.equal(held.stockReceipts.filter(row=>row.shipmentId===shipment.id).length,0);
 assert.ok(tasks.some(task=>task.phase==='blocked')||held.shipments.find(row=>row.id===shipment.id).phase==='port-held','the previously sealed cargo stays visibly blocked or held for review');
});
