import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {factoryProvingGroundsWorld,mountainCompoundWorld} from '../factory-testing-world.mjs';
import {missileFactoryWorld} from '../missile-factory-world.mjs';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {PROVING_ID,COMPOUND_ID,PROVING_COUNTDOWN_MS,PROVING_FLIGHT_MS,testingStations,testingTargets} from '../public/js/factory-test-config.js';
import {createFactoryProvingGroundsLand} from '../public/js/factory-testing-model.js';

function dispose(root){const resources=new Set();root.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of [].concat(node.material||[]))if(material)resources.add(material);});for(const resource of resources)resource.dispose();}
function walk(collision,map,position,waypoints,label){for(const [x,z]of waypoints){const distance=Math.hypot(x-position.x,z-position.z),steps=Math.ceil(distance/.25),dx=(x-position.x)/Math.max(1,steps),dz=(z-position.z)/Math.max(1,steps);for(let i=0;i<steps;i++){const next=collision.resolve(map,position,{x:position.x+dx,y:position.y,z:position.z+dz});position={x:next.x,y:Number.isFinite(next.floorY)?next.floorY:next.y,z:next.z};}assert.ok(Math.hypot(position.x-x,position.z-z)<.16,label+' reaches '+x+','+z+'; actual '+position.x+','+position.z);}return position;}

test('permanent destinations are registered together with reciprocal factory travel and a secure compound entrance',()=>{
 const range=factoryProvingGroundsWorld(),compound=mountainCompoundWorld(),factory=missileFactoryWorld(),registry=JSON.parse(readFileSync(new URL('../public/models/environments/environments.json',import.meta.url)));
 for(const map of [range,compound,factory])assert.deepEqual(registry.find(row=>row.id===map.id),map);
 assert.equal(range.adjacentTo,factory.id);assert.equal(compound.adjacentTo,range.id);
 assert.ok(factory.builderScene.objects.some(object=>object.functionalSettings?.portal?.targetMapId===PROVING_ID));
 assert.ok(range.builderScene.objects.some(object=>object.functionalSettings?.portal?.targetMapId===factory.id));
 assert.equal(range.builderScene.objects.some(object=>object.functionalSettings?.portal?.targetMapId===COMPOUND_ID),false,'mountain hatch is an authenticated command station');
 assert.ok(compound.builderScene.objects.some(object=>object.functionalSettings?.portal?.targetMapId===PROVING_ID),'return lift stays available');
 const hatch=testingStations(range).find(station=>station.kind==='hatch');assert.deepEqual(hatch.position,{x:50,y:.02,z:25});
});

test('all proving-ground stations have clear approaches and connect through the bunker doorway',()=>{
 const map=factoryProvingGroundsWorld(),collision=new ServerBuilderCollision(),stations=testingStations(map),targets=testingTargets(map);assert.equal(stations.length,4);assert.equal(targets.length,2);
 for(const station of stations){const floor=collision.groundAt(map,station.position,{entry:true});assert.ok(floor,station.kind+' has physical support');assert.ok(collision.hasBodyClearance(map,floor,.38),station.kind+' has a clear operator point');}
 const start=collision.safeSpawn(map,map.spawn);const setup=walk(collision,map,start,[[-42,35]],'preparation');
 const control=walk(collision,map,setup,[[-24,35],[-24,18]],'control bunker');
 const pad=walk(collision,map,control,[[-24,30],[0,30],[0,-10]],'launch pad');
 walk(collision,map,pad,[[0,35],[50,35],[50,25]],'locked mountain entrance');dispose(collision.world(map).root);
});

test('factory east gate has a real fence opening and a clear pedestrian route around the yard machines',()=>{
 const map=missileFactoryWorld(),collision=new ServerBuilderCollision();
 const end=walk(collision,map,{x:45,y:.02,z:38},[[54,38],[74,38],[79,38]],'east proving-ground gate');assert.ok(end.x>76,'the authored fence has a usable opening');dispose(collision.world(map).root);
});

test('shared launch visuals use the server flight clock, target position and result phase',()=>{
 const environment=factoryProvingGroundsWorld(),root=createFactoryProvingGroundsLand(environment),stations=testingStations(environment),targets=testingTargets(environment),pad=stations.find(station=>station.kind==='pad'),target=targets.find(value=>value.kind==='accuracy'),launchAt=10000,flightEndsAt=launchAt+PROVING_FLIGHT_MS,session={status:'countdown',buildAssetId:'factory-training-missile',profileId:'accuracy',padId:pad.id,targetId:target.id,launchAt,flightEndsAt,endsAt:flightEndsAt+2000,impactPosition:{x:2,y:.02,z:-68}};
 const clock=at=>{root.userData.setFactoryTestingState({testing:{stations,targets,sessions:[{session}]}},at);root.userData.updateTestingEffects(2,false,at);};
 clock(launchAt-PROVING_COUNTDOWN_MS);const flight=root.getObjectByName('PROVING_SHARED_FLIGHT');assert.equal(flight.visible,true);assert.equal(root.getObjectByName('PROVING_EXHAUST').visible,false);
 clock(launchAt+PROVING_FLIGHT_MS/2);assert.ok(flight.position.y>30);assert.ok(Math.abs(flight.position.x-1)<.001);assert.ok(Math.abs(flight.position.z+39)<.001);assert.equal(root.getObjectByName('PROVING_EXHAUST').visible,true);
 clock(flightEndsAt+500);const pulse=root.getObjectByName('PROVING_TARGET_RESULT_PULSE');assert.equal(pulse.visible,true);assert.equal(pulse.position.x,2);assert.equal(pulse.position.z,-68);
 assert.equal(root.getObjectByName('PROVING_BUNKER_OPAQUE_ROOF'),undefined);dispose(root);
});
