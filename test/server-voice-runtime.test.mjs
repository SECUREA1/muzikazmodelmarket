import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,chmod,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {createVoiceRuntime} from '../server-voice-runtime.mjs';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function fixture(options={}){
 let clock=0,modelReady=false,dependenciesReady=false;const calls=[];
 const runtime=createVoiceRuntime({root:'/fixture',env:{MUZIKAZ_DATA_DIR:'/durable',MUZIKAZ_VOICE_AUTO_INSTALL:'1'},now:()=>clock,logger:null,
  probe:()=>({modelReady,dependenciesReady}),prepareDirectory:async()=>{},run:async(command,args,settings)=>{calls.push({command,args,settings});if(command==='npm'||command==='npm.cmd')dependenciesReady=true;else modelReady=true;},...options});
 return {runtime,calls,setReady(model,deps){modelReady=model;dependenciesReady=deps;},advance(ms){clock+=ms;}};
}

test('cargo-only startup provisions missing engine packages and model in bounded child processes',async()=>{
 const f=fixture();assert.equal(f.runtime.status().available,false);
 const starting=f.runtime.start();assert.equal(f.runtime.status().status,'loading');
 await starting;assert.equal(f.calls.length,2);assert.equal(f.runtime.status().available,true);
 const [dependencies,model]=f.calls;
 assert.deepEqual(dependencies.args,['ci','--omit=dev','--no-audit','--no-fund']);assert.equal(dependencies.settings.env.ONNXRUNTIME_NODE_INSTALL,'skip');assert.equal(dependencies.settings.timeout,120000);
 assert.equal(model.settings.timeout,75000);assert.ok(model.args.includes('--optional'));assert.equal(model.settings.env.MUZIKAZ_SPEECH_MODEL_PATH,join('/durable','voices','kokoro-v1.0.uint8.onnx'));
 await f.runtime.ensure();assert.equal(f.calls.length,2,'ready requests never reinstall dependencies or download the model');
});

test('concurrent voice requests share startup and one canceled browser cannot cancel preparation',async()=>{
 const installation=deferred(),calls=[];let ready=false;
 const runtime=createVoiceRuntime({root:'/fixture',env:{MUZIKAZ_VOICE_AUTO_INSTALL:'1'},logger:null,probe:()=>({dependenciesReady:true,modelReady:ready}),prepareDirectory:async()=>{},run:async(...args)=>{calls.push(args);await installation.promise;ready=true;}});
 const startup=runtime.start(),controller=new AbortController(),first=runtime.ensure({signal:controller.signal}),other=runtime.ensure();
 controller.abort();await assert.rejects(first,error=>error.name==='AbortError');await tick();
 assert.equal(calls.length,1);assert.equal(runtime.status().status,'loading');assert.equal(calls[0][2].signal,undefined,'the caller signal must not reach the shared installer');
 installation.resolve();await Promise.all([startup,other]);assert.equal(runtime.status().available,true);
});

test('failed provisioning backs off, metadata reads stay passive, and the next request retries',async()=>{
 let time=0,attempts=0,ready=false;
 const runtime=createVoiceRuntime({root:'/fixture',env:{MUZIKAZ_VOICE_AUTO_INSTALL:'1'},logger:null,now:()=>time,probe:()=>({dependenciesReady:true,modelReady:ready}),prepareDirectory:async()=>{},run:async()=>{if(++attempts===1)throw Error('private download error');ready=true;}});
 await assert.rejects(runtime.start(),error=>error.code==='SPEECH_UNAVAILABLE'&&!error.message.includes('private'));
 for(let i=0;i<100;i++)assert.equal(runtime.status().status,'unavailable');assert.equal(attempts,1);
 await assert.rejects(runtime.ensure(),error=>error.retryAfter===30);assert.equal(attempts,1);
 time=30000;await runtime.ensure();assert.equal(attempts,2);assert.equal(runtime.status().available,true);
});

test('repeated preparation failures increase the retry delay without a public metadata retry loop',async()=>{
 let time=0,attempts=0,ready=false;
 const runtime=createVoiceRuntime({root:'/fixture',env:{MUZIKAZ_VOICE_AUTO_INSTALL:'1'},logger:null,now:()=>time,probe:()=>({dependenciesReady:true,modelReady:ready}),prepareDirectory:async()=>{},run:async()=>{if(++attempts<=2)throw Error('Download host unavailable');ready=true;}});
 await assert.rejects(runtime.start());assert.equal(runtime.status().retryAfter,30);
 time=30000;await assert.rejects(runtime.ensure());assert.equal(attempts,2);assert.equal(runtime.status().retryAfter,60);
 time=89999;await assert.rejects(runtime.ensure(),error=>error.retryAfter===1);assert.equal(attempts,2);
 for(let i=0;i<100;i++)runtime.status();assert.equal(attempts,2);
 time=90000;await runtime.ensure();assert.equal(attempts,3);assert.equal(runtime.status().available,true);assert.equal(runtime.status().retryAfter,undefined);
});

