import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {stepJobDispatch} from '../server-job-dispatch.mjs';
import {questTeamOffers} from '../server-quest-teams.mjs';
import {vehicleMissionCommand} from '../server-transport-activity.mjs';
import {questCatalog} from '../public/js/quest-catalog.js';
import {casinoWorld} from '../casino-world.mjs';
import {fitnessWorld} from '../fitness-world.mjs';
import {missileFactoryWorld} from '../missile-factory-world.mjs';

for(const environment of [casinoWorld(),fitnessWorld(),missileFactoryWorld()])test(environment.id+' offers fresh radio jobs without ambient transport traffic',()=>{
 const sim={actors:{},players:{p:{actorId:'p'}}},offers=questCatalog(environment);
 assert.ok(offers.length);
 stepJobDispatch(sim,environment,100000);
 const first=sim.liveDispatch,call=sim.transportRadio[0];
 assert.equal(first.questId,offers[0].id);
 assert.equal(first.worldId,environment.id);
 assert.equal(first.worldName,environment.name);
 assert.equal(first.type,'ai');
 assert.equal(first.at,100000);
 assert.ok(first.expires>100000);
 assert.equal(call.jobOffer,true);
 assert.equal(call.questId,first.questId);
 assert.equal(call.expires,first.expires);
 assert.equal(call.interaction,undefined,'new-job narration handles this call without duplicate speech');
 assert.equal(sim.players.p.vehicleMission,undefined,'a call requires an explicit acceptance');
 assert.deepEqual(sim.actors,{},'indoor radio jobs do not create unsupported vehicles');
 stepJobDispatch(sim,environment,100001);
 assert.equal(sim.transportRadio.length,1);
 stepJobDispatch(sim,environment,220000);
 assert.notEqual(sim.liveDispatch.id,first.id);
 assert.equal(sim.liveDispatch.questId,offers[1%offers.length].id);
 assert.equal(sim.transportRadio.length,2);
});

for(const environment of [casinoWorld(),fitnessWorld(),missileFactoryWorld()])test(environment.id+' publishes a radio job in its first authoritative snapshot',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'first-radio-job-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const now=100000,runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(directory,'rooms.json')),now:()=>now});
 const first=await runtime.snapshot(environment.id,environment);
 assert.equal(first.authoritative,true);
 assert.equal(first.simulationTime,now,'initialization and the first step use the same clock value');
 assert.equal(first.serverTime,now);
 assert.ok(first.liveDispatch?.questId,'dispatch exists before the short-step early return');
 assert.equal(first.liveDispatch.questId,questCatalog(environment)[0].id);
 assert.equal(first.liveDispatch.worldId,environment.id);
 assert.ok(first.transportRadio.some(call=>call.jobOffer&&call.questId===first.liveDispatch.questId));
 assert.ok(!Object.keys(first.actors).some(id=>id.startsWith('transport-traffic-')),'facility exclusions still prevent ambient transport');
 const joined=await runtime.command(environment.id,environment,{accountId:'first-job-visitor',username:'Visitor',stats:{health:100}},{action:'join',requestId:'first-radio-join',deferRadTox:true,radToxEnabled:false});
 assert.equal(joined.liveDispatch.id,first.liveDispatch.id);
 assert.equal(joined.transportRadio.filter(call=>call.jobOffer).length,1,'repeated short steps do not duplicate a call');
 assert.equal(joined.players[joined.selfId].vehicleMission,null,'joining the world leaves acceptance to the player');
});

test('dispatch uses the authoritative offer list and clears an unavailable catalogue',()=>{
 const environment=casinoWorld(),sim={questOffers:[{id:'live-service',title:'Live service job',mode:'foot',point:{x:2,y:0,z:3}}]};
 stepJobDispatch(sim,environment,100000);
 assert.equal(sim.liveDispatch.questId,'live-service');
 assert.deepEqual(sim.liveDispatch.point,{x:2,y:0,z:3});
 sim.questOffers=[];stepJobDispatch(sim,environment,100001);
 assert.equal(sim.liveDispatch,null);
});

