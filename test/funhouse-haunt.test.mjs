import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {FUNHOUSE_ID,FUNHOUSE_STATIONS} from '../public/js/clown-funhouse-config.js';
import {FUNHOUSE_ADVENTURE_START,FUNHOUSE_ADVENTURE_CLUES} from '../public/js/funhouse-adventure-rules.js';
import {FUNHOUSE_HAUNT_RULES as RULES,FUNHOUSE_HAUNT_START as START,FUNHOUSE_HAUNT_WARDS as WARDS,funhouseHauntAvailable,funhouseHauntNextWard,funhouseHauntNear} from '../public/js/funhouse-haunt-rules.js';
import {funhouseCommand,stepFunhouse,cancelFunhouseActivities,playerFunhouseView} from '../server-clown-funhouse.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';

const world={id:FUNHOUSE_ID,name:'Midnight Laughs Funhouse',game:'funhouse',proceduralLand:true,spawn:{...START.position},builderScene:{version:3,layout:'grand-floor',mapSize:120,objects:[],layoutMeta:{locations:[]},gameplay:{radTox:false}},streets:[]};
const station=kind=>FUNHOUSE_STATIONS.find(value=>value.kind===kind);
function fixture(){
 const player={actorId:'watch-guest',username:'Guest',health:100,grounded:true,lastSeen:100000,position:{...START.position},score:0,input:{}},sim={players:{'watch-guest':player},actors:{}};let now=100000;
 const send=(action,fields={},at,environment=world)=>{now=at??now+500;player.lastSeen=now;return funhouseCommand(sim,player,environment,{action,...fields},now,{integer:()=>0});};
 const haunt=(operation,fields={},at,environment=world)=>send('funhouse-haunt',{operation,...fields},at,environment);
 return {player,sim,send,haunt,get now(){return now;},move:point=>{player.position={...point};},step:(at,environment=world)=>{now=at;stepFunhouse(sim,environment,now);}};
}

test('Night Watch supplies four immutable lanterns only in the complete native destination',()=>{
 assert.equal(WARDS.length,4);assert.equal(new Set(WARDS.map(ward=>ward.id)).size,4);
 assert.equal(funhouseHauntAvailable(world),true);
 for(const environment of [{...world,id:'copied-world'},{...world,funhouse:{enabled:false}},{...world,builderScene:{...world.builderScene,sourceFunhouse:{editableItems:true}}}])assert.equal(funhouseHauntAvailable(environment),false);
 assert.throws(()=>{WARDS[0].position.x=999;},TypeError);
 assert.equal(funhouseHauntNear({...WARDS[0].position,x:WARDS[0].position.x+3},WARDS[0]),true);
 assert.equal(funhouseHauntNear({...WARDS[0].position,x:WARDS[0].position.x+4},WARDS[0]),false);
 assert.equal(funhouseHauntNear(null,WARDS[0]),false);
 assert.equal(funhouseHauntNextWard({status:'active',wardIndex:1}),WARDS[1]);
 assert.equal(funhouseHauntNextWard({status:'complete',wardIndex:4}),null);
 assert.equal(RULES.durationMs,180000);
});

