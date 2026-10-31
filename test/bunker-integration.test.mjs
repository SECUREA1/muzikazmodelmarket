import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {bunkerWorld} from '../bunker-world.mjs';
import {BUNKER_ITEMS} from '../public/js/bunker-items.js';
import {BUNKER_LOCATIONS,BUNKER_CREW} from '../public/js/bunker-config.js';
import {GAME_ECONOMY,ownsEconomyItem} from '../game-economy.mjs';
import {nativeMarketCatalog} from '../native-market-catalog.mjs';
import {editableMapScene} from '../public/js/editable-map-import.js';
import {compileBuilderScene} from '../public/js/builder-gameplay-pipeline.js';
import {backpackPlacementModels} from '../public/js/builder-backpack-models.js';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {synchronizeWorldDirectory} from '../world-directory.mjs';
import {WorldAtlas} from '../world-atlas.mjs';
import {filterWorlds,filterWorldCategory} from '../public/js/world-map-picker.js';
import {mapSectorKind,mapWheelSvg} from '../public/js/map-wheel-svg.js';
import {createBuilderLand} from '../public/js/environments/builder-land.js';
import {buildCollision,resolveSafeSpawn} from '../public/js/environments/environment-collision.js';

const temporary=async t=>{
 const directory=await mkdtemp(join(tmpdir(),'bunker-integration-'));
 t.after(()=>rm(directory,{recursive:true,force:true}));return directory;
};

test('the bunker loader uses real surface overburden and preserves the safe surface entry',()=>{
 const map=bunkerWorld(),root=createBuilderLand(map);
 try{
  const collision=buildCollision(root,'auto',[],{buildOctree:false});
  assert.ok(collision.visibleMeshes.length>0,'initial loader has visible geometry before authored objects arrive');
  assert.ok(collision.collisionMeshes.length>0,'surface overburden is actual terrain above the underground rooms');
  assert.ok(collision.floorMeshes.length>0,'exposed surface ground has real physical support');
  assert.ok(collision.collisionMeshes.every(mesh=>mesh.userData.bunkerOverburden||/MAP_(SAFETY|BOUNDARY)/.test(mesh.name)),'native rooms and descent retain their individual authored collision');
  const spawn=resolveSafeSpawn(root,collision.floorMeshes,map.spawn).position;
  assert.ok(Math.abs(spawn.x-map.spawn.x)<1e-8);
  assert.ok(Math.abs(spawn.y-map.spawn.y)<1e-8,'initial loading keeps the authored floor height');
  assert.ok(Math.abs(spawn.z-map.spawn.z)<1e-8);
 }finally{
  const resources=new Set();root.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of [].concat(node.material||[]))resources.add(material);});
  for(const resource of resources)resource.dispose();
 }
});

