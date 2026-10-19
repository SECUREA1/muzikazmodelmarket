import test from 'node:test';
import assert from 'node:assert/strict';
import {worldPreviewData,safeWorldMedia,previewWorldId} from '../public/js/world-preview-data.js';
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

test('complete house previews retain every floor and omit invalid or duplicate model sources',()=>{
 const data=worldPreviewData({id:'muzikaz-full-house',modelUrls:['/main.glb','javascript:alert(1)','/upper.glb','/main.glb']});
 assert.deepEqual(data.models,['/main.glb','/upper.glb']);
 assert.equal(data.model,'/main.glb');
});

test('builder worlds extending an authored map preview the saved base rather than replacement terrain',()=>{
 const base={id:'house',modelUrls:['/main.glb','/upper.glb'],scale:2,playableSize:32};
 const objects=[{modelId:'sofa',position:{x:4,y:0,z:2}}];
 const data=worldPreviewData({id:'custom-house',proceduralLand:true,modelUrl:'/stale.glb',builderScene:{baseEnvironment:base,objects}});
 assert.equal(data.procedural,false);
 assert.equal(data.base,base);
 assert.deepEqual(data.models,['/main.glb','/upper.glb']);
 assert.deepEqual(data.objects,objects);
});
