import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {WalkingMotion} from '../public/js/walking-motion.js';
function fixture(glb){
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(40,40),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));floor.rotation.x=-Math.PI/2;floor.name='BUILDER_WALKABLE_FLOOR';
 const wall=new THREE.Mesh(new THREE.BoxGeometry(.2,3,30),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));wall.position.set(1,1.5,0);wall.name='WALL';
 const root=new THREE.Group();root.add(floor,wall);root.updateMatrixWorld(true);
 const world={root,floors:[floor,wall],walls:[{box:new THREE.Box3().setFromObject(wall)}],bounds:new THREE.Box3().setFromObject(root),glb};
 const collision=new ServerBuilderCollision();collision.world=()=>world;
 return {collision,world,wall,environment:glb?{modelUrl:'fixture.glb'}:{builderScene:{mapSize:40}},root};
}
test('GLB and builder maps slide along walls at 30, 60 and 120 FPS without losing ground',()=>{
 for(const glb of [true,false])for(const fps of [30,60,120]){
  const {collision,environment}=fixture(glb);let position={x:0,y:.02,z:0};
  for(let i=0;i<fps*2;i++){
   position=collision.resolve(environment,position,{x:position.x+2/fps,y:position.y-18/fps**2,z:position.z+2/fps},{});
   assert.ok(position.y>=.0199,`${glb} ${fps} frame ${i}: feet stay above ground`);
   assert.ok(position.x<=.601,'wall cannot be penetrated');assert.ok(position.floorY>=.0199,'support survives a blocked move');
  }
  assert.ok(position.z>3.9,'unblocked axis continues moving instead of freezing both axes');
 }
});
test('standing against a GLB wall remains supported for repeated gravity updates and can walk away',()=>{
 const {collision,environment}=fixture(true);let position={x:.59,y:.02,z:0};
 for(let i=0;i<300;i++)position=collision.resolve(environment,position,{x:position.x+.08,y:position.y-.05,z:position.z},{});
 assert.equal(position.y,.02);const away=collision.resolve(environment,position,{...position,x:position.x-.2},{});assert.ok(away.x<position.x-.19);
});
test('swept collisions stop fast motion through thin walls while preserving tangential movement',()=>{
 for(const glb of [true,false]){const {collision,environment}=fixture(glb);const position=collision.resolve(environment,{x:0,y:.02,z:0},{x:5,y:.02,z:3},{});assert.ok(position.x<.7);assert.ok(position.z>2.9);}
});
test('constraining a blocked axis preserves the smooth velocity parallel to the wall',()=>{
 const motion=new WalkingMotion(),out={};motion.reconcile({x:0,z:0},{serverTime:0,sentAt:0,receivedAt:0});motion.sample(16,.016,{side:1,forward:1},4,out);
 const velocity=motion.velocity.z,z=out.z;motion.constrain({x:0,z});assert.equal(motion.velocity.x,0);assert.equal(motion.velocity.z,velocity);motion.sample(32,.016,{side:1,forward:1},4,out);assert.ok(out.z<z);
});

test('low steps remain climbable and wall sliding never cancels a rising jump',()=>{
 for(const glb of [true,false]){
  const {collision,environment,world,wall}=fixture(glb);wall.scale.y=.25/3;wall.position.y=.125;wall.updateMatrixWorld(true);world.walls[0].box.setFromObject(wall);
  const step=collision.resolve(environment,{x:.55,y:.02,z:0},{x:1,y:-.01,z:0},{});assert.ok(step.x>.99);assert.ok(step.y>=.25&&step.y<=.28);
  const jumping=collision.resolve(environment,{x:0,y:.02,z:0},{x:0,y:.2,z:.05},{});assert.equal(jumping.y,.2);
 }
});
