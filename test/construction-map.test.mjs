import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {constructionWorld} from '../construction-world.mjs';
import {editableMapScene,editableMapChoices} from '../public/js/editable-map-import.js';
import {filterWorlds,filterWorldCategory,sortWorlds} from '../public/js/world-map-picker.js';
import {mapSectorKind,mapWheelSvg} from '../public/js/map-wheel-svg.js';
import {WorldAtlas,attachAtlas,defaultStreets} from '../world-atlas.mjs';
import {synchronizeWorldDirectory} from '../world-directory.mjs';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
import {createEarthworks} from '../public/js/construction-earthworks.js';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {stepConstructionCrew} from '../server-construction-crew.mjs';
import {stepConstruction} from '../server-construction.mjs';

test('construction is a permanent public shared destination and searchable game map',async t=>{
 const map=constructionWorld(),registry=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url)));
 assert.deepEqual(registry.find(row=>row.id===map.id),map);
 assert.ok(Number.isFinite(Date.parse(map.contentUpdatedAt)),'authored site changes invalidate persisted room manifest keys');
 const dir=await mkdtemp(join(tmpdir(),'construction-map-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const directory=await synchronizeWorldDirectory(new WorldAtlas(join(dir,'atlas.json')),[]);
 const listed=directory.environments.find(row=>row.id===map.id);
 assert.ok(listed.permanent&&listed.playable&&listed.multiplayer);
 assert.equal(listed.visibility,'public');assert.ok(listed.travelPortals.length>=2);
 assert.deepEqual(listed.streets,map.streets,'atlas keeps all roads outside the tower and crane working areas');
 assert.deepEqual(listed.builderScene.streets,map.streets);
 for(const id of new Set(map.builderScene.objects.map(object=>object.modelId))){
  const model=createBuilderModel(id);assert.ok(model,id+' has a playable mesh');
  model.traverse(node=>{node.geometry?.dispose();for(const material of [].concat(node.material||[]))material?.dispose();});
 }
 const worlds=[{env:{id:'scenery',name:'Scenery'},count:100},{env:listed,count:0}];
 assert.equal(mapSectorKind(listed),'construction');
 assert.equal(filterWorldCategory(worlds,'construction')[0].env.id,map.id);
 assert.equal(filterWorldCategory(worlds,'games')[0].env.id,map.id);
 assert.equal(filterWorlds(worlds,'crane skyscraper')[0].env.id,map.id);
 assert.equal(sortWorlds(worlds)[0].env.id,map.id);
 assert.match(mapWheelSvg(worlds,map.id),/Construction/);
});

test('existing construction atlas grids migrate to authored perimeter roads and copied sites retain them',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'construction-roads-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const map=constructionWorld(),draft=editableMapScene(map,{id:'my-city-site'});
 // Builder copies carry source metadata; their independent room is not a
 // permanent public destination and must still retain its authored road plan.
 const copy={id:draft.id,name:draft.name,source:'custom-builder',ownerId:'account:builder',visibility:'public',builderScene:{...draft,streets:structuredClone(map.streets)}};
 const atlas=new WorldAtlas(join(dir,'atlas.json'));
 let directory=await synchronizeWorldDirectory(atlas,[copy]);
 for(const id of [map.id,copy.id])assert.deepEqual(directory.environments.find(row=>row.id===id).streets,map.streets);
 const userRoad={id:'owner-service-road',name:'Owner service road',from:{x:-43,z:36},to:{x:-28,z:36},width:3,createdBy:'Builder'};
 await atlas.transaction(data=>{
  for(const cell of Object.values(data.cells))if([map.id,copy.id].includes(cell.mapId))cell.streets=[...defaultStreets(cell.mapId,cell.size),structuredClone(userRoad)];
  data.revision++;
 });
 // Attachment is safe even while an old persisted atlas awaits migration.
 assert.deepEqual(attachAtlas(map,await atlas.read()).streets,[...map.streets,userRoad]);
 const reloaded=new WorldAtlas(atlas.file);directory=await synchronizeWorldDirectory(reloaded,[copy]);
 for(const id of [map.id,copy.id]){
  const cell=Object.values(directory.atlas.cells).find(row=>row.mapId===id),environment=directory.environments.find(row=>row.id===id);
  assert.deepEqual(cell.streets,[...map.streets,userRoad],'persisted grid is repaired');
  assert.deepEqual(environment.streets,cell.streets);assert.deepEqual(environment.builderScene.streets,cell.streets);
 }
 const revision=directory.atlas.revision;
 assert.equal((await synchronizeWorldDirectory(reloaded,[copy])).atlas.revision,revision,'unchanged site roads do not cause repeated migrations');
});

