import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PrivateResidentRooms} from '../server-private-residents.mjs';

test('Main Floor residents keep walking and working after a nearby solo player conversation',async()=>{
 const catalogue=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url),'utf8'));
 const environment=catalogue.find(world=>world.id==='muzikaz-main');
 let now=100000;
 const runtime=new PrivateResidentRooms({now:()=>now}),identity={accountId:'alice',username:'Alice'};
 let position={...environment.spawn};
 const send=(action='input',fields={})=>runtime.command(environment,identity,{action,position,...fields});
 const initial=send('join'),resident=Object.values(initial.actors).find(actor=>actor.resident);
 assert.ok(resident,'the real map has a conversational resident at join');
 // Local players can stop inside a resident while opening the conversation.
 // Keep the visitor there, so resuming depends on safely leaving the overlap.
 position={...resident.position};
 now+=1200;
 const reply=send('npc-social',{entityId:resident.id,choice:'day'});
 assert.equal(reply.players[reply.selfId].npcConversation.entityId,resident.id);
 assert.deepEqual(reply.actors[resident.id].resident.speechRecipients,[reply.selfId]);
 let maxDistance=0;
 const phases=new Set();
 let state=reply;
 for(let step=0;step<900;step++){
  now+=200;runtime.tickActive();
  if(step%10===0){
   state=send();
   const npc=state.actors[resident.id];
   maxDistance=Math.max(maxDistance,Math.hypot(npc.position.x-position.x,npc.position.z-position.z));
   phases.add(npc.resident.phase);
  }
 }
 state=send();
 const npc=state.actors[resident.id];
 assert.ok(maxDistance>1,'the resident walks away after the reply instead of staying pinned by the visitor');
 assert.ok(phases.has('walking')&&phases.has('working')&&phases.has('practising'),'real routines continue throughout the active session');
 assert.ok(npc.resident.workCompleted>0&&npc.resident.practicesCompleted>0,'the resident completes its own work and practice after the chat');
 assert.ok(state.residentLife.stats.communityTasks>0,'the cast also completes cooperative work');
 assert.ok(Object.values(state.actors).every(actor=>!actor.resident.activitySuspended));
 assert.deepEqual(state.players[state.selfId].position,position,'AI movement never moves the solo visitor');
 // A later conversation still dispatches through the real private command.
 position={...npc.position};now+=1000;
 const again=send('npc-social',{entityId:npc.id,choice:'question',text:'What are you working on now?'});
 const lines=again.players[again.selfId].npcConversation.conversation;
 assert.equal(lines.at(-1).speakerId,npc.id);
 assert.equal(lines.at(-1).at,now);
 assert.deepEqual(lines.at(-1).recipients,[again.selfId]);
});
