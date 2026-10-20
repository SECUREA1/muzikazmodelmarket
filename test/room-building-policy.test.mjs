import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {buildingPolicy,changeBuildingPolicy} from '../public/js/room-building-policy.js';
import {sportsBuildingAccess} from '../sports-building-access.mjs';
test('building defaults to allowed and only the host can change restrictions',()=>{
 const room={};assert.equal(buildingPolicy(room).enabled,true);room.building={enabled:true,hostId:'host'};
 assert.throws(()=>changeBuildingPolicy(room,'other',false),{statusCode:403});
 changeBuildingPolicy(room,'host',false);assert.equal(buildingPolicy(room).enabled,false);
 assert.throws(()=>changeBuildingPolicy(room,'host','yes'),{statusCode:400});
});
test('paused rooms reject placements before charging, retain objects and allow owner removal',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'build-policy-'));t.after(()=>rm(dir,{recursive:true,force:true}));const file=join(dir,'rooms.json'),store=new SharedRoomStore(file);
 const object={materialId:'studs',position:[0,.6,0],rotation:[0,0,0],scale:[1,1,1]};let charges=0;
 await store.mutate('court','host',{id:'one',revision:0,object},()=>charges++);
 await store.update('court',room=>{room.building={enabled:false,hostId:'host'};});
 await assert.rejects(store.mutate('court','host',{id:'two',revision:0,object},()=>charges++),{statusCode:403});assert.equal(charges,1);
 assert.equal((await new SharedRoomStore(file).get('court')).building.enabled,false);
 await store.mutate('court','host',{id:'one',revision:1,action:'delete'});assert.equal((await store.get('court')).objects.one.deleted,true);
});
test('the first room participant can toggle building and other participants cannot',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'build-host-'));t.after(()=>rm(dir,{recursive:true,force:true}));const store=new SharedRoomStore(join(dir,'rooms.json')),runtime=new AuthoritativeRooms({store}),env={id:'room',proceduralLand:true,builderScene:{layout:'urban-downtown',mapSize:80,objects:[]}};
 const host={accountId:'a',username:'A'},other={accountId:'b',username:'B'};let n=0;const send=(identity,action,fields={})=>runtime.command('room',env,identity,{action,requestId:'r'+(++n),radToxEnabled:false,...fields});
 await send(host,'join');await send(other,'join');await assert.rejects(send(other,'building-settings',{enabled:false}),{statusCode:403});
 const changed=await send(host,'building-settings',{enabled:false});assert.equal(changed.building.enabled,false);assert.equal(changed.building.hostId,'account:a');await assert.rejects(send(other,'spawn'),{statusCode:403});
});
test('native sports building requires current match membership without granting sports actions',()=>{
 const hockey={seen:new Map([['a',1000]]),state:{host:'a',players:[{human:'a',x:2,z:3}]}},arcade={host:'b',members:new Map([['b',{at:1000,role:'spectator'}]])};
 assert.deepEqual(sportsBuildingAccess(hockey,null,'a',1100),{hostId:'a',position:{x:2,y:0,z:3}});
 assert.equal(sportsBuildingAccess(hockey,arcade,'stranger',1100),null);assert.equal(sportsBuildingAccess(hockey,null,'a',20000),null);
 assert.deepEqual(sportsBuildingAccess(null,arcade,'b',1100),{hostId:'b',position:null});
});
