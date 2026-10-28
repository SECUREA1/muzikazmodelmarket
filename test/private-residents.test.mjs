import test from 'node:test';
import assert from 'node:assert/strict';
import {PrivateResidentRooms} from '../server-private-residents.mjs';

const environment={id:'private-resident-test',spawn:{x:0,y:0,z:0},builderScene:{mapSize:100,objects:[],layoutMeta:{locations:[{id:'lounge',name:'Community music lounge',x:0,z:0},{id:'garden',name:'Community garden',x:18,z:0},{id:'supplies',name:'Supply store',x:0,z:18}]}}};
const collision={
 groundAt:(_environment,position)=>({...position,y:0}),
 hasBodyClearance:()=>true,
 resolve:(_environment,_from,to)=>to,
 withActorCandidates:(_actors,run)=>run()
};
const alice={accountId:'alice',username:'Alice'},bob={accountId:'bob',username:'Bob'};
function fixture(options={}){
 let now=100000;
 const runtime=new PrivateResidentRooms({now:()=>now,collision,...options});
 return {runtime,advance:milliseconds=>now+=milliseconds,send:(identity,action='join',fields={},map=environment)=>runtime.command(map,identity,{action,position:{x:0,y:0,z:0},...fields})};
}

test('private resident sessions require identity, a supported action and a bounded finite pose',()=>{
 const {runtime,send}=fixture();
 assert.throws(()=>send(null),error=>error.statusCode===401);
 assert.throws(()=>send(alice,'spawn'),/conversation action/);
 for(const position of [null,{x:0,z:0},{x:NaN,y:0,z:0},{x:Infinity,y:0,z:0},{x:100001,y:0,z:0}])assert.throws(()=>send(alice,'join',{position}),/valid local player position/);
 assert.equal(runtime.rooms.size,0);
});

test('solo residents and conversations remain private to an account and map',()=>{
 const {runtime,send,advance}=fixture();
 const first=send(alice),second=send(bob);
 assert.equal(first.private,true);assert.equal(first.authoritative,false);
 assert.equal(first.selfId,'solo:alice');assert.deepEqual(Object.keys(first.players),['solo:alice']);
 assert.deepEqual(Object.keys(second.players),['solo:bob']);
 const npc=Object.values(first.actors).find(actor=>actor.resident);
 assert.ok(npc?.resident.personality);
 advance(1200);
 const reply=send(alice,'npc-social',{position:{...npc.position},entityId:npc.id,choice:'question',text:'Where am I?'});
 const conversation=reply.players['solo:alice'].npcConversation;
 assert.equal(conversation.entityId,npc.id);
 assert.match(conversation.conversation.at(-1).text,/Community music lounge/);
 assert.ok(conversation.conversation.every(line=>line.recipients.includes('solo:alice')));
 const other=send(bob,'input');
 assert.ok(!other.players['solo:bob'].npcConversation);
 assert.equal(other.transportRadio.length,0);
 // Even an explicit foreign account/self ID in the request cannot select it.
 const forged=send(bob,'input',{accountId:'alice',selfId:'solo:alice'});
 assert.equal(forged.selfId,'solo:bob');assert.ok(!forged.players['solo:alice']);
 const separateMap=send(alice,'join',{}, {...environment,id:'another-private-map'});
 assert.ok(!separateMap.players['solo:alice'].npcConversation);
 assert.equal(runtime.rooms.size,3);
 // Returned snapshots are detached; a client cannot mutate the simulation.
 first.actors[npc.id].position.x=9999;
 assert.notEqual(send(alice,'input').actors[npc.id].position.x,9999);
});

test('active solo residents move and run social work without moving the local player',()=>{
 const {runtime,send,advance}=fixture();
 const start=send(alice),positions=Object.fromEntries(Object.entries(start.actors).map(([id,actor])=>[id,{...actor.position}]));
 const playerPosition={x:-7,y:0,z:-9};
 for(let step=0;step<360;step++){
  advance(200);runtime.tickActive();
  if(step%10===0)send(alice,'input',{position:playerPosition});
 }
 const state=send(alice,'input',{position:playerPosition}),residents=Object.values(state.actors).filter(actor=>actor.resident);
 assert.ok(residents.some(actor=>Math.hypot(actor.position.x-positions[actor.id].x,actor.position.z-positions[actor.id].z)>1),'AI residents should walk between work and social destinations');
 assert.ok(residents.some(actor=>actor.resident.speechUntil>0),'AI residents should participate in actual conversations');
 assert.ok(residents.every(actor=>actor.position.y===0),'Residents must stay on the navigable floor');
 assert.deepEqual(state.players[state.selfId].position,playerPosition,'NPC simulation must not reconcile or teleport the local player');
 assert.ok(state.residentLife);
});

test('private dialogue still requires proximity and cannot create public objects or rewards',()=>{
 const {send,advance}=fixture();
 const state=send(alice),npc=Object.values(state.actors).find(actor=>actor.resident);
 advance(1200);
 assert.throws(()=>send(alice,'npc-social',{position:{x:90,y:0,z:90},entityId:npc.id,choice:'day'}),/closer/);
 const reply=send(alice,'npc-social',{position:{...npc.position},entityId:npc.id,choice:'day'});
 assert.equal(reply.players[reply.selfId].score,0);
 assert.deepEqual(reply.objects,{});assert.deepEqual(reply.events,[]);
 assert.throws(()=>send(alice,'npc-social',{entityId:'foreign-resident',choice:'day'}),/no longer/);
});

test('private rooms have bounded lifetime, capacity and explicit cleanup',()=>{
 const {runtime,send,advance}=fixture({capacity:2,idleMs:1000});
 send(alice);send(bob);assert.equal(runtime.rooms.size,2);
 send({accountId:'third'});assert.equal(runtime.rooms.size,2);
 assert.ok(![...runtime.rooms.keys()].some(key=>key.includes('alice')));
 assert.deepEqual(send(bob,'leave',{position:undefined}),{private:true,closed:true});
 assert.equal(runtime.rooms.size,1);
 advance(1001);runtime.tickActive();assert.equal(runtime.rooms.size,0);
});

test('an idle room restarts with unique dialogue IDs and ignores stale leave requests',()=>{
 const {runtime,send,advance}=fixture({idleMs:1000});
 const original=send(alice),npc=Object.values(original.actors).find(actor=>actor.resident);
 const firstReply=send(alice,'npc-social',{position:{...npc.position},entityId:npc.id,choice:'day'});
 assert.ok(firstReply.transportRadio.every(call=>String(call.id).startsWith(original.sessionId+':')));
 advance(1001);
 const restarted=send(alice,'input');assert.notEqual(restarted.sessionId,original.sessionId);
 assert.ok(!restarted.players[restarted.selfId].npcConversation);
 send(alice,'leave',{sessionId:original.sessionId});assert.equal(runtime.rooms.size,1);
 assert.equal(send(alice,'input').sessionId,restarted.sessionId);
 const secondReply=send(alice,'npc-social',{position:{...npc.position},entityId:npc.id,choice:'day'});
 assert.ok(secondReply.transportRadio.every(call=>String(call.id).startsWith(restarted.sessionId+':')));
 assert.notEqual(secondReply.transportRadio[0].id,firstReply.transportRadio[0].id);
});
