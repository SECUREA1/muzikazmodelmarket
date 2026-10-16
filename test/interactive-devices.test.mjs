import {GAME_ECONOMY,ownsEconomyItem} from '../game-economy.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {INTERACTIVE_DEVICES,sharedMediaUrl,deviceTime} from '../public/js/interactive-devices.js';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
import {createUrbanScene} from '../public/js/urban-sandbox.js';
import {compileBuilderScene} from '../public/js/builder-gameplay-pipeline.js';
import {deviceCommand,pokerPayout,advanceDevicePlayback} from '../server-interactive-devices.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
const fixture=(modelId='shared-video-player')=>{const scene={objects:[{id:'device',modelId,position:{x:0,y:0,z:0},functionalSettings:{behavior:'interact'}}]},manifest=compileBuilderScene(scene);return {manifest,sim:{actors:{device:{id:'device',active:true,position:{x:0,y:0,z:0}}}},player:{username:'Alice',position:{x:0,y:0,z:2},score:0,tokens:{MZK:100}}};};
test('twenty-seven devices have actual meshes, builder/backpack entries and a playable lounge',async()=>{
 assert.equal(Object.keys(INTERACTIVE_DEVICES).length,27);const backpack=JSON.parse(await readFile('public/models/backpack-assets.json','utf8'));
 for(const [id,profile]of Object.entries(INTERACTIVE_DEVICES)){const root=createBuilderModel(id);assert.equal(root.name,profile.name);assert.ok(root.children.length>=5);const asset=backpack.assets.find(asset=>asset.buildAssetId===id);assert.ok(asset);await readFile('.'+asset.thumbnailUrl);}
 const scene=createUrbanScene('urban-media-lounge',80),manifest=compileBuilderScene(scene);assert.equal(scene.objects.filter(item=>INTERACTIVE_DEVICES[item.modelId]).length,27);assert.equal(manifest.actors.filter(actor=>actor.gameplay.behavior==='interact').length,27);
});
test('shared queue, revision checks, timestamps and pause/play are authoritative for multiple users',()=>{
 const {manifest,sim,player}=fixture(),run=(operation,fields={},now=1000)=>deviceCommand(sim,manifest,player,'alice',{entityId:'device',operation,revision:sim.devices?.device?.revision||0,requestId:'request-'+now,...fields},now);
 run('open');run('enqueue',{url:'https://media.example/movie.mp4',title:'Movie'},1000);assert.equal(deviceTime(sim.devices.device,4500),3.5);run('pause',{},4500);assert.equal(deviceTime(sim.devices.device,9000),3.5);run('play',{},9000);assert.equal(deviceTime(sim.devices.device,11000),5.5);
 run('enqueue',{url:'/uploads/media/abc-123.webm',title:'Next'},11000);assert.equal(sim.devices.device.queue.length,1);run('next',{},12000);assert.equal(sim.devices.device.current.title,'Next');assert.equal(deviceTime(sim.devices.device,12000),0);
 assert.throws(()=>run('pause',{revision:0},13000),/changed/);player.position.x=30;assert.throws(()=>run('pause',{},14000),/reach/);
});
test('media accepts direct HTTPS and uploaded files while rejecting unsupported and unsafe schemes',()=>{
 for(const url of ['javascript:alert(1)','data:video/mp4,x','http://example.com/v.mp4','https://user:secret@example.com/v.mp4','/uploads/media/../private.mp4','https://example.com/page.html'])assert.throws(()=>sharedMediaUrl(url,'video'));
 assert.equal(sharedMediaUrl('https://example.com/v.mp4?signature=abc','video'),'https://example.com/v.mp4?signature=abc');assert.equal(sharedMediaUrl('/uploads/media/file-123.mp3','audio'),'/uploads/media/file-123.mp3');
});
test('slots, poker, trivia and noticeboard have distinct server actions without touching wallet balances',()=>{
 for(const [modelId,operation,fields]of [['arcade-slot-machine','spin',{}],['video-poker-table','deal',{}],['trivia-terminal','answer',{answer:1}],['community-noticeboard','post',{text:'Meet at the cinema'}]]){
 const {manifest,sim,player}=fixture(modelId);deviceCommand(sim,manifest,player,'alice',{entityId:'device',operation:'open'},10000);deviceCommand(sim,manifest,player,'alice',{entityId:'device',operation,revision:0,...fields},10000);assert.equal(player.tokens.MZK,100);assert.equal(player.score,0);
 const state=sim.devices.device;if(modelId==='video-poker-table'){const hand=state.gamers.alice.hand;assert.equal(new Set(hand).size,5);deviceCommand(sim,manifest,player,'alice',{entityId:'device',operation:'draw',holds:[0,2],revision:1},12000);assert.equal(state.gamers.alice.hand[0],hand[0]);assert.equal(state.gamers.alice.hand[2],hand[2]);assert.equal(state.gamers.alice.phase,'result');}if(modelId==='trivia-terminal')assert.equal(state.gamers.alice.correct,true);if(modelId==='community-noticeboard')assert.equal(state.text,'Meet at the cinema');
 }
 assert.equal(pokerPayout([8,9,10,11,12]),250);assert.equal(pokerPayout([0,13,26,39,8]),25);assert.equal(pokerPayout([0,13,26,1,14]),9);
});
test('room interaction opens devices and shared media survives server-store reload',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'devices-'));t.after(()=>rm(dir,{recursive:true,force:true}));const store=new SharedRoomStore(join(dir,'rooms.json'));let now=100000;const rooms=new AuthoritativeRooms({store,now:()=>now}),environment={id:'media',proceduralLand:true,spawn:{x:0,y:0,z:2},builderScene:{layout:'urban-downtown',mapSize:80,objects:[{id:'screen',modelId:'shared-video-player',position:{x:0,y:0,z:0},functionalSettings:{behavior:'interact',interactionDistance:5}}]}},identity={accountId:'alice',username:'Alice'};
 const send=(action,requestId,extra={})=>rooms.command('media',environment,identity,{action,requestId,...extra});await send('join','join');const open=await send('interact','open',{entityId:'screen'});assert.equal(open.result.deviceKind,'video');await send('device','queue',{entityId:'screen',operation:'enqueue',revision:0,url:'https://media.example/clip.mp4'});
 now+=500;const state=await new AuthoritativeRooms({store:new SharedRoomStore(store.file),now:()=>now}).snapshot('media',environment);assert.equal(state.devices.screen.current.url,'https://media.example/clip.mp4');assert.equal(state.devices.screen.playing,true);assert.equal(state.devices.screen.revision,1);
});

