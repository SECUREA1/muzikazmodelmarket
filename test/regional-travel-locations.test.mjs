import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {regionalTravelLocations} from '../regional-travel-locations.mjs';
import {GENERATED_EXPERIENCE_VERSION} from '../generated-world-experiences.mjs';
import {WORLD_DISTRICTS} from '../world-districts.mjs';
import {WorldAtlas} from '../world-atlas.mjs';
import {synchronizeWorldDirectory} from '../world-directory.mjs';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
import {isRoadVehicle,stepRoadVehicle} from '../public/js/road-vehicles.js';
import {roadMovementBlocked} from '../server-road-vehicles.mjs';
import {roadNetwork,roadPath,nearestRoadNode} from '../public/js/road-network.js';

test('all eight regional courier courts and annexes have real roads, a public pickup and a clear map arrival',()=>{
 const models=new Set();
 for(const region of WORLD_DISTRICTS)for(const page of [0,1]){
  const result=regionalTravelLocations({id:'world-district-'+region.id+(page?'-2':''),atlasDistrict:{id:region.id,page}});
  assert.ok(result);assert.equal(result.locations.length,3);assert.ok(result.objects.length<=12,'courts remain within a small shared-model budget');
  assert.equal(new Set(result.objects.map(object=>object.id)).size,result.objects.length);
  assert.equal(result.streets.length,2);assert.deepEqual(result.streets[0].from,{x:0,z:-44});
  const pickup=result.objects.find(object=>isRoadVehicle(object));assert.ok(pickup);assert.equal(pickup.functionalSettings.behavior,'vehicle');assert.equal(pickup.rotation.y,Math.PI);
  assert.ok(pickup.position.z+3<-46.5,'parked vehicle remains clear of Courier Road');
  assert.ok(Math.hypot(result.locations[1].arrival.x-pickup.position.x,result.locations[1].arrival.z-pickup.position.z)>3,'map arrival is beside the truck');
  for(const location of result.locations){assert.deepEqual(location.modes,['road','foot']);assert.equal(location.regionId,region.id);assert.equal(location.kind,'transport');}
  for(const object of result.objects){models.add(object.modelId);assert.ok(Object.values(object.position).every(Number.isFinite));assert.ok(!object.functionalSettings.portal,'dispatch directions use the actual district gateway buildings');}
 }
 assert.equal(regionalTravelLocations({id:'public-commons'}),null);
 for(const id of models){const root=createBuilderModel(id);assert.ok(root,id+' is a real native model');root.traverse(node=>{node.geometry?.dispose();for(const material of Array.isArray(node.material)?node.material:[node.material])material?.dispose();});}
});

test('existing atlas migration adds roads and locations once, retaining saved objects, gateways and player streets across restart',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'regional-courts-'));t.after(()=>rm(dir,{recursive:true,force:true}));const file=join(dir,'atlas.json'),atlas=new WorldAtlas(file);
 await synchronizeWorldDirectory(atlas,[]);const state=await atlas.read(),cell=Object.values(state.cells).find(cell=>cell.mapId==='world-district-volt-city');
 const memberStreet={id:'regional-courier-player-street',createdBy:'account:member',name:'Member crossing',from:{x:24,z:0},to:{x:24,z:12},width:3};
 cell.streets.push(memberStreet);cell.environment.builderScene.objects.push({id:'member-saved-lamp',modelId:'lamp-post',position:{x:18,y:0,z:-8},functionalSettings:{behavior:'decor'}});
 cell.environment.builderScene.publicExperienceVersion=GENERATED_EXPERIENCE_VERSION-1;cell.environment.builderScene.objects=cell.environment.builderScene.objects.filter(object=>!object.id.startsWith('public-experience-regional-'));
 cell.streets=cell.streets.filter(street=>street.createdBy||!street.id.startsWith('regional-courier-'));state.revision++;await writeFile(file,JSON.stringify(state));
 const restored=new WorldAtlas(file),directory=await synchronizeWorldDirectory(restored,[]),world=directory.environments.find(map=>map.id===cell.mapId),updated=await restored.read(),saved=Object.values(updated.cells).find(cell=>cell.mapId===cell.mapId);
 assert.equal(world.builderScene.publicExperienceVersion,GENERATED_EXPERIENCE_VERSION);assert.ok(world.builderScene.objects.some(object=>object.id==='member-saved-lamp'));assert.ok(world.builderScene.objects.some(object=>object.atlasDestination));
 assert.equal(world.builderScene.layoutMeta.locations.filter(location=>location.kind==='transport').length,3);
 assert.equal(world.streets.filter(street=>street.id==='regional-courier-road').length,1);assert.deepEqual(world.streets.find(street=>street.id===memberStreet.id),memberStreet);assert.deepEqual(saved.environment.builderScene.streets,saved.streets);
 await synchronizeWorldDirectory(restored,[]);assert.equal((await restored.read()).revision,updated.revision,'reopening does not rewrite or duplicate the migrated district');
 const reopened=new WorldAtlas(file);await synchronizeWorldDirectory(reopened,[]);assert.equal((await reopened.read()).revision,updated.revision,'cold restart retains the same district roads and scenes');
});

