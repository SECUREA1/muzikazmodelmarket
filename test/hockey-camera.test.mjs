import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3,PerspectiveCamera,Vector3,Vector2,Raycaster} from '../public/vendor/three/three.module.min.js';
import {createHockey} from '../public/js/hockey-rules.js';
import {updateHockeyScoreboard} from '../public/js/hockey-facilities.js';
import {hockeyViewHeading,hockeySkateVector,hockeyCameraPose,hockeyAimPoint,hockeyViewForGameCamera,hockeyGameCameraForView} from '../public/js/hockey-camera.js';
import {createHockeyArena,createHockeyItem,createHockeyViewRig,animateHockeyViewRig,batchHockeyArena,batchHockeySkater,animateHockeyPose} from '../public/js/hockey-models.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('camera relative skating faces the attacking net and reverses correctly after an end change',()=>{
 const home=hockeySkateVector(0,1,hockeyViewHeading(1)),away=hockeySkateVector(0,1,hockeyViewHeading(-1));near(home.x,1);near(home.z,0);near(away.x,-1);near(away.z,0);
 const strafe=hockeySkateVector(1,0,hockeyViewHeading(1));near(strafe.x,0);near(strafe.z,1);
 const broadcast=hockeySkateVector(1,1,Math.PI);near(broadcast.x,Math.SQRT1_2);near(broadcast.z,-Math.SQRT1_2);near(Math.hypot(broadcast.x,broadcast.z),1);
});
test('player cameras follow the controlled player and keep chase eyes clear of spectator seats',()=>{
 const player={x:28,z:12},chase=hockeyCameraPose('chase',{player,heading:-Math.PI/2}),eye=hockeyCameraPose('ice',{player,heading:Math.PI/2});
 assert.equal(chase.immersive,true);assert.ok(chase.position[0]<=29.2&&chase.position[2]<=11.8);assert.equal(chase.position[1],4.1);assert.equal(eye.position[1],1.48);assert.ok(eye.position[0]>player.x);assert.ok(eye.target[0]>player.x);assert.equal(eye.fov,76);
 const down=hockeyCameraPose('ice',{player,pitch:.8});assert.ok(down.target[1]<eye.target[1]);
 const spectator=hockeyCameraPose('chase');assert.equal(spectator.immersive,false);assert.equal(spectator.position[1],43);assert.equal(hockeyCameraPose('broadcast',{aspect:.7}).position[1],65);
});
test('bad camera inputs and sky rays never produce nonfinite world aim or movement',()=>{
 for(const view of ['chase','ice','top-down','broadcast','unknown']){const pose=hockeyCameraPose(view,{player:{x:Infinity,z:NaN},heading:NaN,pitch:Infinity});assert.ok([...pose.position,...pose.target,pose.fov].every(Number.isFinite));}
 const direction=hockeySkateVector(Infinity,NaN,NaN);assert.ok(Object.values(direction).every(Number.isFinite));
 assert.deepEqual(hockeyAimPoint({x:0,y:2,z:0},{x:1,y:.1,z:0},{x:5,z:6}),{x:5,z:6});assert.deepEqual(hockeyAimPoint({x:0,y:2,z:0},{x:1,y:-.5,z:0}),{x:4,z:0});assert.ok(Math.abs(hockeyAimPoint({x:0,y:2,z:0},{x:1,y:-.003,z:0}).x)<=45);
});
test('arena scenery includes an instanced crowd, vector ice surface and woven goal net',()=>{
 const arena=createHockeyArena(),surface=arena.getObjectByName('REGULATION_ICE_SURFACE'),fans=arena.getObjectByName('INSTANCED_ARENA_FANS');assert.equal(surface.userData.sportsSurface,'ice');assert.deepEqual(surface.userData.sportsSurfaceRepeat,[.12,.12]);assert.ok(fans.isInstancedMesh&&fans.count>500);assert.ok(arena.getObjectByName('WOVEN_GOAL_NET').isLineSegments);assert.equal(arena.getObjectByName('ENCLOSED_ARENA_ENVIRONMENT').children.some(n=>n.position?.y>18),false,'roof cutaway must keep broadcast view open');
 const net=createHockeyItem('hockey-net');assert.ok(net.getObjectByName('WOVEN_GOAL_NET').geometry.getAttribute('position').count>150);
});
test('first person equipment stays local to presentation and animates without touching the simulation',()=>{
 const rig=createHockeyViewRig(),player={vx:5,vz:1,animation:'shoot'},before=JSON.stringify(player);animateHockeyViewRig(rig,player,.3);assert.notEqual(rig.rotation.z,0);assert.equal(JSON.stringify(player),before);assert.doesNotThrow(()=>JSON.stringify(rig.clone(true).userData));rig.traverse(mesh=>{if(mesh.isMesh){assert.equal(mesh.material.depthTest,false);assert.equal(mesh.material.depthWrite,false);}});
});

