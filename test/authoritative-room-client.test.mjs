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


test('expected gameplay conflicts keep the room connected and do not rejoin',async()=>{
 let joins=0,fires=0,inputs=0;const statuses=[];
 await withRoom(async(path,options)=>{
  if(path==='/api/game/room-session')return response({csrfToken:'proof'});
  const {action}=JSON.parse(options.body);
  if(action==='join')joins++;
  if(action==='input')inputs++;
  if(action==='fire'){fires++;return response({message:'Refill your igniter fuel.'},409);}
  const state=confirmed(joins+inputs);state.players[state.selfId].health=100;return response(state);
 },async client=>{
  await client.whenReady();await pause(450);
  assert.ok(fires>=1);assert.ok(inputs>=2);assert.equal(joins,1);assert.equal(client.ready,true);
  assert.ok(statuses.includes('Refill your igniter fuel.'));
 },{input:()=>({firing:true,tool:'flamethrower',direction:[0,0,-1]}),onStatus:message=>statuses.push(message)});
});

test('dead players continue heartbeats without automatic firing',async()=>{
 let fires=0,inputs=0;
 await withRoom(async(path,options)=>{
  if(path==='/api/game/room-session')return response({csrfToken:'proof'});
  const {action}=JSON.parse(options.body);if(action==='fire')fires++;if(action==='input')inputs++;
  const state=confirmed(inputs+1);state.players[state.selfId].health=0;return response(state);
 },async client=>{await client.whenReady();await pause(250);assert.ok(inputs>0);assert.equal(fires,0);assert.equal(client.ready,true);},
 {input:()=>({firing:true,tool:'flamethrower',direction:[0,0,-1]})});
});

test('held fire carries the current camera height so scoped range shots keep the same origin',async()=>{
 let sequence=0;const shots=[];
 await withRoom(async(path,options)=>{
  if(path==='/api/game/room-session')return response({csrfToken:'proof'});
  const command=JSON.parse(options.body);if(command.action==='fire')shots.push(command);
  const state=confirmed(++sequence);state.players[state.selfId].health=100;return response(state);
 },async client=>{await client.whenReady();await pause(160);assert.ok(shots.length>=1);assert.equal(shots[0].eyeHeight,1.25);},
 {input:()=>({firing:true,tool:'marksman',direction:[0,0,-1],eyeHeight:1.25})});
});

test('an expired room presence rejoins while ordinary conflicts do not',async()=>{
 let joins=0,inputs=0;
 await withRoom(async(path,options)=>{
  if(path==='/api/game/room-session')return response({csrfToken:'proof'});
  const {action}=JSON.parse(options.body);if(action==='join')joins++;
  if(action==='input'&&++inputs===1)return response({message:'Join this room before sending gameplay commands.',code:'ROOM_JOIN_REQUIRED'},409);
  return response(confirmed(joins+inputs));
 },async client=>{await client.whenReady();await pause(450);assert.equal(joins,2);assert.equal(client.ready,true);});
});

test('stick changes flush immediately and a slow weapon response does not stall controls',async()=>{
 let sequence=0,side=0,releaseFire;const received=[];
 await withRoom(async(path,options)=>{
  if(path==='/api/game/room-session')return response({csrfToken:'proof'});
  const command=JSON.parse(options.body);
  if(command.action==='input')received.push(command.input.side);
  if(command.action==='fire')return new Promise(resolve=>{releaseFire=()=>resolve(response(confirmed(++sequence)));});
  const state=confirmed(++sequence);state.players[state.selfId].health=100;return response(state);
 },async client=>{
  await client.whenReady();side=1;client.requestInput();await pause(10);
  assert.ok(received.includes(1),'stick press sends without waiting for the polling interval');
  assert.ok(releaseFire,'weapon request is pending');
  side=-1;client.requestInput();await pause(10);
  assert.equal(received.at(-1),-1,'direction changes still reach the server while firing');
  side=0;client.requestInput();await pause(10);
  assert.equal(received.at(-1),0,'release is sent immediately');
  client.stop();releaseFire();await pause(5);
 },{input:()=>({side,firing:true,tool:'flamethrower',direction:[0,0,-1]})});
});

