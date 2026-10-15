import test from 'node:test';
import assert from 'node:assert/strict';
import {WalkingMotion,walkingStick,walkingSprint} from '../public/js/walking-motion.js';
const snapshot=(motion,x,time,arrival=time)=>motion.reconcile({x,z:0},{serverTime:time,simulationTime:time,sentAt:time-(arrival-time),receivedAt:arrival});
const distance=t=>4*(t-(1-Math.exp(-35*t))/35);

test('held walking remains continuous across uneven snapshots at 30, 60 and 120 FPS',()=>{
 for(const fps of [30,60,120]){
  const motion=new WalkingMotion(),out={};snapshot(motion,0,0);
  let next=50,previous=0;
  for(let frame=1;frame<=fps*2;frame++){
   const now=frame*1000/fps;
   if(now>=next+50){snapshot(motion,distance(next/1000),next,next+50);next+=[40,65,45,80][frame%4];}
   motion.sample(now,1/fps,{side:1},4,out);
   assert.ok(out.x>=previous-1e-8,'network packets never reverse forward walking');
   if(now>500)assert.ok(Math.abs((out.x-previous)*fps-4)<.06,'render speed stays steady');
   previous=out.x;
  }
 }
});
test('frame-rate-independent easing produces the same distance without new packets',()=>{
 const positions=[];
 for(const fps of [30,60,120]){
  const motion=new WalkingMotion(),out={};snapshot(motion,0,0);
  for(let frame=1;frame<=fps/5;frame++)motion.sample(frame*1000/fps,1/fps,{forward:1},4,out);
  positions.push(out.z);
 }
 assert.ok(Math.abs(positions[0]-positions[1])<1e-8);assert.ok(Math.abs(positions[1]-positions[2])<1e-8);
});
test('stops and direction changes ease without an instant camera offset',()=>{
 const motion=new WalkingMotion(),out={};snapshot(motion,0,0);
 motion.sample(16, .016,{side:1},4,out);const start=out.x;assert.ok(start>0&&start<.064);
 motion.sample(32, .016,{side:-1},4,out);assert.ok(Math.abs(out.x-start)<.064);
 for(let frame=3;frame<16;frame++)motion.sample(frame*16,.016,{},4,out);
 const settled=out.x;motion.sample(256,.016,{},4,out);assert.ok(Math.abs(out.x-settled)<.0001);
});
test('server walls, stale connections, teleports and world resets remain authoritative',()=>{
 const motion=new WalkingMotion(),out={};snapshot(motion,0,0);
 for(let frame=1;frame<90;frame++){
  const now=frame*1000/60;
  if(frame%3===0)snapshot(motion,0,now);
  motion.sample(now,1/60,{side:1},4,out);
  assert.ok(out.x<.5,'wall correction bounds the predicted view');
 }
 snapshot(motion,20,1600);motion.sample(1600,0,{},4,out);assert.equal(out.x,20);
 motion.sample(3000,.016,{side:1},4,out);assert.equal(out.x,20,'stalled network stops prediction');
 motion.reset();assert.equal(motion.position,null);assert.equal(motion.history.length,0);
});
test('radial stick filtering preserves direction and sprint hysteresis prevents speed chatter',()=>{
 assert.deepEqual(walkingStick(.03,-.02),{x:0,y:0});
 assert.deepEqual(walkingStick(1,0),{x:1,y:0});
 const diagonal=walkingStick(1,1);assert.ok(Math.abs(Math.hypot(diagonal.x,diagonal.y)-1)<1e-10);
 assert.equal(walkingSprint(false,.8),false);assert.equal(walkingSprint(false,.9),true);
 assert.equal(walkingSprint(true,.75),true);assert.equal(walkingSprint(true,.6),false);
});
