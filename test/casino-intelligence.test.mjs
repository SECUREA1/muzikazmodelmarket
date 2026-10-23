import test from 'node:test';
import assert from 'node:assert/strict';
import {casinoWorld} from '../casino-world.mjs';
import {CASINO_RESIDENTS} from '../public/js/casino-config.js';
import {CASINO_PERSONALITIES,casinoPersonality,casinoGoalUtilities,casinoPracticeDice,casinoPracticeReels} from '../public/js/casino-personalities.js';
import {stepCasinoResidents,casinoLifeView,observeCasinoInteraction,reserveCasinoStation,releaseCasinoReservation,requestCasinoService} from '../server-casino-residents.mjs';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
const world=casinoWorld(),floor={groundAt:(_world,point)=>({...point,y:.02}),resolve:(_world,_previous,next)=>({...next,y:.02})};
function setup(collision=floor){const sim={actors:{},players:{},events:[]};stepCasinoResidents(sim,world,100000,0,{collision});return sim;}
function advance(sim,from,steps,collision=floor,dt=.25){for(let i=1;i<=steps;i++)stepCasinoResidents(sim,world,from+i*250,dt,{collision});return from+steps*250;}
const npc=(sim,suffix)=>sim.actors['casino-resident-'+suffix];

test('all twenty-two existing identities migrate to distinct personalities, needs and bounded skills without losing progress',()=>{
 const sim=setup(),cast=Object.values(sim.actors);assert.equal(cast.length,22);assert.equal(new Set(Object.values(CASINO_PERSONALITIES).map(p=>p.backstory)).size,22);assert.equal(cast.filter(a=>a.resident.duty==='guard').length,2);
 for(const actor of cast){assert.equal(actor.resident.personality,casinoPersonality(actor.id).temperament);assert.ok(actor.resident.appearance.hairstyle);assert.ok(Object.values(actor.resident.skills).every(value=>value>=0&&value<=100));}
 const old=npc(sim,'guest-1'),identity=old.id;old.resident.skills.poker=66;old.resident.memory=[{kind:'conversation',subjectId:'old-friend',text:'A familiar face.',at:50000}];delete old.resident.intelligenceVersion;delete old.resident.needs;old.resident.goal={x:-7,z:2};stepCasinoResidents(sim,world,100250,.25,{collision:floor});assert.equal(Object.keys(sim.actors).length,22);assert.equal(old.id,identity);assert.equal(old.resident.skills.poker,66);assert.ok(old.resident.memory.some(item=>item.text==='A familiar face.'));assert.ok(old.resident.needs.energy>0);assert.ok(old.resident.goal.kind);
});

test('utility decisions respond to depleted needs instead of replaying a fixed route',()=>{
 const info=npc(setup(),'guest-1').resident;
 const choose=needs=>casinoGoalUtilities({...info,needs})[0].kind;
 assert.equal(choose({energy:5,social:90,fun:90,comfort:90}),'rest');assert.equal(choose({energy:95,social:95,fun:95,comfort:0}),'refreshment');assert.equal(choose({energy:95,social:0,fun:95,comfort:95}),'social');assert.equal(choose({energy:95,social:95,fun:0,comfort:95}),'play');
});

test('deterministic practice draws allow every dice total and matching slot triples without correlated suffixes',()=>{
 const totals=new Set();let triples=0;for(let round=1;round<=1500;round++){const seed='casino-practice:'+round,dice=casinoPracticeDice(seed),reels=casinoPracticeReels(seed);assert.deepEqual(casinoPracticeDice(seed),dice);totals.add(dice[0]+dice[1]);if(new Set(reels).size===1)triples++;}
 assert.deepEqual([...totals].sort((a,b)=>a-b),[2,3,4,5,6,7,8,9,10,11,12]);assert.ok(triples>0);
});

test('station reservations are exclusive, idempotent and FIFO even when a later guest retries first',()=>{
 const sim=setup(),ids=['guest-1','guest-2','guest-3'].map(suffix=>npc(sim,suffix).id),station='casino-slot-1';
 for(const id of ids)for(const key of Object.keys(sim.casinoLife.reservations))releaseCasinoReservation(sim,key,id);
 const first=reserveCasinoStation(sim,station,ids[0],101000);assert.equal(first.seat,0);assert.equal(reserveCasinoStation(sim,station,ids[1],101010),null);assert.equal(reserveCasinoStation(sim,station,ids[2],101020),null);
 releaseCasinoReservation(sim,station,ids[0]);assert.equal(reserveCasinoStation(sim,station,ids[2],101030),null,'later retries cannot jump the queue');assert.ok(reserveCasinoStation(sim,station,ids[1],101040));releaseCasinoReservation(sim,station,ids[1]);assert.ok(reserveCasinoStation(sim,station,ids[2],101050));assert.ok(reserveCasinoStation(sim,station,ids[2],101060));assert.equal(sim.casinoLife.reservations[station].length,1);assert.equal(sim.casinoLife.queues[station].length,0);
});

