import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {finishMatch} from '../rpg-match.mjs';

const main={id:'muzikaz-main',name:'Main floor',modelUrl:'/house.glb',spawn:{x:0,y:0,z:2}};
const upper={...main,id:'muzikaz-upper',name:'Upper floor'};
const alice={accountId:'alice',username:'Alice',stats:{health:100}},bob={accountId:'bob',username:'Bob',stats:{health:100}},erin={accountId:'erin',username:'Erin',stats:{health:100}};
async function fixture(run){
 const dir=await mkdtemp(join(tmpdir(),'rad-tox-map-transfer-'));let now=100000,request=0;
 const store=new SharedRoomStore(join(dir,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>now});
 runtime.collision.safeSpawn=(_,point)=>({...point});runtime.collision.resolve=(_,previous,next)=>({...next});
 const send=(world,user,action,fields={})=>runtime.command(world.id,world,user,{action,requestId:'transfer-'+(++request),...fields});
 const progress=(world,user,state,stats,fields={})=>send(world,user,'rad-tox-progress',{matchId:state.match.id,phaseId:state.radTox.phaseId,sequence:1,stats,...fields});
 try{await run({store,runtime,send,progress,get now(){return now;},advance(ms){now+=ms;}});}finally{await rm(dir,{recursive:true,force:true});}
}
const hit={shots:1,hits:1,enemyHits:1,enemyKills:1,score:11};

test('two players keep one wave clock and tournament through the boss, map transfer, lost receipt and restart',async()=>fixture(async f=>{
 let state=await f.send(main,alice,'join');await f.send(main,bob,'join');const tournamentId=state.tournament.id;
 state=await f.progress(main,alice,state,hit);assert.equal(state.players['account:alice'].tournamentScore,11);
 for(let wave=1;wave<=4;wave++){
  const phase=state.radTox.phaseId;f.advance(state.radTox.endsAt-f.now);
  // Fast-forward the clock while representing both clients' normal heartbeats.
  await f.store.update(main.id,room=>{for(const player of Object.values(room.simulation.players))player.lastSeen=f.now;});
  state=await f.send(main,alice,'input',{input:{}});await f.send(main,bob,'input',{input:{}});
  assert.equal(state.radTox.state,'cleared');assert.equal(state.radTox.phaseId,phase);
  f.advance(10000);state=await f.send(main,alice,'input',{input:{}});await f.send(main,bob,'input',{input:{}});
 }
 assert.equal(state.radTox.phaseKind,'boss');assert.equal(state.radTox.bossKind,'bee');assert.deepEqual(state.actors,{});assert.deepEqual(state.projectiles,{});
 const boss=state;state=await f.progress(main,alice,boss,hit,{bossDefeated:true});assert.equal(state.match.state,'active','a connected teammate still needs to defeat their local boss');
 state=await f.progress(main,bob,boss,hit,{bossDefeated:true});assert.equal(state.match.outcome,'victory');
 f.advance(10000);state=await f.send(main,alice,'input',{input:{}});
 assert.equal(state.radTox.environmentId,upper.id);assert.equal(state.radTox.level,2);
 const transfer={radToxFrom:main.id,radToxTransfer:state.radTox.transferId};
 await assert.rejects(f.send(upper,erin,'join',transfer),{statusCode:409},'the transfer belongs to players from the source game');
 state=await f.send(upper,alice,'join',transfer);const arrivalPhase=state.radTox.phaseId,arrivalEnd=state.radTox.endsAt;
 assert.equal(state.radTox.level,2);assert.equal(state.radTox.wave,1);assert.equal(state.radTox.environmentId,upper.id);assert.equal(state.tournament.id,tournamentId);
 assert.equal(state.players['account:alice'].score,0);assert.equal(state.players['account:alice'].tournamentScore,22);
 f.advance(5000);const joined=await f.send(upper,bob,'join',transfer);assert.equal(joined.radTox.phaseId,arrivalPhase);assert.equal(joined.radTox.endsAt,arrivalEnd,'later arrivals do not restart the level timer');
 const late={matchId:boss.match.id,phaseId:boss.radTox.phaseId,sequence:2,stats:{...hit,shots:2,hits:2,enemyHits:2,score:13},health:0,lifeRevision:boss.players['account:alice'].lifeRevision,bossDefeated:true};
 state=await f.send(upper,alice,'rad-tox-progress',late);assert.equal(state.players['account:alice'].tournamentScore,24);assert.equal(state.players['account:alice'].score,0);assert.equal(state.players['account:alice'].health,100);assert.equal(state.result.localScoreAck.phaseId,boss.radTox.phaseId);
 state=await f.send(upper,alice,'rad-tox-progress',late);assert.equal(state.players['account:alice'].tournamentScore,24,'retrying a lost score receipt is idempotent');
 const source=await f.runtime.snapshot(main.id,main);assert.equal(source.tournament.results.find(row=>row.id==='account:alice').score,24,'all maps read the same tournament ledger');
 await f.store.flush();const restarted=new AuthoritativeRooms({store:new SharedRoomStore(f.store.file),now:()=>f.now});restarted.collision.safeSpawn=(_,point)=>point;
 const restored=await restarted.snapshot(upper.id,upper);assert.equal(restored.tournament.id,tournamentId);assert.equal(restored.tournament.results.find(row=>row.id==='account:alice').score,24);assert.equal(restored.radTox.phaseId,arrivalPhase);
}));

