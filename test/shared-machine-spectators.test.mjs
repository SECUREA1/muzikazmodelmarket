import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {deviceCommand,advanceDevicePlayback} from '../server-interactive-devices.mjs';
import {deviceScreenGamer,deviceTime,INTERACTIVE_DEVICES} from '../public/js/interactive-devices.js';
import {projectArcadeDevices} from '../server-arcade-games.mjs';
function fixture(kind='snake'){
 const modelId=Object.entries(INTERACTIVE_DEVICES).find(([,item])=>item.game===kind)?.[0]||kind;
 const alice={username:'Alice',position:{x:0,y:0,z:1},health:100,lastSeen:1000},bob={...alice,position:{...alice.position},username:'Bob'};
 const sim={players:{alice,bob},actors:{machine:{id:'machine',active:true,position:{x:0,y:0,z:0}}}},manifest={actors:[{objectId:'machine',modelId,gameplay:{behavior:'interact'}}]};
 const send=(who,operation,now=1000,fields={})=>deviceCommand(sim,manifest,sim.players[who],who,{entityId:'machine',requestId:'r-'+now,operation,revision:sim.devices?.machine?.revision||0,...fields},now);
 return {sim,send};
}
test('motion cabinets advance from server time with no open dialog or client step messages',()=>{
 for(const type of ['snake','pong','breakout']){
  const {sim,send}=fixture(type);send('alice','start');const state=sim.devices.machine,game=state.gamers.alice.game;
  advanceDevicePlayback(sim,1249);assert.equal(state.gamers.alice.game.moves,game.moves);
  advanceDevicePlayback(sim,1250);assert.ok(state.gamers.alice.game.moves>game.moves);assert.throws(()=>send('alice','step',1450),/server/);
  send('alice','pause',1700);const paused=structuredClone(state.gamers.alice.game);advanceDevicePlayback(sim,2000);assert.deepEqual(state.gamers.alice.game,paused);
  send('alice','resume',2200);advanceDevicePlayback(sim,2450);assert.ok(state.gamers.alice.game.moves>paused.moves);
 }
});
test('spectators receive the same active game and cannot replace a nearby live player',()=>{
 const {sim,send}=fixture('memory');send('alice','start');send('bob','open',1100);assert.throws(()=>send('bob','start',1300),/in use/);
 send('alice','cell',1400,{index:0});const one=projectArcadeDevices(sim.devices),two=projectArcadeDevices(sim.devices);
 assert.deepEqual(deviceScreenGamer(one.machine),deviceScreenGamer(two.machine));assert.equal(deviceScreenGamer(two.machine).name,'Alice');assert.equal(deviceScreenGamer(two.machine).game.board.filter(card=>card!==null).length,1);
 sim.players.alice.position.x=20;send('bob','start',1700);assert.equal(sim.devices.machine.activePlayerId,'bob');assert.equal(deviceScreenGamer(projectArcadeDevices(sim.devices).machine).name,'Bob');
});
test('snake direction inputs do not speed the clock and abandoned sessions stop advancing',()=>{
 const {sim,send}=fixture();send('alice','start');const state=sim.devices.machine,head=state.gamers.alice.game.body[0];send('alice','up',1200);assert.equal(state.gamers.alice.game.body[0],head);advanceDevicePlayback(sim,1250);assert.notEqual(state.gamers.alice.game.body[0],head);
 sim.players.alice.lastSeen=-20000;advanceDevicePlayback(sim,1500);assert.equal(state.running,false);
});
test('all viewers share server media timing, pause and seek state',()=>{
 const {sim,send}=fixture('shared-video-player');send('alice','enqueue',1000,{url:'https://media.example/live.mp4'});assert.equal(deviceTime(sim.devices.machine,4000),3);send('bob','pause',4000);assert.equal(deviceTime(sim.devices.machine,9000),3);send('alice','seek',5000,{seconds:25});assert.equal(deviceTime(sim.devices.machine,10000),25);
});
test('live UI does not advance motion or mount a local demo and camera screens reattach on rebuild',async()=>{
 const ui=await readFile(new URL('../public/js/interactive-device-ui.js',import.meta.url),'utf8'),camera=await readFile(new URL('../public/js/live-camera-screens.js',import.meta.url),'utf8');
 assert.ok(!ui.includes("command('step')"));assert.ok(!ui.slice(ui.indexOf('function open('),ui.indexOf('function disposePlayer')).includes('mountDeviceDemo('));assert.ok(ui.includes('const game=deviceScreenGamer(current)?.game'));assert.ok(camera.includes('view.root!==root'));
});
test('every arcade type and practice machine publishes the current operator session',()=>{
 const profiles=Object.entries(INTERACTIVE_DEVICES).filter(([,profile])=>['arcade','slots','poker','trivia'].includes(profile.kind));assert.ok(profiles.length>=15);
 for(const [id,profile]of profiles){
  const {sim,send}=fixture(profile.kind==='arcade'?profile.game:id);const operation=profile.kind==='arcade'?'start':profile.kind==='slots'?'spin':profile.kind==='poker'?'deal':'answer';send('alice',operation,1000,{answer:0});
  const projected=projectArcadeDevices(sim.devices),viewer=deviceScreenGamer(projected.machine);assert.equal(viewer.name,'Alice',id);assert.equal(projected.machine.activePlayerId,'alice',id);if(viewer.game)assert.equal(viewer.game.deck,undefined,id);
 }
});
test('server catch-up work is bounded and round limits cannot crash room simulation',()=>{
 const {sim,send}=fixture('pong');send('alice','start');const state=sim.devices.machine;advanceDevicePlayback(sim,5000);assert.ok(state.gamers.alice.game.moves<=4);
 state.gamers.alice.game={...state.gamers.alice.game,done:false,moves:1000};state.running=true;state.nextStepAt=5000;advanceDevicePlayback(sim,5250);assert.equal(state.running,false);assert.equal(state.gamers.alice.game.done,true);
});
test('a server clock revision does not reject a recent owner direction input',()=>{
 const {sim,send}=fixture();send('alice','start');const revision=sim.devices.machine.revision;advanceDevicePlayback(sim,1250);
 assert.doesNotThrow(()=>send('alice','up',1450,{revision}));assert.throws(()=>send('bob','up',1700,{revision}),/in use/);
 assert.throws(()=>send('alice','down',1900,{revision:-1}),/changed/);
});
