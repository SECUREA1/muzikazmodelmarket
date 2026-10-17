import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {applyHttpSecurity} from '../http-security.mjs';

test('security headers preserve first-party embedding and request-dependent transport guarantees',()=>{
 for(const secure of [false,true]){
  const headers={};applyHttpSecurity({socket:{encrypted:secure}},{setHeader:(k,v)=>headers[k]=v});
  assert.equal(headers['X-Content-Type-Options'],'nosniff');
  assert.match(headers['Content-Security-Policy'],/frame-ancestors 'self' https:\/\/muzikaz.com/);
  assert.match(headers['Content-Security-Policy'],/form-action 'self'/);
  assert.match(headers['Permissions-Policy'],/camera=\(self\), microphone=\(self\)/);
  assert.equal(Boolean(headers['Strict-Transport-Security']),secure);
 }
 const headers={};applyHttpSecurity({socket:{}},{setHeader:(k,v)=>headers[k]=v},{production:true});assert.equal(headers['Strict-Transport-Security'],'max-age=15552000');
});

test('offline caching bypasses credentials/uploads and respects private and no-store responses',async()=>{
 const source=await readFile(new URL('../service-worker.js',import.meta.url),'utf8');
 const listeners={},cached=[],deleted=[];let control='public, max-age=3600';
 const cache={put:async request=>cached.push(request.url)};
 vm.runInNewContext(source,{
  self:{addEventListener:(name,handler)=>listeners[name]=handler,clients:{claim:async()=>{}}},
  URL,location:{origin:'https://muzikaz.com'},Response,
  fetch:async()=>new Response('body',{headers:{'Cache-Control':control}}),
  caches:{open:async()=>cache,keys:async()=>['muzikaz-world-v2.3.4'],delete:async key=>deleted.push(key)}
 });
 async function request(path,headers={}){
  let intercepted=false;const tasks=[];
  listeners.fetch({request:new Request('https://muzikaz.com'+path,{headers}),waitUntil:p=>tasks.push(p),respondWith:p=>{intercepted=true;tasks.push(p);}});
  for(let i=0;i<tasks.length;i++)await tasks[i];return intercepted;
 }
 assert.equal(await request('/api/market/session'),false);
 assert.equal(await request('/uploads/assets/member-private.glb'),false);
 assert.equal(await request('/index.html',{Authorization:'Bearer test-proof'}),false);
 for(const policy of ['private, max-age=0','no-store']){control=policy;assert.equal(await request('/styles.css'),true);}
 assert.equal(cached.length,0);control='public, max-age=3600';await request('/styles.css');assert.equal(cached.length,1);
 let activated;listeners.activate({waitUntil:p=>activated=p});await activated;assert.deepEqual(deleted,['muzikaz-world-v2.3.4']);
});
