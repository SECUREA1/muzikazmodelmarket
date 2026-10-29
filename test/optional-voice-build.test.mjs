import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,cp,chmod,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const run=promisify(execFile),root=new URL('../',import.meta.url);
async function fixture(t){
 const directory=await mkdtemp(join(tmpdir(),'optional-voices-build-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 await Promise.all(['scripts','public/js','tools'].map(path=>mkdir(join(directory,path),{recursive:true})));
 for(const path of ['package.json','http-security.mjs','static-cache-policy.mjs','scripts/prepare-neural-voices.mjs','scripts/build-static.mjs'])await cp(new URL(path,root),join(directory,path));
 await writeFile(join(directory,'index.html'),'<!doctype html><title>Game startup fixture</title><script type="module" src="public/js/advanced-model.js"></script>');
 await writeFile(join(directory,'public/js/advanced-model.js'),'export const graphicsReady = true;');
 const curl=join(directory,'tools/curl');
 await writeFile(curl,'#!/bin/sh\nprintf "%s\\n" "$@" > "$VOICE_CURL_LOG"\nprintf "fixture: model host unavailable\\n" >&2\nexit 22\n');await chmod(curl,0o755);
 const log=join(directory,'curl.log');
 return {directory,log,env:{...process.env,PATH:join(directory,'tools')+':'+process.env.PATH,VOICE_CURL_LOG:log,MUZIKAZ_SPEECH_MODEL_DIR:join(directory,'voices'),MUZIKAZ_SPEECH_MODEL_PATH:join(directory,'voices/model.onnx')}};
}
const missing=async path=>{try{await stat(path);return false;}catch(error){if(error.code!=='ENOENT')throw error;return true;}};

test('the real deployment build still publishes graphics modules when the optional voice host fails',async t=>{
 const {directory,env,log}=await fixture(t);
 const result=await run('npm',['run','build'],{cwd:directory,env});
 assert.match(result.stderr,/Optional voice preparation failed; continuing the site build/);
 assert.match(result.stdout,/Built optimized static site into dist/);
 assert.equal(await readFile(join(directory,'dist/public/js/advanced-model.js'),'utf8'),'export const graphicsReady = true;');
 assert.match(await readFile(join(directory,'dist/index.html'),'utf8'),/Game startup fixture/);
 assert.match(await readFile(join(directory,'dist/_headers'),'utf8'),/\/uploads\/\*/);
 const args=(await readFile(log,'utf8')).trim().split('\n');
 assert.equal(args[args.indexOf('--retry')+1],'0');assert.equal(args[args.indexOf('--max-time')+1],'60');
 for(const suffix of ['', '.download','.tmp'])assert.equal(await missing(env.MUZIKAZ_SPEECH_MODEL_PATH+suffix),true);
});

test('explicit voice installation keeps strict failure reporting and its retry policy',async t=>{
 const {directory,env,log}=await fixture(t);
 await assert.rejects(run('npm',['run','build:voices'],{cwd:directory,env}),error=>error.code!==0&&/fixture: model host unavailable/.test(error.stderr));
 const args=(await readFile(log,'utf8')).trim().split('\n');
 assert.equal(args[args.indexOf('--retry')+1],'3');assert.equal(args[args.indexOf('--max-time')+1],'300');
 assert.equal(await missing(join(directory,'dist')),true);
});

test('a verified voice cache is reused offline and failed refreshes leave installed bytes untouched',async t=>{
 const {directory,env,log}=await fixture(t),output=env.MUZIKAZ_SPEECH_MODEL_PATH;
 await mkdir(join(directory,'voices'));const installed=Buffer.from('prepared voice model cache fixture');
 const source=await readFile(join(directory,'scripts/prepare-neural-voices.mjs'),'utf8'),sourceSHA=source.match(/const sourceSHA='([^']+)'/)[1];
 await writeFile(output,installed);await writeFile(output+'.json',JSON.stringify({sourceSHA256:sourceSHA,sha256:createHash('sha256').update(installed).digest('hex')}));
 const cached=await run('npm',['run','build:voices'],{cwd:directory,env});
 assert.match(cached.stdout,/voice model is ready/);assert.equal(await missing(log),true,'the verified cache requires no downloader');
 await writeFile(output+'.json',JSON.stringify({sourceSHA256:sourceSHA,sha256:'mismatched-checksum'}));
 const refreshed=await run(process.execPath,['scripts/prepare-neural-voices.mjs','--optional'],{cwd:directory,env});
 assert.match(refreshed.stderr,/Optional voice preparation failed/);
 assert.deepEqual(await readFile(output),installed);
 assert.equal(await missing(output+'.download'),true);assert.equal(await missing(output+'.tmp'),true);
});