test('intermediate drag bursts use the heartbeat while neutral edges flush immediately',async()=>{
 let side=0,sequence=0;const received=[];
 await withRoom(async(path,options)=>{
  if(path==='/api/game/room-session')return response({csrfToken:'proof'});
  const command=JSON.parse(options.body);if(command.action==='input')received.push(command.input.side);
  return response(confirmed(++sequence));
 },async client=>{
  await client.whenReady();
  for(let i=0;i<100;i++){side=i/100;client.requestInput(false);}
  await pause(10);assert.equal(received.length,0,'pointer events do not each create a request');
  await pause(70);assert.equal(received.at(-1),.99,'heartbeat uses the latest drag state');
  side=0;client.requestInput();await pause(5);assert.equal(received.at(-1),0,'release bypasses the heartbeat');
 },{input:()=>({side})});
});

test('a confirmed MZK token refreshes the wallet and plays pickup feedback only once',async()=>{
 const previousEvent=globalThis.CustomEvent;globalThis.CustomEvent=class extends Event{constructor(type,options){super(type);this.detail=options.detail;}};
 let refreshes=0,pickups=0;
 try{
  await withRoom(async path=>{window.dispatchEvent=event=>{if(event.type==='muzikaz:pickup-confirmed')pickups++;};window.MZKWallet={refreshShared:async()=>{refreshes++;}};return path==='/api/game/room-session'?response({csrfToken:'proof'}):response({...confirmed(1),result:{loot:{id:'coin-once',currency:'MZK',amount:1},message:'+1 MZK'}});},async client=>{
   await client.whenReady();await client.send('collect');await client.send('collect');assert.equal(pickups,1);assert.equal(refreshes,1);
  },{render:()=>{}});
 }finally{globalThis.CustomEvent=previousEvent;}
});

test('a confirmed portal arrival is sent once and automatic reconnect uses the saved room position',async()=>{
 const joins=[];let sequence=0,inputs=0;
 await withRoom(async(path,options)=>{
  if(path==='/api/game/room-session')return response({csrfToken:'proof'});
  const command=JSON.parse(options.body);if(command.action==='join')joins.push(command);
  if(command.action==='input'&&++inputs===1)return response({message:'Rejoin',code:'ROOM_JOIN_REQUIRED'},409);
  return response(confirmed(++sequence));
 },async client=>{await client.whenReady();await pause(250);assert.ok(joins.length>=2);assert.equal(joins[0].travelFrom,'public-commons');assert.equal(joins[0].travelToken,'server-ticket');assert.equal(joins[1].travelToken,undefined);},{arrival:{from:'public-commons',token:'server-ticket'}});
});

test('a transient network error resumes input without replaying a meeting join',async()=>{
 let sequence=0,failed=false;const commands=[];
 await withRoom(async(path,options)=>{
  if(path==='/api/game/room-session')return response({csrfToken:'proof'});
  const command=JSON.parse(options.body);commands.push(command);
  if(command.action==='input'&&!failed){failed=true;throw Error('temporary network interruption');}
  return response(confirmed(++sequence));
 },async client=>{
  await client.whenReady();await pause(1250);assert.equal(failed,true);assert.equal(client.ready,true);assert.equal(commands.filter(c=>c.action==='join').length,1);assert.ok(commands.filter(c=>c.action==='input').length>1);
 },{meetingId:'commons-entry'});
});
test('an expired room rejoin preserves position by omitting the consumed arrival and meeting',async()=>{
 let sequence=0,expired=false;const commands=[];
 await withRoom(async(path,options)=>{
  if(path==='/api/game/room-session')return response({csrfToken:'proof'});
  const command=JSON.parse(options.body);commands.push(command);
  if(command.action==='input'&&!expired){expired=true;return response({message:'Rejoin required',code:'ROOM_JOIN_REQUIRED'},409);}
  return response(confirmed(++sequence));
 },async client=>{
  await client.whenReady();await pause(220);const joins=commands.filter(c=>c.action==='join');assert.equal(joins.length,2);assert.equal(joins[0].meetingId,'commons-entry');assert.equal(joins[0].travelToken,'proof');assert.equal(joins[1].meetingId,undefined);assert.equal(joins[1].travelToken,undefined);assert.equal(client.ready,true);
 },{meetingId:'commons-entry',arrival:{from:'previous-room',token:'proof'}});
});

