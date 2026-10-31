import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {bunkerWorld} from '../bunker-world.mjs';
import {bunkerCampaignOffers} from '../public/js/bunker-quests.js';
import {questCatalog} from '../public/js/quest-catalog.js';
import {questContact,questReply} from '../public/js/quest-dialogue.js';
import {isCleanCommonsEnvironment} from '../public/js/rad-tox-rules.js';
import {supportsRadTox} from '../rad-tox-campaign.mjs';
import {prepareSiteQuest} from '../server-site-quests.mjs';
import {startExpandedQuest,expandedQuestAction,recordSiteQuestInteraction} from '../server-expanded-quests.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';

const station=(id,behavior,x,z)=>({id,modelId:behavior==='switch'?'bunker-signal-relay':behavior==='heal'?'bunker-med-station':'bunker-terminal',name:id.replaceAll('-',' '),position:{x,y:0,z},functionalSettings:{behavior,action:'none',interactionDistance:4,prompt:'Inspect '+id}});
const world={id:'underground-bunker',name:'Ghostline Bunker',spawn:{x:0,y:0,z:30},builderScene:{layout:'underground-bunker',mapSize:80,objects:[station('bunker-power-core','switch',-17,-25),station('bunker-power-relay','switch',-12,-21),station('bunker-ops-terminal','talk',16,0),station('bunker-fabrication-bench','talk',-16,22),station('bunker-archive-terminal','talk',16,-22),station('bunker-med-station','heal',20,24),station('bunker-extraction-terminal','talk',0,-28),station('bunker-ingress-shutter','door',0,34),station('bunker-filtration-unit','switch',-20,0),station('bunker-alert-console','talk',10,10),station('bunker-emergency-locker','talk',20,10),station('bunker-water-reserve','talk',-20,10),station('bunker-radiation-monitor','talk',-10,10)],layoutMeta:{locations:[{id:'arrival',name:'Arrival',x:0,z:30},{id:'operations',name:'Operations',x:16,z:4},{id:'power',name:'Power',x:-16,z:-18}]}}};

function fixture(){
 const p={actorId:'p',username:'Crew',position:{...world.spawn},health:80,lastSeen:100000,movementRevision:0,score:0};
 const actors=Object.fromEntries(world.builderScene.objects.map(object=>[object.id,{id:object.id,position:{...object.position},active:true,health:100}]));
 for(const id of ['bunker-nyx','bunker-rook','bunker-echo','bunker-patch'])actors[id]={id,position:{x:3,y:0,z:28},modelId:'world-resident',active:true,health:100,resident:{name:id}};
 return {p,sim:{players:{p},actors,events:[]}};
}

test('bunker campaign offers actual ordered operations alongside local discovery and an emergency drill',()=>{
 const operations=bunkerCampaignOffers(world),catalog=questCatalog(world);
 assert.equal(operations.length,6);assert.equal(new Set(operations.map(offer=>offer.id)).size,6);
 for(const offer of operations){
  assert.equal(offer.kind,'site-job');assert.equal(offer.mode,'foot');assert.equal(offer.strictSites,true);assert.equal(offer.sites.length,3);
  assert.match(offer.description,/accepted in any order/);
  for(const site of offer.sites){assert.equal(site.action,'interact');assert.ok(world.builderScene.objects.some(object=>object.id===site.entityId));}
  const contact=questContact(offer);assert.equal(contact.name,offer.campaignContact.name);assert.equal(contact.modelId,'world-resident');assert.match(questReply(offer,'briefing'),/bunker|archive|station|relay|shutter|shelter|water|power/i);
 }
 assert.ok(catalog.some(offer=>offer.id==='map:underground-bunker:tour'));assert.ok(catalog.some(offer=>offer.id==='map:underground-bunker:challenge'));
 assert.equal(isCleanCommonsEnvironment(world),true);assert.equal(supportsRadTox(world),false);
 const copy={...world,id:'my-bunker-copy'};assert.equal(isCleanCommonsEnvironment(copy),true);assert.ok(bunkerCampaignOffers(copy).every(offer=>offer.mapId===copy.id&&offer.id.startsWith('map:my-bunker-copy:')));
 assert.deepEqual(bunkerCampaignOffers({id:'unrelated',builderScene:{objects:world.builderScene.objects}}),[]);
});

test('a missing or inaccessible campaign station cannot turn an operation into a shorter rewarded route',()=>{
 const broken=structuredClone(world);broken.builderScene.objects=broken.builderScene.objects.filter(object=>object.id!=='bunker-power-relay');
 assert.equal(bunkerCampaignOffers(broken).some(offer=>offer.id.endsWith('operation-power')),false);
 const {p,sim}=fixture(),offer=bunkerCampaignOffers(world)[0];delete sim.actors['bunker-power-relay'];
 assert.throws(()=>prepareSiteQuest(sim,p,structuredClone(offer),world),/required campaign station/);
 const {sim:blocked}=fixture();assert.throws(()=>prepareSiteQuest(blocked,p,structuredClone(offer),world,{collision:{groundAt:(_env,point)=>point.x<0?null:point}}),/required campaign station/);
 assert.equal(p.score,0);assert.equal(p.vehicleMission,undefined);
});

