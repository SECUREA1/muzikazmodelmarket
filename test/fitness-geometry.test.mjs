import test from 'node:test';
import assert from 'node:assert/strict';
import {fitnessWorld} from '../fitness-world.mjs';
import {FITNESS_STATIONS,FITNESS_TRAINERS} from '../public/js/fitness-config.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {createFitnessLand} from '../public/js/environments/fitness-land.js';
import * as THREE from '../public/vendor/three/three.module.min.js';

function dispose(root){const resources=new Set();root.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const m of [].concat(node.material||[]))resources.add(m);});for(const resource of resources)resource.dispose();}

test('gym activity approaches and both trainer homes stand on clear physical floor',()=>{
 const map=fitnessWorld(),collision=new ServerBuilderCollision();
 assert.deepEqual(collision.safeSpawn(map,map.spawn),{x:0,y:.02,z:32},'live room entry resolves on the gym floor');
 for(const entry of [{id:'arrival',position:map.spawn},...FITNESS_STATIONS,...FITNESS_TRAINERS]){
  const floor=collision.groundAt(map,entry.position,{entry:true});
  assert.ok(floor,entry.id+' has floor support');assert.ok(collision.hasBodyClearance(map,floor,.38),entry.id+' has body clearance');
 }
 const beam=collision.groundAt(map,{x:25,y:.32,z:25});assert.ok(beam?.y>.3,'balance beam supplies a real low walking surface');
 const ring=collision.groundAt(map,{x:-22,y:.14,z:-18});assert.ok(ring?.y>.12,'boxing canvas is physically supported');
 const boundary=collision.resolve(map,{x:34,y:.02,z:0},{x:37,y:.02,z:0});assert.ok(boundary.x<36,'perimeter wall contains the player');
 dispose(collision.world(map).root);
});

test('all eleven gym games are reachable by walking from reception through connected aisles',()=>{
 const map=fitnessWorld(),collision=new ServerBuilderCollision();
 const paths={boxing:[[6,32],[6,21],[0,21],[0,-7],[-22,-7],[-22,-14]],'bench-press':[[6,32],[6,21],[6,-7],[18,-7],[18,-18]],deadlift:[[6,32],[6,21],[6,-7],[29,-7]],agility:[[6,32],[6,21],[6,7],[19,7]],'jump-rope':[[6,32],[6,21],[6,6],[-11,6]],rowing:[[6,32],[6,21],[-20,21],[-20,15],[-24,15]],balance:[[6,32],[6,21],[21,21],[21,23]],'boxing-sparring':[[6,32],[6,21],[0,21],[0,-7],[-22,-7],[-22,-12]],basketball:[[6,32],[6,21],[6,-7],[52,-7],[52,-17]],'table-tennis':[[6,32],[6,21],[40,21],[65,21],[65,5]],sprint:[[6,32],[6,21],[40,21],[51,21],[51,23]]};
 for(const station of FITNESS_STATIONS){
  let position={...map.spawn};
  for(const [x,z]of paths[station.kind]){
   const distance=Math.hypot(x-position.x,z-position.z),steps=Math.ceil(distance/.35),dx=(x-position.x)/steps,dz=(z-position.z)/steps;
   for(let i=0;i<steps;i++){const next=collision.resolve(map,position,{x:position.x+dx,y:position.y,z:position.z+dz});position={x:next.x,y:Number.isFinite(next.floorY)?next.floorY:next.y,z:next.z};}
   assert.ok(Math.hypot(position.x-x,position.z-z)<.1,station.kind+' reaches aisle waypoint '+x+','+z+' (actual '+position.x+','+position.z+')');
  }
  assert.ok(Math.hypot(position.x-station.position.x,position.z-station.position.z)<.15,station.kind+' approach is reachable');
 }
 dispose(collision.world(map).root);
});

test('gym overview has an exposed roofline, visible equipment and bounded decorative animations',()=>{
 const root=createFitnessLand();root.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(root);
 assert.equal(bounds.max.x-bounds.min.x,120);assert.equal(bounds.max.z-bounds.min.z,80);assert.ok(bounds.max.y<9,'rafters remain below nine metres');
 for(const name of ['FITNESS_BOXING_RING_CANVAS','FITNESS_PRIMARY_BENCH','FITNESS_PRIMARY_ROWER','FITNESS_BALANCE_BEAM','FITNESS_RECEPTION_COUNTER'])assert.ok(root.getObjectByName(name),name);
 assert.equal(root.getObjectByName('FITNESS_CEILING'),undefined,'no opaque full ceiling covers the top-down view');
 assert.doesNotThrow(()=>{for(const time of [0,1,10000])root.userData.updateFitnessEffects(time);});dispose(root);
});


test('competition wing doors, ring entrance and three sport approaches have real body clearance',()=>{
 const map=fitnessWorld(),collision=new ServerBuilderCollision();
 for(const z of [-7,21]){let position={x:32,y:.02,z};for(let i=0;i<60;i++){const next=collision.resolve(map,position,{...position,x:position.x+.2});position={...next,y:next.floorY??next.y};}assert.ok(position.x>43.8,'old east partition has an open cross-aisle at z='+z);}
 const root=collision.world(map).root;
 for(const name of ['FITNESS_CHAMPIONSHIP_RING','FITNESS_RING_SPECTACLE','FITNESS_OFFICIALS_CLOCK','FITNESS_RINGSIDE_SEATING','FITNESS_COMPETITION_BASKETBALL_HOOP','FITNESS_COMPETITION_TABLE_TENNIS','FITNESS_COMPETITION_SPRINT_GATES'])assert.ok(root.getObjectByName(name),name);
 assert.ok(collision.groundAt(map,{x:76,y:.02,z:30}),'east wing has continuous floor');
 const closed=collision.resolve(map,{x:76,y:.02,z:0},{x:80,y:.02,z:0});assert.ok(closed.x<78,'new exterior wall contains players');dispose(root);
});

test('native ring clocks display authoritative player bout scores without a DOM',()=>{
 const root=createFitnessLand();root.userData.updateFitnessEffects(2,{red:{fitness:{kind:'boxing-sparring',status:'active',startedAt:200,endsAt:Date.now()+85000,competition:{playerPoints:12,opponentPoints:9,round:2}}}});
 for(const name of ['FITNESS_OFFICIALS_CLOCK','FITNESS_OVERHEAD_RING_CLOCK']){const clock=root.getObjectByName(name);assert.equal(clock.getObjectByName('FITNESS_SCORE_RED_TENS').userData.scoreValue,1);assert.equal(clock.getObjectByName('FITNESS_SCORE_RED_UNITS').userData.scoreValue,2);assert.equal(clock.getObjectByName('FITNESS_SCORE_BLUE_UNITS').userData.scoreValue,9);assert.equal(clock.getObjectByName('FITNESS_SCORE_ROUND_UNITS').userData.scoreValue,2);}
 dispose(root);
});
