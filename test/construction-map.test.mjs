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

test('construction is a permanent public shared destination and searchable game map',async t=>{
 const map=constructionWorld(),registry=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url)));
 assert.deepEqual(registry.find(row=>row.id===map.id),map);
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
