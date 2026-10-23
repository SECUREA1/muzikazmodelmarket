import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {casinoWorld} from '../casino-world.mjs';
import {CASINO_ID,CASINO_STATIONS,CASINO_RESIDENTS} from '../public/js/casino-config.js';
import {isCleanCommonsEnvironment,supportsWorldTools} from '../public/js/rad-tox-rules.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {stepWorldResidents,residentCommand} from '../server-world-residents.mjs';
import {createWorldResident,updateWorldResident} from '../public/js/world-resident-model.js';
import {WorldAtlas} from '../world-atlas.mjs';
import {synchronizeWorldDirectory} from '../world-directory.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {outdoorProfile} from '../public/js/environments/outdoor-scenery.js';

test('casino is a permanent native public destination with connected return gateways',async t=>{
 const world=casinoWorld(),rows=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url)));
 assert.deepEqual(rows.find(row=>row.id===CASINO_ID),world);assert.equal(world.builderScene.layout,'casino');assert.equal(world.casino.currency,'MZK');
 assert.equal(CASINO_STATIONS.filter(s=>s.kind==='slots').length,12);assert.equal(new Set(world.builderScene.objects.map(o=>o.id)).size,world.builderScene.objects.length);
 const dir=await mkdtemp(join(tmpdir(),'casino-directory-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const directory=await synchronizeWorldDirectory(new WorldAtlas(join(dir,'atlas.json')),[]),listed=directory.environments.find(row=>row.id===CASINO_ID);
 assert.ok(listed?.permanent);assert.equal(listed.roomId,CASINO_ID);assert.ok(listed.travelPortals.length>=2);assert.match(listed.playUrl,/model-explorer\.html\?environment=muzikaz-casino/);assert.deepEqual(listed.streets,[]);
 assert.ok(isCleanCommonsEnvironment(listed));assert.equal(supportsWorldTools(listed),false);
 assert.equal(world.indoor,true);assert.equal(world.outdoor,false);assert.equal(outdoorProfile(world),null);assert.equal(outdoorProfile({builderScene:{layout:'casino'}}),null);
});

test('casino has clear public station approaches, solid vault collision and no teleport bypass',()=>{
 const world=casinoWorld(),collision=new ServerBuilderCollision(),spawn=collision.safeSpawn(world,world.spawn);assert.ok(Math.hypot(spawn.x,spawn.z-32)<.01);
 for(const station of CASINO_STATIONS){const point={...station.position};if(station.kind==='slots')point.x+=point.x<0?2.9:-2.9;else if(['vendor','cashier'].includes(station.kind))point.z-=3;else if(station.kind==='atm')point.x-=2;else point.z+=3.7;const floor=collision.groundAt(world,point,{entry:true});assert.ok(floor,station.id+' has a floor');assert.ok(collision.hasBodyClearance(world,floor,.38),station.id+' has a clear approach');}
 let position={x:0,y:spawn.y,z:-20};for(let i=0;i<50;i++)position=collision.resolve(world,position,{...position,z:position.z-.2});assert.ok(position.z>-22.5,'locked safe door stops walking');
 assert.throws(()=>collision.teleportPosition(world,spawn,{x:0,y:spawn.y,z:-30},{},{},{localMap:true}),/vault is locked/);
 const publicFloor=collision.teleportPosition(world,spawn,{x:0,y:spawn.y,z:-19},{},{},{localMap:true});assert.equal(publicFloor.z,-19);
});

test('authored casino cast keeps exactly two guards, grounded dealers, moving guests and contextual conversations',()=>{
 const world=casinoWorld(),collision=new ServerBuilderCollision(),sim={actors:{},players:{},events:[]};stepWorldResidents(sim,world,100000,.1,{collision});
 const cast=Object.values(sim.actors);assert.equal(cast.length,CASINO_RESIDENTS.length);assert.equal(cast.filter(a=>a.resident.duty==='guard').length,2);assert.equal(cast.filter(a=>a.resident.duty==='dealer').length,6);assert.equal(cast.filter(a=>a.resident.duty==='host').length,2);
 const start=Object.fromEntries(cast.map(a=>[a.id,{...a.position}]));let movingGuard=false,movingGuest=false,ambientSpeech=false;
 for(let i=1;i<300;i++){stepWorldResidents(sim,world,100000+i*250,.25,{collision});for(const npc of Object.values(sim.actors)){const moved=Math.hypot(npc.position.x-start[npc.id].x,npc.position.z-start[npc.id].z)>.5;if(moved&&npc.resident.duty==='guard')movingGuard=true;if(moved&&npc.resident.duty==='guest')movingGuest=true;if(npc.resident.speech)ambientSpeech=true;assert.ok(Math.abs(npc.position.y-.02)<.01,'resident stays on the floor');}}
 assert.ok(movingGuard);assert.ok(movingGuest);assert.ok(ambientSpeech);assert.equal(Object.values(sim.actors).filter(a=>a.resident.duty==='guard').length,2);
 const cashier=sim.actors['casino-resident-cashier'],player=sim.players.alice={actorId:'alice',username:'Alice',health:100,lastSeen:180000,position:{...cashier.position},score:0};
 residentCommand(sim,player,world,{entityId:cashier.id,choice:'question'},180000,{collision});assert.match(player.npcConversation.conversation.at(-1).text,/MZK wallet/);assert.equal(player.npcConversation.dialogueChoices.some(choice=>choice.id==='accept'),false);assert.throws(()=>residentCommand(sim,player,world,{entityId:cashier.id,choice:'accept'},182000,{collision}),/daily reward objectives are unavailable/);assert.equal(player.residentTask,undefined);assert.equal(player.score,0);
 const model=createWorldResident();for(const prop of ['cards','chips','dice','tray'])assert.ok(model.getObjectByName(prop));model.userData.residentState={...cashier.resident,phase:'playing',gesture:'deal',prop:'cards'};updateWorldResident(model,3);assert.ok(model.getObjectByName('cards').visible);assert.notEqual(model.getObjectByName('RESIDENT_LEFT_ARM').rotation.x,0);model.traverse(node=>{node.geometry?.dispose();for(const material of [].concat(node.material||[]))material.dispose?.();});
});

test('shared casino joins without combat, loot or free coin machines and rejects map travel into the vault',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'casino-room-'));t.after(()=>rm(dir,{recursive:true,force:true}));let now=100000,request=0;
 const world=casinoWorld(),store=new SharedRoomStore(join(dir,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>now}),identity={accountId:'casino-visitor',username:'Visitor'},send=(action,fields={})=>{now+=1000;return runtime.command(world.id,world,identity,{action,requestId:'casino-world-'+ ++request,...fields});};
 const state=await send('join');assert.equal(state.radTox,null);assert.equal(state.match,null);assert.ok(!Object.values(state.actors).some(actor=>actor.radTox||actor.loot||actor.runtimeMachine||actor.roadFleet));assert.ok(Object.values(state.actors).filter(actor=>actor.trafficAI).every(actor=>actor.resident?.casino));assert.equal(Object.values(state.actors).filter(actor=>actor.resident?.duty==='guard').length,2);
 await assert.rejects(send('map-access',{position:{x:0,z:-30}}),/vault is locked/);
 const arrival=await send('map-access',{position:{x:0,z:-19}});assert.equal(arrival.players['account:casino-visitor'].position.z,-19);
});
