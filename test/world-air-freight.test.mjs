import test from 'node:test';
import assert from 'node:assert/strict';
import {STRAIT_FREIGHT_CONNECTIONS} from '../public/js/strait-freight-network.js';
import {AIR_FREIGHT_RULES,ensureAirFreight,prepareAirTransfers,advanceAirTransfers,reserveAirTransfer,releaseAirTransfer,holdAirTransfers,settleAirTransfer,projectAirTransfers,previewAirPlan} from '../world-air-freight.mjs';
import {worldSupplyAirCommand,stepWorldAirFreight,validateAirReservation,playerAirFreightView} from '../server-world-air-freight.mjs';
import {startAircraftAssist,aircraftAssistedInput} from '../server-aircraft-access.mjs';
import {stepAircraftFlight} from '../public/js/aircraft-flight.js';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {compactRoomSnapshot,hydrateRoomSnapshot} from '../public/js/room-snapshot.js';

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