test('single-flight fire returns a fully processed state and confirms a late shot once without rewinding snapshots',async()=>{
 let sequence=0,release,shots=0;const renders=[],events=[];
 await withRoom(async(path,options)=>{if(path==='/api/game/room-session')return response({csrfToken:'proof'});const command=JSON.parse(options.body);if(command.action==='fire'){shots++;return new Promise(resolve=>{release=()=>{const state=confirmed(2);state.serverTime=1000;state.result={origin:{x:0,y:1,z:0},direction:[0,0,-1],firedAt:1000};resolve(response(state));};});}return response(confirmed(++sequence));},async client=>{window.dispatchEvent=event=>events.push(event);await client.whenReady();const first=client.send('fire',{tool:'laser'}),second=client.send('fire',{tool:'laser'});while(!release)await pause(1);sequence=10;await client.send('interact');release();const [a,b]=await Promise.all([first,second]);assert.equal(a,b);assert.equal(shots,1);assert.equal(events.filter(e=>e.type==='muzikaz:shot-confirmed').length,1);assert.equal(renders.at(-1),11);},{render:state=>renders.push(state.sequence)});
});
test('fire pacing is per tool and does not hold up input heartbeats',async()=>{
 let sequence=0;const commands=[];await withRoom(async(path,options)=>{if(path==='/api/game/room-session')return response({csrfToken:'proof'});commands.push(JSON.parse(options.body));return response(confirmed(++sequence));},async client=>{await client.whenReady();await client.send('fire',{tool:'medkit'});await client.send('fire',{tool:'pulse-rifle'});assert.equal(await client.send('fire',{tool:'pulse-rifle'}),null);await pause(120);assert.equal(commands.filter(c=>c.action==='fire').length,2);const inputs=commands.filter(c=>c.action==='input');assert.ok(inputs.length>=1);assert.ok(inputs.every((c,i)=>i===0||c.inputSequence>inputs[i-1].inputSequence));});
});
test('held-fire cooldown responses do not spam connection status or rejoin',async()=>{
 let sequence=0,shots=0,joins=0;const statuses=[];await withRoom(async(path,options)=>{if(path==='/api/game/room-session')return response({csrfToken:'proof'});const {action}=JSON.parse(options.body);if(action==='join')joins++;if(action==='fire'){shots++;return response({message:'Tool is cooling down.'},429);}const state=confirmed(++sequence);state.players[state.selfId].health=100;return response(state);},async client=>{await client.whenReady();await pause(460);assert.ok(shots>=1&&shots<=3);assert.equal(joins,1);assert.ok(!statuses.includes('Tool is cooling down.'));assert.equal(client.ready,true);},{input:()=>({firing:true,tool:'marksman',direction:[0,0,-1]}),onStatus:message=>statuses.push(message)});
});

test('resource readiness survives a room rejoin without returning to the loading state',async()=>{
 let sequence=0,started=false,expired=false;const joins=[];
 await withRoom(async(path,options)=>{
  if(path==='/api/game/room-session')return response({csrfToken:'proof'});
  const command=JSON.parse(options.body);if(command.action==='join')joins.push(command);
  if(command.action==='start-rad-tox')started=true;
  if(started&&command.action==='input'&&!expired){expired=true;return response({message:'Rejoin required',code:'ROOM_JOIN_REQUIRED'},409);}
  return response({...confirmed(++sequence),radTox:{state:'active',wave:1}});
 },async client=>{
  await client.whenReady();assert.equal(joins[0].deferRadTox,true);
  await client.send('start-rad-tox');await pause(300);
  assert.ok(joins.length>=2);assert.notEqual(joins[1].deferRadTox,true);assert.equal(client.ready,true);
 },{deferRadTox:true});
});

test('RAD-TOX trigger gives immediate feedback and queues a press while its first shot is in flight',async()=>{
 let sequence=0,shots=0,release;const feedback=[];
 await withRoom(async(path,options)=>{
  if(path==='/api/game/room-session')return response({csrfToken:'proof'});
  const command=JSON.parse(options.body);
  if(command.action==='fire'&&++shots===1)return new Promise(resolve=>{release=()=>resolve(response({...confirmed(++sequence),radTox:{state:'active'}}));});
  return response({...confirmed(++sequence),radTox:{state:'active'}});
 },async client=>{
  await client.whenReady();await client.send('start-rad-tox');
  const first=client.send('fire',{tool:'laser',direction:[0,0,-1]},'first');assert.equal(feedback.length,1,'feedback happens before the server response');
  await pause(120);const second=client.send('fire',{tool:'laser',direction:[1,0,0]},'second');
  release();await Promise.all([first,second]);assert.equal(shots,2);assert.equal(feedback.length,2);assert.equal(feedback[1].requestId,'second');
 },{onShot:shot=>feedback.push(shot)});
});

