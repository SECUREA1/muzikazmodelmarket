import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {validateOwnedPlacement} from '../owned-item-placement.mjs';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {anchorServerAsset,projectServerActor} from '../public/js/server-scene-projection.js';
import {OwnedItemPlacement} from '../public/js/owned-item-placement.js';

test('releasing placement input drops capture without committing or discarding its preview',()=>{
 const captured=new Set([7]),canvas={hasPointerCapture:id=>captured.has(id),releasePointerCapture:id=>captured.delete(id)},pending={asset:{id:'chair'}};
 const placement=Object.assign(Object.create(OwnedItemPlacement.prototype),{pointer:7,pointerStart:{x:1,y:2},pointerDragged:true,inputCanvases:new Set([canvas]),pending});
 placement.releaseInputs();
 assert.equal(placement.pointer,null);assert.equal(placement.pointerStart,null);assert.equal(placement.pointerDragged,false);
 assert.equal(captured.size,0);assert.strictEqual(placement.pending,pending);assert.equal(placement.active,true);
});

test('owned placement is shared, durable, owner-only, revision checked and charged once',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'owned-placement-'));let charges=0;
 try{
 const store=new SharedRoomStore(join(dir,'rooms.json'));
 const runtime=new AuthoritativeRooms({store,now:()=>100000,resolveAsset:async()=>({id:'chair',name:'Chair',sku:'chair',behavior:'decor'}),charge:async()=>{charges++;}});
 const map={id:'placement',spawn:{x:0,y:0,z:0},builderScene:{layout:'grand-floor',objects:[]}};
 const alice={accountId:'alice',username:'Alice'},bob={accountId:'bob',username:'Bob'};
 const send=(identity,action,requestId,extra={})=>runtime.command(map.id,map,identity,{action,requestId,...extra});
 await send(alice,'join','alice-join');await send(bob,'join','bob-join');
 const placement={position:[2,.02,-3],rotation:[0,Math.PI/4,0],scale:[1.5,1.5,1.5]};
 await assert.rejects(send(alice,'spawn','bad',{placement:{...placement,position:[1000,0,0]}}),{statusCode:400});assert.equal(charges,0);
 const first=await send(alice,'spawn','lock',{placement});const id=first.result.spawnedId;
 await send(alice,'spawn','lock',{placement});assert.equal(charges,1);
 assert.deepEqual(first.actors[id].rotation,{x:0,y:Math.PI/4,z:0});assert.deepEqual(first.actors[id].scale,{x:1.5,y:1.5,z:1.5});
 await assert.rejects(send(bob,'place-item','steal',{entityId:id,revision:1,placement}),{statusCode:403});
 const next={...placement,position:[3,.02,-2],rotation:[0,-Math.PI/2,0]};
 await send(alice,'place-item','move',{entityId:id,revision:1,placement:next});
 await assert.rejects(send(alice,'place-item','stale',{entityId:id,revision:1,placement}),{statusCode:409});
 const snapshot=await new AuthoritativeRooms({store:new SharedRoomStore(store.file),now:()=>100000}).snapshot(map.id,map);
 assert.deepEqual(snapshot.actors[id].position,{x:3,y:.02,z:-2});assert.equal(snapshot.actors[id].placementRevision,2);assert.equal(charges,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('invalid transforms are rejected and anchored artwork remains grounded when scaled',()=>{
 const player={position:{x:0,y:0,z:0}},valid={position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]};
 for(const bad of [{scale:[0,1,1]},{rotation:[0,NaN,0]},{position:[0,Infinity,0]},{position:[0,0]},{scale:[9,9,9]}])assert.throws(()=>validateOwnedPlacement({...valid,...bad},player));
 const model=new THREE.Mesh(new THREE.BoxGeometry(2,4,2),new THREE.MeshBasicMaterial());model.position.y=7;model.scale.setScalar(2);
 const root=anchorServerAsset(THREE,model);projectServerActor(root,{position:{x:2,y:1,z:3},rotation:{x:0,y:Math.PI/2,z:0},scale:{x:1.5,y:1.5,z:1.5},active:true});root.updateMatrixWorld(true);
 const bounds=new THREE.Box3().setFromObject(root);assert.ok(Math.abs(bounds.min.y-1)<1e-6);assert.ok(Math.abs(bounds.max.y-13)<1e-6);
});

test('deployed native market items retain seats, quests, actions and vehicle settings',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'native-market-placement-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const assets={
  seat:{id:'catalog-seat',name:'Camp seat',buildAssetId:'camp-log-bench',function_data:{behavior:'seat',seatOffset:[0,.55,0],exitOffset:[0,0,1.4],prompt:'Sit by the campfire'}},
  quest:{id:'catalog-quest',name:'Quest guide',buildAssetId:'quest-scroll',function_data:{behavior:'quest',prompt:'Talk to the guide'},questSettings:{id:'native-test',title:'Native quest',objective:'Explore the map'},dialogueSettings:{text:'Welcome to the native quest'},aiSettings:{detectionRange:17}},
  action:{id:'catalog-action',name:'Score pickup',buildAssetId:'treasure-crystal',function_data:{behavior:'pickup',action:'score',value:7,cooldown:.25}},
  craft:{id:'catalog-craft',name:'Configured aircraft',buildAssetId:'diamond-da40',behavior:'vehicle',function_data:{interactionDistance:5,prompt:'Enter Diamond'},vehicleSettings:{mode:'fly',seat:[0,1,0],cockpit:[0,1.4,0],speed:65},animationState:{clip:'propeller',speed:2},movementSettings:{speed:5}}
 };
 const runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(dir,'rooms.json')),now:()=>100000,resolveAsset:async(_,command)=>assets[command.itemId]});
 const map={id:'native-contract',spawn:{x:0,y:0,z:0},builderScene:{layout:'grand-floor',objects:[]}},player={accountId:'native-buyer',username:'Buyer'};
 const send=(action,requestId,extra={})=>runtime.command(map.id,map,player,{action,requestId,...extra});
 await send('join','join-native');
 for(const [key,asset]of Object.entries(assets)){
  const snapshot=await send('spawn','spawn-'+key,{itemId:key,placement:{position:[1,0,1],rotation:[0,0,0],scale:[1,1,1]}}),entity=snapshot.actors[snapshot.result.spawnedId],definition=entity.definition;
  assert.equal(definition.modelId,asset.buildAssetId);
  if(key==='seat'){assert.equal(definition.gameplay.behavior,'seat');assert.deepEqual(definition.gameplay.seatOffset,[0,.55,0]);assert.deepEqual(definition.gameplay.exitOffset,[0,0,1.4]);const seated=await send('interact','sit-native',{entityId:entity.id});assert.equal(seated.players['account:native-buyer'].seatedId,entity.id);await send('interact','stand-native');}
  if(key==='quest'){assert.deepEqual(definition.quest,asset.questSettings);assert.deepEqual(definition.dialogue,asset.dialogueSettings);assert.deepEqual(definition.ai,asset.aiSettings);}
  if(key==='action'){assert.equal(definition.gameplay.action,'score');assert.equal(definition.gameplay.value,7);assert.equal(definition.gameplay.cooldown,.25);const used=await send('interact','use-native-action',{entityId:entity.id});assert.equal(used.players['account:native-buyer'].score,7);}
  if(key==='craft'){assert.equal(definition.gameplay.behavior,'vehicle');assert.equal(definition.gameplay.interactionDistance,5);assert.deepEqual(definition.vehicle,asset.vehicleSettings);assert.equal(definition.animation.clip,'propeller');assert.equal(definition.animation.speed,2);assert.equal(definition.movement.speed,5);}
 }
});
