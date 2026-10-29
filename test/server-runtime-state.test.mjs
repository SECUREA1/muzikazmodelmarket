import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,readdir,rm,stat,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readRuntimeMessages,writeRuntimeMessages} from '../server-runtime-state.mjs';

async function directory(t){const path=await mkdtemp(join(tmpdir(),'server-runtime-'));t.after(()=>rm(path,{recursive:true,force:true}));return path;}

test('valid history retains its latest messages and atomic writes leave no partial documents',async t=>{
  const root=await directory(t),file=join(root,'nested','server-runtime.json');
  const value={chatMessages:Array.from({length:120},(_,id)=>({id})),supportMessages:Array.from({length:520},(_,id)=>({id}))};
  await writeRuntimeMessages(file,value);
  assert.deepEqual(JSON.parse(await readFile(file,'utf8')),value);
  assert.equal((await stat(file)).mode&0o777,0o600);
  const messages=await readRuntimeMessages(file);
  assert.equal(messages.chatMessages.length,100);assert.equal(messages.chatMessages[0].id,20);
  assert.equal(messages.supportMessages.length,500);assert.equal(messages.supportMessages[0].id,20);
  assert.deepEqual(await readdir(join(root,'nested')),['server-runtime.json']);
});

test('truncated or invalid ancillary history is preserved byte for byte before startup recovery',async t=>{
  const root=await directory(t);
  for(const [name,bytes] of [['truncated','{"chatMessages":['],['null','null'],['array','[]']]){
    const file=join(root,name+'.json'),warnings=[];
    await writeFile(file,bytes,{mode:0o600});
    assert.deepEqual(await readRuntimeMessages(file,{warn:message=>warnings.push(message)}),{chatMessages:[],supportMessages:[]});
    const recovery=(await readdir(root)).find(entry=>entry.startsWith(name+'.json.corrupt-'));
    assert.ok(recovery);assert.equal(await readFile(join(root,recovery),'utf8'),bytes);
    assert.equal(warnings.length,1);assert.match(warnings[0],/preserved/);
    await assert.rejects(readFile(file),{code:'ENOENT'});
  }
});

test('missing history is empty but filesystem failures still fail visibly',async t=>{
  const root=await directory(t);
  assert.deepEqual(await readRuntimeMessages(join(root,'missing.json')),{chatMessages:[],supportMessages:[]});
  const invalid=join(root,'directory.json');await mkdir(invalid);
  await assert.rejects(readRuntimeMessages(invalid),error=>error.code==='EISDIR');
  await assert.rejects(writeRuntimeMessages(invalid,{chatMessages:[],supportMessages:[]}));
  assert.ok((await stat(invalid)).isDirectory());
  assert.deepEqual((await readdir(root)).filter(file=>file.endsWith('.tmp')),[]);
});
