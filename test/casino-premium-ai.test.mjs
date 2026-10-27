import test from 'node:test';
import assert from 'node:assert/strict';
import {casinoWorld} from '../casino-world.mjs';
import {CASINO_RESIDENTS,CASINO_STATIONS} from '../public/js/casino-config.js';
import {baccaratTotal,threeCardRank,threeCardSettlement} from '../public/js/casino-advanced-rules.js';
import {stepCasinoResidents,reserveCasinoStation,releaseCasinoReservation,requestCasinoService,observeCasinoInteraction} from '../server-casino-residents.mjs';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';

const world=casinoWorld(),flat={groundAt:(_world,p)=>({...p,y:.02}),resolve:(_world,_previous,p)=>({...p,y:.02})};
const npc=(sim,suffix)=>sim.actors['casino-resident-'+suffix];
function setup(collision=flat){const sim={actors:{},players:{},events:[]};stepCasinoResidents(sim,world,100000,0,{collision});return sim;}
function advance(sim,from,steps,collision=flat){for(let i=1;i<=steps;i++)stepCasinoResidents(sim,world,from+i*250,.25,{collision});return from+steps*250;}
function quiet(sim){for(const actor of Object.values(sim.actors)){actor.resident.nextSocialAt=1e9;actor.resident.nextAmbientAt=1e9;actor.resident.pauseUntil=1e9;actor.resident.speechUntil=0;delete actor.resident.conversationId;}sim.casinoLife.conversations=[];}

test('native premium rooms have completed games, staff work and lounge visits within two minutes without changing the fixed cast',()=>{
 const collision=new ServerBuilderCollision(),sim=setup(collision),played=new Set(),visited=new Set();
 for(let tick=1;tick<=480;tick++){
  stepCasinoResidents(sim,world,100000+tick*250,.25,{collision});
  for(const actor of Object.values(sim.actors)){
   const {x,y,z}=actor.position,info=actor.resident;
   if(info.gameState?.phase==='complete')played.add(info.gameState.game);
   if(x<-27&&z<-25)visited.add('staff');if(x>14&&z<-27)visited.add('baccarat');if(x>-25&&x<-9&&z<-29)visited.add('threecard');
   assert.ok(Math.abs(y-.02)<.025);assert.ok(!(Math.abs(x)<7.4&&z<-22.5));assert.ok(info.memory.length<=8);assert.ok(info.relationships.length<=8);
  }
 }
 assert.equal(Object.keys(sim.actors).length,22);assert.deepEqual(Object.keys(sim.actors).sort(),CASINO_RESIDENTS.map(p=>p.id).sort());assert.equal(Object.values(sim.actors).filter(a=>a.resident.duty==='guard').length,2);
 assert.ok(played.has('baccarat'));assert.ok(played.has('threecard'));assert.deepEqual([...visited].sort(),['baccarat','staff','threecard']);
 assert.ok(Object.values(sim.actors).some(a=>a.resident.staffShift?.restocks>=1&&a.resident.staffShift.breaks>=1));
 assert.ok(Object.values(sim.actors).some(a=>a.resident.memory.some(m=>m.kind==='rest')),'guests actually use the public lounges');
 assert.ok(sim.casinoLife.stats.services>=1);assert.ok(sim.casinoLife.stats.conversations>=3);
 for(const reservations of Object.values(sim.casinoLife.reservations))assert.equal(new Set(reservations.map(r=>r.seat)).size,reservations.length);
});