test('runtime arena batches reduce opaque draw calls while preserving named facilities and scoreboard panels',()=>{
 const arena=createHockeyArena(),ice=arena.getObjectByName('REGULATION_ICE_SURFACE'),scoreboard=arena.getObjectByName('CENTER_ICE_JUMBOTRON'),scoreNodes=[...scoreboard.children],scoreMaterials=scoreNodes.map(node=>node.material),before=[];
 arena.traverse(node=>{if(node.isMesh&&!node.isInstancedMesh&&!node.material.transparent)before.push(node);});
 const report=batchHockeyArena(arena);assert.ok(report.savedDrawCalls>400,JSON.stringify(report));assert.ok(report.batches<35);assert.equal(ice.visible,true);assert.equal(ice.userData.hockeyBatchedSource,undefined);
 for(const name of ['HOME_PLAYER_BENCH','AWAY_PLAYER_BENCH','HOME_PENALTY_BOX','AWAY_PENALTY_BOX','OFFICIAL_SCORERS_TABLE','INSTANCED_ARENA_FANS'])assert.ok(arena.getObjectByName(name),name);
 scoreNodes.forEach((node,i)=>{assert.equal(node.visible,true);assert.equal(node.material,scoreMaterials[i]);});
 assert.deepEqual(batchHockeyArena(arena),report,'batching must be idempotent');assert.doesNotThrow(()=>JSON.stringify(arena.clone(true).userData));
 const after=[];arena.traverse(node=>{if(node.isMesh&&!node.isInstancedMesh&&node.visible&&!node.material.transparent)after.push(node);});assert.ok(after.length<70,`${before.length} -> ${after.length}`);
});
test('skater batching preserves animated limbs and world bounds and never batches equipment controls',()=>{
 const rig=createHockeyItem('hockey-player'),visibleBounds=()=>{const result=new Box3();rig.updateMatrixWorld(true);rig.traverse(node=>{if(node.isMesh&&node.visible){node.geometry.computeBoundingBox();result.union(node.geometry.boundingBox.clone().applyMatrix4(node.matrixWorld));}});return result;},before=visibleBounds(),report=batchHockeySkater(rig),after=visibleBounds();
 assert.ok(report.savedDrawCalls>=5);for(const axis of ['x','y','z']){near(before.min[axis],after.min[axis]);near(before.max[axis],after.max[axis]);}for(const name of ['HOCKEY_ARM_LEFT','HOCKEY_ARM_RIGHT','HOCKEY_LEG_LEFT','HOCKEY_LEG_RIGHT','HOCKEY_STICK'])assert.equal(rig.getObjectByName(name).visible,true,name);animateHockeyPose(rig,'skate',.2);assert.notEqual(rig.getObjectByName('HOCKEY_LEG_LEFT').rotation.x,0);animateHockeyPose(rig,'shoot',0);assert.equal(rig.getObjectByName('HOCKEY_STICK').rotation.z,-.8);
});
test('batched arena retains live scoreboard canvases and updates their existing textures',()=>{
 const prior=globalThis.document,painted=[];globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},fillText(text){painted.push(text);}})})};
 try{const arena=createHockeyArena(),scoreboard=arena.getObjectByName('CENTER_ICE_JUMBOTRON'),panels=scoreboard.children.filter(node=>node.material?.map),maps=panels.map(node=>node.material.map),versions=maps.map(map=>map.version);assert.equal(panels.length,2);batchHockeyArena(arena);const match=createHockey();match.score=[4,2];match.remaining=83;updateHockeyScoreboard(arena,match);assert.ok(painted.includes('4  —  2'));assert.ok(painted.includes('P1  1:23'));panels.forEach((panel,i)=>{assert.equal(panel.material.map,maps[i]);assert.ok(maps[i].version>versions[i]);assert.equal(panel.visible,true);});}finally{if(prior===undefined)delete globalThis.document;else globalThis.document=prior;}
});

test('Top down follows the skater vertically below arena overheads and preserves screen-relative movement and aim',()=>{
 for(const attack of [1,-1]){
  const player={x:4,z:-3},heading=hockeyViewHeading(attack),pose=hockeyCameraPose('top-down',{player,heading}),camera=new PerspectiveCamera(pose.fov,.84,.035,300);
  assert.deepEqual(pose.position,[4,11,-3]);assert.deepEqual(pose.target,[4,0,-3]);assert.equal(pose.immersive,true);assert.ok(pose.position[1]<12,'camera stays below scoreboard bottom');
  camera.position.fromArray(pose.position);camera.up.fromArray(pose.up);camera.lookAt(...pose.target);camera.updateMatrixWorld(true);const forward=hockeySkateVector(0,1,heading),right=hockeySkateVector(1,0,heading),ahead=new Vector3(player.x+forward.x*2,.03,player.z+forward.z*2).project(camera),side=new Vector3(player.x+right.x*2,.03,player.z+right.z*2).project(camera);assert.ok(ahead.y>0);near(ahead.x,0);assert.ok(side.x>0);near(side.y,0);
  const ray=new Raycaster();ray.setFromCamera(new Vector2(.4,.3),camera);const aim=hockeyAimPoint(ray.ray.origin,ray.ray.direction),dx=aim.x-player.x,dz=aim.z-player.z;assert.ok(dx*forward.x+dz*forward.z>0);assert.ok(dx*right.x+dz*right.z>0);
 }
 const fallback=hockeyCameraPose('top-down',{puck:{x:17,z:6}});assert.deepEqual(fallback.position,[17,11,6]);assert.equal(fallback.immersive,false);
});
test('hockey maps canonical shared camera preferences without changing match state',async()=>{
 const {readGameCameraMode,writeGameCameraMode}=await import('../public/js/game-camera.js'),before=globalThis.localStorage,storage=new Map();globalThis.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
 try{const state=createHockey(),snapshot=JSON.stringify(state);for(const mode of ['first-person','top-down']){writeGameCameraMode(mode);const view=hockeyViewForGameCamera(readGameCameraMode());assert.equal(hockeyGameCameraForView(view),mode);const player=state.players[0];hockeyCameraPose(view,{player});assert.equal(JSON.stringify(state),snapshot);}assert.equal(hockeyGameCameraForView('chase'),null);assert.equal(hockeyGameCameraForView('broadcast'),null);}finally{if(before===undefined)delete globalThis.localStorage;else globalThis.localStorage=before;}
});