test('builder can copy every construction site part and retain independent working machinery rules',()=>{
 const map=constructionWorld(),choices=editableMapChoices([map]);
 assert.equal(choices[0].id,map.id);
 const draft=editableMapScene(map,{id:'my-city-site',layout:'repository-'+map.id});
 assert.deepEqual(draft.objects,map.builderScene.objects);
 assert.equal(draft.objects.length,new Set(draft.objects.map(object=>object.id)).size);
 assert.ok(draft.objects.length>200&&draft.objects.length<=2000);
 assert.equal(draft.sourceGame,'construction');assert.deepEqual(draft.sourceConstruction,map.construction);
 assert.deepEqual(draft.sourceSpawn,map.spawn);
 const machines=draft.objects.filter(object=>object.functionalSettings.behavior==='vehicle');
 assert.deepEqual(machines.map(object=>object.modelId),['tower-crane','site-dumptruck','site-bulldozer','site-excavator']);
 assert.ok(machines.every(object=>object.functionalSettings.interactionDistance>=5));
 draft.sourceConstruction.tower.maxFloors=24;draft.objects[0].position.x=30;
 assert.equal(map.construction.tower.maxFloors,16);assert.equal(map.builderScene.objects[0].position.x,-18);
 // The delivery pad and all targets fit the crane's independent trolley range.
 const crane=map.builderScene.objects.find(object=>object.modelId==='tower-crane');
 for(const point of [map.construction.supply,{x:5,z:-19},{x:5,z:-1},{x:-4,z:-10},{x:14,z:-10}]){
  const radius=Math.hypot(point.x-crane.position.x,point.z-crane.position.z);
  assert.ok(radius>=4&&radius<=42,'construction target is within the jib envelope');
 }
});

test('expanded earthwork bays remain open to real excavation and safe from static pads',()=>{
 const map=constructionWorld(),config=map.construction,yard=config.yard,earth=createEarthworks(config);
 assert.ok((yard.maxX-yard.minX)*(yard.maxZ-yard.minZ)>100000,'usable yard expands to more than five hectares');
 assert.equal(map.builderScene.mapSize,768);assert.ok(map.builderScene.objects.length<850,'yard growth does not multiply scene draw calls');
 assert.equal(earth.patches.length,13);
 const bounds=earth.patches.map(patch=>({id:patch.id,minX:patch.origin.x,maxX:patch.origin.x+patch.columns*patch.cellSize,minZ:patch.origin.z,maxZ:patch.origin.z+patch.rows*patch.cellSize}));
 const overlaps=(a,b)=>Math.min(a.maxX,b.maxX)>Math.max(a.minX,b.minX)+1e-8&&Math.min(a.maxZ,b.maxZ)>Math.max(a.minZ,b.minZ)+1e-8;
 for(let index=0;index<bounds.length;index++){
  const bay=bounds[index];assert.ok(bay.minX>=yard.minX&&bay.maxX<=yard.maxX&&bay.minZ>=yard.minZ&&bay.maxZ<=yard.maxZ,bay.id+' lies within the usable yard');
  for(const other of bounds.slice(index+1))assert.equal(overlaps(bay,other),false,bay.id+' and '+other.id+' are independent terrain cells');
  for(const object of map.builderScene.objects.filter(object=>object.modelId==='material:baseplate'&&object.position.y<.2)){
   const pad={minX:object.position.x-object.scale.x*2.4,maxX:object.position.x+object.scale.x*2.4,minZ:object.position.z-object.scale.z*2.4,maxZ:object.position.z+object.scale.z*2.4};
   assert.equal(overlaps(bay,pad),false,object.id+' must not cover the diggable '+bay.id+' surface');
  }
 }
 assert.ok(earth.patches.filter(patch=>patch.gravel.some(volume=>volume>0)).length>=2,'two real gravel piles start ready to scoop and push');
 assert.ok(earth.patches.find(patch=>patch.id==='soil-stockpile').heights.some(height=>height>1),'loose soil starts ready for a blade pass');
 const copy=editableMapScene(map);assert.deepEqual(createEarthworks(copy.sourceConstruction).patches,earth.patches,'Builder copies retain all real soil and gravel');
});

