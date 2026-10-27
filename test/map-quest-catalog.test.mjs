import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {mapQuestOffers} from '../public/js/map-quest-catalog.js';
import {questCatalog} from '../public/js/quest-catalog.js';
import {localMapLocations} from '../public/js/local-map-locations.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {airportWorld} from '../airport-world.mjs';
import {fitnessWorld} from '../fitness-world.mjs';
import {casinoWorld} from '../casino-world.mjs';
import {constructionWorld} from '../construction-world.mjs';
import {neonMarina} from '../neon-marina.mjs';
import {WorldAtlas} from '../world-atlas.mjs';
import {synchronizeWorldDirectory} from '../world-directory.mjs';

function verifyOffers(world){
 const offers=mapQuestOffers(world),ids=new Set(offers.map(offer=>offer.id));
 assert.equal(ids.size,offers.length,world.id+' has stable distinct assignments');
 for(const kind of ['tour','challenge']){
  const offer=offers.find(offer=>offer.id==='map:'+encodeURIComponent(world.id)+':'+kind);
  assert.ok(offer,world.id+' offers '+kind);assert.equal(offer.mode,'foot');assert.equal(offer.siteQuest,true);assert.equal(offer.mapId,world.id);
  assert.ok(offer.sites.length>=2);assert.ok(offer.reward>0&&offer.timeLimit>=90);
  for(const site of offer.sites)assert.ok(Number.isFinite(site.x)&&Number.isFinite(site.y)&&Number.isFinite(site.z),world.id+' finite site '+site.id);
 }
 return offers;
}

test('every authored explorer map has discovery and a timed local route with real coordinates',async()=>{
 const repository=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url),'utf8'));
 for(const world of repository.filter(world=>!['hockey','arcade'].includes(world.game)))verifyOffers(world);
 for(const world of [airportWorld(),fitnessWorld(),casinoWorld(),constructionWorld()])verifyOffers(world);
});

test('airport tours and briefing use canonical local facilities, supported floors and actual interaction reach',()=>{
 const world=airportWorld(),offers=verifyOffers(world),tour=offers.find(offer=>offer.id.endsWith(':tour')),service=offers.find(offer=>offer.kind==='site-job');
 assert.equal(tour.sites[0].name,'Arrival');assert.deepEqual({x:tour.sites[0].x,y:tour.sites[0].y,z:tour.sites[0].z},{x:world.spawn.x,y:world.spawn.y,z:world.spawn.z});
 const locations=localMapLocations(world),collision=new ServerBuilderCollision();
 for(const site of tour.sites.slice(1)){const place=locations.find(place=>place.id===site.id&&place.name===site.name);assert.ok(place,'tour uses a registered facility or freight hub');assert.deepEqual({x:site.x,y:site.y,z:site.z},{x:place.x,y:Number(place.y)||0,z:place.z});const floor=collision.groundAt(world,site,{entry:true});assert.ok(floor&&Math.abs(floor.y-site.y)<.3,'tour stop has its actual supported airport floor: '+site.name);}
 assert.equal(new Set(tour.sites.map(site=>site.name)).size,tour.sites.length);
 assert.match(service.title,/Airport/);
 for(const site of service.sites){const item=world.builderScene.objects.find(item=>item.id===site.entityId);assert.ok(item);assert.deepEqual({x:site.x,y:site.y,z:site.z},item.position);assert.equal(site.interactionDistance,item.functionalSettings.interactionDistance);assert.equal(site.action,'interact');}
 const challenge=offers.find(offer=>offer.challenge);assert.equal(challenge.sites.at(-1).id,'map-arrival');
});

test('sparse GLB maps propose bounded floor surveys without invented facilities or people',()=>{
 const world={id:'saved-room',name:'Saved Room',modelUrl:'/real-room.glb',spawn:{x:40,y:7,z:-20}},offers=verifyOffers(world);
 for(const offer of offers)for(const site of offer.sites){assert.equal(site.entityId,undefined);assert.equal(site.y,7);assert.ok(Math.hypot(site.x-40,site.z+20)<=10);if(site.id!=='map-arrival'){assert.equal(site.survey,true);assert.match(site.name,/floor survey/);}}
 assert.equal(offers.some(offer=>offer.kind==='site-job'),false);
});

