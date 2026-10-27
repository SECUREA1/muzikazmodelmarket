import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {isWatercraft,harborWaterAt,harborForEnvironment,watercraftFootprint,watercraftSize} from '../public/js/harbor-water.js';
import {createBuilderModel,updateBuilderModels} from '../public/js/builder-models-3d.js';
import {HARBOR_HELM_POSES} from '../public/js/harbor-models.js';
import {stepBoatSimulation} from '../public/js/boat-simulation.js';
import {startBoatAssist,boatAssistedInput} from '../server-boat-assist.mjs';
import {harborRadio} from '../server-harbor-operations.mjs';
import {harborApproach,planBoatNavigation} from '../public/js/boat-navigation.js';
import {harborDestinations} from '../public/js/harbor-destinations.js';
import * as T from '../public/vendor/three/three.module.min.js';

const maps=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url),'utf8'));
const world=maps.find(map=>map.id==='tropical-island');
const authored=world.builderScene.objects.filter(isWatercraft);
const boatFixture=source=>({...structuredClone(source),active:true,health:200,maxHealth:200,holderId:'pilot',boating:{speed:0,anchor:true,throttle:0,throttleCommand:0}});

test('resort boats are native world actors with matching hulls and helm poses',()=>{
 assert.equal(authored.length,3);
 for(const source of authored){
  assert.ok(['resort-paddle-boat','resort-pontoon'].includes(source.modelId));
  assert.equal(source.functionalSettings.behavior,'vehicle');
  assert.equal(source.functionalSettings.interactionKey,'e');
  const model=createBuilderModel(source.modelId),bounds=new T.Box3().setFromObject(model),size=bounds.getSize(new T.Vector3());
  assert.equal(model.userData.watercraft,true);assert.deepEqual(model.userData.helmPose,HARBOR_HELM_POSES[source.modelId]);
  const [halfWidth,halfLength]=watercraftSize(source);
  assert.ok(size.x<=halfWidth*2+.15,'visual hull width agrees with physical footprint');
  assert.ok(size.z<=halfLength*2+.4,'visual hull length agrees with physical footprint');
  const group=new T.Group();group.add(model);model.userData.boatState={speed:2,rudder:.3,throttle:.5,wakeStrength:.4,rpm:60};updateBuilderModels(group,2);
  assert.equal(model.userData.boatAnimatedAt,2);assert.equal(model.userData.boatRig.wake.visible,true);
  if(source.modelId==='resort-paddle-boat')assert.notEqual(model.userData.boatRig.paddleWheel.rotation.x,0);
 }
});

test('the organic resort coast and both dock footprints share native boat-water checks',()=>{
 assert.equal(world.builderScene.layoutMeta.harbor,undefined,'resort AI and walking quests keep their authored organic floor');
 assert.equal(harborWaterAt(world,{x:0,z:0}),false);
 assert.equal(harborWaterAt(world,{x:43,z:10}),false);
 assert.equal(harborWaterAt(world,{x:43,z:20}),false);
 assert.equal(harborWaterAt(world,{x:60,z:0}),true);
 assert.equal(harborWaterAt(world,{x:0,z:-45}),true);
 assert.equal(harborWaterAt(world,{x:98,z:0}),false);
 assert.equal(harborWaterAt(world,{x:NaN,z:0}),false);
 for(const source of authored)for(const point of watercraftFootprint(source.position,source.rotation.y,source))assert.equal(harborWaterAt(world,point,.25),true,source.id+' starts with its complete hull afloat');
});

for(const source of authored)test(source.name+' uses shared helm, anchoring, mooring and route assistance',()=>{
 const boat=boatFixture(source),origin={...boat.position},player={actorId:'pilot',vehicleId:boat.id,input:{},position:{...boat.position},fuel:75};
 const sim={actors:{[boat.id]:boat},players:{pilot:player}};
 assert.ok(harborForEnvironment(world));assert.match(harborRadio(sim,player,world,'status'),/Palm Coast/);
 startBoatAssist(sim,player,world,'launch',100000,{collision:{blocksShot:()=>false}});
 assert.equal(boat.boating.anchor,false);
 for(let i=0;i<100;i++)Object.assign(boat,stepBoatSimulation(boat,boatAssistedInput(boat,{},world,100000+i*50,sim.actors),.05,{environment:world,now:100000+i*50}));
 assert.ok(boat.position.x>origin.x+1,'shared forward helm leaves the pier toward open water');
 assert.equal(boat.boating.impactDamage,0);
 for(let i=0;i<150;i++)Object.assign(boat,stepBoatSimulation(boat,{throttle:0,anchor:true},.05,{environment:world,now:110000+i*50}));
 assert.equal(boat.boating.speed,0);
 assert.match(harborRadio(sim,player,world,'moor'),/Moored safely/);
 assert.deepEqual(boat.position,origin,'mooring restores the native berth');
 assert.equal(boat.boating.anchor,true);
 assert.ok(harborDestinations(world,boat).some(place=>place.id==='open-water'));
 assert.ok(harborDestinations(world,boat).some(place=>place.id==='pontoon-club'));
 const goal=harborApproach(world,'open-water',boat);assert.ok(goal&&harborWaterAt(world,goal,.35));
 const plan=planBoatNavigation(boat,world,{destinationId:'open-water',actors:sim.actors});assert.ok(plan?.points?.length);
 assert.equal(harborApproach(world,'missing-port',boat),null);
});

test('pedal boats have a human scale speed limit and steer without consuming engine power',()=>{
 const boat=boatFixture(authored.find(source=>source.modelId==='resort-paddle-boat'));boat.position={x:65,y:0,z:0};boat.rotation.y=0;
 const originYaw=boat.rotation.y;
 for(let i=0;i<50;i++)Object.assign(boat,stepBoatSimulation(boat,{throttle:1,anchor:false,side:.3},.05,{environment:world,now:100000+i*50}));
 assert.equal(boat.boating.pedalDriven,true);assert.ok(boat.boating.rpm<=75);assert.ok(boat.boating.speed<=3.4);assert.notEqual(boat.rotation.y,originYaw);
 assert.ok(boat.boating.speed>0);
});
