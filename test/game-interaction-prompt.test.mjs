import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {resolveServerInteraction} from '../public/js/game-interaction-prompt.js';
import {compileBuilderScene,BuilderGameplayRuntime} from '../public/js/builder-gameplay-pipeline.js';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
const player=extra=>({id:'account:host',health:100,position:{x:0,y:0,z:0},...extra});
const actor=(id,x=1,behavior='door',extra={})=>({id,active:true,position:{x,y:0,z:0},definition:{objectId:id,gameplay:{behavior,interactionDistance:3,action:'none',cooldown:0}},...extra});

test('context appears only inside the actual 3D interaction reach and excludes unavailable closer objects',()=>{
 const door=actor('door',2),held=actor('held',.2,'pickup',{holderId:'account:other'}),decor=actor('decor',.3,'decor'),enemy=actor('enemy',.4,'hostile'),inactive=actor('gone',.1,'switch',{active:false});
 const input={player:player(),actors:[held,decor,enemy,inactive,door]};
 assert.equal(resolveServerInteraction(input).entityId,'door');assert.equal(resolveServerInteraction(input).title,'Open door');
 door.open=true;assert.equal(resolveServerInteraction(input).title,'Close door');
 door.position.y=4;assert.equal(resolveServerInteraction(input),null,'vertical reach counts as distance');
 door.position={x:3,y:0,z:0};assert.equal(resolveServerInteraction(input).entityId,'door');
 door.position.x=3.001;assert.equal(resolveServerInteraction(input),null);
 door.position.x=6;door.definition.gameplay.interactionDistance=20;assert.equal(resolveServerInteraction(input),null,'server caps authored interaction ranges at five metres');
});

test('authored definitions work from function, map, record and manifest arrays, while spawned metadata overrides them',()=>{
 const target=actor('authored');delete target.definition;const definition={objectId:'authored',gameplay:{behavior:'switch',interactionDistance:3,prompt:'Lights'}};
 for(const definitions of [()=>definition,new Map([['authored',definition]]),{authored:definition},[definition]]){
  const result=resolveServerInteraction({player:player(),actors:{authored:target},actorDefinitions:definitions});assert.equal(result.title,'Lights');assert.equal(result.entityId,'authored');
 }
 target.definition={gameplay:{behavior:'door',interactionDistance:.5}};
 assert.equal(resolveServerInteraction({player:player(),actors:[target],actorDefinitions:[definition]}),null,'live actor metadata is authoritative');
 assert.equal(resolveServerInteraction({player:player(),actors:[{...target,definition:null}]}),null,'rendered scenery without usable metadata gets no button');
});

test('held items and occupied seats or vehicles expose the correct exit action regardless of nearby distance',()=>{
 const far=actor('occupied',100,'seat'),other=actor('door');
 for(const [field,kind,title,vehicleActive]of [['vehicleId','vehicle','Exit vehicle',true],['seatedId','item','Stand up',false],['heldId','drop','Drop held item',false]]){
  const result=resolveServerInteraction({player:player({[field]:'occupied'}),actors:[far,other]});assert.equal(result.kind,kind);assert.equal(result.title,title);assert.equal(result.vehicleActive,vehicleActive);assert.equal(result.entityId,kind==='drop'?'occupied':undefined,'seat and vehicle exits need no selected target');
  assert.equal(resolveServerInteraction({player:player({[field]:'missing'}),actors:[other]}),null,'an incomplete stale snapshot must not expose a false exit');
 }
});

test('dead, replaced, missing and finished players get no interaction prompt',()=>{
 const actors=[actor('door')];for(const state of [null,player({health:0}),player({health:-1}),player({replacedByRoom:'other-world'}),player({position:{x:NaN,y:0,z:0}})])assert.equal(resolveServerInteraction({player:state,actors}),null);
 assert.equal(resolveServerInteraction({player:player({seatedId:'door'}),actors,match:{state:'finished'}}),null);
 assert.equal(resolveServerInteraction({player:player(),actors,matchState:'finished'}),null);
});

test('basketball keeps its catch action while spectators can sit on free benches outside the court',()=>{
 const ball=actor('ball',.1,'pickup',{modelId:'basketball',basketballMatchBall:true});
 const inCourt=actor('court-seat',1,'seat');const bench=actor('bench',1,'seat',{basketballSpectatorSeat:true,position:{x:9,y:0,z:0},definition:{gameplay:{behavior:'seat',interactionDistance:2.5,prompt:'Sit on spectator bench'}}});
 const seatedViewer=player({basketballRole:'spectator',position:{x:8,y:0,z:0}}),basketball={state:'live'};
 assert.equal(resolveServerInteraction({player:player(),actors:[ball],basketball}),null);
 assert.equal(resolveServerInteraction({player:player({heldId:'ball'}),actors:[{...ball,holderId:'account:host'}],basketball}),null,'shoot and pass own the held sports ball without a duplicate Drop control');
 assert.equal(resolveServerInteraction({player:player({basketballRole:'spectator'}),actors:[inCourt],basketball}),null);
 assert.equal(resolveServerInteraction({player:seatedViewer,actors:[bench],basketball}).title,'Sit on spectator bench');
 bench.holderId='account:other';assert.equal(resolveServerInteraction({player:seatedViewer,actors:[bench],basketball}),null);
 const vehicle=actor('vehicle',8,'vehicle');assert.equal(resolveServerInteraction({player:seatedViewer,actors:[vehicle],basketball}),null);
 assert.equal(resolveServerInteraction({player:player({position:{x:8,y:0,z:0}}),actors:[vehicle],basketball}).kind,'vehicle');
});