test('GLB additions and member placement scenes use their actual objects and transformed arrivals',()=>{
 const sign={id:'member-guide',name:'Reading room guide',position:{x:18,y:2,z:5},functionalSettings:{behavior:'talk',interactionDistance:4}};
 const placed={id:'member-room',name:'Member reading room',spawn:{x:18,y:2,z:0},placementScene:{objects:[sign]}};
 const service=mapQuestOffers(placed).find(offer=>offer.kind==='site-job');assert.equal(service.sites[0].entityId,'member-guide');
 const extended={id:'extended-room',builderScene:{baseEnvironment:{modelUrl:'/room.glb',spawn:{x:2,y:1,z:4}},baseTransform:{x:20,y:2,z:30,rotation:90,scale:2},objects:[]}};
 const arrival=mapQuestOffers(extended)[0].sites[0];assert.ok(Math.abs(arrival.x-28)<1e-8);assert.ok(Math.abs(arrival.z-26)<1e-8);assert.equal(arrival.y,4);
});

test('site jobs exclude vehicles, seats, portable items, financial devices, portals and elevated props',()=>{
 const item=(id,behavior,extra={},y=0)=>({id,name:id,position:{x:5,y,z:5},functionalSettings:{behavior,...extra}});
 const world={id:'safe-service',spawn:{x:0,y:0,z:0},builderScene:{objects:[item('guide','talk'),item('lever','switch'),item('seat','seat'),item('craft','vehicle'),item('crate','pickup'),item('atm','interact',{device:'market-atm'}),item('portal','talk',{action:'teleport'}),item('roof-guide','talk',{},8),item('disabled','talk',{enabled:false})]}};
 const service=mapQuestOffers(world).find(offer=>offer.kind==='site-job');assert.deepEqual(new Set(service.sites.map(site=>site.entityId)),new Set(['guide','lever']));
});

test('casino and fitness orientation inspect stations without asking for wagers, purchases or workout completion',()=>{
 for(const world of [casinoWorld(),fitnessWorld()]){
  const offers=questCatalog(world),service=offers.find(offer=>offer.kind==='site-job');assert.ok(service);assert.ok(offers.some(offer=>offer.kind==='site-work'));
  for(const site of service.sites){const object=world.builderScene.objects.find(object=>object.id===site.entityId),config=object.functionalSettings;assert.ok(config.fitnessStation||['host','vault'].includes(config.casinoStation));assert.equal(config.device,undefined);}
  assert.equal(offers.some(offer=>offer.mode!=='foot'),false);
 }
});

test('catalog cache reuses immutable map data and refreshes on saved scene changes',()=>{
 const world={id:'edited',name:'First title',spawn:{x:0,y:0,z:0},builderScene:{version:3,objects:[],layoutMeta:{locations:[]}}};
 const first=mapQuestOffers(world);assert.equal(mapQuestOffers(world),first);
 world.builderScene.objects=[{id:'guide',name:'New guide',position:{x:6,y:0,z:0},functionalSettings:{behavior:'talk'}}];
 const second=mapQuestOffers(world);assert.notEqual(second,first);assert.ok(second.some(offer=>offer.kind==='site-job'));
 world.name='Saved title';world.updatedAt='revision-2';assert.match(mapQuestOffers(world)[0].title,/Saved title/);
});

test('harbor walking routes stay on the arrival island and use real mainland guidance before surveys',()=>{
 const marina=neonMarina(),world={id:'mainland-harbor',name:'Neon Marina',spawn:{x:124,y:0,z:30},builderScene:{mapSize:1536,objects:marina.objects,layoutMeta:{harbor:marina.harbor,locations:marina.locations.filter(place=>place.x>128||Math.abs(place.z)>128)}}};
 const offers=verifyOffers(world);
 for(const offer of offers)for(const site of offer.sites){assert.ok(Math.abs(site.x)<=128&&Math.abs(site.z)<=128,offer.id+' stays on mainland: '+site.name);assert.equal(/Beacon Island|Palm Key|North Haven|Crescent Island|Silver Coast|Reed Cay|Sunset Key/.test(site.name),false);}
 const tour=offers.find(offer=>offer.id.endsWith(':tour'));assert.ok(tour.sites.slice(1).every(site=>!site.survey),'filtered locations are supplemented with real usable guides');
 assert.ok(tour.sites.slice(1).every(site=>marina.objects.some(object=>object.id===site.id)));
 assert.equal(questCatalog(world).filter(offer=>offer.mode==='boat'||offer.mode==='gunboat').length,10,'all maritime assignments remain offered');
});

