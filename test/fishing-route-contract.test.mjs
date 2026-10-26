import test from 'node:test';
import assert from 'node:assert/strict';
import {neonMarina} from '../neon-marina.mjs';
import {fishingZones,isFishingBoat} from '../public/js/fishing-config.js';
import {harborDestinations} from '../public/js/harbor-destinations.js';
import {harborApproach,planBoatNavigation} from '../public/js/boat-navigation.js';
import {harborWaterAt,watercraftFootprint} from '../public/js/harbor-water.js';
import {fishingMapAction} from '../public/js/fishing-map-actions.js';
import {fishingArrivalAction} from '../public/js/fishing-ui.js';
import {fishingCommand,playerFishingView} from '../server-fishing.mjs';

const marina=neonMarina();
const environment={id:'fishing-route-contract',builderScene:{objects:marina.objects,layoutMeta:{harbor:marina.harbor,locations:marina.locations}}};

test('fishing route choices keep the selected destination identity and stop inside its actual water',()=>{
 let planned=0;
 for(const boat of marina.objects.filter(isFishingBoat)){
  for(const destination of harborDestinations(environment,boat).filter(destination=>fishingZones(environment).some(zone=>zone.id===destination.id))){
   const approach=harborApproach(environment,destination.id,boat);
   assert.equal(approach?.id,destination.id,'approach preserves the chosen map destination');
   assert.ok(harborWaterAt(environment,approach,.25),destination.name+' resolves to real water');
   const route=planBoatNavigation(boat,environment,{destinationId:destination.id});
   assert.ok(route,destination.name+' can be planned from its connected fishing launch');
   assert.equal(route.destinationId,destination.id,'the selected fishing area cannot become open-water or a neighboring dock');
   const end=route.points.at(-1),zone=fishingZones(environment).find(zone=>zone.id===destination.id);
   assert.ok(Math.hypot(end.x-zone.x,end.z-zone.z)<zone.radius,'the terminal point belongs to the selected zone');
   assert.ok(watercraftFootprint(end,end.heading??boat.rotation.y,boat).every(point=>harborWaterAt(environment,point,.25)),'the entire stopped hull fits in the selected water');
   planned++;
  }
 }
 assert.equal(planned,5,'the sea launch has three saltwater choices and the two lake launches each have their local freshwater choice');
});

test('a matching freshwater x coordinate cannot route a lake boat into a disconnected lake',()=>{
 const lake={id:'local-lake',name:'Local lake',x:300,z:300,width:80,depth:80};
 const zones=[{id:'local-fishing',name:'Local fishing',water:'fresh',x:300,z:300,radius:20},{id:'other-lake-fishing',name:'Other lake fishing',water:'fresh',x:300,z:-300,radius:20},{id:'coastal-fishing',name:'Coastal fishing',water:'salt',x:450,z:300,radius:20}];
 const world={builderScene:{objects:[],layoutMeta:{harbor:{extent:768,lakes:[lake,{...lake,id:'other-lake',z:-300}],islands:[{x:300,z:300,width:140,depth:140},{x:300,z:-300,width:140,depth:140}],fishingZones:zones}}}};
 const lakeBoat={id:'local-boat',modelId:'harbor-fishing-boat',position:{x:300,y:0,z:300},rotation:{y:0}};
 assert.equal(harborApproach(world,'local-fishing',lakeBoat)?.id,'local-fishing');
 assert.equal(harborApproach(world,'other-lake-fishing',lakeBoat),null,'a different lake is not connected just because x matches');
 assert.equal(harborApproach(world,'coastal-fishing',lakeBoat),null,'an inland boat cannot sail across dry island ground');
 assert.deepEqual(harborDestinations(world,lakeBoat).filter(destination=>destination.water).map(destination=>destination.id),['local-fishing']);
 const seaBoat={...lakeBoat,position:{x:450,y:0,z:300}};
 assert.equal(harborApproach(world,'local-fishing',seaBoat),null,'ocean boats cannot route directly into island lakes');
 assert.equal(planBoatNavigation(lakeBoat,world,{destinationId:'other-lake-fishing'}),null,'unreachable freshwater requests fail instead of silently routing somewhere else');
});

