import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {forgeWorld} from '../forge-world.mjs';
import {createForgeBuilderScene,editableForgeScene,forgeBuilderLayoutMeta} from '../public/js/forge-builder.js';
import {forgeServicePoints,forgeObjectPoint} from '../public/js/forge-config.js';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {GAME_ECONOMY} from '../game-economy.mjs';
import {watercraftInteractionReach} from '../public/js/harbor-water.js';

test('forge work bays and freight yard use canonical editable items with empty receipt-backed cargo pads',()=>{
 const map=forgeWorld(),scene=map.builderScene,yard=scene.layoutMeta.forgeYard;
 assert.ok(scene.objects.length>100);assert.equal(yard.sourceMapId,'factory');assert.equal(yard.cargoSlots.length,3);
 for(const object of scene.objects)assert.ok(GAME_ECONOMY.some(item=>item.buildAssetId===object.modelId),object.modelId+' is a real market item');
 assert.ok(!scene.objects.some(object=>object.modelId==='factory-freight-crate'),'warehouse stock is not fabricated as static scenery');
 for(const slot of yard.cargoSlots){assert.equal(slot.capacity,1);assert.ok(scene.objects.some(object=>object.id===slot.objectId));assert.equal(slot.position.y,.3);}
 assert.equal(scene.layoutMeta.forgeCrewWorkspaces.length,6);
 for(const point of scene.layoutMeta.forgeCrewWorkspaces)assert.ok(Math.hypot(point.position.x-point.approach.x,point.position.z-point.approach.z)>3,'AI side work does not occupy the player work pad');
 assert.ok(scene.objects.some(object=>object.functionalSettings?.portal?.targetMapId==='hormuz-shipping'));
 assert.deepEqual(forgeServicePoints(map).map(point=>point.kind).sort(),['dispatch','policy']);
});

test('dispatch, policy, shop and shipping gateway have continuous clear walking routes',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'forge-spaces-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const map=forgeWorld(),runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(directory,'rooms.json')),now:()=>1000000});
 const state=await runtime.command(map.id,map,{accountId:'space-walker',username:'Walker'},{action:'join',requestId:'forge-spaces-arrive',radToxEnabled:false});
 let current={...state.players[state.selfId].position};
 const route=[[0,28],[-18,28],[-18,27],[-18,28],[-31,28],[-31,26],[-36.3,26],[-36.3,15],[-36.3,39],[-33,40],[-12,40],[0,40],[0,28],[27,30],[36,30],[46,30],[46,38]];
 for(const [x,z]of route){
  const origin={...current},steps=Math.max(1,Math.ceil(Math.hypot(x-origin.x,z-origin.z)/.2));
  for(let step=1;step<=steps;step++){const fraction=step/steps;current=runtime.collision.resolve(map,current,{x:origin.x+(x-origin.x)*fraction,y:current.y-.03,z:origin.z+(z-origin.z)*fraction},state.actors,state.objects);}
  assert.ok(Math.hypot(current.x-x,current.z-z)<.3,'clear route reaches '+x+','+z+' from '+JSON.stringify(current));
 }
 for(const service of forgeServicePoints(map)){
  const options={entry:true,actors:state.actors,objects:state.objects},floor=runtime.collision.groundAt(map,service.approach,options);
  assert.ok(floor);assert.ok(runtime.collision.hasBodyClearance(map,floor,.38,options),service.name+' has a clear work pad');
  const feet={...floor,y:floor.y+.02},actor=state.actors[service.id],reach=watercraftInteractionReach(actor,feet,service.interactionDistance);
  assert.ok(Math.hypot(feet.x-service.position.x,feet.y-service.position.y,feet.z-service.position.z)<reach,service.name+' is within the actual ordinary-prop reach, including player ground offset');
  await runtime.command(map.id,map,{accountId:'space-walker',username:'Walker'},{action:'map-access',locationId:service.kind==='dispatch'?'forge-dispatch-yard':'forge-policies',requestId:'forge-spaces-visit-'+service.kind});
  const used=await runtime.command(map.id,map,{accountId:'space-walker',username:'Walker'},{action:'interact',entityId:service.id,requestId:'forge-spaces-use-'+service.kind});
  assert.equal(used.result[service.kind==='dispatch'?'forgeDispatch':'forgePolicy'],true,'the marked approach opens its connected service');
 }
 runtime.collision.clearPlacedWorlds();
});

