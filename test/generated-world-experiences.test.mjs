import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WorldAtlas} from '../world-atlas.mjs';
import {synchronizeWorldDirectory} from '../world-directory.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {createBuilderModel} from '../public/js/builder-models-3d.js';

test('all generated districts have distinct playable experiences and renderable content',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'generated-vibes-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const atlas=new WorldAtlas(join(dir,'atlas.json')),{environments}=await synchronizeWorldDirectory(atlas,[]),names=new Set(),modelIds=new Set();
 for(const world of environments){names.add(world.builderScene.experienceName);const objects=world.builderScene.objects,ids=new Set(objects.map(object=>object.id));assert.equal(ids.size,objects.length);
  for(const object of objects){modelIds.add(object.modelId);const portal=object.functionalSettings.portal;if(portal?.destinationType==='object')assert.ok(ids.has(portal.targetObjectId));if(portal?.destinationType==='map')assert.ok(environments.some(world=>world.id===portal.targetMapId));}
  for(const behavior of ['seat','talk','quest','pickup','heal','switch'])assert.ok(objects.some(object=>object.functionalSettings.behavior===behavior));
 }
 assert.equal(names.size,9,'Commons and all eight districts have their own experience');
 for(const id of modelIds){const model=createBuilderModel(id);assert.ok(model,'model exists: '+id);model.traverse(node=>{node.geometry?.dispose();for(const material of Array.isArray(node.material)?node.material:[node.material])material?.dispose();});}
 const before=await atlas.read();const after=await atlas.synchronize();assert.equal(after.revision,before.revision,'reopening does not duplicate or rebuild unchanged scenery');
});
test('shared park guide, quests, seats, pickups, healing, switches and garden travel operate',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'generated-interactions-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const atlas=new WorldAtlas(join(dir,'atlas.json')),{environments}=await synchronizeWorldDirectory(atlas,[]),world=environments.find(world=>world.id==='public-commons');
 const store=new SharedRoomStore(join(dir,'rooms.json'));let now=100000,request=0;const runtime=new AuthoritativeRooms({store,now:()=>now}),identity={accountId:'visitor',username:'Visitor',stats:{health:100}},actorId='account:visitor';
 const send=(action,fields={})=>runtime.command(world.id,world,identity,{action,requestId:'experience-'+ ++request,...fields});await send('join');
 async function use(name){const entityId='public-experience-'+name,object=world.builderScene.objects.find(object=>object.id===entityId);now+=1000;await store.update(world.id,room=>{room.simulation.players[actorId].position={...object.position,z:object.position.z-1};});return send('interact',{entityId});}
 let state=await use('host');assert.match(state.result.message,/Welcome/);
 state=await use('exploration-journal');assert.equal(state.players[actorId].quests[world.id+'-discovery'],'active');state=await use('exploration-journal');assert.equal(state.players[actorId].quests[world.id+'-discovery'],'complete');
 state=await use('lounge-sofa');assert.equal(state.players[actorId].seatedId,'public-experience-lounge-sofa');await send('interact');
 state=await use('discovery-crystal');assert.ok(state.players[actorId].inventory.includes('treasure-crystal'));await send('drop');
 await store.update(world.id,room=>{room.simulation.players[actorId].health=50;});state=await use('restoration');assert.equal(state.players[actorId].health,75);
 state=await use('garden-switch');assert.equal(state.actors['public-experience-garden-switch'].switched,true);
 state=await use('garden-pad');assert.equal(state.players[actorId].position.z,48);state=await use('return-pad');assert.equal(state.players[actorId].position.z,14);
});
test('destination beacons and route controls enter land instead of only previewing it',async()=>{
 const index=await readFile(new URL('../script.js',import.meta.url),'utf8'),atlas=await readFile(new URL('../public/js/world-atlas.js',import.meta.url),'utf8');
 assert.match(index,/detail: place.dataset.mapDetail \}\);enterSelectedLocation\(event\)/);
 assert.match(atlas,/link.href=target.playUrl/);assert.ok(!atlas.includes('Preview portal to '));
});
