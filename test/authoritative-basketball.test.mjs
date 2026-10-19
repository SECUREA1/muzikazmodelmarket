import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {BASKETBALL_BALL_ID,basketballSoloSettings} from '../public/js/basketball-rules.js';

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
 await assert.rejects(send('bob','basketball-start'),{statusCode:403});
 state=await send('alice','basketball-start');assert.equal(state.basketball.state,'live');assert.equal(state.basketball.quarter,1);assert.equal(state.basketball.clockMs,720000);
 await assert.rejects(send('alice','basketball-start'),/already running/);
 await assert.rejects(send('alice','basketball-team',{team:'away'}),/Change teams/);
 await assert.rejects(send('alice','fire',{tool:'laser',direction:[0,0,-1]}),/sports court/);
 state=await send('alice','spawn',{sku:'backpack:basketball'});assert.equal(state.result.spawnedId,BASKETBALL_BALL_ID);assert.equal(Object.values(state.actors).filter(actor=>actor.basketballMatchBall).length,1);assert.deepEqual(charged,[]);
 assert.equal((await runtime.snapshot(map.id,map)).players['account:bob'].basketballJersey,'away');
}));

test('opening the basketball server menu does not claim a team or host until Join is chosen',()=>fixture(async({send,advance,runtime,map})=>{
 let state=await send('viewer','join',{basketballEntry:'menu'});
 assert.equal(state.players['account:viewer'].basketballRole,'spectator');
 assert.equal(state.players['account:viewer'].basketballTeam,null);
 assert.equal(state.basketball.hostId,null);
 const clock=state.basketball.clockMs;
 advance(5000);state=await send('viewer','input',{input:{}});
 assert.equal(state.basketball.state,'ready');assert.equal(state.basketball.clockMs,clock);
 await assert.rejects(send('viewer','basketball-start'),/Spectators/);
 state=await send('host','join',{basketballEntry:'menu'});
 assert.equal(state.basketball.hostId,null);
 state=await send('host','basketball-team',{team:'home'});
 assert.equal(state.basketball.hostId,'account:host');
 state=await send('host','basketball-start');
 assert.equal(state.basketball.state,'live');
 assert.equal(Object.values(state.players).filter(player=>player.basketballAI).length,9);
 assert.equal(state.players['account:viewer'].basketballRole,'spectator');
 const matchId=state.basketball.matchId;
 await assert.rejects(send('viewer','join',{basketballRole:'player',basketballTeam:'away'}),/Late arrivals/);
 state=await runtime.snapshot(map.id,map);assert.equal(state.basketball.matchId,matchId);assert.equal(state.players['account:viewer'].basketballRole,'spectator');
 state=await send('viewer','basketball-join-spot',{team:'away'});
 assert.equal(state.players['account:viewer'].basketballTeam,'away');assert.equal(state.basketball.matchId,matchId);
 assert.equal(Object.values(state.players).filter(player=>player.basketballAI).length,8);
}));