test('custom space metadata follows saved transforms and deleted service desks or staging pads stay deleted',()=>{
 const scene=createForgeBuilderScene({id:'custom-forge-yard'}),desk=scene.objects.find(object=>object.id==='forge-dispatch-desk'),pallet=scene.objects.find(object=>object.id==='forge-cargo-pallet-0');
 desk.position={x:10,y:0,z:10};desk.rotation.y=Math.PI/2;
 pallet.position={x:12,y:1,z:14};pallet.scale={x:2,y:.5,z:1};
 const meta=forgeBuilderLayoutMeta(scene,scene.layoutMeta),environment={id:scene.id,game:'forge',forge:scene.sourceForge,builderScene:scene};
 assert.ok(Math.abs(meta.forgeYard.dispatchApproach.x-14)<1e-9);assert.ok(Math.abs(meta.forgeYard.dispatchApproach.z-10)<1e-9);
 assert.equal(meta.forgeYard.cargoSlots[0].position.y,1.6);assert.deepEqual(forgeServicePoints(environment).find(point=>point.kind==='dispatch').approach,forgeObjectPoint(desk,{x:0,y:0,z:4}));
 scene.objects=scene.objects.filter(object=>!['forge-dispatch-desk','forge-trade-policy-board','forge-cargo-pallet-0'].includes(object.id));
 const restored=editableForgeScene(scene);assert.equal(restored.layoutMeta.forgeYard,null);assert.equal(forgeServicePoints({builderScene:restored}).length,0);
 assert.ok(!restored.layoutMeta.locations.some(place=>['forge-dispatch-yard','forge-policies'].includes(place.id)));
 assert.ok(!restored.objects.some(object=>object.id==='forge-cargo-pallet-0'));
});

test('custom station AI side workspaces rotate with the player approach and survive Builder restoration',()=>{
 const scene=createForgeBuilderScene({id:'rotated-forge-workspaces'}),station=scene.objects.find(object=>object.functionalSettings?.forgeStation==='hammer');
 station.position={x:10,y:0,z:10};
 for(const [yaw,expected]of [[0,{x:13.4,y:0,z:17.8}],[Math.PI/2,{x:17.8,y:0,z:6.6}],[Math.PI,{x:6.6,y:0,z:2.2}]]){
  station.rotation.y=yaw;
  const meta=forgeBuilderLayoutMeta(scene,scene.layoutMeta),workspace=meta.forgeCrewWorkspaces.find(point=>point.stationId===station.id);
  for(const axis of ['x','y','z'])assert.ok(Math.abs(workspace.position[axis]-expected[axis])<1e-8,'AI side workspace '+axis+' follows yaw '+yaw);
  assert.ok(Math.abs(Math.hypot(workspace.position.x-workspace.approach.x,workspace.position.z-workspace.approach.z)-Math.hypot(3.4,2.8))<1e-8,'AI remains clear of the player approach');
  const restored=editableForgeScene(scene).layoutMeta.forgeCrewWorkspaces.find(point=>point.stationId===station.id);
  assert.deepEqual(restored,workspace,'saved custom rotations keep the same work side');
 }
});

test('returning forge rooms install new dispatch and policy actors without replacing saved smithing work',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'forge-spaces-upgrade-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const current=forgeWorld(),previous=structuredClone(current),serviceIds=new Set(forgeServicePoints(current).map(point=>point.id));
 previous.contentUpdatedAt='2026-10-31T12:27:28.461Z';
 previous.builderScene.objects=previous.builderScene.objects.filter(object=>!serviceIds.has(object.id));
 assert.notEqual(current.contentUpdatedAt,previous.contentUpdatedAt);
 const runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(directory,'rooms.json')),now:()=>1000000,forgeState:async()=>({job:{id:'saved-forge-work',stage:'hammer'},progress:{completedItems:4}})});
 const identity={accountId:'returning-yard-smith',username:'Smith'};
 const before=await runtime.command(current.id,previous,identity,{action:'join',requestId:'previous-space-arrival'});
 assert.ok([...serviceIds].every(id=>!before.actors[id]));
 const after=await runtime.command(current.id,current,identity,{action:'join',requestId:'upgraded-space-arrival'});
 assert.ok([...serviceIds].every(id=>after.actors[id]?.active));
 assert.equal(after.players[after.selfId].forge.job.id,'saved-forge-work');
 assert.equal(after.players[after.selfId].forge.progress.completedItems,4);
 assert.notEqual(after.sceneVersion,before.sceneVersion);
});
