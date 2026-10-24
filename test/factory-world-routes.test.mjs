import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {missileFactoryWorld} from '../missile-factory-world.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {FACTORY_STATIONS,FACTORY_CREW} from '../public/js/missile-factory-config.js';
import {roadMovementBlocked,roadExitPosition} from '../server-road-vehicles.mjs';

async function actualFactory(t){
 const directory=await mkdtemp(join(tmpdir(),'factory-route-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const world=missileFactoryWorld(),runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(directory,'rooms.json')),now:()=>1000000});
 const state=await runtime.command(world.id,world,{accountId:'factory-route-review',username:'Route reviewer'},{action:'join',requestId:'factory-route-join'});
 return {world,runtime,state,collision:runtime.collision,actors:state.actors,objects:state.objects};
}

test('factory production walking route reaches every operator pad and keeps working earth and crane loads in the side yard',async t=>{
 const {world,state,collision,actors,objects}=await actualFactory(t);
 for(const station of FACTORY_STATIONS){
  const floor=collision.groundAt(world,station.position,{entry:true,actors,objects});
  assert.ok(floor&&Math.abs(floor.y-.02)<.03,station.name+' stays on the main factory floor');
  assert.ok(collision.hasBodyClearance(world,floor,.38,{actors,objects}),station.name+' has clear standing room');
 }
 let current={...state.players[state.selfId].position};
 // A connected pedestrian path skirts the procurement/dispatch desks and
 // stays in front of the production machinery instead of crossing its bases.
 const points=[[-32,38],[-32,28],[-40,28],[-40,10],[-30,10],[-30,0],[0,0],[27,0],[20,10],[20,28],[30,28]];
 for(const [x,z]of points){
  const start={...current},length=Math.hypot(x-start.x,z-start.z),count=Math.ceil(length/.4);
  for(let i=1;i<=count;i++){
   const desired={x:start.x+(x-start.x)*i/count,y:.02,z:start.z+(z-start.z)*i/count};
   const resolved=collision.resolve(world,current,desired,actors,objects,{earthworks:state.construction.earthworks});
   assert.ok(Math.hypot(resolved.x-desired.x,resolved.z-desired.z)<.05,'pedestrian path remains clear at '+JSON.stringify(desired));
   current=resolved;
  }
 }
 assert.ok(Math.abs(state.construction.tower.x)>55,'the construction tower is outside the production hall');
 assert.ok(state.construction.earthworks.patches.every(patch=>Math.abs(patch.origin.x)>55),'working soil is confined to the yard');
 assert.ok(Object.values(actors).filter(actor=>actor.constructionBeam).every(actor=>Math.abs(actor.position.x)>55),'crane steel does not appear in pedestrian production aisles');
 for(const member of FACTORY_CREW){const npc=actors[member.id];assert.ok(npc.resident.factory);assert.ok(!npc.resident.safetyRelocated,member.name+' begins at their intended clear workplace');}
});

test('actual factory truck can reverse to loading and deliver along the haul lane with a clear dispatch exit',async t=>{
 const {world,state,collision,actors,objects}=await actualFactory(t),original=actors['factory-freight-truck'];
 let truck={...original,position:{...original.position},construction:{...original.construction},driving:{...original.driving}};
 // Reverse north to loading, then drive south. The small leftward approach
 // keeps the truck in its lane while bringing dispatch within service range.
 const route=[{x:40,y:0,z:-20},{x:38,y:0,z:28}];
 for(const destination of route){
  const start={...truck.position},distance=Math.hypot(destination.x-start.x,destination.z-start.z),count=Math.ceil(distance/.75);
  for(let i=1;i<=count;i++){
   const target={x:start.x+(destination.x-start.x)*i/count,y:0,z:start.z+(destination.z-start.z)*i/count};
   const blocked=roadMovementBlocked(collision,world,actors,objects,truck,truck.position,target,Math.PI,{earthworks:state.construction.earthworks});
   assert.equal(blocked,false,'freight route blocked at '+JSON.stringify(target)+': '+truck.driving.blockedReason);
   truck={...truck,position:target};actors[truck.id]=truck;
  }
 }
 const dispatch=FACTORY_STATIONS.find(station=>station.kind==='dispatch');
 assert.ok(Math.hypot(truck.position.x-dispatch.position.x,truck.position.z-dispatch.position.z)<=9,'dispatch can service the truck while it is parked in the haul lane');
 const exit=roadExitPosition(collision,world,truck,actors,objects,{earthworks:state.construction.earthworks});
 assert.ok(collision.hasBodyClearance(world,exit,.38,{actors,objects}), 'the driver can exit beside the dispatch bay');
 assert.ok(Math.hypot(exit.x-dispatch.position.x,exit.z-dispatch.position.z)<=dispatch.interactionDistance,'the exit reaches the collection console');
});
