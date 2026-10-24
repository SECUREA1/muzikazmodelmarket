import test from 'node:test';
import assert from 'node:assert/strict';
import {describeAIWorldActions,requestAIWorldAction,stepAIWorldActions,notePlayerAIWorldInteraction,applyWorldObjectAction} from '../server-ai-world-actions.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

function fixture({targetX=4,targetZ=0,behavior='switch'}={}){
 const world={id:'local-garden',name:'Local garden',builderScene:{layout:'grand-floor',mapSize:64,objects:[]}},npc={id:'guide',name:'Robin',active:true,health:50,maxHealth:100,position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0},resident:{name:'Robin',phase:'working',task:'checking garden',goal:null,nextWorldActionAt:999999}},target={id:'beacon',name:'Garden beacon',active:true,health:100,position:{x:targetX,y:0,z:targetZ},definition:{gameplay:{behavior,enabled:true,interactionDistance:2,cooldown:.5,value:25,prompt:'Use the garden beacon'},dialogue:{text:'The beacon marks the public garden path.'}}},player={actorId:'p',username:'Player',health:100,lastSeen:100000,position:{x:-4,y:0,z:-3},score:7,inventory:[],tokens:{MZK:1000}},sim={time:100000,players:{p:player},actors:{guide:npc,beacon:target},events:[]};
 let now=100000;
 const collision={groundAt:(environment,point)=>({...point,y:0}),hasBodyClearance:()=>true,resolve:(environment,from,to)=>({...to})};
 const context={environment:world,collision,objects:{}};
 return {world,npc,target,player,sim,context,get now(){return now;},request(input={}){return requestAIWorldAction(sim,player,npc,input,now,context);},tick(count=1){for(let i=0;i<count;i++){now+=250;sim.time=now;player.lastSeen=now;stepAIWorldActions(sim,world,now,.25,context);}return now;}};
}

test('AI capabilities name real free local controls and exclude paid, remote and unsupported actions',()=>{
 const f=fixture();f.sim.actors.paid={...f.target,id:'paid',definition:{gameplay:{behavior:'talk',device:'arcade-slot-machine'}}};f.sim.actors.remote={...f.target,id:'remote',position:{x:100,y:0,z:0}};f.sim.actors.car={...f.target,id:'car',definition:{gameplay:{behavior:'vehicle'}}};
 const records=describeAIWorldActions(f.sim,f.world,f.npc,{now:f.now});
 assert.deepEqual(records.map(record=>record.id),['world:switch:beacon','world:inspect:beacon']);
 assert.equal(records[0].targetName,'Garden beacon');assert.equal(records[0].kind,'switch');
 assert.throws(()=>f.request({id:'world:switch:remote'}),/No matching/);
 assert.throws(()=>f.request({action:'vehicle'}),/No matching/);
});

test('requested NPC walks on authoritative floor, operates the actual switch, and grants no player rewards',()=>{
 const f=fixture(),original={...f.npc.position},reward=structuredClone(f.player);
 f.request({action:'switch',targetId:'beacon'});
 assert.equal(f.npc.aiTask.status,'active');assert.equal(f.target.switched,undefined);
 f.tick(4);assert.notDeepEqual(f.npc.position,original);assert.equal(f.target.switched,undefined);
 f.tick(24);assert.equal(f.npc.aiTask.status,'completed');assert.equal(f.target.switched,true);
 assert.equal(f.sim.events.filter(event=>event.action==='ai-world-action').length,1);
 assert.deepEqual({...f.player,lastSeen:reward.lastSeen},reward,'NPC work cannot reward or debit the player');
 f.tick(20);assert.equal(f.target.switched,true);assert.equal(f.sim.events.filter(event=>event.action==='ai-world-action').length,1);
});

test('player interaction priority pauses NPC operation and the player can stop it cleanly',()=>{
 const f=fixture({targetX:1.8});f.request({action:'switch'});notePlayerAIWorldInteraction(f.target,f.player,f.now);
 f.tick(8);assert.equal(f.npc.aiTask.stage,'waiting');assert.equal(f.target.switched,undefined);
 f.request({operation:'stop'});f.tick(20);assert.equal(f.npc.aiTask.status,'cancelled');assert.equal(f.target.switched,undefined);
 f.request({action:'switch'});f.tick(8);assert.equal(f.target.switched,true);
});

test('another visitor cannot cancel an explicitly requested action',()=>{
 const f=fixture({targetX:1.8});f.request({action:'switch'});
 const visitor={...f.player,actorId:'other',position:{x:-3,y:0,z:-3}};
 assert.throws(()=>requestAIWorldAction(f.sim,visitor,f.npc,{operation:'stop'},f.now,f.context),/another player/);
 assert.equal(f.npc.aiTask.status,'active');assert.equal(f.target.aiWorldOperator.npcId,f.npc.id);
});

