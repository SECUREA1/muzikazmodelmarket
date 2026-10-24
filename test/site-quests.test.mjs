import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {prepareSiteQuest,recordMapQuestCompletion} from '../server-site-quests.mjs';
import {startExpandedQuest,stepExpandedQuests,expandedQuestAction,recordSiteQuestInteraction} from '../server-expanded-quests.mjs';
import {questCatalog} from '../public/js/quest-catalog.js';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {teamCommand,syncQuestTeams} from '../server-quest-teams.mjs';

const world={id:'site-workshop',name:'Workshop',spawn:{x:0,y:0,z:0},builderScene:{layout:'grand-floor',mapSize:128,objects:[
 {id:'workshop-guide',modelId:'street-sign',name:'Workshop guide',position:{x:10,y:0,z:0},functionalSettings:{behavior:'talk',interactionDistance:4,cooldown:.1,prompt:'Read the workshop guide'},dialogueSettings:{text:'Welcome to the real workshop.'}},
 {id:'workshop-beacon',modelId:'lever-switch',name:'Workshop beacon',position:{x:15,y:0,z:0},functionalSettings:{behavior:'switch',interactionDistance:4,cooldown:.1,prompt:'Toggle the workshop beacon'}}
],layoutMeta:{locations:[{id:'arrival',name:'Workshop entrance',x:0,z:0},{id:'courtyard',name:'Workshop courtyard',x:20,z:0},{id:'garden',name:'Workshop garden',x:30,z:10}]}}};
const fixture=()=>{const p={actorId:'p',username:'Worker',position:{x:0,y:.02,z:0},health:100,lastSeen:100000,movementRevision:0,score:0},actors=Object.fromEntries(world.builderScene.objects.map(object=>[object.id,{id:object.id,position:{...object.position},active:true,health:100}]));return {p,sim:{players:{p},actors,events:[]}};};
const job=()=>questCatalog(world).find(offer=>offer.kind==='site-job');

test('site markers use clear walkable floors beside real objects and retain floor level',()=>{
 const {p,sim}=fixture(),quest={kind:'site-job',sites:[{id:'beacon',entityId:'workshop-beacon',name:'Beacon',action:'interact',interactionDistance:4}]};let clearanceChecks=0;
 const collision={groundAt:(_environment,point)=>({...point,y:.02}),hasBodyClearance:(_environment,point)=>{clearanceChecks++;return Math.hypot(point.x-15,point.z)>.7;}};
 prepareSiteQuest(sim,p,quest,world,{collision});
 assert.ok(clearanceChecks>1);assert.ok(Math.hypot(quest.checkpoints[0].x-15,quest.checkpoints[0].z)>.7);
 assert.equal(quest.checkpoints[0].y,.02);assert.equal(quest.checkpoints[0].entityId,'workshop-beacon');assert.equal(quest.worldId,world.id);assert.equal(quest.sites,undefined);
 const blocked={kind:'site-job',sites:[{id:'beacon',entityId:'workshop-beacon',name:'Beacon',action:'interact'}]};
 assert.throws(()=>prepareSiteQuest(sim,p,blocked,world,{collision:{groundAt:(_environment,point)=>({...point,y:8})}}),/no clear walking access/);
});

test('sparse maps resolve bounded survey positions against actual floor and reject an empty world',()=>{
 const {p,sim}=fixture(),sites=[{id:'arrival',name:'Arrival',x:0,y:0,z:0},{id:'survey',name:'Nearby floor survey',x:8,y:0,z:0,survey:true}],quest={kind:'site-tour',sites};
 prepareSiteQuest(sim,p,quest,world,{collision:{groundAt:(_environment,point)=>Math.abs(point.x)<20?{...point,y:.02}:null,hasBodyClearance:()=>true}});
 assert.equal(quest.checkpoints.length,2);assert.ok(quest.checkpoints.every(point=>point.action==='check-in'&&point.dwell===2));
 assert.throws(()=>prepareSiteQuest(sim,p,{kind:'site-tour',sites},world,{collision:{groundAt:()=>null}}),/no clear walking access/);
});