test('advanced local practice applies shared rules, waits for its rotating dealer and resumes deterministically without touching wallets',()=>{
 for(const [game,guestId,dealerId,stationId]of [['baccarat','guest-7','dealer-blackjack-2','casino-baccarat-vip'],['threecard','guest-3','dealer-poker-2','casino-threecard-salon']]){
  const sim=setup();quiet(sim);const guest=npc(sim,guestId),dealer=npc(sim,dealerId),station=CASINO_STATIONS.find(s=>s.id===stationId);for(const id of Object.keys(sim.casinoLife.reservations))releaseCasinoReservation(sim,id,guest.id);
  guest.position={x:station.position.x,y:.02,z:station.position.z+4};guest.resident.goal={kind:'play',stationId,status:'planned',startedAt:100000};guest.resident.pauseUntil=0;guest.resident.skills[game]=75;
  sim.players.viewer={actorId:'viewer',username:'Viewer',health:100,lastSeen:0,position:{x:0,y:.02,z:32},tokens:{MZK:777},casinoTask:{id:'unrelated',status:'active'}};const protectedPlayer=JSON.stringify(sim.players.viewer);
  advance(sim,100000,16);assert.equal(guest.resident.gameState.game,undefined,'practice waits for the actual dealer');
  dealer.position={x:station.position.x,y:.02,z:station.position.z-3};dealer.resident.stationId=stationId;dealer.resident.game=game;
  advance(sim,104000,16);const copy=JSON.parse(JSON.stringify(sim));advance(sim,108000,20);advance(copy,108000,20);assert.deepEqual(JSON.parse(JSON.stringify(sim)),copy);const state=guest.resident.gameState;assert.equal(state.phase,'complete');assert.ok(state.practiceOnly);assert.ok(guest.resident.skills[game]>75);assert.equal(JSON.stringify(sim.players.viewer),protectedPlayer);assert.equal(new Set([...state.hand,...state.dealerHand]).size,state.hand.length+state.dealerHand.length);
  if(game==='baccarat'){assert.equal(state.playerTotal,baccaratTotal(state.hand));assert.equal(state.dealerTotal,baccaratTotal(state.dealerHand));assert.match(state.decision,/fixed third-card rules/);}else{assert.equal(state.handRank,threeCardRank(state.hand).category);assert.ok(['play','fold'].includes(state.selection));if(state.selection==='play')assert.equal(state.comparison,threeCardSettlement(1,state.hand,state.dealerHand).comparison);}
  observeCasinoInteraction(sim,null,{actorId:'viewer',kind:'player-game',game,result:'completed',requestId:game+'-observed'},113250);assert.ok(dealer.resident.memory.some(item=>item.subjectId==='viewer'));
 }
});

test('staff restocking and breaks require physically reaching the room and recovering a blocked door',()=>{
 const native=new ServerBuilderCollision();let closed=true;const collision={groundAt:native.groundAt.bind(native),hasBodyClearance:native.hasBodyClearance.bind(native),blocksShot:native.blocksShot.bind(native),resolve:(env,previous,next,actors,objects)=>closed&&Math.min(previous.z,next.z)<-24.8&&Math.max(previous.z,next.z)>-25.2&&Math.abs(next.x+32)<2?{...previous}:native.resolve(env,previous,next,actors,objects)};
 const sim=setup(collision);quiet(sim);const staff=npc(sim,'floor-host');staff.position={x:-32,y:.02,z:-23};staff.resident.pauseUntil=0;staff.resident.staffShift.nextAt=100000;staff.resident.goal=null;
 advance(sim,100000,80,collision);assert.equal(staff.resident.staffShift.restocks,0);assert.ok(staff.position.z>-25.2);closed=false;advance(sim,120000,200,collision);assert.equal(staff.resident.staffShift.restocks,1);assert.equal(staff.resident.staffShift.breaks,1);assert.equal(staff.resident.staffShift.stock,100);assert.ok(staff.resident.memory.some(m=>m.kind==='staff-restock'));assert.ok(staff.resident.memory.some(m=>m.kind==='staff-break'));
 assert.equal(reserveCasinoStation(sim,'casino-staff-prep',npc(sim,'guest-1').id,170250),null,'guests do not reserve staff work points');
});

