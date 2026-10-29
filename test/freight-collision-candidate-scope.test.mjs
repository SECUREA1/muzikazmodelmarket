import test from 'node:test';
import assert from 'node:assert/strict';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {createCargoTrailer,freightTrailerBlocked} from '../server-cargo-hauling.mjs';

function fixture(){
 const truck={id:'truck',modelId:'frontier-pickup',asset:{buildAssetId:'frontier-pickup'},spawned:true,trafficAI:true,active:true,position:{x:0,y:.02,z:0},rotation:{y:0}};
 const sim={actors:{truck},players:{}};
 createCargoTrailer(sim,'trailer',truck,{attached:true,trafficAI:true});
 const environment={id:'freight-candidate-scope',proceduralLand:true,builderScene:{layout:'grand-floor',mapSize:100,objects:[]}};
 return {truck,sim,environment};
}

test('all trailer footprint queries share one candidate batch with truck and trailer excluded',()=>{
 const {truck,sim,environment}=fixture(),collision=new ServerBuilderCollision();
 for(let index=0;index<1200;index++)sim.actors['decor-'+index]={id:'decor-'+index,modelId:'street-sign',active:true,position:{x:40,y:0,z:40}};
 const batch=collision.withActorCandidates.bind(collision),ground=collision.groundAt.bind(collision),clearance=collision.hasBodyClearance.bind(collision);
 let batches=0,groundQueries=0,clearanceQueries=0;
 collision.withActorCandidates=(others,probe)=>{
  batches++;assert.equal(others.truck.active,false);assert.equal(others.trailer.active,false);
  assert.notStrictEqual(others,sim.actors);
  return batch(others,probe);
 };
 collision.groundAt=(world,point,options)=>{
  assert.strictEqual(collision.actorCandidateScope?.actors,options.actors);
  groundQueries++;return ground(world,point,options);
 };
 collision.hasBodyClearance=(world,point,radius,placed)=>{
  assert.strictEqual(collision.actorCandidateScope?.actors,placed.actors);
  clearanceQueries++;return clearance(world,point,radius,placed);
 };
 try{
  assert.equal(freightTrailerBlocked(sim,truck,truck.position,{...truck.position,z:-.2},0,collision,environment),false);
  assert.equal(batches,1,'all twelve geometry queries classify the large actor list once');
  assert.equal(groundQueries,6);assert.equal(clearanceQueries,6);
  assert.equal(truck.active,true);assert.equal(sim.actors.trailer.active,true);
  assert.equal(collision.actorCandidateScope,undefined);
 }finally{collision.clearPlacedWorlds();}
});

test('candidate batching preserves real trailer collision and observes moved obstacles',()=>{
 const {truck,sim,environment}=fixture(),scoped=new ServerBuilderCollision(),reference=new ServerBuilderCollision();
 reference.withActorCandidates=undefined;
 const probe=collision=>freightTrailerBlocked(sim,truck,truck.position,{...truck.position,z:-.2},0,collision,environment);
 try{
  assert.equal(probe(scoped),false);assert.equal(probe(reference),false);
  sim.actors.crate={id:'crate',spawned:true,active:true,asset:{buildAssetId:'supply-crate'},position:{x:.9,y:0,z:6.85},rotation:{y:0}};
  assert.equal(probe(scoped),true);assert.equal(probe(reference),true);
  sim.actors.crate.position.x=20;
  assert.equal(probe(scoped),false);assert.equal(probe(reference),false);
 }finally{scoped.clearPlacedWorlds();reference.clearPlacedWorlds();}
});

test('a failed nested trailer probe restores the truck candidate scope',()=>{
 const {truck,sim,environment}=fixture(),collision=new ServerBuilderCollision();
 collision.groundAt=()=>{throw Error('floor query failed');};
 collision.withActorCandidates(sim.actors,()=>{
  const outer=collision.actorCandidateScope;
  assert.throws(()=>freightTrailerBlocked(sim,truck,truck.position,truck.position,0,collision,environment),/floor query failed/);
  assert.strictEqual(collision.actorCandidateScope,outer);
 });
 assert.equal(collision.actorCandidateScope,undefined);
});
