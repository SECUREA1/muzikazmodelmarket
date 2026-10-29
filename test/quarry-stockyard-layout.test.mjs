import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {quarryWorld} from '../quarry-world.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {earthworksDeposit,earthCargoVolume} from '../public/js/construction-earthworks.js';
import {constructionCommand,stepConstruction} from '../server-construction.mjs';
import {constructionGroundAt} from '../public/js/construction-collision.js';
import {stepRoadVehicle} from '../public/js/road-vehicles.js';
import {roadMovementBlocked} from '../server-road-vehicles.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,a+' vs '+b);
function fixture(){
 let now=1000;const map=quarryWorld(),lots=structuredClone(map.quarry.initialStock.lots);delete map.quarry.initialStock;
 const runtime=new AuthoritativeRooms({now:()=>now}),room={objects:{}},sim=runtime.initialize(room,map).sim;sim.construction.crew.enabled=false;
 for(const lot of lots){const patch=sim.construction.earthworks.patches.find(p=>p.id===lot.patchId);if(!patch)continue;const cargo=earthworksDeposit(sim.construction.earthworks,{x:lot.x,y:Infinity,z:lot.z},{[lot.material]:lot.quantity},{radius:lot.radius,maxHeight:lot.maxHeight,cellFilter:cell=>cell.patch.id===lot.patchId});close(earthCargoVolume(cargo),lot.quantity);}
 const player={actorId:'stockyard-operator',health:100,lastSeen:now,vehicleId:null,position:{x:196,y:0,z:174},input:{}};sim.players[player.actorId]=player;
 const context=runtime.constructionContext(sim,map,{}),tick=()=>{now+=100;player.lastSeen=now;stepConstruction(sim,now,.1,context);};
 return {map,lots,runtime,sim,player,context,tick,get now(){return now;}};
}
test('stockyard adds finite raw and six finished material reserves without filling original process-output pads',async()=>{
 const map=quarryWorld(),lots=map.quarry.initialStock.lots;assert.equal(lots.length,8);assert.equal(lots.reduce((sum,lot)=>sum+lot.quantity,0),1200);assert.deepEqual(new Set(lots.map(l=>l.material)),new Set(['soil','gravel','sand','fines','stone','crushed','topsoil','mulch']));
 for(const lot of lots){const patch=map.construction.earthworks.patches.find(p=>p.id===lot.patchId);assert.ok(patch);assert.equal(patch.kind,'stockpile');assert.equal(patch.maxDepth,0);assert.equal(patch.height,undefined);assert.ok(lot.maxHeight<=.4);assert.ok(!Object.values(map.quarry.outputPatches).includes(patch.id));}
 assert.deepEqual(map.builderScene.layoutMeta.quarry,map.quarry);assert.ok(map.playableSize>=768);assert.equal(map.quarry.stockyards.length,3);assert.ok(map.quarry.loadout.radius>=18);
 const registry=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url)));assert.deepEqual(registry.find(e=>e.id===map.id),map);
});
test('stockyard lanes and loadout stay outside every live material patch',()=>{
 const map=quarryWorld(),patches=map.construction.earthworks.patches;
 for(const road of map.builderScene.objects.filter(o=>o.id.startsWith('quarry-stockyard-')||o.id==='quarry-loadout-entry'||o.id==='quarry-loadout-scale')){
  const halfX=road.scale.x*4.8/2,halfZ=road.scale.z*4.8/2;for(const patch of patches)assert.ok(Math.abs(road.position.x-patch.x)>=halfX+patch.width/2||Math.abs(road.position.z-patch.z)>=halfZ+patch.depth/2,road.id+' crosses mutable '+patch.id);
 }
 const point=map.quarry.loadout;assert.ok(patches.every(p=>Math.abs(point.x-p.x)>p.width/2||Math.abs(point.z-p.z)>p.depth/2));
});
test('three native stockyard excavators scoop real pre-stock and load their paired trucks with colliders active',()=>{
 const f=fixture();for(const stand of f.map.quarry.loadingStands){const actor=f.sim.actors[stand.excavatorId],truck=f.sim.actors[stand.truckId];assert.equal(actor.position.y,0);f.player.vehicleId=actor.id;f.player.position={...actor.position};actor.holderId=f.player.actorId;
  constructionCommand(f.sim,f.player,{operation:'work'},f.now,f.context);for(let i=0;i<70&&actor.construction.workCycle;i++)f.tick();assert.equal(actor.construction.workCycle,undefined,JSON.stringify(actor.construction.blocked));close(actor.construction.cargo[stand.material],2);
  constructionCommand(f.sim,f.player,{operation:'work'},f.now,f.context);for(let i=0;i<150&&actor.construction.workCycle;i++)f.tick();assert.equal(actor.construction.workCycle,undefined,JSON.stringify(actor.construction.blocked));close(actor.construction.load,0);close(truck.construction.cargo[stand.material],2);actor.holderId=null;
 }
});
test('a native haul truck crosses the expanded stockyard lane with real ground and obstacle checks',()=>{
 const f=fixture(),truck=f.sim.actors['quarry-dispatch-truck'];truck.position={x:348,y:.02,z:135};truck.rotation={x:0,y:Math.PI/2,z:0};truck.driving={speed:0};
 for(let i=0;i<700&&truck.position.x>190;i++){const state=stepRoadVehicle(truck,{forward:.5,side:0},.1,{groundAt:p=>constructionGroundAt(truck,p,q=>f.runtime.collision.groundAt(f.map,q,{actors:{...f.sim.actors,[truck.id]:{...truck,active:false}},objects:{},earthworks:f.sim.construction.earthworks})),blocked:(from,to,yaw)=>roadMovementBlocked(f.runtime.collision,f.map,f.sim.actors,{},truck,from,to,yaw,{earthworks:f.sim.construction.earthworks})});Object.assign(truck,state);}
 assert.ok(truck.position.x<192,'truck blocked in expanded lane: '+JSON.stringify(truck.position));assert.ok(Math.abs(truck.position.z-135)<.01);assert.ok(!truck.driving.blocked);
});
