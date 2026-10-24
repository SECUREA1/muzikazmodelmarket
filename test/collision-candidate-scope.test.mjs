import test from 'node:test';
import assert from 'node:assert/strict';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {roadMovementBlocked} from '../server-road-vehicles.mjs';
import {followRoadRoute} from '../server-road-activity.mjs';

const crate=(id,x)=>({id,spawned:true,active:true,asset:{buildAssetId:'supply-crate'},position:{x,y:0,z:0},rotation:{y:0}});
const boat=(id,x,extra={})=>({id,modelId:'harbor-skiff',active:true,position:{x,y:0,z:0},rotation:{y:0},...extra});
const boxes=view=>view.boxes.map(box=>[box.objectId,...box.min.toArray(),...box.max.toArray()]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
const fixture=()=>({
 crate:crate('crate',0),
 boat:boat('boat',15,{trafficAI:true}),
 plane:{id:'plane',modelId:'piper-cub',active:true,position:{x:35,y:0,z:0},rotation:{y:0}},
 yacht:{id:'yacht',modelId:'harbor-yacht',active:true,holderId:'pilot',position:{x:60,y:0,z:0},rotation:{y:0}},
 machine:{id:'machine',modelId:'site-excavator',active:true,position:{x:90,y:0,z:0},rotation:{y:0},construction:{kind:'excavator',boom:.7,stick:-.8,bucket:0,swing:0}},
 resident:{id:'resident',modelId:'world-resident',spawned:true,trafficAI:true,active:true,position:{x:110,y:0,z:0},rotation:{y:0}}
});

test('a collision candidate scope retains native, traffic, occupied interiors and live construction poses',()=>{
 const scoped=new ServerBuilderCollision(),reference=new ServerBuilderCollision(),actors=fixture(),environment={id:'candidate-poses'};
 try{
  scoped.withActorCandidates(actors,()=>{
   const compare=()=>assert.deepEqual(boxes(scoped.placedWorld(actors,{},environment)),boxes(reference.placedWorld(actors,{},environment)));
   compare();
   actors.crate.position.x=6;actors.boat.position.z=12;actors.machine.construction.boom=1.1;actors.yacht.rotation.y=.6;
   compare();
   actors.crate.holderId='player';actors.boat.active=false;actors.machine.active=false;
   compare();
   delete actors.crate.holderId;actors.boat.active=true;actors.machine.active=true;
   compare();
  });
 }finally{scoped.clearPlacedWorlds();reference.clearPlacedWorlds();}
});

test('new scopes observe added, removed and replaced actors while other dictionaries use the normal path',()=>{
 const collision=new ServerBuilderCollision(),actors={crate:crate('crate',0)},environment={id:'candidate-membership'};
 try{
  collision.withActorCandidates(actors,()=>{
   assert.ok(collision.placedWorld(actors,{},environment).boxes.some(box=>box.objectId==='crate'));
   const different={boat:boat('boat',20)};
   assert.ok(collision.placedWorld(different,{},environment).boxes.some(box=>box.objectId==='boat'));
  });
  delete actors.crate;actors.added=crate('added',30);
  collision.withActorCandidates(actors,()=>assert.deepEqual([...new Set(collision.placedWorld(actors,{},environment).boxes.map(box=>box.objectId))],['added']));
  actors.added=crate('replacement',45);
  assert.throws(()=>collision.withActorCandidates(actors,()=>{throw Error('phase failed');}),/phase failed/);
  assert.equal(collision.actorCandidateScope,undefined,'an exception releases the phase');
  assert.deepEqual([...new Set(collision.placedWorld(actors,{},environment).boxes.map(box=>box.objectId))],['replacement']);
 }finally{collision.clearPlacedWorlds();}
});

test('repeated floor queries classify a large scene once per synchronous resident phase',()=>{
 const collision=new ServerBuilderCollision(),source={crate:crate('crate',40)},environment={id:'candidate-cost',proceduralLand:true,builderScene:{layout:'grand-floor',mapSize:100,objects:[]}};
 for(let index=0;index<1200;index++)source['decor-'+index]={id:'decor-'+index,modelId:'street-sign',active:true,position:{x:50,y:0,z:50}};
 let scans=0;const actors=new Proxy(source,{ownKeys(target){scans++;return Reflect.ownKeys(target);}});
 try{
  collision.withActorCandidates(actors,()=>{
   for(let query=0;query<20;query++){
    const floor=collision.groundAt(environment,{x:query*.1,y:0,z:0},{actors});
    assert.ok(floor&&Math.abs(floor.y-.02)<1e-6,'real local support is retained');
   }
  });
  assert.equal(scans,1,'floor/clearance queries must not rescan every scene actor');
  collision.placedWorld(actors,{},environment);assert.ok(scans>1,'the batch never escapes its explicit scope');
 }finally{collision.clearPlacedWorlds();}
});

test('road footprint probes batch candidates while excluding the moving car and retaining obstacles',()=>{
 const collision=new ServerBuilderCollision(),environment={id:'candidate-road-probe',proceduralLand:true,builderScene:{layout:'grand-floor',mapSize:100,objects:[]}},car={id:'car',modelId:'grand-tourer',asset:{buildAssetId:'grand-tourer'},spawned:true,active:true,position:{x:0,y:.02,z:0},rotation:{y:0}},obstacle=crate('obstacle',0),actors={car,obstacle};
 obstacle.position.z=-6;let batches=0;const batch=collision.withActorCandidates.bind(collision);
 collision.withActorCandidates=(others,probe)=>{batches++;assert.equal(others.car.active,false);assert.notStrictEqual(others,actors);return batch(others,probe);};
 try{
  assert.equal(roadMovementBlocked(collision,environment,actors,{},car,car.position,{x:0,y:.02,z:-.2},0),false);
  assert.equal(batches,1,'all twelve floor and clearance queries share one classification');
  assert.equal(car.active,true,'self exclusion cannot change the live vehicle');
  assert.equal(roadMovementBlocked(collision,environment,actors,{},car,car.position,{x:0,y:.02,z:-5},0),true,'the full swept footprint still catches a crate');
  assert.equal(collision.actorCandidateScope,undefined);
 }finally{collision.clearPlacedWorlds();}
});

test('road substeps restore their candidate scope after nested footprint checks',()=>{
 const collision=new ServerBuilderCollision(),environment={id:'candidate-road-follow',proceduralLand:true,streets:[{from:{x:0,z:20},to:{x:0,z:-40},width:8}],builderScene:{layout:'grand-floor',mapSize:100,objects:[]}},npc={id:'driver',modelId:'grand-tourer',asset:{buildAssetId:'grand-tourer'},spawned:true,trafficAI:true,active:true,position:{x:0,y:.02,z:0},rotation:{y:0},driving:{speed:0},roadRoute:[{x:0,z:0},{x:0,z:-30}],roadIndex:1},sim={actors:{driver:npc},players:{}};
 try{
  const ground=collision.groundAt.bind(collision);let scopedGroundQueries=0;
  collision.groundAt=(world,point,options)=>{assert.strictEqual(collision.actorCandidateScope?.actors,options.actors,'each ground query uses its current substep or nested footprint scope');scopedGroundQueries++;return ground(world,point,options);};
  followRoadRoute(sim,npc,environment,100000,.25,collision,{});
  assert.ok(npc.position.z<-.05,'the road crew still advances through real collision checks');assert.ok(scopedGroundQueries>=7);
  assert.equal(collision.actorCandidateScope,undefined);
 }finally{collision.clearPlacedWorlds();}
});
