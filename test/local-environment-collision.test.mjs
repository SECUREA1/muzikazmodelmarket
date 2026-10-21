import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {EnvironmentLoader} from '../public/js/environments/environment-loader.js';
import {LocalWalkingView} from '../public/js/local-walking-view.js';
import {createVehicleCollision} from '../public/js/local-vehicle-collision.js';

function fixture(localCollision){
 const scene=new THREE.Scene(),loader=new EnvironmentLoader({scene,renderer:{extensions:{has:()=>false},capabilities:{isWebGL2:true}},serverAuthoritative:()=>true,localCollision});
 const world=new THREE.Group(),floor=new THREE.Mesh(new THREE.BoxGeometry(20,.2,20)),wall=new THREE.Mesh(new THREE.BoxGeometry(.2,3,10));
 floor.name='FLOOR';floor.position.y=-.1;wall.name='WALL';wall.position.set(1,1.5,0);world.add(floor,wall);scene.add(world);
 loader.world=world;loader.activeEnvironment={id:'shared-physical-map'};loader.setSpaceScale(1);return loader;
}

test('shared movement uses real map floors and walls without changing server authority',()=>{
 const loader=fixture(true),view=new LocalWalkingView(),target={};
 assert.equal(loader.serverAuthoritative(),true);
 view.reconcile({x:0,y:.02,z:0},{receivedAt:0,grounded:true});
 for(let frame=1;frame<=60;frame++)view.sample(frame*1000/60,1/60,{side:1},{octree:loader.octree,speed:4},target);
 assert.ok(target.x>.5&&target.x<=.56001,'walking clips at the actual map wall');
 assert.ok(Math.abs(target.y-.02)<1e-5,'the local feet remain on the real map floor');
 const collision=createVehicleCollision({octree:loader.octree});
 assert.ok(Math.abs(collision.groundAt({x:0,y:5,z:0}).y-.02)<1e-5);
 assert.equal(collision.blocked({x:0,y:0,z:0},{x:2,y:0,z:0}),true);
});

test('local collision cache survives geometry refresh and world scaling in a shared room',()=>{
 const loader=fixture(true),down=new THREE.Ray(new THREE.Vector3(0,4,0),new THREE.Vector3(0,-1,0));
 loader.setSupplementalCollisionRoots([]);assert.ok(loader.octree.rayIntersect(down));
 loader.setSpaceScale(2);assert.ok(loader.octree.rayIntersect(down));
 const collision=createVehicleCollision({octree:loader.octree});
 assert.equal(collision.blocked({x:0,y:0,z:0},{x:3,y:0,z:0}),true);
});

test('server-only viewers can still omit the local collision cache',()=>{
 const loader=fixture(false),ray=new THREE.Ray(new THREE.Vector3(0,4,0),new THREE.Vector3(0,-1,0));
 assert.equal(loader.octree.rayIntersect(ray),false);
 assert.ok(loader.floorMeshes.length>0);
});
