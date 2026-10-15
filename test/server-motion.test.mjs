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