test('full regional scenes retain collision-clear roads and gateway approaches beside the new courier courts',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'regional-court-collision-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const atlas=new WorldAtlas(join(dir,'atlas.json')),published=Array.from({length:35},(_,index)=>({id:'regional-test-map-'+index,name:'Volt courier destination '+index,worldId:'volt-city',source:'custom-builder',visibility:'public',builderScene:{layout:'grand-floor',objects:[]}})),{environments}=await synchronizeWorldDirectory(atlas,published);
 assert.ok(environments.some(map=>map.atlasDistrict?.page),'dense destination regions keep usable annexes');
 for(const environment of environments.filter(map=>map.atlasDistrict)){
  const collision=new ServerBuilderCollision(),physical=collision.world(environment);
  try{
   const pickup=environment.builderScene.objects.find(object=>object.id.includes('public-experience-regional-')&&isRoadVehicle(object));assert.ok(pickup,environment.id+' pickup');
   for(const x of [0,2,4,6,8,10,12,14,16]){
    const floor=collision.groundAt(environment,{x,y:.1,z:-44});assert.ok(floor,environment.id+' road floor '+x);assert.ok(collision.hasBodyClearance(environment,floor,.5),environment.id+' Courier Road stays clear at '+x);
   }
   const junction=collision.meetingPosition(environment,{x:0,y:0,z:-44});assert.ok(Math.hypot(junction.x,junction.z+44)<.1,environment.id+' junction is reachable');
   const network=roadNetwork(environment),route=roadPath(network,nearestRoadNode(network,pickup.position),nearestRoadNode(network,{x:0,z:0}));assert.ok(route.length>=3,environment.id+' pickup bay joins the district road graph');
   const vehicle={...pickup,asset:{buildAssetId:pickup.modelId},health:300,active:true,position:{...pickup.position},rotation:{...pickup.rotation},driving:{speed:0,parked:false}},actors={[vehicle.id]:vehicle};
   vehicle.position=collision.groundAt(environment,vehicle.position,{actors:{[vehicle.id]:{...vehicle,active:false}}});
   for(let tick=0;tick<40&&vehicle.position.z<-44.8;tick++)Object.assign(vehicle,stepRoadVehicle(vehicle,{forward:1},.1,{speedLimit:3.5,groundAt:point=>collision.groundAt(environment,point,{actors:{[vehicle.id]:{...vehicle,active:false}}}),blocked:(from,to,yaw)=>roadMovementBlocked(collision,environment,actors,{},vehicle,from,to,yaw)}));
   assert.ok(vehicle.position.z>-45,environment.id+' actual pickup drives out of its bay onto Courier Road');assert.ok(!vehicle.driving.blocked,environment.id+' pickup physical footprint remains clear');
   for(const gateway of environment.builderScene.objects.filter(object=>object.atlasDestination)){
    // New court parts never intrude into a gateway's doorway approach.
    for(const object of environment.builderScene.objects.filter(object=>object.id.startsWith('public-experience-regional-'))){
     const root=physical.root.children.find(root=>root.userData.builderObjectId===object.id);if(!root)continue;const bounds=new THREE.Box3().setFromObject(root),approach={x:gateway.position.x,z:gateway.position.z-4};
     assert.ok(approach.x<bounds.min.x-.6||approach.x>bounds.max.x+.6||approach.z<bounds.min.z-.6||approach.z>bounds.max.z+.6,environment.id+' '+object.id+' leaves gateway approach clear');
    }
   }
  }finally{const resources=new Set();physical.root.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of Array.isArray(node.material)?node.material:[node.material])if(material)resources.add(material);});for(const resource of resources)resource.dispose?.();}
 }
});
