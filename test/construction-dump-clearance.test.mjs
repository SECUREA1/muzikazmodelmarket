import test from 'node:test';
import assert from 'node:assert/strict';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {constructionWorld} from '../construction-world.mjs';
import {constructionCrewSetOperator,constructionCrewCommand,stepConstruction} from '../server-construction.mjs';
import {earthworksTake,earthCargoVolume} from '../public/js/construction-earthworks.js';

function mass(sim){let total=0;for(const patch of sim.construction.earthworks.patches)for(let i=0;i<patch.heights.length;i++)total+=patch.soil[i]+patch.gravel[i];for(const actor of Object.values(sim.actors))total+=earthCargoVolume(actor.construction?.cargo);return total;}
for(const yaw of [-3.4059308887,0,Math.PI/4])test('native loaded truck tips real material behind its chassis and drives forward clear at yaw '+yaw,()=>{
 let now=1000;const world=constructionWorld(),runtime=new AuthoritativeRooms({now:()=>now}),room={objects:{}};runtime.initialize(room,world);const sim=room.simulation,truck=sim.actors['construction-truck'],worker={id:'regression-tip-operator'};
 truck.position={x:79.6161886259,y:.02,z:93.291959364};truck.rotation.y=yaw;truck.driving={speed:0,steering:0,parked:true};const cargo=earthworksTake(sim.construction.earthworks,{x:25,y:0,z:17},2,{radius:1.3});assert.equal(earthCargoVolume(cargo),2);truck.construction.cargo=cargo;truck.construction.load=2;
 const original=mass(sim),context=runtime.constructionContext(sim,world,room.objects),before=sim.construction.earthworks.patches.map(patch=>patch.heights.slice());constructionCrewSetOperator(sim,truck.id,worker.id,now);constructionCrewCommand(sim,truck.id,worker.id,{operation:'work'},now,context);
 for(let i=0;i<100&&truck.construction.workCycle;i++){now+=100;constructionCrewSetOperator(sim,truck.id,worker.id,now);stepConstruction(sim,now,.1,context);}
 assert.equal(truck.construction.workCycle,undefined,'the physical tipping cycle completes');assert.equal(truck.construction.load,0,'the two cubic metres leave the real body');assert.equal(truck.construction.bed,0,'body lowers before travel');assert.ok(sim.construction.earthworks.patches.some((patch,p)=>patch.heights.some((height,i)=>height>before[p][i]+1e-8)),'actual receiving terrain rises');assert.ok(Math.abs(mass(sim)-original)<1e-6,'tipping conserves finite source and cargo volume');
 const start={...truck.position};for(let i=0;i<24;i++){now+=250;constructionCrewSetOperator(sim,truck.id,worker.id,now);const result=context.drive(truck,worker,{forward:.55,side:0},now,.25);assert.equal(result.blocked,false,'fresh spoil must not strand the parked rear running gear: '+JSON.stringify({position:truck.position,driving:truck.driving,solid:truck.construction.blocked}));}
 assert.ok(Math.hypot(truck.position.x-start.x,truck.position.z-start.z)>3,'the empty truck drives away through normal ground support and collision checks');assert.ok(Math.abs(mass(sim)-original)<1e-6,'leaving the pile does not reset or remove terrain');
});
