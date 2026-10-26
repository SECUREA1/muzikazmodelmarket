import test from 'node:test';import assert from 'node:assert/strict';
import {cargoCommand,createCargoTrailer,ensureFreight,stepCargoTrailers,stepFreightCrew,freightTrailerBlocked} from '../server-cargo-hauling.mjs';
import {freightHubs,trailerPose,TRAILER_ID} from '../public/js/cargo-hauling.js';
import {stepRoadVehicle} from '../public/js/road-vehicles.js';
import {createBuilderModel,updateBuilderModels} from '../public/js/builder-models-3d.js';
import {startExpandedQuest,stepExpandedQuests,expandedQuestAction} from '../server-expanded-quests.mjs';
import {createRoadCrew,followRoadRoute,stepRoadActivity} from '../server-road-activity.mjs';
import {localMapTags} from '../public/js/local-map-tags.js';
const world={id:'freight-test',proceduralLand:true,spawn:{x:8,y:0,z:0},streets:[{id:'Freight road',from:{x:0,y:0,z:-40},to:{x:0,y:0,z:40},width:10}],builderScene:{layout:'grand-floor',mapSize:120,objects:[]}};
const collision={groundAt:(_env,p)=>({...p,y:0}),hasBodyClearance:()=>true};
function fixture(){const truck={id:'pickup',modelId:'frontier-pickup',name:'Pickup',health:300,active:true,holderId:'alice',position:{x:0,y:0,z:-28},rotation:{x:0,y:0,z:0},driving:{speed:0,parked:true}},player={actorId:'alice',username:'Alice',health:100,lastSeen:100000,score:0,vehicleId:'pickup',position:{...truck.position},movementRevision:0};const sim={actors:{pickup:truck},players:{alice:player},events:[]};ensureFreight(sim,world,collision);return {sim,truck,player};}
test('hitch ownership, cargo capacity, safe loading, manifests, secure stacks and destination are authoritative',()=>{
 const {sim,truck}=fixture(),trailer=createCargoTrailer(sim,'trailer',truck),source=sim.freightHubs[0],destination=sim.freightHubs[1];
 truck.driving.speed=2;assert.throws(()=>cargoCommand(sim,truck,'hitch',100000),/Park/);truck.driving.speed=0;
 cargoCommand(sim,truck,'hitch',100000);assert.equal(trailer.towVehicleId,truck.id);
 const rival={...truck,id:'rival',trailerId:null};assert.throws(()=>cargoCommand(sim,rival,'hitch',100000),/free trailer/);
 truck.position={...source};cargoCommand(sim,truck,'load',100000,{count:8,hubId:source.id,destinationId:destination.id,manifestId:'manifest'});
 assert.equal(truck.freight.crates.length,4);assert.equal(trailer.freight.crates.length,4);assert.throws(()=>cargoCommand(sim,truck,'load',100000,{count:5}),/slots/);
 for(const count of [-1,NaN,1.5,Infinity])assert.throws(()=>cargoCommand(sim,truck,'load',100000,{count}),/between/);assert.throws(()=>cargoCommand(sim,truck,'unload',100000),/destination/);
 let pose=stepRoadVehicle(truck,{forward:1},.1);for(let i=0;i<50;i++)pose=stepRoadVehicle({...truck,...pose},{forward:1},.1);assert.ok(pose.driving.speed<=2);
 truck.position={...destination};assert.throws(()=>cargoCommand(sim,truck,'unload',100000),/Secure/);cargoCommand(sim,truck,'secure',100000);cargoCommand(sim,truck,'unload',100000,{hubId:destination.id,count:8,manifestId:'manifest'});
 assert.equal(sim.freightDeliveries[0].count,8);assert.equal(truck.freight.crates.length+trailer.freight.crates.length,0);assert.throws(()=>cargoCommand(sim,truck,'unload',100000),/destination/);
 cargoCommand(sim,truck,'unhitch',100000);assert.equal(trailer.towVehicleId,undefined);assert.equal(truck.trailerId,undefined);
});
test('trailer articulation stays connected through forward, reverse and turns and checks its own footprint',()=>{
 const {sim,truck}=fixture(),trailer=createCargoTrailer(sim,'trailer',truck,{attached:true});
 for(let i=0;i<60;i++){Object.assign(truck,stepRoadVehicle(truck,{forward:i<35?1:-1,side:.3},.1));stepCargoTrailers(sim,world,.1,collision);const yaw=truck.rotation.y,hitch={x:truck.position.x+Math.sin(yaw)*2.85,z:truck.position.z+Math.cos(yaw)*2.85};assert.ok(Math.abs(Math.hypot(hitch.x-trailer.position.x,hitch.z-trailer.position.z)-2.6)<1e-8);assert.ok(Number.isFinite(trailer.rotation.y));}
 assert.equal(freightTrailerBlocked(sim,truck,truck.position,{...truck.position,z:truck.position.z-1},truck.rotation.y,{groundAt:()=>null,hasBodyClearance:()=>true},world),true);
});
for(const id of ['freight-supply','freight-trailer','freight-express'])test(id+' completes real cargo objectives once and records shared results',()=>{
 const {sim,truck,player}=fixture();if(id==='freight-trailer')createCargoTrailer(sim,'trailer',truck,{attached:true});let now=100000;startExpandedQuest(sim,player,world,id,now,{collision});const q=player.vehicleMission;
 for(let i=0;i<80&&q.status==='active';i++){const point=q.checkpoints[q.index];truck.position={x:point.x,y:point.y||0,z:point.z};truck.driving.speed=0;player.position={...truck.position};now+=250;player.lastSeen=now;stepExpandedQuests(sim,world,now,.25,{collision});if(q.ready)expandedQuestAction(sim,player,now);}
 assert.equal(q.status,'completed');assert.equal(sim.freightDeliveries.length,1);assert.equal(sim.freightDeliveries[0].count,id==='freight-trailer'?8:id==='freight-express'?4:3);assert.equal(player.score,q.reward);const score=player.score;stepExpandedQuests(sim,world,now+250,.25,{collision});assert.equal(player.score,score);assert.ok(q.conversation.length);assert.equal(sim.questResults.length,1);
});
test('AI crews visibly load, secure, drive, unload and complete actual shipping manifests',()=>{
 const sim={actors:{},players:{},events:[]};ensureFreight(sim,world,collision);const source=sim.freightHubs[0],npc=createRoadCrew(sim,'freight-ai','frontier-pickup',{x:0,y:0,z:source.z},'Alex · Freight',100000);let loaded=false,secured=false,moved=false;const start={...npc.position};
 for(let i=0;i<2400&&!sim.freightDeliveries?.length;i++){const now=100000+i*100;stepFreightCrew(sim,npc,world,now,.1,collision,{},followRoadRoute);stepCargoTrailers(sim,world,.1,collision);loaded||=!!npc.freight?.crates?.length;secured||=loaded&&npc.freight?.secured;moved||=Math.hypot(npc.position.x-start.x,npc.position.z-start.z)>20;}
 assert.ok(loaded);assert.ok(secured);assert.ok(moved);assert.equal(sim.freightDeliveries?.[0].count,8);assert.equal(npc.freightCompleted,1);assert.ok(sim.transportRadio.some(c=>/eight crates received/.test(c.text)));
});
test('native pickup, trailer and loading bays render cargo stacks and appear on local maps and in checkout',async()=>{
 const {sim,truck}=fixture(),trailer=createCargoTrailer(sim,'trailer',truck);const model=createBuilderModel('frontier-pickup');assert.ok(model.getObjectByName('ROAD_DIGITAL_DASHBOARD'));assert.ok(createBuilderModel(TRAILER_ID).userData.cargoTrailer);assert.ok(createBuilderModel('freight-loading-bay').userData.collisionDisabled);
 const tags=localMapTags(world,sim,'alice');assert.ok(tags.some(t=>t.id==='trailer:trailer'));assert.ok(tags.filter(t=>t.locationId?.startsWith('freight-hub')).length>=2);
 const {GAME_ECONOMY}=await import('../game-economy.mjs'),{resolveStoreCart}=await import('../store-catalog.mjs');for(const id of ['frontier-pickup',TRAILER_ID]){assert.ok(GAME_ECONOMY.find(i=>i.buildAssetId===id));const quote=resolveStoreCart([{quantity:1,deliverable:{id:'builder-'+id}}],[]);assert.equal(quote.items[0].buildAssetId,id);assert.ok(quote.amountMzk>0);}
});