test('NPC practice has real turns, decisions and results, grows skills once and survives deterministic save/resume',()=>{
 const sim=setup();sim.players.visitor={actorId:'visitor',username:'Visitor',health:100,lastSeen:0,position:{x:0,y:.02,z:32},tokens:{MZK:777},score:3};const original=JSON.stringify(sim.players.visitor.tokens),initial=Object.fromEntries(Object.values(sim.actors).map(actor=>[actor.id,{...actor.resident.skills}]));
 advance(sim,100000,180);const resumed=JSON.parse(JSON.stringify(sim));advance(sim,145000,200);advance(resumed,145000,200);assert.deepEqual(JSON.parse(JSON.stringify(resumed)),JSON.parse(JSON.stringify(sim)),'serialized state reproduces the same later actions');assert.ok(sim.casinoLife.stats.rounds>=8);assert.ok(sim.casinoLife.stats.services>=1);assert.equal(JSON.stringify(sim.players.visitor.tokens),original);assert.equal(sim.players.visitor.score,3);
 const players=Object.values(sim.actors).filter(actor=>actor.resident.gamesPlayed>0);assert.ok(players.some(actor=>actor.resident.skills[actor.resident.gameState.game]>initial[actor.id][actor.resident.gameState.game]));assert.ok(players.every(actor=>actor.resident.gameState.practiceOnly&&actor.resident.gameState.decision));assert.ok(players.some(actor=>actor.resident.gameState.phase==='complete'&&actor.resident.gameState.result));for(const actor of players)assert.equal(new Set(actor.resident.gameState.hand||[]).size,actor.resident.gameState.hand.length);
 const saved=JSON.stringify(sim);for(let i=0;i<20;i++)stepCasinoResidents(sim,world,195000,.25,{collision:floor});assert.equal(JSON.stringify(sim),saved,'replaying one simulation timestamp cannot repeat rounds, services or skill awards');
});

test('AI conversations take turns, remember each other and keep paused active exchanges when history fills',()=>{
 const sim=setup();advance(sim,100000,360);const conversations=sim.casinoLife.conversations.filter(c=>c.lines.length>=2);assert.ok(conversations.length);for(const conversation of conversations){assert.ok(new Set(conversation.lines.map(line=>line.speakerId)).size>=2);for(let i=1;i<conversation.lines.length;i++){assert.notEqual(conversation.lines[i].speakerId,conversation.lines[i-1].speakerId);assert.ok(conversation.lines[i].at-conversation.lines[i-1].at>=3200);}}assert.ok(Object.values(sim.actors).some(actor=>actor.resident.memory.some(item=>item.kind==='conversation')));
 const fresh=setup(),life=fresh.casinoLife,pausedA=npc(fresh,'dealer-poker-1'),pausedB=npc(fresh,'guest-1');life.conversations=[{id:'paused',participants:[pausedA.id,pausedB.id],pair:'paused-pair',topic:'a remembered game',turn:0,status:'active',startedAt:100000,nextAt:100000,lines:[]},...Array.from({length:5},(_,i)=>({id:'closed-'+i,participants:[],pair:'closed-'+i,topic:'earlier chat',turn:3,status:'complete',startedAt:99000,completedAt:100000,lines:[]}))];pausedA.resident.conversationId=pausedB.resident.conversationId='paused';pausedA.resident.speechUntil=300000;
 for(const actor of Object.values(fresh.actors)){actor.resident.nextSocialAt=300000;actor.resident.nextAmbientAt=300000;}
 const a=npc(fresh,'guard-entry'),b=npc(fresh,'welcome');a.position={x:0,y:.02,z:23};b.position={x:1.5,y:.02,z:23};a.resident.nextSocialAt=b.resident.nextSocialAt=100000;a.resident.speechUntil=b.resident.speechUntil=0;stepCasinoResidents(fresh,world,100250,0,{collision:floor});assert.ok(life.conversations.some(c=>c.id==='paused'&&c.status==='active'));assert.ok(life.conversations.some(c=>c.id!=='paused'&&c.status==='active'));assert.ok(life.conversations.length<=6);
 const orphan=npc(fresh,'guest-10');orphan.resident.conversationId='lost-on-old-save';stepCasinoResidents(fresh,world,100500,0,{collision:floor});assert.notEqual(orphan.resident.conversationId,'lost-on-old-save');
});

