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

test('press, reversal and release pass a slow neutral heartbeat without rewinding accepted snapshots',async()=>{
 let side=0,sequence=0,releaseHeartbeat,heartbeatStarted;
 const heartbeatReady=new Promise(resolve=>{heartbeatStarted=resolve;}),received=[],renders=[];
 await withRoom(async(path,options)=>{
  if(path==='/api/game/room-session')return response({csrfToken:'proof'});
  const command=JSON.parse(options.body),state=confirmed(++sequence);
  state.players[state.selfId].position.x=sequence*.1;
  if(command.action==='join')state.result={inputEpoch:'current-connection'};
  if(command.action==='input'){
   received.push(command);
   if(received.length===1)return new Promise(resolve=>{releaseHeartbeat=()=>resolve(response(state));heartbeatStarted();});
  }
  return response(state);
 },async client=>{
  await client.whenReady();await heartbeatReady;
  assert.equal(received[0].input.side,0);
  side=1;client.requestInput();await pause(5);
  assert.equal(received.at(-1).input.side,1,'a directional press reaches the server before the slow heartbeat returns');
  side=-1;client.requestInput();await pause(5);
  assert.equal(received.at(-1).input.side,-1,'reversal also passes the pending neutral response');
  side=0;client.requestInput();await pause(5);
  assert.equal(received.at(-1).input.side,0,'release does not wait for the original heartbeat');
  assert.equal(received.length,4);
  assert.ok(received.every((command,index)=>command.inputEpoch==='current-connection'&&(index===0||command.inputSequence>received[index-1].inputSequence)),'the server can reject any late older input');
  const latest=renders.at(-1),count=renders.length;
  releaseHeartbeat();await pause(5);
  assert.equal(renders.length,count,'an old response cannot replay a previously accepted pose');
  assert.equal(renders.at(-1),latest);
 },{input:()=>({side}),render:state=>renders.push(state.sequence)});
});

test('urgent input is bounded to one extra flight and coalesces edge bursts into fresh controls',async()=>{
 let side=0,yaw=0,sequence=0,active=0,maxActive=0,releaseHeartbeat,releaseUrgent,heartbeatStarted;
 const heartbeatReady=new Promise(resolve=>{heartbeatStarted=resolve;}),received=[];
 await withRoom(async(path,options)=>{
  if(path==='/api/game/room-session')return response({csrfToken:'proof'});
  const command=JSON.parse(options.body),state=confirmed(++sequence);
  if(command.action!=='input')return response(state);
  received.push(command);active++;maxActive=Math.max(maxActive,active);
  if(received.length===1)return new Promise(resolve=>{releaseHeartbeat=()=>{active--;resolve(response(state));};heartbeatStarted();});
  if(received.length===2)return new Promise(resolve=>{releaseUrgent=()=>{active--;resolve(response(state));};});
  active--;return response(state);
 },async client=>{
  await client.whenReady();await heartbeatReady;
  side=1;client.requestInput();await pause(5);
  assert.ok(releaseUrgent,'one urgent request passes the slow heartbeat');
  for(let index=0;index<100;index++){side=index%2?-1:1;client.requestInput();}
  await pause(5);
  assert.equal(received.length,2,'edge bursts cannot create more requests while both lanes are occupied');
  side=.375;yaw=1.25;releaseUrgent();await pause(5);
  assert.equal(received.length,3,'only one latest edge follows the urgent flight');
  assert.deepEqual(received.at(-1).input,{side:.375,yaw:1.25},'dispatch samples the current controls rather than retaining a stale drag');
  assert.equal(maxActive,2,'a normal heartbeat and one urgent edge are the full input concurrency limit');
  client.stop();releaseHeartbeat();await pause(5);
 },{input:()=>({side,yaw})});
});