test('the live room publishes road freight bays and lets only the driver hitch and operate the shared trailer',async t=>{
 const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{AuthoritativeRooms}=await import('../authoritative-room.mjs'),{SharedRoomStore}=await import('../shared-room-store.mjs');const dir=await mkdtemp(join(tmpdir(),'cargo-room-'));t.after(()=>rm(dir,{recursive:true,force:true}));let now=100000,n=0;const rooms=new AuthoritativeRooms({store:new SharedRoomStore(join(dir,'rooms.json')),now:()=>now}),user={accountId:'driver',username:'Driver'},send=(action,fields={})=>rooms.command(world.id,world,user,{action,requestId:'cargo-'+ ++n,...fields});
 let state=await send('join');assert.ok(state.freightHubs.length>=2);const truck=Object.values(state.actors).find(a=>a.roadFleet&&a.modelId==='frontier-pickup');assert.ok(truck);assert.ok(state.actors[truck.id+'-trailer']);await assert.rejects(send('road-controls',{operation:'hitch'}),/Enter/);
 state=await send('map-access',{entityId:truck.id});state=await send('road-controls',{operation:'hitch'});assert.equal(state.actors[truck.id].trailerId,truck.id+'-trailer');const before={...state.actors[truck.id].position};for(let i=0;i<8;i++){now+=100;state=await send('input',{input:{forward:1,side:0}});}assert.ok(Math.hypot(state.actors[truck.id].position.x-before.x,state.actors[truck.id].position.z-before.z)>.2,'hitched pickup drives');
 await assert.rejects(send('road-controls',{operation:'unhitch'}),/Park/);await send('road-controls',{operation:'park'});state=await send('road-controls',{operation:'unhitch'});assert.equal(state.actors[truck.id].trailerId,undefined);
});

