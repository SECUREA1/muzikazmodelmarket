import test from 'node:test';
import assert from 'node:assert/strict';
import {STRAIT_FREIGHT_CONNECTIONS} from '../public/js/strait-freight-network.js';
import {AIR_FREIGHT_RULES,ensureAirFreight,prepareAirTransfers,advanceAirTransfers,reserveAirTransfer,releaseAirTransfer,holdAirTransfers,settleAirTransfer,projectAirTransfers,previewAirPlan} from '../world-air-freight.mjs';
import {worldSupplyAirCommand,stepWorldAirFreight,validateAirReservation,playerAirFreightView} from '../server-world-air-freight.mjs';
import {startAircraftAssist,aircraftAssistedInput} from '../server-aircraft-access.mjs';
import {stepAircraftFlight} from '../public/js/aircraft-flight.js';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {compactRoomSnapshot,hydrateRoomSnapshot} from '../public/js/room-snapshot.js';
import {airportWorld} from '../airport-world.mjs';
import {shippingWorld} from '../shipping-world.mjs';

function fixture({destinationPortId='fujairah'}={}){
 const shipment={id:'counted-shipment',ownerId:'sender',itemId:'private:skiff',itemName:'Private configured skiff',quantity:5,destinationPortId,destinationMapId:'plot-recipient',onwardMode:'air',packing:{unitsPerContainer:1,unitsPerRoadCrate:1},seaReceipt:{id:'verified-sea'},phase:'port-received'},ledger={shipments:{[shipment.id]:shipment},factoryLotAllocations:{[shipment.id]:{lots:[{lotId:'lot-a',quantity:3},{lotId:'lot-b',quantity:2}]}},maps:{'plot-recipient':{stock:{}}},portEscrow:{[shipment.id]:{remainingQuantity:5}}};
 const tasks=prepareAirTransfers(ledger,shipment,100000),task=tasks[0];let now=Math.max(...tasks.map(task=>task.portHandling.readyAt))+1;
 advanceAirTransfers(ledger,now);const from=task.route.origin,craft={id:'actual-da40',modelId:'diamond-da40',holderId:'pilot',active:true,health:400,position:{...from.cargoApron,y:.4},rotation:{x:0,y:0,z:0},placementRevision:0,flight:{airborne:false,speed:0,airspeed:0}},player={actorId:'pilot',health:100,lastSeen:now,vehicleId:craft.id,movementRevision:0,position:{...craft.position},input:{}},sim={actors:{[craft.id]:craft},players:{pilot:player},airport:{runwayHolder:null,expires:0}},environment={id:'hormuz-shipping',airport:{enabled:true,ceiling:140,runways:STRAIT_FREIGHT_CONNECTIONS.filter(c=>c.airfield).map(c=>c.airfield.runway)},builderScene:{mapSize:2800}},identity={walletId:'captain'};let deliveries=0;
 const callbacks={identity,action:async(identity,sim,player,environment,command,now)=>{
  if(command.operation==='release')return releaseAirTransfer(ledger,command.airTaskId,{walletId:identity.walletId,reservationId:command.reservationId},now);
  const task=ledger.airTasks[command.airTaskId];validateAirReservation(sim,player,environment,task,now);const reserved=reserveAirTransfer(ledger,task.id,{walletId:identity.walletId,aircraftId:player.vehicleId,mapId:environment.id},now);return {task:reserved,reservationId:reserved.reservationId};
 },delivery:async(identity,proof,environment,now)=>{deliveries++;return settleAirTransfer(ledger,{...proof,captainId:identity.walletId,mapId:environment.id},now);}};
 return {ledger,shipment,tasks,task,craft,player,sim,environment,identity,get now(){return now;},set now(value){now=value;player.lastSeen=now;},get deliveries(){return deliveries;},command(operation,extra={}){player.lastSeen=now;return worldSupplyAirCommand(sim,player,environment,{operation,airTaskId:task.id,...extra},now,callbacks);},tick(ms=50){now+=ms;player.lastSeen=now;stepWorldAirFreight(sim,environment,now);},async load(){await this.command('reserve');await this.command('load');this.tick(AIR_FREIGHT_RULES.loadMs);await this.command('secure');}};
}