test('the urgent lane receives the next accepted movement on the heartbeat cadence before an old poll returns',async()=>{
 let side=0,sequence=0,releaseHeartbeat,heartbeatStarted;
 const heartbeatReady=new Promise(resolve=>{heartbeatStarted=resolve;}),received=[],renders=[];
 await withRoom(async(path,options)=>{
  if(path==='/api/game/room-session')return response({csrfToken:'proof'});
  const command=JSON.parse(options.body),state=confirmed(++sequence);
  if(command.action==='input'){
   received.push({...command,at:performance.now()});
   if(received.length===1)return new Promise(resolve=>{releaseHeartbeat=()=>resolve(response(state));heartbeatStarted();});
   // The server advances its simulation before applying this command, so the
   // initial directional response still shows the old accepted position.
   if(received.length>2)state.players[state.selfId].position.x=.2;
  }
  return response(state);
 },async client=>{
  await client.whenReady();await heartbeatReady;
  side=1;const pressedAt=performance.now();client.requestInput();await pause(10);
  assert.equal(received.length,2,'the edge has passed the outstanding neutral poll');
  assert.equal(renders.at(-1).players['account:test'].position.x,0,'the initial input confirms the previous server pose');
  await pause(65);
  assert.ok(received.length>=3,'the free urgent lane polls again without waiting for the old neutral response');
  assert.equal(renders.at(-1).players['account:test'].position.x,.2,'accepted movement reaches the view while the old heartbeat is still pending');
  assert.ok(received[2].at-pressedAt<120,'confirmation remains on the regular input cadence');
  assert.ok(received[2].at-received[1].at>=25,'the confirmation is cadenced rather than an immediate request loop');
  client.stop();releaseHeartbeat();await pause(5);
 },{input:()=>({side}),render:state=>renders.push(state)});
});

test('release and reversal use a free normal lane while an older urgent input is slow',async()=>{
 let side=0,sequence=0,releaseHeartbeat,releaseUrgent,heartbeatStarted;
 const heartbeatReady=new Promise(resolve=>{heartbeatStarted=resolve;}),received=[];
 await withRoom(async(path,options)=>{
  if(path==='/api/game/room-session')return response({csrfToken:'proof'});
  const command=JSON.parse(options.body),state=confirmed(++sequence);
  if(command.action==='input'){
   received.push(command);
   if(received.length===1)return new Promise(resolve=>{releaseHeartbeat=()=>resolve(response(state));heartbeatStarted();});
   if(received.length===2)return new Promise(resolve=>{releaseUrgent=()=>resolve(response(state));});
  }
  return response(state);
 },async client=>{
  await client.whenReady();await heartbeatReady;
  side=1;client.requestInput();await pause(5);
  assert.ok(releaseUrgent);
  releaseHeartbeat();await pause(5);
  side=-1;client.requestInput();await pause(5);
  assert.equal(received.at(-1).input.side,-1,'reversal uses the now-free normal lane rather than waiting for the older urgent request');
  side=0;client.requestInput();await pause(5);
  assert.equal(received.at(-1).input.side,0,'release also reaches the server while the older urgent request remains pending');
  assert.equal(received.length,4);
  client.stop();releaseUrgent();await pause(5);
 },{input:()=>({side})});
});

