import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {airportWorld} from '../airport-world.mjs';
import {createBuilderLand} from '../public/js/environments/builder-land.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {createBuilderModel} from '../public/js/builder-models-3d.js';

test('native Alpine mountains have grounded pointed ridges, a broad snowy summit and a reusable catalog entry',async()=>{
 const mountain=createBuilderModel('alpine-mountain'),bounds=new THREE.Box3().setFromObject(mountain),size=bounds.getSize(new THREE.Vector3());
 assert.ok(mountain.userData.alpineMountain);assert.equal(mountain.userData.modelId,'alpine-mountain');
 assert.equal(bounds.min.y,0);assert.deepEqual(size.toArray(),[6,5,5.5]);
 let triangles=0,meshes=0;
 mountain.traverse(node=>{if(!node.isMesh)return;meshes++;triangles+=(node.geometry.index?.count||node.geometry.attributes.position.count)/3;assert.ok([...node.geometry.attributes.position.array].every(Number.isFinite));});
 assert.equal(meshes,2);assert.ok(triangles>120&&triangles<=3500,'detailed rock and snow remain within two draw calls and a bounded geometry budget');
 const snow=mountain.getObjectByName('ALPINE_SNOW_CAP'),snowBounds=new THREE.Box3().setFromObject(snow),snowSize=snowBounds.getSize(new THREE.Vector3());
 assert.ok(snow.userData.alpineSnow);assert.ok(snowBounds.min.y>=2.9&&snowBounds.min.y<3.1,'snow starts near the upper third');
 assert.equal(snowBounds.max.y,5);assert.ok(snowSize.x>2.7&&snowSize.z>2.4&&snowSize.y>1.8,'snow covers a broad part of the upper mountain');
 const summitVertices=[];mountain.traverse(node=>{if(!node.isMesh)return;const positions=node.geometry.attributes.position;for(let i=0;i<positions.count;i++)if(positions.getY(i)>4.8)summitVertices.push([positions.getX(i),positions.getZ(i)]);});
 assert.ok(summitVertices.length>0);assert.ok(summitVertices.every(([x,z])=>Math.abs(x+.3)<.001&&Math.abs(z+.1)<.001),'the silhouette ends in a pointed summit');
 const catalog=JSON.parse(await readFile(new URL('../public/models/backpack-assets.json',import.meta.url))),record=catalog.assets.find(asset=>asset.buildAssetId==='alpine-mountain');
 assert.equal(record.format,'procedural-3d');assert.equal(record.builderCategory,'terrain');assert.deepEqual(record.dimensions,[6,5,5.5]);
 const thumbnail=await readFile(new URL('..'+record.thumbnailUrl,import.meta.url),'utf8');assert.match(thumbnail,/<title[^>]*>Alpine Snow Mountain<\/title>/);assert.match(thumbnail,/<desc/);
 const peaks=airportWorld().builderScene.objects.filter(object=>object.modelId==='alpine-mountain');assert.equal(peaks.length,6);assert.ok(peaks.every(peak=>peak.position.y===0&&peak.scale.y*size.y<110));
 mountain.traverse(node=>{node.geometry?.dispose();for(const material of Array.isArray(node.material)?node.material:[node.material])material?.dispose();});
});

test('the expanded airport has rendered ground and collision floors below the remote mountain fly-in',()=>{
 const world=airportWorld(),land=createBuilderLand(world),floor=land.children.find(node=>node.name==='BUILDER_WALKABLE_FLOOR_grand-floor');
 assert.ok(floor);
 const bounds=new THREE.Box3().setFromObject(floor);
 assert.equal(bounds.min.x,-1000);assert.equal(bounds.max.x,1000);
 assert.equal(bounds.min.z,-1000);assert.equal(bounds.max.z,1000);
 assert.ok(floor.geometry.attributes.position.count<=161*161,'world expansion keeps the terrain geometry budget bounded');
 for(const object of world.builderScene.objects)for(const scale of Object.values(object.scale||{}))assert.ok(Number.isFinite(scale)&&Math.abs(scale)<=20,object.id+' stays within the renderer scale limit');
 const collision=new ServerBuilderCollision();
 for(const [name,x,z]of [['mountain apron',599,-500],['camp trail',532,-460],['tent entrance',495.4,-425],['lookout',462,-520],['rest cabin approach',504,-568]]){
  const ground=collision.groundAt(world,{x,y:0,z});assert.ok(ground,name+' has ground');assert.ok(ground.y>=0&&ground.y<.4,name+' uses the valley floor');
 }
 land.traverse(node=>{node.geometry?.dispose();for(const material of Array.isArray(node.material)?node.material:[node.material])material?.dispose();});
});

