import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../service-worker.js',import.meta.url),'utf8'),origin='https://muzikaz.com';
async function worker({fetcher,now=Date.parse('2026-10-28T12:00:00Z'),failStorage=false}={}){
 const listeners={},entries=new Map(),calls=[],writes=[],tasks=[];let clock=now;
 const key=value=>typeof value==='string'?new URL(value,origin).href:value.url;
 const cache={
  match:async request=>{if(failStorage)throw Error('Storage unavailable');return entries.get(key(request))?.clone();},
  put:async(request,response)=>{writes.push(key(request));entries.set(key(request),response.clone());}
 };
 class Clock extends Date{static now(){return clock;}}
 vm.runInNewContext(source,{
  self:{addEventListener:(name,handler)=>listeners[name]=handler},URL,Response,Date:Clock,location:{origin},
  caches:{open:async()=>{if(failStorage)throw Error('Storage unavailable');return cache;},match:cache.match},
  fetch:async(request,options)=>{calls.push({request,options});return fetcher?fetcher(request,options):asset('model/gltf-binary',clock);}
 });
 async function request(path,{mode='cors',...options}={}){
  const actual=new Request(new URL(path,origin),options),request=mode==='navigate'?{url:actual.url,method:actual.method,headers:actual.headers,cache:actual.cache,mode}:actual;
  let response,intercepted=false;
  listeners.fetch({request,respondWith:value=>{intercepted=true;response=value;},waitUntil:value=>tasks.push(value)});
  const result=await response;for(let i=0;i<tasks.length;i++)await tasks[i];return {intercepted,response:result};
 }
 return {request,entries,calls,writes,setTime:value=>clock=value};
}
function asset(type,time=Date.parse('2026-10-28T12:00:00Z'),headers={}){
 return new Response('public asset',{headers:{'Content-Type':type,'Cache-Control':'public, max-age=3600',Date:new Date(time).toUTCString(),...headers}});
}

test('warm public models and graphic resources reuse fresh responses without fetching or writing duplicate bodies',async()=>{
 const cases=[['/public/models/environments/range.glb','model/gltf-binary'],['/public/images/native-designs/terrain-cliff-mountain-v1.svg','image/svg+xml'],['/public/assets/fonts/interface.woff2','font/woff2']];
 for(const [path,type]of cases){
  const current=await worker({fetcher:async()=>asset(type)});
  for(let i=0;i<3;i++){const {response}=await current.request(path);assert.equal(await response.text(),'public asset');}
  assert.equal(current.calls.length,1,path+' has one fetch for three visits');assert.equal(current.writes.length,1,path+' stores one response body');
  await current.request(path+'?revision=2');assert.equal(current.calls.length,2,'a different full URL remains a distinct resource');
 }
});

test('stable modules, map JSON and navigation revalidate every visit and preserve an offline fallback',async()=>{
 for(const [path,type,mode]of [['/public/js/house-explorer-glb.js','text/javascript','cors'],['/public/models/environments/environments.json','application/json','cors'],['/world-map','text/html','navigate']]){
  let offline=false;const current=await worker({fetcher:async()=>{if(offline)throw Error('Offline');return asset(type);}});
  await current.request(path,{mode});await current.request(path,{mode});assert.equal(current.calls.length,2);for(const call of current.calls)assert.equal(call.options.cache,'no-cache');
  offline=true;const {response}=await current.request(path,{mode});assert.equal(await response.text(),'public asset');assert.equal(current.writes.length,2,'offline fallback does not rewrite the cached body');
 }
 const offline=await worker({fetcher:async()=>{throw Error('Offline');}});offline.entries.set(origin+'/index.html',asset('text/html'));
 assert.equal(await (await offline.request('/unknown-world',{mode:'navigate'})).response.text(),'public asset');
});

