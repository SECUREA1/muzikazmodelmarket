import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';

test('room snapshots share drawn paddles, AI balls, repeat-safe commands and travel cleanup',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'authoritative-ping-pong-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 let now=100000,request=0;
 const store=new SharedRoomStore(join(directory,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>now});
 const world={id:'ping-pong-test',name:'Paddle Park',spawn:{x:0,y:0,z:0},builderScene:{layout:'grand-floor',mapSize:40,objects:[]}},identity={accountId:'a',username:'A',walletId:'a'};
 const send=(action,fields={},requestId='paddle-'+ ++request)=>runtime.command(world.id,world,identity,{action,requestId,...fields});
 const joined=await send('join'),id=joined.selfId;assert.deepEqual(joined.pingPong.balls,[]);
 const drawn=await send('ping-pong',{operation:'equip'});assert.equal(drawn.players[id].pingPong.equipped,true);
 const served=await send('ping-pong',{operation:'serve',targetId:'ai'},'unique-serve');assert.equal(served.pingPong.balls.length,1);assert.equal(served.pingPong.partners.length,1);
 const replay=await send('ping-pong',{operation:'serve',targetId:'ai'},'unique-serve');assert.equal(replay.pingPong.balls[0].id,served.pingPong.balls[0].id);assert.equal(replay.pingPong.balls[0].rally,1);
 for(let index=0;index<20;index++){now+=50;await runtime.snapshot(world.id,world);}
 const returned=await runtime.snapshot(world.id,world);assert.equal(returned.pingPong.balls[0].rally,2);assert.equal(returned.pingPong.balls[0].targetId,id);assert.ok(returned.pingPong.partners[0].pingPong.swingAt>0);
 const other={...world,id:'other-paddle-map'};await runtime.command(other.id,other,identity,{action:'join',requestId:'travel-away',travelFrom:world.id});
 const left=await runtime.snapshot(world.id,world);assert.equal(left.pingPong.balls.length,0);assert.equal(left.pingPong.partners.length,0);
});

test('both live players must draw a paddle and own their server-returned strokes',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'authoritative-ping-pong-human-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 let now=100000,request=0;
 const store=new SharedRoomStore(join(directory,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>now});
 const world={id:'ping-pong-human',spawn:{x:0,y:0,z:0},builderScene:{layout:'grand-floor',mapSize:40,objects:[]}},a={accountId:'a',username:'A',walletId:'a'},b={accountId:'b',username:'B',walletId:'b'};
 const send=(who,action,fields={})=>runtime.command(world.id,world,who,{action,requestId:'human-paddle-'+ ++request,...fields});
 const first=await send(a,'join');await send(b,'join');
 await store.update(world.id,room=>{room.simulation.players['account:b'].position={...room.simulation.players[first.selfId].position,z:-5};room.simulation.players['account:b'].yaw=Math.PI;});
 await send(a,'ping-pong',{operation:'equip'});await assert.rejects(send(a,'ping-pong',{operation:'serve',targetId:'account:b'}),/paddle drawn/);
 await send(b,'ping-pong',{operation:'equip'});await send(a,'ping-pong',{operation:'serve',targetId:'account:b'});
 for(let index=0;index<15;index++){now+=50;await runtime.snapshot(world.id,world);}
 const returned=await send(b,'ping-pong',{operation:'swing',stroke:'backhand',rally:999999,position:{x:999,y:999,z:999}});
 assert.equal(returned.result.hit,true);assert.equal(returned.pingPong.balls[0].rally,2);assert.equal(returned.pingPong.balls[0].targetId,'account:a');assert.equal(returned.pingPong.partners.length,0);
 const stowed=await send(a,'ping-pong',{operation:'stow'});assert.equal(stowed.pingPong.balls.length,0);
});
