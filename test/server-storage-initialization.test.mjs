import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,mkdir,stat,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';

const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const start=source.indexOf('async function ensureStorage()'),end=source.indexOf('async function readRepositoryEnvironments()',start);
const setupSource=source.slice(start,end);
const paths={dataDir:'data-dir',uploadDir:'uploads',assetUploadDir:'assets',environmentUploadDir:'environments',dataFile:'data.json',assetsFile:'assets.json',modelsFile:'models.json',environmentDataFile:'environments.json',avatarProfilesFile:'profiles.json',customMapsFile:'maps.json'};
const directories=[paths.dataDir,paths.uploadDir,paths.assetUploadDir,paths.environmentUploadDir];
const files=[paths.dataFile,paths.assetsFile,paths.modelsFile,paths.environmentDataFile,paths.avatarProfilesFile,paths.customMapsFile];
const deferred=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes;});return {promise,resolve};};
const turns=async()=>{for(let index=0;index<8;index++)await Promise.resolve();};
const failure=code=>Object.assign(new Error(code),{code});
function fixture(operations,locations=paths){
 const context=vm.createContext({...locations,...operations});vm.runInContext(setupSource,context);return ()=>context.ensureStorage();
}

test('storage setup starts independent directory work together, then independent file checks together',async()=>{
 const directoriesStarted=[],filesStarted=[],dirGates=directories.map(deferred),fileGates=files.map(deferred);
 const ensure=fixture({mkdir:directory=>{directoriesStarted.push(directory);return dirGates[directories.indexOf(directory)].promise;},stat:file=>{filesStarted.push(file);return fileGates[files.indexOf(file)].promise;},writeFile:()=>{throw Error('Existing files must not be rewritten.');}});
 const pending=ensure();assert.deepEqual(directoriesStarted,directories);assert.deepEqual(filesStarted,[]);
 for(const gate of dirGates.slice(0,-1))gate.resolve();await turns();assert.deepEqual(filesStarted,[],'all directories must be ready before checking files');
 dirGates.at(-1).resolve();await turns();assert.deepEqual(filesStarted,files);
 for(const gate of fileGates)gate.resolve();await pending;
});

test('concurrent initializers preserve existing JSON and create each missing document once',async()=>{
 const documents=new Map([[paths.dataFile,'[{"id":"saved-record"}]']]),gate=deferred();let checks=0,created=0;const attempts=[];
 const ensure=fixture({mkdir:async()=>{},stat:async file=>{if(documents.has(file))return {};if(++checks===10)gate.resolve();await gate.promise;throw failure('ENOENT');},writeFile:async(file,contents,options)=>{attempts.push({file,flag:options.flag});if(documents.has(file))throw failure('EEXIST');documents.set(file,contents);created++;}});
 await Promise.all([ensure(),ensure()]);
 assert.equal(created,5);assert.equal(documents.size,6);assert.equal(documents.get(paths.dataFile),'[{"id":"saved-record"}]');
 for(const file of files.slice(1))assert.equal(documents.get(file),'[]');
 assert.equal(attempts.length,10);assert.ok(attempts.every(attempt=>attempt.flag==='wx'));
});

test('a writer that wins after a missing-file check cannot have its live data overwritten',async()=>{
 const documents=new Map(),live='[{"id":"created-by-another-request"}]';
 const ensure=fixture({mkdir:async()=>{},stat:async()=>{throw failure('ENOENT');},writeFile:async(file,contents,options)=>{assert.equal(options.flag,'wx');if(file===paths.dataFile){documents.set(file,live);throw failure('EEXIST');}documents.set(file,contents);}});
 await ensure();assert.equal(documents.get(paths.dataFile),live);
});

test('unexpected directory, stat and creation errors are propagated instead of resetting storage',async()=>{
 for(const stage of ['directory','stat','create']){
  const expected=failure(stage==='create'?'EROFS':'EACCES'),writes=[];
  const ensure=fixture({mkdir:async directory=>{if(stage==='directory'&&directory===paths.dataDir)throw expected;},stat:async file=>{if(file!==paths.dataFile)return {};if(stage==='stat')throw expected;if(stage==='create')throw failure('ENOENT');return {};},writeFile:async file=>{writes.push(file);throw expected;}});
  await assert.rejects(ensure(),error=>error===expected);
  assert.equal(writes.length,stage==='create'?1:0);
 }
});

test('real concurrent filesystem setup retains saved data and creates readable defaults',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'storage-initialization-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const locations={dataDir:join(directory,'data'),uploadDir:join(directory,'uploads'),assetUploadDir:join(directory,'uploads','assets'),environmentUploadDir:join(directory,'uploads','environments')};
 for(const [key,value]of Object.entries(paths))if(key.endsWith('File'))locations[key]=join(locations.dataDir,value);
 await mkdir(locations.dataDir,{recursive:true});await writeFile(locations.dataFile,'[{"id":"persisted"}]');
 const ensure=fixture({mkdir,stat,writeFile},locations);await Promise.all(Array.from({length:24},()=>ensure()));
 assert.deepEqual(JSON.parse(await readFile(locations.dataFile,'utf8')),[{id:'persisted'}]);
 for(const key of ['assetsFile','modelsFile','environmentDataFile','avatarProfilesFile','customMapsFile'])assert.deepEqual(JSON.parse(await readFile(locations[key],'utf8')),[]);
});