test('mountain tents, rest cabin and lodge have traversable entrances',()=>{
 const world=airportWorld(),collision=new ServerBuilderCollision();
 for(const [name,x,start,end]of [['tent',495.4,-427,-422],['rest cabin',504,-569,-563],['lodge',553,-489,-500]]){
  let position=collision.safeSpawn(world,{x,y:0,z:start});
  assert.ok(Math.abs(position.x-x)<.01&&Math.abs(position.z-start)<.01,name+' approach is unobstructed');
  const direction=Math.sign(end-start);
  while(Math.abs(position.z-end)>.01){
   const next=collision.resolve(world,position,{...position,z:direction>0?Math.min(end,position.z+.12):Math.max(end,position.z-.12)},{});
   assert.ok(Math.abs(next.z-position.z)>.05,name+' entrance remains walkable at '+position.z);
   position=next;
  }
  assert.ok(position.y>.05,name+' has a supported interior floor');
 }
});

test('mountain trail and ranger collection quests award score once and survive a shared-room reload',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'mountain-camp-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const world=airportWorld(),store=new SharedRoomStore(join(directory,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>100000});
 const user={accountId:'mountain-explorer',username:'Mountain Explorer'},actorId='account:'+user.accountId;let sequence=0;
 const send=(action,fields={})=>runtime.command(world.id,world,user,{action,requestId:'alpine-'+ ++sequence,...fields});
 const beside=object=>store.update(world.id,room=>{const player=room.simulation.players[actorId];player.position={...object.position,x:object.position.x+2};player.floor=player.position.y;player.input={};});
 await send('join');
 const boards=world.builderScene.objects.filter(object=>object.id.startsWith('airport-alpine-')&&object.functionalSettings.behavior==='quest');
 assert.equal(boards.length,2);let expectedScore=0;
 for(const board of boards){
  const quest=board.functionalSettings.quest;
  await beside(board);await send('interact',{entityId:board.id});
  let snapshot=await runtime.snapshot(world.id,world);assert.equal(snapshot.players[actorId].quests[quest.id],'active');assert.equal(snapshot.players[actorId].score,expectedScore);
  await send('interact',{entityId:board.id});snapshot=await runtime.snapshot(world.id,world);assert.equal(snapshot.players[actorId].quests[quest.id],'active','returning without the required collectibles does not finish the quest');
  for(const modelId of quest.requiredItems){
   const collectible=world.builderScene.objects.find(object=>object.id.startsWith('airport-alpine-')&&object.modelId===modelId&&object.functionalSettings.behavior==='pickup');
   assert.ok(collectible,'local collectible exists for '+modelId);await beside(collectible);await send('interact',{entityId:collectible.id});await send('drop');
  }
  await beside(board);await send('interact',{entityId:board.id});await send('interact',{entityId:board.id});expectedScore+=quest.rewardScore;
  snapshot=await runtime.snapshot(world.id,world);assert.equal(snapshot.players[actorId].quests[quest.id],'complete');assert.equal(snapshot.players[actorId].score,expectedScore,'repeated board interaction grants no duplicate reward');
 }
 assert.equal(expectedScore,90);
 const seat=world.builderScene.objects.find(object=>object.id==='airport-alpine-fire-seat-north');await beside(seat);let snapshot=await send('interact',{entityId:seat.id});assert.equal(snapshot.players[actorId].seatedId,seat.id);
 await send('interact');
 snapshot=await new AuthoritativeRooms({store:new SharedRoomStore(store.file),now:()=>100000}).snapshot(world.id,world);
 assert.equal(snapshot.players[actorId].score,90);for(const board of boards)assert.equal(snapshot.players[actorId].quests[board.functionalSettings.quest.id],'complete');
});
