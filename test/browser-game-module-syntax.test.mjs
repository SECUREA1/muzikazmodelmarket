import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

async function javascriptFiles(directory){
 const entries=await readdir(directory,{withFileTypes:true}),files=[];
 for(const entry of entries){
  const path=new URL(entry.name+(entry.isDirectory()?'/':''),directory);
  if(entry.isDirectory())files.push(...await javascriptFiles(path));
  else if(/\.m?js$/.test(entry.name))files.push(path);
 }
 return files;
}

test('all application browser modules, server modules and build scripts parse as JavaScript',async()=>{
 const root=new URL('../',import.meta.url);
 const files=[...(await javascriptFiles(new URL('public/js/',root))),...(await javascriptFiles(new URL('scripts/',root)))];
 for(const entry of await readdir(root,{withFileTypes:true}))if(entry.isFile()&&/\.m?js$/.test(entry.name))files.push(new URL(entry.name,root));
 assert.ok(files.length>400,'include every application module rather than a hand-picked subset');
 for(const file of files){
  const result=spawnSync(process.execPath,['--input-type=module','--check'],{input:await readFile(file,'utf8'),encoding:'utf8'});
  assert.equal(result.status,0,file.pathname+': '+result.stderr.slice(-1500));
 }
});
