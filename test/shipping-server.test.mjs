import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {shippingWorld} from '../shipping-world.mjs';
import {SHIPPING_RULES,SHIPPING_ROUTES,SHIPPING_PORTS} from '../public/js/shipping-config.js';
import {shippingCommand,stepShipping,shippingView,playerShippingView,shippingHandling,shippingVesselUnlocked,cancelShipping,grantShippingReward,shippingAccountState,applyShippingAccount,applyShippingSettlement,shippingDefense} from '../server-shipping.mjs';
import {boatAssistedInput} from '../public/js/boat-assist.js';
import {stepBoatSimulation} from '../public/js/boat-simulation.js';
import {GameEconomy} from '../public/js/game-economy-client.js';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {boatMovementBlocked} from '../server-boat-assist.mjs';
import {isWatercraft,watercraftOverlap} from '../public/js/harbor-water.js';
import {SharedRoomStore} from '../shared-room-store.mjs';
function fixture({routeId='dock-induction',modelId='shipping-feeder'}={}){
 const environment=shippingWorld(),route=SHIPPING_ROUTES.find(route=>route.id===routeId),origin=SHIPPING_PORTS.find(port=>port.id===route.from),boat={id:'freight',modelId,position:{x:origin.x,y:0,z:origin.z},rotation:{x:0,y:origin.berth.yaw,z:0},active:true,health:650,maxHealth:650,holderId:'account:captain',boating:{anchor:true,speed:0}},player={actorId:'account:captain',username:'Captain',position:{...boat.position,y:.35},vehicleId:boat.id,health:100,grounded:true,lastSeen:100000,yaw:boat.rotation.y,movementRevision:1},sim={players:{[player.actorId]:player},actors:{[boat.id]:boat},events:[]};let now=100000;
 const advance=ms=>{now+=ms;player.lastSeen=now;stepShipping(sim,environment,now);};const send=(operation,fields={})=>shippingCommand(sim,player,environment,{operation,...fields},now);
 const sail=()=>{let ticks=0;for(;ticks<6000&&player.shipping.job.phase==='sailing';ticks++){advance(250);const input=boatAssistedInput(boat,{},environment,now,sim.actors);Object.assign(boat,stepBoatSimulation(boat,input,.25,{environment,now}));player.position={...boat.position,y:.35};if(player.shipping.job.checkpointIndex===player.shipping.job.waypoints.length&&Math.abs(boat.boating.speed)<.15)break;}assert.ok(ticks<6000,'real boat assistance reaches its required final berth');advance(250);};
 return {sim,player,boat,environment,route,origin,advance,send,sail,get now(){return now;}};
}
function load(f){f.send('accept',{contractId:f.route.id});for(let i=0;i<f.player.shipping.job.units;i++){f.send('load',{side:i%2?'starboard':'port'});f.advance(SHIPPING_RULES.loadingSeconds*1000);}f.send('secure');}
function deliver(f){load(f);f.send('depart');f.sail();f.send('dock');let result;for(let i=0;i<f.player.shipping.job.units;i++){result=f.send('unload');f.advance(SHIPPING_RULES.loadingSeconds*1000);}return result.settlement;}

test('shipping validates manifest, load capacity, side balance and crane timing before departure',()=>{
 const f=fixture();assert.throws(()=>f.send('accept',{contractId:'forged-route',amountMzk:999}),/listed freight/);f.send('accept',{contractId:f.route.id});assert.equal(shippingHandling(f.player),true);assert.throws(()=>f.send('depart'),/secure/);
 f.send('load',{side:'port'});assert.throws(()=>f.send('load',{side:'starboard'}),/crane/);f.advance(2000);assert.throws(()=>f.send('load',{side:'middle'}),/port or starboard/);f.send('load',{side:'port'});f.advance(2000);assert.throws(()=>f.send('load',{side:'port'}),/side is full/);assert.throws(()=>f.send('secure'),/complete manifest/);
 f.send('load',{side:'starboard'});f.advance(2000);f.send('load',{side:'starboard'});f.advance(2000);f.send('secure');assert.equal(f.player.shipping.job.secured,true);assert.equal(f.boat.boating.cargoCount,4);assert.equal(f.boat.boating.loadBalance,0);f.send('depart');assert.equal(shippingHandling(f.player),false);assert.equal(f.boat.boating.navigationType,'shipping');assert.throws(()=>f.send('unload'),/Dock/);
});

