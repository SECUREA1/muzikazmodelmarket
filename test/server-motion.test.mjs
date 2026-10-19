import test from 'node:test';
import assert from 'node:assert/strict';
import {ServerMotion} from '../public/js/server-motion.js';

test('walking stays at constant speed between uneven snapshots at different display rates',()=>{
 for(const fps of [30,60,120]){
  const motion=new ServerMotion(),target={};
  const arrivals=[0,47,103,149,205,251,304,348,401,452,503,549,602,650,701,752,802,849,901,953,1000];
  let next=0,previous=null;
  for(let now=0;now<=1000;now+=1000/fps){
   while(next<arrivals.length&&arrivals[next]<=now){const t=arrivals[next++];motion.push({x:t*.004,y:0,z:0},t);}
   motion.sample(now,target);
   if(now>=150){
    assert.ok(Math.abs(target.x-(now-100)*.004)<1e-8,'buffer bridges network timing');
    if(previous!==null)assert.ok(Math.abs(target.x-previous-4/fps)<1e-8,'every frame advances evenly');
    previous=target.x;
   }
  }
 }
});
test('stationary snapshots stop prediction and stale snapshots cannot drift indefinitely',()=>{
 const motion=new ServerMotion(),target={};
 motion.push({x:0,y:0,z:0},1000);motion.push({x:.4,y:0,z:0},1100);
 assert.ok(Math.abs(motion.sample(1250,target).x-.6)<1e-10);
 assert.ok(Math.abs(motion.sample(10000,target).x-.7)<1e-10);
 motion.push({x:.4,y:0,z:0},1200);
 assert.equal(motion.sample(1400,target).x,.4);
});
test('teleports, long gaps, reset and out of order snapshots are safe',()=>{
 const motion=new ServerMotion(),target={};
 motion.push({x:0,y:0,z:0},1000);motion.push({x:20,y:3,z:0},1100);
 assert.deepEqual(motion.sample(1100,target),{x:20,y:3,z:0});
 motion.push({x:1,y:0,z:0},1050);assert.equal(motion.sample(1150,target).x,20);
 motion.push({x:21,y:3,z:0},2000);assert.equal(motion.sample(2000,target).x,21);
 motion.reset();motion.push({x:3,y:0,z:0},2100);assert.equal(motion.sample(2150,target).x,3);
});
test('vertical walking and stair movement interpolate without a camera step',()=>{
 const motion=new ServerMotion(),target={};
 motion.push({x:0,y:0,z:0},1000);motion.push({x:.4,y:.2,z:0},1100);
 motion.sample(1150,target);assert.equal(target.x,.2);assert.equal(target.y,.1);
});

test('local controls use current snapshots without the remote interpolation delay',()=>{
 const motion=new ServerMotion({delay:0,maxExtrapolation:100}),target={};
 motion.push({x:0,y:0,z:0},1000);motion.push({x:.3,y:0,z:0},1050);
 assert.equal(motion.sample(1050,target).x,.3);
 assert.ok(Math.abs(motion.sample(1060,target).x-.36)<1e-10);
 motion.push({x:.3,y:0,z:0},1100);
 assert.equal(motion.sample(1100,target).x,.3,'stopping does not replay buffered walking');
});

const controlledView=()=>new ServerMotion({delay:75,maxExtrapolation:0,snapDistance:Infinity,resetGap:Infinity});

test('controlled views settle at walls and stay exact while stationary or disconnected',()=>{
 const motion=controlledView(),target={};
 motion.push({x:0,y:0,z:0},1000);
 motion.push({x:.2,y:0,z:0},1050);
 motion.push({x:.4,y:0,z:0},1100);
 motion.push({x:.4,y:0,z:0},1150);
 motion.push({x:.4,y:0,z:0},1200);
 let previous=0;
 for(let now=1000;now<=1400;now+=5){
  motion.sample(now,target);
  assert.ok(target.x>=previous&&target.x<=.4,'the view never enters the wall or snaps backward');
  previous=target.x;
 }
 assert.deepEqual(motion.sample(10000,target),{x:.4,y:0,z:0},'a disconnected player cannot keep drifting into a wall');
 motion.push({x:.4,y:0,z:0},10050);
 assert.deepEqual(motion.sample(10100,target),{x:.4,y:0,z:0},'repeated stationary snapshots leave the view at rest');
});

test('controlled views interpolate stair elevations without overshooting accepted ground height',()=>{
 const motion=controlledView(),target={};
 const frames=[{x:0,y:0,z:0},{x:.2,y:.18,z:0},{x:.4,y:.18,z:0},{x:.6,y:.36,z:0},{x:.8,y:.36,z:0}];
 frames.forEach((position,index)=>motion.push(position,1000+index*50));
 let previousY=0;
 for(let now=1000;now<=1500;now+=5){
  motion.sample(now,target);
  assert.ok(target.y>=previousY&&target.y<=.36,'walking up a step is continuous and never launches the view');
  assert.ok(target.x>=0&&target.x<=.8,'horizontal motion stays inside accepted positions');
  previousY=target.y;
 }
 assert.deepEqual(target,frames.at(-1));
});

