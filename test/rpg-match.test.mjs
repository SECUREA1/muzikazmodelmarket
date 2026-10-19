import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {damagePlayer,newCombatStats,finishMatch,openMatch,registerParticipant,healPlayer,recordTournamentScore,tournamentView} from '../rpg-match.mjs';
import {syncRadToxTournament} from '../rad-tox-room-transfer.mjs';
import {healthAfterHit} from '../public/js/rpg-combat-rules.js';

async function arena(run,{radTox=true}={}){
 const dir=await mkdtemp(join(tmpdir(),'rpg-match-'));let now=100000,number=0;
 const store=new SharedRoomStore(join(dir,'rooms.json')),map={id:'arena',playable:true,...(radTox?{modelUrl:'/fixture.glb'}:{builderScene:{objects:[]}}),spawn:{x:0,y:0,z:0}};
 const runtime=new AuthoritativeRooms({store,now:()=>now});runtime.collision.encounterSpawn=(_,point)=>point;runtime.collision.safeSpawn=(_,point)=>point;runtime.collision.blocksShot=()=>false;runtime.collision.resolve=(_,previous,next)=>next;
 const identity=name=>({accountId:name,username:name,walletId:name,stats:{health:100}});
 const send=async(name,action,fields={},requestId='rpg-'+ ++number)=>{
  const state=await runtime.command(map.id,map,identity(name),{action,requestId,...fields});
  if(!radTox&&action==='join'){
   await store.update(map.id,room=>{const sim=room.simulation;if(!sim.match)openMatch(sim,1,now);else registerParticipant(sim,'account:'+name,sim.players['account:'+name],now);});
   return runtime.snapshot(map.id,map);
  }
  return state;
 };
 const refresh=()=>runtime.snapshot(map.id,map);
 const advance=ms=>{now+=ms;};
 async function arrange(){await store.update(map.id,room=>{for(const actor of Object.values(room.simulation.actors))actor.position={x:1000,y:0,z:1000};const players=room.simulation.players;if(players['account:alice'])players['account:alice'].position={x:0,y:0,z:0};if(players['account:bob'])players['account:bob'].position={x:0,y:0,z:-5};if(players['account:charlie'])players['account:charlie'].position={x:5,y:0,z:-5};});}
 try{await run({runtime,store,map,send,advance,refresh,arrange,now:()=>now});}finally{await rm(dir,{recursive:true,force:true});}
}

test('full health takes exactly 45 damaging hits; shields, spawn protection and death prevent extra damage',()=>{
 const player={health:100,score:0,combat:newCombatStats()},attacker={health:100,score:0,actorId:'attacker'};
 for(let i=0;i<44;i++){assert.equal(damagePlayer(player,100000,attacker),true);assert.ok(player.health>0);}
 assert.equal(damagePlayer(player,100000,attacker),true);assert.equal(player.health,0);assert.equal(player.combat.deaths,1);assert.equal(player.combat.hitsTaken,45);assert.equal(attacker.combat.playerKills,1);
 assert.equal(damagePlayer(player,100000,attacker),false);assert.equal(attacker.combat.playerKills,1);
 const guarded={health:100,spawnProtectedUntil:103000,shieldUntil:104000};assert.equal(damagePlayer(guarded,102000),false);assert.equal(damagePlayer(guarded,103500),false);assert.equal(damagePlayer(guarded,104001),true);
 let health=100;for(let i=0;i<45;i++)health=healthAfterHit(health);assert.equal(health,0,'browser health uses the same 45-hit rule');
});