test('a fresh owner can stop their own work remotely on this map without gaining remote start or public-stop access',()=>{
 const f=fixture({targetX:1.8});f.request({action:'switch'});f.player.position={x:-40,y:0,z:30};
 f.request({operation:'stop'});assert.equal(f.npc.aiTask.status,'cancelled');assert.equal(f.target.aiWorldOperator,undefined);assert.equal(f.target.switched,undefined);
 assert.throws(()=>f.request({action:'switch'}),/Move closer/);
 const other=fixture({targetX:1.8});other.request({action:'switch'});other.player.position={x:-40,y:0,z:30};other.npc.aiTask.worldId='another-map';
 assert.throws(()=>other.request({operation:'stop'}),/another map/);assert.equal(other.npc.aiTask.status,'active');
 const ambient=fixture({targetX:1.8});ambient.request({action:'switch'});ambient.npc.aiTask.ownerId=null;ambient.npc.aiTask.autonomous=true;ambient.player.position={x:-40,y:0,z:30};
 assert.throws(()=>ambient.request({operation:'stop'}),/Move closer/);assert.equal(ambient.npc.aiTask.status,'active');
 const stale=fixture({targetX:1.8});stale.request({action:'switch'});stale.player.position={x:-40,y:0,z:30};stale.player.lastSeen=stale.now-16000;
 assert.throws(()=>stale.request({operation:'stop'}),/Join the live map/);assert.equal(stale.npc.aiTask.status,'active');
});

test('NPC yields to a player at a target and does not interrupt an active player quest',()=>{
 const f=fixture({targetX:1.8});f.request({action:'switch'});f.player.position={x:2,y:0,z:1};f.player.vehicleMission={status:'active'};
 f.tick(12);assert.equal(f.npc.aiTask.stage,'waiting');assert.equal(f.target.switched,undefined);
 f.player.position={x:-4,y:0,z:-3};f.tick(8);assert.equal(f.target.switched,true);
});

test('blocked floors, edited or removed targets and disconnected requesters cannot complete a fake action',()=>{
 const blocked=fixture();blocked.context.collision.resolve=(environment,from)=>from;
 assert.throws(()=>blocked.request({action:'switch'}),/cannot reach/);assert.equal(blocked.npc.aiTask,undefined);
 for(const change of ['move','remove','disconnect']){
  const f=fixture();f.request({action:'switch'});
  if(change==='move')f.target.position.x+=4;
  if(change==='remove')f.target.active=false;
  if(change==='disconnect')f.player.replacedByRoom=true;
  f.tick();assert.equal(f.npc.aiTask.status,'cancelled',change);assert.equal(f.target.switched,undefined);
 }
});

test('door, sign, recovery and inspection use exact live object semantics',()=>{
 const f=fixture({targetX:1.8,behavior:'door'});f.request({action:'door'});f.tick(8);assert.equal(f.target.open,true);
 const read=fixture({targetX:1.8,behavior:'talk'});read.request({action:'talk'});read.tick(8);assert.match(read.npc.resident.speech,/public garden path/);
 const heal=fixture({targetX:1.8,behavior:'heal'});heal.request({action:'heal'});heal.tick(8);assert.equal(heal.npc.health,75);assert.equal(heal.player.health,100);
 const inspect=fixture({targetX:1.8});inspect.request({action:'inspect'});inspect.tick(8);assert.equal(inspect.target.switched,undefined);assert.ok(inspect.target.aiLastUsedAt);
 assert.throws(()=>applyWorldObjectAction(f.target,'switch',{actor:f.npc,now:f.now}),/does not support/);
});

test('natural open, close, turn-on and turn-off requests preserve the requested state',()=>{
 const door=fixture({targetX:1.8,behavior:'door'});door.target.open=true;
 door.request({action:'door',text:'Please open the door.'});door.tick(8);assert.equal(door.target.open,true,'already open stays open');
 door.request({action:'door',text:'Please close the door.'});door.tick(8);assert.equal(door.target.open,false);
 const control=fixture({targetX:1.8});control.target.switched=true;
 control.request({action:'switch',text:'Turn the beacon on.'});control.tick(8);assert.equal(control.target.switched,true,'already enabled stays enabled');
 control.request({action:'switch',text:'Turn the beacon off.'});control.tick(8);assert.equal(control.target.switched,false);
});

test('walking plans a clear detour around a resident instead of clipping or waiting forever',()=>{
 const f=fixture({targetX:8});
 const other={...structuredClone(f.npc),id:'bystander',position:{x:3,y:0,z:0}};f.sim.actors[other.id]=other;
 f.request({action:'switch'});assert.ok(f.npc.aiTask.via,'a nearby body requires a detour');
 for(let i=0;i<60&&f.npc.aiTask.status==='active';i++){f.tick();assert.ok(Math.hypot(f.npc.position.x-other.position.x,f.npc.position.z-other.position.z)>=.8);}
 assert.equal(f.npc.aiTask.status,'completed');assert.equal(f.target.switched,true);
});