test('source timestamps keep controlled walking even under irregular delivery at 30, 60 and 120 FPS',()=>{
 const latency=[20,32,9,28,14,35,11,24];
 for(const fps of [30,60,120]){
  const motion=controlledView(),target={};
  const packets=Array.from({length:31},(_,index)=>{
   const sourceTime=index*50;
   return {sourceTime,receivedAt:sourceTime+latency[index%latency.length]};
  });
  let next=0,previous=null;
  for(let now=0;now<=1500;now+=1000/fps){
   while(next<packets.length&&packets[next].receivedAt<=now){
    const packet=packets[next++];
    motion.push({x:packet.sourceTime*.004,y:0,z:0},packet.receivedAt,{serverTime:100000+packet.sourceTime});
   }
   motion.sample(now,target);
   if(now>=200){
    assert.ok(Math.abs(target.x-(now-95)*.004)<1e-9,'source cadence absorbs packet arrival jitter');
    if(previous!==null)assert.ok(Math.abs(target.x-previous-4/fps)<1e-9,'render frames advance evenly');
    previous=target.x;
   }
  }
 }
});

test('controlled views slide along a wall smoothly instead of predicting through it and recoiling',()=>{
 for(const fps of [30,60,120]){
  const motion=controlledView(),target={};
  let next=0,previousX=0,previousZ=0;
  for(let now=0;now<=1000;now+=1000/fps){
   while(next<=1000&&next+(next/50%3)*8<=now){
    motion.push({x:Math.min(.4,next*.004),y:0,z:next*.003},next+(next/50%3)*8,{serverTime:next});
    next+=50;
   }
   motion.sample(now,target);
   assert.ok(target.x>=previousX&&target.x<=.4,'wall contact cannot overshoot or recoil');
   assert.ok(target.z>=previousZ,'accepted tangent movement keeps advancing');
   if(now>=200)assert.ok(Math.abs(target.z-(now-75)*.003)<1e-9,'wall sliding retains the accepted movement cadence');
   previousX=target.x;previousZ=target.z;
  }
 }
});

test('controlled views reset only for explicit relocation and reject stale source snapshots',()=>{
 const motion=controlledView(),target={};
 motion.push({x:0,y:0,z:0},1000,{serverTime:5000});
 motion.push({x:4,y:0,z:0},1100,{serverTime:5100});
 assert.equal(motion.sample(1125,target).x,2,'a large accepted movement does not infer a teleport');
 assert.equal(motion.push({x:-5,y:0,z:0},1150,{serverTime:5050}),false,'a late old response cannot reverse movement');
 assert.equal(motion.sample(1175,target).x,4);
 motion.push({x:40,y:2,z:-6},1200,{serverTime:5200,teleport:true});
 assert.deepEqual(motion.sample(1200,target),{x:40,y:2,z:-6},'a known relocation immediately clears the old path');
 assert.equal(motion.push({x:1,y:0,z:0},1190,{serverTime:5300}),false,'out of order arrival times remain rejected');
 assert.equal(motion.snapshots.length,1);
});

test('invalid snapshots cannot poison movement interpolation',()=>{
 const motion=controlledView(),target={};
 motion.push({x:1,y:2,z:3},1000);
 assert.equal(motion.push({x:NaN,y:0,z:0},1100),false);
 assert.equal(motion.push({x:0,y:0,z:0},Infinity),false);
 assert.deepEqual(motion.sample(1200,target),{x:1,y:2,z:3});
});

test('adaptive walking never predicts or reverses when delivery slows or recovers',()=>{
 for(const fps of [30,60,120]){
  const motion=new ServerMotion({delay:125,maxExtrapolation:0,snapDistance:Infinity,resetGap:Infinity,adaptive:true}),target={};
  const packets=Array.from({length:51},(_,i)=>({source:i*50,arrival:i*50+(i<12?20:i<30?90:25)})).sort((a,b)=>a.arrival-b.arrival);
  let next=0,previous=0,accepted=0;
  for(let now=0;now<3000;now+=1000/fps){
   while(next<packets.length&&packets[next].arrival<=now){const p=packets[next++];if(motion.push({x:p.source*.004,y:0,z:0},p.arrival,{serverTime:p.source}))accepted=p.source*.004;}
   motion.sample(now,target);if(!Number.isFinite(target.x))continue;
   assert.ok(target.x>=previous-1e-9,'no backward camera correction');
   assert.ok(target.x<=accepted+1e-9,'no prediction beyond accepted positions');
   assert.ok(target.x-previous<=4.4/fps+1e-8,'no catch-up jump after late packets');previous=target.x;
  }
  assert.equal(target.x,10,'movement stops when snapshots stop');
  motion.push({x:30,y:1,z:2},3100,{serverTime:3100,teleport:true});assert.deepEqual(motion.sample(3100,target),{x:30,y:1,z:2});
 }
});
