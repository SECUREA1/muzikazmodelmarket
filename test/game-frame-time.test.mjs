import test from 'node:test';
import assert from 'node:assert/strict';
import {gameFrameDelta,GameFrameMeter} from '../public/js/game-frame-time.js';
test('slow rendered frames keep elapsed game time while suspension recovery stays bounded',()=>{
 for(const fps of [10,15,30,60,120]){let distance=0;for(let frame=0;frame<fps*3;frame++)distance+=4*gameFrameDelta(1/fps);assert.ok(Math.abs(distance-12)<1e-10);}
 assert.equal(gameFrameDelta(10),.25);assert.equal(gameFrameDelta(-1),0);assert.equal(gameFrameDelta(NaN),0);
});
test('bounded frame telemetry reports elapsed FPS rather than the clamped simulation delta',()=>{
 const meter=new GameFrameMeter(2);meter.record(.1,2);meter.record(.1,4);assert.deepEqual(meter.snapshot(),{fps:10,scriptMs:3,samples:2});
 meter.record(.4,8);assert.deepEqual(meter.snapshot(),{fps:4,scriptMs:6,samples:2});
});
