import test from 'node:test';
import assert from 'node:assert/strict';
import {floorTravelInput} from '../public/js/floor-travel.js';
import {fitAtlasLocations} from '../public/js/atlas-viewport.js';
test('floor steering is camera relative and slows before arrival',()=>{
 const p={x:0,z:0};assert.equal(floorTravelInput(p,{x:0,z:-5},0).forward,1);
 assert.ok(Math.abs(floorTravelInput(p,{x:5,z:0},Math.PI/2).forward+1)<1e-10);
 assert.ok(floorTravelInput(p,{x:.2,z:0},0).side<1);
 assert.deepEqual(floorTravelInput(p,{x:.05,z:0},0),{side:0,forward:0,arrived:true});
});
test('atlas fitting includes every destination, even beyond the old zoom limit',()=>{
 const places=[{column:-80,row:20},{column:95,row:-90},{column:0,row:0}];
 const fit=fitAtlasLocations(places,places[2]);
 for(const p of places){assert.ok(Math.abs(p.column-fit.panX)<fit.zoom/2);assert.ok(Math.abs(p.row-fit.panZ)<fit.zoom/2);}
 assert.deepEqual(fitAtlasLocations([]),{panX:0,panZ:0,zoom:5});
});