test('Builder joins set RAD-TOX preference in the join and retain it after a reconnect',async()=>{
 let sequence=0,expire=false;const joins=[];
 await withRoom(async(path,options)=>{
  if(path==='/api/game/room-session')return response({csrfToken:'proof'});
  const command=JSON.parse(options.body);
  if(command.action==='join')joins.push(command);
  if(command.action==='input'&&expire){expire=false;return response({code:'ROOM_JOIN_REQUIRED',message:'Rejoin'},409);}
  return response(confirmed(++sequence));
 },async client=>{
  await client.whenReady();assert.equal(joins[0].radToxEnabled,false);
  await client.send('rad-tox-toggle',{enabled:true});expire=true;
  for(let i=0;i<40&&joins.length<2;i++)await pause(25);
  assert.equal(joins.length,2);assert.equal(joins[1].radToxEnabled,true);
 },{deferRadTox:true,radToxEnabled:false});
});

test('aircraft cannon feedback starts immediately while confirmed damage waits for the room response',async()=>{
 let release,sequence=0;const flashes=[],states=[];
 await withRoom(async(path,options)=>{
  if(path==='/api/game/room-session')return response({csrfToken:'proof'});
  const body=options?.body?JSON.parse(options.body):{};
  if(body.action==='fire')return new Promise(resolve=>{release=()=>resolve(response({...confirmed(++sequence),actors:{target:{health:350}}}));});
  return response({...confirmed(++sequence),actors:{target:{health:400}}});
 },async client=>{
  await client.whenReady();const pending=client.send('fire',{tool:'laser',direction:[0,0,-1],origin:{x:0,y:20,z:0},aircraftShot:true});
  assert.equal(flashes.length,1);assert.equal(flashes[0].aircraftShot,true);assert.deepEqual(flashes[0].origin,{x:0,y:20,z:0});assert.equal(states.at(-1).actors.target.health,400);
  await pause(5);assert.ok(release);release();await pending;assert.equal(states.at(-1).actors.target.health,350);
 },{onShot:shot=>flashes.push(shot),render:state=>states.push(state)});
});

// Control only the client's heartbeat so overlapping requests can be released
// in a known order without waiting for polling or retry timers.
async function withControlledRoom(fetch,run,options={}){
 const previousInterval=globalThis.setInterval,previousClear=globalThis.clearInterval,token={};let heartbeat;
 globalThis.setInterval=callback=>{heartbeat=callback;return token;};
 globalThis.clearInterval=value=>{if(value!==token)previousClear(value);};
 try{await withRoom(fetch,async client=>{await client.whenReady();await flushInputTasks();await run(client,()=>heartbeat());},options);}
 finally{globalThis.setInterval=previousInterval;globalThis.clearInterval=previousClear;}
}
async function flushInputTasks(){for(let turn=0;turn<25;turn++)await Promise.resolve();}
function controlledInputs(){
 const commands=[],pending=[];let joins=0;
 const fetch=async(path,options)=>{
  if(path==='/api/game/room-session')return response({csrfToken:'proof'});
  const command=JSON.parse(options.body);commands.push(command);
  if(command.action==='join')return response({...confirmed(++joins===1?1:20),result:{inputEpoch:'epoch-'+joins}});
  if(command.action==='input')return new Promise((resolve,reject)=>pending.push({command,resolve,reject}));
  throw Error('Unexpected action '+command.action);
 };
 return {commands,pending,fetch};
}

test('press and release bypass an unresolved heartbeat with ordered input sequences and the joined epoch',async()=>{
 const room=controlledInputs(),rendered=[];let side=0;
 await withControlledRoom(room.fetch,async(client,heartbeat)=>{
  void heartbeat();await flushInputTasks();assert.equal(room.pending.length,1);assert.equal(room.pending[0].command.input.side,0);
  side=1;client.requestInput(true);await flushInputTasks();
  side=0;client.requestInput(true);await flushInputTasks();
  assert.equal(room.pending.length,3,'both input edges must reach fetch before the old heartbeat responds');
  assert.deepEqual(room.pending.map(request=>request.command.input.side),[0,1,0]);
  assert.deepEqual(room.pending.map(request=>request.command.inputSequence),[1,2,3]);
  assert.ok(room.pending.every(request=>request.command.inputEpoch==='epoch-1'));
  room.pending[2].resolve(response(confirmed(4)));await flushInputTasks();
  room.pending[0].resolve(response(confirmed(2)));room.pending[1].resolve(response(confirmed(3)));await flushInputTasks();
  assert.deepEqual(rendered,[1,4],'old heartbeat or press responses must not rewind the latest release');assert.equal(client.ready,true);
 },{input:()=>({side}),render:state=>rendered.push(state.sequence)});
});