test('island arrivals keep walking routes on that island, with bounded same-island survey fallback',()=>{
 const marina=neonMarina(),island=marina.harbor.islands.find(island=>island.id==='beacon-island');
 for(const objects of [marina.objects,[]]){
  const world={id:'island-harbor-'+objects.length,name:'Beacon Island',spawn:{x:island.x+island.width/2-1,y:0,z:island.z},builderScene:{mapSize:1536,objects,layoutMeta:{harbor:marina.harbor,locations:objects.length?marina.locations:[island]}}};
  const offers=verifyOffers(world);
  for(const offer of offers)for(const site of offer.sites)assert.ok(Math.abs(site.x-island.x)<=island.width/2&&Math.abs(site.z-island.z)<=island.depth/2,offer.id+' stays on Beacon Island: '+site.name);
  if(!objects.length)assert.ok(offers.flatMap(offer=>offer.sites).some(site=>site.survey));
 }
});

test('generated commons and every district offer work tied to their saved guides and facilities',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'map-quest-catalog-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const {environments}=await synchronizeWorldDirectory(new WorldAtlas(join(dir,'atlas.json')),[]);
 const generated=environments.filter(world=>world.source==='community-atlas');assert.equal(generated.length,9);
 for(const world of generated){const offers=verifyOffers(world),service=offers.find(offer=>offer.kind==='site-job');assert.ok(service,world.id+' has usable authored guidance');for(const site of service.sites)assert.ok(world.builderScene.objects.some(object=>object.id===site.entityId));}
});


test('shipping seas without a default mainland keep foot quests on their authored arrival terminal',()=>{
 const harbor={mainIsland:false,extent:1400,islands:[{id:'terminal',x:-700,z:200,width:160,depth:120},{id:'far-port',x:800,z:-300,width:120,depth:80}],lakes:[]};
 const locations=[{id:'arrival-office',name:'Cargo office',x:-700,z:200},{id:'crane-briefing',name:'Crane briefing',x:-680,z:180},{id:'quay-check',name:'Quay safety check',x:-720,z:220},{id:'phantom-mainland',name:'Uncharted sea',x:0,z:0},{id:'remote-port',name:'Remote port',x:800,z:-300}];
 const guide={id:'cargo-guide',name:'Cargo master',position:{x:-692,y:0,z:200},functionalSettings:{behavior:'talk',interactionDistance:4}};
 const world={id:'shipping-water',game:'shipping',name:'Shipping sea',spawn:{x:-700,y:0,z:200},builderScene:{mapSize:2800,objects:[guide],layoutMeta:{harbor,locations}}};
 const offers=verifyOffers(world);
 for(const offer of offers)for(const site of offer.sites){assert.ok(site.x>=-780&&site.x<=-620&&site.z>=140&&site.z<=260,offer.id+' stays on the arrival terminal');assert.equal(site.name==='Uncharted sea'||site.name==='Remote port',false);}
 assert.match(offers[0].title,/Cargo terminal/);
 assert.equal(offers.find(offer=>offer.kind==='site-job').sites[0].entityId,'cargo-guide');
 const seaArrival={...world,id:'sea-arrival',spawn:{x:0,y:0,z:0}};
 for(const offer of mapQuestOffers(seaArrival))for(const site of offer.sites)assert.ok(Math.hypot(site.x,site.z)<=4,'sea arrival does not invent an origin mainland or distant walkable quay');
});


test('narrow shipping regions exclude circular maritime and cross-sea walking assignments',()=>{
 const world={id:'narrow-shipping',game:'shipping',spawn:{x:-1000,y:0,z:500},builderScene:{mapSize:2800,objects:[],layoutMeta:{harbor:{mainIsland:false,extent:1400,islands:[{id:'south-coast',x:0,z:700,width:2800,depth:800},{id:'north-coast',x:0,z:-700,width:2800,depth:800}],lakes:[]},locations:[{id:'local-quay',name:'Local quay',x:-1000,z:500},{id:'local-crane',name:'Crane briefing',x:-990,z:510},{id:'remote-quay',name:'Far port',x:1000,z:-500}]}}};
 const offers=questCatalog(world);
 assert.ok(offers.some(offer=>offer.siteQuest),'dock orientation and checkpoint quests remain');
 assert.equal(offers.some(offer=>['boat','gunboat'].includes(offer.mode)),false,'no invented complete water circuit through coasts');
 assert.equal(offers.some(offer=>['land-delivery','land-recovery','land-explore'].includes(offer.id)),false,'no walk across shipping sea');
 for(const offer of offers.filter(offer=>offer.siteQuest))for(const site of offer.sites)assert.ok(site.z>=300,'dock quests remain on the starting coast');
});