test('basketball menu reconnects preserve the chosen role and explicit Join and Spectate remain authoritative',()=>fixture(async({send,runtime,map})=>{
 let state=await send('host','join');
 state=await send('viewer','join',{basketballRole:'spectator'});
 assert.equal(state.basketball.hostId,'account:host');assert.equal(state.players['account:viewer'].basketballTeam,null);
 const watchingPosition={...state.players['account:viewer'].position};
 for(const fields of [{basketballEntry:'menu'},{}]){
  state=await send('viewer','join',fields);
  assert.equal(state.players['account:viewer'].basketballRole,'spectator');
  assert.deepEqual(state.players['account:viewer'].position,watchingPosition);
  assert.equal(state.basketball.hostId,'account:host');
 }
 state=await send('viewer','join',{basketballRole:'player',basketballTeam:'away'});
 assert.equal(state.players['account:viewer'].basketballRole,'player');assert.equal(state.players['account:viewer'].basketballTeam,'away');
 state=await send('viewer','join',{basketballEntry:'menu'});
 assert.equal(state.players['account:viewer'].basketballRole,'player');assert.equal(state.players['account:viewer'].basketballTeam,'away');
 state=await send('host','join',{basketballRole:'spectator'});
 assert.equal(state.players['account:host'].basketballRole,'spectator');assert.equal(state.basketball.hostId,'account:viewer');
 for(const fields of [{basketballRole:'free-play'},{basketballRole:'player',basketballTeam:'other'}])await assert.rejects(send('new','join',fields),{statusCode:422});
 state=await runtime.snapshot(map.id,map);assert.equal(state.players['account:new'],undefined);
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

test('the last human can spectate a continuing full AI match and take a player spot again',()=>fixture(async({send,runtime,map,advance})=>{
 await send('host','join');await send('host','basketball-start');await send('host','catch');
 let state=await send('host','basketball-watch');
 const matchId=state.basketball.matchId,clock=state.basketball.clockMs;
 const positions=Object.fromEntries(Object.values(state.players).filter(player=>player.basketballAI).map(player=>[player.id,{...player.position}]));
 for(let tick=0;tick<5;tick++){advance(100);state=await send('host','input',{input:{}});}
 assert.equal(state.players['account:host'].basketballRole,'spectator');assert.equal(state.players['account:host'].heldId,null);
 assert.equal(state.basketball.hostId,null);assert.equal(state.basketball.matchId,matchId);assert.ok(state.basketball.clockMs<clock);
 const bots=Object.values(state.players).filter(player=>player.basketballAI);
 assert.equal(bots.length,10);
 for(const team of ['home','away'])assert.equal(bots.filter(player=>player.basketballTeam===team).length,5);
 assert.ok(bots.some(bot=>positions[bot.id]&&Math.hypot(bot.position.x-positions[bot.id].x,bot.position.z-positions[bot.id].z)>.01));
 assert.ok(state.players[state.actors[BASKETBALL_BALL_ID].holderId]?.basketballAI,'an AI retains live possession when the last human watches');
 for(const action of ['catch','interact','basketball-shoot','basketball-steal'])await assert.rejects(send('host',action,{entityId:BASKETBALL_BALL_ID}),/Spectators/);
 const beforeJoinClock=state.basketball.clockMs;
 state=await send('host','basketball-join-spot',{team:'home'});
 assert.equal(state.players['account:host'].basketballRole,'player');assert.equal(state.players['account:host'].basketballTeam,'home');
 assert.equal(Object.values(state.players).filter(player=>player.basketballAI).length,9);
 assert.equal(state.basketball.matchId,matchId);assert.equal(state.basketball.clockMs,beforeJoinClock);
 assert.equal((await runtime.snapshot(map.id,map)).basketball.state,'live');
}));

test('shared basketball settings validate atomically, control tip-off and lock during play',()=>fixture(async({send,runtime,map})=>{
 await send('alice','join');await send('bob','join');
 const defaults={quarterMinutes:12,quarters:4,shotClockSeconds:24,scoreLimit:0,winBy:1,allowLateJoin:false,teamSize:5,homeHumans:5,awayHumans:5,aiDifficulty:3};
 assert.deepEqual((await runtime.snapshot(map.id,map)).basketball.settings,defaults);
 for(const settings of [{quarterMinutes:0},{quarterMinutes:2.5},{shotClockSeconds:61},{allowLateJoin:'yes'},{allowLateJoin:true},{homeScore:999}]){
  await assert.rejects(send('alice','basketball-settings',{settings}),/setting|quarter|clock|join|unknown|allow/i);
  assert.deepEqual((await runtime.snapshot(map.id,map)).basketball.settings,defaults);
 }
 const settings={quarterMinutes:4,quarters:2,shotClockSeconds:10,scoreLimit:11,winBy:2,allowLateJoin:false,teamSize:5,homeHumans:5,awayHumans:5,aiDifficulty:3};
 let state=await send('alice','basketball-settings',{settings});
 assert.deepEqual(state.basketball.settings,settings);
 const peer=await send('bob','input',{input:{}});
 assert.deepEqual(peer.basketball.settings,settings);
 state=await send('alice','basketball-start');
 assert.equal(state.basketball.clockMs,240000);
 assert.equal(state.basketball.shotClockMs,10000);
 await assert.rejects(send('alice','basketball-settings',{settings:{quarterMinutes:1}}),/before|live|running|started/i);
 assert.deepEqual((await runtime.snapshot(map.id,map)).basketball.settings,settings);
 state=await send('late','join');
 assert.equal(state.players['account:late'].basketballRole,'spectator');
 await assert.rejects(send('late','basketball-team',{team:'away'}),/before|late|running|live|started/i);
}));

test('solo setup replicates AI identities, jerseys and movement while reserving human capacity',()=>fixture(async({send,runtime,map,advance})=>{
 await send('alice','join');
 await send('alice','basketball-settings',{settings:{teamSize:2,homeHumans:1,awayHumans:0,aiDifficulty:4}});
 let state=await send('alice','basketball-start');
 const bots=Object.values(state.players).filter(p=>p.basketballAI);
 assert.equal(bots.length,3);assert.ok(bots.every(p=>p.basketballJersey===p.basketballTeam&&p.basketballNumber));
 const positions=Object.fromEntries(bots.map(p=>[p.id,{...p.position}]));
 advance(100);state=await runtime.snapshot(map.id,map);
 assert.ok(Object.values(state.players).some(p=>p.basketballAI&&Math.hypot(p.position.x-positions[p.id].x,p.position.z-positions[p.id].z)>0));
 state=await send('bob','join');assert.equal(state.players['account:bob'].basketballRole,'spectator');
 assert.equal(Object.values(state.players).filter(p=>p.basketballRole!=='spectator').length,4);
 assert.equal(state.basketball.settings.aiDifficulty,4);
}));


test('a live spectator explicitly takes an AI spot without resetting the match',()=>fixture(async({send,runtime,map,advance})=>{
 await send('alice','join');await send('alice','basketball-start');
 let state=await send('viewer','join');assert.equal(state.players['account:viewer'].basketballRole,'spectator');
 const matchId=state.basketball.matchId,score=[state.basketball.homeScore,state.basketball.awayScore];
 state=await send('viewer','basketball-join-spot',{team:'away'});
 assert.equal(state.players['account:viewer'].basketballTeam,'away');assert.equal(state.players['account:viewer'].basketballRole,'player');
 assert.equal(Object.values(state.players).filter(p=>p.basketballAI&&p.basketballTeam==='away').length,4);
 assert.equal(state.basketball.matchId,matchId);assert.deepEqual([state.basketball.homeScore,state.basketball.awayScore],score);
 await send('viewer','basketball-watch');advance(40);state=await runtime.snapshot(map.id,map);
 assert.equal(Object.values(state.players).filter(p=>p.basketballAI&&p.basketballTeam==='away').length,5);
}));

test('a player steals the AI-held game ball through the authoritative command',()=>fixture(async({send,store,map})=>{
 await send('alice','join');await send('alice','basketball-start');
 let botId,ballId;await store.update(map.id,room=>{const sim=room.simulation,player=sim.players['account:alice'],bot=Object.values(sim.players).find(p=>p.basketballAI&&p.basketballTeam!==player.basketballTeam);botId=bot.actorId;ballId=sim.basketball.ballId;for(const p of Object.values(sim.players))p.heldId=null;player.position={x:0,y:0,z:0};bot.position={x:1,y:0,z:0};bot.heldId=ballId;sim.actors[ballId].holderId=botId;sim.actors[ballId].position={x:1,y:1,z:0};});
 const state=await send('alice','basketball-steal');assert.equal(state.actors[ballId].holderId,'account:alice');assert.equal(state.players[botId].heldId,null);assert.equal(state.players['account:alice'].heldId,ballId);assert.equal(state.basketball.possession,'home');
}));

test('native basketball keeps the pregame lobby paused and reserves setup and start for its host',()=>fixture(async({send,advance})=>{
 const first=await send('alice','join');let state=await send('bob','join');
 assert.equal(state.basketball.hostId,'account:alice');assert.equal(state.basketball.hostName,'alice');
 advance(8000);state=await send('bob','input',{input:{}});
 assert.equal(state.basketball.state,'ready');assert.equal(state.basketball.clockMs,first.basketball.clockMs);
 await assert.rejects(send('bob','basketball-start'),{statusCode:403});
 await assert.rejects(send('bob','basketball-settings',{settings:{aiDifficulty:5}}),{statusCode:403});
 state=await send('alice','basketball-watch');assert.equal(state.basketball.hostId,'account:bob');assert.equal(state.basketball.hostName,'bob');
 await assert.rejects(send('alice','basketball-start'),/Spectators/);
 state=await send('bob','basketball-settings',{settings:{quarterMinutes:2}});assert.equal(state.basketball.state,'ready');
 state=await send('bob','basketball-start');assert.equal(state.basketball.state,'live');assert.equal(state.basketball.clockMs,120000);
}));

test('an expired basketball host transfers to a connected player before tip-off',()=>fixture(async({send,advance})=>{
 await send('alice','join');await send('bob','join');advance(14000);await send('bob','input',{input:{}});advance(2000);
 const state=await send('bob','basketball-start');assert.equal(state.basketball.hostId,'account:bob');assert.equal(state.basketball.state,'live');
 assert.equal(state.players['account:alice'],undefined);assert.equal(Object.values(state.players).filter(player=>player.basketballAI).length,9);
}));

test('solo basketball setup reserves one real player and fills both equal teams with AI',()=>fixture(async({send})=>{
 let state=await send('alice','join');const settings=basketballSoloSettings({...state.basketball.settings,teamSize:3,aiDifficulty:4},'home');
 state=await send('alice','basketball-settings',{settings});assert.equal(state.basketball.settings.homeHumans,1);assert.equal(state.basketball.settings.awayHumans,0);
 state=await send('alice','basketball-start');assert.equal(Object.values(state.players).filter(player=>player.basketballAI).length,5);
 for(const team of ['home','away'])assert.equal(Object.values(state.players).filter(player=>player.basketballTeam===team).length,3);
 assert.deepEqual({home:basketballSoloSettings(settings,'away').homeHumans,away:basketballSoloSettings(settings,'away').awayHumans},{home:0,away:1});
}));

test('a lone multiplayer host begins immediately with all nine unclaimed human positions filled by AI',()=>fixture(async({send,advance,runtime,map})=>{
 let state=await send('host','join');
 assert.equal(state.basketball.state,'ready');assert.equal(state.basketball.hostId,'account:host');
 assert.equal(state.basketball.settings.homeHumans,5);assert.equal(state.basketball.settings.awayHumans,5);
 const clock=state.basketball.clockMs;
 advance(5000);state=await send('host','input',{input:{}});assert.equal(state.basketball.clockMs,clock,'the host can keep waiting without starting');
 state=await send('host','basketball-start',{},'single-host-begin');
 assert.equal(state.basketball.state,'live');assert.equal(state.basketball.clockMs,clock);
 const roster=Object.values(state.players);assert.equal(roster.filter(player=>player.basketballAI).length,9);assert.equal(roster.filter(player=>!player.basketballAI&&player.basketballRole!=='spectator').length,1);
 for(const team of ['home','away'])assert.equal(roster.filter(player=>player.basketballTeam===team).length,5);
 assert.equal(state.basketball.settings.homeHumans,5,'Begin preserves the selected lobby setup');assert.equal(state.basketball.settings.awayHumans,5);
 const matchId=state.basketball.matchId;
 state=await send('host','basketball-start',{},'single-host-begin');assert.equal(state.basketball.matchId,matchId,'a retried Begin does not create another match');
 advance(1000);state=await runtime.snapshot(map.id,map);assert.ok(state.basketball.clockMs<clock,'play advances immediately with one human');
 state=await send('visitor','join');assert.equal(state.players['account:visitor'].basketballRole,'spectator');
 assert.equal(Object.values(state.players).filter(player=>player.basketballRole!=='spectator').length,10,'late arrival does not enlarge either team');
}));
