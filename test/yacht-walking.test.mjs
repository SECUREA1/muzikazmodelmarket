import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {Capsule} from '../public/vendor/three/addons/math/Capsule.js';
import {neonMarina} from '../neon-marina.mjs';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {boatExitPosition,stopBoat} from '../server-harbor-operations.mjs';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
import {placementTriangles,placementBounds} from '../public/js/placed-item-collision.js';
import {moveWalkingCapsule} from '../public/js/walking-capsule.js';
const marina=neonMarina(),source=marina.objects.find(o=>o.modelId==='harbor-yacht');
const environment={id:'walkable-yacht',proceduralLand:true,builderScene:{layout:'community-park',mapSize:256,layoutMeta:{harbor:marina.harbor},objects:marina.objects}};
function fixture(yaw=0){
 const boat=structuredClone({...source,position:{x:275,y:0,z:100},rotation:{x:.025,y:yaw,z:.03},active:true,holderId:'captain'}),actors={[boat.id]:boat},collision=new ServerBuilderCollision();stopBoat(boat);
 const world=p=>({x:boat.position.x+p.x*Math.cos(yaw)+p.z*Math.sin(yaw),y:p.y,z:boat.position.z-p.x*Math.sin(yaw)+p.z*Math.cos(yaw)});
 return {boat,actors,collision,world};
}
for(const yaw of [0,.8,-1.7])test('leaving tilted yacht at heading '+yaw+' has a confirmed floor through idle and walking ticks',()=>{
 const {boat,actors,collision,world}=fixture(yaw),exit=boatExitPosition(environment,boat,collision,actors,{});boat.holderId=null;
 assert.ok(Math.abs(exit.y-1.97)<.001);let position=exit;
 for(let i=0;i<40;i++)position=collision.resolve(environment,position,{...position,y:position.y-.03},actors,{});
 assert.ok(position.y>1.96);
 const destination=world({x:0,y:1.97,z:-10});
 for(let i=0;i<500;i++){const dx=destination.x-position.x,dz=destination.z-position.z,len=Math.hypot(dx,dz);if(len<.03)break;position=collision.resolve(environment,position,{x:position.x+dx/len*.05,y:position.y-.02,z:position.z+dz/len*.05},actors,{});assert.ok(position.y>1.96,'corridor has support');}
 assert.ok(Math.hypot(position.x-destination.x,position.z-destination.z)<.1,'all rooms connect along central corridor');
});
test('server climbs real stair treads through open stairwell onto upper deck and descends',()=>{
 const {boat,actors,collision,world}=fixture(),start=world({x:-3.9,y:1.97,z:15});let position=start;boat.holderId=null;
 for(let i=0;i<160;i++)position=collision.resolve(environment,position,{...position,z:position.z-.05,y:position.y-.02},actors,{});
 assert.ok(position.y>5.03,'upper deck is a floor, not an excluded roof');assert.ok(position.z<boat.position.z+7.1);
 for(let i=0;i<160;i++)position=collision.resolve(environment,position,{...position,z:position.z+.05,y:position.y-.04},actors,{});
 for(let i=0;i<4;i++)position=collision.resolve(environment,position,{...position,y:position.y-.04},actors,{});
 assert.ok(Math.abs(position.y-1.97)<.03,'return to main deck');
});
test('browser capsule walks the same stairs and stays on the same upper deck',()=>{
 const model=createBuilderModel('harbor-yacht');model.updateMatrixWorld(true);
 const triangleGroups=[{bounds:placementBounds(THREE,model),triangles:placementTriangles(THREE,[model])}],capsule=new Capsule(new THREE.Vector3(-3.9,1.97+.34,15),new THREE.Vector3(-3.9,1.97+1.65-.34,15),.34);
 let grounded=true;
 for(let i=0;i<160;i++){const contact=moveWalkingCapsule(capsule,{x:0,y:-.02,z:-.05},{triangleGroups,grounded,maxStepHeight:.26,floorGap:.02});grounded=contact.onGround;}
 assert.ok(capsule.start.y-.34>5.03);assert.ok(capsule.start.z<7.1);
});
test('the boarding gangway joins the pier to the main deck for server and browser walkers',()=>{
 const boat={...structuredClone(source),active:true},actors={[boat.id]:boat},collision=new ServerBuilderCollision();
 let position=collision.groundAt(environment,{x:boat.position.x,y:.5,z:boat.position.z+18.1},{actors});assert.ok(position);
 for(let i=0;i<85;i++)position=collision.resolve(environment,position,{...position,y:position.y-.02,z:position.z-.045},actors,{});
 assert.ok(position.y>1.96,'server reaches main deck from dock');
 const group=new THREE.Group(),model=createBuilderModel('harbor-yacht'),pier=new THREE.Mesh(new THREE.BoxGeometry(4,.16,2.4),new THREE.MeshBasicMaterial());pier.userData.collider=true;pier.position.set(0,.08,17);group.add(model,pier);group.updateMatrixWorld(true);
 const triangleGroups=[{bounds:placementBounds(THREE,group),triangles:placementTriangles(THREE,[group])}],capsule=new Capsule(new THREE.Vector3(0,.52,18.1),new THREE.Vector3(0,1.49,18.1),.34);let grounded=true;
 for(let i=0;i<85;i++){const result=moveWalkingCapsule(capsule,{x:0,y:-.02,z:-.045},{triangleGroups,grounded,maxStepHeight:.26,floorGap:.02});grounded=result.onGround;}
 assert.ok(capsule.start.y-.34>1.96,'browser reaches main deck from dock: '+JSON.stringify(capsule.start));
});
