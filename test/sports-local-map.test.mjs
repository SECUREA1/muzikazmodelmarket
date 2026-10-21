import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {buildCollision} from '../public/js/environments/environment-collision.js';
import {findLocalMapLanding} from '../public/js/local-map-landing.js';
import {localMapLocations} from '../public/js/local-map-locations.js';
import {nearestArcadeInteraction} from '../public/js/arcade-navigation.js';

const hockeySource=await readFile(new URL('../public/js/hockey-game.js',import.meta.url),'utf8');
const arcadeSource=await readFile(new URL('../public/js/arcade-game.js',import.meta.url),'utf8');
const block=(source,start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
function geometry(){
 const root=new THREE.Group(),floor=new THREE.Mesh(new THREE.BoxGeometry(20,.2,20),new THREE.MeshBasicMaterial());floor.position.y=-.1;floor.userData.sportsSurface='ice';floor.userData.arcadePart='ground';root.add(floor);
 const wall=new THREE.Mesh(new THREE.BoxGeometry(.12,3,10),new THREE.MeshBasicMaterial());wall.position.set(0,1.5,0);root.add(wall);root.updateMatrixWorld(true);return {root,floor};
}
function hockey(){
 const {root:arena}=geometry(),scene=new THREE.Scene();scene.add(arena);const selection={value:'broadcast'},keys=new Set(['w']);let updates=0;
 const context=vm.createContext({THREE,buildCollision,findLocalMapLanding,localMapLocations,arena,scene,environment:{id:'rink',name:'Rink'},hockeyMapDecor:[],hockeyMapCollision:null,hockeyMapViewpoint:null,running:false,spectating:false,keys,controllerMove:{x:1,y:-1},hockeyTrigger:{reset(){}},lookDrag:{},vrSpectatorPosition:new THREE.Vector3(),viewInitialized:true,orbit:{target:new THREE.Vector3(),minDistance:8},$:()=>selection,updateCameraToggle(){},updateHockeyMapLive(){updates++;}});
 vm.runInContext(block(hockeySource,'function hockeyMapEnvironment()','function updateHockeyMapLive()'),context);
 return {context,selection,keys,get updates(){return updates;}};
}
test('hockey map moves only a clear local spectator viewpoint and clears held controls',async()=>{
 const fixture=hockey(),{context}=fixture;
 const result=await context.hockeyMapCommand('map-access',{position:{x:3,z:3}});
 assert.match(result.result.message,/viewpoint/);assert.equal(fixture.selection.value,'free');assert.equal(context.hockeyMapViewpoint.x,3);assert.ok(Math.abs(context.hockeyMapViewpoint.y-.02)<1e-6);assert.equal(context.hockeyMapViewpoint.z,3);assert.equal(context.vrSpectatorPosition.y,context.hockeyMapViewpoint.y+1.65);assert.equal(fixture.keys.size,0);assert.equal(context.controllerMove.x,0);assert.equal(fixture.updates,1);
 context.running=true;context.spectating=true;await context.hockeyMapCommand('map-access',{locationId:'map-east'});assert.ok(context.hockeyMapViewpoint.x>0);
});
test('hockey cannot teleport a participating skater or bypass clear physical floor',async()=>{
 const {context}=hockey();context.running=true;context.spectating=false;
 await assert.rejects(context.hockeyMapCommand('map-access',{position:{x:3,z:3}}),/Spectate|match rules/);assert.equal(context.hockeyMapViewpoint,null);
 context.spectating=true;
 for(const position of [{x:0,z:2},{x:50,z:0},{x:NaN,z:0}])await assert.rejects(context.hockeyMapCommand('map-access',{position}),/clear arena floor/);
 await assert.rejects(context.hockeyMapCommand('map-access',{entityId:'skater'}),/match lobby/);await assert.rejects(context.hockeyMapCommand('map-access',{locationId:'missing'}),/listed/);
});
function arcade(){
 const {root,floor:ground}=geometry(),scene=new THREE.Scene();scene.add(root);const walker={x:-3,z:3,ground:.02,eyeHeight:1.68,radius:.3},walkKeys=new Set(['KeyW']),controllerWalkKeys=new Set(['forward']);
 const context=vm.createContext({T:THREE,buildCollision,findLocalMapLanding,localMapLocations,nearestArcadeInteraction,mapEnvironment:{id:'park'},environmentId:'park',mapName:'Park',builderScene:null,bounds:{minX:-9.6,maxX:9.6,minZ:-9.6,maxZ:9.6},arcadeMapCollision:null,park:{root},builderObjects:null,ground,scene,walker,walkKeys,touchKeys:new Set(['right']),controllerWalkKeys,pressed:new Set([' ']),controllerMove:{x:1,y:-1},drag:true,game:null,ride:null,walkInteractions:[],nearby:null,frameClock:{previous:0},performance:{now:()=>250},updateArcadeMapLive(){}});
 vm.runInContext(block(arcadeSource,'function arcadeMapEnvironment()','function updateArcadeMapLive()'),context);return {context,walker,walkKeys,controllerWalkKeys};
}
test('arcade map crosses separated rooms to supported floor and releases every movement source',async()=>{
 const {context,walker,walkKeys,controllerWalkKeys}=arcade();
 await context.arcadeMapCommand('map-access',{position:{x:3,z:3}});assert.equal(walker.x,3);assert.equal(walker.z,3);assert.ok(Math.abs(walker.ground-.02)<1e-6);assert.equal(walkKeys.size,0);assert.equal(controllerWalkKeys.size,0);assert.equal(context.touchKeys.size,0);assert.equal(context.pressed.size,0);assert.equal(context.controllerMove.x,0);assert.equal(context.drag,false);assert.equal(context.frameClock.previous,250);
 await context.arcadeMapCommand('map-access',{locationId:'map-east'});assert.ok(walker.x>0);
});
test('arcade map rejects walls, void, invalid markers, boarding and active games or rides',async()=>{
 const {context,walker}=arcade(),before={...walker};
 for(const position of [{x:0,z:2},{x:50,z:0},{x:NaN,z:0}])await assert.rejects(context.arcadeMapCommand('map-access',{position}),/clear park floor/);
 assert.deepEqual(walker,before);
 await assert.rejects(context.arcadeMapCommand('map-access',{locationId:'missing'}),/listed/);await assert.rejects(context.arcadeMapCommand('map-access',{entityId:'train'}),/park entrance/);
 context.game=2;await assert.rejects(context.arcadeMapCommand('map-access',{position:{x:3,z:3}}),/Return to the park/);context.game=null;context.ride=5;await assert.rejects(context.arcadeMapCommand('map-access',{position:{x:3,z:3}}),/Return to the park/);
 assert.deepEqual(walker,before);
});
