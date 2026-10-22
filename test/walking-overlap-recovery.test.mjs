import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {Capsule} from '../public/vendor/three/addons/math/Capsule.js';
import {sweepWalkingMotion} from '../public/js/walking-sweep.js';
import {moveWalkingCapsule} from '../public/js/walking-capsule.js';
import {buildCollision} from '../public/js/environments/environment-collision.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';

const wall={a:{x:.2,z:-3},b:{x:.2,z:3}},pinch=[wall,{a:{x:-.2,z:-.2},b:{x:-.1,z:0}},{a:{x:-.1,z:0},b:{x:-.2,z:.2}}];
test('a trapped overlapping capsule can leave a narrow mesh pinch without crossing a surface',()=>{
 const start={x:0,y:.02,z:0};
 assert.deepEqual(sweepWalkingMotion(start,start,pinch),start,'idle contact never moves the player');
 const exit=sweepWalkingMotion(start,{...start,z:1},pinch);assert.ok(exit.z>.9);assert.ok(exit.x<.2&&exit.x>-.1);
 const blocked=sweepWalkingMotion(start,{...start,x:10},pinch);assert.ok(blocked.x<.2,'recovery still sweeps against the thin wall, even for a large movement');
});
test('a normal wall or corner never relaxes its capsule clearance',()=>{
 const start={x:0,y:.02,z:.1},edge={a:{x:-5,z:0},b:{x:5,z:0}};
 assert.equal(sweepWalkingMotion(start,{...start,z:-10},[edge]).z,start.z,'an overlapping player can reverse out, so movement into the wall remains blocked');
 const nearSurface={x:0,y:.02,z:6.5e-10};assert.equal(sweepWalkingMotion(nearSurface,{...nearSurface,z:-10},[edge]).z,nearSurface.z);assert.ok(sweepWalkingMotion(nearSurface,{...nearSurface,z:1},[edge]).z>.99,'a positive saved clearance must still permit reversing away from the wall');
 const normal=sweepWalkingMotion({x:0,z:1},{x:2,z:-9},[edge]);assert.ok(Math.abs(normal.z-.302)<1e-8);
});

test('repeated recovery pressure retains a positive wall margin and can reverse out',()=>{
 let position={x:0,y:.02,z:0};
 for(let frame=0;frame<200;frame++)position=sweepWalkingMotion(position,{...position,x:position.x+.3},pinch);
 assert.ok(position.x<wall.a.x-.0009,'wall pressure never collapses the center onto the barrier');
 const exit=sweepWalkingMotion(position,{...position,z:position.z+1},pinch);assert.ok(Math.hypot(exit.x-position.x,exit.z-position.z)>.1);
});

const poses=[['muzikaz-main',{x:4.847983058228645,y:-4.042408301102657,z:-8.894228787378331}],['muzikaz-upper',{x:4.926001790353616,y:.996368559452605,z:-4.022117799008554}],['studio-ridge-in',{x:-2.520849180546589,y:.02,z:-11.972651708240235}],['kitchen-upper-deck',{x:5.323718479869112,y:1.0570188465782644,z:-4.55275316853626}]];
const environments=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url),'utf8'));
const fixtures=new Map();
poses.push(['muzikaz-main',{x:4.8626206201321756,y:-4.042408301102657,z:-8.901014884608095},'near-vertex'],['studio-ridge-in',{x:-2.451324472133873,y:.02,z:-12.06030272034},'near-vertex']);
for(const [id,position,variant='late-traversal']of poses)test(id+' retains an exit at the '+variant+' mesh pinch on server and browser',()=>{
 if(!fixtures.has(id)){const environment=environments.find(world=>world.id===id),collision=new ServerBuilderCollision(),world=collision.world(environment);fixtures.set(id,{environment,collision,local:buildCollision(world.root)});}
 const {environment,collision,local}=fixtures.get(id);
 let serverExit=0,localExit=0;
 for(let direction=0;direction<8;direction++){
  const angle=direction*Math.PI/4,dx=Math.sin(angle)*.3,dz=Math.cos(angle)*.3;
  const resolved=collision.resolve(environment,position,{x:position.x+dx,y:position.y-.04,z:position.z+dz});
  serverExit=Math.max(serverExit,Math.hypot(resolved.x-position.x,resolved.z-position.z));
  const capsule=new Capsule(new THREE.Vector3(position.x,position.y+.34,position.z),new THREE.Vector3(position.x,position.y+1.65-.34,position.z),.34);
  moveWalkingCapsule(capsule,{x:dx,y:-.04,z:dz},{octree:local.octree,grounded:true,verticalVelocity:0});
  localExit=Math.max(localExit,Math.hypot(capsule.start.x-position.x,capsule.start.z-position.z));
 }
 assert.ok(serverExit>.01,'authoritative controls can walk out of the existing overlap');assert.ok(localExit>.01,'the browser capsule can walk out of the same imported geometry');
});
