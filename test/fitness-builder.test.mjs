import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FITNESS_ITEMS} from '../public/js/fitness-equipment.js';
import {createFitnessBuilderScene,editableFitnessScene,fitnessBuilderLayoutMeta} from '../public/js/fitness-builder.js';
import {FITNESS_STATIONS,fitnessStations} from '../public/js/fitness-config.js';
import {fitnessWorld} from '../fitness-world.mjs';
import {editableMapScene,nativeItemGameplay} from '../public/js/editable-map-import.js';
import {compileBuilderScene} from '../public/js/builder-gameplay-pipeline.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {createFitnessLand} from '../public/js/environments/fitness-land.js';

const world=scene=>({id:scene.id,game:'fitness',fitness:scene.sourceFitness,builderScene:scene});

test('fitness template includes all 26 gym items as independent editable assemblies and seven playable approaches',()=>{
 const scene=createFitnessBuilderScene({id:'builder-gym'}),models=new Set(scene.objects.map(object=>object.modelId));
 assert.equal(models.size,26);for(const id of Object.keys(FITNESS_ITEMS))assert.ok(models.has(id),id+' has an editable template object');
 assert.ok(scene.objects.every(object=>object.asset.buildAssetId===object.modelId&&object.metadata.upgradeable));
 assert.ok(scene.sourceFitness.editableStations&&scene.sourceFitness.editableEquipment);
 assert.ok(scene.objects.filter(object=>object.functionalSettings.fitnessStation).every(object=>object.functionalSettings.active===true),'primary stations stay active through Builder migration');
 assert.ok(scene.objects.filter(object=>object.functionalSettings.behavior==='decor').every(object=>object.functionalSettings.fitnessStation===false),'decorative copies override library training defaults');
 const stations=fitnessStations(world(scene));assert.equal(stations.length,7);
 for(const station of stations){const canonical=FITNESS_STATIONS.find(value=>value.kind===station.kind);assert.equal(station.position.x,canonical.position.x);assert.equal(station.position.z,canonical.position.z);}
 const manifest=compileBuilderScene(scene);assert.equal(manifest.actors.filter(actor=>actor.gameplay.fitnessStation).length,7);
});

test('copying the native gym upgrades only the draft to editable equipment',()=>{
 const source=fitnessWorld(),original=structuredClone(source),copy=editableMapScene(source,{id:'my-gold-gym'});
 assert.deepEqual(source,original,'authored gym remains unchanged');assert.equal(source.builderScene.objects.length,7);
 assert.ok(copy.objects.length>50);assert.ok(copy.objects.every(object=>!object.fitnessStation));
 assert.ok(copy.baseEnvironment.fitness.editableEquipment);assert.ok(copy.baseEnvironment.builderScene.layoutMeta.fitness.editableEquipment);
 const bench=copy.objects.find(object=>object.functionalSettings.fitnessStation==='bench-press');bench.position.x+=8;bench.scale.z=1.5;
 copy.objects=copy.objects.filter(object=>object.functionalSettings.fitnessStation!=='boxing');
 const restored=editableFitnessScene(copy),stations=fitnessStations(world(restored));
 assert.equal(restored.objects.length,copy.objects.length);assert.equal(stations.some(station=>station.kind==='boxing'),false,'deleted station stays deleted');
 assert.equal(stations.find(station=>station.kind==='bench-press').position.x,26);assert.equal(stations.find(station=>station.kind==='bench-press').position.z,-16);
 const empty=editableFitnessScene({...copy,objects:[]});assert.deepEqual(empty.objects,[],'cleared equipment does not repopulate');assert.deepEqual(fitnessStations(world(empty)),[]);
});

test('editable gym backdrop retains architecture without a second equipment copy',()=>{
 const scene=createFitnessBuilderScene(),root=createFitnessLand(world(scene));
 assert.ok(root.getObjectByName('FITNESS_WALKABLE_FLOOR'));assert.ok(root.getObjectByName('FITNESS_BACK_WALL'));
 for(const name of ['FITNESS_PRIMARY_BENCH','FITNESS_PRIMARY_ROWER','FITNESS_BOXING_RING_APRON','FITNESS_BALANCE_BEAM','FITNESS_LOCKER','FITNESS_RECEPTION_COUNTER','FITNESS_ACTIVITY_RING'])assert.equal(root.getObjectByName(name),undefined,name+' belongs to editable objects');
 assert.equal(root.userData.editableEquipment,true);
 const meta=fitnessBuilderLayoutMeta(scene,{name:'Gold Fitness Centre'});assert.ok(meta.fitness.editableEquipment);assert.equal(meta.locations.length,8);assert.equal(meta.residents.length,8);
});

test('fitness library metadata makes added equipment configurable and training capable',()=>{
 for(const [id,item]of Object.entries(FITNESS_ITEMS)){const metadata=nativeItemGameplay(id);assert.equal(metadata.category,'fitness');assert.equal(metadata.function_data.active,true,'added equipment overrides Builder inactive defaults');assert.equal(metadata.priceMzk,item.priceMzk);assert.equal(metadata.behavior,item.kind?'interact':'decor');if(item.kind){assert.equal(metadata.function_data.fitnessStation,item.kind);assert.ok(Number.isFinite(metadata.function_data.fitnessApproach.x));}}
 const html=readFileSync(new URL('../environment-builder.html',import.meta.url),'utf8'),js=readFileSync(new URL('../environment-builder.js',import.meta.url),'utf8');
 assert.match(html,/value="fitness-centre">★ Gold Fitness Centre/);assert.match(js,/createFitnessBuilderScene/);assert.match(js,/fitnessBuilderLayoutMeta\(sceneData/);
});

test('editable template uses physical equipment without blocking activity approaches or live entry',()=>{
 const scene=createFitnessBuilderScene(),map={...world(scene),spawn:scene.sourceSpawn,proceduralLand:true},collision=new ServerBuilderCollision();
 assert.deepEqual(collision.safeSpawn(map,map.spawn),{x:0,y:.02,z:32});
 for(const station of fitnessStations(map)){const floor=collision.groundAt(map,station.position,{entry:true});assert.ok(floor,station.kind+' has real floor');assert.ok(collision.hasBodyClearance(map,floor),station.kind+' approach remains clear of its editable equipment');}
});
