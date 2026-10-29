import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {UserJsonDatabase} from '../user-json-database.mjs';import {WorldSupplyService} from '../server-world-supply.mjs';
import {quarryWorld} from '../quarry-world.mjs';import {shippingWorld} from '../shipping-world.mjs';import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {SHIPPING_ROUTES,SHIPPING_RULES} from '../public/js/shipping-config.js';
import {quarryDeedCommand,stepQuarry} from '../server-quarry.mjs';import {AuthoritativeRooms} from '../authoritative-room.mjs';import {SharedRoomStore} from '../shared-room-store.mjs';
import {earthworksTake,earthworksDeposit} from '../public/js/construction-earthworks.js';
const OWNER='account:quarry-owner',OTHER='account:quarry-other',DEED={id:'deed-quarry-home',worldId:'quarry-home',name:'Quarry Garden Home',ownerId:OWNER,status:'active'},MAP='plot-'+DEED.id;
async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'quarry-supply-'));t.after(()=>rm(dir,{recursive:true,force:true}));const database=new UserJsonDatabase(join(dir,'users.json'));await database.put(OWNER,{tokens:{MZK:10000},items:[{id:DEED.id,type:'land-deed',worldId:DEED.worldId}]});await database.put(OTHER,{tokens:{MZK:10000},items:[]});await database.transaction(data=>{data.landDeeds[DEED.worldId]={...DEED};return {};});
 const mine=quarryWorld(),sea=shippingWorld(),plot={id:MAP,name:DEED.name,memberPlot:true,deedId:DEED.id,proceduralLand:true,spawn:{x:0,y:.02,z:0},builderScene:{layout:'grand-floor',mapSize:80,objects:[]},delivery:{hub:{position:{x:0,y:0,z:20}},dropoff:{position:{x:0,y:0,z:0},kind:'doorstep',name:'Deed entrance'}}},maps=[mine,sea,plot];let now=100000;
 const service=new WorldSupplyService(database,{maps:async()=>maps,collision:new ServerBuilderCollision(),rooms:async()=>({[MAP]:{objects:{}}}),now:()=>now});
 return {dir,database,service,mine,sea,plot,maps,get now(){return now;},set now(value){now=value;}};
}
async function book(f,material='topsoil',quantity=10,id='quarry-reservation-1'){return f.service.quarryInventory({walletId:OWNER},{operation:'export',id,material,quantity,sourceMapId:f.mine.id},f.now);}
function order(f,fields={},wallet=OWNER){return f.service.action(wallet,'order-quarry',{itemId:'quarry:topsoil',quantity:5,sourceMapId:f.mine.id,deedId:DEED.id,contractId:'gulf-gateway',shippingMapId:f.sea.id,requestId:'quarry-order-1',...fields});}
async function voyage(f,shipment){
 const identity={walletId:OTHER},player={shipping:{}},startedAt=f.now,id='quarry-voyage-'+shipment.id;
 await f.service.shippingAction(identity,{},player,f.sea,{operation:'reserve',shipmentId:shipment.id,contractId:shipment.contractId},f.now);
 player.shipping.job={id,phase:'loading',contractId:shipment.contractId,environmentId:f.sea.id,startedAt,deadline:startedAt+SHIPPING_RULES.contractLimitMs};
 await f.service.shippingAction(identity,{},player,f.sea,{operation:'bind',shipmentId:shipment.id,jobId:id},f.now);const route=SHIPPING_ROUTES.find(r=>r.id===shipment.contractId);
 const result={type:'delivery',shipmentId:shipment.id,jobId:id,deliveryId:id,contractId:route.id,cargoId:route.cargoId,units:route.units||4,quality:100,startedAt,departedAt:startedAt+10000,deliveredAt:startedAt+120000};f.now=result.deliveredAt;
 await f.service.deliver(identity,result,f.sea,f.now);return {identity,result};
}
test('quarry products begin at zero, cannot be factory-created, and trusted bookings are idempotent',async t=>{
 const f=await fixture(t),state=await f.service.state({walletId:OWNER});assert.equal(state.worldStock['quarry:sand'],0);assert.equal(state.catalog.some(i=>i.id==='quarry:sand'),false);
 await assert.rejects(f.service.action(OWNER,'produce',{itemId:'quarry:sand',quantity:5,requestId:'fake-material'}),/blueprint|listed/);
 await book(f);await book(f);assert.equal((await f.service.state({walletId:OWNER})).maps.find(m=>m.id===f.mine.id).stock['quarry:topsoil'],10);
 await assert.rejects(book(f,'sand',10),/reservation/);
});
test('material orders verify current deeds, charge once, and reserve finite source stock',async t=>{
 const f=await fixture(t);await book(f);await assert.rejects(order(f,{},OTHER),/deed holder/);const accepted=await order(f);assert.deepEqual(await order(f),accepted);assert.equal((await f.database.get(OWNER)).tokens.MZK,9980);
 const state=await f.service.state({walletId:OWNER});assert.equal(state.maps.find(m=>m.id===f.mine.id).stock['quarry:topsoil'],5);assert.equal(state.maps.find(m=>m.id===MAP).stock['quarry:topsoil']||0,0);assert.equal(state.shipments.length,1);
 await assert.rejects(order(f,{quantity:6,requestId:'exhausted-order'}),/enough processed stock/);
 await assert.rejects(f.service.action(OTHER,'dispatch',{sourceMapId:f.mine.id,destinationMapId:MAP,itemId:'quarry:topsoil',quantity:1,requestId:'bypass-quarry-order'}),/quarry material order/);
});
test('cancelling unsent quarry freight restores stock and refunds payment once',async t=>{
 const f=await fixture(t);await book(f);const accepted=await order(f);await f.service.action(OWNER,'cancel',{orderId:accepted.id,requestId:'cancel-quarry'});assert.equal((await f.database.get(OWNER)).tokens.MZK,10000);const state=await f.service.state();assert.equal(state.maps.find(m=>m.id===f.mine.id).stock['quarry:topsoil'],10);await assert.rejects(f.service.action(OWNER,'cancel',{orderId:accepted.id,requestId:'cancel-quarry-again'}),/complete|cancelled/);
});
test('quarry freight reaches deed inventory only after sea unloading and real last-mile delivery',async t=>{
 const f=await fixture(t);await book(f);const accepted=await order(f),state=await f.service.state(),shipment=state.shipments.find(s=>s.orderId===accepted.id),trip=await voyage(f,shipment);
 let current=await f.service.state({walletId:OWNER});assert.equal(current.maps.find(m=>m.id===MAP).stock['quarry:topsoil']||0,0,'port unloading alone does not credit a deed');
 for(let i=0;i<25&&current.orders.find(o=>o.id===accepted.id).phase!=='delivered';i++){const tasks=current.deliveryTasks.filter(task=>task.shipmentId===shipment.id);assert.ok(tasks.length);assert.ok(!tasks.some(task=>task.phase==='blocked'),tasks.map(t=>t.blockedReason).join(' '));f.now+=Math.max(1000,...tasks.map(task=>task.totalDurationMs||0))+100;current=await f.service.state({walletId:OWNER});}
 assert.equal(current.orders.find(o=>o.id===accepted.id).phase,'delivered');assert.equal(current.maps.find(m=>m.id===MAP).stock['quarry:topsoil'],5);await f.service.deliver(trip.identity,trip.result,f.sea,f.now);assert.equal((await f.service.state()).maps.find(m=>m.id===MAP).stock['quarry:topsoil'],5);
});
test('deed gardening and recoverable stock bays consume delivered material and respect ownership',async t=>{
 const f=await fixture(t);await f.service.state();await f.database.transaction(data=>{data.worldSupply.maps[MAP].stock['quarry:topsoil']=4;return {};});const sim={actors:{}},player={actorId:'owner',health:100,position:{x:0,y:.02,z:10},yaw:0,progress:{}},context={identity:{walletId:OWNER},inventory:(...args)=>f.service.quarryInventory(...args),collision:new ServerBuilderCollision(),objects:{}};
 const result=await quarryDeedCommand(sim,player,f.plot,{operation:'apply-material',kind:'garden',material:'topsoil',quantity:1,requestId:'garden-1'},f.now,context);assert.equal(result.receipt.seedReady,true);assert.ok(Object.values(sim.actors).some(a=>a.modelId==='quarry-garden-bed'));assert.equal((await f.service.state()).maps.find(m=>m.id===MAP).stock['quarry:topsoil'],3);
 await assert.rejects(quarryDeedCommand({actors:{}},player,f.plot,{operation:'deed-state'},f.now,{...context,identity:{walletId:OTHER}}),/deed holder/);
 player.position={x:10,y:.02,z:10};const stored=await quarryDeedCommand(sim,player,f.plot,{operation:'apply-material',kind:'storage',material:'topsoil',quantity:2,requestId:'storage-1'},f.now,context),actor=Object.values(sim.actors).find(a=>a.quarryUse?.id===stored.receipt.id);player.position={...actor.position};
 await quarryDeedCommand(sim,player,f.plot,{operation:'recover-storage',entityId:actor.id},f.now,context);assert.equal(actor.active,false);assert.equal((await f.service.state()).maps.find(m=>m.id===MAP).stock['quarry:topsoil'],3);await f.service.quarryInventory({walletId:OWNER},{operation:'recover',useId:stored.receipt.id,mapId:MAP},f.now);assert.equal((await f.service.state()).maps.find(m=>m.id===MAP).stock['quarry:topsoil'],3);
});
test('durable quarry export reservations survive a storage acknowledgement failure without duplicate credit',async t=>{
 const f=await fixture(t),store=new SharedRoomStore(join(f.dir,'rooms.json'));let failOnce=true;
 const runtime=new AuthoritativeRooms({store,now:()=>f.now,quarryInventory:async(...args)=>{const result=await f.service.quarryInventory(...args);if(failOnce){failOnce=false;throw Error('Simulated booking acknowledgement lost');}return result;}}),identity={accountId:'quarry-owner',walletId:OWNER,username:'Quarry Owner'};
 let sequence=0;const send=(operation,fields={})=>runtime.command(f.mine.id,f.mine,identity,{action:'quarry-controls',operation,requestId:'quarry-durable-'+ ++sequence,...fields});await runtime.command(f.mine.id,f.mine,identity,{action:'join',requestId:'quarry-durable-join'});
 await store.update(f.mine.id,room=>{const sim=room.simulation,e=sim.construction.earthworks,feed=e.patches.find(p=>p.id==='screen-feed'),raw=earthworksTake(e,{x:25,y:-3,z:-35},10,{radius:3,materials:['gravel']});earthworksDeposit(e,{x:68,y:Infinity,z:-34},raw,{radius:5});sim.quarry.aiEnabled=true;sim.construction.crew.enabled=true;for(const w of sim.construction.crew.workers){w.enabled=w.id==='crew-maya';if(w.enabled)w.position={...f.mine.quarry.operatorHome};}for(const s of Object.values(sim.quarry.stations))s.enabled=true;for(let i=0;i<50;i++)stepQuarry(sim,f.mine,f.now,.25);});
 const reserved=await send('reserve-stock',{material:'sand',quantity:1}),id=reserved.result.exportId;await assert.rejects(send('book-stock',{exportId:id}),/acknowledgement/);await send('book-stock',{exportId:id});const state=await f.service.state();assert.equal(state.maps.find(m=>m.id===f.mine.id).stock['quarry:sand'],1);
});

test('another owner cannot buy reserved material from a member-hosted quarry',async t=>{
 const f=await fixture(t);f.mine.memberPlot=true;f.mine.ownerId=OTHER;await book(f);await assert.rejects(order(f),/current deed holder/);
});
