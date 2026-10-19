import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import * as THREE from '../public/vendor/three/three.module.min.js';
test('server room controls movement, interactions, health, cooldowns, replay and durable state',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'authoritative-room-'));let now=100000;const charged=[],recorded=[],rewards=[];
 try{const store=new SharedRoomStore(join(dir,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>now,charge:async(...args)=>charged.push(args),telemetry:async(...args)=>recorded.push(args),reward:async(...args)=>rewards.push(args)});
 const map={id:'test',updatedAt:'v1',spawn:{x:0,y:0,z:0},builderScene:{layout:'grand-floor',objects:[{id:'door',modelId:'door',position:{x:1,y:0,z:0},functionalSettings:{behavior:'door'}},{id:'enemy',modelId:'enemy',position:{x:0,y:0,z:-4},functionalSettings:{behavior:'hostile',health:100,damage:10}}]}};
 const identity={accountId:'alice',username:'Alice',walletId:'alice-wallet',stats:{health:100}};
 const send=(action,extra={},requestId='command-'+now)=>runtime.command('test',map,identity,{action,requestId,...extra});
 await assert.rejects(send('fire',{tool:'laser',direction:[0,0,-1]}),{statusCode:409});
 let state=await send('join');assert.equal(state.authoritative,true);assert.equal(state.players['account:alice'].username,'Alice');
 await send('input',{input:{side:1,yaw:0,position:{x:99999},health:0}},'input-1');now+=250;
 state=await runtime.snapshot('test',map);assert.equal(state.players['account:alice'].position.x,1);assert.equal(state.players['account:alice'].health,100);
 await send('input',{input:{}},'input-stop');await send('interact',{},'door-on');assert.equal((await runtime.snapshot('test',map)).actors.door.open,true);
 await send('fire',{tool:'laser',direction:[-.25,0,-1]},'shot-1');await send('fire',{tool:'laser',direction:[-.25,0,-1]},'shot-1');assert.equal(charged.length,1);
 await assert.rejects(send('fire',{tool:'laser',direction:[0,0,-1]},'shot-too-soon'),{statusCode:429});now+=500;await send('fire',{tool:'laser',direction:[-.25,0,-1]},'shot-2');assert.equal(charged.length,2);
 assert.equal((await new AuthoritativeRooms({store:new SharedRoomStore(store.file),now:()=>now}).snapshot('test',map)).actors.door.open,true);
 assert.ok(recorded.every(([,sample])=>sample.health===100));assert.ok(rewards.length>0);
 await assert.rejects(send('client-health',{health:1000},'spoof'),{statusCode:422});
 await runtime.care('account:alice',{id:'care-1',effect:{stat:'health',amount:35}});await runtime.care('account:alice',{id:'care-1',effect:{stat:'health',amount:35}});assert.equal((await runtime.player('test','account:alice')).careReceipts.length,1);
 now+=20000;await assert.rejects(send('input',{input:{}},'expired'),{statusCode:409});
 assert.equal((await runtime.snapshot('other',{id:'other',spawn:{x:0,y:0,z:0}})).players['account:alice'],undefined);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('multiplayer wall sliding exposes trusted contacts without leaking collision metadata into positions',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'authoritative-wall-'));let now=100000,sequence=0;
 const store=new SharedRoomStore(join(dir,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>now});
 const map={id:'contact-room',spawn:{x:0,y:0,z:.7},builderScene:{layout:'grand-floor',mapSize:40,objects:[]}};
 const root=new THREE.Group(),floor=new THREE.Mesh(new THREE.BoxGeometry(30,.2,30),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));floor.name='BUILDER_WALKABLE_FLOOR_grand-floor';floor.position.y=-.1;root.add(floor);root.updateMatrixWorld(true);
 runtime.collision.cache.set(map.id+':',{root,glb:false,floors:[floor],walls:[],bounds:new THREE.Box3().setFromObject(root)});
 const identity={accountId:'alice',username:'Alice',stats:{health:100}},send=input=>runtime.command(map.id,map,identity,{action:'input',requestId:'wall-'+(++sequence),input});
 try{
  await runtime.command(map.id,map,identity,{action:'join',requestId:'join-wall'});
  await store.update(map.id,room=>{room.objects.wall={materialId:'wall',position:[0,1.2,0],rotation:[0,0,0],scale:[5,1,1]};});
  let state;
  for(let tick=0;tick<20;tick++){now+=50;state=await send({forward:1,side:1,yaw:0});}
  const self=state.players['account:alice'];
  assert.ok(self.position.x>2,'diagonal input preserves travel along a placed wall');
  assert.ok(self.position.z>=.399,'the capsule stays outside the physical wall');
  assert.ok(self.collisionNormals.some(normal=>normal.z>.9),'snapshots expose the outward wall contact for camera prediction');
  assert.equal('collisionNormals' in self.position,false);assert.equal('ceilingY' in self.position,false);
  for(let tick=0;tick<4;tick++){now+=50;state=await send({forward:-1,yaw:0});}
  assert.ok(state.players['account:alice'].position.z>.7,'turning away releases the wall');
  assert.deepEqual(state.players['account:alice'].collisionNormals,[]);
 }finally{floor.geometry.dispose();floor.material.dispose();await rm(dir,{recursive:true,force:true});}
});
