import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {EnvironmentRegistry} from '../public/js/environments/environment-registry.js';

test('an explicit published map loads directly without replacing bundled worlds',async()=>{
 const previous=globalThis.window,paths=[];
 globalThis.window={MUZIKAZ_API:{fetch:async path=>{paths.push(path);return {ok:true,json:async()=>({data:{id:'saved-map',builderScene:{layout:'grand-floor',objects:[]},source:'custom-builder'}})};}}};
 try{
  const registry=new EnvironmentRegistry();registry.environments=[{id:'house'}];
  const map=await registry.resolve('saved-map');assert.equal(map.id,'saved-map');assert.ok(registry.find('house'));assert.ok(registry.find('saved-map').builderScene);
  await registry.resolve('saved-map');assert.deepEqual(paths,['/api/environments/saved-map']);
 }finally{globalThis.window=previous;}
});

test('stale room metadata never blocks gameplay while one directory refresh runs',async()=>{
 const source=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
 const functions=source.slice(source.indexOf('let roomEnvironmentRefresh=null;'),source.indexOf('function liveRoomMetadata'));
 let release,calls=0;const jobs=[];
 const lookup=new Function('combinedEnvironments','backgroundJob','Date',`let roomEnvironmentCache=[{id:'saved-map',aliases:['alias']}],roomEnvironmentCachedAt=0;${functions};return roomEnvironment;`)(()=>{calls++;return new Promise(resolve=>{release=resolve;});},work=>jobs.push(work()),{now:()=>10000});
 assert.equal((await lookup('saved-map')).id,'saved-map');assert.equal((await lookup('alias')).id,'saved-map');assert.equal(calls,1);
 const missing=lookup('new-map');assert.equal(calls,1);release([{id:'saved-map'},{id:'new-map'}]);await Promise.all(jobs);assert.equal((await missing).id,'new-map');
});