test('member plots with an imported model anchor sparse surveys to its measured physical entrance',()=>{
 const {p,sim}=fixture(),quest={kind:'site-tour',sites:[{id:'map-arrival',name:'Arrival',x:0,y:0,z:0},{id:'survey',name:'Nearby floor',x:8,y:0,z:0,survey:true}]};
 const map={id:'member-model',modelUrl:'/base.glb',placementScene:{objects:[]}},collision={safeSpawn:()=>({x:100,y:4,z:50}),groundAt:(_environment,point)=>({...point,y:4}),hasBodyClearance:()=>true};
 prepareSiteQuest(sim,p,quest,map,{collision});assert.deepEqual(quest.checkpoints.map(point=>[point.x,point.y,point.z]),[[100,4,50],[108,4,50]]);
});

test('a timed route retains its required arrival when a survey resolves to the same clear floor',()=>{
 const {p,sim}=fixture(),quest={kind:'site-tour',challenge:true,sites:[{id:'survey-a',name:'Survey A',x:8,y:0,z:0},{id:'survey-b',name:'Survey B',x:0,y:0,z:0},{id:'map-arrival',name:'Arrival',x:0,y:0,z:0}]};
 prepareSiteQuest(sim,p,quest,world);assert.deepEqual(quest.checkpoints.map(point=>point.siteId),['survey-a','map-arrival']);
});

test('site services require a fresh successful exact interaction and cannot be claimed through Confirm',()=>{
 const {p,sim}=fixture(),offer=job();assert.ok(offer,'real authored objects offer a service assignment');
 assert.equal(recordSiteQuestInteraction(sim,p,sim.actors['workshop-guide'],100000,world.id),false,'pre-accept actions do not count');
 startExpandedQuest(sim,p,world,offer.id,100000);const q=p.vehicleMission,point=q.checkpoints[0];
 p.position={x:point.x,y:point.y,z:point.z};p.lastSeen=100250;stepExpandedQuests(sim,world,100250,.25);
 assert.throws(()=>expandedQuestAction(sim,p,100250),/Use the marked site item/);
 assert.equal(recordSiteQuestInteraction(sim,p,{id:'wrong',position:{...p.position}},100250,world.id),false);
 assert.equal(recordSiteQuestInteraction(sim,p,sim.actors[point.entityId],100250,'another-map'),false);
 p.movementRevision++;assert.equal(recordSiteQuestInteraction(sim,p,sim.actors[point.entityId],100250,world.id),false);p.movementRevision--;
 let now=100250;
 while(q.status==='active'){
  const current=q.checkpoints[q.index];p.position={x:current.x,y:current.y,z:current.z};p.lastSeen=now;
  assert.equal(recordSiteQuestInteraction(sim,p,sim.actors[current.entityId],now,world.id),true);now+=250;
 }
 assert.equal(q.status,'completed');assert.equal(p.score,offer.reward);assert.equal(sim.questResults.length,1);assert.equal(p.mapQuestProgress.completed[q.questId].count,1);
 assert.equal(recordSiteQuestInteraction(sim,p,sim.actors[point.entityId],now,world.id),false);assert.equal(p.score,offer.reward);
});

test('site tour requires ordered stops and hold time; relocation and expiry never reward',()=>{
 for(const ending of ['complete','relocate','expire']){
  const {p,sim}=fixture(),offer=questCatalog(world).find(offer=>offer.siteQuest&&offer.kind==='site-tour');assert.ok(offer);
  startExpandedQuest(sim,p,world,offer.id,100000);const q=p.vehicleMission;let now=100000;
  if(ending==='relocate')p.movementRevision++;
  if(ending==='expire')q.deadline=99999;
  if(ending!=='complete'){now+=250;stepExpandedQuests(sim,world,now,.25);assert.notEqual(q.status,'active');assert.equal(p.score,0);continue;}
  p.position={...q.checkpoints[1]};p.lastSeen=now;assert.throws(()=>expandedQuestAction(sim,p,now),/Reach the objective/);
  for(const point of q.checkpoints){
   p.position={x:point.x,y:point.y,z:point.z};assert.throws(()=>expandedQuestAction(sim,p,now),/hold/);
   for(let i=0;i<8;i++){now+=250;p.lastSeen=now;stepExpandedQuests(sim,world,now,.25);}
   expandedQuestAction(sim,p,now);
  }
  assert.equal(q.status,'completed');assert.equal(p.score,offer.reward);
 }
});

