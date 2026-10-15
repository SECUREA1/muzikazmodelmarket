import test from 'node:test';
import assert from 'node:assert/strict';
import {ServerMotion} from '../public/js/server-motion.js';
test('movement presentation bridges snapshots but bounds stale extrapolation and resets teleports',()=>{
 const motion=new ServerMotion(),target={};
 motion.push({x:0,y:0,z:0},1000);motion.push({x:.4,y:0,z:0},1100);
 assert.equal(motion.sample(1150,target).x,.6000000000000001);
 assert.equal(motion.sample(10000,target).x,.8);
 motion.push({x:20,y:0,z:0},1200);assert.equal(motion.sample(1250,target).x,20);
 motion.reset();motion.push({x:3,y:0,z:0},1300);assert.equal(motion.sample(1350,target).x,3);
});