test('each campaign operation needs fresh ordered interactions, rewards once and preserves its existing crew contact',()=>{
 for(const offer of bunkerCampaignOffers(world)){
  const {p,sim}=fixture(),contact=sim.actors[offer.authoredContactId],actorIds=Object.keys(sim.actors);
  assert.equal(recordSiteQuestInteraction(sim,p,sim.actors[offer.sites[0].entityId],99999,world.id),false);
  startExpandedQuest(sim,p,world,offer.id,100000);const q=p.vehicleMission;
  assert.equal(q.contactEntityId,contact.id);assert.equal(q.contactId,undefined);assert.deepEqual(Object.keys(sim.actors),actorIds);
  assert.match(q.description,/accepted in any order/);assert.equal(q.checkpoints.length,3);
  assert.equal(recordSiteQuestInteraction(sim,p,sim.actors[q.checkpoints[1].entityId],100001,world.id),false);
  p.position={...q.checkpoints[0]};assert.throws(()=>expandedQuestAction(sim,p,100001),/Use the marked site item/);
  for(let index=0;index<3;index++){
   const point=q.checkpoints[q.index];p.position={x:point.x,y:point.y,z:point.z};p.lastSeen=100250+index*250;
   if(point.requiredState){const entity=sim.actors[point.entityId];for(const[key,value]of Object.entries(point.requiredState))entity[key]=!value;assert.equal(recordSiteQuestInteraction(sim,p,entity,p.lastSeen,world.id),false);assert.equal(q.index,index);Object.assign(entity,point.requiredState);}
   assert.equal(recordSiteQuestInteraction(sim,p,sim.actors[point.entityId],p.lastSeen,world.id),true);
  }
  assert.equal(q.status,'completed');assert.equal(p.score,offer.reward);assert.equal(p.mapQuestProgress.completed[offer.id].count,1);assert.equal(sim.actors[contact.id],contact);
  assert.equal(recordSiteQuestInteraction(sim,p,sim.actors[offer.sites[0].entityId],101000,world.id),false);assert.equal(p.score,offer.reward);
 }
});

test('all six operations complete through actual bunker room equipment and authored crew',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'bunker-campaign-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const environment=bunkerWorld();
 for(const offer of bunkerCampaignOffers(environment))await t.test(offer.title,async()=>{
  let now=100000,request=0;
  const store=new SharedRoomStore(join(dir,offer.id.split(':').at(-1)+'.json')),rooms=new AuthoritativeRooms({store,now:()=>now}),user={accountId:'bunker-crew',username:'Crew visitor',stats:{health:80}};
  const send=(action,fields={})=>rooms.command(environment.id,environment,user,{action,requestId:'campaign-'+ ++request,...fields});
  const joined=await send('join',{deferRadTox:true,radToxEnabled:false}),selfId=joined.selfId;
  let state=await send('vehicle-mission',{operation:'start',questId:offer.id});
  const q=state.players[selfId].vehicleMission;
  assert.equal(q.checkpoints.length,3);assert.equal(q.contactId,undefined);assert.equal(q.contactEntityId,offer.authoredContactId);assert.ok(state.actors[q.contactEntityId]?.resident?.bunker);
  await assert.rejects(send('interact',{entityId:q.checkpoints[0].entityId}),/within reach/);
  assert.equal((await rooms.snapshot(environment.id,environment)).players[selfId].vehicleMission.index,0);
  for(const point of q.checkpoints){
   assert.ok(rooms.collision.hasBodyClearance(environment,point,.38,{actors:state.actors,objects:state.objects}));
   await store.update(environment.id,room=>{const p=room.simulation.players[selfId];p.position={x:point.x,y:point.y,z:point.z};p.input={};});
   const index=state.players[selfId].vehicleMission.index;
   now+=2000;state=await send('interact',{entityId:point.entityId});
   if(point.requiredState&&state.players[selfId].vehicleMission.index===index){now+=2000;state=await send('interact',{entityId:point.entityId});}
   if(point.requiredState)for(const[key,value]of Object.entries(point.requiredState))assert.equal(state.actors[point.entityId][key],value);
  }
  const player=state.players[selfId];
  assert.equal(player.vehicleMission.status,'completed');assert.equal(player.score,offer.reward);assert.equal(player.mapQuestProgress.completed[offer.id].count,1);
  assert.ok(state.actors[offer.authoredContactId]?.resident?.bunker,'existing crew survives operation completion');
  assert.equal(state.radTox,null);
  if(offer.id.endsWith('operation-power')){assert.equal(state.actors['bunker-power-core'].switched,true);assert.equal(state.actors['bunker-power-relay'].switched,true);}
 });
});