test('real boat physics completes every tutorial gate then authorizes dock unloading and private settlement',()=>{
 const f=fixture(),result=deliver(f),job=f.player.shipping.job;assert.equal(result.type,'delivery');assert.equal(result.contractId,'dock-induction');assert.equal(result.quality,100);assert.equal(result.units,4);assert.ok(job.distanceSailed>350);assert.equal(job.checkpointIndex,job.waypoints.length);assert.equal(job.phase,'unloading','wallet receipt must commit before final container disappears');assert.equal(playerShippingView(f.sim,f.player).job.readyToDock,false);assert.ok(f.now-result.departedAt>job.minTransitMs);assert.equal(shippingView(f.sim).traffic.length,2);
 applyShippingSettlement(f.sim,f.player,result,{stats:{deliveries:1},supplies:{'shipping-parts-stock':4},unlocks:['shipping-feeder'],amountMzk:20,message:'Delivered.'},f.now);assert.equal(f.player.shipping.job.phase,'delivered');assert.equal(f.boat.boating.cargoCount,0);assert.equal(f.sim.questResults[0].kind,'shipping');assert.throws(()=>f.send('unload'),/manifest/);
});

test('same-port induction cannot skip the sea passage or forge progress; teleport, defeat and stale play cancel it',()=>{
 const f=fixture();load(f);f.send('depart');assert.throws(()=>f.send('dock',{checkpointIndex:999,quality:100}),/every required channel/);f.boat.position.x+=100;f.advance(250);assert.equal(f.player.shipping.job.phase,'cancelled');assert.equal(f.boat.boating.cargoCount,0);
 for(const key of ['health','lastSeen','movementRevision','vehicleId']){const g=fixture();load(g);g.send('depart');if(key==='health')g.player.health=0;if(key==='lastSeen')g.player.lastSeen-=16000;if(key==='movementRevision')g.player.movementRevision++;if(key==='vehicleId')g.player.vehicleId=null;stepShipping(g.sim,g.environment,g.now);assert.equal(g.player.shipping.job.phase,'cancelled',key+' invalidates the shipment');}
});

test('boarding uses a nearby available unlocked stopped ship; generic vessel unlock policy shares the rule',()=>{
 const f=fixture();f.player.vehicleId=null;f.boat.holderId=null;f.player.position={x:f.origin.x,y:.02,z:f.origin.z+35};assert.equal(playerShippingView(f.sim,f.player).boardingId,f.boat.id);f.send('board');assert.equal(f.player.vehicleId,f.boat.id);assert.equal(f.boat.holderId,f.player.actorId);
 const large={modelId:'shipping-container'};assert.equal(shippingVesselUnlocked(f.player,large),false);applyShippingAccount(f.player,{stats:{deliveries:2},unlocks:['shipping-feeder','shipping-container'],supplies:{}});assert.equal(shippingVesselUnlocked(f.player,large),true);f.send('radio');f.player.vehicleId=null;f.boat.holderId='another';assert.throws(()=>f.send('board'),/available unlocked/);
});

test('pirate/mine scenarios affect only the manifest, show world positions and accept radio or escort protection',()=>{
 for(const routeId of ['peninsula-relief','energy-resupply']){
  const f=fixture({routeId,modelId:routeId==='energy-resupply'?'shipping-container':'shipping-feeder'});if(routeId==='energy-resupply')applyShippingAccount(f.player,{unlocks:['shipping-feeder','shipping-container'],stats:{deliveries:2},supplies:{}});load(f);f.send('depart');const job=f.player.shipping.job;
  // Advance over real, short samples along each server-authored segment until
  // the first hazard is triggered; no client command can set these positions.
  while(!job.hazard&&job.checkpointIndex<job.waypoints.length){const point=job.waypoints[job.checkpointIndex],span=Math.hypot(point.x-f.boat.position.x,point.z-f.boat.position.z),steps=Math.max(1,Math.ceil(span/5)),start={...f.boat.position};for(let i=1;i<=steps&&!job.hazard;i++){f.boat.position={x:start.x+(point.x-start.x)*i/steps,y:0,z:start.z+(point.z-start.z)*i/steps};f.advance(500);}}
  assert.ok(job.hazard);assert.ok(Number.isFinite(job.hazard.position.x));f.advance(9000);assert.equal(job.quality,97);if(job.hazard.type==='pirates'){assert.ok(f.sim.actors[job.threatId]?.shippingThreat);f.send('radio');assert.equal(job.hazard.resolved,false);f.send('escort');}else f.send('radio');assert.equal(job.hazard.resolved,true);const quality=job.quality;f.advance(9000);assert.equal(job.quality,quality);assert.equal(f.player.health,100);assert.equal(f.boat.health,650);
 }
});

