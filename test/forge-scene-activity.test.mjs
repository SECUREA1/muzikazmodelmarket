import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {forgeVisualActivities,createForgeSceneActivity} from '../public/js/forge-scene-activity.js';
import {FORGE_STATIONS} from '../public/js/forge-config.js';
import {createForgeModel} from '../public/js/forge-models.js';

const environment=()=>({id:'traditional-forge',game:'forge',builderScene:{objects:FORGE_STATIONS.map(station=>({id:station.id,modelId:station.modelId,position:{...station.position},functionalSettings:{forgeStation:station.kind,forgeApproach:{x:0,y:0,z:5}}})),layoutMeta:{}}});
const at=kind=>FORGE_STATIONS.find(station=>station.kind===kind).approach;
const actorFor=(stage,now,fields={})=>({id:'smith',position:{...at(stage)},forge:{job:{id:'workpiece-one',environmentId:'traditional-forge',buildAssetId:'forge-dagger',stage,status:'awaiting',startedAt:now-12000,completedStages:[],strikes:0,requiredStrikes:6,...fields}}});
const dispose=root=>root?.traverse(node=>{node.geometry?.dispose();for(const material of [].concat(node.material||[]))material.dispose?.();});
function sceneFixture(){
 const env=environment(),parent=new THREE.Group(),roots=FORGE_STATIONS.map(station=>{const root=createForgeModel(station.modelId);root.userData.builderObjectId=station.id;root.position.copy(station.position);parent.add(root);return root;});
 let reduced=false;
 const activity=createForgeSceneActivity({getRoots:()=>roots,getEnvironment:()=>env,getReducedMotion:()=>reduced,createItem:id=>createForgeModel(id)});
 return {env,parent,roots,activity,reduced:value=>reduced=value,root:kind=>roots.find(root=>root.userData.builderObjectId==='forge-'+kind),finish(){activity.dispose();roots.forEach(dispose);}};
}

test('visual activities honor exact processing stations, moved or disabled work bays and actual accepted transitions',()=>{
 const now=100000,env=environment(),player=actorFor('heat',now,{status:'processing',stationId:'forge-heat',cycleStartedAt:now-1000,readyAt:now+3000});
 const original=structuredClone(player),snapshot={serverTime:now,players:{smith:player},actors:{}};
 assert.equal(forgeVisualActivities(snapshot,env).stations.find(station=>station.kind==='heat').jobId,'workpiece-one');
 env.builderScene.objects.find(object=>object.id==='forge-heat').position.x=300;
 assert.equal(forgeVisualActivities(snapshot,env).stations.find(station=>station.kind==='heat').stationId,'forge-heat','processing follows its actual saved station identity');
 env.builderScene.objects.find(object=>object.id==='forge-heat').functionalSettings.active=false;
 assert.ok(!forgeVisualActivities(snapshot,env).stations.some(station=>station.kind==='heat'));
 player.forge.job={...player.forge.job,stage:'temper',status:'awaiting',lastStrikeAt:now-100,completedStages:[{stage:'quench',at:now-200}]};player.position={...at('temper')};
 const completed=forgeVisualActivities(snapshot,env);assert.ok(completed.stations.some(station=>station.kind==='hammer'&&station.status==='struck'));assert.ok(completed.stations.some(station=>station.kind==='quench'&&station.status==='cooling'));
 assert.equal(original.forge.job.stage,'heat','derivation never mutates the original source');
 const frozen=JSON.stringify(snapshot);forgeVisualActivities(snapshot,env);assert.equal(JSON.stringify(snapshot),frozen);
});

test('accepted heating, hammering, quenching, tempering and completion animate real native rigs',()=>{
 const f=sceneFixture(),now=100000;
 try{
  let player=actorFor('heat',now,{status:'processing',stationId:'forge-heat',cycleStartedAt:now-2000,readyAt:now+2000});
  const update=()=>{f.activity.update({serverTime:now,players:{smith:player},actors:{}},'smith',f.env);f.activity.tick(10);return f.activity.snapshot();};
  let view=update();assert.ok(view.stations.some(station=>station.kind==='heat'&&station.processing&&station.pose.workpiece));
  const flame=f.root('heat').getObjectByName(f.root('heat').userData.forgeRig.flame);assert.ok(flame.visible&&flame.scale.y>.5);
  player=actorFor('hammer',now,{lastStrikeAt:now-120,strikes:3});view=update();
  const hammer=view.stations.find(station=>station.kind==='hammer');assert.ok(hammer.sparkOpacity>0);assert.ok(hammer.pose.workpiece);assert.notEqual(hammer.pose.hammer, f.root('hammer').getObjectByName(f.root('hammer').userData.forgeRig.hammer).userData.forgeRestRotation?.[2]);
  player=actorFor('temper',now,{completedStages:[{stage:'quench',at:now-250}]});view=update();assert.ok(view.stations.find(station=>station.kind==='quench').steamOpacity>0);
  player=actorFor('temper',now,{status:'processing',stationId:'forge-temper',cycleStartedAt:now-1000,readyAt:now+2500});view=update();assert.ok(Number.isFinite(view.stations.find(station=>station.kind==='temper').pose.gauge));
  player=actorFor('finish',now,{status:'collected',collectedAt:now});view=update();assert.equal(view.stations.find(station=>station.kind==='finish').workpieceId,'forge-dagger');
  const product=f.root('finish').getObjectByName('FORGE_CONFIRMED_FINISHED_ITEM');assert.ok(product?.children.length);assert.equal(product.userData.forgeFinishedItemId,'forge-dagger');product.traverse(node=>assert.equal(node.userData.collisionDisabled,true));
  f.activity.reset();assert.equal(f.root('finish').getObjectByName('FORGE_CONFIRMED_FINISHED_ITEM'),undefined);assert.equal(f.activity.snapshot().activeJobs,0);
 }finally{f.finish();}
});

