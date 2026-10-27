import test from 'node:test';
import assert from 'node:assert/strict';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {createEarthworks,earthworksTake,earthworksDeposit,earthworksSurfaceAt} from '../public/js/construction-earthworks.js';
import {constructionGroundAt} from '../public/js/construction-collision.js';
import {initialConstructionState} from '../public/js/construction-state.js';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {Octree} from '../public/vendor/three/addons/math/Octree.js';
import {createBuilderLand} from '../public/js/environments/builder-land.js';
import {createConstructionScene} from '../public/js/construction-scene.js';
import {LocalWalkingView} from '../public/js/local-walking-view.js';
import {placementTriangles} from '../public/js/placed-item-collision.js';

const close=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-5,`${label}: ${a} versus ${b}`);
function fixture(){
 const construction={enabled:true,excavation:{x:0,z:0,width:8,depth:8,radius:4,maxDepth:8},stockpile:{x:20,z:0,width:8,depth:8}},environment={id:'earth-ground-integration',proceduralLand:true,construction,builderScene:{layout:'grand-floor',mapSize:80,objects:[]}},earthworks=createEarthworks(construction),collision=new ServerBuilderCollision();
 const cut=(depth=6)=>{const patch=earthworks.patches.find(p=>p.id==='excavation');for(let row=0;row<patch.rows;row++)for(let column=0;column<patch.columns;column++)earthworksTake(earthworks,{x:patch.origin.x+(column+.5)*patch.cellSize,z:patch.origin.z+(row+.5)*patch.cellSize},depth*patch.cellSize**2,{radius:0,cutY:-depth});};
 return {environment,earthworks,collision,cut};
}

test('the real rendered-ground cutout and authoritative floor ray expose a deep pit without the old flat support',()=>{
 const {environment,earthworks,collision,cut}=fixture();close(collision.groundAt(environment,{x:0,y:1,z:0},{earthworks}).y,.02,'uncut soil starts at grade');cut();
 close(earthworksSurfaceAt(earthworks,{x:0,z:0}).y,-6,'six metre physical cut');close(collision.groundAt(environment,{x:0,y:1,z:0},{earthworks}).y,-5.98,'ground ray reaches the bottom below old map bounds');close(collision.groundAt(environment,{x:10,y:1,z:0},{earthworks}).y,.02,'neighboring ordinary land retains support');
 const landed=collision.resolve(environment,{x:0,y:.02,z:0},{x:0,y:-7,z:0},{},{},{earthworks});close(landed.y,-5.98,'a walking body falls onto the real cut floor');close(landed.floorY,-5.98,'walking support advertises the same actual terrain height');
 const again=collision.groundAt(environment,{x:0,y:1,z:0},{earthworks});close(again.y,landed.y,'cached terrain revision retains exact support');
});

test('excavated edges remain real walls and local-map floor access rejects a capsule embedded in the cut side',()=>{
 const {environment,earthworks,collision,cut}=fixture();cut();const inside={x:0,y:-5.98,z:0},blocked=collision.resolve(environment,inside,{x:6,y:-5.98,z:0},{},{},{earthworks});
 assert.ok(blocked.x<=3.701&&blocked.x>=3.5,'the worker stops at its radius from the six metre cut wall: '+JSON.stringify(blocked));close(blocked.y,-5.98,'the wall cannot lift a worker to the outside grade');
 assert.equal(collision.hasBodyClearance(environment,inside,.38,{actors:{},objects:{},earthworks}),true);assert.equal(collision.hasBodyClearance(environment,{x:3.9,y:-5.98,z:0},.38,{actors:{},objects:{},earthworks}),false);
 const target=collision.teleportPosition(environment,{x:0,y:.02,z:10},inside,{},{},{localMap:true,earthworks});close(target.y,-5.98,'map travel selects the actual pit floor');assert.throws(()=>collision.teleportPosition(environment,{x:0,y:.02,z:10},{x:3.9,y:-5.98,z:0},{},{},{localMap:true,earthworks}),/clear floor/i);
});

test('new steel decks preserve elevated walking support above the same excavated terrain',()=>{
 const {environment,earthworks,collision,cut}=fixture();cut();const actors={deck:{id:'deck',active:true,constructionManaged:true,position:{x:0,y:3.84,z:0},rotation:{x:0,y:0,z:0},constructionStructure:{kind:'floor',size:{x:6,y:.16,z:6}}}};
 close(collision.groundAt(environment,{x:0,y:5,z:0},{actors,earthworks}).y,4.02,'the completed deck is retained above a pit');const landed=collision.resolve(environment,{x:0,y:6,z:0},{x:0,y:3,z:0},actors,{},{earthworks});close(landed.y,4.02,'the falling worker lands on real steel geometry');
 close(collision.groundAt(environment,{x:3.5,y:1,z:0},{actors,earthworks}).y,-5.98,'pit support remains outside the deck footprint');
});

