import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {mapQuestOffers} from '../public/js/map-quest-catalog.js';
import {questCatalog} from '../public/js/quest-catalog.js';
import {airportWorld} from '../airport-world.mjs';
import {fitnessWorld} from '../fitness-world.mjs';
import {casinoWorld} from '../casino-world.mjs';
import {constructionWorld} from '../construction-world.mjs';
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

test('airport tours and briefing use authored local facilities and actual interaction reach',()=>{
 const world=airportWorld(),offers=verifyOffers(world),tour=offers.find(offer=>offer.id.endsWith(':tour')),service=offers.find(offer=>offer.kind==='site-job');
 assert.equal(tour.sites[0].name,'Arrival');assert.deepEqual({x:tour.sites[0].x,y:tour.sites[0].y,z:tour.sites[0].z},{x:world.spawn.x,y:world.spawn.y,z:world.spawn.z});
 const locations=world.builderScene.layoutMeta.locations;
 for(const site of tour.sites.slice(1))assert.ok(locations.some(place=>place.id===site.id&&place.name===site.name));
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

test('generated commons and every district offer work tied to their saved guides and facilities',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'map-quest-catalog-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const {environments}=await synchronizeWorldDirectory(new WorldAtlas(join(dir,'atlas.json')),[]);
 const generated=environments.filter(world=>world.source==='community-atlas');assert.equal(generated.length,9);
 for(const world of generated){const offers=verifyOffers(world),service=offers.find(offer=>offer.kind==='site-job');assert.ok(service,world.id+' has usable authored guidance');for(const site of service.sites)assert.ok(world.builderScene.objects.some(object=>object.id===site.entityId));}
});
