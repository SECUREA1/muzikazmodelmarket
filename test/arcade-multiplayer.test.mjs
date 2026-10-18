import test from 'node:test';
import assert from 'node:assert/strict';
import {deviceCommand,advanceDevicePlayback} from '../server-interactive-devices.mjs';
import {projectArcadeDevices} from '../server-arcade-games.mjs';
import {INTERACTIVE_DEVICES,deviceScreenGamer} from '../public/js/interactive-devices.js';
import {COOP_GAMES} from '../public/js/arcade-multiplayer.js';
function fixture(type='tictactoe'){
 const sim={players:Object.fromEntries(['a','b','c'].map(id=>[id,{username:id,position:{x:0,y:0,z:1},lastSeen:1000,health:100}])),actors:{m:{id:'m',active:true,position:{x:0,y:0,z:0}}}};
 const modelId=Object.entries(INTERACTIVE_DEVICES).find(([,p])=>p.game===type)?.[0]||'tic-tac-toe-cabinet';
 const manifest={actors:[{objectId:'m',modelId,gameplay:{device:'commons-arcade'}}]};let clock=1000;
 const send=(id,operation,fields={})=>{clock+=200;return deviceCommand(sim,manifest,sim.players[id],id,{entityId:'m',revision:sim.devices?.m?.revision||0,operation,...fields},clock);};
 send('a','select-game',{gameId:type});
 return {sim,send,state:sim.devices.m};
}
function start(f){f.send('a','create-match');f.send('b','join-match');f.send('a','ready-match');f.send('b','ready-match');f.send('a','start-match');}
test('two distinct nearby players must join and ready; spectators cannot control or replace a match',()=>{
 const f=fixture(),{send,state,sim}=f;send('a','create-match');assert.throws(()=>send('a','start-match'),/ready/);send('b','join-match');assert.throws(()=>send('b','join-match'),/already/);assert.throws(()=>send('c','join-match'),/occupied/);
 send('a','ready-match');assert.throws(()=>send('a','start-match'),/ready/);send('b','ready-match');assert.throws(()=>send('b','start-match'),/host/);send('a','start-match');
 assert.throws(()=>send('b','cell',{index:0}),/turn/);assert.throws(()=>send('c','cell',{index:0}),/seat/);assert.throws(()=>send('a','select-game',{gameId:'memory'}),/Finish/);
 send('a','cell',{index:0});assert.equal(state.gamers.a.game.board.filter(Boolean).length,1);assert.throws(()=>send('a','cell',{index:1}),/turn/);send('b','cell',{index:3});send('a','cell',{index:1});send('b','cell',{index:4});send('a','cell',{index:2});
 assert.equal(state.match.phase,'finished');assert.equal(state.gamers.a.game.winner,1);assert.equal(state.activePlayerId,'a');
 const snapshot=projectArcadeDevices(sim.devices);assert.equal(deviceScreenGamer(snapshot.m).game.message,'Player 1 wins');
 send('a','ready-match');send('b','ready-match');send('a','start-match');assert.equal(state.gamers.a.game.moves,0);
});
test('connect four alternates human pieces and detects a winner without a CPU move',()=>{
 const f=fixture('connect4');start(f);for(const [id,index]of [['a',0],['b',1],['a',0],['b',1],['a',0],['b',1],['a',0]])f.send(id,'column',{index});assert.equal(f.state.gamers.a.game.winner,1);assert.equal(f.state.gamers.a.game.moves,7);
});
test('pong independently controls both paddles and advances only on the server clock',()=>{
 const f=fixture('pong');start(f);f.send('a','up');f.send('b','down');let g=f.state.gamers.a.game;assert.equal(g.paddle,4);assert.equal(g.cpu,6);assert.equal(g.moves,0);assert.throws(()=>f.send('b','step'),/Finish/);
 advanceDevicePlayback(f.sim,f.state.nextStepAt);g=f.state.gamers.a.game;assert.equal(g.cpu,6);assert.equal(g.moves,1);
 g.ball=11;g.dx=-1;g.dy=0;g.paddle=8;advanceDevicePlayback(f.sim,f.state.nextStepAt);assert.equal(f.state.gamers.a.game.winner,2);advanceDevicePlayback(f.sim,f.state.nextStepAt+250);assert.equal(f.state.match.phase,'finished');
});
test('co-op allows joining during play and shares one masked puzzle with server revision protection',()=>{
 const f=fixture('memory');f.send('a','create-match');f.send('a','ready-match');f.send('a','start-match');f.send('a','cell',{index:0});f.send('b','join-match');f.send('b','cell',{index:1});
 assert.deepEqual(f.state.gamers.a.game.shown,[0,1]);assert.equal(f.state.gamers.b,undefined);assert.equal(projectArcadeDevices(f.sim.devices).m.gamers.a.game.board.filter(v=>v!==null).length,2);
 assert.throws(()=>f.send('a','cell',{index:2,revision:0}),/Device changed/);f.send('a','cell',{index:2});assert.equal(f.state.gamers.a.game.moves,3);
});
test('all cooperative games initialize one server-owned shared round',()=>{
 for(const gameId of COOP_GAMES){const f=fixture(gameId);start(f);assert.equal(f.state.gamers.a.game.type,gameId);assert.equal(f.state.match.mode,'coop');assert.equal(f.state.running,false);}
});
test('leave, distance, disconnect and idle timeout release the cabinet safely',()=>{
 for(const exit of ['leave','distance','disconnect','idle']){const f=fixture('pong');start(f);if(exit==='leave')f.send('b','leave-match');else{if(exit==='distance')f.sim.players.b.position.x=50;if(exit==='disconnect')delete f.sim.players.b;advanceDevicePlayback(f.sim,exit==='idle'?200000:3000);}assert.equal(f.state.match,null);assert.equal(f.state.running,false);f.send('c','start');assert.equal(f.state.activePlayerId,'c');}
 const f=fixture();f.send('a','create-match');f.sim.players.b.position.x=30;assert.throws(()=>f.send('b','join-match'),/reach/);
});
test('rejected moves do not change turns, boards or credit balances',()=>{
 const f=fixture();start(f);const before=structuredClone(f.state);assert.throws(()=>f.send('a','cell',{index:-1}),/valid/);assert.deepEqual(f.state,before);
 f.send('a','cell',{index:0});const occupied=structuredClone(f.state);assert.throws(()=>f.send('b','cell',{index:0}),/empty/);assert.deepEqual(f.state,occupied);
 f.send('b','cell',{index:3});assert.equal(f.state.gamers.a.credits,100);
});
test('both Pong players may send a recent clock revision, but spectators cannot use it',()=>{
 const f=fixture('pong');start(f);const revision=f.state.revision;advanceDevicePlayback(f.sim,f.state.nextStepAt);f.send('b','up',{revision});assert.equal(f.state.gamers.a.game.cpu,4);assert.throws(()=>f.send('c','down',{revision}),/seat/);
});
test('standalone cabinets support the same shared lobby and unsupported private games remain solo',()=>{
 const sim={players:{a:{username:'a',position:{x:0,y:0,z:1},lastSeen:1000,health:100}},actors:{m:{id:'m',active:true,position:{x:0,y:0,z:0}}}};
 const manifest={actors:[{objectId:'m',modelId:'tic-tac-toe-cabinet',gameplay:{}}]};deviceCommand(sim,manifest,sim.players.a,'a',{entityId:'m',operation:'create-match',revision:0},1000);assert.equal(sim.devices.m.match.mode,'versus');
 const f=fixture('blackjack');assert.throws(()=>f.send('a','create-match'),/solo/);assert.equal(f.state.match,undefined);
});
