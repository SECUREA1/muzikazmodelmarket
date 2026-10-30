import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldPreviewResolver} from '../public/js/world-preview-record.js';

test('map list previews resolve the saved map even when the list embeds another model',async()=>{
 const paths=[],saved={id:'muzikaz-airport',name:'Actual airport',proceduralLand:true,builderScene:{objects:[{id:'actual-terminal',modelId:'open-studio'}]}};
 const resolve=createWorldPreviewResolver(async path=>{paths.push(path);return saved;});
 const result=await resolve({id:'muzikaz-airport',name:'Old airport',modelUrl:'/wrong-house.glb',thumbnailUrl:'/wrong-house.webp',builderScene:{objects:[{id:'old-house'}]}});
 assert.deepEqual(paths,['/api/environments/muzikaz-airport']);
 assert.deepEqual(result,saved);assert.equal(result.modelUrl,undefined);assert.equal(result.thumbnailUrl,undefined);
});

test('concurrent requests share loading; revisions and expired entries fetch current geometry',async()=>{
 let calls=0,time=0;const resolve=createWorldPreviewResolver(async()=>({id:'map',modelUrl:`/model-${++calls}.glb`}),{now:()=>time,maxAge:30});
 const map={mapId:'map',contentUpdatedAt:'one'};
 const [a,b]=await Promise.all([resolve(map),resolve(map)]);assert.equal(calls,1);assert.equal(a.modelUrl,b.modelUrl);
 assert.equal((await resolve({...map,contentUpdatedAt:'two'})).modelUrl,'/model-2.glb');
 time=31;assert.equal((await resolve(map)).modelUrl,'/model-3.glb');
});

test('a mismatched or failed response never displays a neighbouring map and can be retried',async()=>{
 let calls=0;const resolve=createWorldPreviewResolver(async()=>++calls===1?{id:'wrong-world',modelUrl:'/wrong.glb'}:{id:'selected-world',modelUrl:'/correct.glb'});
 await assert.rejects(resolve({mapId:'selected-world'}),/does not match/);
 assert.equal((await resolve({mapId:'selected-world'})).modelUrl,'/correct.glb');assert.equal(calls,2);
});
