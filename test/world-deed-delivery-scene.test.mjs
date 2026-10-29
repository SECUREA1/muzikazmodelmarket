import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createWorldDeedDeliveryScene,deedDeliveryPathPose,deedDeliveryVehiclePose} from '../public/js/world-deed-delivery-scene.js';

const road=[{x:0,y:0,z:0},{x:90,y:0,z:0},{x:90,y:0,z:10}];
const truck={id:'truck-a',phase:'driving',mapId:'plot-a',position:{x:0,y:0,z:0},rotationY:0,stageStartedAt:10000,stageDurationMs:20000,stageProgress:0,waypoints:road};
const projection=(extra={})=>({serverTime:10000,mapId:'plot-a',dropoffs:[{id:'door-a',deedId:'deed-a',kind:'door',mapId:'plot-a',position:road.at(-1)}],routes:[{id:'route-a',mapId:'plot-a',revision:'revision-a',status:'ready',truckWaypoints:road,courierWaypoints:[road.at(-1),{x:90,y:0,z:12}]}],vehicles:[truck],couriers:[],...extra});
const wait=()=>new Promise(resolve=>setImmediate(resolve));
function setup(options={}){
 const scene=new THREE.Scene();let time=0;const calls=[];
 const inventory={api:async(path,request)=>{calls.push({path,request});return projection();}};
 const createModel=()=>new THREE.Mesh(new THREE.BoxGeometry(2,1,4),new THREE.MeshStandardMaterial({color:0xffcc88}));
 const manager=createWorldDeedDeliveryScene({scene,inventory,createModel,createCanvas:()=>null,clock:()=>time,autoPoll:false,...options});
 return {scene,manager,calls,set time(value){time=value;},get time(){return time;}};
}

test('delivery path interpolation follows physical distance through bends and never accepts invalid coordinates',()=>{
 assert.deepEqual(deedDeliveryPathPose(road,.5).position,{x:50,y:0,z:0});
 assert.deepEqual(deedDeliveryPathPose(road,.95).position,{x:90,y:0,z:5});
 assert.deepEqual(deedDeliveryPathPose(road,2).position,road.at(-1));
 assert.equal(deedDeliveryPathPose([{x:NaN,z:1}]),null);assert.equal(deedDeliveryPathPose(null),null);
 assert.deepEqual(deedDeliveryPathPose([{x:3,z:4}],.5).position,{x:3,y:0,z:4});
});

test('only a confirmed moving stage can animate and a dropped connection cannot visually finish the delivery',()=>{
 assert.deepEqual(deedDeliveryVehiclePose(truck,10000,3000).position,{x:15,y:0,z:0});
 assert.deepEqual(deedDeliveryVehiclePose(truck,10000,60000).position,{x:30,y:0,z:0},'extrapolation freezes after six seconds');
 for(const phase of ['blocked','loading','unloading','delivered','cancelled','port-held','courier','dropoff'])assert.deepEqual(deedDeliveryVehiclePose({...truck,phase,isCourier:false},10000,3000).position,truck.position);
 const courier={...truck,isCourier:true,phase:'courier',waypoints:[{x:90,y:0,z:10},{x:90,y:0,z:12}],stageDurationMs:1000};
 assert.ok(deedDeliveryVehiclePose(courier,10000,50000).position.z<12,'only a server projection confirms the final doorstep pose');
 assert.deepEqual(deedDeliveryVehiclePose({...truck,waypoints:null},10000,3000).position,truck.position,'missing route keeps the confirmed server pose');
});

test('actual projection creates pads, distinct truck/courier paths and fleet visuals without an inventory write',async()=>{
 const f=setup();f.manager.update({id:'plot-a'});await f.manager.refresh();await wait();
 assert.equal(f.calls.length,1);assert.match(f.calls[0].path,/deliveries\?mapId=plot-a$/);assert.equal(f.calls[0].request.method,undefined);
 assert.equal(f.manager.snapshot().dropoffs,1);assert.equal(f.manager.snapshot().routes,1);assert.equal(f.manager.snapshot().vehicles.length,1);assert.equal(f.manager.snapshot().vehicles[0].loaded,true);
 assert.ok(f.scene.getObjectByName('DEED_TRUCK_PATH'));assert.ok(f.scene.getObjectByName('DEED_COURIER_PATH'));assert.ok(f.scene.getObjectByName('PROJECTED_DELIVERY_TRUCK'));
 assert.equal(f.scene.getObjectByName('CONFIRMED_DOORSTEP_PARCEL').visible,false);
 f.time=3000;f.manager.tick();assert.equal(f.manager.snapshot().vehicles[0].position.x,15);
 const courier={id:'courier-a',phase:'courier',position:{x:90,y:0,z:10},waypoints:[{x:90,y:0,z:10},{x:90,y:0,z:12}],stageStartedAt:13000,stageDurationMs:5000,stageProgress:0};
 f.manager.receive(projection({serverTime:13000,vehicles:[{...truck,phase:'courier',position:road.at(-1)}],couriers:[courier]}));await wait();
 assert.deepEqual(f.manager.snapshot().vehicles.find(row=>!row.isCourier).position,road.at(-1),'truck remains parked at the curb during the foot stage');
 assert.equal(f.manager.snapshot().vehicles.filter(row=>row.isCourier).length,1);assert.ok(f.scene.getObjectByName('PROJECTED_DELIVERY_COURIER'));
 assert.equal(f.scene.getObjectByName('PROJECTED_FREIGHT_PARCEL').visible,false,'truck crate leaves the vehicle during courier handoff');
 f.manager.receive(projection({serverTime:14000,vehicles:[],couriers:[],dropoffs:[{...projection().dropoffs[0],deliveredAt:14000}]}));
 assert.equal(f.scene.getObjectByName('CONFIRMED_DOORSTEP_PARCEL').visible,true);assert.equal(f.manager.snapshot().vehicles.length,0);assert.equal(f.calls.length,1);
 f.manager.dispose();assert.equal(f.scene.children.length,0);f.manager.dispose();
});