test('sea cargo splits into four-crate air manifests without new stock and retains exact finite lot allocations',()=>{
 const f=fixture();assert.deepEqual(f.tasks.map(t=>t.quantity),[4,1]);assert.deepEqual(f.tasks.map(t=>t.offset),[0,4]);
 assert.deepEqual(f.tasks[0].lotAllocations,[{lotId:'lot-a',quantity:3},{lotId:'lot-b',quantity:1}]);assert.deepEqual(f.tasks[1].lotAllocations,[{lotId:'lot-b',quantity:1}]);
 assert.equal(f.ledger.portEscrow[f.shipment.id].remainingQuantity,5);assert.deepEqual(f.ledger.maps['plot-recipient'].stock,{});assert.equal(prepareAirTransfers(f.ledger,f.shipment,f.now).length,2);
 assert.throws(()=>previewAirPlan({...f.shipment,destinationPortId:'qeshm'}),/no connected airfield/);
 const projection=projectAirTransfers(f.ledger,'hormuz-shipping',f.now);assert.equal(projection.routes.filter(r=>r.kind==='air').length,1);assert.equal(projection.aircraft.length,0);assert.equal(projection.dropoffs.length,2);assert.ok(!JSON.stringify(projection).includes('Private configured skiff'));assert.ok(!JSON.stringify(projection).includes('private:skiff'));
});

test('dock handling must finish before reservation and blocked ownership cannot advance port cargo',()=>{
 const f=fixture(),shipment={...f.shipment,id:'other',airTaskIds:undefined},ledger={shipments:{other:shipment}};const [task]=prepareAirTransfers(ledger,shipment,1000);
 assert.throws(()=>reserveAirTransfer(ledger,task.id,{walletId:'pilot',aircraftId:'plane',mapId:task.mapId},1000),/port truck/);
 advanceAirTransfers(ledger,task.portHandling.readyAt+1,{canAdvance:()=>false});assert.equal(task.portHandling.elapsedMs,0);assert.equal(task.phase,'blocked');assert.equal(task.portHandling.phase,'blocked');
 advanceAirTransfers(ledger,task.portHandling.readyAt+2,{canAdvance:()=>true});assert.equal(task.portHandling.elapsedMs,1,'blocked time cannot be converted into completed handling');
 advanceAirTransfers(ledger,task.portHandling.lastAdvancedAt+task.portHandling.totalDurationMs,{canAdvance:()=>true});assert.equal(task.phase,'awaiting-pilot');
});

test('reservations bind one plane and captain, expire safely, and sender holds retain received goods',async()=>{
 const f=fixture();await f.command('reserve');const task=f.task,reservation=task.reservationId;
 assert.throws(()=>reserveAirTransfer(f.ledger,f.tasks[1].id,{walletId:'other',aircraftId:f.craft.id,mapId:task.mapId},f.now),/existing air manifest/);
 assert.throws(()=>releaseAirTransfer(f.ledger,task.id,{walletId:'other',reservationId:reservation},f.now),{statusCode:403});
 advanceAirTransfers(f.ledger,task.leaseUntil+1);assert.equal(task.phase,'awaiting-pilot');assert.equal(task.reservationId,undefined);assert.deepEqual(f.ledger.maps['plot-recipient'].stock,{});
 holdAirTransfers(f.ledger,f.shipment,f.now);assert.ok(f.tasks.every(task=>task.phase==='port-held'));assert.throws(()=>reserveAirTransfer(f.ledger,task.id,{walletId:'captain',aircraftId:f.craft.id,mapId:task.mapId},f.now));
});

test('client fields cannot unload, skip sealed loading or replace ordered flight proof',async()=>{
 const f=fixture();await f.command('reserve');await assert.rejects(f.command('unload',{deliveredAt:f.now,departedAt:f.now}),/Fly the departure/);await assert.rejects(f.command('secure'),/Complete loading/);
 await f.command('load');await assert.rejects(f.command('secure'),/Complete loading/);f.craft.flight.airborne=true;f.tick();assert.equal(f.player.airFreight.phase,'cancelled');assert.equal(f.deliveries,0);
 const bad={airTaskId:f.task.id,shipmentId:f.shipment.id,reservationId:f.task.reservationId,aircraftId:f.craft.id,captainId:'captain',mapId:'hormuz-shipping',quantity:99,deliveryId:'forged'};assert.throws(()=>settleAirTransfer(f.ledger,bad,f.now),/does not match/);
 assert.deepEqual(f.ledger.maps['plot-recipient'].stock,{});
});