test('an explicit opt-out never starts npm or a model downloader, including a canceled first waiter',async()=>{
 const f=fixture({env:{MUZIKAZ_VOICE_AUTO_INSTALL:'0'}}),controller=new AbortController();controller.abort();
 await assert.rejects(f.runtime.ensure({signal:controller.signal}),error=>error.name==='AbortError');
 await assert.rejects(f.runtime.start(),error=>error.code==='SPEECH_UNAVAILABLE');assert.equal(f.calls.length,0);
 const testProcess=fixture({env:{NODE_TEST_CONTEXT:'child-v8'}});await assert.rejects(testProcess.runtime.start(),error=>error.code==='SPEECH_UNAVAILABLE');assert.equal(testProcess.calls.length,0);
});

test('partial package files cannot report readiness or skip a failed dependency installation',async()=>{
 let time=0,attempts=0,packagesPresent=false;const completion=deferred();
 const runtime=createVoiceRuntime({root:'/fixture',env:{MUZIKAZ_VOICE_AUTO_INSTALL:'1'},logger:null,now:()=>time,probe:()=>({modelReady:true,dependenciesReady:packagesPresent}),run:async()=>{packagesPresent=true;if(++attempts===1){await completion.promise;throw Error('npm stopped midway');}}});
 const first=runtime.start();await tick();assert.equal(runtime.status().available,false,'appearing package entries do not finish an active install');assert.equal(runtime.status().status,'loading');
 completion.resolve();await assert.rejects(first);assert.equal(runtime.status().available,false,'an interrupted install must remain unavailable even when entry files appeared');
 time=30000;await runtime.ensure();assert.equal(attempts,2);assert.equal(runtime.status().available,true);
});

test('a cached model stays unavailable until one isolated dependency check succeeds, then reuses that check',async()=>{
 const checked=deferred();let checks=0,installs=0;
 const runtime=createVoiceRuntime({root:'/fixture',env:{MUZIKAZ_VOICE_AUTO_INSTALL:'1'},logger:null,probe:()=>({modelReady:true,dependenciesReady:true}),validate:async()=>{checks++;await checked.promise;},run:async()=>{installs++;}});
 assert.equal(runtime.status().available,false);
 const ready=runtime.start();await tick();assert.equal(runtime.status().status,'loading');assert.match(runtime.status().message,/Checking/);assert.equal(checks,1);
 checked.resolve();await ready;assert.equal(runtime.status().available,true);
 await Promise.all([runtime.ensure(),runtime.start()]);assert.equal(checks,1);assert.equal(installs,0);
});

test('an unloadable retained package is repaired and validated again before the runtime reports ready',async()=>{
 let checks=0,installs=0;
 const runtime=createVoiceRuntime({root:'/fixture',env:{MUZIKAZ_VOICE_AUTO_INSTALL:'1'},logger:null,probe:()=>({modelReady:true,dependenciesReady:true}),validate:async()=>{if(++checks===1)throw Error('Native CPU binding missing');},run:async(command)=>{assert.match(command,/npm/);installs++;}});
 await runtime.start();assert.equal(checks,2);assert.equal(installs,1);assert.equal(runtime.status().available,true);
});

test('the real isolated check rejects unloadable and wrong-version packages without auto-installing when disabled',async t=>{
 const root=await mkdtemp(join(tmpdir(),'voice-native-validation-'));t.after(()=>rm(root,{recursive:true,force:true}));
 await writeFile(join(root,'package.json'),'{}');
 for(const [name,version]of [['onnxruntime-node','1.23.2'],['phonemizer','1.2.1']]){const folder=join(root,'node_modules',name);await mkdir(folder,{recursive:true});await writeFile(join(folder,'package.json'),JSON.stringify({name,version,main:'index.js'}));await writeFile(join(folder,'index.js'),name==='onnxruntime-node'?'throw Error("Native CPU binding missing");':'module.exports={};');}
 const model=join(root,'model.onnx'),file=await import('node:fs/promises').then(fs=>fs.open(model,'w'));await file.truncate(10000001);await file.close();
 const create=()=>createVoiceRuntime({root,env:{MUZIKAZ_VOICE_AUTO_INSTALL:'0',MUZIKAZ_SPEECH_MODEL_PATH:model},logger:null,run:async()=>{assert.fail('An explicit opt-out must not run npm.');}});
 const broken=create();assert.equal(broken.status().available,false);await assert.rejects(broken.start(),error=>error.code==='SPEECH_UNAVAILABLE');assert.equal(broken.status().available,false);
 await writeFile(join(root,'node_modules','onnxruntime-node','index.js'),'module.exports={};');await writeFile(join(root,'node_modules','onnxruntime-node','package.json'),JSON.stringify({name:'onnxruntime-node',version:'1.23.1',main:'index.js'}));
 const older=create();await assert.rejects(older.start(),error=>error.code==='SPEECH_UNAVAILABLE');assert.equal(older.status().available,false);
 await writeFile(join(root,'node_modules','onnxruntime-node','package.json'),JSON.stringify({name:'onnxruntime-node',version:'1.23.2',main:'index.js'}));
 const correct=create();await correct.start();assert.equal(correct.status().available,true,'Disabling installation still allows a verified existing engine to play.');
});

