import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareForgeCrewWork,stepForgeCrewWork} from '../server-forge-crew-work.mjs';
import {FORGE_CREW,FORGE_STATIONS} from '../public/js/forge-config.js';
import {forgeWorld} from '../forge-world.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';

function fixture(){
 const environment={id:'traditional-forge',game:'forge'},player={actorId:'smith',position:{x:0,y:0,z:40},health:100,lastSeen:1000000,forge:{job:{id:'paid-order',recipeId:'forge-dagger',environmentId:'traditional-forge',stage:'hammer',status:'awaiting'},progress:{completedItems:4}},items:['owned-blade'],tokens:{MZK:1234},quests:{finished:['apprentice']}};
 const sim={actors:Object.fromEntries(FORGE_CREW.map(person=>[person.id,{id:person.id,modelId:person.modelId,active:true,health:100,position:{...person.home},rotation:{x:0,y:0,z:0},resident:{forge:true,role:person.role,name:person.name,home:{...person.home}}}])),players:{smith:player}};
 let now=1000000,checks=0;const collision={groundAt:(_environment,point)=>{checks++;return {...point,y:0};},hasBodyClearance:()=>true,resolve:(_environment,_from,to)=>({...to})};
 const tick=(dt=.25,options={})=>{now+=dt*1000;player.lastSeen=now;checks=0;prepareForgeCrewWork(sim);stepForgeCrewWork(sim,environment,now,dt,{collision,...options});};
 return {sim,environment,player,tick,collision,get now(){return now;},get checks(){return checks;}};
}

test('three specialists walk to separate side benches and demonstrate without changing paid work or inventory',()=>{
 const f=fixture(),before=structuredClone({forge:f.player.forge,items:f.player.items,tokens:f.player.tokens,quests:f.player.quests}),initial=Object.values(f.sim.actors).map(npc=>({...npc.position}));
 const working=new Set();
 for(let tick=0;tick<100;tick++){f.tick();for(const npc of Object.values(f.sim.actors)){assert.equal(npc.resident.forgeActivity.demonstration,true);if(npc.resident.forgeActivity.phase==='working')working.add(npc.id);}}
 assert.equal(Object.keys(f.sim.actors).length,3);assert.equal(working.size,3);
 assert.ok(Object.values(f.sim.actors).every((npc,index)=>Math.hypot(npc.position.x-initial[index].x,npc.position.z-initial[index].z)>1));
 assert.deepEqual({forge:f.player.forge,items:f.player.items,tokens:f.player.tokens,quests:f.player.quests},before);
 assert.ok(Object.values(f.sim.actors).every(npc=>npc.resident.machineWork.kind==='forge'));
 assert.equal(f.sim.forgeCrewActivity.workers,3);assert.ok(f.sim.forgeCrewActivity.planningChecks<=24);
});

test('live paid cycles preempt demonstrations and conversations suspend ambient movement',()=>{
 const f=fixture(),master=f.sim.actors[FORGE_CREW[0].id];f.tick();
 assert.equal(master.resident.forgeActivity.kind,'hammer');
 f.player.forge.job.status='processing';f.player.forge.job.readyAt=f.now+10000;
 const prior={...master.position};f.tick();assert.equal(master.resident.forgeActivity.phase,'yielding');assert.deepEqual(master.position,prior);
 master.resident.pauseUntil=f.now+5000;f.tick();assert.equal(master.resident.forgeActivity.phase,'talking');assert.deepEqual(master.position,prior);
 const forge=structuredClone(f.player.forge);f.tick();assert.deepEqual(f.player.forge,forge);
});

