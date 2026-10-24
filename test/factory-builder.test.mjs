import test from 'node:test';
import assert from 'node:assert/strict';
import {createFactoryBuilderScene,editableFactoryScene,factoryBuilderLayoutMeta} from '../public/js/missile-factory-builder.js';
import {FACTORY_STATIONS,factoryStations,factoryCrew,isFactoryEnvironment} from '../public/js/missile-factory-config.js';
import {FACTORY_ITEMS,factoryItemSettings} from '../public/js/missile-factory-items.js';
import {editableMapScene} from '../public/js/editable-map-import.js';
import {missileFactoryWorld} from '../missile-factory-world.mjs';
import {compileBuilderScene} from '../public/js/builder-gameplay-pipeline.js';
import {createBuilderLand} from '../public/js/environments/builder-land.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';

const environment=scene=>({id:scene.id,factory:scene.sourceFactory,construction:scene.sourceConstruction,spawn:scene.sourceSpawn,proceduralLand:true,builderScene:scene});
function dispose(root){const resources=new Set();root.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of [].concat(node.material||[]))resources.add(material);});for(const resource of resources)resource?.dispose();}

test('factory template exposes every item, production station, crew member and vehicle as a separate object',()=>{
 const scene=createFactoryBuilderScene({id:'my-factory'}),world=environment(scene),models=new Set(scene.objects.map(object=>object.modelId));
 for(const id of Object.keys(FACTORY_ITEMS))assert.ok(models.has(id),id+' is independently selectable');
 assert.equal(scene.objects.length,18);assert.equal(new Set(scene.objects.map(object=>object.id)).size,18);
 assert.ok(scene.sourceFactory.editableStations&&scene.sourceFactory.editableEquipment&&scene.sourceFactory.editableCrew);
 assert.equal(factoryCrew(world).length,4);const stations=factoryStations(world);assert.equal(stations.length,6);
 for(const station of stations){const canonical=FACTORY_STATIONS.find(value=>value.kind===station.kind);assert.equal(station.position.x,canonical.position.x);assert.equal(station.position.z,canonical.position.z);}
 const actors=compileBuilderScene(scene).actors;assert.equal(actors.filter(actor=>actor.gameplay.factoryStation).length,6);assert.equal(actors.filter(actor=>actor.gameplay.factoryCrewId).length,4);assert.equal(actors.filter(actor=>actor.gameplay.behavior==='vehicle').length,4);
});

test('native map copies preserve factory and construction settings without mutating the permanent destination',()=>{
 const source=missileFactoryWorld(),original=structuredClone(source),copy=editableMapScene(source,{id:'factory-copy'});
 assert.deepEqual(source,original);assert.equal(copy.sourceGame,'missile-factory');assert.equal(copy.sourceLayout,'missile-factory');assert.deepEqual(copy.sourceConstruction,source.construction);assert.deepEqual(copy.sourceSpawn,source.spawn);
 assert.ok(copy.baseEnvironment.factory.editableEquipment);assert.equal(factoryStations(environment(copy)).length,6);assert.equal(factoryCrew(environment(copy)).length,4);
 const fabrication=copy.objects.find(object=>object.id==='factory-fabrication');fabrication.position={x:12,y:0,z:14};fabrication.rotation.y=Math.PI/2;fabrication.scale.z=2;
 copy.objects=copy.objects.filter(object=>object.id!=='factory-calibration'&&object.id!=='factory-tech-iona');
 const restored=editableFactoryScene(JSON.parse(JSON.stringify(copy))),stations=factoryStations(environment(restored)),moved=stations.find(station=>station.kind==='fabrication');
 assert.equal(stations.length,5);assert.ok(Math.abs(moved.position.x-19)<1e-8);assert.ok(Math.abs(moved.position.z-14)<1e-8);assert.equal(factoryCrew(environment(restored)).length,3);
 assert.equal(restored.objects.length,copy.objects.length);const empty=editableFactoryScene({...restored,objects:[]});assert.deepEqual(empty.objects,[]);assert.deepEqual(factoryStations(environment(empty)),[]);assert.deepEqual(factoryCrew(environment(empty)),[]);
});

test('saved local maps follow edited production stations and keep yard settings and disabled people',()=>{
 const scene=createFactoryBuilderScene(),dispatch=scene.objects.find(object=>object.id==='factory-dispatch');dispatch.position.x=19;dispatch.functionalSettings.factoryApproach.z=5;
 scene.objects.find(object=>object.id==='factory-machinist-dex').functionalSettings.active=false;
 scene.objects=scene.objects.filter(object=>object.id!=='factory-procurement');scene.sourceConstruction.supply.x=-70;
 const meta=factoryBuilderLayoutMeta(scene,{name:'My factory'}),marker=meta.locations.find(place=>place.name===dispatch.name);
 assert.equal(marker.x,19);assert.equal(marker.z,29.5);assert.equal(meta.locations.some(place=>place.name==='Procurement & jobs'),false);
 assert.equal(meta.residents.length,3);assert.equal(meta.construction.supply.x,-70);
 const second=factoryBuilderLayoutMeta({...scene,layoutMeta:meta},meta);assert.deepEqual(second.locations,meta.locations,'saving repeatedly does not duplicate station map markers');
});

test('individually placed stations enable production on ordinary maps while collectibles keep normal map behavior',()=>{
 const missile={id:'display',modelId:'factory-training-missile',position:{x:0,y:0,z:0},functionalSettings:factoryItemSettings('factory-training-missile')},plain={id:'my-garden',layout:'grand-floor',mapSize:40,objects:[missile]};
 const decor=editableFactoryScene(plain);assert.equal(decor.sourceFactory,undefined);assert.equal(isFactoryEnvironment({id:decor.id,builderScene:decor}),false);
 const station={id:'my-press',modelId:'factory-fabricator',position:{x:7,y:0,z:8},functionalSettings:factoryItemSettings('factory-fabricator')},scene=editableFactoryScene({...plain,objects:[station]});
 assert.equal(scene.layout,'grand-floor');assert.equal(scene.sourceLayout,undefined);assert.equal(scene.objects.length,1);assert.equal(factoryStations(environment(scene)).length,1);assert.equal(factoryCrew(environment(scene)).length,0);
 const land=createBuilderLand(environment(scene));assert.equal(land.userData.layout,'grand-floor');assert.equal(land.getObjectByName('FACTORY_HALL_BACK_WALL'),undefined);dispose(land);
});

test('editable factory equipment has clear physical approaches and no fixed equipment duplicates',()=>{
 const scene=createFactoryBuilderScene(),world=environment(scene),collision=new ServerBuilderCollision(),root=createBuilderLand(world);
 assert.equal(root.userData.editableEquipment,true);assert.equal(root.getObjectByName('FACTORY_SHOWCASE_CARGO_ROCKET'),undefined);
 for(const station of factoryStations(world)){const floor=collision.groundAt(world,station.position,{entry:true});assert.ok(floor,station.kind+' has physical support');assert.ok(collision.hasBodyClearance(world,floor,.38),station.kind+' operator approach remains clear');}
 dispose(root);dispose(collision.world(world).root);
});
