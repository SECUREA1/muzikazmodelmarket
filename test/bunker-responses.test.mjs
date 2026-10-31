import {registerAIWorldDefinitions} from '../server-ai-world-actions.mjs';
import {compileBuilderScene} from '../public/js/builder-gameplay-pipeline.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {stepBunkerResponse,bunkerResidentGuidance} from '../server-bunker-response.mjs';
import {stepBunkerResidents} from '../server-bunker-residents.mjs';
import {bunkerWorld} from '../bunker-world.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';

const loc=(x,z)=>({x,y:-11.98,z});
function fixture(){
 const actors={},entity=(id,behavior,x,z)=>actors[id]={id,name:id,active:true,position:loc(x,z),switched:false,open:true,definition:{gameplay:{behavior,interactionDistance:4},dialogue:{text:'Local station checked.'}}};
 for(const [id,behavior,x,z] of [['power','switch',-12,-22],['filter','switch',-12,-17],['relay','switch',12,-17],['archive','talk',12,-22],['med','heal',12,24],['locker','talk',12,27],['water','talk',12,30],['console','talk',0,24],['seal','door',0,29]])entity(id,behavior,x,z);
 const cast=[['bunker-nyx',0,25],['bunker-rook',-12,-20],['bunker-patch',12,26],['bunker-echo',12,-20]].map(([id,x,z])=>actors[id]={id,name:id,position:loc(x,z),active:true,health:100,rotation:{y:0},resident:{bunker:true,name:id,role:id,home:loc(x,z),memory:[],worldActionsCompleted:0}});
 const environment={id:'bunker-response-fixture',bunkerDefense:{stations:{power:'power',filtration:'filter',relay:'relay',archive:'archive',medical:'med',locker:'locker',water:'water',alert:'console'},sealDoorIds:['seal']}};
 const sim={actors,players:{},events:[],bunkerDefense:{alarm:{id:'airstrike-1',active:true,kind:'airstrike',phase:'warning',level:'warning'},responseTasks:[]}};
 const collision={groundAt:(_world,candidate)=>({...candidate}),hasBodyClearance:()=>true,resolve:(_world,_previous,next)=>next};
 return {sim,environment,cast,collision};
}
function advance(fixture,count=60,start=100000){
 for(let tick=0;tick<count;tick++)stepBunkerResponse(fixture.sim,fixture.environment,fixture.cast,start+tick*250,.25,{collision:fixture.collision});
 return start+count*250;
}

test('alarms drive real role checks, seal controls and bounded speech without completing a player quest',()=>{
 const f=fixture(),player=f.sim.players.visitor={actorId:'visitor',position:loc(24,0),health:100,lastSeen:100000,score:0,vehicleMission:{status:'active',campaign:'ghostline',questId:'player-mission',index:0,checkpoints:[{name:'My power check',entityId:'power'}]}};
 const end=advance(f,80);
 assert.equal(f.sim.actors.power.switched,true);assert.equal(f.sim.actors.filter.switched,true);assert.equal(f.sim.actors.relay.switched,true);assert.equal(f.sim.actors.seal.open,false);
 assert.equal(f.sim.bunkerDefense.responseTasks.length,4);
 for(const response of f.sim.bunkerDefense.responseTasks){assert.equal(response.stage,'ready');assert.equal(response.steps.every(step=>step.status==='completed'),true);}
 assert.equal(player.vehicleMission.index,0);assert.equal(player.score,0);
 const stamps=Object.fromEntries(['power','filter','relay','seal'].map(id=>[id,f.sim.actors[id].aiLastUsedAt]));
 advance(f,40,end);
 for(const [id,stamp]of Object.entries(stamps))assert.equal(f.sim.actors[id].aiLastUsedAt,stamp,'the same warning does not keep operating '+id);
 assert.equal(f.sim.transportRadio.length,4,'one role announcement per threat phase');
 f.sim.bunkerDefense.alarm.phase='impact';f.sim.bunkerDefense.alarm.level='danger';advance(f,10,end+10000);
 assert.equal(f.sim.transportRadio.length,8);assert.ok(f.cast.every(npc=>npc.resident.memory.length<=8));
 const saved=JSON.parse(JSON.stringify(f.sim));assert.equal(saved.bunkerDefense.responseTasks.length,4,'public response assignments survive a room snapshot');
 const restored={...f,sim:saved,cast:f.cast.map(npc=>saved.actors[npc.id])};const restoredRadio=saved.transportRadio.length;advance(restored,5,end+20000);assert.equal(saved.transportRadio.length,restoredRadio,'reload keeps the last spoken phase');for(const [id,stamp]of Object.entries(stamps))assert.equal(saved.actors[id].aiLastUsedAt,stamp,'reload does not repeat completed checks');
});

