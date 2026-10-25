import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {placementMeshes,placementBounds,placementTriangles} from '../public/js/placed-item-collision.js';
import {createConstructionModel,updateConstructionModel} from '../public/js/construction-models.js';
import {createTrafficCollisionProxy} from '../public/js/traffic-collision-proxy.js';
import {isAircraft} from '../public/js/aircraft-flight.js';
import {isWatercraft} from '../public/js/harbor-water.js';

const source=readFileSync(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8');
const start=source.indexOf('  function walkingSurfaces()');
const walkingSource=source.slice(start,source.indexOf('  function updatePlayer(',start));

test('slewing a stationary crane refreshes nearby walking surfaces from its real collision proxies',()=>{
 assert.ok(start>=0,'test exercises the game walking-surface selector');
 const crane=createConstructionModel('tower-crane');
 const actor={id:'walking-crane',modelId:'tower-crane',construction:{slew:0,trolley:4,hoist:4}};
 crane.userData.builderObjectId=actor.id;crane.userData.construction=actor.construction;
 updateConstructionModel(crane,0);
 const position=crane.position.clone(),orientation=crane.quaternion.clone();
 const oldArea=new THREE.Vector3(0,78,40),newArea=new THREE.Vector3(40,78,0);
 const playerRig={position:oldArea.clone()};
 const context=vm.createContext({
  constructionScene:{groundMeshes:[]},
  THREE,placementMeshes,placementBounds,placementTriangles,createTrafficCollisionProxy,isAircraft,isWatercraft,
  buildingSolids:()=>[crane],serverActors:{[actor.id]:actor},serverVehicleId:null,playerRig,
  walkingSurfaceCache:new WeakMap(),walkingRootBounds:new WeakMap(),trafficWalkingProxies:new WeakMap()
 });
 vm.runInContext(walkingSource,context);
 const oldSurfaces=context.walkingSurfaces();
 assert.ok(oldSurfaces.some(group=>group.bounds.containsPoint(oldArea)),'initial jib has nearby physical walking faces');
 assert.equal(oldSurfaces.length,crane.userData.constructionParts.colliders.length,'walking uses the dedicated mechanical proxy meshes');
 playerRig.position.copy(newArea);
 assert.equal(context.walkingSurfaces().length,0,'future jib position starts outside the nearby collision budget');

 actor.construction.slew=Math.PI/2;updateConstructionModel(crane,1);
 const movedSurfaces=context.walkingSurfaces();
 assert.ok(movedSurfaces.some(group=>group.bounds.containsPoint(newArea)),'the rotated jib enters nearby walking surfaces');
 assert.ok(movedSurfaces.every(group=>group.objectId===actor.id),'physical surfaces keep their shared machine identity');
 playerRig.position.copy(oldArea);
 assert.equal(context.walkingSurfaces().length,0,'old jib area leaves the nearby collision budget after slewing');
 assert.ok(crane.position.equals(position),'crane chassis never moved');
 assert.ok(crane.quaternion.equals(orientation),'crane chassis never rotated');
});

test('earthwork walking cache follows a moved patch without a geometry edit',()=>{
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(4,.2,4));mesh.geometry.computeBoundingBox();
 const context=vm.createContext({THREE,placementBounds,placementTriangles,constructionScene:{groundMeshes:[mesh]},buildingSolids:()=>[],walkingSurfaceCache:new WeakMap()});
 vm.runInContext(walkingSource,context);
 const first=context.walkingSurfaces()[0];
 assert.equal(context.walkingSurfaces()[0],first,'unchanged patch reuses its triangles');
 mesh.position.set(12,3,-8);
 const moved=context.walkingSurfaces()[0];
 assert.notEqual(moved,first);assert.equal(moved.bounds.min.x,10);assert.ok(moved.triangles.every(t=>t.a.x>=10&&t.a.x<=14));
 assert.equal(context.walkingSurfaces()[0],moved);
});