async function accountFixture(t){const dir=await mkdtemp(join(tmpdir(),'shipping-server-'));t.after(()=>rm(dir,{recursive:true,force:true}));const database=new UserJsonDatabase(join(dir,'users.json')),wallet='account:captain';await database.transaction(data=>{for(const id of [wallet,'account:other'])data.users[id]={walletId:id,tokens:{MZK:0},items:[],memory:{},revision:0};return {};});return {dir,database,wallet};}
function settlement(){const route=SHIPPING_ROUTES.find(route=>route.id==='dock-induction');return {type:'delivery',deliveryId:randomUUID(),contractId:route.id,cargoId:route.cargoId,units:4,quality:100,amountMzk:route.rewardMzk,startedAt:100000,departedAt:110000,deliveredAt:200000,worldId:'hormuz-shipping'};}
test('delivery rewards, ship unlocks and actual stock inventory commit once, persist and enforce daily cap',async t=>{
 const f=await accountFixture(t),result=settlement(),now=300000;const first=await grantShippingReward(f.database,f.wallet,result,{now});assert.equal(first.amountMzk,20);assert.equal(first.supplies['shipping-parts-stock'],4);assert.equal((await grantShippingReward(f.database,f.wallet,result,{now})).id,first.id);await assert.rejects(grantShippingReward(f.database,'account:other',result,{now}),/another captain/);
 for(let i=0;i<24;i++)await grantShippingReward(f.database,f.wallet,settlement(),{now});const saved=await shippingAccountState(new UserJsonDatabase(f.database.file),f.wallet);assert.equal(saved.stats.deliveries,25);assert.equal(saved.stats.totalEarnedMzk,SHIPPING_RULES.dailyRewardCapMzk);assert.ok(saved.unlocks.includes('shipping-tanker'));const account=(await f.database.read()).users[f.wallet],stock=account.items.find(item=>item.shippingSupplyId==='shipping-parts-stock');assert.equal(stock.quantity,100);assert.equal(stock.renderKind,'shipping-stock');assert.equal(stock.assetType,'supplies');assert.equal(account.tokens.MZK,400);const client=new GameEconomy({inventory:{}}),economy=await f.database.economy(f.wallet);client.assets=economy.ownedAssets;const ownedStock=client.ownedAssets().find(item=>item.shippingSupplyId==='shipping-parts-stock');assert.equal(ownedStock.type,'supplies');assert.equal(ownedStock.quantity,100);assert.equal(economy.items.find(item=>item.sku==='stock:shipping-parts-stock').stock,100);
 assert.throws(()=>grantShippingReward(f.database,f.wallet,{...settlement(),amountMzk:9999},{now}),/Invalid authoritative/);assert.throws(()=>grantShippingReward(f.database,f.wallet,{...settlement(),units:900},{now}),/Invalid authoritative/);
 assert.throws(()=>f.database.economyAction(f.wallet,'buy','stock:shipping-parts-stock','buy-stock'),/Earn shipping stock/);await assert.rejects(f.database.listItem(f.wallet,stock.id,10),/freight dock/);
});