test('a hundred urgent input edges keep at most three requests and flush only the latest queued state',async()=>{
 const room=controlledInputs();let side=0;
 await withControlledRoom(room.fetch,async(client,heartbeat)=>{
  void heartbeat();await flushInputTasks();side=1;client.requestInput(true);side=-1;client.requestInput(true);await flushInputTasks();assert.equal(room.pending.length,3);
  for(let edge=0;edge<100;edge++){side=edge===99?0:edge%2?.75:-.75;client.requestInput(true);}
  await flushInputTasks();assert.equal(room.pending.length,3,'a drag burst must not grow the in-flight request count');
  room.pending[0].resolve(response(confirmed(2)));await flushInputTasks();assert.equal(room.pending.length,4,'one released slot flushes one coalesced state');
  assert.equal(room.pending[3].command.input.side,0,'the queued release replaces every older intermediate edge');assert.equal(room.pending[3].command.inputSequence,4);assert.equal(room.pending[3].command.inputEpoch,'epoch-1');
  room.pending[3].resolve(response(confirmed(5)));room.pending[1].resolve(response(confirmed(3)));room.pending[2].resolve(response(confirmed(4)));await flushInputTasks();
  assert.equal(room.pending.length,4,'there is only one queued state, not a backlog of edge requests');assert.equal(client.ready,true);
 },{input:()=>({side})});
});

test('stopping with three pending inputs discards queued edges and ignores late responses',async()=>{
 const room=controlledInputs(),rendered=[];let side=0;
 await withControlledRoom(room.fetch,async(client,heartbeat)=>{
  void heartbeat();await flushInputTasks();side=1;client.requestInput(true);side=-1;client.requestInput(true);await flushInputTasks();
  side=0;client.requestInput(true);await flushInputTasks();assert.equal(room.pending.length,3);
  client.stop();for(let index=0;index<room.pending.length;index++)room.pending[index].resolve(response(confirmed(10+index)));await flushInputTasks();
  assert.equal(room.pending.length,3);assert.deepEqual(rendered,[1]);assert.equal(client.ready,false);
 },{input:()=>({side}),render:state=>rendered.push(state.sequence)});
});

test('a late successful heartbeat cannot revive a room after a newer input fails its connection',async()=>{
 const room=controlledInputs(),rendered=[],statuses=[];let side=0;
 await withControlledRoom(room.fetch,async(client,heartbeat)=>{
  void heartbeat();await flushInputTasks();side=1;client.requestInput(true);await flushInputTasks();assert.equal(room.pending.length,2);
  room.pending[1].reject(Error('connection interrupted'));await flushInputTasks();assert.equal(client.ready,false);assert.ok(statuses.some(message=>message.includes('Server connection required')));
  room.pending[0].resolve(response(confirmed(99)));await flushInputTasks();assert.equal(client.ready,false,'an older in-flight success must not clear a newer network failure');assert.deepEqual(rendered,[1]);
 },{input:()=>({side}),render:state=>rendered.push(state.sequence),onStatus:message=>statuses.push(message)});
});

test('rejoining assigns a fresh input epoch while old in-flight epoch responses remain obsolete',async()=>{
 const room=controlledInputs(),rendered=[];let side=0;
 await withControlledRoom(room.fetch,async(client,heartbeat)=>{
  void heartbeat();await flushInputTasks();side=1;client.requestInput(true);await flushInputTasks();
  room.pending[1].resolve(response({code:'ROOM_JOIN_REQUIRED',message:'Rejoin required'},409));await flushInputTasks();assert.equal(client.ready,false);
  void heartbeat();await flushInputTasks();assert.equal(room.commands.filter(command=>command.action==='join').length,2);assert.equal(client.ready,true);
  side=0;client.requestInput(true);await flushInputTasks();const renewed=room.pending.at(-1);assert.equal(renewed.command.inputEpoch,'epoch-2');assert.equal(renewed.command.inputSequence,1);
  room.pending[0].resolve(response(confirmed(99)));await flushInputTasks();assert.ok(!rendered.includes(99),'a prior epoch cannot render over the renewed room');
  renewed.resolve(response(confirmed(21)));await flushInputTasks();assert.equal(rendered.at(-1),21);assert.equal(client.ready,true);
 },{input:()=>({side}),render:state=>rendered.push(state.sequence)});
});

