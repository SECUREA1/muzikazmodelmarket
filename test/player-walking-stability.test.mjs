import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {ServerMotion} from '../public/js/server-motion.js';

async function fixture(t){
 const directory=await mkdtemp(join(tmpdir(),'walking-room-'));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 let now=100000,sequence=0;
 const map={id:'walking-room',spawn:{x:0,y:0,z:1},builderScene:{layout:'grand-floor',mapSize:40,objects:[]}};
 const store=new SharedRoomStore(join(directory,'rooms.json'));
 const runtime=new AuthoritativeRooms({store,now:()=>now});
 const send=(action,input={})=>runtime.command(map.id,map,{accountId:'you',username:'You',stats:{health:100}},{action,requestId:'walk-'+(++sequence),...input});
 await send('join');
 const setup=change=>store.update(map.id,room=>change(room,room.simulation.players['account:you']));
 await setup((_room,player)=>Object.assign(player,{position:{x:0,y:.02,z:1},floor:.02,grounded:true,velocityY:0,input:{}}));
 return {send,setup,async tick(input,ms=50){await send('input',{input});now+=ms;return runtime.snapshot(map.id,map);},snapshot:()=>runtime.snapshot(map.id,map)};
}
const wall={id:'wall',materialId:'brick',position:[0,1,0],rotation:[0,0,0],scale:[10,5,.1],paint:[],open:false,deleted:false};

test('actual room walking slides along a placed wall and remains fixed after controls stop',async t=>{
 const f=await fixture(t);
 await f.setup(room=>{room.objects.wall=structuredClone(wall);});
 let previous=null,state;
 const view=new ServerMotion({delay:75,maxExtrapolation:0,snapDistance:Infinity,resetGap:Infinity});
 for(let step=0;step<35;step++){
  state=await f.tick({forward:1,side:.45,yaw:0});
  const player=state.players['account:you'],position=player.position;
  assert.ok(position.z>=.329,'continuous sweep never passes through the wall');
  if(previous){assert.ok(position.x>previous.x,'the free wall tangent keeps moving');assert.ok(position.z<=previous.z+1e-9,'wall contact never pushes backwards');}
  view.push(position,step*50,{serverTime:state.simulationTime});
  const rendered={};view.sample(step*50,rendered);assert.ok(rendered.z>=position.z-1e-9,'display never predicts through the accepted contact');
  previous={...position};
 }
 const stopped={...state.players['account:you'].position};
 for(let step=0;step<20;step++){
  state=await f.tick({});
  assert.deepEqual(state.players['account:you'].position,stopped,'idle snapshots do not push, lift or reposition the player');
 }
});

test('room physics drops from a platform rather than pinning to its old floor height',async t=>{
 const f=await fixture(t);
 await f.setup((room,player)=>{
  room.objects.platform={...structuredClone(wall),id:'platform',position:[0,.2,0],scale:[3,1,3]};
  Object.assign(player,{position:{x:1.6,y:.42,z:0},floor:.42,grounded:true});
 });
 const heights=[];
 for(let step=0;step<20;step++)heights.push((await f.tick({side:1,yaw:0})).players['account:you'].position.y);
 assert.ok(heights.some(y=>y>.02&&y<.42),'gravity supplies an actual descent');
 assert.ok(Math.abs(heights.at(-1)-.02)<1e-6,'the lower map surface becomes the new support');
});

test('ordinary movement does not reset presentation; deliberate relocation is marked explicitly',async t=>{
 const f=await fixture(t);
 const before=(await f.snapshot()).players['account:you'].movementRevision;
 const moved=await f.tick({side:1,yaw:0});
 assert.equal(moved.players['account:you'].movementRevision,before);
 const relocated=await f.send('teleport-floor',{position:{x:5,y:0,z:5}});
 assert.equal(relocated.players['account:you'].movementRevision,before+1);
});

test('a removed or unavailable seat releases walking immediately without requiring a reload',async t=>{
 for(const state of ['missing','inactive','another-player']){
  const f=await fixture(t);
  await f.setup((room,player)=>{
   player.seatedId='old-seat';
   if(state!=='missing')room.simulation.actors['old-seat']={id:'old-seat',modelId:'market-bench',active:state!=='inactive',holderId:state==='another-player'?'account:other':'account:you',position:{...player.position}};
  });
  const player=(await f.tick({side:1,yaw:0})).players['account:you'];
  assert.equal(player.seatedId,null,state+' seat no longer owns controls');assert.ok(player.position.x>.1,state+' seat does not pin walking speed to zero');
 }
});

test('legacy spawn variables reset once on join without discarding progress',async t=>{
 const f=await fixture(t);
 await f.setup((_room,player)=>Object.assign(player,{floorVersion:3,position:{x:999,y:-50,z:999},velocityY:-10,score:123,heldId:'stale-held',seatedId:'stale-seat',vehicleId:'stale-vehicle'}));
 const first=(await f.send('join')).players['account:you'];
 assert.ok(Math.abs(first.position.x)<20&&Math.abs(first.position.z)<20);assert.ok(first.position.y>=0);assert.equal(first.score,123);assert.equal(first.heldId,null);assert.equal(first.seatedId,null);assert.equal(first.vehicleId,null);
 await f.setup((_room,player)=>{assert.equal(player.floorVersion,4);assert.equal(player.velocityY,0);player.position={x:4,y:.02,z:3};});
 const second=(await f.send('join')).players['account:you'];assert.equal(second.position.x,4);assert.equal(second.position.z,3);assert.equal(second.movementRevision,first.movementRevision);
});