test('generic residents autonomously vary actual nearby actions without taking over specialist staff',()=>{
 const f=fixture({targetX:1.8});f.npc.resident.nextWorldActionAt=f.now;
 f.tick(12);assert.equal(f.npc.aiTask.status,'completed');assert.equal(f.npc.aiTask.autonomous,true);const first=f.npc.aiTask.kind;
 f.npc.resident.nextWorldActionAt=f.now;f.npc.resident.speaking=false;f.tick(12);assert.equal(f.npc.aiTask.status,'completed');assert.notEqual(f.npc.aiTask.kind,first);
 for(const kind of ['factory','fitness','casino']){
  const specialist=fixture({targetX:1.8});specialist.npc.resident[kind]=true;specialist.npc.resident.nextWorldActionAt=specialist.now;specialist.tick(12);assert.equal(specialist.npc.aiTask,undefined,kind);
 }
});

test('quest contacts can demonstrate world objects without creating an unrelated resident identity',()=>{
 const f=fixture({targetX:1.8});delete f.npc.resident;f.npc.questContact=true;
 f.request({id:'world:switch:beacon'});f.tick(8);assert.equal(f.npc.aiTask.status,'completed');assert.equal(f.target.switched,true);assert.equal(f.npc.resident,undefined);
});

test('local helpers reserve one control at a time and stopping releases the reservation',()=>{
 const f=fixture({targetX:1.8}),other={...structuredClone(f.npc),id:'second-guide',position:{x:1,y:0,z:-1}};f.sim.actors[other.id]=other;
 f.request({action:'switch'});
 assert.equal(f.target.aiWorldOperator.npcId,f.npc.id);
 assert.throws(()=>requestAIWorldAction(f.sim,f.player,other,{action:'switch',targetId:'beacon'},f.now,f.context),/No matching/);
 f.request({operation:'stop'});assert.equal(f.target.aiWorldOperator,undefined);
 requestAIWorldAction(f.sim,f.player,other,{action:'switch',targetId:'beacon'},f.now,f.context);
 assert.equal(f.target.aiWorldOperator.npcId,other.id);
});

test('real compiled lever and authoritative collision produce live server action state',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'ai-world-actions-'));t.after(()=>rm(directory,{recursive:true,force:true}));let now=100000;
 const world={id:'real-ai-garden',name:'AI Garden',spawn:{x:-10,y:0,z:0},builderScene:{layout:'grand-floor',mapSize:64,objects:[{id:'real-beacon',modelId:'lever-switch',name:'Actual garden beacon',position:{x:6,y:0,z:0},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},functionalSettings:{behavior:'switch',interactionDistance:3,cooldown:.5}}]}};
 const store=new SharedRoomStore(join(directory,'rooms.json')),rooms=new AuthoritativeRooms({store,now:()=>now});
 await rooms.command(world.id,world,{accountId:'alice',username:'Alice',stats:{health:100}},{action:'join',requestId:'ai-live-join',deferRadTox:true,radToxEnabled:false});
 await store.update(world.id,room=>{
  const sim=room.simulation,player=sim.players['account:alice'];player.position={x:-10,y:0,z:0};
  // Use a quest contact so ordinary ambient routines cannot relocate this
  // specifically requested demonstrator during the physical test.
  const start=[{x:-4,y:0,z:0},{x:-4,y:0,z:-2},{x:-4,y:0,z:2}].map(point=>rooms.collision.groundAt(world,point,{actors:sim.actors,objects:room.objects})).find(point=>point&&rooms.collision.hasBodyClearance(world,point,.4,{actors:sim.actors,objects:room.objects})&&Object.values(sim.actors).every(actor=>!actor.resident||Math.hypot(actor.position.x-point.x,actor.position.z-point.z)>1.2));
  assert.ok(start,'the modeled helper needs an actual unoccupied public start');
  const npc=sim.actors['garden-helper']={id:'garden-helper',name:'Garden helper',modelId:'scout-avatar',asset:{buildAssetId:'scout-avatar'},definition:{objectId:'garden-helper',modelId:'scout-avatar',gameplay:{behavior:'talk'}},questContact:true,health:100,active:true,position:{...start},rotation:{x:0,y:0,z:0}},context={environment:world,collision:rooms.collision,objects:room.objects};
  requestAIWorldAction(sim,player,npc,{action:'switch',targetId:'real-beacon'},now,context);
  for(let index=0;index<60&&npc.aiTask.status==='active';index++){now+=250;player.lastSeen=now;stepAIWorldActions(sim,world,now,.25,context);}
  assert.equal(npc.aiTask.status,'completed',npc.aiTask.message);assert.equal(sim.actors['real-beacon'].switched,true);
  assert.ok(npc.position.x>1,'the helper actually walked toward the lever');assert.equal(player.score,0);assert.equal(player.inventory.length,0);
 });
 const snapshot=await rooms.snapshot(world.id,world);
 assert.equal(snapshot.actors['real-beacon'].switched,true);assert.equal(snapshot.actors['garden-helper'].aiTask.status,'completed');assert.ok(snapshot.events.some(event=>event.action==='ai-world-action'));
});
