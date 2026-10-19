import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {finishMatch,newCombatStats} from '../rpg-match.mjs';
import {stepEnemyCombat} from '../server-enemy-combat.mjs';
import {stepRadToxEnemy} from '../rad-tox-campaign.mjs';

async function fixture(run,map={id:'house',modelUrl:'/fixture.glb',playable:true,spawn:{x:0,y:0,z:0}}){
 const dir=await mkdtemp(join(tmpdir(),'rad-tox-opt-out-'));let now=100000,sequence=0;
 const store=new SharedRoomStore(join(dir,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>now});
 runtime.collision.safeSpawn=(_,point)=>({...point});runtime.collision.encounterSpawn=(_,point)=>({...point});
 if(map.modelUrl){runtime.collision.world=()=>({floors:[]});runtime.collision.groundAt=()=>null;}
 runtime.collision.blocksShot=()=>false;runtime.collision.resolve=(_,previous,next)=>({...next,y:0,floorY:0});
 const send=(who,action,fields={},requestId='opt-out-'+ ++sequence)=>runtime.command(map.id,map,{accountId:who,username:who,walletId:who,stats:{health:78}},{action,requestId,...fields});
 const change=callback=>store.update(map.id,room=>callback(room.simulation));
 try{await run({runtime,store,map,send,change,advance:ms=>(now+=ms),now:()=>now});}
 finally{await rm(dir,{recursive:true,force:true});}
}

test('joining with RAD-TOX off explores immediately and enabling preserves established player state',()=>fixture(async({send,change,store,map})=>{
 let state=await send('alice','join',{radToxEnabled:false});
 assert.equal(state.players['account:alice'].radToxEnabled,false);assert.equal(state.radTox,null);assert.equal(state.match,null);
 await change(sim=>Object.assign(sim.players['account:alice'],{position:{x:8,y:0,z:11},health:63,ammo:54,fuel:32,score:37,combat:{...newCombatStats(),shots:8,score:37},progress:{explore:4},input:{forward:.8,side:.3},toolReady:{laser:120000}}));
 const before=(await store.get(map.id)).simulation.players['account:alice'];
 state=await send('alice','set-rad-tox',{enabled:true});
 const after=(await store.get(map.id)).simulation.players['account:alice'];
 assert.equal(state.players['account:alice'].radToxEnabled,true);assert.equal(state.radTox.state,'active');assert.ok(state.match.participants['account:alice']);
 for(const key of ['position','health','ammo','fuel','score','combat','progress','input','toolReady'])assert.deepEqual(after[key],before[key],key+' survives enabling');
 const matchId=state.match.id,enemies=Object.keys(state.actors).filter(id=>state.actors[id].radTox);
 state=await send('alice','set-rad-tox',{enabled:false},'disable-once');assert.equal(state.match.participants['account:alice'],undefined);
 state=await send('alice','set-rad-tox',{enabled:true});
 assert.equal(state.match.id,matchId);assert.deepEqual(Object.keys(state.actors).filter(id=>state.actors[id].radTox),enemies);
 state=await send('alice','set-rad-tox',{enabled:false},'disable-once');
 assert.equal(state.players['account:alice'].radToxEnabled,true,'replayed old disable never replaces a newer selection');
 assert.equal(state.players['account:alice'].score,37);assert.equal(state.players['account:alice'].health,63);
 await send('alice','set-rad-tox',{enabled:false});state=await send('alice','join');assert.equal(state.players['account:alice'].radToxEnabled,false,'rejoins retain the saved preference');
 const reloaded=await new SharedRoomStore(store.file).get(map.id);assert.equal(reloaded.simulation.players['account:alice'].radToxEnabled,false);
}));

test('opting out precedes an enemy tick, preserves the room campaign and leaves other players vulnerable',()=>fixture(async({send,change,advance})=>{
 await send('alice','join');let state=await send('bob','join'),matchId=state.match.id;
 await change(sim=>{
  const alice=sim.players['account:alice'],bob=sim.players['account:bob'];
  Object.assign(alice,{position:{x:0,y:0,z:0},health:63,spawnProtectedUntil:0,input:{side:1}});
  Object.assign(bob,{position:{x:8,y:0,z:0},spawnProtectedUntil:0});
  for(const actor of Object.values(sim.actors))if(actor.radTox){actor.position={x:100,y:0,z:100};actor.lastAttack=0;}
  const snake=Object.values(sim.actors).find(actor=>actor.kind==='snake');snake.position={x:8,y:0,z:.6};snake.lastAttack=0;
  sim.projectiles={gas:{id:'gas',actorId:'ghost',kind:'ghost',position:{x:0,y:.9,z:-.5},velocity:[0,0,6],bornAt:100000,expiresAt:110000}};
 });
 advance(100);state=await send('alice','set-rad-tox',{enabled:false});
 assert.equal(state.players['account:alice'].health,63,'off applies before an already-flying projectile can land');
 assert.ok(state.players['account:bob'].health<100,'another participant still receives enemy contact damage');
 assert.equal(state.match.id,matchId);assert.equal(state.match.state,'active');assert.ok(state.match.participants['account:bob']);assert.equal(state.match.participants['account:alice'],undefined);
 assert.equal(state.players['account:alice'].position.x,.4,'the normal movement tick continues during the toggle');
 assert.equal(state.players['account:alice'].input.side,1);
 const wave=state.radTox.wave;
 state=await send('alice','start-rad-tox');assert.equal(state.players['account:alice'].radToxEnabled,false,'cached startup actions cannot override off');assert.equal(state.radTox.wave,wave);
}));