test('tournament standings retain accepted combat totals across levels and reconnects',()=>{
 const now=100000,sim={players:{alice:{username:'Alice',lastSeen:now,health:100},bob:{username:'Bob',lastSeen:now,health:100}},radTox:{combatMode:'local',level:1}};
 openMatch(sim,1,now);const id=sim.tournament.id;
 recordTournamentScore(sim,'alice',{score:30,enemyKills:3,shots:8,hits:5,misses:3,damageDealt:250},now);
 recordTournamentScore(sim,'bob',{score:30,enemyKills:2,shots:4,hits:2,misses:2},now);
 let view=tournamentView(sim,now);assert.equal(view.results[0].id,'alice');assert.equal(view.results[0].accuracy,62.5);assert.equal(view.results[0].damageDealt,250);
 openMatch(sim,2,now+100);assert.equal(sim.tournament.id,id);assert.equal(sim.players.alice.score,0);assert.equal(sim.players.alice.tournamentScore,30);
 recordTournamentScore(sim,'alice',{score:10,enemyKills:1,shots:2,hits:2},now+100);
 sim.players.alice.username='Alice renamed';recordTournamentScore(sim,'alice',{},now+100);
 sim.players.bob.replacedByRoom='another-map';view=tournamentView(sim,now+100);
 assert.equal(view.results[0].score,40);assert.equal(view.results[0].enemyKills,4);assert.equal(view.results[0].shots,10);assert.equal(view.results[0].hits,7);assert.equal(view.results[0].username,'Alice renamed');assert.equal(view.results[1].connected,false);
 recordTournamentScore(sim,'alice',{score:-999,enemyKills:NaN},now+100);assert.equal(tournamentView(sim,now+100).results[0].score,40);
});

test('explicit resets and resupply advance life revisions without changing scores',()=>{
 const now=100000,player={username:'Alice',lastSeen:now,health:100},sim={players:{alice:player},radTox:{combatMode:'local'}};
 openMatch(sim,1,now);assert.equal(player.lifeRevision,1);player.score=20;
 healPlayer(player,15);assert.equal(player.lifeRevision,2);assert.equal(player.health,100);assert.equal(player.score,20);
 player.health=50;healPlayer(player,15);assert.equal(player.lifeRevision,3);assert.equal(player.health,65);
 openMatch(sim,2,now+100);assert.equal(player.lifeRevision,4);assert.equal(player.health,100);
});

test('every join enters the same active game; late joins and reconnects preserve established scores',()=>arena(async({send,advance,store})=>{
 const alice=await send('alice','join');const bob=await send('bob','join');assert.equal(alice.match.id,bob.match.id);assert.equal(bob.match.results.length,2);assert.ok(bob.radTox.remaining>0);assert.equal(bob.players['account:bob'].hitsRemaining,45);
 await store.update('arena',room=>{room.simulation.players['account:alice'].score=10;room.simulation.players['account:alice'].combat.score=10;});
 advance(50);const rejoin=await send('alice','join');assert.equal(rejoin.players['account:alice'].score,10);assert.equal(rejoin.match.id,alice.match.id);
 const charlie=await send('charlie','join');assert.equal(charlie.match.id,alice.match.id);assert.equal(charlie.match.results.length,3);
}));

test('Builder PvP records accepted shots, misses, hits, kills and deaths exactly once without trusting claimed hits',()=>arena(async({send,advance,arrange,runtime,store,refresh})=>{
 await send('alice','join');await send('bob','join');await arrange();advance(3100);await send('bob','input',{input:{}});
 let state=await send('alice','fire',{tool:'laser',direction:[0,0,-1],damage:100000,hitId:'account:bob',score:999},'first-shot');
 assert.equal(state.players['account:bob'].hitsRemaining,44);assert.equal(state.players['account:alice'].combat.shots,1);assert.equal(state.players['account:alice'].score,0);
 await send('alice','fire',{tool:'laser',direction:[0,0,-1]},'first-shot');state=await refresh();assert.equal(state.players['account:bob'].hitsRemaining,44,'replayed action cannot deal damage twice');
 await assert.rejects(send('alice','fire',{tool:'laser',direction:[0,0,-1]}),{statusCode:429});
 advance(250);state=await send('alice','fire',{tool:'laser',direction:[1,0,0],hitId:'account:bob'});assert.equal(state.players['account:alice'].combat.misses,1,'a forged hit ID does not turn a miss into a hit');
 for(let i=0;i<44;i++){advance(250);await send('bob','input',{input:{}});state=await send('alice','fire',{tool:'laser',direction:[0,0,-1]});}
 assert.equal(state.players['account:bob'].health,0);assert.equal(state.players['account:bob'].combat.deaths,1);assert.equal(state.players['account:bob'].combat.hitsTaken,45);
 const stats=state.players['account:alice'].combat;assert.equal(stats.shots,46);assert.equal(stats.hits,45);assert.equal(stats.misses,1);assert.equal(stats.playerKills,1);assert.equal(stats.enemyKills,0);assert.equal(state.players['account:alice'].score,25);
 await assert.rejects(send('bob','fire',{tool:'laser',direction:[0,0,1]}),{statusCode:409});
 state=await send('bob','respawn');assert.equal(state.players['account:bob'].hitsRemaining,45);assert.equal(state.players['account:bob'].combat.deaths,1);
 advance(250);state=await send('alice','fire',{tool:'laser',direction:[0,-.1,0.1]});assert.equal(state.players['account:bob'].health,100,'respawned players are protected');
 const missesBeforeWall=state.players['account:alice'].combat.misses;runtime.collision.blocksShot=()=>true;advance(3100);await send('bob','input',{input:{}});state=await send('alice','fire',{tool:'laser',direction:[0,0,-1]});assert.equal(state.players['account:alice'].combat.misses,missesBeforeWall+1,'occluded attacks do not count as hits');
},{radTox:false}));

