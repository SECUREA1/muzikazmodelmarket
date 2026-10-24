import test from 'node:test';
import assert from 'node:assert/strict';
import {worldPreviewData,safeWorldMedia,previewWorldId,worldPreviewKey} from '../public/js/world-preview-data.js';
test('GLB destination samples use the saved world model and thumbnail',()=>{
 const data=worldPreviewData({id:'house',name:'Saved house',modelUrls:['/house.glb','/wing.glb'],thumbnailUrl:'/house.webp'});assert.equal(data.model,'/house.glb');assert.deepEqual(data.models,['/house.glb','/wing.glb']);assert.equal(data.image,'/house.webp');assert.equal(data.procedural,false);
});
test('builder and deed samples preserve their actual placed objects and roads',()=>{
 const objects=[{id:'sofa',modelId:'sofa',position:{x:8,y:0,z:6}}],streets=[{id:'road',from:{x:-10,z:0},to:{x:10,z:0},width:5}];
 const builder=worldPreviewData({id:'city',modelUrl:'/old-base.glb',builderScene:{mapSize:120,objects,streets}});assert.equal(builder.model,'');assert.equal(builder.procedural,true);assert.deepEqual(builder.objects,objects);assert.deepEqual(builder.streets,streets);assert.equal(builder.mapSize,120);
 const deed=worldPreviewData({id:'deed',modelUrl:'/actual-house.glb',placementScene:{objects}});assert.equal(deed.model,'/actual-house.glb');assert.deepEqual(deed.objects,objects);
});
test('atlas summaries resolve the same destination identity and reject executable media URLs',()=>{
 assert.equal(previewWorldId({mapId:'saved-game'}),'saved-game');assert.equal(safeWorldMedia('javascript:alert(1)'), '');assert.equal(safeWorldMedia('data:text/html,hello'),'');assert.equal(safeWorldMedia('/public/models/room.glb'),'/public/models/room.glb');assert.doesNotThrow(()=>worldPreviewData({modelUrls:'invalid',builderScene:{objects:'invalid'}}));
});
test('maps built on an authored environment preview that saved base and its additions',()=>{
 const objects=[{id:'terminal',modelId:'open-studio'}],data=worldPreviewData({id:'extended-airport',proceduralLand:true,modelUrl:'/outdated.glb',builderScene:{baseEnvironment:{modelUrls:['/airport.glb','/annex.glb']},objects}});
 assert.deepEqual(data.models,['/airport.glb','/annex.glb']);assert.equal(data.model,'/airport.glb');assert.equal(data.procedural,false);assert.deepEqual(data.objects,objects);
});
test('content revisions invalidate destination previews even when atlas timestamps stay the same',()=>{
 const map={mapId:'airport',updatedAt:'atlas-1',contentUpdatedAt:'scene-1'};
 assert.notEqual(worldPreviewKey(map),worldPreviewKey({...map,contentUpdatedAt:'scene-2'}));
 assert.notEqual(worldPreviewKey(map),worldPreviewKey({...map,updatedAt:'atlas-2'}));
 assert.equal(worldPreviewData({id:'airport',proceduralLand:true,playableSize:2000}).mapSize,2000);
});
