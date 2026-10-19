import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {BASKETBALL_BALL_ID} from '../public/js/basketball-rules.js';

async function fixture(run){
 const dir=await mkdtemp(join(tmpdir(),'basketball-auto-'));let sequence=0;
 const store=new SharedRoomStore(join(dir,'rooms.json')),map={id:'basketball-arena',publicDestination:true,spawn:{x:0,y:0,z:0},builderScene:{layout:'grand-floor',mapSize:64,objects:[]}};
 const runtime=new AuthoritativeRooms({store,now:()=>100000});
 const send=(who,action,fields={},requestId='auto-'+(++sequence))=>runtime.command(map.id,map,{accountId:who,username:who,walletId:who,stats:{health:100}},{action,requestId,...fields});
 const place=change=>store.update(map.id,room=>{
  const sim=room.simulation,ball=sim.actors[BASKETBALL_BALL_ID];
  for(const [index,player] of Object.values(sim.players).entries()){player.heldId=null;player.position={x:6,y:0,z:8-index*3};player.input={};}
  ball.holderId=null;ball.position={x:0,y:0,z:0};delete ball.ballVelocity;delete ball.ballCatchSegment;delete ball.basketballShot;
  change(sim,ball,sim.players['account:alice']);
 });
 try{
  for(const who of ['alice','bob','cara','dan'])await send(who,'join');
  await send('alice','basketball-settings',{settings:{teamSize:2,homeHumans:2,awayHumans:2}});
  await send('alice','basketball-start');
  await run({runtime,store,map,send,place});
 }finally{await rm(dir,{force:true,recursive:true});}
}

test('auto catches a loose ball and steals an opposing carrier without a shooting selection',()=>fixture(async({send,place})=>{
 await place((_sim,ball,player)=>{player.position={x:0,y:0,z:0};ball.position={x:.5,y:.8,z:0};});
 let state=await send('alice','basketball-auto',{direction:[0,0,-1]});
 assert.equal(state.result.resolvedAction,'catch');assert.equal(state.players['account:alice'].heldId,BASKETBALL_BALL_ID);
 await place((sim,ball,player)=>{player.position={x:0,y:0,z:0};const opponent=sim.players['account:bob'];opponent.position={x:1,y:0,z:0};opponent.heldId=ball.id;ball.holderId=opponent.actorId;});
 state=await send('alice','basketball-auto',{direction:[0,0,-1]});
 assert.equal(state.result.resolvedAction,'basketball-steal');assert.equal(state.result.message,'Basketball stolen.');
 assert.equal(state.players['account:alice'].heldId,BASKETBALL_BALL_ID);assert.equal(state.players['account:bob'].heldId,null);
 assert.equal(state.players['account:alice'].basketballStealAt,100000);
}));

test('auto shoots an aligned held ball and passes when facing an open teammate',()=>fixture(async({send,place})=>{
 await place((_sim,ball,player)=>{player.position={x:0,y:0,z:-8};player.heldId=ball.id;ball.holderId=player.actorId;});
 let state=await send('alice','basketball-auto',{direction:[0,0,-1]});
 assert.equal(state.result.resolvedAction,'basketball-shoot');assert.equal(state.players['account:alice'].heldId,null);
 assert.equal(state.actors[BASKETBALL_BALL_ID].ballLaunch.aimAligned,true);
 await place((sim,ball,player)=>{player.position={x:0,y:0,z:0};player.heldId=ball.id;ball.holderId=player.actorId;sim.players['account:cara'].position={x:5,y:0,z:0};});
 state=await send('alice','basketball-auto',{direction:[1,0,0]});
 assert.equal(state.result.resolvedAction,'toss');assert.equal(state.result.actionLabel,'Pass');assert.equal(state.result.message,'Basketball passed.');
 assert.equal(state.actors[BASKETBALL_BALL_ID].ballLaunch.angle,20);assert.ok(state.actors[BASKETBALL_BALL_ID].ballVelocity.x>0);
}));