test('bunker is discoverable and its complete editable component list uses canonical market SKUs',async t=>{
 const directory=await temporary(t),world=bunkerWorld();
 const manifest=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url),'utf8'));
 assert.equal(manifest.filter(map=>map.id===world.id).length,1,'offline discovery lists the authored bunker exactly once');
 assert.deepEqual(manifest.find(map=>map.id===world.id).builderScene.objects,world.builderScene.objects,'the offline template preserves the current underground geometry and equipment');
 const {environments}=await synchronizeWorldDirectory(new WorldAtlas(join(directory,'atlas.json')),[]);
 const published=environments.find(map=>map.id===world.id);
 assert.ok(published?.permanent&&published.sharedWorld&&published.playable&&published.multiplayer);
 assert.equal(published.roomId,world.id);
 assert.deepEqual(published.streets,[],'the atlas keeps indoor circulation free of generated outdoor roads');
 assert.equal(published.worldId,'volt-city');
 assert.equal(published.regionId,'volt-city','the bunker belongs to its configured city district');
 assert.ok(published.portalTargets.includes('world-item-factory'));
 assert.ok(environments.find(map=>map.id==='world-item-factory').portalTargets.includes(world.id),'factory has a return travel link');
 const rows=environments.map(env=>({env,count:0}));
 assert.ok(filterWorlds(rows,'underground bunker').some(row=>row.env.id===world.id));
 assert.equal(mapSectorKind(published),'bunker');
 assert.ok(filterWorldCategory(rows,'bunker').some(row=>row.env.id===world.id));
 assert.match(mapWheelSvg([{env:published,count:0}],world.id),/data-kind="bunker"/);

 const catalog=nativeMarketCatalog(GAME_ECONOMY,[world]),template=catalog.maps.find(map=>map.worldId===world.id);
 assert.ok(template);
 assert.match(template.builderUrl,new RegExp('repository-'+world.id));
 assert.equal(template.itemCount,world.builderScene.objects.length);
 for(const item of BUNKER_ITEMS)assert.ok(template.components.some(component=>component.buildAssetId===item.id),item.id+' appears in the map component list');
 for(const component of template.components){
  assert.ok(component.sku,'canonical SKU for '+component.buildAssetId);
  const item=catalog.items.find(item=>item.sku===component.sku);
  assert.ok(item.nativeMaps.some(usage=>usage.id===world.id&&usage.count===component.count));
 }
 const draft=editableMapScene(world),roundtrip=JSON.parse(JSON.stringify(draft));
 assert.deepEqual(roundtrip.objects,world.builderScene.objects,'copy preserves individual structural pieces, gear and interactions');
 assert.equal(roundtrip.sourceEnvironmentId,world.id);
 const compiled=compileBuilderScene(roundtrip);
 for(const source of world.builderScene.objects.filter(object=>object.functionalSettings?.behavior!=='decor')){
  const actor=compiled.actors.find(actor=>actor.objectId===source.id);
  assert.ok(actor,'editable runtime actor '+source.id);
  assert.equal(actor.gameplay.behavior,source.functionalSettings.behavior);
  if(source.functionalSettings.portal)assert.deepEqual(actor.gameplay.portal,source.functionalSettings.portal);
 }
 draft.objects[0].position.x+=1;
 assert.notEqual(draft.objects[0].position.x,world.builderScene.objects[0].position.x,'draft edits are isolated from the public map');
});

test('all bunker items purchase once in MZK, survive restart and keep functional settings through Backpack placement',async t=>{
 const directory=await temporary(t),file=join(directory,'users.json'),database=new UserJsonDatabase(file);
 assert.equal(BUNKER_ITEMS.length,24,'the expanded shelter collection has 24 canonical reusable items');
 const account={accountId:'bunker-builder',mzkBalance:100000,landAssets:[],gameAssets:[],bottleClaims:[]};
 const {walletId}=await database.ensureAccount(account),before=(await database.economy(walletId)).balance;
 let spent=0;
 for(const definition of BUNKER_ITEMS){
  const offers=GAME_ECONOMY.filter(item=>item.buildAssetId===definition.id);
  assert.equal(offers.length,1,'one canonical offer for '+definition.id);
  const item=offers[0];assert.ok(item.native&&item.priceMzk>0);
  const receipt=await database.economyAction(walletId,'buy',item.sku,'bunker-buy:'+definition.id);
  assert.equal((await database.economyAction(walletId,'buy',item.sku,'bunker-buy:'+definition.id)).id,receipt.id);
  spent+=item.priceMzk;
 }
 const reloaded=new UserJsonDatabase(file),economy=await reloaded.economy(walletId),state=await reloaded.get(walletId);
 assert.equal(economy.balance,before-spent,'idempotent purchases debit the exact authoritative prices');
 const models=backpackPlacementModels({},economy);
 for(const definition of BUNKER_ITEMS){
  const item=GAME_ECONOMY.find(item=>item.buildAssetId===definition.id),owned=state.items.filter(asset=>asset.economySku===item.sku);
  assert.equal(owned.length,1,definition.id+' remains one durable Backpack item');
  assert.equal(ownsEconomyItem(state,item),true);
  assert.deepEqual(owned[0].function_data,item.function_data);
  const model=models.find(model=>model.buildAssetId===definition.id);assert.ok(model);
  const actor=compileBuilderScene({objects:[{id:'owned-'+definition.id,modelId:model.id,asset:{buildAssetId:model.buildAssetId},functionalSettings:model.function_data,dialogueSettings:model.dialogueSettings,animationState:model.animationState}]}).objects[0];
  assert.equal(actor.asset.buildAssetId,definition.id);
  assert.equal(actor.gameplay.behavior,definition.behavior);
  assert.equal(actor.gameplay.interactionDistance,item.function_data.interactionDistance);
  if(item.dialogueSettings)assert.deepEqual(actor.dialogue,item.dialogueSettings);
 }
});

