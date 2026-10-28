import test from 'node:test';
import assert from 'node:assert/strict';
import {connectAuthoritativeRoom} from '../public/js/authoritative-room-client.js';
import {compactRoomSnapshot} from '../public/js/room-snapshot.js';

const wire=value=>JSON.parse(JSON.stringify(value));
const response=data=>({ok:true,status:200,json:async()=>({data})});
function full(sequence,definition='original'){
 return {authoritative:true,selfId:'me',sequence,serverTime:sequence*50,inputEpoch:'epoch',sceneVersion:'map-v1',
  players:{me:{position:{x:sequence,y:0,z:0},health:100}},
  actors:{machine:{id:'machine',position:{x:sequence,z:1},definition:{name:definition,parts:Array(100).fill('component')},asset:{id:'owned-machine'}}},
  objects:{wall:{paint:Array(100).fill(123)}},construction:{crew:{name:'Crew'},earthworks:{revision:1,patches:Array(30).fill({height:1})}},futureFeature:{untouched:true}};
}
async function withClient(fetch,run,options={}){
 const oldWindow=globalThis.window,oldDocument=globalThis.document,oldInterval=globalThis.setInterval,oldClear=globalThis.clearInterval;
 globalThis.window={fetch};globalThis.document={hidden:false};
 globalThis.setInterval=()=>1;globalThis.clearInterval=()=>{};
 const client=connectAuthoritativeRoom({roomId:'protocol-client',input:()=>({}),render(){},...options});
 try{await client.whenReady();await run(client);}finally{client.stop();globalThis.window=oldWindow;globalThis.document=oldDocument;globalThis.setInterval=oldInterval;globalThis.clearInterval=oldClear;}
}

test('the real client negotiates component acknowledgements and presents fully hydrated snapshots',async()=>{
 let sequence=0,definition='original';const commands=[],packets=[],renders=[];
 await withClient(async(path,options)=>{
  if(path==='/api/game/room-session')return response({csrfToken:'proof'});
  const command=JSON.parse(options.body);commands.push(command);
  if(command.action==='interact')definition='changed-by-action';
  const packet=wire(compactRoomSnapshot(full(++sequence,definition),command,{id:'client-roundtrip'}));packets.push(packet);return response(packet);
 },async client=>{
  const first=await client.send('input',{input:{side:1}});assert.deepEqual(first,wire(full(2)));
  const next=await client.send('input',{input:{side:0}});assert.deepEqual(next,wire(full(3)));
  assert.equal(commands[1].snapshotProtocol,2);assert.deepEqual(commands[1].snapshotAcknowledgements,{});
  assert.ok(commands[2].snapshotAcknowledgements['@actorMetadata']);
  assert.equal(packets[2].snapshotActorMetadata,undefined);assert.equal(packets[2].objects,undefined);
  assert.equal(packets[2].snapshotEarthworks,undefined);
  await client.send('interact');const afterAction=await client.send('input',{input:{}});
  assert.deepEqual(afterAction,wire(full(5,'changed-by-action')));
  assert.ok(renders.every(state=>state.actors.machine.definition&&state.actors.machine.asset&&state.construction.earthworks));
  assert.ok(renders.every(state=>state.snapshotRevisions===undefined&&state.snapshotActorMetadata===undefined));
 },{render:state=>renders.push(state)});
});

test('missing metadata baseline retains the visible scene and recovers with a full input reply',async()=>{
 let sequence=0,corruptNext=false;const commands=[],renders=[];
 await withClient(async(path,options)=>{
  if(path==='/api/game/room-session')return response({csrfToken:'proof'});
  const command=JSON.parse(options.body);commands.push(command);
  const packet=wire(compactRoomSnapshot(full(++sequence),command,{id:'client-recovery'}));
  if(corruptNext){corruptNext=false;packet.snapshotRevisions['@actorMetadata']='missing-baseline';}
  return response(packet);
 },async client=>{
  await client.send('input',{input:{}});const visible=renders.at(-1),count=renders.length;
  corruptNext=true;await assert.rejects(client.send('input',{input:{side:1}}),{code:'SNAPSHOT_BASELINE_MISSING'});
  assert.equal(client.ready,true);assert.equal(renders.length,count);assert.equal(renders.at(-1),visible);
  const recovered=await client.send('input',{input:{side:0}});
  assert.equal(commands.at(-1).snapshotMode,'full');assert.deepEqual(commands.at(-1).snapshotAcknowledgements,{});
  assert.deepEqual(recovered,wire(full(4)));assert.equal(client.ready,true);
  assert.equal(commands.filter(command=>command.action==='join').length,1);
  assert.equal(new Set(commands.map(command=>command.requestId)).size,commands.length,'recovery sends no duplicate gameplay action');
 },{render:state=>renders.push(state)});
});

test('concurrent replies use their captured baseline and older packets cannot rewind a newer scene',async()=>{
 let sequence=0,definition='original',releaseOlder;const commands=[],renders=[];
 await withClient(async(path,options)=>{
  if(path==='/api/game/room-session')return response({csrfToken:'proof'});
  const command=JSON.parse(options.body);commands.push(command);
  if(command.action==='interact')definition='new-definition';
  const packet=wire(compactRoomSnapshot(full(++sequence,definition),command,{id:'client-concurrency'}));
  if(sequence===3)return new Promise(resolve=>{releaseOlder=()=>resolve(response(packet));});
  return response(packet);
 },async client=>{
  await client.send('input',{input:{}});
  const older=client.send('input',{input:{side:1}});
  for(let i=0;i<25&&!releaseOlder;i++)await Promise.resolve();assert.ok(releaseOlder);
  await client.send('interact');await client.send('input',{input:{side:0}});
  const current=renders.at(-1);assert.equal(current.sequence,5);assert.equal(current.actors.machine.definition.name,'new-definition');
  releaseOlder();const delayed=await older;assert.equal(delayed.sequence,3);assert.equal(delayed.actors.machine.definition.name,'original');
  assert.equal(renders.at(-1),current);const next=await client.send('input',{input:{}});
  assert.deepEqual(next,wire(full(6,'new-definition')));assert.equal(commands.at(-1).snapshotMode,'compact');
  assert.equal(commands.filter(command=>command.action==='join').length,1);
 },{render:state=>renders.push(state)});
});

test('an explicit older client protocol keeps legacy compact requests and hydrated scenery',async()=>{
 let sequence=0;const commands=[];
 await withClient(async(path,options)=>{
  if(path==='/api/game/room-session')return response({csrfToken:'proof'});
  const command=JSON.parse(options.body);commands.push(command);return response(wire(compactRoomSnapshot(full(++sequence),command,{id:'client-legacy'})));
 },async client=>{
  const state=await client.send('input',{input:{}});assert.ok(state.actors.machine.definition);
  assert.equal(commands.at(-1).snapshotProtocol,undefined);assert.equal(commands.at(-1).snapshotAcknowledgements,undefined);
 },{snapshotProtocol:1});
});