test('starting, sealing and stopping validate the map, floor, range, order and current run',()=>{
 const f=fixture();f.move({x:0,y:.02,z:40});assert.throws(()=>f.haunt('start'),/house lobby/);
 f.move(START.position);f.player.grounded=false;assert.throws(()=>f.haunt('start'),/stand on/);f.player.grounded=true;
 assert.throws(()=>f.haunt('start',{},undefined,{...world,id:'copy'}),/Midnight Laughs/);
 assert.throws(()=>f.haunt('start',{},undefined,{...world,builderScene:{...world.builderScene,sourceFunhouse:{editableItems:true}}}),/Midnight Laughs/);
 assert.throws(()=>f.haunt('invent-points'),/start, seal or stop/);
 const result=f.haunt('start'),watch=result.funhouse.haunt;assert.equal(watch.durationMs,RULES.durationMs);assert.equal(watch.settled,false);
 assert.equal(result.funhouseEffect.kind,'haunt');assert.equal(result.funhouseEffect.phase,'start');
 assert.throws(()=>f.haunt('start'),/current Night Watch/);
 assert.throws(()=>f.haunt('seal',{wardId:WARDS[0].id,hauntId:'stale'}),/no longer available/);
 assert.throws(()=>f.haunt('stop',{hauntId:'stale'}),/no longer available/);assert.equal(watch.status,'active');
 assert.throws(()=>f.haunt('seal',{wardId:WARDS[3].id}),/in order/);
 assert.throws(()=>f.haunt('seal',{wardId:WARDS[0].id}),/Walk closer/);
 f.move(WARDS[0].position);f.player.grounded=false;assert.throws(()=>f.haunt('seal',{wardId:WARDS[0].id}),/stand on/);f.player.grounded=true;
 const sealed=f.haunt('seal',{wardId:WARDS[0].id,hauntId:watch.id,score:99999,rewardMzk:99999});
 assert.equal(watch.wardIndex,1);assert.deepEqual(watch.sealed,[WARDS[0].id]);assert.equal(watch.score,35);assert.equal(f.player.score,0);
 assert.equal(watch.hint,WARDS[1].hint);assert.equal(watch.lastWardId,WARDS[0].id);assert.equal(watch.lastSealedAt,f.now);
 assert.equal(sealed.funhouseEffect.phase,'seal');assert.equal(sealed.funhouseEffect.wardId,WARDS[0].id);assert.deepEqual(sealed.funhouseEffect.position,WARDS[0].position);
 assert.throws(()=>f.haunt('seal',{wardId:WARDS[0].id}),/in order/);assert.equal(watch.score,35);
});

test('four seals award once, cap the time bonus, keep the best and isolate snapshots',()=>{
 const f=fixture(),watch=f.haunt('start').funhouse.haunt,start=watch.startedAt;let result;
 for(let index=0;index<WARDS.length;index++){f.move(WARDS[index].position);result=f.haunt('seal',{hauntId:watch.id,wardId:WARDS[index].id},start+(index+1)*25000);}
 assert.equal(watch.status,'complete');assert.equal(watch.settled,true);assert.equal(watch.bonus,60);assert.equal(watch.score,200);
 assert.equal(f.player.score,200);assert.equal(f.player.funhouse.bestScores.haunt,200);assert.equal(result.funhouseEffect.phase,'complete');
 assert.throws(()=>f.haunt('seal',{hauntId:watch.id,wardId:WARDS[3].id}),/Start Night Watch/);
 f.step(f.now+500);f.haunt('stop',{hauntId:watch.id});assert.equal(f.player.score,200);
 const view=playerFunhouseView(f.player);view.haunt.sealed.push('fake');view.effects['haunt:'+WARDS[0].id].position.x=999;
 assert.equal(watch.sealed.length,4);assert.notEqual(f.player.funhouse.effects['haunt:'+WARDS[0].id].position.x,999);
 f.move(START.position);const replay=f.haunt('start').funhouse.haunt;assert.notEqual(replay.id,watch.id);assert.deepEqual(replay.sealed,[]);
 f.move(WARDS[0].position);assert.throws(()=>f.haunt('seal',{hauntId:watch.id,wardId:WARDS[0].id}),/no longer available/);
 for(let index=0;index<WARDS.length;index++){f.move(WARDS[index].position);f.haunt('seal',{hauntId:replay.id,wardId:WARDS[index].id},replay.startedAt+(index+1)*44000);}
 assert.equal(replay.bonus,4);assert.equal(replay.score,144);assert.equal(f.player.score,344);assert.equal(f.player.funhouse.bestScores.haunt,200);
});

test('travel, expiry, defeat, disconnection and riding cancel partial watches without a reward',()=>{
 for(const reason of ['travel','expiry','defeat','disconnect','world-change','vehicle','replaced']){
  const f=fixture(),watch=f.haunt('start').funhouse.haunt;f.move(WARDS[0].position);f.haunt('seal',{wardId:WARDS[0].id});assert.equal(watch.score,35);
  if(reason==='travel')cancelFunhouseActivities(f.player,f.now,'Travel ended Night Watch.');
  else if(reason==='expiry'){f.player.lastSeen=watch.endsAt;f.step(watch.endsAt);}
  else if(reason==='defeat'){f.player.health=0;f.step(f.now+500);}
  else if(reason==='disconnect')f.step(f.now+15001);
  else if(reason==='vehicle'){f.player.vehicleId='car';f.step(f.now+500);}
  else if(reason==='replaced'){f.player.replacedByRoom=true;f.step(f.now+500);}
  else f.step(f.now+500,{id:'another-world'});
  assert.equal(watch.status,'cancelled',reason);assert.equal(watch.score,0,reason);assert.equal(watch.bonus,0,reason);assert.equal(watch.settled,false,reason);assert.equal(f.player.score,0,reason);
  assert.equal(f.player.funhouse.bestScores?.haunt,undefined,reason);
 }
});