test('all RAD-TOX enemy kinds target enabled players and projectiles pass opted-out bodies without damage',()=>{
 for(const kind of ['toxic','snake','ghost','brain','boss']){
  let now=100000;const near={actorId:'off',radToxEnabled:false,position:{x:0,y:0,z:0},health:100,lastSeen:now},far={actorId:'on',position:{x:0,y:0,z:.7},health:100,lastSeen:now};
  const actor={id:'enemy',radTox:true,kind,position:{x:0,y:0,z:-.2},rotation:{y:0},health:100,active:true};
  const sim={actors:{enemy:actor},players:{off:near,on:far},events:[],match:{state:'active'}};
  stepRadToxEnemy(sim,actor,[near,far],now,.01,()=>false,(_previous,next)=>next,false);assert.equal(actor.movementTargetId,'on',kind+' ignores an off player when choosing pursuit');actor.lastAttack=0;
  for(let i=0;i<16;i++){now+=100;near.lastSeen=far.lastSeen=now;stepEnemyCombat(sim,{now,dt:.1,environment:{},collision:{blocksShot:()=>false}});}
  assert.equal(near.health,100,kind+' cannot damage the off body');assert.ok(far.health<100,kind+' still attacks an enabled participant');
  assert.ok(sim.events.filter(event=>event.action==='enemy-attack').every(event=>event.targetId==='on'));
 }
});

test('finished shared combat does not freeze peaceful movement, fire or the next level',()=>fixture(async({send,change,advance,now,store,map})=>{
 await send('alice','join',{radToxEnabled:false});await send('bob','join');
 await change(sim=>{
  Object.assign(sim.players['account:alice'],{position:{x:0,y:0,z:0},health:61,score:29,input:{side:1},progress:{explore:3}});
  finishMatch(sim,'victory',now());
 });
 let stored=(await store.get(map.id)).simulation;assert.equal(stored.players['account:alice'].input.side,1,'results do not cancel exploration input');
 advance(100);let state=await send('alice','input',{input:{side:1}});assert.equal(state.players['account:alice'].position.x,.4);
 state=await send('alice','fire',{tool:'laser',direction:[0,1,0]});assert.equal(state.result.tool,'laser','tools are available while other players review results');
 await send('alice','input',{input:{}});advance(10000);state=await send('alice','input',{input:{}});
 assert.equal(state.radTox.level,2);assert.equal(state.match.participants['account:alice'],undefined);assert.ok(state.match.participants['account:bob']);
 assert.equal(state.players['account:alice'].health,61);assert.equal(state.players['account:alice'].score,29);assert.deepEqual(state.players['account:alice'].position,{x:.4,y:0,z:0});assert.equal(state.players['account:alice'].progress.explore,3);
}));

test('RAD-TOX opt-out does not grant immunity to normal player weapons',()=>fixture(async({send,change})=>{
 await send('alice','join',{radToxEnabled:false});await send('bob','join');
 await change(sim=>{
  for(const enemy of Object.values(sim.actors))if(enemy.radTox)enemy.position={x:100,y:0,z:100};
  Object.assign(sim.players['account:alice'],{position:{x:0,y:0,z:-4},health:78,spawnProtectedUntil:0});
  Object.assign(sim.players['account:bob'],{position:{x:0,y:0,z:0},spawnProtectedUntil:0});
 });
 const state=await send('bob','fire',{tool:'laser',direction:[0,0,-1]});
 assert.equal(state.result.hitId,'account:alice');assert.ok(state.players['account:alice'].health<78);assert.equal(state.players['account:alice'].radToxEnabled,false);
}));

test('authored hostile and hazard actors exclude peaceful visitors without disabling builder gameplay',()=>fixture(async({send,change,advance})=>{
 await send('alice','join',{radToxEnabled:false});await send('bob','join');
 await change(sim=>{
  Object.assign(sim.players['account:alice'],{position:{x:0,y:0,z:0},spawnProtectedUntil:0});Object.assign(sim.players['account:bob'],{position:{x:3,y:0,z:0},spawnProtectedUntil:0});
  for(const [id,behavior,x]of [['hostile','hostile',1],['near-off','hazard',0],['near-on','hazard',3]]){
   const position={x,y:0,z:0};sim.actors[id]={id,spawned:true,position,rotation:{y:0},health:100,active:true,definition:{objectId:id,position:{...position},movement:{speed:.1},ai:{detectionRange:40},gameplay:{behavior,damage:10}}};
  }
 });
 advance(100);const state=await send('alice','input',{input:{}});
 assert.equal(state.players['account:alice'].health,78);assert.ok(state.players['account:bob'].health<78);assert.equal(state.actors.hostile.movementTargetId,'account:bob');assert.equal(state.radTox,null);
},{id:'builder',spawn:{x:0,y:0,z:0},builderScene:{layout:'grand-floor',objects:[]}}));