test('map completion history records server times and stays bounded',()=>{
 const p={};recordMapQuestCompletion(p,{siteQuest:true,worldId:'a',questId:'a-tour',startedAt:1000},5000);recordMapQuestCompletion(p,{siteQuest:true,worldId:'a',questId:'a-tour',startedAt:6000},8000);
 assert.deepEqual(p.mapQuestProgress.completed['a-tour'],{count:2,bestMs:2000,lastCompletedAt:8000});
 for(let i=0;i<60;i++)recordMapQuestCompletion(p,{siteQuest:true,worldId:'a',questId:'a-'+i,startedAt:0},10000+i);
 assert.equal(Object.keys(p.mapQuestProgress.completed).length,48);
 recordMapQuestCompletion(p,{siteQuest:true,worldId:'b',questId:'b-tour',startedAt:0},20000);assert.equal(p.mapQuestProgress.worldId,'b');assert.deepEqual(Object.keys(p.mapQuestProgress.completed),['b-tour']);
});

test('contributing site helpers earn one completion; personal native work cannot be shared',()=>{
 const {p,sim}=fixture(),offer=job();startExpandedQuest(sim,p,world,offer.id,100000);const q=p.vehicleMission;
 const helper=sim.players.h={actorId:'h',username:'Helper',health:100,lastSeen:100000,position:{...q.checkpoints[0]},score:0};
 teamCommand(sim,p,'share',100000);teamCommand(sim,helper,'join',100000,{teamId:q.instanceId,role:'helper'});
 assert.equal(recordSiteQuestInteraction(sim,helper,sim.actors[q.checkpoints[0].entityId],100000,world.id),true);
 while(q.status==='active'){const point=q.checkpoints[q.index];p.position={x:point.x,y:point.y,z:point.z};recordSiteQuestInteraction(sim,p,sim.actors[point.entityId],100000,world.id);}
 assert.equal(helper.score,offer.reward);assert.equal(helper.mapQuestProgress.completed[offer.id].count,1);syncQuestTeams(sim,100001);assert.equal(helper.score,offer.reward);assert.equal(helper.mapQuestProgress.completed[offer.id].count,1);
 const own={questId:'personal',siteWork:'fitness-set',instanceId:'personal',status:'active',deadline:200000,team:{p:{role:'leader'}},shared:true};p.vehicleMission=own;helper.vehicleMission=null;
 assert.throws(()=>teamCommand(sim,p,'share',100001),/cannot be shared/);assert.throws(()=>teamCommand(sim,helper,'join',100001,{teamId:own.instanceId,role:'helper'}),/own activity/);
});

test('real room item interactions advance site work only after authoritative reach validation',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'site-quest-room-'));t.after(()=>rm(dir,{recursive:true,force:true}));let now=100000,n=0;
 const store=new SharedRoomStore(join(dir,'rooms.json')),rooms=new AuthoritativeRooms({store,now:()=>now}),user={accountId:'worker',username:'Worker',stats:{health:100}};
 const send=(action,fields={})=>rooms.command(world.id,world,user,{action,requestId:'site-'+ ++n,...fields});
 const joined=await send('join',{radToxEnabled:false}),selfId=joined.selfId,offer=job();
 let state=await send('vehicle-mission',{operation:'start',questId:offer.id});const first=state.players[selfId].vehicleMission.checkpoints[0];
 await assert.rejects(send('interact',{entityId:first.entityId}),/within reach/);
 assert.equal((await rooms.snapshot(world.id,world)).players[selfId].vehicleMission.index,0);
 for(let attempt=0;attempt<8;attempt++){
  const q=state.players[selfId].vehicleMission;if(q.status!=='active')break;const point=q.checkpoints[q.index];
  await store.update(world.id,room=>{const p=room.simulation.players[selfId];p.position={x:point.x,y:point.y,z:point.z};p.input={};});now+=500;
  state=await send('interact',{entityId:point.entityId});
 }
 const player=state.players[selfId];assert.equal(player.vehicleMission.status,'completed');assert.equal(player.score,offer.reward);assert.equal(player.mapQuestProgress.completed[offer.id].count,1);
 assert.ok(state.actors['workshop-beacon'].switched,'the underlying switch action also happened');
});