test('staff fulfil a fair service queue and recover after a missing or distant requester',()=>{
 const sim=setup(),vendor=npc(sim,'vendor'),guests=['guest-1','guest-2','guest-3'].map(id=>npc(sim,id));for(const [index,guest]of guests.entries()){guest.position={x:-24+index*2,y:.02,z:26};guest.resident.nextSocialAt=1000000;guest.resident.nextAmbientAt=1000000;}
 const requests=guests.map((guest,index)=>requestCasinoService(sim,{requesterId:guest.id,staffId:vendor.id,kind:'refreshment',requestId:'order-'+index},101000));assert.equal(requestCasinoService(sim,{requesterId:guests[0].id,staffId:vendor.id,kind:'refreshment',requestId:'order-0'},101001).id,requests[0].id);
 advance(sim,100000,180,floor,0);assert.ok(requests.every(request=>request.status==='complete'));assert.ok(requests[0].completedAt<requests[1].completedAt&&requests[1].completedAt<requests[2].completedAt);assert.ok(guests.every(guest=>guest.resident.servicesReceived>=1));
 const broken=requestCasinoService(sim,{requesterId:guests[0].id,staffId:vendor.id,kind:'receipt',requestId:'cancelled-order'},146000),next=requestCasinoService(sim,{requesterId:guests[1].id,staffId:vendor.id,kind:'receipt',requestId:'next-order'},146001);stepCasinoResidents(sim,world,146250,0,{collision:floor});assert.equal(broken.status,'serving');guests[0].position={x:100,y:.02,z:100};advance(sim,146250,80,floor,0);assert.equal(broken.status,'cancelled');assert.equal(next.status,'complete');assert.notEqual(vendor.resident.currentRequestId,broken.id);
 vendor.resident.currentRequestId='missing-from-persisted-queue';vendor.resident.interaction={kind:'refreshment',phase:'serving'};stepCasinoResidents(sim,world,166500,0,{collision:floor});assert.notEqual(vendor.resident.currentRequestId,'missing-from-persisted-queue');
 const waiting={id:'old-waiting-order',requesterId:guests[0].id,staffId:vendor.id,kind:'refreshment',status:'queued',createdAt:166500,sequence:1};sim.casinoLife.requests=[waiting,...Array.from({length:31},(_,index)=>({id:'history-'+index,status:'complete',sequence:index+2,completedAt:166500}))];requestCasinoService(sim,{requesterId:guests[2].id,staffId:vendor.id,kind:'guidance',requestId:'new-history-order'},167000);assert.ok(sim.casinoLife.requests.includes(waiting),'history trimming retains older active requests');assert.equal(sim.casinoLife.requests.length,32);
});

test('public observation hooks deduplicate learning, bound memory and relationships and reveal no wallet or private planning',()=>{
 const sim=setup(),dealer=npc(sim,'dealer-poker-1');sim.players.alice={actorId:'alice',username:'Alice',position:{x:-20,y:.02,z:-4.3}};const initial=dealer.resident.skills.poker;
 const observation={actorId:'alice',kind:'player-game',text:'Alice completed poker with two pair',game:'poker',result:'two pair',requestId:'round-1',skill:'poker'};observeCasinoInteraction(sim,null,observation,101000);const after=dealer.resident.skills.poker;assert.ok(after>initial);observeCasinoInteraction(sim,null,observation,101500);assert.equal(dealer.resident.skills.poker,after);assert.match(dealer.resident.speech,/Nice round/);
 for(let i=0;i<50;i++)observeCasinoInteraction(sim,dealer.id,{actorId:'visitor-'+i,kind:'conversation',text:'Asked about a game',requestId:'chat-'+i,skill:'social'},102000+i*1000);
 assert.ok(dealer.resident.memory.length<=8);assert.ok(dealer.resident.relationships.length<=8);assert.ok(dealer.resident.observedIds.length<=12);const view=casinoLifeView(sim);assert.equal(view.navigation,undefined);assert.equal(view.requests,undefined);assert.equal(view.players,undefined);assert.equal(casinoLifeView({}),null);assert.ok(JSON.stringify(view).length<20000);
});

test('real casino geometry keeps utility-driven guests and guards grounded, clear of the locked vault and bounded in long simulation',()=>{
 const collision=new ServerBuilderCollision(),sim=setup(collision);advance(sim,100000,480,collision);const cast=Object.values(sim.actors);assert.equal(cast.length,22);assert.equal(cast.filter(actor=>actor.resident.duty==='guard').length,2);assert.ok(sim.casinoLife.stats.rounds>=10);assert.ok(sim.casinoLife.stats.services>=1);assert.ok(sim.casinoLife.stats.conversations>=3);
 for(const actor of cast){assert.ok(Math.abs(actor.position.y-.02)<.02);assert.ok(!(Math.abs(actor.position.x)<7.4&&actor.position.z<-22.5),'never walk into the vault');assert.ok(actor.resident.memory.length<=8);assert.ok(actor.resident.relationships.length<=8);assert.ok((sim.casinoLife.navigation[actor.id]?.path.length||0)<=12);}
 assert.ok(sim.casinoLife.events.length<=12);assert.ok(sim.casinoLife.requests.length<=32);assert.ok(sim.casinoLife.conversations.length<=6);for(const reservations of Object.values(sim.casinoLife.reservations))assert.equal(new Set(reservations.map(item=>item.seat)).size,reservations.length);
});