test('level results include disconnected participants, remain frozen, survive restart and advance only once',()=>arena(async({send,advance,arrange,store,runtime,map,now})=>{
 let state=await send('alice','join');await send('bob','join');await arrange();advance(3100);
 state=await send('alice','rad-tox-progress',{matchId:state.match.id,phaseId:state.radTox.phaseId,sequence:1,stats:{shots:1,misses:1}});
 advance(16000);await send('alice','join');
 await store.update(map.id,(room,rooms)=>{syncRadToxTournament(room.simulation,rooms,{environment:map,now:now()});finishMatch(room.simulation,'victory',now());});
 state=await send('alice','input',{input:{}});const id=state.match.id;assert.equal(state.match.state,'finished');assert.equal(state.match.results.length,2);
 const bob=state.match.results.find(row=>row.id==='account:bob');assert.equal(bob.connected,false);const alice=state.match.results.find(row=>row.id==='account:alice');assert.equal(alice.shots,1);assert.equal(alice.misses,1);
 const frozen=JSON.stringify(state.match.results);await assert.rejects(send('alice','fire',{tool:'laser',direction:[1,0,0]}),{statusCode:409});
 await send('bob','join');state=await send('alice','input',{input:{}});assert.equal(JSON.stringify(state.match.results),frozen,'joining after completion cannot rewrite results');
 await store.flush();const restored=new AuthoritativeRooms({store:new SharedRoomStore(store.file),now});restored.collision.resolve=(_,previous,next)=>next;const snapshot=await restored.snapshot(map.id,map);assert.equal(JSON.stringify(snapshot.match.results),frozen);
 await assert.rejects(send('alice','next-rad-tox',{matchId:id}),{statusCode:409});advance(9999);state=await send('alice','input',{input:{}});assert.equal(state.match.id,id);advance(1);
 state=await send('alice','next-rad-tox',{matchId:id});const nextId=state.match.id;assert.notEqual(nextId,id);assert.equal(state.match.level,2);assert.equal(state.players['account:alice'].combat.shots,0);
 state=await send('bob','next-rad-tox',{matchId:id});assert.equal(state.match.id,nextId);assert.equal(state.match.level,2,'simultaneous next requests cannot skip a level');
}));

test('local player defeats preserve the shared level and independent respawns',()=>arena(async({send,advance,store,map,now})=>{
 const original=await send('alice','join');await send('bob','join');advance(3100);
 await store.update(map.id,room=>{for(const player of Object.values(room.simulation.players)){player.lastSeen=now();for(let i=0;i<45;i++)damagePlayer(player,now());}});
 const state=await send('alice','input',{input:{}});assert.equal(state.match.state,'active');assert.equal(state.match.outcome,null);assert.equal(state.match.results.length,2);assert.ok(state.match.results.every(row=>row.deaths===1&&row.hitsTaken===45));
 const respawned=await send('alice','respawn');assert.equal(respawned.match.id,original.match.id);assert.equal(respawned.radTox.phaseId,original.radTox.phaseId);assert.equal(respawned.radTox.endsAt,original.radTox.endsAt);
 assert.equal(respawned.players['account:alice'].hitsRemaining,45);assert.equal(respawned.players['account:bob'].health,0,'one respawn does not revive another local player');
}));

