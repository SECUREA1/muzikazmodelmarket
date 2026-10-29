import test from 'node:test';
import assert from 'node:assert/strict';
import {planDeedDelivery,deliveryMapRevision,shortestDeliveryRoadPath,DEED_DELIVERY_RULES} from '../world-delivery-routing.mjs';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';

const deed={id:'deed-routing-home',ownerId:'account:owner',status:'active'};
const world=(extra={})=>({id:'plot-'+deed.id,proceduralLand:true,spawn:{x:0,y:0,z:0},builderScene:{layout:'grand-floor',mapSize:80,objects:[]},delivery:{hub:{position:{x:0,y:0,z:16}},dropoff:{position:{x:0,y:0,z:0},kind:'doorstep'}},...extra});
const clear={groundAt:(_environment,p)=>({...p,y:0}),hasBodyClearance:()=>true};
const plan=(environment=world(),extra={})=>planDeedDelivery({deed,environment,collision:clear,now:100000,...extra});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} differs from ${b}`);

test('road distance weighting prefers the shorter travelled route and excludes an obstructed link',()=>{
 const network={nodes:[{x:0,y:0,z:0,links:[1,2]},{x:100,y:0,z:0,links:[0,4]},{x:1,y:0,z:1,links:[0,3]},{x:2,y:0,z:1,links:[2,4]},{x:3,y:0,z:0,links:[1,3]}]};
 const route=shortestDeliveryRoadPath(network,0,4);assert.deepEqual(route.map(p=>[p.x,p.z]),[[0,0],[1,1],[2,1],[3,0]]);
 const blocked=shortestDeliveryRoadPath(network,0,4,(a,b)=>!([a.x,b.x].includes(2)));assert.deepEqual(blocked.map(p=>p.x),[0,100,3]);
 assert.equal(shortestDeliveryRoadPath(network,0,4,()=>false),null);
});

test('truck route stops outside the door and courier handover includes measured distance and dwell',()=>{
 const route=plan();assert.equal(route.status,'ready');assert.equal(route.dropoff.kind,'doorstep');assert.equal(route.hub.vehicleAccess,true);
 assert.ok(route.truckWaypoints.length>=2);assert.ok(route.courierWaypoints.length>=2);assert.ok(Math.hypot(route.truckWaypoints.at(-1).x,route.truckWaypoints.at(-1).z)>=4);
 assert.deepEqual(route.courierWaypoints.at(-1),route.dropoff.position);close(route.distanceMeters,route.truckDistanceMeters+route.courierDistanceMeters);
 assert.ok(route.estimatedDurationMs>=DEED_DELIVERY_RULES.loadMs+DEED_DELIVERY_RULES.unloadMs+DEED_DELIVERY_RULES.handoverMs);assert.ok(route.legs.every(leg=>leg.mapId===route.mapId));
});

test('actual rotated building entrances take priority over a deed fallback and never assume a door at the building centre',()=>{
 const environment=world({delivery:{hub:{position:{x:25,y:0,z:0}},entrance:{position:{x:-20,y:0,z:-20}}},builderScene:{layout:'grand-floor',mapSize:80,objects:[{id:'home',modelId:'general-store',position:{x:2,y:0,z:3},rotation:{y:Math.PI/2},scale:{x:1,y:1,z:1}}]}});
 const route=plan(environment);assert.equal(route.status,'ready');assert.equal(route.dropoff.kind,'doorstep');assert.match(route.dropoff.id,/home/);assert.ok(Math.abs(route.dropoff.position.x-2)>4);assert.ok(Math.abs(route.dropoff.position.z-3)<.01);
});

test('deeded land coordinates are never reused as local plot truck coordinates',()=>{
 const lotDeed={...deed,lot:{mapId:'land-field-neon-docks',position:{x:150,y:0,z:105},entry:{x:150,y:0,z:150},size:64}},environment=world({delivery:undefined,builderScene:{layout:'grand-floor',mapSize:64,objects:[]}});
 const route=plan(environment,{deed:lotDeed});assert.equal(route.status,'ready');assert.equal(route.dropoff.kind,'plot-entrance');assert.equal(route.dropoff.position.x,0);assert.equal(route.dropoff.position.z,28);
 assert.equal(route.regionalHandoff.mapId,lotDeed.lot.mapId);assert.equal(route.regionalHandoff.position.x,150);assert.ok([...route.truckWaypoints,...route.courierWaypoints].every(p=>Math.abs(p.x)<=32&&Math.abs(p.z)<=32));
});

test('current saved obstacles and authored street edits change revisions while moving traffic does not',()=>{
 const environment=world(),room={objects:{},simulation:{actors:{car:{id:'car',spawned:true,trafficAI:true,position:{x:5,y:0,z:5}}}}},initial=deliveryMapRevision({deed,environment,room});
 room.simulation.actors.car.position.x=25;room.simulation.actors.car.lastSeen=100;assert.equal(deliveryMapRevision({deed,environment,room}),initial);
 room.objects.wall={id:'wall',materialId:'brick',position:[0,0,6],scale:[1,1,1],rotation:[0,0,0]};assert.notEqual(deliveryMapRevision({deed,environment,room}),initial);
 const built=deliveryMapRevision({deed,environment,room});room.objects.wall.open=true;assert.notEqual(deliveryMapRevision({deed,environment,room}),built);
 const opened=deliveryMapRevision({deed,environment,room});environment.streets=[{id:'new-road',from:{x:0,z:16},to:{x:0,z:0},width:8}];assert.notEqual(deliveryMapRevision({deed,environment,room}),opened);
});

test('a bounded road detour around current walls is geometrically validated and can reopen after an edit',()=>{
 const environment=world(),room={objects:{wall:{id:'wall',position:[0,0,6],blocked:true}}};
 const collision={groundAt:(_env,p)=>({...p,y:0}),hasBodyClearance:(_env,p,r,{objects})=>!objects.wall?.blocked||!(Math.abs(p.z-6)<.7+r&&Math.abs(p.x)<4+r)};
 const detour=plan(environment,{room,collision});assert.equal(detour.status,'ready',detour.reason);assert.ok([...detour.truckWaypoints,...detour.courierWaypoints].some(p=>Math.abs(p.x)>4));
 room.objects.wall.blocked=false;const reopened=plan(environment,{room,collision});assert.equal(reopened.status,'ready');assert.notEqual(reopened.revision,detour.revision);assert.ok(reopened.distanceMeters<detour.distanceMeters);
});

test('water, absent ground and an inaccessible upper-floor door block delivery without inventing a road',()=>{
 const environment=world({builderScene:{layout:'grand-floor',mapSize:40,objects:[]}}),water={groundAt:(_env,p)=>Math.abs(p.z-7)<2?null:{...p,y:0},hasBodyClearance:()=>true};
 const separated=plan(environment,{collision:water});assert.equal(separated.status,'blocked');assert.equal(separated.estimatedDurationMs,0);assert.deepEqual(separated.truckWaypoints,[]);
 assert.equal(plan(environment,{collision:{...clear,groundAt:()=>null}}).status,'blocked');
 const elevated=world({delivery:{hub:{position:{x:0,y:0,z:16}},dropoff:{position:{x:0,y:10,z:0}}}});assert.equal(plan(elevated).status,'blocked');
});

test('interior freight gateway explicitly uses courier access when the room cannot fit a truck',()=>{
 const environment=world({spawn:{x:0,y:0,z:6},builderScene:{layout:'grand-floor',mapSize:20,objects:[]},delivery:{hub:{position:{x:0,y:0,z:6}},dropoff:{position:{x:0,y:0,z:0}}}}),collision={groundAt:(_env,p)=>Math.abs(p.x)<.7&&p.z>=-1&&p.z<=8?{...p,y:0}:null,hasBodyClearance:()=>true};
 const route=plan(environment,{collision});assert.equal(route.status,'ready',route.reason);assert.equal(route.accessMode,'courier-access');assert.equal(route.hub.vehicleAccess,false);assert.deepEqual(route.truckWaypoints,[]);assert.equal(route.legs[0].mode,'inter-map-distribution');assert.ok(route.courierDistanceMeters>=6);
});

test('map edits replan from the projected vehicle or courier position without returning to the depot',()=>{
 const environment=world(),initial=plan(environment),origin={x:0,y:0,z:10},reroute=plan(environment,{origin});assert.equal(reroute.status,'ready');assert.equal(reroute.revision,initial.revision);assert.deepEqual(reroute.truckWaypoints[0],origin);assert.equal(reroute.hub.position.z,16);
 const courier=plan(environment,{origin:{x:0,y:0,z:2},mode:'courier'});assert.equal(courier.status,'ready');assert.deepEqual(courier.truckWaypoints,[]);assert.equal(courier.courierWaypoints[0].z,2);assert.equal(courier.courierWaypoints.at(-1).z,0);
});

test('real procedural floor and a persisted full-width solid produce a clear route or an honest hold',()=>{
 const environment=world(),collision=new ServerBuilderCollision();
 const initial=plan(environment,{collision});assert.equal(initial.status,'ready',initial.reason);
 const room={objects:{wall:{id:'wall',materialId:'brick',position:[0,1.5,7],rotation:[0,0,0],scale:[70,10,3]}}};
 const blocked=plan(environment,{room,collision});assert.equal(blocked.status,'blocked');assert.notEqual(blocked.revision,initial.revision);
 room.objects.wall.deleted=true;const reopened=plan(environment,{room,collision});assert.equal(reopened.status,'ready',reopened.reason);
});

test('unconfigured floating entrances find actual clear floor while configured blocked doors stay fixed',()=>{
 const environment=world({spawn:{x:0,y:1,z:0},delivery:{entrance:{position:{x:0,y:1,z:0}}},builderScene:{mapSize:20,objects:[]}}),collision={groundAt:(_env,p,options)=>Math.abs(p.x)<.8?null:{...p,y:options?.entry?8:8},hasBodyClearance:()=>true};
 const route=plan(environment,{collision});assert.equal(route.status,'ready',route.reason);assert.equal(route.dropoff.kind,'plot-entrance');assert.equal(route.dropoff.position.y,8);assert.ok(Math.abs(route.dropoff.position.x)>=.8);
 const configured=plan({...environment,delivery:{dropoff:{position:{x:0,y:1,z:0},kind:'doorstep'}}},{collision});assert.equal(configured.status,'blocked');assert.equal(configured.dropoff.position.x,0);
});

test('large shipping-map coordinates remain local and inside their actual 2800m authored extent',()=>{
 const environment=world({spawn:{x:-1030,y:0,z:382},builderScene:{mapSize:2800,objects:[]},delivery:{hub:{position:{x:-1030,y:0,z:398}},dropoff:{position:{x:-1030,y:0,z:382}}}});
 const route=plan(environment);assert.equal(route.status,'ready',route.reason);assert.equal(route.dropoff.position.x,-1030);assert.equal(route.hub.position.x,-1030);assert.ok(route.truckWaypoints.every(p=>Math.abs(p.x)<=1400));
});

test('complete-content route caching avoids repeated geometry work without sharing mutable snapshots',()=>{
 let queries=0;const collision={groundAt:(_env,p)=>{queries++;return {...p,y:0};},hasBodyClearance:()=>true},environment=world(),first=plan(environment,{collision});assert.equal(first.status,'ready');assert.ok(queries>0);const after=queries;
 first.dropoff.position.x=1000;first.truckWaypoints[0].z=1000;
 const second=plan(environment,{collision,now:200000});assert.equal(queries,after);assert.equal(second.dropoff.position.x,0);assert.equal(second.truckWaypoints[0].z,16);assert.equal(second.calculatedAt,200000);
 const edited=plan(environment,{collision,room:{objects:{newWall:{id:'newWall',position:[30,0,0]}}}});assert.notEqual(edited.revision,second.revision);assert.ok(queries>after);
});

test('planning quota failures are retryable and never poison the same-content route cache',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'performance');let clock=0,slow=true,queries=0;
 Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>clock}});
 try{
  const collision={groundAt:(_env,p)=>{queries++;if(slow)clock+=120;return {...p,y:0};},hasBodyClearance:()=>true},environment=world();
  const held=plan(environment,{collision});assert.equal(held.status,'blocked');assert.equal(held.retryable,true);assert.match(held.reason,/work limit/);
  const count=queries;slow=false;clock=0;const ready=plan(environment,{collision});assert.equal(ready.status,'ready',ready.reason);assert.equal(ready.revision,held.revision);assert.ok(queries>count,'retry must actually recalculate geometry');
 }finally{Object.defineProperty(globalThis,'performance',descriptor);}
});

test('a verified courier gateway survives a later truck-search quota without relocating an in-transit truck',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'performance');let clock=0;
 Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>clock}});
 try{
  const collision={groundAt:(_env,p)=>{clock+=120;return {...p,y:0};},hasBodyClearance:()=>true},environment=world({delivery:{entrance:{position:{x:0,y:0,z:0}}}});
  const fallback=plan(environment,{collision});assert.equal(fallback.status,'ready');assert.equal(fallback.accessMode,'courier-access');assert.deepEqual(fallback.truckWaypoints,[]);
  clock=0;const inTransit=plan(environment,{collision,origin:{x:0,y:0,z:16}});assert.equal(inTransit.status,'blocked');assert.equal(inTransit.retryable,true);assert.notEqual(inTransit.accessMode,'courier-access');
 }finally{Object.defineProperty(globalThis,'performance',descriptor);}
});

test('temporarily unavailable geometry can load on retry without editing map contents',()=>{
 let unavailable=true;const collision={...clear,world:()=>{if(unavailable)throw Error('Model not loaded yet');}},environment=world();
 const held=plan(environment,{collision});assert.equal(held.status,'blocked');assert.equal(held.retryable,true);
 unavailable=false;const ready=plan(environment,{collision});assert.equal(ready.status,'ready',ready.reason);assert.equal(ready.revision,held.revision);
});

test('a native town keeps its truck planning budget when its unrelated spawn-to-door walk needs a detour',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'performance');let clock=0;
 Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>clock}});
 try{
  const environment=world({spawn:{x:20,y:0,z:0},delivery:{entrance:{position:{x:0,y:0,z:0}}}}),collision={groundAt:(_env,p)=>{clock+=.6;return {...p,y:0};},hasBodyClearance:(_env,p,r)=>!(Math.abs(p.x-10)<1+r&&Math.abs(p.z)<7+r)};
  const route=plan(environment,{collision});assert.equal(route.status,'ready',route.reason);assert.equal(route.accessMode,'truck-and-courier');assert.equal(route.hub.position.z,16);assert.ok(clock<DEED_DELIVERY_RULES.maxComputeMs);
 }finally{Object.defineProperty(globalThis,'performance',descriptor);}
});
