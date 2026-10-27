import test from 'node:test';
import assert from 'node:assert/strict';
import {missileFactoryWorld} from '../missile-factory-world.mjs';
import {factoryProvingGroundsWorld,mountainCompoundWorld} from '../factory-testing-world.mjs';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {FACTORY_LOGISTICS_STATIONS,logisticsStations} from '../public/js/factory-logistics-config.js';
import {editableFactoryLogisticsScene,factoryLogisticsBuilderLayoutMeta} from '../public/js/factory-logistics-builder.js';
import {editableMapScene,nativeItemGameplay} from '../public/js/editable-map-import.js';
import {createFactoryBuilderScene} from '../public/js/missile-factory-builder.js';
import {createFactoryTestingBuilderScene} from '../public/js/factory-testing-builder.js';
import {GAME_ECONOMY} from '../game-economy.mjs';
import {FACTORY_LOGISTICS_ITEMS} from '../public/js/factory-logistics-items.js';
import {nativeBuilderItem} from '../public/js/native-builder-items.js';
import {marketFacets} from '../public/js/market-facets.js';

const environment=scene=>({id:scene.id,factoryLogistics:scene.sourceFactoryLogistics,builderScene:scene});
function dispose(root){const resources=new Set();root.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of [].concat(node.material||[]))if(material)resources.add(material);});for(const resource of resources)resource.dispose();}
function walk(collision,map,position,points){for(const [x,z]of points){const length=Math.hypot(x-position.x,z-position.z),steps=Math.ceil(length/.25),dx=(x-position.x)/Math.max(1,steps),dz=(z-position.z)/Math.max(1,steps);for(let i=0;i<steps;i++){const moved=collision.resolve(map,position,{x:position.x+dx,y:position.y,z:position.z+dz});position={x:moved.x,y:moved.floorY??moved.y,z:moved.z};}assert.ok(Math.hypot(position.x-x,position.z-z)<.15,'clear warehouse path to '+x+','+z+'; actual '+position.x+','+position.z);}return position;}

test('factory export and proving-ground certification desks have real clear approaches and connected receiving routes',()=>{
 const collision=new ServerBuilderCollision();
 for(const map of [missileFactoryWorld(),factoryProvingGroundsWorld(),mountainCompoundWorld()]){
  const stations=logisticsStations(map),expected=FACTORY_LOGISTICS_STATIONS.filter(station=>station.mapId===map.id);assert.equal(stations.length,expected.length);
  for(const station of stations){const canonical=expected.find(value=>value.kind===station.kind);assert.deepEqual(station.position,canonical.position);const floor=collision.groundAt(map,station.position,{entry:true});assert.ok(floor&&collision.hasBodyClearance(map,floor,.38),station.name+' has a clear physical operator point');}
 }
 const factory=missileFactoryWorld();walk(collision,factory,{...factory.spawn},[[-31,56],[-31,48]]);
 const range=factoryProvingGroundsWorld();walk(collision,range,{...range.spawn},[[-64,24],[-56,24],[-56,5]]);
 assert.ok(factory.builderScene.objects.some(object=>object.functionalSettings?.portal?.targetMapId==='hormuz-shipping'),'factory gateway connects to the existing shipping map');
 assert.equal(mountainCompoundWorld().builderScene.objects.some(object=>object.functionalSettings?.logisticsStation==='compound'&&object.position.z<-26),false,'receiving does not require deep-core access');
 for(const map of [factory,range,mountainCompoundWorld()])dispose(collision.world(map).root);
});

test('Builder copies move, rotate and remove logistics terminals without importing certificates or replacing deleted items',()=>{
 for(const map of [missileFactoryWorld(),factoryProvingGroundsWorld(),mountainCompoundWorld()]){
  const source=structuredClone(map),scene=editableMapScene(map,{id:'logistics-copy-'+map.id});assert.deepEqual(map,source);
  assert.ok(scene.sourceFactoryLogistics.editableStations&&scene.sourceFactoryLogistics.editableEquipment);
  const object=scene.objects.find(object=>object.functionalSettings?.logisticsStation);object.position={x:15,y:0,z:17};object.rotation.y=Math.PI/2;object.scale.z=2;
  const station=logisticsStations(environment(scene)).find(value=>value.objectId===object.id);assert.ok(Math.abs(station.position.x-22)<1e-8);assert.ok(Math.abs(station.position.z-17)<1e-8);
  scene.sourceFactoryLogistics.certificates=[{official:true}];scene.sourceFactoryLogistics.clearance={deep:true};scene.objects=scene.objects.filter(value=>value.id!==object.id);
  const restored=editableFactoryLogisticsScene(JSON.parse(JSON.stringify(scene)));assert.equal(restored.objects.length,scene.objects.length);assert.equal(restored.sourceFactoryLogistics.certificates,undefined);assert.equal(restored.sourceFactoryLogistics.clearance,undefined);
  const empty=editableFactoryLogisticsScene({...restored,objects:[]});assert.deepEqual(logisticsStations(environment(empty)),[]);
  const meta=factoryLogisticsBuilderLayoutMeta(restored,restored.layoutMeta);assert.equal(meta.locations.some(place=>place.logisticsStationId===station.id),false,'removed terminal marker stays removed');
 }
 const scenes=[createFactoryBuilderScene(),createFactoryTestingBuilderScene(),createFactoryTestingBuilderScene({kind:'compound'})];for(const scene of scenes)assert.ok(logisticsStations(environment(scene)).length,'standalone templates include their new terminals');
 const kiosk={id:'garden-certification',modelId:'factory-certification-kiosk',position:{x:4,y:0,z:7},functionalSettings:nativeItemGameplay('factory-certification-kiosk').function_data};
 const garden=editableFactoryLogisticsScene({id:'garden',layout:'grand-floor',objects:[kiosk]});assert.equal(garden.layout,'grand-floor');assert.equal(garden.objects.length,1,'adding a terminal does not import a native warehouse or other desks');assert.equal(logisticsStations(environment(garden)).length,1);
 const freight=editableFactoryLogisticsScene({id:'garden-crate',layout:'grand-floor',objects:[{id:'crate',modelId:'factory-freight-crate',functionalSettings:nativeItemGameplay('factory-freight-crate').function_data}]});assert.equal(freight.sourceFactoryLogistics,undefined,'a decorative crate does not enable terminal interactions');
});

test('new logistics items have a single priced native MZK offer and freight-market categorization',()=>{
 for(const [id,item]of Object.entries(FACTORY_LOGISTICS_ITEMS)){
  const offers=GAME_ECONOMY.filter(offer=>offer.buildAssetId===id);assert.equal(offers.length,1,id+' has one authoritative offer');const offer=offers[0],native=nativeBuilderItem(id),metadata=nativeItemGameplay(id);
  assert.equal(offer.priceMzk,item.priceMzk);assert.equal(offer.native,true);assert.equal(offer.builderCategory,'factory');assert.equal(metadata.function_data.logisticsStation,item.role||false);assert.equal(native.function_data.logisticsStation,item.role||false);assert.equal(offer.function_data.logisticsStation,item.role||false);assert.equal(marketFacets(offer).subcategory,'factory-logistics');
 }
});
