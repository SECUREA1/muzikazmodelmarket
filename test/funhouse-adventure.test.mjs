import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {FUNHOUSE_ID,FUNHOUSE_STATIONS} from '../public/js/clown-funhouse-config.js';
import {FUNHOUSE_ADVENTURE_RULES as RULES,FUNHOUSE_ADVENTURE_START as START,FUNHOUSE_ADVENTURE_CLUES as CLUES,funhouseAdventureAvailable,funhouseAdventureNextClue,funhouseAdventureNear} from '../public/js/funhouse-adventure-rules.js';
import {funhouseCommand,stepFunhouse,cancelFunhouseActivities,playerFunhouseView} from '../server-clown-funhouse.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';

const world={id:FUNHOUSE_ID,name:'Midnight Laughs Funhouse',game:'funhouse',proceduralLand:true,spawn:{...START.position},builderScene:{version:3,layout:'grand-floor',mapSize:120,objects:[],layoutMeta:{locations:[]},gameplay:{radTox:false}},streets:[]};
const station=kind=>FUNHOUSE_STATIONS.find(value=>value.kind===kind);
function fixture(){
 const player={actorId:'trail-guest',username:'Guest',health:100,grounded:true,lastSeen:100000,position:{...START.position},score:0,input:{}},sim={players:{'trail-guest':player},actors:{}};let now=100000;
 const send=(action,fields={},at)=>{now=at??now+500;player.lastSeen=now;return funhouseCommand(sim,player,world,{action,...fields},now,{integer:()=>0});};
 const adventure=(operation,fields={},at)=>send('funhouse-adventure',{operation,...fields},at);
 return {player,sim,send,adventure,get now(){return now;},move:point=>{player.position={...point};},step:(at,environment=world)=>{now=at;stepFunhouse(sim,environment,now);}};
}

test('the trail exposes six immutable physical clues only in the complete native map',()=>{
 assert.equal(CLUES.length,6);assert.equal(new Set(CLUES.map(clue=>clue.id)).size,6);
 assert.equal(funhouseAdventureAvailable(world),true);
 assert.equal(funhouseAdventureAvailable({...world,id:'a-builder-copy'}),false);
 assert.equal(funhouseAdventureAvailable({...world,funhouse:{enabled:false}}),false);
 assert.equal(funhouseAdventureAvailable({...world,builderScene:{...world.builderScene,sourceFunhouse:{editableItems:true}}}),false);
 assert.throws(()=>{CLUES[0].position.x=99;},TypeError);
 assert.equal(funhouseAdventureNear({...CLUES[0].position,x:CLUES[0].position.x+3},CLUES[0]),true);
 assert.equal(funhouseAdventureNear({...CLUES[0].position,x:CLUES[0].position.x+4},CLUES[0]),false);
 assert.equal(funhouseAdventureNextClue({status:'active',clueIndex:2}),CLUES[2]);
 assert.equal(funhouseAdventureNextClue({status:'complete',clueIndex:6}),null);
});

test('starting and inspecting validate the map, standing position, ordered clue and current run',()=>{
 const f=fixture();f.move({x:30,y:.02,z:30});assert.throws(()=>f.adventure('start'),/welcome board/);
 f.move(START.position);f.player.grounded=false;assert.throws(()=>f.adventure('start'),/stand on/);f.player.grounded=true;
 assert.throws(()=>f.adventure('invent-a-reward'),/start, inspect or stop/);
 const trail=f.adventure('start').funhouse.adventure;assert.equal(trail.durationMs,RULES.durationMs);assert.equal(trail.settled,false);
 assert.throws(()=>f.adventure('start'),/current adventure/);
 assert.throws(()=>f.adventure('inspect',{clueId:CLUES[0].id,adventureId:'obsolete'}),/no longer available/);
 assert.throws(()=>f.adventure('inspect',{clueId:CLUES[5].id}),/in order/);
 assert.throws(()=>f.adventure('inspect',{clueId:CLUES[0].id}),/Walk closer/);
 assert.equal(trail.clueIndex,0);assert.equal(f.player.score,0);
 f.move(CLUES[0].position);f.player.vehicleId='borrowed-car';assert.throws(()=>f.adventure('inspect',{clueId:CLUES[0].id}),/Step off/);f.player.vehicleId=null;
 const result=f.adventure('inspect',{clueId:CLUES[0].id,adventureId:trail.id,score:99999,rewardMzk:99999});
 assert.equal(trail.clueIndex,1);assert.deepEqual(trail.found,[CLUES[0].id]);assert.equal(trail.score,25);assert.equal(f.player.score,0);
 assert.equal(trail.hint,CLUES[1].hint);assert.equal(result.funhouseEffect.kind,'adventure');assert.deepEqual(result.funhouseEffect.position,CLUES[0].position);
 assert.throws(()=>f.adventure('inspect',{clueId:CLUES[0].id}),/in order/);assert.equal(trail.score,25);
});

