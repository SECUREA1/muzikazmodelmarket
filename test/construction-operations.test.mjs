import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {constructionWorld} from '../construction-world.mjs';
import {createEarthworks,expandEarthworks,earthworksTake,earthworksDeposit,earthCargoVolume,refreshEarthworksTotals} from '../public/js/construction-earthworks.js';
import {constructionOperations} from '../public/js/construction-operations.js';
import {createConstructionEarthGeometry} from '../public/js/construction-terrain.js';
import {ensureConstruction,constructionCommand,stepConstruction} from '../server-construction.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const cell=(p,i=0)=>({x:p.origin.x+(i%p.columns+.5)*p.cellSize,z:p.origin.z+(Math.floor(i/p.columns)+.5)*p.cellSize,y:Infinity});
const site=()=>({earthworks:createEarthworks(constructionWorld().construction),tower:{x:5,z:-10,maxFloors:16,placed:0,floors:0}});
const task=(s,id)=>constructionOperations(s).find(task=>task.id===id);

test('pavement is a finite flat recyclable layer that visibly exposes soil when ripped',()=>{
 const s=site(),e=s.earthworks,p=e.patches.find(p=>p.id==='pavement-reclamation'),initial=refreshEarthworksTotals(e);
 assert.ok(p.heights.every(h=>h===.24),'road pavement is a flat 24 cm lift');
 assert.ok(p.gravel.every(v=>v===.96));
 const before=createConstructionEarthGeometry(THREE,p),oldColor=before.attributes.color.array.slice(0,3);
 const cargo=earthworksTake(e,cell(p),.96,{radius:0});near(cargo.gravel,.96);near(cargo.soil,0);near(p.heights[0],0);
 const after=createConstructionEarthGeometry(THREE,p);assert.notDeepEqual(after.attributes.color.array.slice(0,3),oldColor,'ripping reveals a different material surface');
 assert.ok(task(s,p.id).progress>0);near(refreshEarthworksTotals(e).gravel+cargo.gravel,initial.gravel);
 const receiving=e.patches.find(p=>p.id==='recycled-aggregate');near(earthCargoVolume(earthworksDeposit(e,cell(receiving),cargo,{radius:0})),.96);
 near(refreshEarthworksTotals(e).gravel,initial.gravel);assert.ok(task(s,receiving.id).progress>0);
 before.dispose();after.dispose();
});

test('road completion requires real aggregate coverage and a level grade, not a heap or soil alone',()=>{
 const s=site(),e=s.earthworks,p=e.patches.find(p=>p.id==='new-road');assert.equal(task(s,p.id).progress,0);
 earthworksDeposit(e,cell(p),{soil:0,gravel:10},{radius:0});assert.ok(task(s,p.id).progress<.01,'one large heap cannot complete the road');
 for(let i=0;i<p.heights.length;i++){earthworksTake(e,cell(p,i),100,{radius:0});earthworksDeposit(e,cell(p,i),{soil:0,gravel:.8},{radius:0});}
 near(task(s,p.id).progress,1);
 const soilOnly=site(),road=soilOnly.earthworks.patches.find(p=>p.id==='new-road');for(let i=0;i<road.heights.length;i++)earthworksDeposit(soilOnly.earthworks,cell(road,i),{soil:.8,gravel:0},{radius:0});
 assert.equal(task(soilOnly,p.id).progress,0,'earth fill is not an aggregate road base');
});

test('trench depth and platform levels come from ground cells and tower erection from secured beams',()=>{
 const s=site(),trench=s.earthworks.patches.find(p=>p.id==='utility-trench');
 for(let i=0;i<trench.heights.length;i++)earthworksTake(s.earthworks,cell(trench,i),12,{radius:0});
 near(task(s,trench.id).progress,1);assert.ok(trench.heights.every(h=>h===-3));
 const platform=s.earthworks.patches.find(p=>p.id==='earth-platform');for(let i=0;i<platform.heights.length;i++)earthworksDeposit(s.earthworks,cell(platform,i),{soil:1.2,gravel:0},{radius:0});
 near(task(s,platform.id).progress,1);s.tower.placed=4;s.tower.floors=1;near(task(s,'tower').progress,1/16);
});

test('expanding a saved site preserves worked soil, cargo accounting and previous progress exactly once',()=>{
 const config=constructionWorld().construction,old=structuredClone(config);old.earthworks.patches=old.earthworks.patches.slice(0,5);
 const e=createEarthworks(old),cut=earthworksTake(e,cell(e.patches[0]),2,{radius:0}),before=structuredClone(e),saved=e.patches[0];
 assert.equal(expandEarthworks(e,config),6);assert.equal(e.patches[0],saved);assert.deepEqual(saved,before.patches[0]);assert.equal(e.excavated,2);assert.equal(e.deposited,0);
 near(e.initialVolume-before.initialVolume,e.patches.slice(7).reduce((sum,p)=>sum+p.initialVolume,0));
 const totals=refreshEarthworksTotals(e,[cut]);near(totals.soil+totals.gravel+totals.carriedSoil+totals.carriedGravel,e.initialVolume);
 const expanded=structuredClone(e);assert.equal(expandEarthworks(e,config),0);assert.deepEqual(e,expanded,'subsequent loads cannot duplicate material');
});

test('an excavator rips pavement, loads the truck and tips reclaimed aggregate into a road formation',()=>{
 const world=constructionWorld(),actors=Object.fromEntries(world.builderScene.objects.filter(o=>o.functionalSettings.behavior==='vehicle').map(o=>[o.id,{...structuredClone(o),active:true,driving:{speed:0}}])),sim={actors,players:{},events:[]};ensureConstruction(sim,world);
 const excavator=actors['construction-excavator'],truck=actors['construction-truck'];
 excavator.position={x:198,y:.24,z:16};truck.position={x:203,y:.24,z:16};
 const player={actorId:'road-builder',vehicleId:excavator.id,health:100,lastSeen:1000,position:{...excavator.position},input:{}};sim.players[player.actorId]=player;excavator.holderId=player.actorId;
 const context={environment:world,objects:{},collision:new ServerBuilderCollision()};
 const command=operation=>constructionCommand(sim,player,{operation},player.lastSeen,context),finish=()=>{for(let i=0;i<150&&actors[player.vehicleId].construction.workCycle;i++){player.lastSeen+=100;stepConstruction(sim,player.lastSeen,.1,context);}assert.ok(!actors[player.vehicleId].construction.workCycle);};
 const initial=sim.construction.earthworks.initialVolume;
 command('work');finish();assert.ok(excavator.construction.cargo.gravel>0,'real excavator bucket contains ripped pavement');
 command('work');finish();assert.ok(truck.construction.cargo.gravel>0,'truck loaded through its actual bed');assert.equal(excavator.construction.load,0);
 excavator.holderId=null;truck.holderId=player.actorId;player.vehicleId=truck.id;truck.position={x:198,y:0,z:88};player.position={...truck.position};
 command('work');finish();assert.equal(truck.construction.load,0);assert.ok(task(sim.construction,'new-road').progress>0);
 const totals=refreshEarthworksTotals(sim.construction.earthworks);near(totals.soil+totals.gravel,initial);
});
