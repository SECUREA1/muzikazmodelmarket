import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {staticCacheControl,staticRevalidationEdgeHeaders} from '../static-cache-policy.mjs';

test('stable game entry points, imported modules and map definitions revalidate between releases',()=>{
  for(const extension of ['.html','.js','.mjs','.css','.json','.webmanifest','.JS']){
    assert.equal(staticCacheControl(extension),'no-cache',extension);
  }
  assert.equal(staticCacheControl('.glb'),'public, max-age=31536000, immutable');
  assert.equal(staticCacheControl('.usdz'),'public, max-age=31536000, immutable');
  assert.equal(staticCacheControl('.png'),'public, max-age=3600');
});

test('private uploads keep their stricter cache policy regardless of asset type',()=>{
  for(const extension of ['.html','.json','.glb','.png'])assert.equal(staticCacheControl(extension,{privateUpload:true}),'private, no-store');
});

test('static hosting revalidates both HTML and extensionless launch URLs without changing model caches',()=>{
  const rules=staticRevalidationEdgeHeaders(['rad-tox.html','index.html','world-map.html']);
  for(const path of ['/','/*.html','/*.js','/*.css','/*.json','/*.webmanifest','/rad-tox','/world-map']){
    assert.ok(rules.includes(path+'\n  Cache-Control: no-cache\n'),path);
  }
  assert.ok(!rules.includes('/*.glb'));
  assert.ok(!rules.includes('/*.png'));
});

async function loadWorker(fetchImplementation,cachedResponse){
  const listeners={},calls=[],stored=[],tasks=[];
  vm.runInNewContext(await readFile(new URL('../service-worker.js',import.meta.url),'utf8'),{
    self:{addEventListener:(name,handler)=>listeners[name]=handler},URL,Response,location:{origin:'https://muzikaz.com'},
    fetch:(request,options)=>{calls.push({url:request.url,options});return fetchImplementation(request,options);},
    caches:{open:async()=>({put:async request=>stored.push(request.url)}),match:async()=>cachedResponse}
  });
  async function request(path,options={}){
    let response;
    listeners.fetch({request:new Request('https://muzikaz.com'+path,options),respondWith:promise=>response=promise,waitUntil:promise=>tasks.push(promise)});
    const result=await response;
    for(let i=0;i<tasks.length;i++)await tasks[i];
    return result;
  }
  return {request,calls,stored};
}

test('installed clients revalidate stale launch modules and still cache current responses for offline use',async()=>{
  const worker=await loadWorker(async()=>new Response('current module',{headers:{'Cache-Control':'no-cache','Content-Type':'text/javascript'}}));
  const response=await worker.request('/public/js/house-explorer-glb.js?v=range-launch');
  assert.equal(await response.text(),'current module');
  assert.equal(worker.calls[0].options.cache,'no-cache');
  assert.deepEqual(worker.stored,['https://muzikaz.com/public/js/house-explorer-glb.js?v=range-launch']);
  await worker.request('/public/models/environments/environments.json');
  assert.equal(worker.calls[1].options.cache,'no-cache');
  await worker.request('/public/models/range.glb');
  assert.equal(worker.calls[2].options,undefined);
});

test('a revalidation network failure preserves the existing offline fallback',async()=>{
  const worker=await loadWorker(async()=>{throw new Error('Offline');},new Response('offline module',{headers:{'Content-Type':'text/javascript'}}));
  const response=await worker.request('/public/js/firing-range.js');
  assert.equal(await response.text(),'offline module');
  assert.equal(worker.calls[0].options.cache,'no-cache');
  assert.equal(worker.stored.length,0);
});


test('HTML error pages cannot poison offline JavaScript or JSON module requests',async()=>{
  for(const path of ['/public/js/house-explorer-glb.js','/public/models/environments/environments.json']){
    const worker=await loadWorker(async()=>new Response('<!doctype html><h1>Updating</h1>',{headers:{'Content-Type':'text/html'}}));
    const online=await worker.request(path);assert.equal(online.status,200);assert.equal(worker.stored.length,0,'a nonmatching deployment response is never cached');
    const offline=await loadWorker(async()=>{throw Error('Offline');},new Response('<html>Wrong resource</html>',{headers:{'Content-Type':'text/html'}}));
    const fallback=await offline.request(path);assert.equal(fallback.type,'error','old bad cache content cannot masquerade as a module or JSON');
  }
});