test('locked or incomplete portals stay hidden and valid explicit destinations remain available',()=>{
 const portal=actor('portal',1,'interact');portal.definition.gameplay.action='teleport';portal.definition.gameplay.portal={enabled:false,destinationType:'map',targetMapId:'next'};
 const input={player:player(),actors:[portal]};assert.equal(resolveServerInteraction(input),null);
 portal.definition.gameplay.portal.enabled=true;assert.equal(resolveServerInteraction(input).hint,'Tap to travel');
 delete portal.definition.gameplay.portal.targetMapId;assert.equal(resolveServerInteraction(input),null);
 portal.definition.gameplay.portal={enabled:true,destinationType:'object',targetObjectId:'arrival'};assert.equal(resolveServerInteraction(input),null);
 input.actors.push(actor('arrival',20,'decor'));assert.equal(resolveServerInteraction(input).entityId,'portal');
 const loot=actor('loot',.1,'pickup',{loot:{catalogId:'care'}});assert.equal(resolveServerInteraction({player:player(),actors:[loot]}),null,'loot uses its separate automatic collection path');
});

test('the displayed authored door and spawned pickup resolve to commands accepted by the authoritative room',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'interaction-prompt-'));let now=100000,sequence=0;
 const map={id:'prompt-world',builderScene:{layout:'grand-floor',mapSize:64,objects:[{id:'door',modelId:'portal-door',position:{x:1,y:0,z:0},functionalSettings:{behavior:'door',interactionDistance:3,cooldown:0}}]}};
 const store=new SharedRoomStore(join(dir,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>now,resolveAsset:async()=>({id:'test-box',buildAssetId:'crate',name:'Test crate',behavior:'pickup',basic:true})});
 const send=(action,fields={})=>runtime.command(map.id,map,{accountId:'host',username:'Host',stats:{health:100}},{action,requestId:'prompt-'+(++sequence),...fields});
 try{
  await send('join');await store.update(map.id,room=>{room.simulation.players['account:host'].position={x:0,y:0,z:0};});
  let snapshot=await runtime.snapshot(map.id,map),prompt=resolveServerInteraction({player:snapshot.players['account:host'],actors:snapshot.actors,actorDefinitions:compileBuilderScene(map.builderScene).actors,match:snapshot.match});
  assert.equal(prompt.entityId,'door');snapshot=await send('interact',{entityId:prompt.entityId});assert.equal(snapshot.actors.door.open,true);
  snapshot=await send('spawn',{sku:'backpack:test-box'});const spawnedId=snapshot.result.spawnedId;
  await store.update(map.id,room=>{room.simulation.actors.door.position={x:10,y:0,z:0};room.simulation.actors[spawnedId].position={x:1,y:0,z:0};});
  snapshot=await runtime.snapshot(map.id,map);prompt=resolveServerInteraction({player:snapshot.players['account:host'],actors:snapshot.actors,actorDefinitions:compileBuilderScene(map.builderScene).actors,match:snapshot.match});
  assert.equal(prompt.entityId,spawnedId);snapshot=await send('interact',{entityId:prompt.entityId});assert.equal(snapshot.players['account:host'].heldId,spawnedId);
  prompt=resolveServerInteraction({player:snapshot.players['account:host'],actors:snapshot.actors});assert.equal(prompt.kind,'drop');snapshot=await send('drop');assert.equal(snapshot.players['account:host'].heldId,null);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('local-runtime pseudo actors preserve authored interaction keys and omit inert triggers',()=>{
 const custom=actor('custom-key',1,'switch');custom.definition.gameplay.interactionKey='q';
 let result=resolveServerInteraction({player:player(),actors:[custom]});assert.equal(result.key,'q');assert.match(result.prompt,/^Q —/);
 const inert=actor('inert',.1,'trigger');assert.equal(resolveServerInteraction({player:player(),actors:[inert]}),null);
 assert.equal(resolveServerInteraction({player:player(),actors:[inert],hideInert:false}).entityId,'inert');
 inert.definition.gameplay.action='arcade';assert.equal(resolveServerInteraction({player:player(),actors:[inert,custom]}).entityId,'inert','authored local actions remain available');
});

test('local contextual activation acts on the highlighted item without retargeting a closer hostile actor',()=>{
 const scene={objects:[{id:'enemy',modelId:'rogue-bot',position:{x:.2,y:0,z:0},functionalSettings:{behavior:'hostile'}},{id:'door',modelId:'portal-door',position:{x:1,y:0,z:0},functionalSettings:{behavior:'door',interactionKey:'e',interactionDistance:3}}]};
 const manifest=compileBuilderScene(scene),runtime=new BuilderGameplayRuntime({manifest});let opened=false;
 for(const definition of manifest.actors)runtime.register(definition.objectId,{getPosition:()=>definition.position,setDoorOpen:value=>{opened=value;}});
 const actors=manifest.actors.map(definition=>({id:definition.objectId,active:true,position:runtime.position(definition),definition}));
 const prompt=resolveServerInteraction({player:player(),actors});assert.equal(prompt.entityId,'door');
 assert.equal(runtime.nearest(player().position,'e').actor.objectId,'enemy','unfiltered legacy input has a different closest target');
 const result=runtime.interact(prompt.key,player().position,prompt.entityId);assert.equal(result.actor.objectId,'door');assert.equal(opened,true);
 assert.equal(runtime.interact('e',{x:20,y:0,z:0},prompt.entityId),null,'an explicit target still has to be within reach');
 assert.equal(runtime.interact('f',player().position,prompt.entityId),null,'an explicit target still requires its authored action key');
});
