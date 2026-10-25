import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {atlasPercentPoint,resolveIndexDestination} from '../public/js/index-atlas-travel.js';
import {atlasTravelDestination,atlasMeetingDestination} from '../public/js/atlas-travel.js';
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

test('optional pin failures never prevent a confirmed saved destination from opening',async()=>{
 for(const failure of ['session','pin'])for(const status of [401,403,404,500]){
  const inventory={
   roomSession:async options=>{assert.equal(options.timeout,1500);if(failure==='session')throw Object.assign(Error('Session unavailable'),{status});return {csrfToken:'proof'};},
   api:async(path,options)=>{if(path.startsWith('/api/environments/'))return {id:'live-map',playUrl:'model-explorer.html?environment=live-map&mode=solo'};assert.equal(options.timeout,1500);throw Object.assign(Error('Pin unavailable'),{status});}
  };
  const url=new URL(await resolveIndexDestination(inventory,{mapId:'live-map',meetingId:'meet-2-4',x:20,y:40}),'https://world.example/');
  assert.equal(url.searchParams.get('environment'),'live-map');assert.equal(url.searchParams.get('meet'),'meet-2-4');assert.equal(url.searchParams.get('mode'),'solo');
 }
});

test('atlas and saved-index travel retain the canonical game page and meeting instead of a pin redirect',async()=>{
 for(const page of ['hockey','arcade','model-explorer']){
  const playUrl=page+'.html?environment=game-map&house=game-map&mode=solo&meet=meet-6-8';
  const inventory={roomSession:async()=>({csrfToken:'proof'}),api:async path=>path.startsWith('/api/environments/')?{id:'game-map',playUrl}:{playUrl:'model-explorer.html?environment=wrong-map'}};
  assert.equal(await atlasTravelDestination(inventory,playUrl,{mapId:'game-map',meetingId:'meet-6-8'}),playUrl);
  const meetingUrl=new URL(atlasMeetingDestination(playUrl,'game-map','meet-4-2'),'https://world.example/');
  assert.equal(meetingUrl.pathname,'/'+page+'.html');assert.equal(meetingUrl.searchParams.get('meet'),'meet-4-2');assert.equal(meetingUrl.searchParams.get('mode'),'solo');
  const url=new URL(await resolveIndexDestination(inventory,{mapId:'game-map',meetingId:'meet-6-8',x:50,y:50}),'https://world.example/');
  assert.equal(url.pathname,'/'+page+'.html');assert.equal(url.searchParams.get('environment'),'game-map');assert.equal(url.searchParams.get('meet'),'meet-6-8');assert.equal(url.searchParams.get('mode'),'solo');
 }
});

test('server atlas pins and coordinate meetings preserve each destination game route across reloads',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'atlas-game-route-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const file=join(dir,'atlas.json'),atlas=new WorldAtlas(file),identity={accountId:'alice',username:'Alice'};
 for(const page of ['hockey','arcade']){
  const id=page+'-map';await atlas.synchronize([{id,name:id,playUrl:page+'.html?environment='+id+'&attraction=game&mode=solo',roomId:id,visibility:'public'}]);
  const cell=Object.values((await atlas.read()).cells).find(cell=>cell.mapId===id);
  const resolved=await atlas.resolve(cell.column*256,cell.row*256,identity);
  const pin=await new WorldAtlas(file).pin(id,resolved.meeting.id,identity);
  for(const playUrl of [resolved.playUrl,pin.playUrl]){
   const url=new URL(playUrl,'https://world.example/');assert.equal(url.pathname,'/'+page+'.html');assert.equal(url.searchParams.get('environment'),id);assert.equal(url.searchParams.get('meet'),resolved.meeting.id);assert.equal(url.searchParams.get('attraction'),'game');assert.equal(url.searchParams.get('mode'),'solo');
  }
 }
});

test('pins use native game routes before directory metadata has added a play URL',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'atlas-native-route-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const atlas=new WorldAtlas(join(dir,'atlas.json')),identity={accountId:'alice',username:'Alice'};
 for(const [id,page,layout]of [['custom-hockey','hockey','hockey-arena'],['custom-arcade','arcade','arcade-park']]){
  const {environments}=await synchronizeWorldDirectory(atlas,[{id,name:id,source:'custom-builder',builderScene:{layout,objects:[],gameplay:{multiplayer:false}}}]);
  const map=environments.find(map=>map.id===id),pin=await atlas.pin(id,null,identity);
  assert.equal(new URL(pin.playUrl,'https://world.example/').pathname,'/'+page+'.html');
  assert.equal(new URL(pin.playUrl,'https://world.example/').searchParams.get('mode'),'solo');
  assert.equal(new URL(pin.playUrl,'https://world.example/').searchParams.get('environment'),map.id);
 }
});