test('route revisions dispose old geometry, retain current markers, and late map responses cannot resurrect a departed world',async()=>{
 let resolveA;const inventory={api:async url=>url.includes('plot-a')?await new Promise(resolve=>resolveA=resolve):projection({mapId:'plot-b',dropoffs:[],routes:[],vehicles:[]})};
 const f=setup({inventory});f.manager.update({id:'plot-a'});const old=f.manager.refresh();f.manager.update({id:'plot-b'});await f.manager.refresh();
 resolveA(projection());await old;assert.equal(f.manager.snapshot().mapId,'plot-b');assert.equal(f.manager.snapshot().vehicles.length,0);
 f.manager.update({id:'plot-a'});f.manager.receive(projection());let disposals=0;const geometry=f.scene.getObjectByName('DEED_TRUCK_PATH').geometry;geometry.addEventListener('dispose',()=>disposals++);
 f.manager.receive(projection({serverTime:11000,routes:[{...projection().routes[0],revision:'revision-b',truckWaypoints:[road[0],road.at(-1)]}]}));assert.equal(disposals,1);
 assert.equal(f.manager.receive(projection({serverTime:9000})),false,'an older response cannot replace a reroute');
 f.manager.reset();assert.equal(f.manager.snapshot().visible,false);assert.equal(f.manager.snapshot().mapId,null);assert.equal(f.manager.receive(projection()),false);f.manager.dispose();
});

test('optional unavailable and malformed delivery data leave gameplay scenery usable and clean up owned resources',async()=>{
 const f=setup({inventory:{api:async()=>{throw Error('Old server does not provide delivery projections.');}}});f.manager.update({id:'plot-a'});await f.manager.refresh();
 assert.equal(f.manager.snapshot().visible,false);assert.match(f.manager.snapshot().lastError,/Old server/);
 assert.equal(f.manager.receive({mapId:'plot-a',serverTime:10000,dropoffs:{bad:true},routes:null,vehicles:{bad:true}}),true);assert.equal(f.manager.snapshot().vehicles.length,0);
 f.manager.receive(projection());await wait();const truck=f.scene.getObjectByName('PROJECTED_DELIVERY_TRUCK');let released=0;truck.geometry.addEventListener('dispose',()=>released++);f.manager.dispose();assert.equal(released,1);assert.equal(f.scene.children.length,0);
});

test('normal worlds never subscribe, while entering and leaving a deed starts and aborts its map-scoped polling',async t=>{
 const calls=[];let defer=false,resolvePending;
 const inventory={api:async(url,options)=>{
  const mapId=new URL(url,'https://game.test').searchParams.get('mapId');calls.push({mapId,signal:options.signal});
  if(defer)return await new Promise(resolve=>resolvePending=resolve);
  return projection({mapId,vehicles:[],routes:[],dropoffs:[{id:'dropoff',mapId,position:{x:2,y:0,z:3}}]});
 }};
 const f=setup({inventory,autoPoll:true,pollMs:1000});
 t.after(()=>f.manager.dispose());
 assert.equal(calls.length,0,'constructing the optional scene does not touch the supply API');
 for(const id of ['public-commons','hormuz-shipping','kitchen','world-item-factory']){f.manager.update({id});await f.manager.refresh();}
 assert.equal(calls.length,0,'maps without deed delivery metadata do not issue even a manual refresh request');
 f.manager.update({id:'member-room',memberPlot:true});await f.manager.refresh();assert.equal(calls.length,1);assert.equal(calls[0].mapId,'member-room');assert.equal(f.manager.snapshot().visible,true);
 defer=true;const pending=f.manager.refresh();assert.equal(calls.length,2);
 f.manager.update({id:'public-commons'});assert.equal(calls[1].signal.aborted,true,'leaving the deed aborts the outstanding projection request');assert.equal(f.manager.snapshot().mapId,null);assert.equal(f.manager.snapshot().visible,false);
 resolvePending(projection({mapId:'member-room'}));await pending;assert.equal(f.manager.snapshot().vehicles.length,0,'a departed deed response cannot recreate its fleet');
 await new Promise(resolve=>setTimeout(resolve,1100));assert.equal(calls.length,2,'the deed polling interval is cleared after returning to an ordinary world');
 defer=false;f.manager.update({id:'authored-delivery-room',builderScene:{layoutMeta:{delivery:{enabled:true}}}});await f.manager.refresh();assert.equal(calls.length,3,'explicit authored delivery metadata also enables a projection');
 f.manager.dispose();
});