test('dock stock exchanges consume durable quantities, grant usable market tools/material credits and reject replay theft',async t=>{
 const f=await accountFixture(t),now=300000;await grantShippingReward(f.database,f.wallet,settlement(),{now});const trade={type:'trade',tradeId:'parts-metal',stockId:'shipping-parts-stock',exchangeId:randomUUID(),worldId:'hormuz-shipping'},receipt=await grantShippingReward(f.database,f.wallet,trade,{now});assert.equal(receipt.supplies['shipping-parts-stock'],3);assert.equal((await grantShippingReward(f.database,f.wallet,trade,{now})).id,receipt.id);let user=(await f.database.read()).users[f.wallet];assert.equal(user.memory.materialCredits['material:metal'],5);assert.equal(user.items.find(item=>item.shippingSupplyId===trade.stockId).quantity,3);assert.ok(user.items.some(item=>item.economySku==='material:metal'));
 await assert.rejects(grantShippingReward(f.database,f.wallet,{...trade,tradeId:'tools-scanner',stockId:'shipping-tools-stock',exchangeId:randomUUID()},{now}),/already been exchanged/);
 for(let i=0;i<3;i++)await grantShippingReward(f.database,f.wallet,{...trade,exchangeId:randomUUID()},{now});await assert.rejects(grantShippingReward(f.database,f.wallet,{...trade,exchangeId:randomUUID()},{now}),/already been exchanged/);user=(await f.database.read()).users[f.wallet];assert.equal(user.memory.materialCredits['material:metal'],20);assert.equal(user.items.find(item=>item.shippingSupplyId===trade.stockId).quantity,0);
});

test('the authoritative room exposes shipping, prevents handling movement, blocks locked generic boarding and cancels on exit/travel',async t=>{
 const f=await accountFixture(t),environment=shippingWorld();let now=100000,seq=0;const runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(f.dir,'rooms.json')),now:()=>now,shippingState:identity=>shippingAccountState(f.database,identity.walletId),shippingReward:(identity,result)=>grantShippingReward(f.database,identity.walletId,result,{now})}),identity={accountId:'captain',walletId:f.wallet,username:'Captain'},send=(action,fields={})=>{now+=250;return runtime.command(environment.id,environment,identity,{action,requestId:'ship-'+ ++seq,...fields});};
 let view=await send('join');assert.equal(view.shipping.enabled,true);assert.equal(view.players[view.selfId].shipping.boardingId,'shipping-starter-feeder');await assert.rejects(send('map-access',{entityId:'shipping-northern-container'}),/unlock/);view=await send('shipping',{operation:'board'});const self=view.selfId;assert.equal(view.players[self].vehicleId,'shipping-starter-feeder');view=await send('shipping',{operation:'accept',contractId:'dock-induction'});const before=view.actors['shipping-starter-feeder'].position;view=await send('input',{input:{forward:1,anchor:false,throttle:1}});assert.deepEqual(view.actors['shipping-starter-feeder'].position,before);assert.equal(view.actors['shipping-starter-feeder'].boating.anchor,true);assert.deepEqual(view.players[self].input.forward,undefined);
 view=await send('interact');assert.equal(view.players[self].shipping.job.phase,'cancelled');assert.equal(view.players[self].vehicleId,null);
 await send('map-access',{entityId:'shipping-starter-feeder'});await send('shipping',{operation:'accept',contractId:'dock-induction'});const other={id:'another-world',name:'Other',spawn:{x:0,y:0,z:0}};await runtime.command(other.id,other,identity,{action:'join',requestId:'world-travel'});const old=await runtime.store.get(environment.id);assert.equal(old.simulation.players[self].shipping.job.phase,'cancelled');assert.equal(old.simulation.actors['shipping-starter-feeder'].holderId,null);
});

test('authored occupied receiving ships reserve alternate slots and concurrent captains cannot reserve the same berth',()=>{
 const f=fixture({routeId:'gulf-gateway'}),authored=f.environment.builderScene.objects.filter(item=>['shipping-feeder','shipping-container','shipping-tanker'].includes(item.modelId)&&item.id!=='shipping-starter-feeder');for(const item of authored)f.sim.actors[item.id]={...structuredClone(item),health:650,active:true,boating:{anchor:true,speed:0}};
 f.send('accept',{contractId:f.route.id});const first=f.player.shipping.job;assert.equal(first.receivingBerth.x,SHIPPING_PORTS.find(port=>port.id==='fujairah').x+46.5);assert.ok(Math.abs(first.receivingBerth.x-SHIPPING_PORTS.find(port=>port.id==='fujairah').x)<SHIPPING_RULES.dockRadius);assert.equal(first.waypoints.at(-2).x,first.receivingBerth.x+100);
 const other=structuredClone(f.player),ship=structuredClone(f.boat);other.actorId='account:helper';other.vehicleId='second-freight';other.shipping=null;ship.id=other.vehicleId;ship.holderId=other.actorId;ship.position.z-=40;other.position={...ship.position,y:.35};f.sim.players[other.actorId]=other;f.sim.actors[ship.id]=ship;
 shippingCommand(f.sim,other,f.environment,{operation:'accept',contractId:f.route.id},f.now);const second=other.shipping.job;assert.equal(second.receivingBerth.x,SHIPPING_PORTS.find(port=>port.id==='fujairah').x-46.5);assert.notDeepEqual(first.receivingBerth,second.receivingBerth);assert.equal(second.waypoints.at(-2).x,second.receivingBerth.x-100,'negative bay approaches from west rather than crossing the occupied center');
 cancelShipping(other,f.sim,f.now);assert.equal(other.shipping.job.phase,'cancelled');
});