test('auto uses actual execution possession and duplicate request IDs cannot run the next action',()=>fixture(async({send,place,store,map})=>{
 await place((_sim,ball,player)=>{player.position={x:0,y:0,z:-8};ball.position={x:0,y:.8,z:-8};});
 // Stale client hints cannot turn an empty hand into a shot or choose a fake ball.
 const fields={direction:[0,0,-1],resolvedAction:'basketball-shoot',heldId:BASKETBALL_BALL_ID,entityId:'old-ball'};
 let state=await send('alice','basketball-auto',fields,'one-trigger');
 assert.equal(state.result.resolvedAction,'catch');assert.equal(state.players['account:alice'].heldId,BASKETBALL_BALL_ID);
 state=await send('alice','basketball-auto',fields,'one-trigger');
 assert.equal(state.result.resolvedAction,'catch');assert.equal(state.players['account:alice'].heldId,BASKETBALL_BALL_ID);
 assert.equal(state.actors[BASKETBALL_BALL_ID].ballVelocity,undefined);
 assert.equal((await store.get(map.id)).simulation.receipts['account:alice:one-trigger'].action,'basketball-auto');
 await assert.rejects(send('alice','basketball-shoot',{},'one-trigger'),/Request ID already used/);
 // A stale empty-handed hint cannot hide a valid shot after possession changed.
 state=await send('alice','basketball-auto',{direction:[0,0,-1],heldId:null,resolvedAction:'catch'});
 assert.equal(state.result.resolvedAction,'basketball-shoot');
}));

test('auto leaves spectators, teammates, cooldowns, blocked carriers and out-of-range balls protected',()=>fixture(async({send,place,runtime,map})=>{
 await send('viewer','join');
 await assert.rejects(send('viewer','basketball-auto',{direction:[0,0,-1]}),/spectator|team/i);
 await place((sim,ball,player)=>{player.position={x:0,y:0,z:0};const teammate=sim.players['account:cara'];teammate.position={x:1,y:0,z:0};teammate.heldId=ball.id;ball.holderId=teammate.actorId;});
 let state=await send('alice','basketball-auto',{direction:[0,0,-1]});
 assert.equal(state.result.resolvedAction,null);assert.equal(state.actors[BASKETBALL_BALL_ID].holderId,'account:cara');
 await place((sim,ball,player)=>{player.position={x:0,y:0,z:0};player.basketballStealAt=99900;const opponent=sim.players['account:bob'];opponent.position={x:1,y:0,z:0};opponent.heldId=ball.id;ball.holderId=opponent.actorId;});
 state=await send('alice','basketball-auto',{direction:[0,0,-1]});
 assert.equal(state.result.resolvedAction,null);assert.equal(state.actors[BASKETBALL_BALL_ID].holderId,'account:bob');
 await place((sim,ball,player)=>{player.position={x:0,y:0,z:0};delete player.basketballStealAt;const opponent=sim.players['account:bob'];opponent.position={x:1,y:0,z:0};opponent.heldId=ball.id;ball.holderId=opponent.actorId;});
 const blocksShot=runtime.collision.blocksShot;runtime.collision.blocksShot=()=>true;
 try{state=await send('alice','basketball-auto',{direction:[0,0,-1]});}finally{runtime.collision.blocksShot=blocksShot;}
 assert.equal(state.result.resolvedAction,null);assert.equal(state.actors[BASKETBALL_BALL_ID].holderId,'account:bob');
 await place((_sim,ball,player)=>{player.position={x:0,y:0,z:0};ball.position={x:6,y:0,z:0};});
 state=await send('alice','basketball-auto',{direction:[0,0,-1]});
 assert.equal(state.result.resolvedAction,null);assert.match(state.result.message,/closer/i);assert.equal(state.players['account:alice'].heldId,null);
 assert.equal((await runtime.snapshot(map.id,map)).basketball.homeScore,0);
}));

test('auto validates launch controls and direction before empty-hand resolution',()=>fixture(async({send,place})=>{
 await place((_sim,ball,player)=>{player.position={x:0,y:0,z:0};ball.position={x:.5,y:.8,z:0};});
 for(const fields of [{power:2},{angle:5},{mode:'perfect'},{direction:[1,0]},{direction:[0,'bad',-1]},{direction:null}]){
  await assert.rejects(send('alice','basketball-auto',fields),/power|angle|mode|direction/i);
 }
 const state=await send('alice','basketball-auto',{direction:[0,0,-1]});
 assert.equal(state.result.resolvedAction,'catch');
}));
