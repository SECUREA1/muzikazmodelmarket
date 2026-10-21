import test from 'node:test';
import assert from 'node:assert/strict';
import {stepBoatSimulation,harborNavigation} from '../public/js/boat-simulation.js';
import {harborWaterAt,watercraftFootprint} from '../public/js/harbor-water.js';
const environment={builderScene:{layoutMeta:{harbor:{extent:256,islands:[{id:'island',name:'Beacon',x:185,z:30,width:24,depth:24}]},locations:[{id:'marina',name:'Marina',x:132,z:30},{id:'island',name:'Beacon',x:185,z:30}]}}};
const boat=(id='harbor-skiff')=>({modelId:id,position:{x:144,y:0,z:-50},rotation:{x:0,y:-Math.PI/2,z:0}});
const sail=(object,input,seconds,options={},step=.05)=>{for(let t=0;t<seconds-1e-8;t+=step)Object.assign(object,stepBoatSimulation(object,input,Math.min(step,seconds-t),{environment,...options}));return object;};
test('launch accelerates with engine spool, keeps throttle, and uses the hull heading rather than the look direction',()=>{
 const launch=sail(boat(),{forward:1,yaw:Math.PI/2},1.1);assert.ok(launch.position.x>147);assert.equal(launch.position.y,0);assert.ok(launch.boating.speed>5);assert.ok(launch.boating.speed<=9);assert.ok(launch.boating.rpm>4000);assert.equal(Math.round(launch.boating.heading),90);
 const power=launch.boating.throttle;sail(launch,{forward:0},.4);assert.equal(launch.boating.throttleCommand,1);assert.ok(launch.boating.throttle>=power);
});
test('rudder requires headway, turns smoothly and reverses with limited astern speed',()=>{
 const launch=sail(boat(),{side:1},.5);assert.equal(launch.rotation.y,-Math.PI/2);assert.equal(launch.boating.speed,0);
 sail(launch,{throttle:.6,side:1},1);assert.notEqual(launch.rotation.y,-Math.PI/2);assert.ok(launch.boating.rudder>.8);
 sail(launch,{throttle:-1,side:0},3);assert.ok(launch.boating.speed<0);assert.ok(launch.boating.speed>=-2);assert.equal(launch.boating.phase,'astern');
});
test('anchor arrests motion without continuing to consume impact damage and departure power holds at zero',()=>{
 const launch=sail(boat(),{throttle:1},1.2);sail(launch,{anchor:true},1);assert.equal(launch.boating.speed,0);assert.equal(launch.boating.anchor,true);assert.equal(launch.boating.impactDamage,0);const before={...launch.position};sail(launch,{anchor:true,throttle:1},.5);assert.deepEqual(launch.position,before);assert.equal(launch.boating.warning,'ANCHOR SET');
});
test('sailboats respond to wind angle and trim, and maintain a useful auxiliary pace into wind',()=>{
 const beam=boat('harbor-sailboat'),poor=boat('harbor-sailboat');beam.rotation.y=-(35+90)*Math.PI/180;poor.rotation.y=beam.rotation.y;
 sail(beam,{throttle:1,sailTrim:.5},2);sail(poor,{throttle:1,sailTrim:0},2);assert.ok(beam.boating.speed>poor.boating.speed);assert.ok(beam.boating.speed<=6.4);assert.equal(beam.boating.windDirection,35);assert.equal(beam.boating.windSpeed,6.5);assert.equal(beam.boating.phase,'sailing');
 const head=boat('harbor-sailboat');head.rotation.y=-35*Math.PI/180;sail(head,{throttle:1,sailTrim:.1},2);assert.ok(head.boating.speed>1);assert.ok(head.boating.speed<beam.boating.speed);
});
test('shorelines, islands, the harbor boundary, and obstacle sweeps stop the complete hull',()=>{
 const launch=boat();launch.position={x:165,y:0,z:30};launch.rotation.y=-Math.PI/2;launch.boating={speed:8,throttle:1};sail(launch,{forward:1},2);assert.ok(launch.position.x<172);assert.ok(watercraftFootprint(launch.position,launch.rotation.y).every(point=>harborWaterAt(environment,point,.25)));assert.equal(launch.boating.phase,'hold');
 const obstacle=boat();obstacle.boating={speed:8};const pose=stepBoatSimulation(obstacle,{throttle:1},.1,{environment,blocked:()=>true});assert.deepEqual(pose.position,obstacle.position);assert.equal(pose.boating.speed,0);assert.ok(pose.boating.impactDamage>0);
 const edge=boat();edge.position.x=254;sail(edge,{throttle:1},2);assert.ok(edge.position.x<=255);assert.equal(edge.boating.phase,'hold');
});
test('fixed substeps are independent of packet size, and corrupt values stay finite',()=>{
 const first=sail(boat(),{throttle:.7,side:.3},2,{},.05),second=sail(boat(),{throttle:.7,side:.3},2,{},.1);for(const key of ['x','y','z'])assert.ok(Math.abs(first.position[key]-second.position[key])<1e-7);assert.ok(Math.abs(first.rotation.y-second.rotation.y)<1e-7);
 const pose=stepBoatSimulation({position:{x:NaN,y:Infinity,z:NaN},rotation:{y:Infinity},boating:{speed:NaN}}, {throttle:NaN,side:Infinity},Infinity,{environment});assert.ok(Object.values(pose.position).every(Number.isFinite));assert.ok(Object.values(pose.rotation).every(Number.isFinite));
 const nav=harborNavigation(environment,{x:144,z:30});assert.equal(nav[0].id,'marina');assert.equal(nav[1].bearing,90);
});