test('exit, relocation, placement changes and disconnected pilots invalidate active proof without granting stock',async()=>{
 for(const change of [f=>f.player.movementRevision++,f=>f.craft.placementRevision++,f=>f.environment.contentUpdatedAt='republished',f=>f.craft.active=false,f=>f.player.vehicleId=null,f=>f.player.lastSeen=f.now-AIR_FREIGHT_RULES.reconnectGraceMs-1]){
  const f=fixture();await f.load();change(f);stepWorldAirFreight(f.sim,f.environment,f.now);assert.equal(f.player.airFreight.phase,'cancelled');assert.equal(f.deliveries,0);assert.deepEqual(f.ledger.maps['plot-recipient'].stock,{});
 }
});

test('actual assisted physics completes a sealed Strait flight once and still leaves stock in receiving escrow',async()=>{
 const f=fixture();await f.load();const job=f.player.airFreight;
 const publicJob=JSON.stringify(playerAirFreightView(f.player));assert.ok(!publicJob.includes('reservationId'));assert.ok(!publicJob.includes('Private configured'));assert.ok(!publicJob.includes('private:skiff'));
 startAircraftAssist(f.sim,f.player,f.environment,'navigate',f.now,null,{},f.task.route.destination.runwayId);assert.equal(job.movementRevision,f.player.movementRevision,'normal server-assisted runway staging preserves its cargo proof');
 let steps=0;
 while(f.craft.flight.assist&&steps++<10000){
  f.now+=50;const input=aircraftAssistedInput(f.craft,{},f.environment,f.now),pose=stepAircraftFlight(f.craft,input,.05,{ground:.4,half:1400,ceiling:140});assert.equal(pose.flight.impactDamage,0);Object.assign(f.craft,pose);f.player.position={...f.craft.position};stepWorldAirFreight(f.sim,f.environment,f.now);assert.notEqual(job.phase,'cancelled');
 }
 assert.ok(steps<10000);assert.equal(f.craft.flight.airborne,false);assert.equal(job.phase,'landed',JSON.stringify({phase:job.phase,position:f.craft.position,flight:f.craft.flight}));assert.ok(job.departedAt<job.approachAt&&job.approachAt<=job.landedAt);
 await f.command('unload');await assert.rejects(f.command('unload'),/until unloading completes/);f.tick(AIR_FREIGHT_RULES.unloadMs);const result=await f.command('unload');assert.equal(f.task.phase,'air-delivered');assert.equal(result.airReceipt.quantity,4);assert.equal(f.deliveries,1);
 await f.command('unload');assert.equal(f.deliveries,1);assert.equal(f.shipment.airReceivedQuantity,4);assert.equal(f.tasks[1].phase,'awaiting-pilot');assert.equal(f.ledger.portEscrow[f.shipment.id].remainingQuantity,5);assert.deepEqual(f.ledger.maps['plot-recipient'].stock,{});
 const receipt=f.ledger.airReceipts[f.task.id];assert.equal(settleAirTransfer(f.ledger,{airTaskId:f.task.id,reservationId:receipt.reservationId,deliveryId:receipt.deliveryId},f.now),receipt);assert.throws(()=>settleAirTransfer(f.ledger,{airTaskId:f.task.id,reservationId:'forged',deliveryId:receipt.deliveryId},f.now),/different flight/);
});

test('every approved port air route supports the real assisted takeoff, approach, landing and freight proof',async()=>{
 for(const connection of STRAIT_FREIGHT_CONNECTIONS.filter(connection=>connection.airfield)){
  const f=fixture({destinationPortId:connection.portId});await f.load();startAircraftAssist(f.sim,f.player,f.environment,'navigate',f.now,null,{},f.task.route.destination.runwayId);let steps=0;
  while(f.craft.flight.assist&&steps++<10000){f.now+=50;Object.assign(f.craft,stepAircraftFlight(f.craft,aircraftAssistedInput(f.craft,{},f.environment,f.now),.05,{ground:.4,half:1400,ceiling:140}));f.player.position={...f.craft.position};stepWorldAirFreight(f.sim,f.environment,f.now);}
  assert.ok(steps<10000,connection.portId+' flight finishes before its assist deadline');assert.equal(f.player.airFreight.phase,'landed',connection.portId+' verifies its real ordered airborne path '+JSON.stringify({steps,position:f.craft.position,flightPhase:f.craft.flight.phase}));assert.equal(f.craft.flight.airborne,false);
 }
});