test('media duration advances a shared queue on the server without an active controller',()=>{const {manifest,sim,player}=fixture();deviceCommand(sim,manifest,player,'alice',{entityId:'device',operation:'open'},1000);deviceCommand(sim,manifest,player,'alice',{entityId:'device',operation:'enqueue',revision:0,requestId:'first',url:'https://media.example/a.mp4'},1000);deviceCommand(sim,manifest,player,'alice',{entityId:'device',operation:'duration',revision:1,mediaId:'first',duration:10},1000);deviceCommand(sim,manifest,player,'alice',{entityId:'device',operation:'enqueue',revision:2,requestId:'second',url:'https://media.example/b.mp4'},1000);advanceDevicePlayback(sim,11001);assert.equal(sim.devices.device.current.id,'second');assert.equal(sim.devices.device.offset,0);assert.equal(sim.devices.device.playing,true);assert.equal(sim.devices.device.revision,4);});

test('interactive devices use existing purchase ownership and spawned devices retain their controls',async t=>{
 for(const id of Object.keys(INTERACTIVE_DEVICES)){const item=GAME_ECONOMY.find(item=>item.buildAssetId===id);assert.ok(item);assert.equal(ownsEconomyItem({items:[]},item),false);assert.equal(ownsEconomyItem({items:[{economySku:item.sku}]},item),true);}
 const dir=await mkdtemp(join(tmpdir(),'device-spawn-'));t.after(()=>rm(dir,{recursive:true,force:true}));const item=GAME_ECONOMY.find(item=>item.buildAssetId==='media-boombox'),store=new SharedRoomStore(join(dir,'rooms.json')),rooms=new AuthoritativeRooms({store,now:()=>100000,resolveAsset:async()=>item}),environment={id:'spawn-device',proceduralLand:true,builderScene:{layout:'urban-downtown',mapSize:80,objects:[]}},identity={accountId:'alice',username:'Alice'},send=(action,requestId,extra={})=>rooms.command(environment.id,environment,identity,{action,requestId,...extra});await send('join','join');const spawned=await send('spawn','spawn',{placement:{position:[2,0,3],rotation:[0,0,0],scale:[1,1,1]}});const used=await send('interact','use',{entityId:spawned.result.spawnedId});assert.equal(used.result.deviceKind,'audio');assert.ok(used.devices[spawned.result.spawnedId]);
});