test('RAD-TOX toggles preserve native basketball and firing range games and validate booleans',async()=>{
 for(const map of [{id:'basketball-arena',spawn:{x:0,y:0,z:0},builderScene:{layout:'grand-floor',objects:[]}},{id:'firing-range',spawn:{x:0,y:0,z:16.2},builderScene:{layout:'firing-range',objects:[]}}])await fixture(async({send})=>{
  let state=await send('alice','join'),game=structuredClone(state.basketball||state.firingRange),position=state.players['account:alice'].position;
  for(const enabled of [false,true,false]){state=await send('alice','set-rad-tox',{enabled});assert.equal(state.radTox,null);assert.equal(state.match,null);assert.deepEqual(state.basketball||state.firingRange,game);assert.deepEqual(state.players['account:alice'].position,position);assert.equal(state.players['account:alice'].radToxEnabled,enabled);}
  for(const enabled of [undefined,null,'false',0,{}])await assert.rejects(send('alice','set-rad-tox',{enabled}),{statusCode:422});
  await assert.rejects(send('alice','join',{radToxEnabled:'false'}),{statusCode:422});
 },map);
});


test('an encounter with no opted-in players pauses between waves and after results',()=>fixture(async({send,change,advance,now})=>{
 await send('alice','join');let state=await send('alice','set-rad-tox',{enabled:false}),matchId=state.match.id;
 await change(sim=>{for(const actor of Object.values(sim.actors))if(actor.radTox){actor.health=0;actor.active=false;}});
 advance(11000);state=await send('alice','input',{input:{}});assert.equal(state.radTox.wave,1);assert.equal(state.radTox.nextWaveAt,null);assert.equal(state.match.id,matchId);
 await change(sim=>finishMatch(sim,'victory',now()));advance(11000);state=await send('alice','input',{input:{}});assert.equal(state.match.id,matchId);assert.equal(state.radTox.level,1,'peaceful input cannot automatically open a new combat match');
}));


test('off-player shots ignore hidden RAD-TOX targets and occluders while prop and PvP hits still work',()=>fixture(async({send,change,advance,runtime,store,map})=>{
 await send('alice','join',{radToxEnabled:false});await send('bob','join');
 let enemyId;
 await change(sim=>{
  Object.assign(sim.players['account:alice'],{position:{x:0,y:0,z:0},spawnProtectedUntil:0});Object.assign(sim.players['account:bob'],{position:{x:8,y:0,z:-6},spawnProtectedUntil:0});
  for(const enemy of Object.values(sim.actors))if(enemy.radTox)enemy.position={x:100,y:0,z:100};
  const enemy=Object.values(sim.actors).find(actor=>actor.radTox);enemyId=enemy.id;
  Object.assign(enemy,{position:{x:0,y:0,z:-2},health:100,spawned:true,asset:{id:'solid-enemy',buildAssetId:'supply-crate'},scale:{x:1,y:3,z:1}});
  sim.actors.prop={id:'prop',spawned:true,active:true,position:{x:0,y:0,z:-6},health:100,asset:{id:'ordinary-prop',buildAssetId:'supply-crate'},scale:{x:1,y:3,z:1}};
 });
 runtime.collision.blocksShot=ServerBuilderCollision.prototype.blocksShot.bind(runtime.collision);
 const before=(await store.get(map.id)).simulation;
 assert.equal(runtime.collision.blocksShot(map,{x:0,y:1.5,z:0},[0,0,-1],5,before.actors,{}),true,'the hidden enemy has actual solid geometry in the ray path');
 const campaign=structuredClone(before.radTox);
 let state=await send('alice','fire',{tool:'laser',direction:[0,0,-1]});
 assert.equal(state.result.hitId,'prop');assert.equal(state.actors.prop.health,50);assert.equal(state.actors[enemyId].health,100);assert.deepEqual(state.radTox,campaign);
 advance(250);await change(sim=>{sim.actors.prop.active=false;sim.actors[enemyId].position={x:0,y:0,z:-2};Object.assign(sim.players['account:bob'],{position:{x:0,y:0,z:-6},health:78});});
 state=await send('alice','fire',{tool:'laser',direction:[0,0,-1]});
 assert.equal(state.result.hitId,'account:bob');assert.ok(state.players['account:bob'].health<78);assert.equal(state.actors[enemyId].health,100);
 advance(250);await change(sim=>{sim.players['account:bob'].position={x:8,y:0,z:-6};sim.actors[enemyId].position={x:0,y:0,z:-2};});
 state=await send('alice','fire',{tool:'laser',direction:[0,0,-1]});
 assert.equal(state.result.hitId,null,'a hidden enemy alone produces an ordinary miss');assert.equal(state.actors[enemyId].health,100);assert.equal(state.players['account:alice'].combat.enemyKills,0);assert.equal(state.players['account:alice'].score,0);assert.equal(state.radTox.remaining,campaign.remaining);
}));