test('routing consumes a bounded resumable budget, survives save/reconnect and respects deleted or moved stations',()=>{
 const f=fixture(),masterId=FORGE_CREW[0].id;
 f.tick(.25,{planningBudget:2});assert.ok(f.sim.forgeCrewActivity.planningChecks<=2);assert.ok(f.sim.actors[masterId].forgeWork.plan);
 f.sim.actors=structuredClone(f.sim.actors);const originalWorkId=f.sim.actors[masterId].forgeWork.stationId;
 for(let index=0;index<80;index++){f.tick(.25,{planningBudget:2});assert.ok(f.sim.forgeCrewActivity.planningChecks<=2);assert.ok(f.checks<=5);}
 assert.ok(f.sim.actors[masterId].resident.forgeActivity.phase);assert.ok(originalWorkId);
 f.environment.builderScene={objects:FORGE_STATIONS.map(station=>({id:station.id,position:{...station.position},functionalSettings:{forgeStation:station.kind,forgeApproach:{x:0,y:0,z:5}}}))};
 f.environment.builderScene.objects.find(station=>station.id==='forge-hammer').position.x=45;
 f.sim.actors[masterId].forgeDutySequence=0;delete f.sim.actors[masterId].forgeWork;f.tick();assert.ok(f.sim.actors[masterId].resident.forgeActivity.target.x>45);
 f.environment.builderScene.objects=f.environment.builderScene.objects.filter(station=>station.id!=='forge-hammer');f.tick();assert.notEqual(f.sim.actors[masterId].resident.forgeActivity.stationId,'forge-hammer');
});

test('an empty room or blocked route pauses worker activity rather than teleporting or minting stock',()=>{
 const f=fixture(),initial=structuredClone(f.sim.actors);f.sim.players={};
 for(let index=0;index<10;index++)f.tick();assert.equal(f.sim.forgeCrewActivity.planningChecks,0);
 for(const [id,npc]of Object.entries(f.sim.actors)){assert.equal(npc.resident.forgeActivity.phase,'waiting');assert.deepEqual(npc.position,initial[id].position);}
 f.sim.players.smith=f.player;const collision={...f.collision,hasBodyClearance:()=>false};
 for(let index=0;index<25;index++)f.tick(.25,{collision});
 for(const [id,npc]of Object.entries(f.sim.actors)){assert.equal(npc.resident.forgeActivity.phase,'waiting');assert.deepEqual(npc.position,initial[id].position);}
 assert.equal(f.sim.forgeCrewActivity.outputs,undefined);assert.equal(f.sim.forgeCrewActivity.materials,undefined);
});

test('tired specialists return the ambient slot to the ordinary resident rest routine',()=>{
 const f=fixture(),npc=f.sim.actors[FORGE_CREW[0].id];f.tick();
 npc.resident.needs={energy:20};npc.resident.goal={kind:'practice'};
 prepareForgeCrewWork(f.sim,f.now);assert.ok(npc.resident.forgeBreak);assert.equal(npc.resident.machineWork,undefined);assert.equal(npc.resident.goal,null);
 npc.resident.needs.energy=40;prepareForgeCrewWork(f.sim,f.now);assert.ok(npc.resident.forgeBreak);
 npc.resident.needs.energy=60;prepareForgeCrewWork(f.sim,f.now);assert.equal(npc.resident.forgeBreak,undefined);assert.equal(npc.resident.machineWork.kind,'forge');
});

test('real forge collision keeps worker routes outside the six human operating pads',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'forge-crew-walk-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const environment=forgeWorld(),store=new SharedRoomStore(join(directory,'rooms.json'));let now=1000000;
 const runtime=new AuthoritativeRooms({store,now:()=>now}),identity={accountId:'crew-witness',username:'Witness'};
 const joined=await runtime.command(environment.id,environment,identity,{action:'join',requestId:'crew-witness-join'});
 const names=Object.values(joined.actors).filter(actor=>actor.resident?.forge).map(actor=>actor.resident.name).sort();assert.deepEqual(names,FORGE_CREW.map(person=>person.name).sort());
 const moved=new Set(),origins=new Map(Object.values(joined.actors).filter(actor=>actor.resident?.forge).map(npc=>[npc.id,npc.position]));
 for(let index=0;index<90;index++){
  now+=250;const state=await runtime.command(environment.id,environment,identity,{action:'input',requestId:'watch-crew-'+index,input:{side:0,forward:0,yaw:0}});
  for(const npc of Object.values(state.actors).filter(actor=>actor.resident?.forge)){
   const origin=origins.get(npc.id);if(Math.hypot(origin.x-npc.position.x,origin.z-npc.position.z)>1)moved.add(npc.id);
   assert.ok(FORGE_STATIONS.every(station=>Math.hypot(station.approach.x-npc.position.x,station.approach.z-npc.position.z)>2),'worker stays outside the human operating pad');
   assert.ok(npc.position.y<.5,'AI stays on the workshop floor');
  }
 }
 assert.equal(moved.size,3);
 runtime.collision.clearWorlds();
});
