import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureResidentIntelligence,stepResidentLife,observeResidentInteraction} from '../server-resident-life.mjs';

const environment={id:'garden-social',name:'Community Garden',builderScene:{layout:'grand-floor',mapSize:80,layoutMeta:{locations:[{id:'welcome',name:'Garden welcome',x:0,y:0,z:0},{id:'lookout',name:'Nature lookout',x:10,y:0,z:4}]}}};
const collision={groundAt:(_env,point)=>({...point}),hasBodyClearance:()=>true,resolve:(_env,_from,to)=>({...to})};
function fixture(count=1,collider=collision){
 const sim={actors:{},players:{},events:[]};
 for(let i=0;i<count;i++){
  const npc={id:'social-'+i,active:true,health:100,position:{x:0,y:0,z:i*3},rotation:{x:0,y:0,z:0},resident:{name:i?'Leo Reed':'Amira Vale',home:{x:0,y:0,z:i*3},locationIndex:0,speech:'',speechUntil:0}};
  sim.actors[npc.id]=npc;ensureResidentIntelligence(sim,npc,environment,100000);
  Object.assign(npc.resident,{nextObjectiveAt:1e9,nextSocialAt:1e9,nextAmbientAt:1e9,nextThinkAt:1e9,goal:null,needs:{energy:90,social:50,purpose:80,curiosity:80}});
 }
 return {sim,collider,npc:sim.actors['social-0']};
}
function visitor(f,extra={}){return f.sim.players.alice={actorId:'alice',username:'Alice',health:100,lastSeen:100000,position:{x:8,y:0,z:0},...extra};}
function tick(f,count,start=100000){for(let i=1;i<=count;i++){const now=start+i*250;for(const player of Object.values(f.sim.players))player.lastSeen=now;stepResidentLife(f.sim,environment,now,.25,{collision:f.collider});}return start+count*250;}

test('one resident walks up without crowding and gives an addressed, actionable invitation',()=>{
 const f=fixture(2),player=visitor(f),start={...f.npc.position};
 tick(f,40);
 const speakers=Object.values(f.sim.actors).filter(npc=>npc.resident.interaction?.kind==='visitor-greeting');
 assert.equal(speakers.length,1,'only one resident approaches a visitor at a time');
 const greeter=speakers[0];assert.ok(Math.hypot(greeter.position.x-start.x,greeter.position.z-start.z)>3);
 const gap=Math.hypot(greeter.position.x-player.position.x,greeter.position.z-player.position.z);
 assert.ok(gap>2&&gap<3.2,'the greeting leaves personal space');
 assert.equal(greeter.resident.interaction.playerId,'alice');assert.deepEqual(greeter.resident.speechRecipients,['alice']);
 assert.equal(player.residentNearby.id,greeter.id);assert.ok(player.residentNearby.expiresAt>player.residentNearby.at);
 assert.equal(player.residentInvitation.status,'offered');assert.equal(player.residentInvitation.residentId,greeter.id);
 assert.equal(player.residentInvitation.worldId,environment.id);assert.ok(Number.isFinite(player.residentInvitation.destination.x));
 assert.equal(player.residentApproach,undefined);
});

test('walls, different floors and occupied vehicles prevent remote greetings and walk-through approaches',()=>{
 const wall={...collision,resolve:(_env,from,to)=>from.x<=4&&to.x>4?{...from}:{...to}};
 for(const [collider,position,vehicleId]of [[wall,{x:8,y:0,z:0},null],[collision,{x:8,y:4,z:0},null],[collision,{x:8,y:0,z:0},'car']]){
  const f=fixture(1,collider),player=visitor(f,{position,vehicleId});tick(f,60);
  assert.equal(player.residentNearby,undefined);assert.equal(player.residentInvitation,undefined);
  assert.ok(f.npc.position.x<=4,'the resident remains on its side of the wall');
 }
});

test('moving or departing visitors release their approach slot and declined invitations stay declined',()=>{
 const f=fixture(),player=visitor(f);tick(f,1);assert.equal(player.residentApproach.residentId,f.npc.id);
 player.position.x=30;tick(f,1,100250);assert.equal(f.npc.resident.visitorApproach,undefined);assert.equal(player.residentApproach,undefined);
 const g=fixture(),declined=visitor(g,{position:{x:2,y:0,z:0},residentInviteCooldownUntil:200000});tick(g,1);
 assert.ok(declined.residentNearby,'a polite hello is still available');assert.equal(declined.residentInvitation,undefined,'Not now is respected');
});

test('NPC conversations share completed autonomous experience without repeating private player chat',()=>{
 const f=fixture(2),[a,b]=Object.values(f.sim.actors);
 a.resident.memory.push({kind:'practice',text:'Practised watching the garden. I spotted a new flower.',at:99000},{kind:'player-conversation',text:'PRIVATE SECRET',at:99999});
 a.resident.nextSocialAt=0;b.resident.nextSocialAt=0;a.resident.pauseUntil=b.resident.pauseUntil=0;
 tick(f,45);
 const c=f.sim.residentLife.conversations.find(conversation=>conversation.status==='complete');
 assert.ok(c);assert.match(c.lines[0].text,/spotted a new flower/);assert.doesNotMatch(c.lines.map(line=>line.text).join(' '),/PRIVATE SECRET/);
 assert.ok(b.resident.memory.some(memory=>memory.kind==='shared-experience'&&memory.subjectId===a.id&&memory.text.includes('new flower')));
 assert.equal(new Set(c.lines.map(line=>line.speakerId)).size,2);
});

test('a player conversation interrupts autonomous chatter and releases both residents',()=>{
 const f=fixture(2),[a,b]=Object.values(f.sim.actors);a.resident.nextSocialAt=0;b.resident.nextSocialAt=0;tick(f,1);
 const c=f.sim.residentLife.conversations.find(conversation=>conversation.status==='active');assert.ok(c);
 observeResidentInteraction(f.sim,a.id,{kind:'player-conversation',actorId:'alice',text:'Can you help me?',requestId:'player-talk'},100500);
 assert.equal(c.status,'interrupted');assert.equal(a.resident.conversationId,undefined);assert.equal(b.resident.conversationId,undefined);
 assert.ok(a.resident.pauseUntil>=105500);
});

test('NPCs cannot chat through a wall despite being nearby on the same floor',()=>{
 const f=fixture(2,{...collision,resolve:(_env,from,to)=>Math.sign(from.z-1.5)!==Math.sign(to.z-1.5)?{...from}:{...to}});
 for(const npc of Object.values(f.sim.actors))npc.resident.nextSocialAt=0;
 tick(f,45);assert.equal(f.sim.residentLife.stats.conversations,0);
 assert.equal(f.sim.residentLife.conversations.length,0);
});