test('Builder enemy kills credit the final attacker and give the other contributor an assist',()=>arena(async({send,advance,arrange,store,map,now})=>{
 await send('alice','join');await send('bob','join');await arrange();advance(3100);
 await store.update(map.id,room=>{const sim=room.simulation;sim.players['account:bob'].position={x:2,y:0,z:0};sim.actors.target={id:'target',position:{x:0,y:0,z:-5},active:true,health:100};});
 let state=await send('alice','fire',{tool:'laser',direction:[0,-.1,-1]});assert.equal(state.actors.target.health,50);
 advance(250);state=await send('bob','fire',{tool:'laser',direction:[-2,-.5,-5]});assert.equal(state.actors.target.health,0);
 assert.equal(state.players['account:alice'].combat.assists,1);assert.equal(state.players['account:alice'].score,5);assert.equal(state.players['account:bob'].combat.enemyKills,1);assert.equal(state.players['account:bob'].score,10);
 await store.update(map.id,(room,rooms)=>{syncRadToxTournament(room.simulation,rooms,{environment:map,now:now()});finishMatch(room.simulation,'victory',now());});
 state=await send('alice','input',{input:{}});assert.equal(state.match.results[0].username,'bob');assert.equal(state.match.results[1].assists,1);assert.ok(state.match.results.every(row=>row.shots===row.hits+row.misses));
},{radTox:false}));

test('respawn clears falling momentum, shield and tool cooldowns without erasing match statistics',()=>arena(async({send,store,map,advance,arrange})=>{
 await send('alice','join');await send('bob','join');await arrange();
 await store.update(map.id,room=>{
  const player=room.simulation.players['account:alice'];player.health=0;player.velocityY=-15;player.grounded=false;player.shieldUntil=999999;player.toolReady={laser:999999};player.toolUses={medkit:2};player.combat.deaths=1;
 });
 advance(50);const state=await send('alice','respawn');
 const stored=(await store.get(map.id)).simulation.players['account:alice'];
 assert.equal(state.players['account:alice'].health,100);assert.equal(stored.velocityY,0);assert.equal(stored.grounded,true);assert.equal(stored.shieldUntil,0);assert.deepEqual(stored.toolReady,{});assert.deepEqual(stored.toolUses,{});assert.equal(stored.combat.deaths,1);
}));

test('expired room presence has a distinct recovery code',()=>arena(async({send,advance})=>{
 await send('alice','join');advance(16000);
 await assert.rejects(send('alice','input',{input:{}}),error=>error.statusCode===409&&error.code==='ROOM_JOIN_REQUIRED');
 const state=await send('alice','join');assert.ok(state.players['account:alice']);
}));

test('nearby enemies do not intercept use actions intended for gameplay items',()=>arena(async({send,store,map,arrange})=>{
 await send('alice','join');await arrange();
 await store.update(map.id,room=>{
  const sim=room.simulation;sim.players['account:alice'].health=50;
  for(const [id,behavior,z]of [['hostile','hostile',.25],['healer','heal',1]]){
   const position={x:0,y:0,z},gameplay={behavior,health:100,damage:0,interactionDistance:3,cooldown:0,action:'none',value:25};
   sim.actors[id]={id,position,rotation:{y:0},active:true,health:100,definition:{objectId:id,position:{...position},gameplay,movement:{speed:0},ai:{detectionRange:3}}};
  }
 });
 const state=await send('alice','interact');assert.equal(state.players['account:alice'].health,75);
}));

test('defeat releases held objects for teammates',()=>arena(async({send,store,map,advance,arrange})=>{
 await send('alice','join');await send('bob','join');await arrange();
 await store.update(map.id,room=>{
  const sim=room.simulation,player=sim.players['account:alice'];player.health=0;player.heldId='held';
  sim.actors.held={id:'held',position:{x:0,y:0,z:0},active:true,health:100,holderId:player.actorId};
 });
 advance(50);const state=await send('bob','input',{input:{}});
 assert.equal(state.actors.held.holderId,null);assert.equal(state.players['account:alice'].heldId,null);
}));
