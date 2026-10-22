import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {placementMeshes,placementBounds,placementTriangles} from '../public/js/placed-item-collision.js';
import {createTrafficCollisionProxy} from '../public/js/traffic-collision-proxy.js';
import {isAircraft} from '../public/js/aircraft-flight.js';import {isWatercraft} from '../public/js/harbor-water.js';
const source=readFileSync(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8'),start=source.indexOf('  function walkingSurfaces()'),body=source.slice(start,source.indexOf('  function updatePlayer(',start));
const box=(id,x,z,size=1)=>{const root=new THREE.Group();root.userData.builderObjectId=id;root.position.set(x,0,z);root.add(new THREE.Mesh(new THREE.BoxGeometry(size,1,size),new THREE.MeshBasicMaterial()));return root;};
test('walking builds nearby collision faces, updates moved roots and retains large overlapping structures',()=>{
 const near=box('near',0,0),far=box('far',100,100),roots=[near,far],playerRig={position:new THREE.Vector3()};const context=vm.createContext({THREE,placementMeshes,placementBounds,placementTriangles,createTrafficCollisionProxy,isAircraft,isWatercraft,buildingSolids:()=>roots,serverActors:{},serverVehicleId:null,walkingSurfaceCache:new WeakMap(),walkingRootBounds:new WeakMap(),trafficWalkingProxies:new WeakMap(),playerRig});vm.runInContext(body,context);
 assert.deepEqual([...context.walkingSurfaces()].map(g=>g.objectId),['near']);playerRig.position.set(100,0,100);assert.deepEqual([...context.walkingSurfaces()].map(g=>g.objectId),['far']);near.position.set(99,0,100);assert.equal(context.walkingSurfaces().length,2);roots.push(box('wide',0,0,300));assert.ok(context.walkingSurfaces().some(g=>g.objectId==='wide'));
});
test('moving AI craft use bounded physical proxies and resident artwork never rebuilds walking geometry',()=>{
 const plane=box('plane',0,0),resident=box('resident',0,0),context=vm.createContext({THREE,placementMeshes,placementBounds,placementTriangles,createTrafficCollisionProxy,isAircraft,isWatercraft,buildingSolids:()=>[plane,resident],serverActors:{plane:{id:'plane',modelId:'corsair-aircraft',trafficAI:true},resident:{id:'resident',modelId:'world-resident',trafficAI:true,resident:{}}},serverVehicleId:null,walkingSurfaceCache:new WeakMap(),walkingRootBounds:new WeakMap(),trafficWalkingProxies:new WeakMap(),playerRig:{position:new THREE.Vector3()}});vm.runInContext(body,context);const groups=context.walkingSurfaces();assert.equal(groups.length,3);assert.ok(groups.every(g=>g.objectId==='plane'));assert.ok(groups.reduce((n,g)=>n+g.triangles.length,0)<=36);
});