test('retry probes a recovered connection after backoff without waiting for an obsolete hung heartbeat',async()=>{
 const room=controlledInputs(),rendered=[],previousNow=Date.now;let side=0,clock=10000;
 Date.now=()=>clock;
 try{
  await withControlledRoom(room.fetch,async(client,heartbeat)=>{
   void heartbeat();await flushInputTasks();side=1;client.requestInput(true);await flushInputTasks();assert.equal(room.pending.length,2);
   room.pending[1].reject(Error('temporary outage'));await flushInputTasks();assert.equal(client.ready,false);
   clock+=1001;void heartbeat();await flushInputTasks();assert.equal(room.pending.length,3,'the retry must reach fetch while the old-generation heartbeat is still unresolved');
   const probe=room.pending[2];assert.equal(probe.command.input.side,1);assert.equal(probe.command.inputEpoch,'epoch-1');assert.ok(probe.command.inputSequence>room.pending[1].command.inputSequence);
   probe.resolve(response(confirmed(5)));await flushInputTasks();assert.equal(client.ready,true);assert.deepEqual(rendered,[1,5]);assert.equal(room.commands.filter(command=>command.action==='join').length,1);
   room.pending[0].resolve(response(confirmed(99)));await flushInputTasks();assert.deepEqual(rendered,[1,5],'the obsolete success must not supersede the recovery probe');assert.equal(client.ready,true);
  },{input:()=>({side}),render:state=>rendered.push(state.sequence)});
 }finally{Date.now=previousNow;}
});

test('aircraft cannons keep a bounded firing window without waiting for late replies or blocking movement',async()=>{
 let sequence=0;const shots=[],releases=[],events=[],previews=[];
 await withRoom(async(path,options)=>{
  if(path==='/api/game/room-session')return response({csrfToken:'proof'});
  const command=JSON.parse(options.body);
  if(command.action==='fire'){
   shots.push(command);const state=confirmed(++sequence);state.serverTime=1000+sequence;
   state.result={origin:{x:0,y:10,z:0},direction:command.direction,firedAt:state.serverTime};
   return new Promise(resolve=>releases.push(()=>resolve(response(state))));
  }
  return response(confirmed(++sequence));
 },async client=>{
  window.dispatchEvent=event=>events.push(event);await client.whenReady();
  const fields={tool:'laser',aircraftShot:true,direction:[0,0,-1],origin:{x:0,y:10,z:0}},pending=[];
  try{
   pending.push(client.send('fire',fields,'cannon-1'));await pause(5);
   assert.equal(await client.send('fire',fields,'too-soon'),null,'local cooldown still applies');
   await pause(205);pending.push(client.send('fire',fields,'cannon-2'));
   await pause(205);pending.push(client.send('fire',fields,'cannon-3'));await pause(5);
   assert.equal(shots.length,3,'three cannon shots can be in flight before the first reply');
   await pause(205);assert.equal(await client.send('fire',fields,'over-capacity'),null,'a stalled connection cannot build an unlimited shot queue');
   assert.equal(shots.length,3);
   const state=await client.send('input',{input:{side:1}});assert.ok(state.players[state.selfId],'cannon latency does not occupy movement slots');
   releases[2]();releases[0]();releases[1]();await Promise.all(pending);
   assert.equal(events.filter(event=>event.type==='muzikaz:shot-confirmed').length,3,'each late shot still confirms once');
   assert.deepEqual(previews.map(shot=>shot.requestId),['cannon-1','cannon-2','cannon-3']);
   await pause(20);assert.equal(shots.length,3,'releasing a slot never replays dropped trigger ticks');
  }finally{client.stop();for(const release of releases)release();await Promise.allSettled(pending);}
 },{onShot:shot=>previews.push(shot)});
});

