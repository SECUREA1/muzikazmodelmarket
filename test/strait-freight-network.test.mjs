import test from 'node:test';
import assert from 'node:assert/strict';
import {shippingWorld} from '../shipping-world.mjs';
import {airportWorld} from '../airport-world.mjs';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {STRAIT_FREIGHT_CONNECTIONS,STRAIT_AIR_ROUTES,straitPortFreight,straitAirRoute,INTERNATIONAL_AIRPORT_FREIGHT} from '../public/js/strait-freight-network.js';
import {SHIPPING_PORTS,SHIPPING_VESSELS} from '../public/js/shipping-config.js';
import {harborWaterAt,watercraftFootprint} from '../public/js/harbor-water.js';
import {isAircraft} from '../public/js/aircraft-flight.js';
import {airportRunways,runwayParking} from '../public/js/airport-navigation.js';
import {WorldAtlas} from '../world-atlas.mjs';
import {synchronizeWorldDirectory} from '../world-directory.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const finite=point=>point&&['x','y','z'].every(axis=>Number.isFinite(point[axis]));
const close=(a,b,label)=>assert.ok(distance(a,b)<.01,label+': '+JSON.stringify([a,b]));

function checkTruckPose(collision,world,position,yaw,label,placed){
 for(const x of [-1.025,0,1.025])for(const z of [-2.75,0,2.75]){
  const point={x:position.x+x*Math.cos(yaw)+z*Math.sin(yaw),y:position.y,z:position.z-x*Math.sin(yaw)+z*Math.cos(yaw)};
  assert.equal(harborWaterAt(world,point),false,label+' footprint stays on shore: '+JSON.stringify(point));
  const floor=collision.groundAt(world,point,placed);
  assert.ok(floor&&floor.y>=-.05,label+' has real ground above the swim floor: '+JSON.stringify({point,floor}));
  assert.ok(Math.abs(floor.y-position.y)<.45,label+' ground is continuous');
  assert.ok(collision.hasBodyClearance(world,floor,.2,placed),label+' leaves truck body clearance: '+JSON.stringify(point));
  assert.ok(collision.hasBodyClearance(world,{...floor,y:floor.y+.7},.2,placed),label+' leaves 2.4 m truck height clearance: '+JSON.stringify(point));
 }
}
function checkTruckPath(collision,world,path,label,placed){
 assert.ok(path.length>=2,label+' records its actual route');
 assert.ok(path.every(finite),label+' has finite XYZ waypoints');
 let samples=0;
 for(let index=1;index<path.length;index++){
  const from=path[index-1],to=path[index],length=distance(from,to),yaw=Math.atan2(to.x-from.x,to.z-from.z),steps=Math.max(1,Math.ceil(length/4));
  for(let step=0;step<=steps;step++){
   const t=step/steps;
   checkTruckPose(collision,world,{x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t,z:from.z+(to.z-from.z)*t},yaw,label+' segment '+index,placed);
   samples++;
  }
  if(index<path.length-1){
   const next=path[index+1],endYaw=Math.atan2(next.x-to.x,next.z-to.z),turn=Math.atan2(Math.sin(endYaw-yaw),Math.cos(endYaw-yaw)),count=Math.max(1,Math.ceil(Math.abs(turn)/(Math.PI/12)));
   for(let step=0;step<=count;step++)checkTruckPose(collision,world,to,yaw+turn*step/count,label+' turn '+index,placed);
  }
 }
 return samples;
}

test('all Strait ports have approved stable dock and road handoffs, with air only where the island can fit a runway',()=>{
 assert.equal(STRAIT_FREIGHT_CONNECTIONS.length,SHIPPING_PORTS.length);
 assert.deepEqual(STRAIT_FREIGHT_CONNECTIONS.map(row=>row.portId).sort(),SHIPPING_PORTS.map(port=>port.id).sort());
 assert.equal(new Set(STRAIT_FREIGHT_CONNECTIONS.map(row=>row.portId)).size,6);
 for(const port of SHIPPING_PORTS){
  const connection=straitPortFreight(port.id);
  assert.ok(connection,port.id);assert.equal(connection.mapId,'hormuz-shipping');
  assert.ok(finite(connection.dock)&&finite(connection.bay),port.id+' has explicit receiving coordinates');
  close(connection.roadWaypoints[0],connection.dock,port.id+' road begins at the dock handoff');
  close(connection.roadWaypoints.at(-1),connection.bay,port.id+' road reaches the freight bay');
  if(port.id==='qeshm'){assert.ok(!connection.airfield);assert.equal(straitAirRoute(port.id),null);continue;}
  assert.ok(connection.airfield,port.id+' has a mainland airfield');
  close(connection.airRoadWaypoints[0],connection.bay,port.id+' air road begins at its port freight bay');
  const truckBay=connection.airfield.truckBay;assert.ok(finite(truckBay),port.id+' has a truck handoff beside aircraft parking');
  close(connection.airRoadWaypoints.at(-1),truckBay,port.id+' air road reaches its cargo-apron truck bay');
  assert.ok(distance(truckBay,connection.airfield.cargoApron)>=8&&distance(truckBay,connection.airfield.cargoApron)<=12,port.id+' truck handoff is beside the aircraft, within the apron');
  close(connection.airfield.cargoApron,runwayParking(connection.airfield),port.id+' cargo apron matches the real assisted-flight parking point');
  const route=straitAirRoute(port.id);assert.ok(route);assert.equal(route.fromPortId,port.id);
  assert.equal(route.toPortId,port.id==='fujairah'?'jebel-ali':'fujairah');
  assert.equal(route.origin.id,connection.airfield.id);
  assert.equal(route.destination.id,straitPortFreight(route.toPortId).airfield.id);
  assert.ok(route.waypoints.length>=2&&route.waypoints.every(finite),port.id+' has approved finite flight checkpoints');
 }
 assert.equal(STRAIT_AIR_ROUTES.length,5);
 for(const id of ['missing','__proto__','constructor','airport-forged','']){assert.equal(straitPortFreight(id),null);assert.equal(straitAirRoute(id),null);}
});

