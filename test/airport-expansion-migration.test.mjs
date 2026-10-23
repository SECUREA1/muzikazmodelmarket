import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {airportWorld} from '../airport-world.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';

test('saved airport rooms receive the mountain expansion while retaining player progress',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'airport-expansion-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const before=airportWorld();delete before.contentUpdatedAt;
 before.builderScene.mapSize=1024;
 before.airport.runways=before.airport.runways.filter(strip=>strip.id!=='mountain-runway');
 before.builderScene.objects=before.builderScene.objects.filter(object=>!object.id.startsWith('airport-alpine-')&&!object.id.startsWith('airport-mountain-'));
 const store=new SharedRoomStore(join(directory,'rooms.json')),rooms=new AuthoritativeRooms({store,now:()=>100000}),identity={accountId:'returning-pilot',username:'Returning pilot'},actorId='account:'+identity.accountId;
 await rooms.command(before.id,before,identity,{action:'join',requestId:'airport-before-expansion'});
 await store.update(before.id,room=>{const player=room.simulation.players[actorId];player.score=321;player.quests['prior-discovery']='complete';});
 const after=airportWorld(),snapshot=await rooms.snapshot(after.id,after);
 assert.ok(snapshot.actors['airport-alpine-trail-explorer'],'new campsite quest is seeded into an existing room');
 assert.ok(snapshot.actors['airport-mountain-runway-surface-0'],'new runway is seeded into an existing room');
 assert.ok(snapshot.actors['airport-flight-1'],'the original aircraft identity remains');
 assert.equal(snapshot.players[actorId].score,321);assert.equal(snapshot.players[actorId].quests['prior-discovery'],'complete');
 assert.ok(snapshot.sceneVersion.includes(after.contentUpdatedAt));
});