test('a valid build cache and explicit model location are reused without downloads',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'voice-cache-path-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 await mkdir(join(directory,'.speech-models'));const model=join(directory,'.speech-models','kokoro-v1.0.uint8.onnx');
 const file=await import('node:fs/promises').then(fs=>fs.open(model,'w'));await file.truncate(10000001);await file.close();
 const calls=[],runtime=createVoiceRuntime({root:directory,env:{MUZIKAZ_DATA_DIR:join(directory,'data'),MUZIKAZ_VOICE_AUTO_INSTALL:'1'},probe:path=>({dependenciesReady:true,modelReady:path===model}),run:async(...args)=>calls.push(args)});
 assert.equal(runtime.modelPath,model);await runtime.start();assert.equal(calls.length,0);
 const explicit=createVoiceRuntime({root:directory,env:{MUZIKAZ_SPEECH_MODEL_PATH:'/selected/model.onnx'},probe:()=>({dependenciesReady:true,modelReady:true}),run:async(...args)=>calls.push(args)});
 assert.equal(explicit.modelPath,'/selected/model.onnx');await explicit.ensure();assert.equal(calls.length,0);
});

test('a read-only runtime data directory falls back safely unless the operator chose an explicit path',async()=>{
 let ready=false;
 const fallback=fixture({probe:()=>({dependenciesReady:true,modelReady:ready}),prepareDirectory:async path=>{if(path.startsWith('/durable'))throw Error('Read only');},run:async()=>{ready=true;}});
 await fallback.runtime.start();assert.equal(fallback.runtime.modelPath,join('/fixture','.speech-models','kokoro-v1.0.uint8.onnx'));
 const explicit=fixture({env:{MUZIKAZ_VOICE_AUTO_INSTALL:'1',MUZIKAZ_SPEECH_MODEL_PATH:'/selected/model.onnx'},probe:()=>({dependenciesReady:true,modelReady:false}),prepareDirectory:async()=>{throw Error('Read only');}});
 await assert.rejects(explicit.runtime.start(),error=>error.code==='SPEECH_UNAVAILABLE');assert.equal(explicit.calls.length,0);
});

test('real installer child commands recover an empty compatibility-hosted checkout while HTTP remains available',async t=>{
 // These child fixtures test installation and startup, not model quality. Real
 // inference and audible output are exercised by neural-speech.browser.py.
 const root=await mkdtemp(join(tmpdir(),'voice-compatibility-runtime-'));t.after(()=>rm(root,{recursive:true,force:true}));
 for(const folder of ['scripts','tools'])await mkdir(join(root,folder));
 await writeFile(join(root,'package.json'),JSON.stringify({private:true,dependencies:{'onnxruntime-node':'1.23.2',phonemizer:'1.2.1'}}));
 await writeFile(join(root,'scripts','fixture-npm.mjs'),`import {mkdir,writeFile} from 'node:fs/promises';import {join} from 'node:path';await new Promise(r=>setTimeout(r,100));for(const [name,version]of [['onnxruntime-node','1.23.2'],['phonemizer','1.2.1']]){const folder=join(process.cwd(),'node_modules',name);await mkdir(folder,{recursive:true});await writeFile(join(folder,'package.json'),JSON.stringify({name,version,main:'index.js'}));await writeFile(join(folder,'index.js'),'module.exports={};');}await writeFile('install-command.json',JSON.stringify({args:process.argv.slice(2),cpu:process.env.ONNXRUNTIME_NODE_INSTALL}));`);
 await writeFile(join(root,'scripts','prepare-neural-voices.mjs'),`import {open} from 'node:fs/promises';await new Promise(r=>setTimeout(r,50));const model=await open(process.env.MUZIKAZ_SPEECH_MODEL_PATH,'w');await model.truncate(10000001);await model.close();`);
 const executable=join(root,'tools','npm');await writeFile(executable,`#!/bin/sh\nexec '${process.execPath}' '${join(root,'scripts','fixture-npm.mjs')}' "$@"\n`);await chmod(executable,0o755);
 const runtime=createVoiceRuntime({root,env:{...process.env,MUZIKAZ_DATA_DIR:join(root,'data'),MUZIKAZ_VOICE_AUTO_INSTALL:'1',PATH:join(root,'tools')+':'+process.env.PATH},logger:null});
 assert.equal(runtime.status().dependenciesReady,false);assert.equal(runtime.status().modelReady,false);
 const server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({health:'ready',voices:runtime.status()}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const preparation=runtime.start(),response=await fetch('http://127.0.0.1:'+server.address().port);
 assert.equal(response.status,200);assert.equal((await response.json()).voices.status,'loading');
 await preparation;assert.equal(runtime.status().available,true);assert.equal((await stat(runtime.modelPath)).size,10000001);
 assert.deepEqual(JSON.parse(await readFile(join(root,'install-command.json'),'utf8')),{args:['ci','--omit=dev','--no-audit','--no-fund'],cpu:'skip'});
});
