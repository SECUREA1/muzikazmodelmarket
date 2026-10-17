import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {CAMP_ITEMS,CAMP_LAYOUTS,CAMP_SCENES,createSummerCamp,createCampScene} from '../public/js/summer-camp.js';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
import {libraryModels,builderSections} from '../public/js/builder-library.js';
import {compileBuilderScene} from '../public/js/builder-gameplay-pipeline.js';
import {createBuilderLand} from '../public/js/environments/builder-land.js';
import {layoutHeight} from '../public/js/environments/layout-terrain.js';
import {deviceDefinition} from '../public/js/interactive-devices.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';

test('camp assets have real bounded meshes, thumbnails and useful categories',async()=>{
 assert.equal(Object.keys(CAMP_ITEMS).length,15);
 for(const [id,item]of Object.entries(CAMP_ITEMS)){
  const root=createBuilderModel(id);assert.equal(root.userData.modelId,id);assert.equal(root.userData.visualFinish,'mzk-game-items-v2');
  let triangles=0,meshes=0;root.traverse(node=>{if(!node.isMesh)return;meshes++;assert.ok([...node.geometry.attributes.position.array].every(Number.isFinite),id);triangles+=(node.geometry.index?.count||node.geometry.attributes.position.count)/3;});
  assert.ok(meshes>0&&meshes<=30,id);assert.ok(triangles<6000,id);
  const size=new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());assert.ok(size.toArray().every(n=>n>0&&Number.isFinite(n)),id);
  assert.ok((await readFile('.'+item.image,'utf8')).includes('<svg'));
  const tags=builderSections({...item,buildAssetId:id});assert.ok(tags.has('summer-camp')&&tags.has(item.category),id);
 }
 assert.equal(libraryModels(Object.values(CAMP_ITEMS),'summer-camp').length,15);
 assert.ok(builderSections(CAMP_ITEMS['camp-log-bench']).has('seating'));
});

test('all camp maps and scene stacks compile with spawn, attainable quests, seats and a shared arcade',()=>{
 for(const layout of Object.keys(CAMP_LAYOUTS))for(const size of [40,80,120,160,240,320]){
  const scene=createSummerCamp(layout,size),manifest=compileBuilderScene(scene);
  assert.ok(scene.mapSize>=80&&scene.mapSize<=320);assert.ok(scene.objects.length>40&&scene.objects.length<100);
  assert.equal(new Set(scene.objects.map(o=>o.id)).size,scene.objects.length);assert.ok(manifest.spawn);
  for(const object of scene.objects){assert.ok(createBuilderModel(object.modelId),object.modelId);assert.ok(Math.abs(object.position.x)<scene.mapSize/2&&Math.abs(object.position.z)<scene.mapSize/2);}
  const board=manifest.actors.find(a=>a.gameplay.behavior==='quest');assert.ok(board);
  for(const id of board.gameplay.quest.requiredItems)assert.ok(manifest.actors.some(a=>a.modelId===id&&a.gameplay.behavior==='pickup'));
  assert.equal(board.gameplay.quest.rewardScore,35);assert.equal(manifest.actors.filter(a=>a.gameplay.behavior==='seat').length,4);
  assert.ok(manifest.actors.some(a=>deviceDefinition(a.modelId,a.gameplay)?.multiGame));
 }
 for(const id of Object.keys(CAMP_SCENES)){
  const stack=createCampScene(id,'first'),repeat=createCampScene(id,'second');assert.ok(stack.length>=4);assert.ok(stack.every(o=>!repeat.some(other=>other.id===o.id)));
  assert.equal(compileBuilderScene({objects:stack}).objectCount,stack.length);
 }
 assert.throws(()=>createSummerCamp('missing'));assert.throws(()=>createCampScene('missing'));
});

test('editor terrain and server camp floors agree; cabins and tents have a clear entrance and steps support climbing',()=>{
 for(const layout of Object.keys(CAMP_LAYOUTS)){
  const environment={id:layout,proceduralLand:true,builderScene:{...createSummerCamp(layout,80),objects:[]}},land=createBuilderLand(environment);
  assert.equal(land.userData.streetHeightAt(7,-13),layoutHeight(layout,7,-13));assert.equal(layoutHeight(layout,7,-13),0);
 }
 for(const modelId of ['camp-cabin','camp-tent','camp-dock','camp-climbing-steps']){
  const collision=new ServerBuilderCollision(),environment={id:modelId,proceduralLand:true,builderScene:{layout:'camp-woodland',mapSize:80,objects:[{id:'item',modelId,position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},functionalSettings:{behavior:'decor'}}]}};
  let position=collision.safeSpawn(environment,{x:modelId==='camp-tent'?.4:0,y:0,z:-5});
  const stop=modelId==='camp-dock'?1:0;
  while(position.z<stop-.01){const next=collision.resolve(environment,position,{...position,z:Math.min(stop,position.z+.12)},{});assert.ok(next.z>position.z+.05,modelId+' unobstructed approach at '+position.z);position=next;}
  assert.ok(position.y>.1,modelId+' supports feet above floor');if(modelId==='camp-climbing-steps')assert.ok(position.y>=1.2);
 }
});

test('two players use the camp quest and seat through authoritative room commands; completion survives reload',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'summer-camp-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=new SharedRoomStore(join(dir,'rooms.json')),rooms=new AuthoritativeRooms({store,now:()=>100000});
 const scene=createSummerCamp('camp-woodland',80),environment={id:'summer-camp-test',proceduralLand:true,builderScene:scene},board=scene.objects.find(o=>o.functionalSettings.behavior==='quest'),seat=scene.objects.find(o=>o.functionalSettings.behavior==='seat');
 const users=['alice','bob'].map(accountId=>({accountId,username:accountId}));let sequence=0;
 const send=(user,action,extra={})=>rooms.command(environment.id,environment,user,{action,requestId:'camp-'+(++sequence),...extra});
 // Establish server fixtures beside an object; normal client movement cannot set position.
 const beside=(user,object)=>store.update(environment.id,room=>{const p=room.simulation.players['account:'+user.accountId];p.position={...object.position,x:object.position.x+1.5};p.floor=p.position.y;p.input={};});
 for(const user of users){
  await send(user,'join');await beside(user,board);await send(user,'interact',{entityId:board.id});
  let state=await rooms.snapshot(environment.id,environment);assert.equal(state.players['account:'+user.accountId].score,0);
  for(const id of board.functionalSettings.quest.requiredItems){const item=scene.objects.find(o=>o.modelId===id);await beside(user,item);await send(user,'interact',{entityId:item.id});await send(user,'drop');}
  await beside(user,board);await send(user,'interact',{entityId:board.id});await send(user,'interact',{entityId:board.id});
  state=await rooms.snapshot(environment.id,environment);assert.equal(state.players['account:'+user.accountId].score,35);
 }
 await beside(users[0],seat);await send(users[0],'interact',{entityId:seat.id});
 const view=await rooms.snapshot(environment.id,environment);assert.equal(view.players['account:alice'].seatedId,seat.id);assert.equal(view.actors[seat.id].holderId,'account:alice');assert.equal(view.players['account:bob'].score,35);
 const restored=await new AuthoritativeRooms({store:new SharedRoomStore(store.file),now:()=>100000}).snapshot(environment.id,environment);
 assert.equal(restored.players['account:alice'].quests[board.functionalSettings.quest.id],'complete');assert.equal(restored.players['account:bob'].score,35);
});
