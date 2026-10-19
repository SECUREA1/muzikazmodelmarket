import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {releaseAssetUrl,releaseStaticAssets,validateStaticRelease,versionStaticSource} from '../scripts/static-release.mjs';
import {staticAssetCacheControl} from '../static-asset-cache.mjs';

const fixture={
 'model-explorer.html':'<script src="public/js/launcher.js"></script><script type="module">import "./public/js/client.js";</script><link rel="stylesheet" href="styles.css">',
 'public/js/launcher.js':"var module={}; module.src='public/js/engine.js';",
 'public/js/engine.js':"import {client} from './client.js'; export {client}; export const more=()=>import('./shared.js?feature=1#ready'); const model=new URL('../models/arena.glb',import.meta.url);",
 'public/js/client.js':"export {shared as client} from './shared.js';",
 'public/js/shared.js':"export const shared='old';",
 'service-worker.js':"const RELEASE = 'development'; const CACHE='muzikaz-world-'+RELEASE;",
 'styles.css':'.game{color:lime}'
};
async function putFixture(directory,files=fixture){for(const [path,source]of Object.entries(files)){await mkdir(dirname(join(directory,path)),{recursive:true});await writeFile(join(directory,path),source);}}

test('static releases pin HTML, deferred launcher and the entire local import graph to one revision',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'muzikaz-static-release-'));
 try{
  await putFixture(directory);const {revision,assets}=await releaseStaticAssets(directory);
  assert.match(revision,/^[a-f0-9]{20}$/);
  const emitted=new Map(await Promise.all(assets.map(async path=>[path,await readFile(join(directory,path),'utf8')])));
  const html=emitted.get('model-explorer.html'),launcher=emitted.get('public/js/launcher.js'),engine=emitted.get('public/js/engine.js');
  assert.ok(html.includes(`public/js/launcher.js?release=${revision}`));assert.ok(html.includes(`./public/js/client.js?release=${revision}`));assert.ok(html.includes(`styles.css?release=${revision}`));
  assert.ok(launcher.includes(`module.src='public/js/engine.js?release=${revision}'`),'classic deferred script URLs resolve relative to the document');
  assert.ok(engine.includes(`from './client.js?release=${revision}'`));assert.ok(engine.includes(`'./shared.js?feature=1&release=${revision}#ready'`));assert.ok(engine.includes("'../models/arena.glb'"),'models retain their stable immutable URLs');
  for(const [path,source]of emitted)if(path.endsWith('.js')){
   for(const [,specifier]of source.matchAll(/(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g)){
    const resolved=new URL(specifier,'https://example.test/'+path);
    assert.equal(resolved.searchParams.get('release'),revision);assert.ok(assets.includes(resolved.pathname.slice(1)),`module ${specifier} resolves from ${path}`);
   }
  }
  assert.ok(emitted.get('service-worker.js').includes(`const RELEASE = '${revision}'`));
  assert.equal(JSON.parse(await readFile(join(directory,'asset-release.json'),'utf8')).revision,revision);
  assert.equal((await validateStaticRelease(directory)).revision,revision);
  await writeFile(join(directory,'public/js/client.js'),"export {shared as client} from './shared.js?release=obsolete';");
  await assert.rejects(validateStaticRelease(directory),/mixes release revisions/,'validation rejects an old dependency inside a new graph');
  await writeFile(join(directory,'public/js/client.js'),"export {shared as client} from './absent.js';");
  await assert.rejects(validateStaticRelease(directory),/missing from the static build/,'a release cannot ship a broken local module edge');
  const first=revision;await putFixture(directory);assert.equal((await releaseStaticAssets(directory)).revision,first,'identical source builds are deterministic');
  await putFixture(directory,{...fixture,'public/js/shared.js':"export const shared='new';"});const next=await releaseStaticAssets(directory);assert.notEqual(next.revision,first);
  assert.ok((await readFile(join(directory,'public/js/launcher.js'),'utf8')).includes(`release=${next.revision}`),'a deep dependency change also invalidates the launcher');
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('release rewriting leaves external code, bare specifiers, models and API strings unchanged',()=>{
 const assets=new Set(['public/js/main.js','public/js/dep.js','styles.css']);
 assert.equal(releaseAssetUrl('./dep.js?x=1&release=old#part','public/js/main.js','new',assets),'./dep.js?x=1&release=new#part');
 for(const value of ['https://cdn.test/dep.js','//cdn.test/dep.js','three','./missing.js','/api/code.js','../arena.glb','bad%.js'])assert.equal(releaseAssetUrl(value,'public/js/main.js','new',assets),value);
 const source="import './dep.js'; const remote=import('https://cdn.test/dep.js'); const notice='Choose something.js please';";
 assert.equal(versionStaticSource(source,'public/js/main.js','new',assets),"import './dep.js?release=new'; const remote=import('https://cdn.test/dep.js'); const notice='Choose something.js please';");
});

test('server cache policy revalidates code and documents while keeping GLB and USDZ immutable',()=>{
 for(const extension of ['.html','.htm','.js','.mjs','.css','.json'])assert.equal(staticAssetCacheControl(extension),'no-cache');
 for(const extension of ['.glb','.usdz'])assert.equal(staticAssetCacheControl(extension),'public, max-age=31536000, immutable');
 assert.equal(staticAssetCacheControl('.png'),'public, max-age=3600');
});

async function serviceWorkerFixture(){
 const source=await readFile(new URL('../service-worker.js',import.meta.url),'utf8'),listeners={},requests=[],matched=[],deleted=[];let fail=false,claimed=false;
 const context={URL,Request,Response,location:{origin:'https://www.muzikaz.com'},self:{addEventListener:(name,handler)=>{listeners[name]=handler;},skipWaiting:async()=>{},clients:{claim:async()=>{claimed=true;}}},caches:{open:async()=>({addAll:async()=>{},put:async()=>{}}),keys:async()=>['muzikaz-world-v2.3.4','muzikaz-world-runtime-v3-development','unrelated-cache'],delete:async key=>{deleted.push(key);},match:async request=>{matched.push(request);return new Response('stale cached engine');}},fetch:async(request,options)=>{requests.push({request,options});if(fail)throw new Error('offline');return new Response('fresh runtime');}};
 vm.runInNewContext(source,context);
 return {listeners,requests,matched,deleted,set fail(value){fail=value;},get claimed(){return claimed;}};
}

test('service worker revalidates live JS and HTML and never falls back to an obsolete engine',async()=>{
 const fixture=await serviceWorkerFixture();
 async function request(path,{mode='cors'}={}){let response;fixture.listeners.fetch({request:{url:'https://www.muzikaz.com'+path,method:'GET',mode},respondWith:value=>{response=value;}});return response;}
 assert.equal(await (await request('/public/js/engine.js?release=new')).text(),'fresh runtime');assert.equal(fixture.requests.at(-1).options.cache,'no-cache');
 await request('/model-explorer.html',{mode:'navigate'});assert.equal(fixture.requests.at(-1).options.cache,'no-cache');
 fixture.fail=true;const failed=await request('/public/js/engine.js?release=old');assert.equal(failed.type,'error');assert.equal(fixture.matched.length,0,'old cached JS is never consulted, even offline');
 const media=await request('/public/models/arena.glb');assert.equal(await media.text(),'stale cached engine');assert.equal(fixture.matched.length,1,'media retains its offline fallback');
 let activation;fixture.listeners.activate({waitUntil:value=>{activation=value;}});await activation;
 assert.deepEqual(fixture.deleted,['muzikaz-world-v2.3.4']);assert.equal(fixture.claimed,true);
 const before=fixture.requests.length;assert.equal(await request('/api/rooms/house/gameplay'),undefined);assert.equal(fixture.requests.length,before,'authenticated APIs bypass the worker');
});

test('an updated service worker reloads existing game tabs once and bypasses the registration cache',async()=>{
 const source=await readFile(new URL('../pwa.js',import.meta.url),'utf8'),listeners={},windowListeners={},registered=[];let reloads=0;
 const worker={controller:{},addEventListener:(name,callback)=>{listeners[name]=callback;},register:async(...args)=>{registered.push(args);}};
 vm.runInNewContext(source,{navigator:{serviceWorker:worker},location:{protocol:'https:'},window:{addEventListener:(name,callback)=>{windowListeners[name]=callback;},location:{reload:()=>reloads++}},console});
 windowListeners.load();await Promise.resolve();assert.equal(registered[0][1].updateViaCache,'none');
 listeners.controllerchange();listeners.controllerchange();assert.equal(reloads,1,'a live game tab starts a coherent new module graph after activation');
});