test('asset freshness expires at the server lifetime and respects intermediary age and explicit refresh requests',async()=>{
 const start=Date.parse('2026-10-28T12:00:00Z'),path='/public/models/range.glb',current=await worker({now:start});
 await current.request(path);current.setTime(start+3599000);await current.request(path);assert.equal(current.calls.length,1);
 current.setTime(start+3600000);await current.request(path);assert.equal(current.calls.length,2,'an expired asset is fetched again');
 for(const cache of ['reload','no-cache'])await current.request(path,{cache});
 await current.request(path,{headers:{'Cache-Control':'max-age=0'}});assert.equal(current.calls.length,5,'caller refresh policies override a warm response');
 const aged=await worker({now:start,fetcher:async()=>asset('model/gltf-binary',start,{Age:'3600'})});await aged.request(path);await aged.request(path);assert.equal(aged.calls.length,2,'a stale intermediary response is not made fresh by storage');
 let offline=false;const fallback=await worker({now:start,fetcher:async()=>{if(offline)throw Error('Offline');return asset('model/gltf-binary',start);}});await fallback.request(path);fallback.setTime(start+3600000);offline=true;
 assert.equal(await (await fallback.request(path)).response.text(),'public asset','an expired public model remains available as an offline fallback after revalidation fails');
});

test('account data, uploads, credentials, byte ranges and no-store requests bypass offline handling',async()=>{
 const current=await worker();
 for(const [path,options]of [
  ['/api/market/session',{}],['/uploads/assets/member.glb',{}],['/public/models/member.glb',{headers:{Authorization:'Bearer member-proof'}}],
  ['/public/models/range.glb',{headers:{Range:'bytes=0-127'}}],['/public/models/range.glb',{cache:'no-store'}],['/public/models/range.glb',{headers:{'Cache-Control':'no-store'}}],['https://elsewhere.example/model.glb',{}],['/public/models/range.glb',{method:'POST'}]
 ])assert.equal((await current.request(path,options)).intercepted,false,path);
 assert.equal(current.calls.length,0);assert.equal(current.writes.length,0);
});

test('unsafe response policies and deployment error pages never become reusable model or image resources',async()=>{
 const path='/public/models/range.glb';
 for(const policy of ['private, max-age=3600','no-store','public, no-cache, max-age=3600','public, max-age=0']){
  const current=await worker({fetcher:async()=>asset('model/gltf-binary',undefined,{'Cache-Control':policy})});await current.request(path);await current.request(path);assert.equal(current.calls.length,2,policy+' always fetches');
  if(/private|no-store/.test(policy))assert.equal(current.writes.length,0);
 }
 for(const [headers,body]of [[{'Content-Type':'text/html'},'<html>Deployment pending</html>'],[{'Content-Type':'model/gltf-binary','Cache-Control':'private, no-store'},'member asset']]){
  let offline=false;const current=await worker({fetcher:async()=>{if(offline)throw Error('Offline');return new Response(body,{headers});}});await current.request(path);assert.equal(current.writes.length,0);current.entries.set(origin+path,new Response(body,{headers}));offline=true;
  assert.equal((await current.request(path)).response.type,'error','bad legacy cache data cannot masquerade as a public model');
 }
 const undated=await worker({fetcher:async()=>new Response('untracked',{headers:{'Content-Type':'model/gltf-binary','Cache-Control':'public, max-age=3600'}})});await undated.request(path);await undated.request(path);assert.equal(undated.calls.length,2,'an absent Date header does not create an indefinite freshness window');
 const future=await worker({fetcher:async()=>asset('model/gltf-binary',Date.parse('2099-01-01T00:00:00Z'))});await future.request(path);await future.request(path);assert.equal(future.calls.length,2,'an invalid future server clock cannot extend asset freshness indefinitely');
 const partial=await worker({fetcher:async()=>new Response('partial model',{status:206,headers:{'Content-Type':'model/gltf-binary','Cache-Control':'public, max-age=3600'}})});await partial.request(path);assert.equal(partial.writes.length,0,'partial model responses never replace a complete offline asset');
});

test('unavailable disk storage does not prevent a live asset request',async()=>{
 const current=await worker({failStorage:true});const {response}=await current.request('/public/models/range.glb');assert.equal(await response.text(),'public asset');assert.equal(current.calls.length,1);
});
