import test from 'node:test';
import assert from 'node:assert/strict';
import {stepWorldResidents,residentCommand} from '../server-world-residents.mjs';
import {residentDialogueIntent} from '../server-resident-dialogue.mjs';
import {residentActivityInvitation} from '../server-resident-invitations.mjs';

const collision={groundAt:(_environment,point)=>({...point,y:0}),hasBodyClearance:()=>true,resolve:(_environment,_from,to)=>({...to})};
function fixture(){
 const environment={id:'resident-visit-world',name:'Community garden',builderScene:{mapSize:100,objects:[],layoutMeta:{locations:[
  {id:'welcome',name:'Welcome garden',x:0,y:0,z:0},
  {id:'music',name:'Music rehearsal stage',x:20,y:0,z:0},
  {id:'workshop',name:'Creative workshop',x:0,y:0,z:20}
 ]}}};
 let now=100000;
 const sim={actors:{},players:{},events:[]};
 stepWorldResidents(sim,environment,now,.1,{collision});
 const npc=Object.values(sim.actors).find(actor=>actor.resident);
 const player=sim.players.alice={actorId:'alice',username:'Alice',position:{...npc.position},lastSeen:now,health:100,grounded:true,movementRevision:0,score:5,tokens:{MZK:900}};
 const advance=(ms=1200)=>{now+=ms;player.lastSeen=now;return now;};
 return {sim,environment,npc,player,advance,get now(){return now;},say(choice,text){return residentCommand(sim,player,environment,{entityId:npc.id,choice,text},advance(),{collision});},step(){stepWorldResidents(sim,environment,advance(),.25,{collision});}};
}

test('activity invitations require explicit consent, offer alternatives, and respect a decline',()=>{
 const f=fixture();f.say('question','What can we do together?');
 const offer=f.player.residentInvitation;
 assert.equal(offer.status,'offered');assert.equal(f.player.residentVisit,undefined);
 assert.equal(f.player.npcConversation.residentContext.invitation.id,offer.id);
 const originalPosition={...f.player.position};
 f.say('resident-other');assert.notEqual(f.player.residentInvitation.locationId,offer.locationId);
 f.player.position={x:50,y:0,z:50};
 f.say('resident-decline');assert.equal(f.player.residentInvitation.status,'declined');
 assert.ok(f.player.residentInviteCooldownUntil>f.now);
 assert.throws(()=>f.say('resident-join'),/fresh activity suggestion|Move closer/);
 assert.deepEqual(originalPosition,f.npc.position);
 assert.deepEqual(f.player.position,{x:50,y:0,z:50},'declining never teleports or takes over controls');
});

test('joining marks a reward-free visit; actual arrival completes it once and becomes resident experience',()=>{
 const f=fixture();f.say('resident-invite');f.say('resident-join');
 const visit=f.player.residentVisit,position={...f.player.position},wallet=structuredClone(f.player.tokens);
 assert.equal(visit.status,'active');assert.equal(f.player.npcConversation.residentContext.visit.id,visit.id);
 assert.equal(f.player.residentInvitation.status,'joined');assert.deepEqual(f.player.position,position);
 f.say('resident-join');assert.equal(f.player.residentVisit,visit,'duplicate join keeps the active visit');
 const point=visit.checkpoints[0];
 f.player.position={x:point.x+10,y:point.y,z:point.z};
 assert.throws(()=>f.say('resident-visit-confirm'),/marked public activity point/);
 f.player.position={x:point.x,y:point.y+4,z:point.z};
 assert.throws(()=>f.say('resident-visit-confirm'),/same floor/);
 f.player.position={x:point.x,y:point.y,z:point.z};f.player.vehicleId='car';
 assert.throws(()=>f.say('resident-visit-confirm'),/stop safely/);
 delete f.player.vehicleId;f.player.grounded=false;
 assert.throws(()=>f.say('resident-visit-confirm'),/stop safely/);
 f.player.grounded=true;f.say('resident-visit-confirm');
 assert.equal(visit.status,'completed');assert.equal(f.player.residentInvitation.status,'completed');
 assert.equal(f.player.score,5);assert.deepEqual(f.player.tokens,wallet);
 assert.ok(f.npc.resident.memory.some(item=>item.kind==='activity-complete'&&item.text.includes('Alice explored')));
 assert.throws(()=>f.say('resident-visit-confirm'),/Join a suggested activity|Move closer/);
});

test('travel, deadlines and removed map locations clear accepted visits',()=>{
 for(const change of ['travel','deadline','removed','moved']){
  const f=fixture();f.say('resident-invite');f.say('resident-join');const visit=f.player.residentVisit;
  if(change==='travel')f.player.movementRevision++;
  if(change==='deadline')f.advance(600001);
  if(change==='removed')f.environment.builderScene.layoutMeta.locations=f.environment.builderScene.layoutMeta.locations.filter(place=>place.id!==visit.locationId);
  if(change==='moved')f.environment.builderScene.layoutMeta.locations.find(place=>place.id===visit.locationId).x+=15;
  f.step();assert.equal(visit.status,change==='deadline'?'expired':'cancelled',change);
 }
});

test('suggestions skip blocked, private, foreign-map and placeholder destinations',()=>{
 const f=fixture(),source=f.environment.builderScene.layoutMeta.locations;
 f.environment.builderScene.layoutMeta.locations=[
  {id:'secret',name:'Private studio',x:0,z:0,visibility:'private'},
  {id:'foreign',name:'Another world',x:1,z:0,mapId:'foreign-map'},
  {id:'blocked',name:'Blocked stage',x:3,z:0},
  source[2]
 ];
 const offer=residentActivityInvitation(f.environment,f.npc,f.player,f.now,{resolveDestination:place=>place.id==='blocked'?null:{x:place.x,y:0,z:place.z}});
 assert.equal(offer.locationId,'workshop');
 f.environment.builderScene.layoutMeta.locations=[];
 assert.equal(residentActivityInvitation(f.environment,f.npc,f.player,f.now),null);
});

test('experience replies describe completed resident work without exposing private visitor text',()=>{
 const f=fixture();
 f.npc.resident.memory.push({kind:'practice',text:'I learned to keep a steady rehearsal rhythm.',at:f.now-1},{kind:'player-conversation',subjectId:'bob',text:'BOB PRIVATE MESSAGE',at:f.now});
 f.say('question','Share a recent experience');
 const reply=f.player.npcConversation.conversation.at(-1).text;
 assert.match(reply,/steady rehearsal rhythm/);assert.doesNotMatch(reply,/BOB PRIVATE MESSAGE/);
 assert.equal(residentDialogueIntent('question','I would like to join you'),'join');
 assert.equal(residentDialogueIntent('question','Suggest a different activity'),'other');
 assert.equal(residentDialogueIntent('question','No thanks, maybe later'),'decline');
});
