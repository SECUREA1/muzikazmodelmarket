import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {BuilderVehicleController} from '../public/js/builder-vehicle-controller.js';

function fixture() {
 const vehicles=new THREE.Group(),playerRig=new THREE.Group(),camera=new THREE.PerspectiveCamera(),keys=new Set(),events=[];
 let input={};
 const controller=new BuilderVehicleController({THREE,vehicles,playerRig,camera,keys,input:()=>input,onEnter:vehicle=>events.push({type:'enter',vehicle}),onExit:position=>events.push({type:'exit',position})});
 const add=(name,x=0,mode='drive')=>{
  const root=new THREE.Group();root.name=name;root.position.set(x,.4,0);
  root.userData.vehicle={mode,seat:[0,.8,.2],speed:mode==='fly'?18:9,turnSpeed:1.75};vehicles.add(root);return root;
 };
 return {controller,vehicles,playerRig,camera,keys,events,add,setInput:value=>{input=value;}};
}

test('hidden, inactive and malformed nearer craft cannot mask a usable nearby vehicle',()=>{
 const f=fixture(),hidden=f.add('hidden',.5),inactive=f.add('inactive',1),malformed=f.add('malformed',1.5),usable=f.add('usable',2);
 hidden.visible=false;inactive.userData.active=false;delete malformed.userData.vehicle.seat;
 assert.equal(f.controller.nearest(),usable);assert.equal(f.controller.toggle(),true);assert.equal(f.controller.active,usable);
 f.controller.exit();
 for(const vehicle of [hidden,inactive,malformed])assert.equal(f.controller.enter(vehicle),false);
 usable.userData.vehicle.active=false;assert.equal(f.controller.toggle(),false);assert.equal(f.controller.active,null);
 assert.equal(f.controller.update(.1),false);
});

for(const controls of ['keyboard','touch'])test(controls+' input drives, steers and carries the player at the actual seat',()=>{
 const f=fixture(),quad=f.add('quad');
 quad.rotation.y=.4;assert.equal(f.controller.enter(quad),true);
 if(controls==='keyboard'){f.keys.add('w');f.keys.add('a');}else f.setInput({throttle:1,steering:1});
 const start=quad.position.clone(),heading=quad.rotation.y;
 for(let step=0;step<10;step++)assert.equal(f.controller.update(.1),true);
 assert.ok(quad.position.distanceTo(start)>1);assert.ok(quad.rotation.y>heading);
 const seat=new THREE.Vector3(...quad.userData.vehicle.seat).applyMatrix4(quad.matrixWorld);
 assert.ok(f.playerRig.position.distanceTo(seat)<1e-9);assert.equal(f.playerRig.rotation.y,quad.rotation.y);
 assert.deepEqual(f.camera.position.toArray(),[0,.75,.15]);assert.equal(f.events[0].type,'enter');assert.equal(f.events[0].vehicle,quad);
});

test('flight keyboard and touch controls climb and descend without crossing the ground limit',()=>{
 const f=fixture(),plane=f.add('plane',0,'fly');f.controller.enter(plane);
 f.keys.add(' ');f.controller.update(.2);const climbed=plane.position.y;assert.ok(climbed>.4);
 f.keys.clear();f.keys.add('shift');f.controller.update(.1);assert.ok(plane.position.y<climbed);
 f.keys.clear();const beforeTouch=plane.position.y;f.setInput({lift:1});f.controller.update(.2);assert.ok(plane.position.y>beforeTouch);
 f.setInput({lift:-1});for(let step=0;step<10;step++)f.controller.update(.2);assert.equal(plane.position.y,.35);
 assert.deepEqual(f.camera.position.toArray(),[0,1.1,.15]);
});

test('exiting reports the rotated dismount point once and releases all vehicle state',()=>{
 const f=fixture(),quad=f.add('quad',3);quad.rotation.y=Math.PI/2;
 f.controller.enter(quad);f.keys.add('w');f.controller.update(.1);
 const expected=quad.position.clone().add(new THREE.Vector3(1.8,.2,0).applyQuaternion(quad.quaternion));
 assert.equal(f.controller.toggle(),true);assert.equal(f.controller.active,null);assert.equal(f.controller.velocity,0);
 const exits=f.events.filter(event=>event.type==='exit');assert.equal(exits.length,1);assert.ok(exits[0].position.distanceTo(expected)<1e-9);
 assert.equal(f.controller.exit(),false);assert.equal(f.controller.update(.1),false);assert.equal(f.events.filter(event=>event.type==='exit').length,1);
});
