import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {placementBounds,placementMeshes,placementTriangles} from '../public/js/placed-item-collision.js';
const source=readFileSync(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8');
test('walking presentation follows accepted feet immediately on ascending and descending steps',()=>{
 const player={radius:.34,height:1.65,eyeHeight:1.65,yaw:0,pitch:0,speed:3.2,onGround:true,velocity:new THREE.Vector3()};
 const collider={start:new THREE.Vector3(0,.36,0),end:new THREE.Vector3(0,1.33,0)};
 const context=vm.createContext({THREE,player,playerCollider:collider,playerRig:{position:new THREE.Vector3(),rotation:{}},camera:{position:new THREE.Vector3(),rotation:{set(){}}},renderer:{xr:{isPresenting:false}},seatedBuilderObject:null,thumbInput:{rightX:0,rightY:0,leftX:0,leftY:0},topDownAimTarget:null,RIGHT_THUMBSTICK_SENSITIVITY:1,playerPreferences:{touchSensitivity:1},getMovementInput:()=>({x:0,y:1}),forward:new THREE.Vector3(),right:new THREE.Vector3(),move:new THREE.Vector3(),useJetpack:()=>false,walkingSprint:()=>false,stickSprinting:false,envLoader:{octree:null},walkingSurfaces:()=>[],FLOOR_ENTRY_OFFSET:.02,localGroundViewY:.02,moveWalkingCapsule:()=>({onGround:true,velocityY:0})});
 vm.runInContext(source.slice(source.indexOf('  function updatePlayer(delta)'),source.indexOf('  const isTypingTarget')),context);
 for(const y of [.02,.24,.46,.24,.02]){collider.start.y=y+player.radius;collider.end.y=y+player.height-player.radius;context.updatePlayer(1/60);assert.ok(Math.abs(context.playerRig.position.y-y)<1e-10);assert.equal(context.camera.position.y,player.eyeHeight);}
});
test('walking and placement share mirrored floor normals and complete solid bounds',()=>{
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(2,.4,2));mesh.scale.x=-1;mesh.position.y=.2;
 const context=vm.createContext({THREE,placementBounds,placementMeshes,placementTriangles,buildingSolids:()=>[mesh],walkingSurfaceCache:new WeakMap(),walkingRootBounds:new WeakMap(),serverActors:{},serverVehicleId:null,constructionScene:{groundMeshes:[]},playerRig:{position:new THREE.Vector3()}});
 vm.runInContext(source.slice(source.indexOf('  function walkingSurfaces()'),source.indexOf('  function updatePlayer(delta)')),context);
 for(let repeat=0;repeat<2;repeat++){
  const [{triangles}]=context.walkingSurfaces();const tops=triangles.filter(triangle=>triangle.getNormal(new THREE.Vector3()).y>.55);
  assert.equal(tops.length,2);for(const top of tops){assert.ok(Math.abs(top.a.y-.4)<1e-7);assert.ok(Math.abs(top.solidBounds.min.y)<1e-7);}
 }
});
