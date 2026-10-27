import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {FUNHOUSE_ID,FUNHOUSE_STATIONS} from '../public/js/clown-funhouse-config.js';

const station=kind=>FUNHOUSE_STATIONS.find(value=>value.kind===kind);
const world={id:FUNHOUSE_ID,name:'Midnight Laughs Funhouse',game:'funhouse',proceduralLand:true,spawn:{x:0,y:.02,z:48},builderScene:{version:3,layout:'grand-floor',mapSize:120,objects:[],layoutMeta:{locations:[]},gameplay:{radTox:false}},streets:[]};

for(const kind of ['car','spinner'])test(`${kind} ride stays seated under walking and jump input, then exits and cancels on travel`,async t=>{
 const directory=await mkdtemp(join(tmpdir(),'funhouse-ride-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 let now=100000,request=0;
 const store=new SharedRoomStore(join(directory,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>now}),identity={accountId:'rider',username:'Rider'};
 const send=(action,fields={})=>runtime.command(FUNHOUSE_ID,world,identity,{action,requestId:'ride-'+ ++request,...fields});
 let snapshot=await send('join');const self=snapshot.selfId,approach=station(kind);
 await send('map-access',{position:approach.position});
 snapshot=await send('funhouse-ride',{stationId:approach.id});
 const ride=snapshot.players[self].funhouse.ride,initial={...ride.pose.position};
 assert.equal(ride.status,'active');
 for(let step=0;step<5;step++){
  await send('input',{input:{forward:1,side:1,jump:true,sprint:true,yaw:2}});now+=150;
  snapshot=await runtime.snapshot(FUNHOUSE_ID,world);
  const player=snapshot.players[self];
  assert.deepEqual(player.position,player.funhouse.ride.pose.position,'walking physics cannot move the seated rider');
  const internal=await runtime.player(FUNHOUSE_ID,self);assert.equal(internal.velocityY,0);assert.equal(internal.grounded,true);assert.deepEqual(internal.input,{});
 }
 if(kind==='spinner')assert.ok(Math.hypot(snapshot.players[self].position.x-initial.x,snapshot.players[self].position.z-initial.z)>.5,'spinner advances its authoritative seat');
 snapshot=await send('funhouse-ride-exit',{rideId:ride.id});
 assert.equal(snapshot.players[self].funhouse.ride.status,'cancelled');
 assert.deepEqual(snapshot.players[self].position,approach.position);
 assert.deepEqual((await runtime.player(FUNHOUSE_ID,self)).input,{});
 snapshot=await send('funhouse-ride',{stationId:approach.id});
 assert.equal(snapshot.players[self].funhouse.ride.status,'active');
 snapshot=await send('map-access',{position:station('welcome').position});
 assert.equal(snapshot.players[self].funhouse.ride.status,'cancelled');
 assert.ok(Math.hypot(snapshot.players[self].position.x-approach.position.x,snapshot.players[self].position.z-approach.position.z)>10);
 assert.deepEqual((await runtime.player(FUNHOUSE_ID,self)).input,{});
 await store.flush();
});