test('a pending urgent edge reads hidden-page neutral controls and is discarded when stopped',async()=>{
 let side=0,sequence=0,releaseHeartbeat,releaseUrgent,heartbeatStarted;
 const heartbeatReady=new Promise(resolve=>{heartbeatStarted=resolve;}),received=[];
 await withRoom(async(path,options)=>{
  if(path==='/api/game/room-session')return response({csrfToken:'proof'});
  const command=JSON.parse(options.body),state=confirmed(++sequence);
  if(command.action!=='input')return response(state);
  received.push(command);
  if(received.length===1)return new Promise(resolve=>{releaseHeartbeat=()=>resolve(response(state));heartbeatStarted();});
  return new Promise(resolve=>{releaseUrgent=()=>resolve(response(state));});
 },async client=>{
  await client.whenReady();await heartbeatReady;
  side=1;client.requestInput();await pause(5);
  side=-1;client.requestInput();globalThis.document.hidden=true;
  releaseUrgent();await pause(5);
  assert.deepEqual(received.at(-1).input,{},'a queued edge cannot restore movement after the page becomes hidden');
  assert.equal(received.length,3);
  client.requestInput();client.stop();releaseUrgent();releaseHeartbeat();await pause(5);
  assert.equal(received.length,3,'closing the room discards the coalesced edge instead of issuing another request');
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
 let sequence=0;const commands=[];await withRoom(async(path,options)=>{if(path==='/api/game/room-session')return response({csrfToken:'proof'});commands.push(JSON.parse(options.body));return response(confirmed(++sequence));},async client=>{await client.whenReady();await client.send('fire',{tool:'medkit'});await client.send('fire',{tool:'laser'});assert.equal(await client.send('fire',{tool:'laser'}),null);await pause(120);assert.equal(commands.filter(c=>c.action==='fire').length,2);const inputs=commands.filter(c=>c.action==='input');assert.ok(inputs.length>=1);assert.ok(inputs.every((c,i)=>i===0||c.inputSequence>inputs[i-1].inputSequence));});
});
test('held-fire cooldown responses do not spam connection status or rejoin',async()=>{
 let sequence=0,shots=0,joins=0;const statuses=[];await withRoom(async(path,options)=>{if(path==='/api/game/room-session')return response({csrfToken:'proof'});const {action}=JSON.parse(options.body);if(action==='join')joins++;if(action==='fire'){shots++;return response({message:'Tool is cooling down.'},429);}const state=confirmed(++sequence);state.players[state.selfId].health=100;return response(state);},async client=>{await client.whenReady();await pause(460);assert.ok(shots>=1&&shots<=3);assert.equal(joins,1);assert.ok(!statuses.includes('Tool is cooling down.'));assert.equal(client.ready,true);},{input:()=>({firing:true,tool:'laser',direction:[0,0,-1]}),onStatus:message=>statuses.push(message)});
});

test('a discrete fire tap keeps only the latest pending aim without stalling movement or bypassing weapon cadence',async()=>{
 let sequence=0,side=0,aim=[0,0,-1],release;const shots=[],inputs=[];
 await withRoom(async(path,options)=>{
  if(path==='/api/game/room-session')return response({csrfToken:'proof'});
  const command=JSON.parse(options.body);
  if(command.action==='input')inputs.push(command.input.side);
  if(command.action==='fire'){
   shots.push({...command,at:performance.now()});
   if(shots.length===1)return new Promise(resolve=>{release=()=>resolve(response(confirmed(++sequence)));});
  }
  return response(confirmed(++sequence));
 },async client=>{
  await client.whenReady();
  const first=client.triggerFire({tool:'laser',direction:aim});
  while(!release)await pause(1);
  const superseded=client.triggerFire({tool:'laser',direction:[-1,0,0]});
  const latest=client.triggerFire(()=>({tool:'laser',direction:aim}));
  assert.equal(await superseded,null,'extra taps replace one bounded pending tap');
  side=1;client.requestInput();await pause(10);
  side=-1;client.requestInput();await pause(10);
  side=0;client.requestInput();await pause(10);
  assert.deepEqual(inputs.slice(-3),[1,-1,0],'the pending shot does not hold up stick input');
  aim=[1,0,0];release();await first;await latest;
  assert.equal(shots.length,2);assert.deepEqual(shots[1].direction,[1,0,0],'queued aim is sampled when the shot is sent');
  assert.ok(shots[1].at-shots[0].at>=195,'a tap does not bypass the laser interval');
 },{input:()=>({side})});
});

test('discrete fire is canceled by a failed gameplay guard, explicit cancellation, or a hidden page',async()=>{
 let sequence=0,allowed=true,release;const shots=[];
 await withRoom(async(path,options)=>{
  if(path==='/api/game/room-session')return response({csrfToken:'proof'});
  const command=JSON.parse(options.body);
  if(command.action==='fire'){
   shots.push(command);
   return new Promise(resolve=>{release=()=>resolve(response(confirmed(++sequence)));});
  }
  return response(confirmed(++sequence));
 },async client=>{
  await client.whenReady();const first=client.send('fire',{tool:'laser'});
  while(!release)await pause(1);
  const guarded=client.triggerFire({tool:'laser'},{canFire:()=>allowed});
  allowed=false;await pause(70);assert.equal(await guarded,null);
  allowed=true;
  const canceled=client.triggerFire({tool:'laser'});client.cancelTriggerFire();assert.equal(await canceled,null);
  const hidden=client.triggerFire({tool:'laser'});document.hidden=true;await pause(70);assert.equal(await hidden,null);
  document.hidden=false;release();await first;await pause(220);
  assert.equal(shots.length,1,'canceled taps cannot fire after the room becomes playable again');
 });
});

test('a delayed weapon response cannot release an expired tap, and stopping clears pending fire',async()=>{
 let sequence=0,release,fires=0;
 await withRoom(async(path,options)=>{
  if(path==='/api/game/room-session')return response({csrfToken:'proof'});
  const command=JSON.parse(options.body);
  if(command.action==='fire'){fires++;return new Promise(resolve=>{release=()=>resolve(response(confirmed(++sequence)));});}
  return response(confirmed(++sequence));
 },async client=>{
  await client.whenReady();const first=client.send('fire',{tool:'laser'});
  while(!release)await pause(1);
  const expired=client.triggerFire({tool:'laser'});await pause(1250);assert.equal(await expired,null);
  const stopped=client.triggerFire({tool:'laser'});client.stop();assert.equal(await stopped,null);
  release();await first;await pause(20);assert.equal(fires,1);
  await assert.rejects(client.triggerFire({tool:'laser'}),/Room closed/);
 });
});

test('a rejected fire tap is not retried and later taps respect the server cooldown',async()=>{
 let sequence=0,release,rejectedAt;const shots=[];
 await withRoom(async(path,options)=>{
  if(path==='/api/game/room-session')return response({csrfToken:'proof'});
  const command=JSON.parse(options.body);
  if(command.action==='fire'){
   shots.push({...command,at:performance.now()});
   if(shots.length===1)return new Promise(resolve=>{release=()=>{rejectedAt=performance.now();resolve(response({message:'Tool is cooling down.'},429));};});
  }
  return response(confirmed(++sequence));
 },async client=>{
  await client.whenReady();const first=assert.rejects(client.triggerFire({tool:'laser'}),error=>error.status===429);
  while(!release)await pause(1);
  const latest=client.triggerFire({tool:'laser'});release();await first;await latest;await pause(60);
  assert.equal(shots.length,2);assert.notEqual(shots[0].requestId,shots[1].requestId);
  assert.ok(shots[1].at-rejectedAt>=195,'a later tap waits out the rejected shot interval');assert.equal(client.ready,true);
 });
});

test('room joins send the current Rad Tox preference before gameplay and rejoin with its latest value',async()=>{
 let sequence=0,enabled=false,expired=false;const joins=[];
 await withRoom(async(path,options)=>{
  if(path==='/api/game/room-session')return response({csrfToken:'proof'});
  const command=JSON.parse(options.body);
  if(command.action==='join')joins.push(command);
  if(command.action==='input'&&!expired){expired=true;enabled=true;return response({message:'Rejoin required',code:'ROOM_JOIN_REQUIRED'},409);}
  return response(confirmed(++sequence));
 },async client=>{
  await client.whenReady();assert.equal(joins[0].radToxEnabled,false);
  await pause(220);assert.equal(joins.length,2);assert.equal(joins[1].radToxEnabled,true);assert.equal(client.ready,true);
 },{radToxEnabled:()=>enabled});
});