test('a purchased bunker power core deploys through ownership resolution and its switch is shared and durable',async t=>{
 const directory=await temporary(t),database=new UserJsonDatabase(join(directory,'users.json'));
 const account={accountId:'bunker-operator',username:'Operator',mzkBalance:10000,landAssets:[],gameAssets:[],bottleClaims:[]};
 const {walletId}=await database.ensureAccount(account),item=GAME_ECONOMY.find(item=>item.buildAssetId==='bunker-power-core');
 const map={id:'bunker-owned-item-fixture',name:'Native placement floor',playable:true,proceduralLand:true,spawn:{x:0,y:.02,z:4},builderScene:{layout:'grand-floor',mapSize:40,objects:[],gameplay:{radTox:false}}};
 const store=new SharedRoomStore(join(directory,'rooms.json'));let now=1000000,sequence=0;
 const runtime=new AuthoritativeRooms({store,now:()=>now,
  resolveAsset:async(_identity,command)=>command.sku===item.sku&&ownsEconomyItem(await database.get(walletId),item)?item:null,
  charge:async(_identity,sku,requestId)=>database.economyAction(walletId,'use',sku,requestId)});
 const identity={accountId:account.accountId,username:account.username};
 const send=(action,fields={})=>{now+=1100;return runtime.command(map.id,map,identity,{action,requestId:'bunker-owned-'+ ++sequence,...fields});};
 await send('join',{radToxEnabled:false,deferRadTox:true});
 await assert.rejects(send('spawn',{sku:item.sku}),/Purchase/,'an unowned native item cannot be deployed');
 await database.economyAction(walletId,'buy',item.sku,'power-core-purchase');
 let state=await send('spawn',{sku:item.sku,placement:{position:[0,0,2],rotation:[0,0,0],scale:[1,1,1]}});
 const spawned=state.result.spawnedId;
 assert.equal(state.actors[spawned].definition.gameplay.behavior,'switch');
 assert.equal(state.actors[spawned].asset.buildAssetId,item.buildAssetId);
 state=await send('interact',{entityId:spawned});assert.equal(state.actors[spawned].switched,true);
 const observer={accountId:'bunker-observer',username:'Observer'};
 state=await runtime.command(map.id,map,observer,{action:'join',requestId:'bunker-observer-join',radToxEnabled:false,deferRadTox:true});
 assert.equal(state.actors[spawned].switched,true,'another player sees the authoritative switch state');
 const saved=await new AuthoritativeRooms({store:new SharedRoomStore(store.file),now:()=>now}).snapshot(map.id,map);
 assert.equal(saved.actors[spawned].switched,true,'native item state survives the room store restart');
});