test('all six discoveries complete once, preserve a best score and replay with a fresh identity',()=>{
 const f=fixture(),trail=f.adventure('start').funhouse.adventure,start=trail.startedAt;
 for(let index=0;index<CLUES.length;index++){f.move(CLUES[index].position);f.adventure('inspect',{adventureId:trail.id,clueId:CLUES[index].id},start+(index+1)*90000);}
 assert.equal(trail.status,'complete');assert.equal(trail.settled,true);assert.equal(trail.bonus,60);assert.equal(trail.score,210);
 assert.equal(f.player.score,210);assert.equal(f.player.funhouse.bestScores.adventure,210);assert.equal(trail.found.length,6);assert.match(trail.message,/All six secrets/);
 assert.throws(()=>f.adventure('inspect',{adventureId:trail.id,clueId:CLUES[5].id}),/Start the Lost Laugh Trail/);
 f.step(f.now+1000);f.adventure('stop',{adventureId:trail.id});assert.equal(f.player.score,210);
 const view=playerFunhouseView(f.player);view.adventure.found.push('fake-clue');view.effects['adventure:'+CLUES[0].id].position.x=999;assert.equal(trail.found.length,6);assert.notEqual(f.player.funhouse.effects['adventure:'+CLUES[0].id].position.x,999);
 f.move(START.position);const replay=f.adventure('start').funhouse.adventure;assert.notEqual(replay.id,trail.id);assert.deepEqual(replay.found,[]);
 f.move(CLUES[0].position);assert.throws(()=>f.adventure('inspect',{adventureId:trail.id,clueId:CLUES[0].id}),/no longer available/);assert.equal(replay.clueIndex,0);
});

test('map travel, expiry, disconnection and defeat cancel partial trails without awarding points',()=>{
 for(const reason of ['travel','expiry','disconnect','defeat','world-change']){
  const f=fixture(),trail=f.adventure('start').funhouse.adventure;f.move(CLUES[0].position);f.adventure('inspect',{clueId:CLUES[0].id});assert.equal(trail.score,25);
  if(reason==='travel')cancelFunhouseActivities(f.player,f.now,'Map travel ended the trail.');
  else if(reason==='expiry'){f.player.lastSeen=trail.endsAt;f.step(trail.endsAt);}
  else if(reason==='disconnect')f.step(f.now+15001);
  else if(reason==='defeat'){f.player.health=0;f.step(f.now+500);}
  else f.step(f.now+500,{id:'another-world'});
  assert.equal(trail.status,'cancelled',reason);assert.equal(trail.score,0,reason);assert.equal(trail.settled,false,reason);assert.equal(f.player.score,0,reason);assert.equal(f.player.funhouse.bestScores?.adventure,undefined,reason);
 }
});

test('adventure progress coexists with gallery games, challenges and rides; stopping the trail leaves the seat intact',()=>{
 const f=fixture(),trail=f.adventure('start').funhouse.adventure;
 f.move(station('water').position);f.send('funhouse-start',{stationId:station('water').id});assert.equal(trail.status,'active');
 f.move(station('jackbox').position);f.send('funhouse-challenge',{stationId:station('jackbox').id});assert.equal(trail.status,'active');
 f.move(station('car').position);f.send('funhouse-ride',{stationId:station('car').id});const ride=f.player.funhouse.ride,seat={...f.player.position};assert.equal(trail.status,'active');
 assert.throws(()=>f.adventure('inspect',{clueId:CLUES[0].id}),/Step off/);
 f.adventure('stop',{adventureId:trail.id});assert.equal(trail.status,'cancelled');assert.equal(ride.status,'active');assert.deepEqual(f.player.position,seat);
 assert.throws(()=>f.adventure('start'),/Step off/);assert.equal(ride.status,'active');
 f.send('funhouse-ride-exit',{rideId:ride.id});assert.equal(ride.status,'cancelled');
});

test('shared-room walking reaches an actual clue, command retries discover once, and map travel cancels the trail for free',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'funhouse-adventure-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 let now=100000,request=0,charges=0;const store=new SharedRoomStore(join(directory,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>now,charge:()=>{charges++;throw Error('The adventure is free.');}}),identity={accountId:'explorer',username:'Explorer'};
 const send=(action,fields={})=>{now+=200;return runtime.command(FUNHOUSE_ID,world,identity,{action,requestId:'trail-'+ ++request,...fields});};
 let snapshot=await send('join');const self=snapshot.selfId;
 snapshot=await send('funhouse-adventure',{operation:'start'});const trail=snapshot.players[self].funhouse.adventure,target=CLUES[0].position;
 for(let step=0;step<80;step++){
  const position=snapshot.players[self].position,dx=target.x-position.x,dz=target.z-position.z;if(Math.hypot(dx,dz)<1.4)break;
  snapshot=await send('input',{input:{forward:1,yaw:Math.atan2(-dx,-dz),sprint:true}});
 }
 snapshot=await send('input',{input:{}});assert.ok(funhouseAdventureNear(snapshot.players[self].position,CLUES[0]),'walking must reach the rendered clue without teleporting');
 const fields={operation:'inspect',adventureId:trail.id,clueId:CLUES[0].id,requestId:'discover-once'};
 snapshot=await send('funhouse-adventure',fields);assert.equal(snapshot.players[self].funhouse.adventure.clueIndex,1);
 snapshot=await send('funhouse-adventure',fields);assert.equal(snapshot.players[self].funhouse.adventure.clueIndex,1);assert.equal(snapshot.players[self].funhouse.adventure.score,25);
 snapshot=await send('map-access',{position:START.position});assert.equal(snapshot.players[self].funhouse.adventure.status,'cancelled');assert.equal(snapshot.players[self].score,0);assert.equal(charges,0);
 await store.flush();
});