test('defensive weapon uses the normal ray action only against this captain’s marked training pirate',async()=>{
 const f=fixture({routeId:'peninsula-relief'});load(f);f.send('depart');const job=f.player.shipping.job;job.hazard={type:'pirates',resolved:false,message:'Training rogue'};job.threatId='pirate';const origin={x:f.boat.position.x+5,y:5.75,z:f.boat.position.z};const target={id:'pirate',modelId:'harbor-patrol',position:{x:origin.x+15,y:0,z:origin.z},rotation:{y:0},health:90,active:true,shippingThreat:true,shippingOwner:f.player.actorId};f.sim.actors.pirate=target;const dy=1-origin.y,len=Math.hypot(15,dy),direction=[15/len,dy/len,0];let charges=0;const result=await shippingDefense(f.sim,f.player,f.environment,{tool:'laser',direction},f.now,{charge:async sku=>{assert.equal(sku,'tool:laser');charges++;}});assert.equal(result.hitId,'pirate');assert.ok(target.health<90);assert.equal(charges,1);assert.equal(f.player.ammo,119);
 target.shippingOwner='another-captain';f.advance(500);await assert.rejects(shippingDefense(f.sim,f.player,f.environment,{tool:'laser',direction},f.now),/no longer a threat/);target.shippingOwner=f.player.actorId;job.hazard.resolved=true;await assert.rejects(shippingDefense(f.sim,f.player,f.environment,{tool:'dynamite',direction},f.now),/marked training pirate/);
});

test('real occupied-destination delivery sails beside the authored public tanker with full static and hull collision enabled',()=>{
 const f=fixture({routeId:'gulf-gateway'});for(const item of f.environment.builderScene.objects.filter(isWatercraft)){if(item.id==='shipping-starter-feeder')continue;f.sim.actors[item.id]={...structuredClone(item),active:true,health:650,boating:{speed:0,anchor:true}};}
 load(f);f.send('depart');const job=f.player.shipping.job,collision=new ServerBuilderCollision(),blocked=boatMovementBlocked(f.environment,f.boat,f.sim.actors,collision,{});let ticks=0;
 for(;ticks<9000;ticks++){f.advance(250);const input=boatAssistedInput(f.boat,{},f.environment,f.now,f.sim.actors,blocked);Object.assign(f.boat,stepBoatSimulation(f.boat,input,.25,{environment:f.environment,now:f.now,blocked}));f.player.position={...f.boat.position,y:.35};if(job.checkpointIndex===job.waypoints.length&&Math.abs(f.boat.boating.speed)<.15)break;}
 assert.ok(ticks<9000,'full shared-world route arrived: '+JSON.stringify({phase:job.phase,index:job.checkpointIndex,position:f.boat.position,nav:f.boat.boating.assistStage,warning:f.boat.boating.navigationWarning}));f.advance(250);assert.equal(job.phase,'sailing');f.send('dock');assert.equal(job.phase,'unloading');const parked=f.sim.actors['shipping-eastern-tanker'];assert.equal(parked.active,true);assert.equal(parked.health,650);assert.equal(watercraftOverlap(f.boat.position,f.boat.rotation.y,parked.position,parked.rotation.y,.12,f.boat,parked),false);assert.ok(Math.hypot(f.boat.position.x-SHIPPING_PORTS[5].x,f.boat.position.z-SHIPPING_PORTS[5].z)<=SHIPPING_RULES.dockRadius);
});