test('crew wait for a player at an active objective, then continue when the actual control is free',()=>{
 const f=fixture(),player=f.sim.players.visitor={actorId:'visitor',position:loc(-12,-22),health:100,lastSeen:100000,score:0,vehicleMission:{status:'active',campaign:'ghostline',title:'Power recovery',questId:'active-power',index:0,checkpoints:[{name:'Backup power core',entityId:'power',action:'interact'}]}};
 advance(f,20);
 const rook=f.sim.actors['bunker-rook'];assert.equal(f.sim.actors.power.switched,false);assert.equal(rook.resident.bunkerResponse.stage,'waiting');
 const guidance=bunkerResidentGuidance(f.sim,player,rook);assert.match(guidance,/Airstrike alert/);assert.match(guidance,/Step 1 of 1: Backup power core/);assert.match(guidance,/cannot complete your objective/);
 player.position=loc(24,0);player.lastSeen=105000;advance(f,50,105000);assert.equal(f.sim.actors.power.switched,true);assert.equal(player.vehicleMission.index,0);assert.equal(player.score,0);
});

test('missing or blocked stations stay unconfirmed and all-clear restores ordinary duties exactly once',()=>{
 const f=fixture();delete f.sim.actors.filter;
 f.collision.resolve=(_world,previous)=>previous;
 const origin={...f.cast[0].position};advance(f,30);
 assert.equal(f.sim.actors.power.switched,true,'a nearby physical switch can still be operated');
 const rook=f.sim.actors['bunker-rook'].resident.bunkerResponse;
 assert.equal(rook.steps[1].status,'unavailable');assert.equal(rook.stage,'blocked');
 assert.deepEqual(f.cast[0].position,origin,'blocked collision never teleports a responder');
 f.sim.bunkerDefense.alarm.active=false;f.sim.bunkerDefense.alarm.level='all-clear';advance(f,1,110000);
 assert.ok(f.cast.every(npc=>npc.resident.bunkerResponse.status==='completed'));
 const count=f.sim.transportRadio.length;advance(f,5,111000);assert.equal(f.sim.transportRadio.length,count,'all-clear is announced once');
 assert.ok(f.cast.every(npc=>npc.resident.nextThinkAt===110500));
});

test('actual bunker crew traverse room doors and operate live systems during a shared alarm',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'bunker-response-route-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 let now=1000000;const environment=bunkerWorld(),store=new SharedRoomStore(join(directory,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>now});
 await runtime.command(environment.id,environment,{accountId:'response-route',username:'Observer'},{action:'join',requestId:'response-arrive'});
 await store.update(environment.id,room=>{
  const sim=room.simulation;registerAIWorldDefinitions(sim,compileBuilderScene(environment.builderScene));
  sim.players={};sim.bunkerDefense.alarm={id:'route-alert',active:true,kind:'airstrike',phase:'warning',level:'warning'};
  const systems=environment.bunkerDefense.stations;
  sim.actors[systems.power].switched=false;sim.actors[systems.filtration].switched=false;sim.actors[systems.relay].switched=false;for(const id of environment.bunkerDefense.sealDoorIds)sim.actors[id].open=true;
  for(let tick=0;tick<400;tick++){now+=250;stepBunkerResidents(sim,environment,now,.25,{collision:runtime.collision,objects:room.objects});}
  for(const id of [systems.power,systems.filtration,systems.relay])assert.equal(sim.actors[id].switched,true,id+' is physically operated');
  assert.equal(sim.actors[environment.bunkerDefense.sealDoorIds[0]].open,false,'Nyx seals the shelter ingress');
  const responses=sim.bunkerDefense.responseTasks;
  assert.ok(responses.some(task=>task.actorId==='bunker-nyx'&&task.stage==='ready'),'Nyx reaches command and the shutter');
  assert.ok(responses.some(task=>task.actorId==='bunker-echo'&&task.stage==='ready'),'Echo reaches the engineering relay through room doors');
  assert.ok(responses.every(task=>task.steps.every(step=>step.status==='completed')),'each assigned crew station check is performed on real floor');
  assert.equal(sim.actors['bunker-door-east--22'].open,true,'the archive access door is operated before crossing');
  assert.equal(sim.actors['bunker-door-west--22'].open,true,'the engineering access door is operated before crossing');
 });
});
