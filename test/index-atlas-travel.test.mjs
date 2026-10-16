import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {atlasPercentPoint,resolveIndexDestination} from '../public/js/index-atlas-travel.js';
import {WorldAtlas} from '../world-atlas.mjs';
import {synchronizeWorldDirectory} from '../world-directory.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
test('custom index position resolves and joins its actual hosted map meeting point',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'index-atlas-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const atlas=new WorldAtlas(join(dir,'atlas.json')),identity={accountId:'guest-1',username:'Guest'};
 let resolved;
 const inventory={roomSession:async()=>({csrfToken:'proof'}),api:async(path,options)=>{assert.equal(path,'/api/world-atlas/resolve');assert.equal(options.headers['X-CSRF-Token'],'proof');const {x,z}=JSON.parse(options.body);resolved=await atlas.resolve(x,z,identity);return resolved;}};
 const url=new URL(await resolveIndexDestination(inventory,{x:37,y:68}), 'https://world.example/');
 assert.equal(url.searchParams.get('environment'),resolved.cell.mapId);assert.equal(url.searchParams.get('meet'),resolved.meeting.id);assert.notEqual(resolved.cell.mapId,'public-commons');
 const directory=await synchronizeWorldDirectory(atlas,[]),world=directory.environments.find(map=>map.id===resolved.cell.mapId);assert.ok(world.builderScene.objects.length>0);
 const runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(dir,'rooms.json'))});
 const state=await runtime.command(world.id,world,identity,{action:'join',requestId:'join-point',meetingId:resolved.meeting.id});
 const player=state.players['account:guest-1'];assert.ok(Math.hypot(player.position.x-resolved.meeting.position.x,player.position.z-resolved.meeting.position.z)<=12,'arrival uses selected meeting instead of default spawn');
});
test('named districts open without a deed lookup and failed resolution never invents a spawn',async()=>{
 const url=await resolveIndexDestination({}, {},{id:'echo-gardens'});assert.match(url,/environment=world-district-echo-gardens/);
 await assert.rejects(resolveIndexDestination({roomSession:async()=>({}),api:async()=>({})},{x:37,y:68}),/not confirmed/);
 assert.deepEqual(atlasPercentPoint({x:50,y:50}),{x:0,z:0});assert.throws(()=>atlasPercentPoint({x:'oops',y:20}));
});
test('index uses live destination controls and shared API connection',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8'),script=await readFile(new URL('../script.js',import.meta.url),'utf8');
 assert.match(html,/public\/js\/api-connection.js/);assert.match(script,/resolveIndexDestination\(inventory,chosen,asset\)/);assert.match(script,/mountWorldAtlas\(liveDirectory\)/);assert.ok(!script.includes("assetAction.textContent = 'Browse world market'"));
});
