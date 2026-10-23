import test from 'node:test';
import assert from 'node:assert/strict';
import {
 createEarthworks,earthCargoVolume,earthworksDeposit,earthworksGroundAt,
 earthworksPush,earthworksSurfaceAt,earthworksTake,refreshEarthworksTotals
} from '../public/js/construction-earthworks.js';

const close=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-7,`${message}: ${actual} versus ${expected}`);
const mass=earth=>{const totals=refreshEarthworksTotals(earth);return totals.soil+totals.gravel;};
const single=(options={})=>createEarthworks({excavation:{x:0,z:0,width:2,depth:2,radius:1,maxDepth:2,...options},stockpile:{x:20,z:0,width:2,depth:2},earthworks:{cellSize:2}});
const at={x:0,y:Infinity,z:0};

test('dry-run excavation leaves every cell unchanged, and a finite source exhausts at its real cut floor',()=>{
 const earth=single(),before=structuredClone(earth),initial=mass(earth);
 assert.deepEqual(earthworksTake(earth,at,3,{radius:0,dryRun:true}),{soil:3,gravel:0});
 assert.deepEqual(earth,before,'previewing available soil cannot change revision, counters, or cells');
 const first=earthworksTake(earth,at,3,{radius:0});assert.deepEqual(first,{soil:3,gravel:0});
 close(earthworksSurfaceAt(earth,at).y,-.75,'three cubic metres lower a four-square-metre cell');
 const final=earthworksTake(earth,at,100,{radius:0});assert.deepEqual(final,{soil:5,gravel:0});
 close(earthworksSurfaceAt(earth,at).y,-2,'exhaustion stops at the authored bottom');
 close(mass(earth)+earthCargoVolume(first)+earthCargoVolume(final),initial,'earth and carried mass are conserved');
 const exhausted=structuredClone(earth);assert.deepEqual(earthworksTake(earth,at,2,{radius:0}),{soil:0,gravel:0});assert.deepEqual(earth,exhausted,'an empty source never awards progress or changes terrain');
});

test('a bucket cutting plane limits volume independently of requested capacity',()=>{
 const earth=single(),initial=mass(earth),cargo=earthworksTake(earth,at,2,{radius:0,cutY:-.25});
 assert.deepEqual(cargo,{soil:1,gravel:0});close(earthworksSurfaceAt(earth,at).y,-.25,'a shallow cut stops at bucket height');
 close(mass(earth)+earthCargoVolume(cargo),initial,'partial bucket preserves the finite source');
 assert.deepEqual(earthworksTake(earth,at,2,{radius:0,cutY:-.25}),{soil:0,gravel:0});
});

test('gravel is removed before underlying native soil and keeps its material identity in cargo',()=>{
 const earth=single({material:'gravel',height:1.25,maxDepth:1}),initial=mass(earth);
 const cargo=earthworksTake(earth,at,6,{radius:0});assert.deepEqual(cargo,{soil:1,gravel:5});
 close(earthworksSurfaceAt(earth,at).y,-.25,'the mixed scoop reaches below the native surface');
 const totals=refreshEarthworksTotals(earth,[cargo]);close(totals.carriedSoil,1,'carried soil is tracked');close(totals.carriedGravel,5,'carried gravel is tracked');
 close(totals.soil+totals.gravel+totals.carriedSoil+totals.carriedGravel,initial,'all materials remain in the mass ledger');
});

test('deposit capacity follows the actual receiving surface and returns unplaced cargo to its caller',()=>{
 const earth=single(),source={soil:2,gravel:3},initial=mass(earth),before=structuredClone(earth);
 assert.deepEqual(earthworksDeposit(earth,{x:20,y:.25,z:0},source,{radius:0,dryRun:true}),{soil:1,gravel:0});assert.deepEqual(earth,before);
 const placed=earthworksDeposit(earth,{x:20,y:.25,z:0},source,{radius:0});assert.deepEqual(placed,{soil:1,gravel:0});assert.deepEqual(source,{soil:2,gravel:3},'the caller retains ownership of its original cargo record');
 close(earthworksSurfaceAt(earth,{x:20,z:0}).y,.25,'the deposited pile has physical height');
 const retained={soil:source.soil-placed.soil,gravel:source.gravel-placed.gravel};
 close(mass(earth)+earthCargoVolume(retained),initial+earthCargoVolume(source),'partial unload never loses excess cargo');
 const unchanged=structuredClone(earth);assert.deepEqual(earthworksDeposit(earth,{x:1000,y:10,z:1000},retained),{soil:0,gravel:0});assert.deepEqual(earth,unchanged,'a tip outside all receiving patches changes nothing');
});

