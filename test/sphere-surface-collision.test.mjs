import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {sweepSphereSurfaces,bounceBallSurfaces,clampSphereSurfaces} from '../public/js/sphere-surface-collision.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {BASKETBALL_BALL_ID,ensureBasketballGame,startBasketballGame,assignBasketballTeam,shootBasketball,stepBasketballGame} from '../public/js/basketball-rules.js';

const mesh=(size,position)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),new THREE.MeshBasicMaterial());mesh.position.set(...position);mesh.updateMatrixWorld(true);return mesh;};
const near=(actual,expected,tolerance=1e-6)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} ≈ ${expected}`);

test('a fast sphere bounces from thin GLB-style walls on either face with no material changes',()=>{
 const wall=mesh([8,4,.001],[0,2,0]);
 for(const side of [-1,1]){
  const previous={x:0,y:1,z:side*3},next={x:1,y:1,z:-side*8},ball={ballVelocity:{x:6,y:0,z:-side*66}};
  const hit=bounceBallSurfaces(ball,previous,next,[wall]);
  assert.ok(hit);assert.ok(next.z*side>.12);assert.ok(ball.ballVelocity.z*side>0);near(next.x,1);assert.equal(wall.material.side,THREE.FrontSide);
 }
});

test('sphere edges are solid while an authored doorway stays open',()=>{
 const walls=[mesh([2,3,.01],[-2,1.5,0]),mesh([2,3,.01],[2,1.5,0]),mesh([2,1,.01],[0,2.5,0])];
 assert.equal(sweepSphereSurfaces({x:0,y:1,z:3},{x:0,y:1,z:-3},.12,walls),null);
 const edge=sweepSphereSurfaces({x:.95,y:1,z:3},{x:.95,y:1,z:-3},.12,walls);assert.ok(edge,'a grazing sphere hits the jamb even when its center ray misses');
 const low=sweepSphereSurfaces({x:0,y:2.05,z:3},{x:0,y:2.05,z:-3},.12,walls);assert.ok(low,'the header blocks a sphere above the opening');
});

test('instanced and mirrored/scaled meshes collide at each rendered transform',()=>{
 const root=new THREE.Group();root.position.set(5,0,-2);root.scale.set(-2,1,1);
 const wall=new THREE.InstancedMesh(new THREE.BoxGeometry(1,3,.01),new THREE.MeshBasicMaterial(),2);
 for(const [index,x]of[[0,-2],[1,2]])wall.setMatrixAt(index,new THREE.Matrix4().makeTranslation(x,1.5,0));root.add(wall);root.updateMatrixWorld(true);
 for(const x of [1,9])assert.ok(sweepSphereSurfaces({x,y:1,z:1},{x,y:1,z:-5},.12,[root]));
 assert.equal(sweepSphereSurfaces({x:5,y:1,z:1},{x:5,y:1,z:-5},.12,[root]),null);
});

test('held ball clipping and existing overlaps never move the player or teleport the object',()=>{
 const wall=mesh([8,3,.01],[0,1.5,0]),previous={x:0,y:1,z:.5},next={x:0,y:1,z:-.4};
 const clipped=clampSphereSurfaces(previous,next,.12,[wall]);near(clipped.z,.127);assert.deepEqual(previous,{x:0,y:1,z:.5});
 const leaving=clampSphereSurfaces({x:0,y:1,z:.05},{x:0,y:1,z:1},.12,[wall]);near(leaving.z,1);
});

test('geometry draw range changes invalidate cached sphere collision triangles',()=>{
 const wall=mesh([8,3,.01],[0,1.5,0]);assert.ok(sweepSphereSurfaces({x:0,y:1,z:1},{x:0,y:1,z:-1},.12,[wall]));
 wall.geometry.setDrawRange(0,0);assert.equal(sweepSphereSurfaces({x:0,y:1,z:1},{x:0,y:1,z:-1},.12,[wall]),null);
});

test('a sphere ignores open/held/non-solid authored mesh ancestry',()=>{
 const root=new THREE.Group(),wall=mesh([8,3,.01],[0,1.5,0]);root.add(wall);root.userData.collisionDisabled=true;
 assert.equal(sweepSphereSurfaces({x:0,y:1,z:1},{x:0,y:1,z:-1},.12,[root]),null);
});

for(const angle of [20,55,75])test(`shared court scoring remains calibrated at ${angle} degrees through the actual stadium mesh`,()=>{
 const environment={id:'basketball-arena',builderScene:{layout:'basketball-stadium'}},collision=new ServerBuilderCollision(),now=1000;
 const sim={actors:{},players:{player:{actorId:'player',position:{x:0,y:0,z:7},yaw:0,health:100,lastSeen:now,heldId:null,input:{}}},events:[]};
 ensureBasketballGame(sim,environment,now);const player=sim.players.player;assignBasketballTeam(sim,player,now,'home');startBasketballGame(sim,now);player.position={x:0,y:0,z:-4};
 const ball=sim.actors[BASKETBALL_BALL_ID];ball.holderId=player.actorId;player.heldId=ball.id;
 shootBasketball(sim,player,now,{direction:{x:0,y:0,z:-1},power:.7,angle,mode:'assisted'});
 for(let i=1;i<=240&&sim.basketball.homeScore===0;i++){
  player.lastSeen=now+i*1000/60;
  stepBasketballGame(sim,player.lastSeen,1/60,{onBallStep:(ball,previous,next)=>{collision.moveBall(environment,ball,previous,next);}});
 }
 assert.equal(sim.basketball.homeScore,3,`a centered legal three-point shot scores, final ball ${JSON.stringify(ball.position)}`);
});