function teamFixture(){
 const now=100000,environment={id:'help-world',name:'Help world'},leader={actorId:'leader',username:'Rescuer',position:{x:5,y:0,z:10},health:100,lastSeen:now};
 const mission=leader.vehicleMission={instanceId:'rescue-instance',questId:'rescue-job',title:'Recover lost supplies',mode:'foot',status:'active',startedAt:now,deadline:now+600000,team:{leader:{role:'leader'}},checkpoints:[{x:20,y:0,z:15}],index:0};
 const helper={actorId:'helper',username:'Helper',health:100,lastSeen:now,position:{x:0,y:0,z:0}},sim={players:{leader,helper},actors:{}};
 return {sim,leader,helper,mission,now,environment,send(player,operation,at=now,options={}){return vehicleMissionCommand(sim,player,environment,operation,at,options);}};
}

test('a player help call opens a genuine team and qualified helpers can join it',()=>{
 const f=teamFixture();
 assert.match(f.send(f.leader,'help'),/Help call broadcast/);
 assert.equal(f.mission.shared,true);
 const call=f.sim.transportRadio.at(-1);
 assert.equal(call.helpRequest,true);
 assert.equal(call.teamId,f.mission.instanceId);
 assert.equal(call.questId,f.mission.questId);
 assert.equal(call.speakerId,f.leader.actorId);
 assert.equal(call.type,'player');
 assert.equal(call.worldId,f.environment.id);
 assert.equal(call.expires,f.now+90000);
 assert.deepEqual(call.point,f.leader.position);
 assert.equal(questTeamOffers(f.sim,f.now).length,1);
 assert.match(f.send(f.helper,'join',f.now,{teamId:call.teamId,role:'helper'}),/Joined/);
 assert.equal(f.helper.vehicleMission.teamLeader,f.leader.actorId);
 assert.equal(f.mission.team.helper.role,'helper');
 assert.throws(()=>f.send(f.helper,'help'),/Only the leader/);
});

test('help calls are bounded by the mission deadline and cannot be spammed through share',()=>{
 const f=teamFixture();f.mission.deadline=f.now+35000;
 f.send(f.leader,'share');
 assert.equal(f.sim.transportRadio.at(-1).helpRequest,true);
 assert.equal(f.sim.transportRadio.at(-1).expires,f.mission.deadline);
 assert.throws(()=>f.send(f.leader,'help',f.now+1),/thirty seconds/);
 f.leader.lastSeen=f.now+29999;
 assert.throws(()=>f.send(f.leader,'share',f.now+29999),/thirty seconds/);
 assert.equal(f.sim.transportRadio.length,1);
 f.leader.lastSeen=f.now+30000;
 f.send(f.leader,'help',f.now+30000);
 assert.equal(f.sim.transportRadio.length,2);
 assert.equal(f.mission.helpRequestedAt,f.now+30000);
});

test('radio team listings discard expired, disconnected, dead, replaced, full and individual work',()=>{
 for(const reason of ['expired','call-expired','offline','dead','replaced','full','individual']){
  const f=teamFixture();f.send(f.leader,'help');
  if(reason==='expired')f.mission.deadline=f.now;
  if(reason==='call-expired')f.mission.helpExpires=f.now;
  if(reason==='offline')f.leader.lastSeen=f.now-15000;
  if(reason==='dead')f.leader.health=0;
  if(reason==='replaced')f.leader.replacedByRoom='other-world';
  if(reason==='full')Object.assign(f.mission.team,{two:{},three:{},four:{}});
  if(reason==='individual')f.mission.siteWork='fitness-set';
  assert.deepEqual(questTeamOffers(f.sim,f.now),[],reason);
 }
});

test('help calls keep individual work, unavailable leaders and incompatible helpers protected',()=>{
 const f=teamFixture();f.mission.siteWork='fitness-set';
 assert.throws(()=>f.send(f.leader,'help'),/cannot be shared/);
 delete f.mission.siteWork;f.send(f.leader,'help');
 f.mission.mode='boat';
 assert.throws(()=>f.send(f.helper,'join',f.now,{teamId:f.mission.instanceId,role:'helper'}),/appropriate craft/);
 assert.equal(f.helper.vehicleMission,undefined);
 f.leader.replacedByRoom='other-world';
 assert.throws(()=>f.send(f.helper,'join',f.now,{teamId:f.mission.instanceId,role:'observer'}),/no longer available/);
});
