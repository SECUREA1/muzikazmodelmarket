import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {BASKETBALL_BALL_ID} from '../public/js/basketball-rules.js';

async function fixture(run){
 const dir=await mkdtemp(join(tmpdir(),'basketball-arena-'));let now=100000,sequence=0;const store=new SharedRoomStore(join(dir,'rooms.json'));
 const map={id:'basketball-arena',publicDestination:true,spawn:{x:0,y:0,z:0},builderScene:{layout:'grand-floor',mapSize:64,objects:[]}};
 const charged=[],runtime=new AuthoritativeRooms({store,now:()=>now,charge:async(...args)=>charged.push(args),resolveAsset:async(_identity,command)=>({id:command.sku?.replace('backpack:',''),buildAssetId:command.sku?.replace('backpack:',''),name:'Free basketball gear',basic:true,behavior:'pickup'})});
 const send=(who,action,fields={},requestId='basketball-'+(++sequence))=>runtime.command(map.id,map,{accountId:who,username:who,walletId:who,stats:{health:100}},{action,requestId,...fields});
 try{await run({runtime,store,map,send,charged,advance:ms=>{now+=ms;return now;},now:()=>now});}finally{await rm(dir,{force:true,recursive:true});}
}

test('every arena player shares free court, teams, jerseys and one server-owned game ball',()=>fixture(async({send,runtime,map,charged})=>{
 let state=await send('alice','join');assert.equal(state.basketball.state,'ready');assert.equal(state.players['account:alice'].basketballTeam,'home');assert.equal(state.players['account:alice'].basketballJersey,'home');assert.equal(state.actors[BASKETBALL_BALL_ID].asset.buildAssetId,'basketball');assert.equal(state.radTox,null);assert.equal(state.match,null);
 assert.equal(state.players['account:alice'].basketballRole,'player');
 assert.equal(Object.values(state.actors).some(actor=>actor.loot),false,'the sports court has no generic combat loot or coin pickups');
 state=await send('bob','join');assert.equal(state.players['account:bob'].basketballTeam,'away');
 await assert.rejects(send('eve','basketball-start'),/Join this room/);
 state=await send('bob','basketball-start');assert.equal(state.basketball.state,'live');assert.equal(state.basketball.quarter,1);assert.equal(state.basketball.clockMs,720000);
 await assert.rejects(send('alice','basketball-start'),/already running/);
 await assert.rejects(send('alice','basketball-team',{team:'away'}),/Change teams/);
 await assert.rejects(send('alice','fire',{tool:'laser',direction:[0,0,-1]}),/sports court/);
 state=await send('alice','spawn',{sku:'backpack:basketball'});assert.equal(state.result.spawnedId,BASKETBALL_BALL_ID);assert.equal(Object.values(state.actors).filter(actor=>actor.basketballMatchBall).length,1);assert.deepEqual(charged,[]);
 assert.equal((await runtime.snapshot(map.id,map)).players['account:bob'].basketballJersey,'away');
}));

test('shared catch and assisted shot are authoritative and a repeated request cannot shoot or score twice',()=>fixture(async({send,store,runtime,map,advance})=>{
 await send('alice','join');await send('bob','join');await send('alice','basketball-start');
 // Authoritative fixture placement is a test setup; commands cannot choose a position or award points.
 await store.update(map.id,room=>{room.simulation.players['account:alice'].position={x:0,y:0,z:-8};room.simulation.actors[BASKETBALL_BALL_ID].position={x:0,y:0,z:-8};});
 let state=await send('alice','catch');assert.equal(state.players['account:alice'].heldId,BASKETBALL_BALL_ID);
 state=await send('alice','basketball-shoot',{homeScore:999,target:{x:999,z:999}},'same-shot');assert.equal(state.players['account:alice'].heldId,null);assert.ok(state.actors[BASKETBALL_BALL_ID].ballVelocity);
 const repeat=await send('alice','basketball-shoot',{},'same-shot');assert.equal(repeat.basketball.homeScore,0);
 for(let i=0;i<100;i++){advance(33);state=await runtime.snapshot(map.id,map);if(state.basketball.lastScore)break;}
 assert.equal(state.basketball.homeScore,2);assert.equal(state.basketball.awayScore,0);assert.equal(state.basketball.possession,'away');assert.equal(state.basketball.lastScore.playerId,'account:alice');assert.equal(state.players['account:alice'].basketballPoints,2);assert.equal(state.players['account:bob'].heldId,BASKETBALL_BALL_ID);
 for(let i=0;i<20;i++){advance(50);state=await runtime.snapshot(map.id,map);}assert.equal(state.basketball.homeScore,2);
 await assert.rejects(send('alice','basketball-shoot'),/Catch a basketball/);
 await assert.rejects(send('alice','basketball-score',{points:999}),/no server handler/);
}));

test('a free jersey equips an attachment without spawning a second actor and can be removed',()=>fixture(async({send})=>{
 await send('alice','join');let state=await send('alice','spawn',{sku:'backpack:basketball-jersey-away'});assert.equal(state.players['account:alice'].basketballJersey,'away');assert.equal(state.players['account:alice'].basketballTeam,'away');assert.equal(Object.values(state.actors).some(actor=>actor.asset?.buildAssetId==='basketball-jersey-away'),false);
 state=await send('alice','basketball-jersey',{team:null});assert.equal(state.players['account:alice'].basketballJersey,null);
 await assert.rejects(send('alice','basketball-jersey',{team:'spoof'}),/Choose the Home or Away jersey/);
}));

