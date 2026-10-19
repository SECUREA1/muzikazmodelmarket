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
 assert.match(html,/public\/js\/api-connection.js/);assert.match(html,/id="world-map" data-world-atlas/);assert.match(html,/type="module" src="public\/js\/world-atlas.js"/);assert.ok(!script.includes('function initWorldAtlas()'));
});

test('saved map pins take priority over nearby coordinates and district display names',async()=>{
 const requests=[],inventory={roomSession:async()=>({csrfToken:'proof'}),api:async(path,options)=>{requests.push(path);if(path.startsWith('/api/environments/'))return {id:'saved-builder-map'};assert.equal(path,'/api/world-atlas/pins');const body=JSON.parse(options.body);assert.equal(body.mapId,'saved-builder-map');assert.equal(body.meetingId,'meet-6-8');return {playUrl:'model-explorer.html?environment=saved-builder-map&house=saved-builder-map&meet=meet-6-8'};}};
 const url=await resolveIndexDestination(inventory,{x:37,y:68,place:'Echo Gardens',mapId:'saved-builder-map',playUrl:'model-explorer.html?environment=saved-builder-map&meet=meet-6-8'},{id:'echo-gardens'});
 assert.match(url,/environment=saved-builder-map/);assert.equal(requests.some(path=>path==='/api/world-atlas/resolve'),false);
 await assert.rejects(resolveIndexDestination({api:async()=>{throw Error('Saved map was removed');}},{x:37,y:68,mapId:'deleted-map'}),/removed/);
});
test('atlas pins persist across restart, deduplicate and retain account-specific meeting destinations',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'saved-atlas-pins-'));t.after(()=>rm(dir,{recursive:true,force:true}));const file=join(dir,'atlas.json'),atlas=new WorldAtlas(file),alice={accountId:'alice',username:'Alice'},bob={accountId:'bob',username:'Bob'};
 const first=await atlas.resolve(-2130,2949,alice);await atlas.resolve(-2130,2949,alice);
 let pins=await new WorldAtlas(file).pins(alice);assert.equal(pins.length,1);assert.equal(pins[0].mapId,first.cell.mapId);assert.equal(pins[0].meetingId,first.meeting.id);assert.equal((await atlas.pins(bob)).length,0);
 await atlas.pin(first.cell.mapId,first.meeting.id,bob,{x:37,y:68});assert.equal((await atlas.pins(bob)).length,1);
 await assert.rejects(atlas.pin('missing-map',null,alice),{statusCode:404});await assert.rejects(atlas.pin(first.cell.mapId,'missing-meeting',alice),{statusCode:404});
 await atlas.synchronize([{id:'published-map',name:'Published map',source:'custom-builder',builderScene:{layout:'grand-floor',objects:[]}}]);await atlas.pin('published-map',null,alice,{x:37,y:68});
 pins=await new WorldAtlas(file).pins(alice);assert.equal(pins.length,2);assert.ok(pins.some(pin=>pin.mapId==='published-map'));
 await atlas.synchronize([],{complete:true});assert.ok(!(await atlas.pins(alice)).some(pin=>pin.mapId==='published-map'),'deleted maps leave no dead saved links');
});
