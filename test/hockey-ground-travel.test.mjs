import test from 'node:test';
import assert from 'node:assert/strict';
import {createHockey,joinHockey,relocateHockeyPlayer,RINK} from '../public/js/hockey-rules.js';
import {LocalHockeyMotion} from '../public/js/hockey-local-motion.js';
import {HockeyRooms} from '../hockey-rooms.mjs';

function match(){const state=createHockey({aiFill:false}),player=joinHockey(state,'you');state.phase='playing';return {state,player};}

test('ice relocation reaches the exact point and resets momentum, input and possession',()=>{
 const {state,player}=match();player.vx=6;player.vz=-4;player.input={x:1,shoot:true};state.puck.owner=player.id;const puck={x:state.puck.x,z:state.puck.z};
 relocateHockeyPlayer(state,'you',{x:3.25,y:.005,z:2.5});
 assert.equal(player.x,3.25);assert.equal(player.z,2.5);assert.equal(player.vx,0);assert.equal(player.vz,0);assert.deepEqual(player.input,{});assert.equal(player.movementRevision,1);assert.equal(state.puck.owner,null);assert.equal(state.puck.x,puck.x);assert.equal(state.puck.z,puck.z);
});

test('invalid ice destinations and unavailable skaters cannot relocate or alter the match',()=>{
 const {state,player}=match(),other=state.players.find(p=>p!==player&&p.onIce);
 for(const position of [{x:NaN,y:0,z:0},{x:'3',y:0,z:0},{x:3,y:2,z:2},{x:100,y:0,z:0},{x:RINK.length/2-1,y:0,z:RINK.width/2-1},{x:RINK.goalX,y:0,z:0},{x:other.x,y:0,z:other.z}]){
  const before=structuredClone(state);assert.throws(()=>relocateHockeyPlayer(state,'you',position));assert.deepEqual(state,before);
 }
 for(const unavailable of [{phase:'faceoff'},{phase:'timeout'},{phase:'finished'},{onIce:false},{penalty:120},{ejected:true},{misconduct:120}]){
  const f=match();if(unavailable.phase)f.state.phase=unavailable.phase;else Object.assign(f.player,unavailable);
  assert.throws(()=>relocateHockeyPlayer(f.state,'you',{x:3,y:.005,z:2}));
 }
 assert.throws(()=>relocateHockeyPlayer(state,'spectator',{x:3,y:0,z:2}),/Join/);
 assert.equal(player.movementRevision,undefined);
});

test('live ice relocation rotates input ownership and ignores old in-flight commands',()=>{
 const rooms=new HockeyRooms({now:()=>1000}),environment={hockey:{aiFill:false}},identity={accountId:'you',username:'You'},joined=rooms.command('rink',environment,identity,{action:'join'});
 rooms.rooms.get('rink').state.phase='playing';
 rooms.command('rink',environment,identity,{action:'input',inputEpoch:joined.inputEpoch,inputSequence:10,input:{x:1,shoot:true}});
 const moved=rooms.command('rink',environment,identity,{action:'teleport-floor',position:{x:3,y:.005,z:2}}),self=()=>rooms.rooms.get('rink').state.players.find(p=>p.human===moved.selfId);
 assert.notEqual(moved.inputEpoch,joined.inputEpoch);assert.equal(self().x,3);assert.equal(self().z,2);assert.deepEqual(self().input,{});
 rooms.command('rink',environment,identity,{action:'input',inputEpoch:joined.inputEpoch,inputSequence:999,input:{x:-1,shoot:true}});
 assert.deepEqual(self().input,{});
 rooms.command('rink',environment,identity,{action:'input',inputEpoch:moved.inputEpoch,inputSequence:11,input:{x:.5}});assert.equal(self().input.x,.5);
 const spectator={accountId:'watcher',username:'Watcher'};rooms.command('rink',environment,spectator,{action:'spectate'});
 assert.throws(()=>rooms.command('rink',environment,spectator,{action:'teleport-floor',position:{x:5,y:0,z:4}}),/Spectators/);
});

test('short ice relocation discards local interpolation and snaps on the first sample',()=>{
 const {state,player}=match(),motion=new LocalHockeyMotion();motion.accept(state,'you',{receivedAt:100});motion.sample(116,1/60,{x:1,z:0});
 const destination={x:player.x+.8,y:.005,z:player.z+.4};relocateHockeyPlayer(state,'you',destination);
 motion.accept(state,'you',{receivedAt:130});const visible=motion.sample(130,0,{});
 assert.equal(visible.x,destination.x);assert.equal(visible.z,destination.z);assert.equal(visible.vx,0);assert.equal(visible.vz,0);assert.deepEqual(motion.offset,{x:0,z:0});
});