test('authoritative room snapshots retain safe pilot progress through both compact protocols',async()=>{
 const f=fixture();await f.load();const rooms=new AuthoritativeRooms({store:{},now:()=>f.now}),room={simulation:{...f.sim,time:f.now,sequence:1,events:[]},objects:{}};
 const snapshot={...rooms.view(room),selfId:'pilot'};assert.equal(snapshot.players.pilot.airFreight.phase,'secured');
 for(const protocol of [1,2]){
  const compact=compactRoomSnapshot(snapshot,{action:'input',snapshotMode:'compact',snapshotProtocol:protocol},f.environment),hydrated=hydrateRoomSnapshot(JSON.parse(JSON.stringify(compact)));assert.equal(hydrated.players.pilot.airFreight.airTaskId,f.task.id);
  const encoded=JSON.stringify(hydrated);assert.ok(!encoded.includes(f.task.reservationId),'sealed reservation is server-only');assert.ok(!encoded.includes('Private configured skiff'));assert.ok(!encoded.includes('private:skiff'));
 }
});

test('joining another map after a server restart can release sealed air cargo without the old active world cache',async()=>{
 const f=fixture();await f.load();f.player.airFreight.phase='cancelled';let release;
 const rooms=new AuthoritativeRooms({store:{},now:()=>f.now,supplyAirAction:async(...args)=>{release=args;}});
 await rooms.releaseCancelledSupply(f.identity,f.sim,f.player,undefined,f.now);
 assert.equal(release[3].id,'hormuz-shipping');assert.equal(release[3].airport.enabled,true);assert.equal(release[4].operation,'release');assert.equal(f.player.airFreight.releasedAt,f.now);assert.deepEqual(f.ledger.maps['plot-recipient'].stock,{});
});

test('the real room flight loop reaches Strait airfields beyond the legacy 992 metre boundary while ordinary maps retain it',()=>{
 const cases=[{id:'hormuz-shipping',mapSize:2800,crosses:true},{id:'ordinary-bounded-airport',mapSize:2000,crosses:false}];
 for(const entry of cases){
  const f=fixture(),world={...f.environment,id:entry.id,proceduralLand:true,spawn:{x:0,y:0,z:0},builderScene:{version:3,layout:'grand-floor',mapSize:entry.mapSize,objects:[{id:f.craft.id,modelId:'diamond-da40',position:{x:1030,y:35,z:990},rotation:{x:0,y:Math.PI,z:0},functionalSettings:{behavior:'vehicle',destructible:true,health:400}}],gameplay:{multiplayer:true,radTox:false}}};
  // The smaller world places the aircraft inside its existing X bound. Both
  // runs approach the same old Z edge through the real server physics loop.
  if(!entry.crosses)world.builderScene.objects[0].position.x=900;
  Object.assign(f.craft,{position:{...world.builderScene.objects[0].position},rotation:{x:0,y:Math.PI,z:0},flight:{airborne:true,altitude:34.6,speed:18,airspeed:18,throttle:.65,throttleCommand:.65}});f.player.position={...f.craft.position};f.player.radToxReady=true;f.player.radToxEnabled=false;
  const rooms=new AuthoritativeRooms({store:{},now:()=>f.now}),room={objects:{},revision:0,simulation:{...f.sim,time:f.now,sequence:0,events:[]}};
  rooms.initialize(room,world);
  for(let tick=0;tick<8;tick++){f.now+=100;room.simulation.players.pilot.lastSeen=f.now;rooms.step(room,world);}
  const snapshot=rooms.view(room),craft=snapshot.actors[f.craft.id];
  assert.equal(snapshot.players.pilot.vehicleId,craft.id);assert.equal(craft.flight.airborne,true);
  if(entry.crosses)assert.ok(craft.position.z>996,'Strait flight physics must pass z992 toward the Fujairah runway at z1050 and approach at z1290');
  else assert.ok(craft.position.z<=992,'ordinary 2000 metre maps retain their established flight edge');
 }
});