test('joining an occupied destination preserves its game and merges tournament scores once',async()=>fixture(async f=>{
 let source=await f.send(main,alice,'join');source=await f.progress(main,alice,source,hit);
 let destination=await f.send(upper,erin,'join');destination=await f.progress(upper,erin,destination,hit);const activePhase=destination.radTox.phaseId,activeEnd=destination.radTox.endsAt;
 await f.store.update(main.id,room=>finishMatch(room.simulation,'victory',f.now));f.advance(10000);source=await f.send(main,alice,'input',{input:{}});
 const transfer={radToxFrom:main.id,radToxTransfer:source.radTox.transferId};
 let state=await f.send(upper,alice,'join',transfer);assert.equal(state.radTox.phaseId,activePhase);assert.equal(state.radTox.endsAt,activeEnd);assert.equal(state.tournament.id,destination.tournament.id);
 assert.equal(state.tournament.results.reduce((sum,row)=>sum+row.score,0),22);
 state=await f.send(upper,alice,'join',transfer);assert.equal(state.tournament.results.reduce((sum,row)=>sum+row.score,0),22,'reconnects never merge the source scores again');
 const old=await f.runtime.snapshot(main.id,main);assert.equal(old.tournament.id,state.tournament.id);assert.equal(old.tournament.results.reduce((sum,row)=>sum+row.score,0),22);
}));

test('a delayed pre-respawn vital report cannot deplete a new life',async()=>fixture(async f=>{
 let state=await f.send(main,alice,'join');await f.send(main,bob,'join');const revision=state.players['account:alice'].lifeRevision;
 state=await f.progress(main,alice,state,{hitsTaken:45,damageTaken:100,deaths:1},{health:0,ammo:0,fuel:0,lifeRevision:revision});
 assert.equal(state.players['account:alice'].health,0);state=await f.send(main,alice,'respawn');assert.equal(state.players['account:alice'].health,100);assert.ok(state.players['account:alice'].lifeRevision>revision);
 state=await f.send(main,alice,'rad-tox-progress',{matchId:state.match.id,phaseId:state.radTox.phaseId,sequence:2,stats:{hitsTaken:45,damageTaken:100,deaths:1},health:0,ammo:0,fuel:0,lifeRevision:revision});
 assert.equal(state.players['account:alice'].health,100);assert.equal(state.players['account:alice'].ammo,120);assert.equal(state.players['account:alice'].fuel,100);
}));