test('deposited material raises actual receiving support and a machine footprint refuses a deep cut boundary',()=>{
 const {environment,earthworks,collision,cut}=fixture();cut();const placed=earthworksDeposit(earthworks,{x:21,y:Infinity,z:1},{soil:1,gravel:1},{radius:0});assert.deepEqual(placed,{soil:1,gravel:1});close(collision.groundAt(environment,{x:21,y:1,z:1},{earthworks}).y,.52,'deposited soil and gravel raise the physical surface');
 const dozer={id:'dozer',modelId:'site-bulldozer',active:true,position:{x:10,y:.02,z:0},rotation:{y:0}};dozer.construction=initialConstructionState(dozer);const ground=p=>collision.groundAt(environment,p,{earthworks});
 assert.ok(constructionGroundAt(dozer,dozer.position,ground),'tracked running gear starts supported outside the cut');assert.equal(constructionGroundAt(dozer,{x:3,y:.02,z:0},ground),null,'running gear cannot bridge an unsupported six metre drop');
});

test('the actual client scene geometry supports local walking in the same pit and updates only after an earth revision',()=>{
 const {environment,earthworks,cut}=fixture();cut();const base=createBuilderLand(environment);base.updateMatrixWorld(true);const octree=new Octree().fromGraphNode(base),scene=new THREE.Scene(),render=createConstructionScene(THREE,scene),snapshot={construction:{earthworks},actors:{}};render.update(snapshot);scene.updateMatrixWorld(true);
 const meshes=render.groundMeshes.slice();assert.equal(meshes.length,earthworks.patches.length);render.update(snapshot);assert.deepEqual(render.groundMeshes,meshes,'repeated room snapshots retain the same terrain geometry');
 const groups=()=>render.groundMeshes.map(mesh=>({bounds:new THREE.Box3().setFromObject(mesh),triangles:placementTriangles(THREE,[mesh]),constructionEarth:true}));
 const motion=new LocalWalkingView(),target={x:0,y:.02,z:0};motion.reconcile(target,{serverTime:1000,receivedAt:0,grounded:false});let now=0;
 for(let i=0;i<180;i++){now+=1000/60;motion.sample(now,1/60,{},{octree,triangleGroups:groups(),floorGap:.02},target);}
 close(target.y,-5.98,'local prediction lands on rendered six metre soil floor');assert.equal(motion.grounded,true);
 for(let i=0;i<120;i++){now+=1000/60;if(i%30===0)motion.reconcile(target,{serverTime:1000+now,receivedAt:now,grounded:true});motion.sample(now,1/60,{side:1,yaw:0},{octree,triangleGroups:groups(),floorGap:.02},target);}
 assert.ok(target.x<3.67&&target.x>3.4,'the same visible cut wall stops the local walking capsule: '+JSON.stringify(target));close(target.y,-5.98,'local wall contact cannot lift the operator out of the cut');
 earthworksDeposit(earthworks,{x:1,y:Infinity,z:1},{soil:4,gravel:0},{radius:0});render.update(snapshot);scene.updateMatrixWorld(true);assert.notEqual(render.groundMeshes[0],meshes[0],'a changed authoritative earth revision replaces the physical surface');
 const floor=new THREE.Raycaster(new THREE.Vector3(1,1,1),new THREE.Vector3(0,-1,0)).intersectObjects(render.groundMeshes)[0];close(floor.point.y,-5,'deposited material raises the actual rendered triangle');
 render.dispose();base.traverse(node=>{node.geometry?.dispose();for(const material of Array.isArray(node.material)?node.material:[node.material])material?.dispose();});
});

test('expanded construction land keeps loader normalization at one and walking beside the dozer at server grade',async()=>{
 const {constructionWorld}=await import('../construction-world.mjs'),{replaceServerStreets}=await import('../public/js/environments/server-streets.js'),{buildCollision}=await import('../public/js/environments/environment-collision.js');
 const environment=constructionWorld(),root=createBuilderLand(environment);replaceServerStreets(root,environment.streets,{labels:false});root.updateMatrixWorld(true);
 // Reproduce the browser loader's footprint normalization, including streets.
 // A former 512 m clamp scaled the new cutouts away from the shared terrain.
 const size=new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()),normalization=environment.playableSize/Math.max(size.x,size.z);
 close(normalization,1,'authored land already has the full requested map footprint');root.scale.multiplyScalar(normalization);root.updateMatrixWorld(true);
 const {octree}=buildCollision(root),view=new LocalWalkingView();view.reconcile({x:45.8,y:.02,z:61.5},{serverTime:1000,receivedAt:1000,grounded:true});
 let result={};for(let index=1;index<=180;index++)view.sample(1000+index*1000/60,1/60,{side:index<10?-1:0,yaw:0},{octree,speed:4},result);
 close(result.y,.02,'walking toward the cab cannot fall through a shifted spoil cutout');
 const collision=new ServerBuilderCollision(),server=collision.groundAt(environment,result,{earthworks:createEarthworks(environment.construction)});close(result.y,server.y,'local cab access remains at authoritative ground height');
 const floor=root.getObjectByName('BUILDER_WALKABLE_FLOOR_grand-floor');floor.geometry.computeBoundingBox();close(floor.geometry.boundingBox.max.x,384,'expanded city and roads have real ground to their full extent');
});