test('every authored port-to-road and road-to-air handoff has continuous truck-width land and body clearance',()=>{
 const world=shippingWorld(),collision=new ServerBuilderCollision();
 try{
  const placed={actors:Object.fromEntries(world.builderScene.objects.filter(isAircraft).map(actor=>[actor.id,actor]))};
  let samples=0;
  for(const connection of STRAIT_FREIGHT_CONNECTIONS){
   samples+=checkTruckPath(collision,world,connection.roadWaypoints,connection.portId+' dock to bay',placed);
   if(connection.airfield)samples+=checkTruckPath(collision,world,connection.airRoadWaypoints,connection.portId+' bay to air cargo apron',placed);
  }
  // Assisted arrival parks at runwayParking(), while the truck handoff stays
  // beside the wing footprint. An arriving aircraft must not block the route.
  const arrived={actors:Object.fromEntries(world.builderScene.objects.filter(isAircraft).map(actor=>{
   const connection=STRAIT_FREIGHT_CONNECTIONS.find(row=>row.airfield&&Math.abs(row.airfield.cargoApron.x-actor.position.x)<1&&Math.abs(row.airfield.z-actor.position.z)<=80),apron=connection?.airfield.cargoApron;
   assert.ok(apron,actor.id+' belongs to an approved cargo apron');
   return [actor.id,{...actor,position:{x:apron.x,y:actor.position.y,z:apron.z}}];
  }))};
  for(const connection of STRAIT_FREIGHT_CONNECTIONS.filter(row=>row.airfield))samples+=checkTruckPath(collision,world,connection.airRoadWaypoints,connection.portId+' arrived-aircraft handoff',arrived);
  assert.ok(samples>100,'the complete configured paths were sampled, not just their endpoints');
 }finally{collision.clearWorlds();}
});

test('five public aircraft and actual runways fit their coastlines without changing any working sea berth',()=>{
 const world=shippingWorld(),collision=new ServerBuilderCollision(),runways=airportRunways(world),aircraft=world.builderScene.objects.filter(isAircraft);
 try{
  assert.equal(world.airport.enabled,true);assert.equal(runways.length,5);assert.equal(aircraft.length,5);
  for(const connection of STRAIT_FREIGHT_CONNECTIONS.filter(row=>row.airfield)){
   const runway=runways.find(row=>row.id===connection.airfield.id);assert.ok(runway,connection.portId+' is available to aircraft routing');
   assert.ok(runway.length>=202&&runway.width>=16);
   for(const side of [-1,0,1])for(let z=-runway.length/2;z<=runway.length/2;z+=8){
    const point={x:runway.x+side*runway.width/2,y:.2,z:runway.z+z},floor=collision.groundAt(world,point);
    assert.equal(harborWaterAt(world,point),false,runway.id+' runway stays on land');
    assert.ok(floor&&floor.y>=-.05,runway.id+' runway has true solid ground');
   }
   const apron=connection.airfield.cargoApron,plane=aircraft.find(row=>Math.abs(row.position.x-apron.x)<=(apron.width||28)/2&&Math.abs(row.position.z-apron.z)<=(apron.depth||160)/2);assert.ok(plane,connection.portId+' has a real parked public aircraft inside its apron');
   const floor=collision.groundAt(world,{...plane.position,y:.2});assert.ok(floor&&floor.y>=-.05);
   assert.equal(harborWaterAt(world,plane.position),false);assert.ok(Math.abs(plane.position.x-runway.x)>runway.width/2,'aircraft parks clear of the runway');
   assert.ok(world.builderScene.layoutMeta.locations.some(row=>row.id===runway.id),runway.id+' is visible on the game map');
  }
  for(const port of SHIPPING_PORTS){
   for(const vessel of SHIPPING_VESSELS)assert.ok(watercraftFootprint(port.berth,port.berth.yaw,vessel).every(point=>harborWaterAt(world,point,.35)),port.id+' '+vessel.modelId+' keeps its clear sea berth');
   assert.ok(harborWaterAt(world,port.entry,.35),port.id+' retains its water approach');
  }
 }finally{collision.clearWorlds();}
});

