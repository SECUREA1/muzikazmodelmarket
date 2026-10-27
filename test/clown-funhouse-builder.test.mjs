import test from 'node:test';
import assert from 'node:assert/strict';
import {clownFunhouseWorld} from '../clown-funhouse-world.mjs';
import {editableMapScene} from '../public/js/editable-map-import.js';
import {FUNHOUSE_COMPONENT_PLACEMENTS,createFunhouseBuilderScene,editableFunhouseScene,funhouseBuilderLayoutMeta} from '../public/js/clown-funhouse-builder.js';
import {FUNHOUSE_STATIONS,funhouseStations} from '../public/js/clown-funhouse-config.js';
import {compileBuilderScene} from '../public/js/builder-gameplay-pipeline.js';
import {createBuilderLand} from '../public/js/environments/builder-land.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';

const environment=scene=>({id:scene.id,game:'funhouse',proceduralLand:true,spawn:scene.sourceSpawn,builderScene:scene});

test('copying the funhouse creates selectable assemblies without duplicating nested gallery and costume pieces',()=>{
 const source=clownFunhouseWorld(),original=structuredClone(source),copy=editableMapScene(source,{id:'my-carnival'});
 assert.deepEqual(source,original);assert.deepEqual(source.builderScene.objects,[]);
 assert.ok(copy.sourceFunhouse.editableItems);assert.ok(copy.baseEnvironment.builderScene.layoutMeta.funhouse.editableItems);
 const expected=FUNHOUSE_COMPONENT_PLACEMENTS.filter(placement=>placement.modelId!=='funhouse-midway-floor'&&!placement.includedIn);
 assert.equal(copy.objects.length,expected.length);assert.equal(new Set(copy.objects.map(object=>object.id)).size,copy.objects.length);
 for(const part of expected)assert.ok(copy.objects.some(object=>object.id===part.id&&object.asset.buildAssetId===part.modelId),part.id);
 for(const part of FUNHOUSE_COMPONENT_PLACEMENTS.filter(placement=>placement.includedIn))assert.ok(!copy.objects.some(object=>object.id===part.id),'nested '+part.id+' stays in its assembly');
 assert.equal(funhouseStations(environment(copy)).length,9);
 for(const station of funhouseStations(environment(copy))){const canonical=FUNHOUSE_STATIONS.find(value=>value.kind===station.kind);assert.ok(Math.hypot(station.position.x-canonical.position.x,station.position.y-canonical.position.y,station.position.z-canonical.position.z)<1e-8,station.kind);}
});

test('funhouse station transforms and deletions remain authoritative after saving the editable map',()=>{
 const scene=createFunhouseBuilderScene({id:'edited-carnival'}),gallery=scene.objects.find(object=>object.functionalSettings.funhouseStation==='water');
 gallery.position.x+=10;gallery.rotation.y=Math.PI/2;gallery.scale.z=2;
 scene.objects=scene.objects.filter(object=>object.functionalSettings.funhouseStation!=='maze-finish');
 const restored=editableFunhouseScene(scene),stations=funhouseStations(environment(restored));
 assert.equal(restored.objects.length,scene.objects.length);assert.ok(!stations.some(station=>station.kind==='maze-finish'));
 const moved=stations.find(station=>station.kind==='water');assert.ok(Math.abs(moved.position.x-(-2))<1e-8);assert.ok(Math.abs(moved.position.z-3)<1e-8);
 const meta=funhouseBuilderLayoutMeta(restored,{name:'Edited carnival'});assert.ok(meta.funhouse.editableItems);assert.equal(meta.locations.length,8);assert.ok(meta.locations.some(place=>place.funhouseStationId===moved.id&&place.x===moved.position.x));
 assert.deepEqual(editableFunhouseScene({...restored,objects:[]}).objects,[],'clearing a saved template never repopulates its equipment');
});

test('editable carnival keeps a real foundation and clear approaches while all attractions belong to placed objects',()=>{
 const scene=createFunhouseBuilderScene(),world=environment(scene),land=createBuilderLand(world);
 assert.ok(land.getObjectByName('BUILDER_WALKABLE_FLOOR_clown-funhouse'));
 for(const name of ['FUNHOUSE_GIANT_CLOWN_FACADE','FUNHOUSE_WATER_GALLERY','FUNHOUSE_CLOWN_CAR_COURT','FUNHOUSE_DIZZY_HAT_SPINNER'])assert.equal(land.getObjectByName(name),undefined,name+' is an editable assembly');
 const compiled=compileBuilderScene(scene);assert.equal(compiled.actors.filter(actor=>actor.gameplay.funhouseStation).length,9);
 const collision=new ServerBuilderCollision(),spawn=collision.safeSpawn(world,world.spawn);assert.ok(Math.hypot(spawn.x,spawn.z-48)<.01);
 for(const station of funhouseStations(world)){const floor=collision.groundAt(world,station.position,{entry:true});assert.ok(floor,station.kind+' has a floor');assert.ok(collision.hasBodyClearance(world,floor,.38),station.kind+' has a clear approach');}
 let position={...spawn};for(const [x,z]of [[0,40],[0,0],[0,-17],[-8,-19],[-4.5,-19],[-4.5,-28],[-22.5,-28],[-22.5,-38],[-18,-38]]){
  for(let attempts=0;attempts<1600&&Math.hypot(x-position.x,z-position.z)>.03;attempts++){const gap=Math.hypot(x-position.x,z-position.z),step=Math.min(.16,gap),next={...position,x:position.x+(x-position.x)/gap*step,z:position.z+(z-position.z)/gap*step};const resolved=collision.resolve(world,position,next,{});assert.ok(Math.hypot(resolved.x-position.x,resolved.z-position.z)>Math.min(.05,gap*.5),'editable maze blocked at '+JSON.stringify(position));position=resolved;}
  assert.ok(Math.hypot(x-position.x,z-position.z)<.03,'reached '+x+','+z);
 }
 land.traverse(node=>{node.geometry?.dispose();for(const material of [].concat(node.material||[]))material.dispose?.();});
});