test('the shared bunker has a safe surface arrival, a physical descent, working blast doors and connected underground rooms',async t=>{
 const directory=await temporary(t),map=bunkerWorld();let now=1000000,sequence=0;
 const runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(directory,'rooms.json')),now:()=>now});
 const identity={accountId:'bunker-walker',username:'Walker'};
 const send=(action,fields={})=>{now+=1100;return runtime.command(map.id,map,identity,{action,requestId:'bunker-walk-'+ ++sequence,...fields});};
 let state=await send('join');
 assert.equal(state.radTox,null,'campaign arrival does not start ambient combat');
 assert.ok(Math.abs(state.players[state.selfId].position.y-map.spawn.y)<.1,'arrival uses the actual surface entry floor');
 const undergroundY=map.bunkerDefense.undergroundLevel+.02;
 assert.ok(undergroundY<-10,'the protective rooms are physically below the surface');
 const crew=Object.values(state.actors).filter(actor=>actor.resident);
 for(const definition of BUNKER_CREW){
  const actor=crew.find(actor=>actor.id===definition.id);assert.ok(actor,'authored crew member '+definition.name);
  assert.equal(actor.resident.name,definition.name);
  assert.ok(runtime.collision.hasBodyClearance(map,actor.position,.38,{actors:state.actors,objects:state.objects}),definition.name+' stands on clear floor');
 }
 // The real server command changes each door before collision traversal. A
 // closed room door first stops the walker at its reinforced leaf.
 const door=map.builderScene.objects.find(object=>object.id==='bunker-door-east-22');
 let blocked={x:2,y:undergroundY,z:22};
 for(let step=0;step<30;step++)blocked=runtime.collision.resolve(map,blocked,{x:blocked.x+.15,y:blocked.y-.03,z:22},state.actors,state.objects);
 assert.ok(blocked.x<door.position.x,'closed door blocks its room entrance');
 for(const object of map.builderScene.objects.filter(object=>object.functionalSettings?.behavior==='door')){
  const sign=Math.sign(object.position.x);
  const approach=object.id==='bunker-ingress-shutter'?{x:0,y:-11.23,z:34}:{x:sign*2,y:undergroundY,z:object.position.z};
  await send('map-access',{position:approach});
  state=await send('interact',{entityId:object.id});assert.equal(state.actors[object.id].open,true);
 }
 let position={...map.spawn};
 const walk=points=>{
  for(const [x,z]of points){
   const origin={...position},steps=Math.max(1,Math.ceil(Math.hypot(x-origin.x,z-origin.z)/.2));
   for(let index=1;index<=steps;index++)position=runtime.collision.resolve(map,position,{x:origin.x+(x-origin.x)*index/steps,y:position.y-.12,z:origin.z+(z-origin.z)*index/steps},state.actors,state.objects);
   assert.ok(Math.hypot(position.x-x,position.z-z)<.2,'connected walking route reaches '+x+','+z+'; actual '+position.x+','+position.z);
   const expectedY=z>=64?.02:z>32?(-12+(z-32)*.375+.02):undergroundY;
   assert.ok(Math.abs(position.y-expectedY)<.15,'walking stays on physical surface, descent or underground floor at '+x+','+z+'; y='+position.y);
  }
 };
 // Route around the arrival console and each workstation rather than through
 // their solid meshes. Every room's authored approach is reached on foot.
 walk([[0,66],[0,64],[0,34],[0,30],[0,27],[0,25],[-2,23],[-2,22],[-10,22],[-10,26],[-16,26],[-10,26],[-10,22],[2,22],
  [10,22],[10,26],[16,26],[10,26],[10,22],[2,22],[2,0],
  [-10,0],[-10,4],[-16,4],[-10,4],[-10,0],[2,0],
  [10,0],[10,4],[16,4],[10,4],[10,0],[2,0],[2,-22],
  [-8,-22],[-8,-18],[-16,-18],[-8,-18],[-8,-22],[2,-22],
  [10,-22],[10,-18],[16,-18],[10,-18],[10,-22],[2,-22],[2,-25],[0,-25]]);
 for(const place of BUNKER_LOCATIONS){
  const floor=runtime.collision.groundAt(map,place,{entry:true,actors:state.actors,objects:state.objects});assert.ok(floor,place.name+' has real floor support');
  assert.ok(runtime.collision.hasBodyClearance(map,floor,.38,{actors:state.actors,objects:state.objects}),place.name+' has a clear approach');
 }
});