test('International Airport cargo road reaches the real assisted-flight apron with truck clearance',()=>{
 const world=airportWorld(),cargo=INTERNATIONAL_AIRPORT_FREIGHT,collision=new ServerBuilderCollision();
 try{
  const placed={actors:Object.fromEntries(world.builderScene.objects.filter(isAircraft).map(actor=>[actor.id,actor]))};
  assert.ok(world.builderScene.objects.some(object=>object.id===cargo.bayId&&object.modelId==='freight-loading-bay'));
  close(cargo.roadWaypoints[0],cargo.bay,'airport road starts at the counted freight bay');
  assert.ok(finite(cargo.truckBay));
  close(cargo.roadWaypoints.at(-1),cargo.truckBay,'airport road reaches the truck handoff beside aircraft parking');
  close(cargo.cargoApron,runwayParking(airportRunways(world).find(runway=>runway.id==='runway')),'cargo apron uses the operational main-runway parking point');
  checkTruckPath(collision,world,cargo.roadWaypoints,'International Airport cargo road',placed);
  const arrival=world.builderScene.objects.find(actor=>isAircraft(actor)&&actor.modelId==='diamond-da40');assert.ok(arrival);
  const arrived={actors:{[arrival.id]:{...arrival,position:{x:cargo.cargoApron.x,y:.4,z:cargo.cargoApron.z}}}};
  checkTruckPath(collision,world,cargo.roadWaypoints,'International Airport arrived-aircraft handoff',arrived);
  for(const [index,to]of cargo.roadWaypoints.slice(1).entries()){
   const from=cargo.roadWaypoints[index];
   assert.ok(world.streets.some(road=>distance(road.from,from)<.01&&distance(road.to,to)<.01&&road.width>=7),'cargo road segment '+index+' is authored in the actual map');
  }
 }finally{collision.clearWorlds();}
});

test('durable atlas migration keeps player roads while exposing connected cargo maps and reciprocal walkable gateways',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'strait-freight-atlas-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const file=join(directory,'atlas.json'),legacy=shippingWorld();legacy.streets=[];legacy.builderScene.streets=[];delete legacy.airport;
 let atlas=new WorldAtlas(file);await atlas.synchronize([legacy]);
 const saved={id:'saved-player-dock-road',name:'Dockkeeper service lane',from:{x:196,z:330},to:{x:210,z:330},width:5,createdBy:'Dockkeeper'};
 await atlas.transaction(data=>{const cell=Object.values(data.cells).find(cell=>cell.mapId===legacy.id);assert.deepEqual(cell.streets,[]);cell.streets.push(saved);data.revision++;return {};});
 atlas=new WorldAtlas(file);
 const result=await synchronizeWorldDirectory(atlas,[]),shipping=result.environments.find(map=>map.id==='hormuz-shipping'),airport=result.environments.find(map=>map.id==='muzikaz-airport');
 assert.ok(shipping&&airport);assert.equal(shipping.airport.runways.length,5);
 for(const road of shippingWorld().streets)assert.ok(shipping.streets.some(record=>record.id===road.id),'new authored dock and air roads survive durable directory migration');
 assert.deepEqual(shipping.streets.find(road=>road.id===saved.id),saved,'an existing player-created street is preserved exactly');
 assert.ok(shipping.portalTargets.includes(airport.id));assert.ok(airport.portalTargets.includes(shipping.id));
 assert.ok(shipping.travelPortals.some(portal=>portal.mapId===airport.id));assert.ok(airport.travelPortals.some(portal=>portal.mapId===shipping.id));
 const collision=new ServerBuilderCollision();
 try{
  for(const [map,target]of [[shipping,airport],[airport,shipping]]){
   const portal=map.builderScene.objects.find(object=>object.functionalSettings?.portal?.targetMapId===target.id);
   assert.ok(portal,map.id+' has a real reciprocal freight gateway');
   const floor=collision.groundAt(map,{...portal.position,y:.1},{entry:true});
   assert.ok(floor&&floor.y>=-.05,map.id+' gateway stands on physical land');
   assert.ok(collision.hasBodyClearance(map,floor,.38),map.id+' gateway leaves a clear walk-in approach');
  }
 }finally{collision.clearWorlds();}
});