test('an older transient heartbeat failure cannot disconnect newer acknowledged input',async()=>{
 for(const failure of [Error('old heartbeat timed out'),Object.assign(Error('old upstream failure'),{status:503})]){
  const room=controlledInputs(),rendered=[],statuses=[];let side=0;
  await withControlledRoom(room.fetch,async(client,heartbeat)=>{
   void heartbeat();await flushInputTasks();side=1;client.requestInput();await flushInputTasks();
   assert.equal(room.pending.length,2);
   room.pending[1].resolve(response(confirmed(3)));await flushInputTasks();assert.equal(client.ready,true);
   room.pending[0].reject(failure);await flushInputTasks();
   assert.equal(client.ready,true,'a superseded failure must not interrupt a healthy live room');
   assert.deepEqual(rendered,[1,3]);
   assert.ok(!statuses.some(message=>message.includes('Server connection required')));
   void heartbeat();await flushInputTasks();assert.equal(room.pending.length,3,'heartbeats continue without a retry delay');
   assert.equal(room.pending[2].command.inputSequence,3);
   room.pending[2].resolve(response(confirmed(4)));await flushInputTasks();
  },{input:()=>({side}),render:state=>rendered.push(state.sequence),onStatus:message=>statuses.push(message)});
 }
});

test('older authentication and room-switch failures still close the current live connection',async()=>{
 for(const failure of [{status:401,code:'SESSION_REQUIRED'},{status:409,code:'ROOM_SWITCHED'}]){
  const room=controlledInputs(),errors=[];
  await withControlledRoom(room.fetch,async(client,heartbeat)=>{
   void heartbeat();await flushInputTasks();client.requestInput();await flushInputTasks();
   room.pending[1].resolve(response(confirmed(3)));await flushInputTasks();assert.equal(client.ready,true);
   room.pending[0].resolve(response({message:'Session no longer authorized',code:failure.code},failure.status));await flushInputTasks();
   assert.equal(client.ready,false);assert.equal(errors.length,1);
   const sent=room.commands.length;void heartbeat();client.requestInput();await flushInputTasks();assert.equal(room.commands.length,sent);
  },{onError:error=>errors.push(error)});
 }
});

test('overlapping actions share one CSRF refresh and late old rejections reuse the new proof',async()=>{
 let sessions=0,sequence=0,lateHeartbeat;const refreshes=[],attempts=[],actions=[];
 const oldProof=()=>response({message:'Old CSRF proof',code:'CSRF_INVALID'},401);
 await withControlledRoom(async(path,options)=>{
  if(path==='/api/game/room-session'){
   const number=++sessions;if(number===1)return response({csrfToken:'proof-1'});
   return new Promise(resolve=>refreshes.push(()=>resolve(response({csrfToken:'proof-'+number}))));
  }
  const command=JSON.parse(options.body),proof=options.headers['X-CSRF-Token'];
  if(command.action==='join')return response({...confirmed(++sequence),result:{inputEpoch:'shared-proof-epoch'}});
  attempts.push({command,proof});
  if(proof==='proof-1'){
   if(command.action==='input'&&command.inputSequence===1)return new Promise(resolve=>{lateHeartbeat=()=>resolve(oldProof());});
   return oldProof();
  }
  if(Number(proof.slice(6))<sessions-2)return oldProof();
  return response(confirmed(++sequence));
 },async(client,heartbeat)=>{
  try{
   void heartbeat();client.requestInput();client.requestInput();
   for(let action=0;action<3;action++)actions.push(client.send('interact').catch(error=>error));
   await flushInputTasks();assert.ok(lateHeartbeat);
   assert.equal(refreshes.length,1,'concurrent stale proofs must create one shared refresh');
   refreshes[0]();await flushInputTasks();
   const results=await Promise.all(actions);assert.ok(results.every(state=>state.players?.[state.selfId]));
   assert.equal(sessions,2);assert.equal(client.ready,true);
   lateHeartbeat();await flushInputTasks();
   assert.equal(sessions,2,'an old rejection arriving after the refresh must reuse its replacement');
   assert.equal(client.ready,true);
   const byRequest=new Map();
   for(const attempt of attempts){const id=attempt.command.requestId;if(!byRequest.has(id))byRequest.set(id,[]);byRequest.get(id).push(attempt);}
   assert.equal(byRequest.size,6);
   for(const retries of byRequest.values()){
    assert.equal(retries.length,2);assert.deepEqual(retries[0].command,retries[1].command,'retry preserves request ID, controls, input sequence and epoch');
    assert.deepEqual(retries.map(attempt=>attempt.proof),['proof-1','proof-2']);
   }
  }finally{
   client.stop();lateHeartbeat?.();
   for(let turn=0;turn<4;turn++){for(const release of refreshes)release();await flushInputTasks();}
   await Promise.allSettled(actions);
  }
 });
});

