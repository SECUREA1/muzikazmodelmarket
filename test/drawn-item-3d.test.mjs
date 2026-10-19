import test from 'node:test';
import assert from 'node:assert/strict';
import {artworkCells} from '../public/js/drawn-item-3d.js';
import {cleanCustomItem} from '../custom-item-rules.mjs';
test('extrusion preserves colors, skips transparent pixels and bounds thickness',()=>{
 const pixels=new Uint8ClampedArray([255,0,0,255,0,255,0,0,255,255,255,255,0,0,0,255]);
 const solid=artworkCells(pixels,2,2,{depth:80});assert.equal(solid.length,3);assert.deepEqual(solid[0].color,[255,0,0]);assert.equal(solid[0].depth,.4);
 const relief=artworkCells(pixels,2,2,{depth:80,depthMode:'relief'});assert.ok(relief[1].depth>relief[2].depth);assert.equal(artworkCells(pixels,2,2,{depth:10000})[0].depth,.5);
});
test('saved drawing settings retain full rotation and relief with server bounds',()=>{
 const saved=cleanCustomItem({name:'Relief',requestId:'drawing-test-123',format:'glb',modelUrl:'/owned.glb',configuration:{extruded:true,yaw:300,tilt:-150,depthMode:'relief'}},[{modelUrl:'/owned.glb'}]);
 assert.equal(saved.configuration.extruded,true);assert.equal(saved.configuration.yaw,180);assert.equal(saved.configuration.tilt,-150);assert.equal(saved.configuration.depthMode,'relief');
});