test('unknown fishing destination requests cannot fall back to an unrelated location',()=>{
 const boat=marina.objects.find(isFishingBoat);
 assert.equal(harborApproach(environment,'missing-fishing-ground',boat),null);
 assert.equal(planBoatNavigation(boat,environment,{destinationId:'missing-fishing-ground'}),null);
});

test('each fishing map action boards a boat in the selected water and keeps sail and fish-here choices separate',()=>{
 const boats=marina.objects.filter(isFishingBoat),actors=Object.fromEntries(boats.map(boat=>[boat.id,structuredClone(boat)])),selfId='account:map-review';
 const live={actors,players:{[selfId]:{health:100,position:{x:124,y:0,z:-35},fishing:{availability:{sides:{starboard:{canCast:true,zoneId:'marina-fishing'}}}}}}};
 for(const zone of fishingZones(environment)){
  const action=fishingMapAction(environment,live,selfId,zone.id);
  assert.equal(action.zoneId,zone.id);
  assert.equal(action.kind,'board-route');assert.equal(action.enabled,true);
  assert.ok(harborDestinations(environment,actors[action.entityId]).some(destination=>destination.id===zone.id),'the chosen boat really belongs to the selected water');
  assert.equal(action.fishHere?.side,zone.id==='marina-fishing'?'starboard':undefined,'being near another fishing area cannot replace the selected route');
 }
 const sea=boats.find(boat=>harborDestinations(environment,boat).some(destination=>destination.id==='beacon-reef'));
 live.players[selfId].vehicleId=sea.id;actors[sea.id].holderId=selfId;
 const here=fishingMapAction(environment,live,selfId,'marina-fishing');
 assert.equal(here.kind,'route');assert.equal(here.entityId,sea.id);assert.equal(here.fishHere.side,'starboard');
 const far=fishingMapAction(environment,live,selfId,'beacon-reef');
 assert.equal(far.kind,'route');assert.equal(far.zoneId,'beacon-reef');assert.equal(far.fishHere,null,'a nearby broad fishing radius must not hijack a different selection');
 for(const boat of Object.values(actors))boat.holderId='account:other-angler';
 delete live.players[selfId].vehicleId;
 const occupied=fishingMapAction(environment,live,selfId,'crescent-lake-fishing');
 assert.equal(occupied.enabled,false);assert.equal(occupied.entityId,undefined,'do not substitute an ocean boat when the lake boat is occupied');
 assert.equal(fishingMapAction(environment,live,selfId,'missing-fishing-ground'),null);
});

function arrivedSnapshot(){
 const selfId='account:arrival-review',zoneId='beacon-reef',routeId='review-route-1',boatId='review-angler';
 return {selfId,serverTime:100000,fishing:{enabled:true,zones:fishingZones(environment)},players:{[selfId]:{health:100,vehicleId:boatId,fishing:{session:null,availability:{sides:{port:{canCast:true,zoneId},starboard:{canCast:false,zoneId}}}}}},actors:{[boatId]:{id:boatId,modelId:'harbor-fishing-boat',active:true,holderId:selfId,boating:{navigationType:'fishing',navigationDestinationId:zoneId,navigationZoneId:zoneId,navigationRouteId:routeId,assist:null,assistStage:'arrived',anchor:true,speed:0,arrival:{id:routeId,destinationId:zoneId,kind:'fishing',at:99950}}}}};
}

test('direct fishing arrival requires the exact completed route and opens at most once per route',()=>{
 const snapshot=arrivedSnapshot(),selfId=snapshot.selfId,seen=new Set();
 const action=fishingArrivalAction(snapshot,selfId,seen);
 assert.deepEqual(action,{id:'review-route-1',zoneId:'beacon-reef',side:'port',name:'Beacon Reef Fishing'});
 seen.add(action.id);assert.equal(fishingArrivalAction(snapshot,selfId,seen),null,'heartbeat replay cannot reopen a closed fishing screen');
 const navigation=snapshot.actors['review-angler'].boating;navigation.navigationRouteId='review-route-2';navigation.arrival.id='review-route-2';
 assert.equal(fishingArrivalAction(snapshot,selfId,seen)?.id,'review-route-2','an explicit second trip to the same fishing area remains usable');
});