test('crew staging and haul routes remain separate from tower lifts and the city perimeter',()=>{
 const map=constructionWorld(),{crew,yard}=map.construction;
 const routes=[crew.muster,crew.jobBoard,crew.staging,crew.loading,crew.dump,crew.grade,...crew.walkWaypoints,...crew.haulWaypoints,...crew.approachWaypoints,...crew.dumpApproachWaypoints];
 for(const point of routes){assert.ok(point.x>yard.minX&&point.x<yard.maxX&&point.z>yard.minZ&&point.z<yard.maxZ,'crew and plant staging stay inside the working fence');assert.ok(Math.hypot(point.x+18,point.z+4)>8,'haul and crew routes clear the crane base');}
 for(const street of map.streets){const [a,b]=[street.from,street.to];assert.ok(a.x===b.x?(a.x+street.width/2<yard.minX||a.x-street.width/2>yard.maxX):(a.z+street.width/2<yard.minZ||a.z-street.width/2>yard.maxZ),'city road stays outside all yard operations');}
 const dozer=map.builderScene.objects.find(object=>object.modelId==='site-bulldozer');assert.ok(Math.hypot(dozer.position.x-crew.loading.x,dozer.position.z-crew.loading.z)>15,'parked bulldozer clears the truck loading approach');
 const [dockStart,dock]=crew.approachWaypoints.slice(-2);assert.equal(dockStart.x,crew.loading.x,'final docking lane approaches the loading pose straight from the south');assert.equal(dock.x,crew.loading.x);assert.equal(dock.z,crew.loading.z);assert.ok(dockStart.z-dock.z>=20,'truck has enough straight travel to align its cab away from the loading boom');
 const core=map.builderScene.objects.find(object=>object.id==='construction-service-core');assert.ok(core.scale.y*1.2<=10,'low starter core leaves rising steel floors visible');
 assert.ok(map.builderScene.objects.some(object=>object.id==='construction-crew-job-board'));
});

test('ground paint remains below machinery collision clearance',()=>{
 const map=constructionWorld(),paint=map.builderScene.objects.filter(object=>/edge-[xz]-|haul-center-|parking-line-|crew-apron-edge-|steel-pad-stripe-|raft-stripe-|truck-loading-guide-/.test(object.id));
 assert.ok(paint.length>50,'all site bay, loading, parking and haul markings are checked');
 for(const mark of paint)assert.ok(mark.position.y+mark.scale.y*1.2<=.015,mark.id+' must not act as a raised wheel or track obstacle');
});

test('a crane worker walks around the native ground cab and erects four beams at the maximum simulation step',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'construction-crane-access-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const map=constructionWorld(),store=new SharedRoomStore(join(dir,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>1000});
 await runtime.command(map.id,map,{accountId:'manager',username:'Site manager',stats:{health:100}},{action:'join',requestId:'native-crane-access'});
 const sim=(await store.read())[map.id].simulation,crew=sim.construction.crew,worker=crew.workers.find(member=>member.id==='crew-maya'),job=crew.jobs.find(job=>job.id==='steel');
 crew.enabled=true;for(const member of crew.workers)member.enabled=member===worker;
 const context={environment:map,collision:runtime.collision,objects:{}},start={...worker.position};let now=1000,walked=0;
 for(let index=0;index<800&&job.status!=='completed';index++){
  now+=250;for(const player of Object.values(sim.players))player.lastSeen=now;
  const previous={...worker.position},walking=!worker.machineId;
  stepConstructionCrew(sim,now,.25,context);stepConstruction(sim,now,.25,context);
  if(walking&&!worker.machineId){const distance=Math.hypot(worker.position.x-previous.x,worker.position.z-previous.z);assert.ok(distance<=.351,'pedestrian moves at the normal walking speed');walked+=distance;}
 }
 assert.ok(walked>40&&Math.hypot(worker.position.x-start.x,worker.position.z-start.z)>40,'operator physically reaches the crane from the muster');
 assert.equal(job.status,'completed',JSON.stringify({position:worker.position,state:worker.state,message:worker.message,routeGoal:worker.routeGoal}));
 assert.equal(job.completed,4);assert.equal(sim.construction.tower.placed,4);assert.equal(sim.construction.tower.floors,1);
 assert.equal(Object.values(sim.actors).filter(actor=>actor.constructionBeam?.state==='placed').length,4);
});