test('Strait navigation reserves a bounded eight-minute flight window while ordinary airport navigation keeps its existing minimum',()=>{
 const f=fixture();startAircraftAssist(f.sim,f.player,f.environment,'navigate',f.now,null,{},f.task.route.destination.runwayId);assert.ok(f.craft.flight.assistTimeoutMs>=480000);assert.ok(f.craft.flight.assistTimeoutMs<=600000);
 const ordinary=fixture(),world=airportWorld();ordinary.craft.position={x:21,y:.4,z:0};ordinary.player.position={...ordinary.craft.position};startAircraftAssist(ordinary.sim,ordinary.player,world,'navigate',ordinary.now,null,{},'mountain-runway');assert.equal(ordinary.craft.flight.assistTimeoutMs,240000);
});

test('an expired ground assist removes engine power and brakes without changing the airborne recovery fallback',()=>{
 const f=fixture();Object.assign(f.craft.flight,{assist:'land',assistStage:'park',assistSince:1,assistTimeoutMs:480000,airborne:false,altitude:0,throttleCommand:.65,speed:11.7,airspeed:11.7});
 const stopped=aircraftAssistedInput(f.craft,{},f.environment,600002);assert.equal(stopped.throttle,0);assert.equal(stopped.brake,true);assert.equal(f.craft.flight.throttleCommand,0);assert.equal(f.craft.flight.assist,null);
 Object.assign(f.craft,{position:{...f.craft.position,y:30},flight:{assist:'land',assistSince:1,assistTimeoutMs:480000,airborne:true,altitude:29.6,throttleCommand:.4,speed:15,airspeed:15}});
 const airborne=aircraftAssistedInput(f.craft,{},f.environment,600002);assert.equal(airborne.throttle,.65);assert.equal(airborne.lift,0);assert.equal(f.craft.flight.assist,null);
});

test('real Strait collision and room physics stop a timed-out arrival at the cargo apron without manufacturing flight proof',async()=>{
 const f=fixture({destinationPortId:'khasab'});await f.load();f.now+=700000;Object.assign(f.environment,shippingWorld());
 const job=f.player.airFreight,apron=f.task.route.destination.cargoApron;Object.assign(job,{environmentRevision:String(f.environment.contentUpdatedAt),phase:'approach',departedAt:f.now-5000,approachAt:f.now-1000});
 Object.assign(f.craft,{spawned:true,position:{x:apron.x,y:.4,z:apron.z},rotation:{x:0,y:Math.PI,z:0},flight:{assist:'land',assistStage:'park',assistSince:f.now-600001,assistTimeoutMs:480000,assistParkingPoint:{x:apron.x,z:apron.z},runwayId:f.task.route.destination.runwayId,airborne:false,altitude:0,speed:11.7,airspeed:11.7,throttle:.65,throttleCommand:.65,flaps:1,gear:true}});f.player.position={...f.craft.position};f.player.radToxReady=true;f.player.radToxEnabled=false;
 const rooms=new AuthoritativeRooms({store:{},now:()=>f.now}),room={objects:{},revision:0,simulation:{...f.sim,time:f.now,sequence:0,events:[]}};rooms.initialize(room,f.environment);
 for(let tick=0;tick<64;tick++){f.now+=250;room.simulation.players.pilot.lastSeen=f.now;rooms.step(room,f.environment);}
 const snapshot=rooms.view(room),craft=snapshot.actors[f.craft.id];assert.equal(craft.flight.assist,null);assert.equal(craft.flight.throttleCommand,0);assert.equal(craft.flight.airborne,false);assert.ok(craft.flight.speed<.8);assert.ok(Math.abs(craft.position.z-apron.z)<75);assert.ok(Math.abs(craft.position.x-apron.x)<12);assert.equal(job.phase,'landed');assert.equal(f.deliveries,0);
 // A stopped timeout is not a departure/approach receipt. Removing the prior
 // server flight checkpoints still prevents an unload from this same pose.
 const proof={phase:job.phase,departedAt:job.departedAt,approachAt:job.approachAt,landedAt:job.landedAt};job.phase='secured';delete job.departedAt;delete job.approachAt;delete job.landedAt;await assert.rejects(f.command('unload'),/Fly the departure/);assert.equal(f.deliveries,0);Object.assign(job,proof);
 await f.command('unload');f.tick(AIR_FREIGHT_RULES.unloadMs);await f.command('unload');assert.equal(f.deliveries,1);assert.equal(f.task.phase,'air-delivered');assert.deepEqual(f.ledger.maps['plot-recipient'].stock,{});
});