test('manual sailing, replaced routes, wrong zones and invalid room state never open fishing',()=>{
 const mutations=[
  snapshot=>{snapshot.actors['review-angler'].boating.arrival.destinationId='marina-fishing';},
  snapshot=>{snapshot.actors['review-angler'].boating.navigationRouteId='another-route';},
  snapshot=>{snapshot.actors['review-angler'].boating.navigationZoneId='palm-shoals';},
  snapshot=>{snapshot.actors['review-angler'].boating.assist='navigate';},
  snapshot=>{snapshot.actors['review-angler'].boating.assistStage='passage';},
  snapshot=>{snapshot.actors['review-angler'].boating.anchor=false;},
  snapshot=>{snapshot.actors['review-angler'].boating.speed=.5;},
  snapshot=>{snapshot.actors['review-angler'].boating.speed=NaN;},
  snapshot=>{snapshot.actors['review-angler'].boating.arrival.at=snapshot.serverTime-15001;},
  snapshot=>{snapshot.actors['review-angler'].boating.arrival.at=snapshot.serverTime+1;},
  snapshot=>{snapshot.actors['review-angler'].holderId='account:someone-else';},
  snapshot=>{snapshot.actors['review-angler'].active=false;},
  snapshot=>{snapshot.players[snapshot.selfId].health=0;},
  snapshot=>{snapshot.players[snapshot.selfId].fishing.availability.sides.port.zoneId='marina-fishing';},
  snapshot=>{snapshot.players[snapshot.selfId].fishing.session={id:'another-cast',status:'reeling'};},
  snapshot=>{snapshot.fishing=null;},
  snapshot=>{snapshot.fishing.enabled=false;}
 ];
 for(const mutate of mutations){const snapshot=arrivedSnapshot();mutate(snapshot);assert.equal(fishingArrivalAction(snapshot,snapshot.selfId),null,mutate.toString());}
});

test('overlapping fishing grounds keep the explicitly selected zone through arrival and casting',()=>{
 const zones=[{id:'first-zone',name:'First zone',water:'salt',x:180,z:-160,radius:40},{id:'selected-zone',name:'Selected zone',water:'salt',x:185,z:-160,radius:40}],world={id:'overlap-review',builderScene:{objects:[],layoutMeta:{harbor:{extent:768,islands:[],lakes:[],fishingZones:zones}}}};
 const boat={id:'overlap-boat',modelId:'harbor-fishing-boat',active:true,holderId:'account:overlap',position:{x:185,y:0,z:-160},rotation:{y:0},boating:{anchor:true,speed:0,navigationZoneId:'selected-zone'}};
 const player={actorId:'account:overlap',username:'Overlap angler',health:100,grounded:true,position:{...boat.position,y:.35},vehicleId:boat.id,lastSeen:100000},sim={actors:{[boat.id]:boat},players:{[player.actorId]:player}};
 const availability=playerFishingView(sim,player,world).availability;
 assert.equal(availability.zoneId,'selected-zone','arrival availability does not choose the first overlapping radius');
 fishingCommand(sim,player,world,{operation:'cast',side:'port',zoneId:'selected-zone'},100000,{integer:(minimum,maximum)=>maximum===undefined?0:minimum});
 assert.equal(player.fishing.session.zoneId,'selected-zone','the real server cast retains the selected route identity');
 fishingCommand(sim,player,world,{operation:'cancel',sessionId:player.fishing.session.id},100100);
 assert.throws(()=>fishingCommand(sim,player,world,{operation:'cast',zoneId:'missing-zone'},100200),/Choose the other side|selected|area/,'an unavailable requested zone cannot silently become an overlapping zone');
});
