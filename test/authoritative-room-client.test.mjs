import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as pause} from 'node:timers/promises';
import {connectAuthoritativeRoom,projectSharedBuildings} from '../public/js/authoritative-room-client.js';
import * as THREE from '../public/vendor/three/three.module.min.js';

test('shared buildings only project changed revisions and retain pending edits',()=>{
 const system={bricks:[],brickGroup:new THREE.Group(),buildEditor:{pending:null},toggleSharedDoor(root){root.userData.open=!root.userData.open;}};
 let paints=0;
 const create=()=>{const root=new THREE.Group();root.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial()));const color=root.children[0].material.color;const set=color.setHex.bind(color);color.setHex=value=>{paints++;return set(value);};return root;};
 const record={id:'wall',materialId:'brick',revision:1,position:[1,2,3],rotation:[0,0,0],scale:[1,1,1],paint:[0xff0000],open:false};
 const project=records=>projectSharedBuildings({THREE,system,records,create});
 project({wall:record});const root=system.bricks[0];assert.equal(paints,1);
 project({wall:structuredClone(record)});assert.equal(paints,1,'unchanged snapshots skip mesh traversal');
 project({wall:{...record,revision:2,position:[4,2,3],open:true}});assert.equal(root.position.x,4);assert.equal(root.userData.open,true);assert.equal(paints,2);
 system.buildEditor.pending={root};root.position.x=9;project({wall:{...record,revision:3}});assert.equal(root.position.x,9);project({});assert.equal(system.bricks.length,1);
 system.buildEditor.pending=null;project({});assert.equal(system.bricks.length,0);assert.equal(root.parent,null);
 root.traverse(mesh=>{mesh.geometry?.dispose();mesh.material?.dispose();});
});
test('room client projects confirmed snapshots and stops actions after connection loss',async()=>{
 const previousWindow=globalThis.window,previousDocument=globalThis.document;let unavailable=false,sequence=0;const requests=[],rendered=[],statuses=[];
 globalThis.document={hidden:false};
 globalThis.window={fetch:async(path,options)=>{
  requests.push({path,body:options.body&&JSON.parse(options.body)});
  if(unavailable)throw Error('offline');
  if(path==='/api/game/room-session')return {ok:true,json:async()=>({data:{csrfToken:'proof',account:{accountId:'test'}}})};
  return {ok:true,json:async()=>({data:{authoritative:true,selfId:'account:test',sequence:++sequence,players:{'account:test':{position:{x:0,y:0,z:0}}},objects:{},actors:{}}})};
 }};
 const client=connectAuthoritativeRoom({roomId:'shared',input:()=>({forward:1}),render:state=>rendered.push(state),onStatus:message=>statuses.push(message)});
 try{await pause(40);assert.equal(client.ready,true);await client.send('interact');assert.ok(rendered.every(state=>state.authoritative));assert.ok(requests.some(request=>request.body?.action==='interact'));const count=rendered.length;unavailable=true;await assert.rejects(client.object({id:'unconfirmed',revision:0,object:{}}),/offline/);assert.equal(rendered.length,count);await pause(180);assert.equal(client.ready,false);assert.ok(statuses.some(message=>message.includes('Server connection required')));await assert.rejects(client.object({id:'offline-item'}),/Waiting for the server/);client.stop();await assert.rejects(client.send('interact'),/Room closed/);}finally{client.stop();globalThis.window=previousWindow;globalThis.document=previousDocument;}
});

function confirmed(sequence=1) {
 return {authoritative:true,selfId:'account:test',sequence,players:{'account:test':{position:{x:0,y:0,z:2}}},objects:{},actors:{}};
}
function response(data,status=200) { return {ok:status<400,status,json:async()=>status<400?{data}:data}; }
async function withRoom(fetch,run,options={}) {
 const oldWindow=globalThis.window,oldDocument=globalThis.document;
 globalThis.window={fetch};globalThis.document={hidden:false};
 const client=connectAuthoritativeRoom({roomId:'test',input:()=>({}),render:()=>{},...options});
 try { await run(client); } finally { client.stop();globalThis.window=oldWindow;globalThis.document=oldDocument; }
}
test('readiness waits for a confirmed player rather than a loaded map',async()=>{
 let release;
 await withRoom(async path=>path==='/api/game/room-session'?response({csrfToken:'proof'}):new Promise(resolve=>{release=resolve;}),async client=>{
  let ready=false;const pending=client.whenReady().then(()=>{ready=true;});
  await pause(10);assert.equal(ready,false);assert.equal(client.ready,false);
  release(response(confirmed()));await pending;assert.equal(client.ready,true);
 });
});
test('expired account sessions reject the join and stop the retry loop',async()=>{
 let count=0;const failures=[];
 await withRoom(async()=>{count++;return response({message:'Session expired',code:'SESSION_EXPIRED'},401);},async client=>{
  await assert.rejects(client.whenReady(),error=>error.status===401&&error.code==='SESSION_EXPIRED');
  await pause(200);assert.equal(count,1);assert.equal(client.ready,false);assert.equal(failures.length,1);
 },{onError:error=>failures.push(error)});
});
test('a stale CSRF proof is refreshed once without changing the action request ID',async()=>{
 let sessions=0;const commands=[];
 await withRoom(async(path,options)=>{
  if(path==='/api/game/room-session')return response({csrfToken:'proof'+ ++sessions});
  commands.push({body:JSON.parse(options.body),proof:options.headers['X-CSRF-Token']});
  if(commands.length===1)return response({message:'Old CSRF proof',code:'CSRF_INVALID'},401);
  return response(confirmed());
 },async client=>{
  await client.whenReady();assert.equal(sessions,2);assert.equal(commands.length,2);
  assert.equal(commands[0].body.requestId,commands[1].body.requestId);
  assert.equal(commands[1].proof,'proof2');
 });
});
test('repeated CSRF rejection exits startup instead of looping forever',async()=>{
 let requests=0;
 await withRoom(async path=>{
  if(path==='/api/game/room-session')return response({csrfToken:'proof'});
  requests++;return response({message:'Invalid CSRF proof',code:'CSRF_INVALID'},401);
 },async client=>{
  await assert.rejects(client.whenReady(),error=>error.code==='CSRF_INVALID');
  await pause(180);assert.equal(requests,2);assert.equal(client.ready,false);
 });
});
test('a timed out join cannot become ready when its late response arrives',async()=>{
 let release;
 await withRoom(async path=>path==='/api/game/room-session'?response({csrfToken:'proof'}):new Promise(resolve=>{release=resolve;}),async client=>{
  await assert.rejects(client.whenReady(25),/did not accept/);
  release(response(confirmed()));await pause(10);assert.equal(client.ready,false);
 });
});
test('stopping during session lookup prevents a late gameplay join',async()=>{
 let release,joins=0;
 await withRoom(async path=>path==='/api/game/room-session'?new Promise(resolve=>{release=resolve;}):(joins++,response(confirmed())),async client=>{
  client.stop();release(response({csrfToken:'proof'}));await pause(10);assert.equal(joins,0);assert.equal(client.ready,false);
 });
});

