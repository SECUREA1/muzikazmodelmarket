import test from 'node:test';
import assert from 'node:assert/strict';
import {fitAtlasLocations} from '../public/js/atlas-viewport.js';
test('atlas fitting includes every destination, even beyond the old zoom limit',()=>{
 const places=[{column:-80,row:20},{column:95,row:-90},{column:0,row:0}];
 const fit=fitAtlasLocations(places,places[2]);
 for(const p of places){assert.ok(Math.abs(p.column-fit.panX)<fit.zoom/2);assert.ok(Math.abs(p.row-fit.panZ)<fit.zoom/2);}
 assert.deepEqual(fitAtlasLocations([]),{panX:0,panZ:0,zoom:5});
});
