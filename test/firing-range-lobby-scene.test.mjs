import test from 'node:test';
import assert from 'node:assert/strict';
import {createBuilderLand} from '../public/js/environments/builder-land.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {FIRING_RANGE_LANES,FIRING_RANGE_TARGETS,firingRangeTargetOffset} from '../public/js/firing-range.js';

const variants=['live','force-training'];
const world=style=>({id:style==='live'?'firing-range':'force-training-range',spawn:{x:0,y:0,z:16.2},builderScene:{layout:'firing-range',rangeStyle:style,mapSize:40,objects:[]}});
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<.00001,`${actual} should equal ${expected}`);

test('both authored range styles expose the complete safe-lobby interaction set',()=>{
 const expected=['range-armory','range-backpack','range-market','range-settings','range-start','range-watch'];
 for(const style of variants){
  const root=createBuilderLand(world(style)),entries=root.userData.rangeInteractions;
  assert.deepEqual(entries.map(entry=>entry.intent).sort(),expected,style);
  const labels=[];root.traverse(mesh=>{if(mesh.userData.label)labels.push(mesh.userData.label);});
  for(const label of ['GEAR  /  OPTICS  /  MARKET','JOIN  /  TOURNAMENT RULES','ALL FIVE LANES  /  EVERY GAME MODE','OPEN PRACTICE  /  PRECISION  /  RAPID  /  ENDURANCE  /  MOVING'])assert.ok(labels.includes(label),`${style}: ${label}`);
  assert.equal(labels.filter(label=>label==='PAPER  /  PRECISION').length,FIRING_RANGE_LANES.length);
  assert.equal(labels.filter(label=>label==='STEEL  /  MOVING DRILLS').length,FIRING_RANGE_LANES.length);
  for(const entry of entries){
   const screens=[];root.traverse(mesh=>{if(mesh.userData.rangeInteraction===entry)screens.push(mesh);});
   assert.equal(screens.length,1,`${style}: one interactive screen per console`);
   near(screens[0].position.x,entry.position.x);near(screens[0].position.z,entry.position.z);
   assert.ok(entry.position.z>15&&Math.abs(entry.position.x)<18);
  }
 }
});

test('every lobby console is reachable from arrivals without blocking the path behind the firing bays',()=>{
 for(const style of variants){
  const environment=world(style),root=createBuilderLand(environment),collision=new ServerBuilderCollision();
  const move=(from,to)=>{
   const accepted=collision.resolve(environment,from,to);near(accepted.x,to.x);near(accepted.z,to.z);return {x:accepted.x,y:accepted.y,z:accepted.z};
  };
  for(const entry of root.userData.rangeInteractions){
   let position=collision.safeSpawn(environment,environment.spawn);
   position=move(position,{...position,z:14.8});
   position=move(position,{...position,x:entry.position.x});
   position=move(position,{...position,z:entry.position.z-1});
   assert.ok(Math.hypot(position.x-entry.position.x,position.z-entry.position.z)<entry.radius,`${style}: ${entry.intent} is within activation range`);
  }
 }
});

test('area navigation leaves the shared target geometry and all lane shot paths unchanged',()=>{
 for(const style of variants){
  const environment=world(style),root=createBuilderLand(environment),collision=new ServerBuilderCollision(),settings={mode:'moving',targetSpeed:1.6};
  root.userData.setFiringRangeState({state:'live',settings},{serverTime:6400});
  for(const target of FIRING_RANGE_TARGETS){
   const expected=firingRangeTargetOffset(target,6400,settings),actual=root.getObjectByName(`RANGE_TARGET_${target.id}`).position;
   near(actual.x,expected.x);near(actual.y,expected.y);near(actual.z,expected.z);
  }
  for(const lane of FIRING_RANGE_LANES){
   const origin={x:lane.x,y:1.65,z:13.8},target=FIRING_RANGE_TARGETS.find(target=>target.lane===lane.index&&target.kind==='paper').position;
   const delta=[target.x-origin.x,target.y-origin.y,target.z-origin.z],distance=Math.hypot(...delta);
   assert.equal(collision.blocksShot(environment,origin,delta.map(value=>value/distance),distance),false,`${style}: lane ${lane.index+1}`);
  }
 }
});

test('live boards retain earned tournament standings when a competitor switches to watching',()=>{
 for(const style of variants){
  const root=createBuilderLand(world(style));
  root.userData.setFiringRangeState({state:'finished',settings:{mode:'precision'},leaderboard:[
   {name:'Finished competitor',role:'spectator',enrolled:true,score:600,accuracy:80,rank:1},
   {name:'Active competitor',role:'player',enrolled:true,score:500,accuracy:75,rank:2},
   {name:'Only watching',role:'spectator',score:0,accuracy:0,rank:3}
  ]},{serverTime:10000});
  assert.deepEqual(root.userData.rangeDisplay.leaders.map(entry=>entry.name),['Finished competitor','Active competitor']);
 }
});