test('watching opts out of play and a spectator can choose a team before tip-off',()=>fixture(async({send,runtime,map})=>{
 await send('alice','join');
 let state=await send('alice','basketball-watch');
 assert.equal(state.players['account:alice'].basketballRole,'spectator');
 assert.equal(state.players['account:alice'].basketballTeam,null);
 assert.equal(state.players['account:alice'].heldId??null,null);
 await assert.rejects(send('alice','basketball-start'),/player|team/i);
 assert.equal((await runtime.snapshot(map.id,map)).basketball.state,'ready');
 state=await send('alice','basketball-team',{team:'away'});
 assert.equal(state.players['account:alice'].basketballRole,'player');
 assert.equal(state.players['account:alice'].basketballTeam,'away');
 assert.equal(state.players['account:alice'].basketballJersey,'away');
 state=await send('alice','basketball-start');
 assert.equal(state.basketball.state,'live');
}));

test('late arrivals watch a live game and cannot claim the shared ball or join a locked team',()=>fixture(async({send,store,runtime,map})=>{
 await send('alice','join');
 await send('alice','basketball-start');
 let state=await send('viewer','join');
 assert.equal(state.players['account:viewer'].basketballRole,'spectator');
 assert.equal(state.players['account:viewer'].basketballTeam,null);
 await assert.rejects(send('viewer','basketball-team',{team:'away'}),/before|late|running|live|started/i);
 await store.update(map.id,room=>{
  const player=room.simulation.players['account:viewer'];
  player.position={x:0,y:0,z:0};player.input={};
  room.simulation.actors[BASKETBALL_BALL_ID].position={x:0,y:0,z:0};
 });
 for(const action of ['catch','interact'])await assert.rejects(send('viewer',action,{entityId:BASKETBALL_BALL_ID,basketballRole:'player'}),/spectat|join.*team|player/i);
 // A stale or malformed saved holder must not let an opted-out player throw
 // or shoot the official ball after the role check.
 await store.update(map.id,room=>{
  room.simulation.players['account:viewer'].heldId=BASKETBALL_BALL_ID;
  room.simulation.actors[BASKETBALL_BALL_ID].holderId='account:viewer';
 });
 for(const action of ['toss','basketball-shoot'])await assert.rejects(send('viewer',action,{pitch:0}),/spectat|join.*team|player/i);
 state=await runtime.snapshot(map.id,map);
 assert.equal(state.basketball.homeScore,0);
 assert.equal(state.basketball.awayScore,0);
 assert.equal(state.players['account:viewer'].basketballRole,'spectator');
 assert.equal(state.players['account:alice'].basketballRole,'player');
}));

test('a player can watch during play and releases the shared ball for remaining players',()=>fixture(async({send,runtime,map})=>{
 await send('alice','join');await send('bob','join');await send('alice','basketball-start');
 let state=await send('alice','catch');
 assert.equal(state.players['account:alice'].heldId,BASKETBALL_BALL_ID);
 state=await send('alice','basketball-watch');
 assert.equal(state.players['account:alice'].basketballRole,'spectator');
 assert.equal(state.players['account:alice'].basketballTeam,null);
 assert.equal(state.players['account:alice'].heldId,null);
 assert.equal(state.players['account:bob'].heldId,BASKETBALL_BALL_ID);
 assert.equal(state.actors[BASKETBALL_BALL_ID].holderId,'account:bob');
 const peer=await send('bob','input',{input:{}});
 assert.equal(peer.players['account:alice'].basketballRole,'spectator');
 state=await send('bob','toss',{pitch:0});
 assert.equal(state.players['account:bob'].heldId,null);
 assert.ok(state.actors[BASKETBALL_BALL_ID].ballVelocity);
 assert.equal((await runtime.snapshot(map.id,map)).basketball.state,'live');
}));

test('shared basketball settings validate atomically, control tip-off and lock during play',()=>fixture(async({send,runtime,map})=>{
 await send('alice','join');await send('bob','join');
 const defaults={quarterMinutes:12,quarters:4,shotClockSeconds:24,scoreLimit:0,winBy:1,allowLateJoin:false};
 assert.deepEqual((await runtime.snapshot(map.id,map)).basketball.settings,defaults);
 for(const settings of [{quarterMinutes:0},{quarterMinutes:2.5},{shotClockSeconds:61},{allowLateJoin:'yes'},{allowLateJoin:true},{homeScore:999}]){
  await assert.rejects(send('alice','basketball-settings',{settings}),/setting|quarter|clock|join|unknown|allow/i);
  assert.deepEqual((await runtime.snapshot(map.id,map)).basketball.settings,defaults);
 }
 const settings={quarterMinutes:4,quarters:2,shotClockSeconds:10,scoreLimit:11,winBy:2,allowLateJoin:false};
 let state=await send('alice','basketball-settings',{settings});
 assert.deepEqual(state.basketball.settings,settings);
 const peer=await send('bob','input',{input:{}});
 assert.deepEqual(peer.basketball.settings,settings);
 state=await send('bob','basketball-start');
 assert.equal(state.basketball.clockMs,240000);
 assert.equal(state.basketball.shotClockMs,10000);
 await assert.rejects(send('alice','basketball-settings',{settings:{quarterMinutes:1}}),/before|live|running|started/i);
 assert.deepEqual((await runtime.snapshot(map.id,map)).basketball.settings,settings);
 state=await send('late','join');
 assert.equal(state.players['account:late'].basketballRole,'spectator');
 await assert.rejects(send('late','basketball-team',{team:'away'}),/before|late|running|live|started/i);
}));
