import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';

const close=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<1e-7,`${label}: ${actual} versus ${expected}`);
const machine=(id,modelId,x,z)=>({id,modelId,position:{x,y:0,z},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},behavior:'vehicle',asset:{buildAssetId:modelId,type:'vehicles'}});
function ledger(state){
 let soil=0,gravel=0;for(const patch of state.construction.earthworks.patches)for(let index=0;index<patch.heights.length;index++){soil+=patch.soil[index];gravel+=patch.gravel[index];}
 for(const actor of Object.values(state.actors)){soil+=actor.construction?.cargo?.soil||0;gravel+=actor.construction?.cargo?.gravel||0;}return soil+gravel;
}
for(const scenario of [
 {name:'fully accounted legacy cuts, pile and cargo',excavated:3,pile:1,bucket:1,truck:1,cut:3,imported:0,recovered:0},
 {name:'old work beyond the finite cut imports only the physical material deficit',excavated:9,pile:3,bucket:1,truck:1,cut:4,imported:1,recovered:0},
 {name:'missing old cut counters recover finite source before importing external material',excavated:1,pile:3,bucket:1,truck:1,cut:4,imported:1,recovered:0},
 {name:'untracked old excavated material is recovered into a visible pile',excavated:3,pile:0,bucket:1,truck:0,cut:3,imported:0,recovered:2}
])test('persisted construction migration preserves '+scenario.name+' without resetting steel or importing cargo twice',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'construction-legacy-earth-'));t.after(()=>rm(directory,{recursive:true,force:true}));const path=join(directory,'rooms.json');let now=100000,request=0;
 const world={id:'legacy-construction',name:'Legacy site',proceduralLand:true,spawn:{x:-20,y:0,z:23},construction:{enabled:true,excavation:{x:25,z:17,width:2,depth:2,radius:1,maxDepth:1},stockpile:{x:30,z:39,width:8,depth:8}},builderScene:{layout:'grand-floor',mapSize:120,objects:[machine('crane','tower-crane',-18,-4),machine('excavator','site-excavator',25,17),machine('truck','site-dumptruck',30,30)]}},identity={accountId:'legacy-builder',username:'Legacy Builder'};
 const original=new AuthoritativeRooms({store:new SharedRoomStore(path),now:()=>now}),send=(runtime,action,fields={})=>runtime.command(world.id,world,identity,{action,requestId:'legacy-'+ ++request,...fields});
 await send(original,'join');await send(original,'map-access',{entityId:'crane'});await send(original,'construction-controls',{operation:'attach'});await send(original,'construction-controls',{operation:'aim-target'});
 let state;for(let i=0;i<200;i++){now+=100;state=await send(original,'input',{input:{}});if(!state.actors.crane.construction.assist)break;}
 state=await send(original,'construction-controls',{operation:'release'});assert.equal(state.construction.tower.placed,1);const placed=state.construction.beams.find(beam=>beam.state==='placed'),initialVolume=state.construction.earthworks.initialVolume;
 await original.store.update(world.id,room=>{
  const site=room.simulation.construction;delete site.earthworks;site.excavation.volume=scenario.excavated;site.excavation.depth=7.95;site.stockpile.volume=scenario.pile;
  for(const [id,load] of [['excavator',scenario.bucket],['truck',scenario.truck]]){const machine=room.simulation.actors[id];delete machine.construction.cargo;machine.construction.load=load;}
 });
 const reloaded=new AuthoritativeRooms({store:new SharedRoomStore(path),now:()=>now});state=await send(reloaded,'join');const site=state.construction,earth=site.earthworks,cut=earth.patches.find(patch=>patch.id==='excavation'),pile=earth.patches.find(patch=>patch.id==='spoil');
 close(site.excavation.volume,scenario.cut,'recoverable finite cut volume');close(site.excavation.depth,scenario.cut/4,'actual depth comes from removed volume');close(earth.importedVolume,scenario.imported,'external import is only the uncovered physical deficit');close(site.stockpile.volume,scenario.pile+scenario.recovered,'legacy and recovered soil are physically stockpiled');
 close(pile.soil.reduce((sum,value)=>sum+value,0),scenario.pile+scenario.recovered,'stockpile counter matches real cell volume');close(cut.soil.reduce((sum,value)=>sum+value,0),4-scenario.cut,'finite native source remains');
 assert.deepEqual(state.actors.excavator.construction.cargo,{soil:scenario.bucket,gravel:0});assert.deepEqual(state.actors.truck.construction.cargo,{soil:scenario.truck,gravel:0});
 close(ledger(state),initialVolume+scenario.imported,'finite source, restored pile and surviving cargo conserve the migration ledger');close(earth.totals.soil+earth.totals.gravel+earth.totals.carriedSoil+earth.totals.carriedGravel,ledger(state),'snapshot totals include actual carried material');
 assert.equal(earth.migration.legacyExcavatedVolume,scenario.excavated);close(earth.migration.unrecoverableCutVolume,Math.max(0,scenario.excavated-scenario.cut),'historical excess stays explicit');close(earth.migration.recoveredUnrecordedCutVolume,Math.max(0,scenario.cut-scenario.excavated),'missing historical cut is recovered from finite source');close(earth.migration.recoveredUntrackedCargo.soil,scenario.recovered,'historical untracked material remains explicit');
 assert.equal(site.tower.placed,1);assert.deepEqual(site.beams.find(beam=>beam.id===placed.id),placed,'placed steel geometry and identity survive migration');
 const revision=earth.revision,again=new AuthoritativeRooms({store:new SharedRoomStore(path),now:()=>now});state=await send(again,'join');close(ledger(state),initialVolume+scenario.imported,'another restart cannot import or restore the same cargo twice');assert.equal(state.construction.earthworks.revision,revision);assert.equal(state.construction.tower.placed,1);
});
