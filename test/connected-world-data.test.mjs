import test from 'node:test';
import assert from 'node:assert/strict';
import {atlasPlotTransform,atlasWorldPosition,atlasLocalPoint,atlasDetailCandidates,atlasSnapshotGeometry} from '../public/js/connected-world-data.js';
test('a room fits its authoritative atlas cell without distorting placed items',()=>{
 const transform=atlasPlotTransform({column:3,row:-2},{min:{x:-512,y:-2,z:-512},max:{x:512,y:50,z:512}});
 assert.deepEqual(atlasLocalPoint(transform,{x:0,y:-2,z:0}),{x:768,y:0,z:-512});
 const a=atlasLocalPoint(transform,{x:10,y:0,z:20}),b=atlasLocalPoint(transform,{x:26,y:3,z:32});
 assert.ok(Math.abs(b.x-a.x-16*transform.scale)<1e-10);assert.ok(Math.abs(b.z-a.z-12*transform.scale)<1e-10);assert.ok(Math.abs(b.y-a.y-3*transform.scale)<1e-10);assert.equal(transform.scale,256*.9/1024);
});
test('detail streaming can reach every map and follows zoom instead of loading the entire world',()=>{
 const locations=Array.from({length:160},(_,i)=>({mapId:'map-'+i,column:i,row:0}));assert.deepEqual(atlasDetailCandidates(locations,{target:{x:0,z:0},radius:5000}),[]);
 for(const place of locations)assert.ok(atlasDetailCandidates(locations,{target:{x:place.column*256,z:0},radius:80}).some(row=>row.mapId===place.mapId));
 assert.ok(atlasDetailCandidates(locations,{target:{x:0,z:0},radius:500}).length<=4);
});
test('building and asset edits invalidate geometry while vehicle movement remains a live transform update',()=>{
 const a={objects:{brick:{id:'brick',position:[1,2,3],paint:[123]}},actors:{boat:{id:'boat',modelId:'harbor-yacht',position:{x:1,y:0,z:3}}}},b=structuredClone(a);b.actors.boat.position.x=99;assert.equal(atlasSnapshotGeometry(a),atlasSnapshotGeometry(b));b.objects.brick.paint=[456];assert.notEqual(atlasSnapshotGeometry(a),atlasSnapshotGeometry(b));
});

test('explicit server XYZ anchors control plot geometry and streaming; legacy cell coordinates stay stable',()=>{const place={mapId:'deed',column:0,row:0,worldPosition:{x:1536,y:32,z:-768}},bounds={min:{x:-20,y:0,z:-20},max:{x:20,y:10,z:20}},transform=atlasPlotTransform(place,bounds);assert.deepEqual(atlasWorldPosition(place),place.worldPosition);assert.deepEqual(atlasLocalPoint(transform,{x:0,y:0,z:0}),place.worldPosition);assert.equal(atlasDetailCandidates([place],{target:{x:1536,z:-768},radius:80})[0].mapId,'deed');assert.deepEqual(atlasDetailCandidates([place],{target:{x:0,z:0},radius:80}),[]);assert.deepEqual(atlasWorldPosition({column:-2,row:3}),{x:-512,y:0,z:768});});