test('the deadline rejects a final seal and preserves no partial score',()=>{
 const f=fixture(),watch=f.haunt('start').funhouse.haunt;
 for(let index=0;index<3;index++){f.move(WARDS[index].position);f.haunt('seal',{wardId:WARDS[index].id});}
 f.move(WARDS[3].position);assert.throws(()=>f.haunt('seal',{hauntId:watch.id,wardId:WARDS[3].id},watch.endsAt),/Start Night Watch/);
 assert.equal(watch.status,'cancelled');assert.equal(watch.score,0);assert.equal(f.player.score,0);
});

test('the Lost Laugh Trail coexists with Night Watch and stopping either leaves the other active',()=>{
 const f=fixture();f.move(FUNHOUSE_ADVENTURE_START.position);const trail=f.send('funhouse-adventure',{operation:'start'}).funhouse.adventure;
 f.move(START.position);let watch=f.haunt('start').funhouse.haunt;assert.equal(trail.status,'active');
 f.move(FUNHOUSE_ADVENTURE_CLUES[0].position);f.send('funhouse-adventure',{operation:'inspect',clueId:FUNHOUSE_ADVENTURE_CLUES[0].id});assert.equal(watch.status,'active');
 f.haunt('stop');assert.equal(trail.status,'active');assert.equal(watch.status,'cancelled');
 f.move(START.position);watch=f.haunt('start').funhouse.haunt;f.send('funhouse-adventure',{operation:'stop',adventureId:trail.id});assert.equal(watch.status,'active');assert.equal(trail.status,'cancelled');
});

test('starting Night Watch ends an old game; choosing a ride or game ends Night Watch',()=>{
 for(const kind of ['water','jackbox','car']){
  const f=fixture();f.move(station('water').position);f.send('funhouse-start',{stationId:station('water').id});const oldRound=f.player.funhouse.round;
  f.move(START.position);const watch=f.haunt('start').funhouse.haunt;assert.equal(oldRound.status,'cancelled');assert.equal(watch.status,'active');
  f.move(station(kind).position);f.send(kind==='water'?'funhouse-start':kind==='car'?'funhouse-ride':'funhouse-challenge',{stationId:station(kind).id});
  assert.equal(watch.status,'cancelled',kind);assert.equal(watch.score,0);assert.equal(f.player.score,0);
 }
});

test('shared-room commands expose Night Watch, deduplicate seals and cancel on map travel for free',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'funhouse-haunt-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 let now=100000,request=0,charges=0;const store=new SharedRoomStore(join(directory,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>now,charge:()=>{charges++;throw Error('Night Watch is free.');}}),identity={accountId:'watcher',username:'Watcher'};
 const send=(action,fields={})=>{now+=200;return runtime.command(FUNHOUSE_ID,world,identity,{action,requestId:'watch-'+ ++request,...fields});};
 let snapshot=await send('join');const self=snapshot.selfId;
 snapshot=await send('funhouse-haunt',{operation:'start'});const watch=snapshot.players[self].funhouse.haunt,target=WARDS[0].position;
 for(let step=0;step<70;step++){
  const position=snapshot.players[self].position,dx=target.x-position.x,dz=target.z-position.z;if(Math.hypot(dx,dz)<1.2)break;
  snapshot=await send('input',{input:{forward:1,yaw:Math.atan2(-dx,-dz),sprint:true}});
 }
 snapshot=await send('input',{input:{}});assert.ok(funhouseHauntNear(snapshot.players[self].position,WARDS[0]),'walking reaches the real nursery lantern');
 const fields={operation:'seal',hauntId:watch.id,wardId:WARDS[0].id,requestId:'seal-once'};
 snapshot=await send('funhouse-haunt',fields);assert.equal(snapshot.players[self].funhouse.haunt.wardIndex,1);
 snapshot=await send('funhouse-haunt',fields);assert.equal(snapshot.players[self].funhouse.haunt.wardIndex,1);assert.equal(snapshot.players[self].funhouse.haunt.score,35);
 snapshot=await send('map-access',{position:START.position});assert.equal(snapshot.players[self].funhouse.haunt.status,'cancelled');assert.equal(snapshot.players[self].score,0);assert.equal(charges,0);
 await store.flush();
});