test('builder-authored and deployed freight bays join the map shipping network',()=>{
 const custom={...world,id:'custom-freight',builderScene:{...world.builderScene,objects:[{id:'custom-bay',modelId:'freight-loading-bay',name:'Workshop shipping',position:{x:12,y:0,z:12}}]}};
 const sim={actors:{'deployed-bay':{id:'deployed-bay',name:'Player freight depot',active:true,modelId:'freight-loading-bay',position:{x:-12,y:0,z:12}}},players:{},events:[]};ensureFreight(sim,custom,collision);
 assert.ok(sim.freightHubs.some(h=>h.id==='custom-bay'));assert.ok(sim.freightHubs.some(h=>h.id==='deployed-bay'));assert.ok(localMapTags(custom,sim).some(t=>t.locationId==='custom-bay'));
});

test('saved courier crews upgrade to pickups and abandoned trailers become recoverable',()=>{const {sim,truck}=fixture();const old=createRoadCrew(sim,'road-working-crew-0','grand-tourer',{...truck.position},'Saved courier',100000);stepRoadActivity(sim,world,100000,.1,{collision});assert.equal(sim.actors[old.id].modelId,'frontier-pickup');assert.ok(sim.actors[old.id].trailerId);const trailer=createCargoTrailer(sim,'abandoned',truck,{attached:true});truck.active=false;stepCargoTrailers(sim,world,.1,collision);assert.equal(trailer.towVehicleId,undefined);});