test('an established room keeps recovering beyond fifteen seconds without replaying its join',async()=>{
 let recovered=false,sequence=0,joins=0,inputs=0;const errors=[];
 await withControlledRoom(async(path,options)=>{
  if(path==='/api/game/room-session')return response({csrfToken:'proof'});
  const command=JSON.parse(options.body);
  if(command.action==='join'){joins++;return response({...confirmed(++sequence),result:{inputEpoch:'live-session-epoch'}});}
  inputs++;if(!recovered)throw Error('temporary outage');return response(confirmed(++sequence));
 },async(client,heartbeat)=>{
  const priorNow=Date.now,priorTimeout=globalThis.setTimeout,priorClearTimeout=globalThis.clearTimeout,timers=new Map();let clock=10000,nextTimer=0;
  Date.now=()=>clock;
  globalThis.setTimeout=(callback,delay)=>{const id=++nextTimer;timers.set(id,{callback,at:clock+delay});return id;};
  globalThis.clearTimeout=id=>{timers.delete(id);};
  try{
   void heartbeat();await flushInputTasks();assert.equal(client.ready,false,'a current outage still disables unconfirmed actions');
   clock+=16001;
   for(const [id,timer]of [...timers])if(timer.at<=clock){timers.delete(id);timer.callback();}
   await flushInputTasks();recovered=true;void heartbeat();await flushInputTasks();
   assert.equal(client.ready,true,'an established game can recover after the startup deadline would have elapsed');
   assert.equal(joins,1,'recovery keeps the current room position and input epoch');assert.equal(inputs,2);assert.deepEqual(errors,[]);
  }finally{
   Date.now=priorNow;globalThis.setTimeout=priorTimeout;globalThis.clearTimeout=priorClearTimeout;
  }
 },{onError:error=>errors.push(error)});
});

test('cold joins get a longer bounded deadline and stopping aborts in-flight gameplay',async()=>{
 let joinOptions;
 await withRoom(async(path,options)=>{
  if(path==='/api/game/room-session')return response({csrfToken:'proof'});
  joinOptions=options;return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Stopped','AbortError')),{once:true}));
 },async client=>{await pause(10);assert.equal(joinOptions.timeout,25000);assert.equal(joinOptions.signal.aborted,false);client.stop();assert.equal(joinOptions.signal.aborted,true);});
});
test('frequent snapshots coalesce to the newest state and no queued render runs after stop',async()=>{
 let sequence=0;const rendered=[];
 await withRoom(async(path)=>path==='/api/game/room-session'?response({csrfToken:'proof'}):response(confirmed(++sequence)),async client=>{
  await client.whenReady();assert.equal(rendered.length,1);await client.send('input',{input:{}});await client.send('input',{input:{}});await client.send('input',{input:{}});assert.equal(rendered.length,1);await pause(120);assert.ok(rendered.length<=3);assert.equal(rendered.at(-1),sequence);const before=rendered.length;await client.send('input',{input:{}});client.stop();await pause(130);assert.equal(rendered.length,before);
 },{render:state=>rendered.push(state.sequence),renderInterval:100,inputInterval:1000});
});

test('laser presses fire consecutively without a client cooldown',async()=>{
 let sequence=0,shots=0;await withRoom(async(path,options)=>{if(path==='/api/game/room-session')return response({csrfToken:'proof'});if(JSON.parse(options.body).action==='fire')shots++;return response(confirmed(++sequence));},async client=>{await client.whenReady();for(let i=0;i<5;i++)await client.send('fire',{tool:'laser',direction:[0,0,-1]});assert.equal(shots,5);});
});
test('travel adopts the new input epoch and discards a late movement response',async()=>{
 let sequence=0,release;const commands=[],renders=[];
 await withRoom(async(path,options)=>{if(path==='/api/game/room-session')return response({csrfToken:'proof'});const body=JSON.parse(options.body);commands.push(body);const state=confirmed(++sequence);if(body.action==='join')state.result={inputEpoch:'before'};if(body.action==='map-access')state.result={inputEpoch:'after'};if(body.action==='input'&&body.inputEpoch==='before')return new Promise(resolve=>{release=()=>resolve(response({...state,sequence:99}));});return response(state);},async client=>{await client.whenReady();const old=client.send('input',{input:{forward:1}});await pause(1);await client.send('map-access',{position:{x:10,z:10}});release();await old;await client.send('input',{input:{forward:1}});const inputs=commands.filter(c=>c.action==='input');assert.equal(inputs.at(-1).inputEpoch,'after');assert.equal(inputs.at(-1).inputSequence,1);assert.ok(!renders.includes(99));},{inputInterval:1000,render:state=>renders.push(state.sequence)});
});