test('dock walking quests can reach an overlapping quay without crossing to a disconnected port',()=>{
 const world={id:'connected-shipping-quay',game:'shipping',spawn:{x:0,y:0,z:25},builderScene:{mapSize:1000,objects:[{id:'quay-guide',name:'Loading supervisor',position:{x:0,y:0,z:0},functionalSettings:{behavior:'talk',interactionDistance:4}}],layoutMeta:{harbor:{mainIsland:false,extent:500,islands:[{id:'coast',x:0,z:70,width:200,depth:100},{id:'quay',x:0,z:10,width:60,depth:40},{id:'remote-port',x:300,z:-100,width:60,depth:40}]},locations:[{id:'quay-office',name:'Dock office',x:0,z:0},{id:'coastal-market',name:'Stock market',x:20,z:40},{id:'remote-office',name:'Remote office',x:300,z:-100}]}}};
 const offers=verifyOffers(world);
 assert.ok(offers.find(offer=>offer.kind==='site-job').sites.some(site=>site.entityId==='quay-guide'),'a continuous dock floor reaches its crew briefing');
 assert.ok(offers.flatMap(offer=>offer.sites).some(site=>site.name==='Dock office'));
 assert.equal(offers.flatMap(offer=>offer.sites).some(site=>site.name==='Remote office'),false);
});


test('imported model walking tours ignore implicit roadside freight hubs and still start on real entrance floors',async t=>{
 const repository=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url),'utf8'));
 const dir=await mkdtemp(join(tmpdir(),'imported-foot-freight-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const {environments}=await synchronizeWorldDirectory(new WorldAtlas(join(dir,'atlas.json')),repository.map(world=>({...world,source:'repository'})));
 const imported=environments.filter(world=>(world.modelUrl||world.modelUrls?.length)&&!world.builderScene);
 let checked=0;
 for(const world of imported){
  const places=localMapLocations(world),implicit=places.filter(place=>place.kind==='freight'&&/^freight-hub-\d+$/.test(place.id));
  if(!implicit.length)continue;checked++;
  const ids=new Set(implicit.map(place=>place.id));
  assert.ok(localMapLocations(world).some(place=>ids.has(place.id)),'transport map retains its freight destinations');
  for(const offer of mapQuestOffers(world))for(const site of offer.sites)assert.equal(ids.has(site.id),false,world.id+' foot route does not infer imported floors from a road hub');
 }
 assert.ok(checked>=9,'the regression covers the imported map category with ambient streets');
 const world=imported.find(world=>world.id==='muzikaz-upper');assert.ok(world);
 const runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(dir,'rooms.json')),now:()=>100000}),identity={accountId:'walker',username:'Walker',stats:{health:100}};let sequence=0;
 const send=(action,fields={})=>runtime.command(world.id,world,identity,{action,requestId:'imported-foot-'+ ++sequence,...fields});
 await send('join',{deferRadTox:true,radToxEnabled:false});
 for(const offer of mapQuestOffers(world)){
  const state=await send('vehicle-mission',{operation:'start',questId:offer.id}),quest=state.players[state.selfId].vehicleMission;
  assert.equal(quest.status,'active');assert.ok(quest.checkpoints.length>=2);
  for(const point of quest.checkpoints){assert.equal(point.siteId.startsWith('freight-hub-'),false);assert.ok(runtime.collision.hasBodyClearance(world,point,.38,{actors:state.actors,objects:state.objects}));}
  if(offer.challenge)assert.equal(quest.checkpoints.at(-1).siteId,'map-arrival');
  await send('vehicle-mission',{operation:'cancel'});
 }
});

test('an explicitly authored imported-model freight bay remains a local walking destination',()=>{
 const bay={id:'freight-hub-1',modelId:'freight-loading-bay',name:'Authored loading bay',position:{x:10,y:0,z:0}},place={id:bay.id,name:bay.name,...bay.position,kind:'freight'};
 const world={id:'authored-model-freight',modelUrl:'/model.glb',spawn:{x:0,y:0,z:0},placementScene:{objects:[bay],layoutMeta:{locations:[place,{id:'local-office',name:'Local office',x:0,z:10}]}}};
 assert.ok(mapQuestOffers(world).flatMap(offer=>offer.sites).some(site=>site.id===bay.id&&site.name===bay.name));
});
