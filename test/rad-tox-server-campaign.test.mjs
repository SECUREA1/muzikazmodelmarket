import {RAD_TOX_WAVE_PAUSE_MS,RAD_TOX_RESULTS_PAUSE_MS} from '../public/js/rad-tox-rules.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';

test('starting RAD-TOX in a GLB house creates one shared encounter with enemies, combat and progressing waves',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'rad-tox-server-'));let now=100000,request=0;
 try {
  const file=join(dir,'rooms.json'),store=new SharedRoomStore(file),rewards=[];
  const runtime=new AuthoritativeRooms({store,now:()=>now,reward:async(...args)=>rewards.push(args)});
  runtime.collision.encounterSpawn=(_,point)=>point;runtime.collision.safeSpawn=(_,point)=>point;runtime.collision.blocksShot=()=>false;runtime.collision.resolve=(_,previous,next)=>({...next,y:1,floorY:1});runtime.collision.resolvePlaced=(_,previous,next)=>next;
  const environment={id:'muzikaz-main',name:'House',modelUrl:'/public/models/environments/muzimakzmain.glb',playable:true,spawn:{x:0,y:1,z:2}};
  const alice={accountId:'alice',walletId:'alice',username:'Alice',stats:{health:100}};
  const bob={...alice,accountId:'bob',walletId:'bob',username:'Bob'};
  const send=async(action,fields={},identity=alice)=>{
   try{return await runtime.command(environment.id,environment,identity,{action,requestId:'campaign-'+ ++request,...fields});}
   catch(error){if(error.message!=='Respawn before acting.'||action==='respawn')throw error;await runtime.command(environment.id,environment,identity,{action:'respawn',requestId:'respawn-'+ ++request});return runtime.command(environment.id,environment,identity,{action,requestId:'campaign-'+ ++request,...fields});}
  };
  let state=await send('join');assert.equal(state.radTox.state,'active','everyone joins the same running encounter');
  state=await send('start-rad-tox');assert.equal(state.radTox.level,1);assert.equal(state.radTox.wave,1);
  const enemies=Object.values(state.actors).filter(actor=>actor.radTox);
  assert.equal(enemies.length,8);assert.ok(enemies.every(actor=>actor.active&&actor.health>0));
  assert.deepEqual(new Set(enemies.map(actor=>actor.kind)),new Set(['toxic','ghost','snake','brain']));
  await send('join',{},bob);state=await send('start-rad-tox',{},bob);
  assert.equal(Object.values(state.actors).filter(actor=>actor.radTox).length,8,'a second player shares the existing wave');
  await store.update(environment.id,room=>{for(const player of Object.values(room.simulation.players))player.spawnProtectedUntil=0;});
  const first=state.actors[enemies[0].id],before=first.position.z;
  now+=250;state=await runtime.snapshot(environment.id,environment);
  assert.ok(state.actors[first.id].position.z>before,'enemies actively chase the player');
  await store.update(environment.id,room=>{const player=room.simulation.players['account:alice'];player.spawnProtectedUntil=0;const snake=Object.values(room.simulation.actors).find(actor=>actor.radTox&&actor.kind==='snake');snake.position={...player.position,z:player.position.z+.5};});
  const initialHealth=state.players['account:alice'].health;
  for(let tick=0;tick<28;tick++){now+=250;state=await send('input',{input:{}});}
  assert.ok(state.players['account:alice'].health<initialHealth,'nearby enemies damage the player on the server');
  for(let wave=1;wave<=4;wave++) {
   state=await runtime.snapshot(environment.id,environment);
   assert.equal(state.radTox.wave,wave);
   const runningMatch=state.match.id;state=await send('start-rad-tox');assert.equal(state.match.id,runningMatch);assert.equal(state.radTox.wave,wave,'Start cannot reset an active wave');
   await assert.rejects(send('next-rad-tox',{matchId:runningMatch}),{statusCode:409});
   if(wave===4)assert.equal(Object.values(state.actors).find(actor=>actor.radTox&&actor.active).kind,'boss');
   // Fire actual authoritative laser commands; never submit a client hit ID or damage.
   for(const id of Object.values(state.actors).filter(actor=>actor.radTox).map(actor=>actor.id))while(state.actors[id]?.active) {
    if(state.players['account:alice'].health<=0)state=await send('respawn');
    const target=state.actors[id],player=state.players['account:alice'];
    const direction=[target.position.x-player.position.x,target.position.y+1-(player.position.y+1.5),target.position.z-player.position.z];
    now+=250;state=await send('fire',{tool:'laser',direction});
   }
   now+=1;state=await send('input',{input:{}});assert.equal(state.radTox.state,wave===4?'finished':'cleared');
   if(wave<4){now+=RAD_TOX_WAVE_PAUSE_MS-1;state=await send('input',{input:{}});assert.equal(state.radTox.wave,wave,'countdown cannot be skipped');now+=1;await send('input',{input:{}});state=await runtime.snapshot(environment.id,environment);}
  }
  assert.equal(state.match.state,'finished');assert.equal(state.match.outcome,'victory');assert.equal(state.match.results.length,2);
  const completed=state.match.id;await assert.rejects(send('next-rad-tox',{matchId:completed}),{statusCode:409});now+=RAD_TOX_RESULTS_PAUSE_MS;state=await send('next-rad-tox',{matchId:completed});assert.equal(state.radTox.level,2);assert.equal(state.radTox.wave,1);assert.ok(state.radTox.remaining>0);
  assert.ok((await store.get(environment.id)).simulation.matchHistory[0].results.find(row=>row.id==='account:alice').score>0);assert.ok(rewards.some(args=>args[1]==='defeat'));
  const reloaded=new AuthoritativeRooms({store:new SharedRoomStore(file),now:()=>now});
  // Input snapshots are intentionally transient; persist the current encounter with a start command.
  await send('start-rad-tox');
  reloaded.collision.resolve=(_,previous,next)=>next;const restored=await reloaded.snapshot(environment.id,environment);
  assert.equal(restored.radTox.level,2);assert.equal(restored.radTox.targetCount,state.radTox.targetCount);
 } finally {await rm(dir,{recursive:true,force:true});}
});