test('allowed receiving kinds reject a physically nearby but unauthorized patch',()=>{
 const earth=single(),before=structuredClone(earth);
 assert.deepEqual(earthworksDeposit(earth,at,{soil:2,gravel:0},{radius:0,allowedKinds:['stockpile']}),{soil:0,gravel:0});
 assert.deepEqual(earth,before);
 assert.equal(earthCargoVolume(earthworksDeposit(earth,{x:20,y:Infinity,z:0},{soil:2,gravel:0},{radius:0,allowedKinds:['stockpile']})),2);
});

test('a blade physically transfers loose material, preserves native support and conserves mass at a patch edge',()=>{
 const earth=single({height:2,maxDepth:1}),initial=mass(earth),sourceBefore=earthworksSurfaceAt(earth,at).y;
 const preview=structuredClone(earth);assert.deepEqual(earthworksPush(earth,{x:0,y:.25,z:0},{x:20,y:Infinity,z:0},4,{radius:0,cutY:.25,dryRun:true}),{soil:4,gravel:0});assert.deepEqual(earth,preview,'blade readiness checks cannot mutate either end of a transfer');
 const moved=earthworksPush(earth,{x:0,y:.25,z:0},{x:20,y:Infinity,z:0},4,{radius:0,cutY:.25});assert.deepEqual(moved,{soil:4,gravel:0});
 close(earthworksSurfaceAt(earth,at).y,sourceBefore-1,'the source mound is lower');close(earthworksSurfaceAt(earth,{x:20,z:0}).y,1,'the receiving mound is higher');close(mass(earth),initial,'pushing transfers existing mass');
 const before=structuredClone(earth);assert.deepEqual(earthworksPush(earth,{x:0,y:0,z:0},{x:100,y:Infinity,z:0},10,{radius:0}),{soil:0,gravel:0});assert.deepEqual(earth,before,'pushing beyond the terrain domain cannot delete soil');
 earthworksPush(earth,{x:0,y:-5,z:0},{x:20,y:Infinity,z:0},100,{radius:0});close(earthworksSurfaceAt(earth,at).y,0,'loose-only grading leaves native soil intact');close(mass(earth),initial,'exhausting loose spoil preserves total mass');
});

test('a blade cannot earn progress by returning material into its own source cell',()=>{
 const earth=single({height:2,maxDepth:0}),before=structuredClone(earth);assert.deepEqual(earthworksPush(earth,{x:0,y:0,z:0},{x:0,y:3,z:-.8},3,{radius:1.9,cutY:0}),{soil:0,gravel:0});assert.deepEqual(earth,before,'an overlapping source and receiver changes neither terrain nor work counters');
});

test('soil height replaces only the old flat ground and preserves elevated real building support',()=>{
 const earth=single();earthworksTake(earth,at,4,{radius:0});const point={x:0,y:.02,z:0};
 const cut=earthworksGroundAt(earth,point,{...point,y:.02});close(cut.y,-.98,'the old flat floor is replaced by the pit');assert.equal(cut.earthworks,true);
 close(earthworksGroundAt(earth,point,null).y,-.98,'terrain remains support even when a geometry ray misses below the old map bounds');
 const deck={...point,y:4.02,objectId:'completed-deck'};assert.equal(earthworksGroundAt(earth,point,deck),deck,'an elevated deck remains a physical floor');
 const outside={x:100,y:3,z:100};assert.equal(earthworksGroundAt(earth,outside,null),null,'missing support outside the site retains its original semantics');assert.equal(earthworksGroundAt(earth,outside,deck),deck);
});

test('repeated excavation, mixed-material carrying and tipping preserve mass through a complete finite source',()=>{
 const earth=single({material:'gravel',height:1,maxDepth:2}),initial=mass(earth);let carried={soil:0,gravel:0},cycles=0;
 for(;cycles<100;cycles++){
  const scoop=earthworksTake(earth,at,.7,{radius:0});if(!earthCargoVolume(scoop))break;
  carried={soil:carried.soil+scoop.soil,gravel:carried.gravel+scoop.gravel};
  const placed=earthworksDeposit(earth,{x:20,y:Infinity,z:0},carried,{radius:0,maxHeight:6});carried={soil:carried.soil-placed.soil,gravel:carried.gravel-placed.gravel};
  close(mass(earth)+earthCargoVolume(carried),initial,'each mechanical transfer conserves soil and gravel');
 }
 assert.ok(cycles>1&&cycles<100,'finite earth runs out within a bounded number of scoops');close(earthworksSurfaceAt(earth,at).y,-2,'source reaches its real minimum');
 close(earthworksSurfaceAt(earth,{x:20,z:0}).y,3,'the removed volume exists at the receiving patch');close(earthCargoVolume(carried),0,'all of this load fits at the receiver');
});