test('editing a bunker copy moves existing crew home and removing a character does not recreate it from old metadata',async t=>{
 const directory=await temporary(t),original=bunkerWorld();let now=1000000;
 const scene=editableMapScene(original,{id:'bunker-crew-copy'});
 let map={...original,id:'bunker-crew-copy',source:'custom-builder',builderScene:scene};
 const store=new SharedRoomStore(join(directory,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>now});
 let state=await runtime.command(map.id,map,{accountId:'copy-builder',username:'Builder'},{action:'join',requestId:'copy-arrive'});
 assert.equal(Object.values(state.actors).filter(actor=>actor.resident?.bunker).length,4);
 await store.update(map.id,room=>{room.simulation.actors['bunker-rook'].resident.workCompleted=7;});
 const edited=structuredClone(scene);
 edited.objects=edited.objects.filter(object=>object.id!=='bunker-nyx');
 const rook=edited.objects.find(object=>object.id==='bunker-rook');rook.position={x:-10,y:original.builderScene.objects.find(object=>object.id==='bunker-rook').position.y,z:-17};
 map={...map,updatedAt:'crew-copy-edit',builderScene:edited};now+=1100;
 state=await runtime.snapshot(map.id,map);
 assert.equal(state.actors['bunker-nyx'],undefined,'deleting an authored character removes its live social actor');
 assert.ok(edited.layoutMeta.residents.some(person=>person.id==='bunker-nyx'),'stale layout metadata cannot reintroduce the deleted object');
 assert.equal(state.actors['bunker-rook'].resident.home.x,rook.position.x);
 assert.equal(state.actors['bunker-rook'].resident.home.z,rook.position.z);
 assert.equal(state.actors['bunker-rook'].resident.workCompleted,7,'moving a character retains its saved experience');
 assert.equal(state.actors['bunker-rook'].modelId,'bunker-engineer');
 now+=1100;state=await runtime.snapshot(map.id,map);
 assert.equal(state.actors['bunker-nyx'],undefined,'later room steps keep the Builder deletion');
 assert.equal(Object.values(state.actors).filter(actor=>actor.resident?.bunker).length,3);
});

test('ordinary authoritative walking input descends from the surface and climbs back without teleporting or forced vertical motion',async t=>{
 const directory=await temporary(t),map=bunkerWorld();let now=1000000,sequence=0;
 const runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(directory,'input-rooms.json')),now:()=>now,doomsdayRandom:()=>0});
 const identity={accountId:'descent-input-walker',username:'Descent walker'};
 const send=(action,fields={})=>{now+=50;return runtime.command(map.id,map,identity,{action,requestId:'descent-input-'+ ++sequence,...fields});};
 let state=await send('join',{deferRadTox:true,radToxEnabled:false});const selfId=state.selfId;
 for(let index=0;index<200&&state.players[selfId].position.z>34;index++)state=await send('input',{input:{forward:1,yaw:0}});
 let position=state.players[selfId].position;
 assert.ok(position.z<=34.2,'normal forward control reaches the lower access landing: '+JSON.stringify(position));
 assert.ok(position.y<-11&&position.y>-11.5,'gravity follows the real descending floor: '+JSON.stringify(position));
 state=await send('input',{input:{}});
 state=await send('interact',{entityId:'bunker-ingress-shutter'});
 assert.equal(state.actors['bunker-ingress-shutter'].open,true,'the visitor opens the shutter from the lower access approach');
 for(let index=0;index<50&&state.players[selfId].position.z>26.5;index++)state=await send('input',{input:{forward:1,yaw:0}});
 position=state.players[selfId].position;
 assert.ok(position.z<=26.7,'normal forward control enters the protected spine: '+JSON.stringify(position));
 assert.ok(Math.abs(position.y-(map.bunkerDefense.undergroundLevel+.02))<.1);
 for(let index=0;index<240&&state.players[selfId].position.z<69.5;index++)state=await send('input',{input:{forward:1,yaw:Math.PI}});
 position=state.players[selfId].position;
 assert.ok(position.z>=69.3,'ordinary walking climbs back to the surface approach: '+JSON.stringify(position));
 assert.ok(Math.abs(position.y-.02)<.1,'the return path ends on the real surface floor');
});