test('Builder rooms receive the shared RAD-TOX campaign',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'rad-tox-builder-'));
 try {
  const runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(dir,'rooms.json'))});
  runtime.collision.safeSpawn=(_,point)=>point;runtime.collision.encounterSpawn=(_,point)=>point;runtime.collision.resolve=(_,previous,next)=>next;
  const map={id:'builder',builderScene:{objects:[]}},identity={accountId:'alice',stats:{health:100}};
  await runtime.command(map.id,map,identity,{action:'join',requestId:'join'});
  const state=await runtime.command(map.id,map,identity,{action:'start-rad-tox',requestId:'start'});
  assert.equal(state.radTox.state,'active');assert.equal(state.radTox.wave,1);
  assert.deepEqual(new Set(Object.values(state.actors).filter(actor=>actor.radTox).map(actor=>actor.kind)),new Set(['toxic','ghost','snake','brain']));
 }finally{await rm(dir,{recursive:true,force:true});}
});


test('loading players are protected until all resources are ready and do not restart the server encounter',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'rad-tox-ready-'));let now=100000,n=0;
 try{
 const store=new SharedRoomStore(join(dir,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>now});
 runtime.collision.encounterSpawn=(_,point)=>point;runtime.collision.safeSpawn=(_,point)=>point;runtime.collision.resolve=(_,previous,next)=>({...next,y:0,floorY:0});
 const map={id:'ready-map',modelUrl:'/public/models/environments/muzimakzmain.glb',spawn:{x:0,y:0,z:0}},identity={accountId:'alice',username:'Alice',stats:{health:100}};
 const send=(action,fields={})=>runtime.command(map.id,map,identity,{action,requestId:'ready-'+ ++n,...fields});
 let state=await send('join',{deferRadTox:true});const match=state.match.id,positions=Object.values(state.actors).filter(a=>a.radTox).map(a=>a.position);
 assert.equal(state.players['account:alice'].radToxReady,false);assert.deepEqual(state.match.participants,{});
 for(let i=0;i<48;i++){now+=250;state=await send('input',{input:{}});await runtime.tickActive();}
 assert.equal(state.players['account:alice'].health,100);assert.equal(state.radTox.wave,1);assert.equal(state.match.state,'active');
 assert.deepEqual(Object.values(state.actors).filter(a=>a.radTox).map(a=>a.position),positions,'enemies do not attack a loading player');
 await assert.rejects(send('fire',{tool:'laser',direction:[0,0,-1]}),{code:'GAME_NOT_READY'});
 state=await send('start-rad-tox');assert.equal(state.match.id,match);assert.equal(state.players['account:alice'].radToxReady,true);assert.ok(state.match.participants['account:alice']);assert.equal(state.players['account:alice'].spawnProtectedUntil,now+3000);
 now+=250;state=await send('input',{input:{}});assert.deepEqual(Object.values(state.actors).filter(a=>a.radTox).map(a=>a.position),positions,'spawn protection gives the player room to move before lock-on');
 now+=3000;state=await send('input',{input:{}});assert.notDeepEqual(Object.values(state.actors).filter(a=>a.radTox).map(a=>a.position),positions,'the server runs combat after spawn protection');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('one server-confirmed hit kills regular enemies and a previously saved high-health boss',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'rad-tox-one-hit-'));let now=100000,n=0;
 try{
  const store=new SharedRoomStore(join(dir,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>now});
  runtime.collision.safeSpawn=(_,p)=>p;runtime.collision.encounterSpawn=(_,p)=>p;runtime.collision.resolve=(_,previous)=>({...previous});runtime.collision.blocksShot=()=>false;
  const map={id:'one-hit',modelUrl:'/public/models/environments/muzimakzmain.glb',spawn:{x:0,y:1,z:0}},identity={accountId:'alice',username:'Alice',stats:{health:100}};
  const send=(action,fields={})=>runtime.command(map.id,map,identity,{action,requestId:'shot-'+ ++n,...fields});
  await send('join');
  for(const kind of ['toxic','ghost','snake','brain','boss']){
   await store.update(map.id,room=>{const sim=room.simulation;sim.machineRetryAt=now+100000;sim.actors={target:{id:'target',radTox:true,spawnVersion:2,active:true,kind,position:{x:0,y:1,z:-4},rotation:{y:0},health:999,maxHealth:999,definition:{objectId:'target',position:{x:0,y:1,z:-4},gameplay:{behavior:'hostile',health:999,damage:0},movement:{speed:0},ai:{detectionRange:0}}}};sim.radTox.state='active';sim.radTox.nextWaveAt=null;sim.radTox.wave=1;});
   now+=100;const state=await send('fire',{tool:'laser',direction:[0,-.5,-4]});
   assert.equal(state.actors.target.health,0,kind+' dies in one hit');assert.equal(state.actors.target.active,false);
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('Builder join can keep RAD-TOX off without a second startup command',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'builder-ready-'));
 try{
  const runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(dir,'rooms.json'))});
  runtime.collision.safeSpawn=(_,point)=>point;runtime.collision.encounterSpawn=(_,point)=>point;runtime.collision.resolve=(_,previous,next)=>next;
  const map={id:'builder-ready',builderScene:{layout:'grand-floor',mapSize:40,objects:[]}},identity={accountId:'builder',username:'Builder',stats:{health:100}};
  const state=await runtime.command(map.id,map,identity,{action:'join',requestId:'join-builder',deferRadTox:true,radToxEnabled:false});
  assert.equal(state.players['account:builder'].radToxEnabled,false);
  assert.equal(Object.values(state.actors).some(actor=>actor.radTox),false);
  assert.equal(state.radTox,null);
  const started=await runtime.command(map.id,map,identity,{action:'start-rad-tox',requestId:'start-builder'});
  assert.equal(started.players['account:builder'].radToxEnabled,true);assert.equal(started.radTox.state,'active');
 }finally{await rm(dir,{recursive:true,force:true});}
});