test('AI demonstration never overrides real work and reduced motion keeps heat treatment legible without particles',()=>{
 const f=sceneFixture(),now=100000;
 try{
  const demonstration={id:'master',active:true,resident:{forgeActivity:{phase:'working',kind:'hammer',stationId:'forge-hammer',startedAt:now-5000,cycleMs:7000}}};
  const snapshot={serverTime:now,players:{},actors:{master:demonstration}};
  f.activity.update(snapshot,'smith',f.env);f.activity.tick(1);assert.equal(f.activity.snapshot().demonstrations,1);assert.equal(f.activity.snapshot().activeJobs,0);
  snapshot.players.smith=actorFor('hammer',now,{lastStrikeAt:now-100,strikes:2});f.reduced(true);f.activity.update(snapshot,'smith',f.env);f.activity.tick(2);
  const view=f.activity.snapshot(),hammer=view.stations.find(station=>station.kind==='hammer');assert.equal(hammer.demonstration,false);assert.equal(hammer.sparkOpacity,0);assert.ok(hammer.pose.workpiece);assert.equal(view.reducedMotion,true);
  assert.equal(demonstration.resident.forgeActivity.phase,'working');assert.equal(snapshot.players.smith.forge.job.strikes,2);
 }finally{f.finish();}
});

test('shipping yard crates follow counted ledger stock and disappear when allocated without changing the ledger',()=>{
 const env=environment(),parent=new THREE.Group(),roots=[];
 const slots=Array.from({length:3},(_,index)=>({id:'pallet-'+index,objectId:'pallet-'+index,position:{x:index*3,y:0,z:0}}));
 env.builderScene.layoutMeta.forgeYard={cargoSlots:slots};
 for(const slot of slots){const pallet=new THREE.Mesh(new THREE.BoxGeometry(2,.2,2),new THREE.MeshStandardMaterial());pallet.userData.builderObjectId=slot.id;pallet.position.copy(slot.position);parent.add(pallet);roots.push(pallet);}
 const activity=createForgeSceneActivity({getRoots:()=>roots,createItem:id=>{if(id!=='factory-freight-crate')return null;const crate=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial());return crate;}});
 try{
  activity.update({serverTime:1000,players:{},actors:{}},null,env);
  const data={warehouse:{sealedUnits:7,availableUnits:5,allocatedUnits:2,deliveredUnits:0},shipments:[]},original=structuredClone(data);
  activity.updateSupply(data);activity.tick(1);assert.equal(activity.snapshot().warehouse.visibleCrates,3);assert.deepEqual(data,original);
  data.warehouse.availableUnits=0;data.warehouse.allocatedUnits=7;activity.updateSupply(data);activity.tick(2);assert.equal(activity.snapshot().warehouse.visibleCrates,0);assert.ok(roots.every(root=>root.children.length===0));
 }finally{activity.dispose();roots.forEach(dispose);}
});

test('idle and completed station effects stay finite and within the workshop bounds',()=>{
 const f=sceneFixture(),now=Date.UTC(2026,9,31,12);
 const bounded=()=>{
  for(const root of f.roots)root.traverse(node=>{
   if(!node.userData.forgePresentationOnly)return;
   assert.ok([...node.position,...node.scale,node.rotation.x,node.rotation.y,node.rotation.z].every(Number.isFinite),node.name+' finite effect transform');
   assert.ok([...node.position,...node.scale].every(value=>Math.abs(value)<10),node.name+' bounded local effect transform');
   const positions=node.geometry?.attributes?.position;
   if(positions)for(let index=0;index<positions.count;index++)assert.ok([positions.getX(index),positions.getY(index),positions.getZ(index)].every(value=>Number.isFinite(value)&&Math.abs(value)<10),node.name+' bounded effect vertices');
  });
 };
 try{
  f.activity.update({serverTime:now,players:{},actors:{}},null,f.env);f.activity.tick(0);bounded();
  const player=actorFor('temper',now,{lastStrikeAt:now-100,completedStages:[{stage:'quench',at:now-150}]});
  f.activity.update({serverTime:now,players:{smith:player},actors:{}},'smith',f.env);f.activity.tick(.1);bounded();
  f.activity.update({serverTime:now+60000,players:{},actors:{}},null,f.env);f.activity.tick(60);bounded();
  const ripple=f.root('quench').getObjectByName('FORGE_QUENCH_WATER_RIPPLE');assert.equal(ripple.visible,false);assert.equal(ripple.scale.x,1);
  const bounds=new THREE.Box3().setFromObject(f.parent);assert.ok([...bounds.min,...bounds.max].every(Number.isFinite));assert.ok(bounds.getSize(new THREE.Vector3()).length()<150);
  f.activity.reset();bounded();assert.equal(f.root('quench').getObjectByName('FORGE_ACCEPTED_WORK_EFFECTS'),undefined);assert.equal(f.root('hammer').getObjectByName('FORGE_ACCEPTED_WORK_EFFECTS'),undefined);
 }finally{f.finish();}
});