test('skilled card practice makes a Queen-six-four play, folds a weak high card and doubles only one blackjack card',()=>{
 for(const [game,hand,dealerHand,expected]of [['threecard',[10,17,28],[2,16,34],'play'],['threecard',[0,17,35],[2,16,34],'fold'],['blackjack',[3,17],[7,21],'double']]){
  const sim=setup();quiet(sim);const guest=npc(sim,'guest-3'),station=CASINO_STATIONS.find(s=>s.id===(game==='threecard'?'casino-threecard-salon':'casino-blackjack-1'));for(const id of Object.keys(sim.casinoLife.reservations))releaseCasinoReservation(sim,id,guest.id);
  guest.position={x:station.position.x,y:.02,z:station.position.z+4};guest.resident.pauseUntil=0;guest.resident.skills[game]=90;guest.resident.goal={kind:'play',stationId:station.id,status:'active',startedAt:100000,roundStarted:true};guest.resident.gameState={game,stationId:station.id,round:1,phase:'decide',nextAt:100000,hand:[...hand],dealerHand:[...dealerHand],drawIndex:4,wins:0,losses:0,practiceOnly:true};
  // Match the actual standard table seat so this tick performs the decision.
  const reservation=reserveCasinoStation(sim,station.id,guest.id,100000);guest.position={...reservation.position,y:.02};stepCasinoResidents(sim,world,100250,.25,{collision:flat});const state=guest.resident.gameState;assert.equal(state.phase,'reveal');
  if(game==='threecard')assert.equal(state.selection,expected);else{assert.equal(state.doubled,true);assert.equal(state.hand.length,3);assert.match(state.decision,/draw one card and stand/);}
 }
});

test('saved residents heal new walls, obsolete goals and invalid seats while retaining learned identity, memories and player favors',()=>{
 const collision=new ServerBuilderCollision(),sim=setup(collision),actor=npc(sim,'dealer-poker-2'),guest=npc(sim,'guest-1');
 actor.resident.intelligenceVersion=2;actor.resident.skills.poker=97;actor.resident.memory=[{kind:'saved',subjectId:'alice',text:'I remember this visitor.',at:90000}];actor.resident.relationships=[{id:'alice',affinity:22,lastAt:90000}];actor.position={x:-27,y:.02,z:-29};actor.resident.home={...actor.position};actor.resident.goal={kind:'rest',stationId:'removed-old-lounge'};sim.casinoLife.navigation[actor.id]={key:'stale',path:[{x:-27,y:0,z:-29}]};sim.casinoLife.reservations['casino-threecard-salon']=[{npcId:actor.id,seat:99,until:200000}];sim.players.alice={actorId:'alice',username:'Alice',health:100,lastSeen:0,position:{x:0,y:.02,z:32},casinoTask:{id:'saved-favor',issuerId:actor.id,status:'active'},tokens:{MZK:1234}};const player=JSON.stringify(sim.players.alice);
 stepCasinoResidents(sim,world,100250,.25,{collision});assert.equal(actor.resident.intelligenceVersion,3);assert.equal(actor.resident.skills.poker,97);assert.ok(actor.resident.memory.some(m=>m.kind==='saved'));assert.equal(actor.resident.relationships[0].affinity,22);assert.deepEqual(actor.resident.stationIds,['casino-poker-2','casino-threecard-salon']);assert.equal(JSON.stringify(sim.players.alice),player);assert.ok(collision.hasBodyClearance(world,actor.position,.4,{actors:sim.actors,objects:{}}));assert.notEqual(sim.casinoLife.navigation[actor.id]?.key,'stale');assert.ok(!Object.values(sim.casinoLife.reservations).flat().some(r=>r.npcId===actor.id&&r.seat===99));
 guest.resident.goal={kind:'play',stationId:'deleted-station',status:'active',startedAt:100250};stepCasinoResidents(sim,world,100500,0,{collision});assert.equal(guest.resident.goal,null);
 sim.casinoLife.reservations['casino-baccarat-vip']=[{npcId:guest.id,seat:99,until:200000}];const seat=reserveCasinoStation(sim,'casino-baccarat-vip',guest.id,100750);assert.ok(seat.position);assert.ok(seat.seat<3);
});

