import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameSnapshotMotion} from '../public/js/game-snapshot-motion.js';
import {createGameActionQueue} from '../public/js/game-action-queue.js';

test('network motion fills frames without mutating the authoritative snapshot',()=>{
 const motion=createGameSnapshotMotion({duration:100}),a={phase:'playing',score:[0,0],players:[{id:'a',x:0,z:0}],puck:{x:0,z:0}};
 motion.push(a,0);const b={...a,score:[1,0],players:[{id:'a',x:4,z:0}],puck:{x:6,z:0}},before=JSON.stringify(b);motion.push(b,100);
 const middle=motion.sample(150);assert.equal(middle.players[0].x,2);assert.equal(middle.puck.x,3);assert.deepEqual(middle.score,[1,0]);assert.equal(JSON.stringify(b),before);assert.equal(motion.sample(200).players[0].x,4);
});
test('teleports, phase transitions and new rounds do not blend across worlds',()=>{
 const motion=createGameSnapshotMotion({snapDistance:8});motion.push({phase:'playing',players:[{id:1,x:0,z:0}]},0);motion.push({phase:'playing',players:[{id:1,x:20,z:0}]},100);assert.equal(motion.sample(101).players[0].x,20);
 motion.push({phase:'faceoff',players:[{id:1,x:0,z:0}]},200);assert.equal(motion.sample(201).players[0].x,0);motion.reset();assert.equal(motion.sample(300),null);
});
test('arcade team players stay matched by ID and yaw follows the short rotation',()=>{
 const motion=createGameSnapshotMotion({duration:100});motion.push({basketball:{players:[{id:1,x:0,y:0,yaw:Math.PI-.1},{id:2,x:5,y:0}],ball:{x:0,y:0,height:1}}},0);
 motion.push({basketball:{players:[{id:2,x:7,y:0},{id:1,x:4,y:0,yaw:-Math.PI+.1}],ball:{x:2,y:0,height:3}}},100);
 const mid=motion.sample(150).basketball;assert.equal(mid.players[0].x,6);assert.equal(mid.players[1].x,2);assert.ok(Math.abs(mid.players[1].yaw-Math.PI)<1e-9);assert.equal(mid.ball.height,2);
});
test('rapid game actions retain order and cannot create an unbounded backlog',()=>{
 const queue=createGameActionQueue(3);assert.equal(queue.push('pass'),true);queue.push('shoot');queue.push('switch');assert.equal(queue.push('steal'),false);assert.equal(queue.shift(),'pass');assert.equal(queue.shift(),'shoot');queue.clear();assert.equal(queue.length,0);assert.equal(queue.shift(),undefined);
});
