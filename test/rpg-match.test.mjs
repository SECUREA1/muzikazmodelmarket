import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {damagePlayer,newCombatStats,finishMatch} from '../rpg-match.mjs';
import {healthAfterHit} from '../public/js/rpg-combat-rules.js';

async function arena(run){
 const dir=await mkdtemp(join(tmpdir(),'rpg-match-'));let now=100000,number=0;
 const store=new SharedRoomStore(join(dir,'rooms.json')),map={id:'arena',playable:true,modelUrl:'/fixture.glb',spawn:{x:0,y:0,z:0}};
 const runtime=new AuthoritativeRooms({store,now:()=>now});runtime.collision.safeSpawn=(_,point)=>point;runtime.collision.blocksShot=()=>false;
 const identity=name=>({accountId:name,username:name,walletId:name,stats:{health:100}});
 const send=(name,action,fields={},requestId='rpg-'+ ++number)=>runtime.command(map.id,map,identity(name),{action,requestId,...fields});
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

test('every join enters the same active game; late joins and reconnects preserve established scores',()=>arena(async({send,advance,store})=>{
 const alice=await send('alice','join');const bob=await send('bob','join');assert.equal(alice.match.id,bob.match.id);assert.equal(bob.match.results.length,2);assert.ok(bob.radTox.remaining>0);assert.equal(bob.players['account:bob'].hitsRemaining,45);
 await store.update('arena',room=>{room.simulation.players['account:alice'].score=10;room.simulation.players['account:alice'].combat.score=10;});
 advance(50);const rejoin=await send('alice','join');assert.equal(rejoin.players['account:alice'].score,10);assert.equal(rejoin.match.id,alice.match.id);
 const charlie=await send('charlie','join');assert.equal(charlie.match.id,alice.match.id);assert.equal(charlie.match.results.length,3);
}));

test('PvP records accepted shots, misses, hits, kills and deaths exactly once without trusting claimed hits',()=>arena(async({send,advance,arrange,runtime,store,refresh})=>{
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
 runtime.collision.blocksShot=()=>true;advance(3100);await send('bob','input',{input:{}});state=await send('alice','fire',{tool:'laser',direction:[0,0,-1]});assert.equal(state.players['account:alice'].combat.misses,2,'occluded attacks do not count as hits');
}));

test('level results include disconnected participants, remain frozen, survive restart and advance only once',()=>arena(async({send,advance,arrange,store,runtime,map,now})=>{
 await send('alice','join');await send('bob','join');await arrange();advance(3100);
 let state=await send('alice','fire',{tool:'laser',direction:[1,0,0]});
 advance(16000);await send('alice','join');
 await store.update(map.id,room=>finishMatch(room.simulation,'victory',now()));
 state=await send('alice','input',{input:{}});const id=state.match.id;assert.equal(state.match.state,'finished');assert.equal(state.match.results.length,2);
 const bob=state.match.results.find(row=>row.id==='account:bob');assert.equal(bob.connected,false);const alice=state.match.results.find(row=>row.id==='account:alice');assert.equal(alice.shots,1);assert.equal(alice.misses,1);
 const frozen=JSON.stringify(state.match.results);await assert.rejects(send('alice','fire',{tool:'laser',direction:[1,0,0]}),{statusCode:409});
 await send('bob','join');state=await send('alice','input',{input:{}});assert.equal(JSON.stringify(state.match.results),frozen,'joining after completion cannot rewrite results');
 await store.flush();const restored=new AuthoritativeRooms({store:new SharedRoomStore(store.file),now});const snapshot=await restored.snapshot(map.id,map);assert.equal(JSON.stringify(snapshot.match.results),frozen);
 state=await send('alice','next-rad-tox',{matchId:id});const nextId=state.match.id;assert.notEqual(nextId,id);assert.equal(state.match.level,2);assert.equal(state.players['account:alice'].combat.shots,0);
 state=await send('bob','next-rad-tox',{matchId:id});assert.equal(state.match.id,nextId);assert.equal(state.match.level,2,'simultaneous next requests cannot skip a level');
}));

test('a team wipe finishes the level and records each death once',()=>arena(async({send,advance,store,map,now})=>{
 await send('alice','join');await send('bob','join');advance(3100);
 await store.update(map.id,room=>{for(const player of Object.values(room.simulation.players)){player.lastSeen=now();for(let i=0;i<45;i++)damagePlayer(player,now());}});
 const state=await send('alice','input',{input:{}});assert.equal(state.match.outcome,'defeat');assert.equal(state.match.results.length,2);assert.ok(state.match.results.every(row=>row.deaths===1&&row.hitsTaken===45));
 const retry=await send('alice','next-rad-tox',{matchId:state.match.id});assert.equal(retry.match.level,1);assert.equal(retry.players['account:alice'].hitsRemaining,45);
}));

test('enemy kills credit the final attacker and give the other contributor an assist',()=>arena(async({send,advance,arrange,store,map,now})=>{
 await send('alice','join');await send('bob','join');await arrange();advance(3100);
 await store.update(map.id,room=>{const sim=room.simulation;sim.players['account:bob'].position={x:2,y:0,z:0};sim.actors.target={id:'target',position:{x:0,y:0,z:-5},active:true,health:100};});
 let state=await send('alice','fire',{tool:'laser',direction:[0,-.1,-1]});assert.equal(state.actors.target.health,50);
 advance(250);state=await send('bob','fire',{tool:'laser',direction:[-2,-.5,-5]});assert.equal(state.actors.target.health,0);
 assert.equal(state.players['account:alice'].combat.assists,1);assert.equal(state.players['account:alice'].score,5);assert.equal(state.players['account:bob'].combat.enemyKills,1);assert.equal(state.players['account:bob'].score,10);
 await store.update(map.id,room=>finishMatch(room.simulation,'victory',now()));
 state=await send('alice','input',{input:{}});assert.equal(state.match.results[0].username,'bob');assert.equal(state.match.results[1].assists,1);assert.ok(state.match.results.every(row=>row.shots===row.hits+row.misses));
}));