test('room walls prevent NPC service and conversations while their open entrances permit real exchanges',()=>{
 const collision=new ServerBuilderCollision(),sim=setup(collision);quiet(sim);const staff=npc(sim,'dealer-blackjack-2'),guest=npc(sim,'guest-7');staff.position={x:31,y:.02,z:-16};guest.position={x:31,y:.02,z:-20};const request=requestCasinoService(sim,{requesterId:guest.id,staffId:staff.id,kind:'rules',requestId:'across-vip-wall'},100000);advance(sim,100000,40,collision);assert.equal(request.status,'queued');assert.equal(sim.casinoLife.conversations.length,0);
 staff.position={x:20,y:.02,z:-16};guest.position={x:20,y:.02,z:-20};advance(sim,110000,40,collision);assert.equal(request.status,'complete');assert.ok(sim.casinoLife.conversations.some(c=>new Set(c.lines.map(line=>line.speakerId)).size===2));
});

test('a paused home-table visitor cannot indefinitely starve the paired premium table dealer',()=>{
 const sim=setup();quiet(sim);const dealer=npc(sim,'dealer-poker-2'),homeGuest=npc(sim,'guest-1'),premiumGuest=npc(sim,'guest-3');dealer.resident.pauseUntil=0;dealer.resident.goal={kind:'deal',target:{...dealer.position},stationId:'casino-poker-2',arrivedAt:100000,status:'active',startedAt:100000};
 homeGuest.resident.goal={kind:'play',stationId:'casino-poker-2',roundStarted:false,status:'active',startedAt:99000,readyAt:99000};homeGuest.position={x:-20,y:.02,z:12.7};
 premiumGuest.position={x:-18,y:.02,z:-29};premiumGuest.resident.pauseUntil=0;premiumGuest.resident.goal={kind:'play',stationId:'casino-threecard-salon',roundStarted:false,status:'active',startedAt:100000};for(const id of Object.keys(sim.casinoLife.reservations))releaseCasinoReservation(sim,id,premiumGuest.id);
 advance(sim,100000,320);assert.equal(premiumGuest.resident.gameState.game,'threecard');assert.ok(premiumGuest.resident.gamesPlayed>=1);assert.ok(dealer.resident.stationLastHostedAt['casino-poker-2']>=110000);assert.equal(homeGuest.resident.goal.stationId,'casino-poker-2');
});

test('premium front seats receive table-specific rules from their assigned dealer across the full table width',()=>{
 const collision=new ServerBuilderCollision(),sim=setup(collision);quiet(sim);
 for(const [guestId,dealerId,stationId]of [['guest-3','dealer-poker-2','casino-threecard-salon'],['guest-7','dealer-blackjack-2','casino-baccarat-vip']]){
  const guest=npc(sim,guestId),dealer=npc(sim,dealerId),station=CASINO_STATIONS.find(s=>s.id===stationId);guest.position={x:station.position.x,y:.02,z:station.position.z+4};guest.resident.goal={kind:'play',stationId,status:'active',startedAt:100000};dealer.position={x:station.position.x,y:.02,z:station.position.z-3};dealer.resident.stationId=stationId;dealer.resident.game=station.kind;
  const request=requestCasinoService(sim,{requesterId:guest.id,kind:'rules',requestId:stationId+'-rules'},100000);assert.equal(request.staffId,dealer.id);assert.equal(request.subjectId,stationId);
 }
 advance(sim,100000,48,collision);const requests=sim.casinoLife.requests.filter(r=>r.kind==='rules');assert.equal(requests.length,2);assert.ok(requests.every(r=>r.status==='complete'));assert.ok(sim.casinoLife.conversations.some(c=>c.topic==='rules'&&c.lines.some(line=>/third-card|Queen-six-four/.test(line.text))));
});
