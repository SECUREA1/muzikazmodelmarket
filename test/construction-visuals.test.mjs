import {initialConstructionState,craneHookPosition,CONSTRUCTION_LOAD_OFFSET} from '../public/js/construction-state.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createConstructionScene} from '../public/js/construction-scene.js';
import {constructionWorkPose,createConstructionCamera} from '../public/js/construction-camera.js';
import {constructionOperatorPose} from '../public/js/construction-kinematics.js';
import {projectServerActor} from '../public/js/server-scene-projection.js';
import {createConstructionModel,updateConstructionModel} from '../public/js/construction-models.js';

test('shared progress draws rising floors, keeps its target synchronized, and clears on world travel',()=>{
 const scene=new THREE.Scene(),view=createConstructionScene(THREE,scene);
 const site={tower:{x:5,z:-10,baseY:0,width:18,depth:18,floorHeight:4,maxFloors:16,placed:4,target:{x:5,y:8,z:-19,yaw:0}},beams:[],excavation:{x:25,z:17,radius:12,depth:1}};
 const snapshot={construction:site},saved=structuredClone(snapshot);view.update(snapshot);view.animate(1);
 const marker=view.root.getObjectByName('NEXT_STEEL_PLACEMENT');assert.deepEqual(marker.position.toArray(),[5,8,-19]);assert.ok(view.root.children[0].children.length>8);
 site.tower.placed=64;site.tower.target=null;view.update(snapshot);assert.equal(view.root.getObjectByName('NEXT_STEEL_PLACEMENT').visible,false);
 view.update(saved);assert.equal(view.root.getObjectByName('NEXT_STEEL_PLACEMENT').position.y,8);assert.deepEqual(saved.construction.excavation,snapshot.construction.excavation);
 view.reset();assert.equal(view.root.visible,false);assert.equal(view.root.children[0].children.length,0);view.dispose();assert.equal(scene.children.length,0);
});

test('anchored construction models animate confirmed joints and hook height without altering room state',()=>{
 const content=createConstructionModel('tower-crane'),anchor=new THREE.Group();anchor.add(content);
 const actor={modelId:'tower-crane',active:true,position:{x:0,y:0,z:0},rotation:{y:0},construction:{kind:'crane',slew:Math.PI/2,trolley:30,hoist:40,load:null}};
 const saved=structuredClone(actor);projectServerActor(anchor,actor);updateConstructionModel(content,1);content.updateMatrixWorld(true);
 const hook=content.getObjectByName('CRANE_HOOK_BLOCK').getWorldPosition(new THREE.Vector3());assert.ok(Math.abs(hook.x-30)<.01);assert.ok(Math.abs(hook.y-40)<.01);assert.ok(Math.abs(hook.z)<.01);assert.deepEqual(actor,saved);
 const dispose=object=>object.traverse(part=>{part.geometry?.dispose();for(const material of [].concat(part.material||[]))material.dispose();});dispose(anchor);
});

test('crane work camera rises with the active lifting floor and leaves room in portrait view',()=>{
 const actor={position:{x:-18,y:0,z:-4},construction:{hook:{x:-8,y:.8,z:15}}},site={tower:{target:{x:5,y:4,z:-19}}};
 const low=constructionWorkPose(actor,site,1.7),portrait=constructionWorkPose(actor,site,.5);site.tower.target.y=64;actor.construction.hook.y=68;const high=constructionWorkPose(actor,site,1.7);
 assert.ok(high.position.y>low.position.y+40);assert.ok(portrait.position.z>low.position.z);assert.ok(high.position.y>actor.construction.hook.y);assert.ok(Object.values(high.position).every(Number.isFinite));
});

test('a crane rotated in the Builder starts its hook at the shared steel supply',()=>{
 const actor={modelId:'tower-crane',position:{x:10,y:0,z:-4},rotation:{y:Math.PI/2}},supply={x:5,y:.8,z:15};
 actor.construction=initialConstructionState(actor,supply);const hook=craneHookPosition(actor);
 for(const axis of ['x','y','z'])assert.ok(Math.abs(hook[axis]-(supply[axis]+(axis==='y'?CONSTRUCTION_LOAD_OFFSET:0)))<.001);
});

test('operator cameras follow the actual cab eye, excavator swing and articulated truck steering',()=>{
 const scene=new THREE.Scene(),rig=new THREE.Group(),camera=new THREE.PerspectiveCamera(68,1,.1,700);scene.add(rig);rig.add(camera);const view=createConstructionCamera({camera,playerRig:rig});
 for(const modelId of ['tower-crane','site-dumptruck','site-bulldozer','site-excavator']){
  const actor={modelId,active:true,position:{x:12,y:2,z:-3},rotation:{y:.6},scale:{x:1,y:1,z:1},driving:{steering:.7},construction:{kind:modelId==='site-excavator'?'excavator':modelId==='tower-crane'?'crane':'truck',swing:1.1}},saved=structuredClone(actor),pose=constructionOperatorPose(actor);
  rig.position.copy(actor.position);rig.rotation.y=1.3;view.update({machine:actor,lookYaw:.25,lookPitch:0});
  const eye=camera.getWorldPosition(new THREE.Vector3()),direction=camera.getWorldDirection(new THREE.Vector3());
  assert.ok(eye.distanceTo(new THREE.Vector3(pose.position.x,pose.position.y,pose.position.z))<1e-6);assert.ok(Math.abs(Math.atan2(-direction.x,-direction.z)-(pose.yaw+.25))<1e-6);assert.deepEqual(actor,saved);
 }
 view.reset();assert.equal(camera.near,.1);
});

test('visible remote operators remain seated in a swinging excavator cab',()=>{
 const actor={id:'excavator',modelId:'site-excavator',position:{x:0,y:0,z:0},rotation:{y:0},scale:{x:1,y:1,z:1},active:true,holderId:'other',construction:{kind:'excavator',swing:1.2},driving:{speed:0}},root=createConstructionModel(actor.modelId);
 projectServerActor(root,actor,{localId:'me'});root.updateMatrixWorld(true);const driver=root.userData.roadDriver,hip=driver.localToWorld(new THREE.Vector3(0,.89,.63)),pose=constructionOperatorPose(actor);
 assert.equal(driver.visible,true);assert.ok(hip.distanceTo(new THREE.Vector3(pose.seat.x,pose.seat.y,pose.seat.z))<1e-6);
 root.traverse(part=>{part.geometry?.dispose();for(const material of [].concat(part.material||[]))material.dispose();});
});

test('completed structural actors replace guide columns and floors in the scene view',()=>{
 const scene=new THREE.Scene(),view=createConstructionScene(THREE,scene),site={tower:{x:5,z:-10,baseY:0,width:18,depth:18,floorHeight:4,maxFloors:16,placed:4,target:{x:5,y:8,z:-19,yaw:0}},beams:[]};
 view.update({construction:site});const guideMeshCount=view.root.children[0].children.length;
 view.update({construction:site,actors:{floor:{active:true,constructionStructure:{kind:'floor',floor:1}}}});
 assert.equal(view.root.children[0].children.length,guideMeshCount-5,'confirmed server columns and deck render only once');view.dispose();
});

test('earthwork visuals render exact negative cuts and material piles with cached real ground surfaces',()=>{
 const scene=new THREE.Scene(),view=createConstructionScene(THREE,scene),patch={id:'cut-and-fill',origin:{x:0,z:0},cellSize:2,columns:2,rows:2,baseY:0,minY:-8,heights:[-1,0,2,0],soil:[28,32,0,32],gravel:[0,0,8,0]},snapshot={construction:{earthworks:{revision:1,patches:[patch]}}},saved=structuredClone(snapshot);
 view.update(snapshot);view.root.updateMatrixWorld(true);assert.equal(view.groundMeshes.length,1);
 const terrain=view.groundMeshes[0],ray=new THREE.Raycaster(new THREE.Vector3(1,10,1),new THREE.Vector3(0,-1,0),0,20),cut=ray.intersectObject(terrain)[0];assert.ok(cut);assert.ok(Math.abs(cut.point.y+1)<1e-6,'excavated surface is below original grade');
 ray.set(new THREE.Vector3(1,10,3),new THREE.Vector3(0,-1,0));assert.ok(Math.abs(ray.intersectObject(terrain)[0].point.y-2)<1e-6,'deposited gravel has its confirmed height');
 assert.equal(terrain.geometry.boundingBox.min.y,-1);assert.equal(terrain.geometry.boundingBox.max.y,2);assert.equal(terrain.material.side,THREE.DoubleSide);assert.equal(terrain.material.vertexColors,true);
 assert.ok(view.root.getObjectByName('LOOSE_GRAVEL_cut-and-fill'));assert.ok(view.groundMeshes.every(mesh=>mesh.userData.earthPatchId),'gravel decoration never becomes walking terrain');
 const geometry=terrain.geometry;view.update(snapshot);assert.equal(view.groundMeshes[0].geometry,geometry,'unchanged revisions reuse surface geometry');assert.deepEqual(snapshot,saved,'rendering does not change earth inventory or height state');
 patch.heights[0]=-2;snapshot.construction.earthworks.revision=2;view.update(snapshot);view.animate(0);assert.equal(view.groundMeshes[0].geometry.boundingBox.min.y,-2);assert.ok(view.root.getObjectByName('EARTH_MOVEMENT_PARTICLES').count>0,'only confirmed soil movement emits bounded debris');
 for(let i=1;i<15;i++)view.animate(i*.1);assert.equal(view.root.getObjectByName('EARTH_MOVEMENT_PARTICLES').count,0,'soil effects expire without changing terrain');
 view.reset();assert.deepEqual(view.groundMeshes,[]);view.dispose();
});

test('custom crew workwear, progress and seated poses follow authoritative jobs and machine cabins',()=>{
 const scene=new THREE.Scene(),view=createConstructionScene(THREE,scene),machine={id:'crew-excavator',modelId:'site-excavator',position:{x:10,y:0,z:4},rotation:{y:.5},construction:{kind:'excavator',swing:1.2}},worker={id:'maya',name:'Maya Chen',role:'Excavator operator',appearance:{hardHat:'white',vest:'lime',skin:'brown',shirt:'teal'},state:'waiting',machineId:machine.id,position:{x:8,y:0,z:4},heading:.4,progress:.5,message:'Waiting for truck'},snapshot={actors:{[machine.id]:machine},construction:{crew:{workers:[worker],jobs:[]}}},saved=structuredClone(snapshot);
 view.update(snapshot);view.animate(0);view.root.updateMatrixWorld(true);
 const rig=view.root.getObjectByName('CONSTRUCTION_WORKER_maya'),pose=constructionOperatorPose(machine),hips=rig.localToWorld(new THREE.Vector3(0,.9,0));assert.ok(hips.distanceTo(new THREE.Vector3().copy(pose.seat))<1e-6,'waiting machine operator remains seated');assert.equal(rig.getObjectByName('CREW_LEFT_LEG').rotation.x,Math.PI/2);
 const label=rig.children.find(child=>child.isSprite);assert.equal(label.userData.title,'Maya Chen · AI');assert.equal(label.userData.progress,50);let lime=false;rig.traverse(node=>{if(node.material?.color?.getHexString()==='b6e94d')lime=true;});assert.ok(lime,'chosen hi-vis vest appears on the custom worker');
 worker.state='walking';worker.machineId=null;worker.position={x:5,y:0,z:5};view.update(snapshot);view.animate(.1);assert.notEqual(rig.getObjectByName('CREW_LEFT_LEG').rotation.x,Math.PI/2);assert.ok(rig.position.y<pose.seat.y-.9,'worker transitions toward the confirmed ground path');
 saved.construction.crew.workers[0].state='walking';saved.construction.crew.workers[0].machineId=null;saved.construction.crew.workers[0].position={x:5,y:0,z:5};assert.deepEqual(snapshot,saved,'worker rendering never advances jobs or changes authority state');
 snapshot.construction.crew.workers=[];view.update(snapshot);assert.equal(view.root.getObjectByName('CONSTRUCTION_CREW').children.length,0);view.dispose();
});

test('steel receivers and carried beam highlights stay aligned with confirmed target and rigging',()=>{
 const scene=new THREE.Scene(),view=createConstructionScene(THREE,scene),site={tower:{x:5,z:-10,width:18,depth:18,maxFloors:16,floorHeight:4,placed:0,target:{x:14,y:4,z:-10,yaw:Math.PI/2}},beams:[{id:'rigged',state:'attached',position:{x:8,y:15,z:-3},rotation:{y:.7}},{id:'stock',state:'supply',position:{x:-8,y:.8,z:15},rotation:{y:0}}]};
 view.update({construction:site});const receiver=view.root.getObjectByName('ACTIVE_STEEL_RECEIVER'),highlight=view.root.getObjectByName('STEEL_HIGHLIGHT_rigged');assert.deepEqual(receiver.position.toArray(),[14,4,-10]);assert.equal(receiver.rotation.y,Math.PI/2);assert.deepEqual(highlight.position.toArray(),[8,15,-3]);assert.equal(highlight.rotation.y,.7);assert.equal(highlight.children[0].material.color.getHex(),0xffdc60);
 site.beams[0].state='placed';view.update({construction:site});assert.equal(view.root.getObjectByName('STEEL_HIGHLIGHT_rigged'),undefined,'secured members no longer show carrying highlights');view.dispose();
});

test('operator sightlines clear roof and glazing without changing physical cabin colliders or other copies',async()=>{
 const {setConstructionCabView}=await import('../public/js/construction-models.js'),{cloneBuilderRuntime}=await import('../public/js/builder-runtime-clone.js'),{placementMeshes}=await import('../public/js/placed-item-collision.js');
 for(const modelId of ['tower-crane','site-dumptruck','site-bulldozer','site-excavator']){
  const source=createConstructionModel(modelId),copy=cloneBuilderRuntime(source),before=placementMeshes(source).map(mesh=>mesh.matrix.clone());setConstructionCabView(source,true);source.updateMatrixWorld(true);
  const panes=[],roofs=[],copyRoofs=[];source.traverse(mesh=>{if(mesh.userData.constructionCabGlass)panes.push(mesh);if(mesh.userData.constructionCabRoof)roofs.push(mesh);});copy.traverse(mesh=>{if(mesh.userData.constructionCabRoof)copyRoofs.push(mesh);});assert.ok(roofs.every(mesh=>!mesh.visible));assert.ok(panes.every(mesh=>mesh.material.opacity<.1));assert.ok(copyRoofs.every(mesh=>mesh.visible));
  const pose=constructionOperatorPose({modelId,position:{x:0,y:0,z:0},rotation:{y:0},construction:{swing:0},driving:{steering:0}}),ray=new THREE.Raycaster(new THREE.Vector3().copy(pose.position),new THREE.Vector3(0,0,-1),0,1.1),opaque=[];source.traverse(mesh=>{if(!mesh.isMesh||mesh.userData.constructionCollider||mesh.material.transparent&&mesh.material.opacity<.5)return;for(let node=mesh;node;node=node.parent)if(!node.visible)return;opaque.push(mesh);});assert.equal(ray.intersectObjects(opaque).length,0,modelId+' has a clear forward windshield ray');
  placementMeshes(source).forEach((mesh,index)=>assert.ok(mesh.matrix.equals(before[index]),'cab view never changes physical collision'));setConstructionCabView(source,false);assert.ok(roofs.every(mesh=>mesh.visible));assert.ok(panes.every(mesh=>mesh.material.opacity>.1));
 }
});

test('truck and bucket loads display actual soil and gravel cargo without sharing mutable colors across copies',async()=>{
 const {cloneBuilderRuntime}=await import('../public/js/builder-runtime-clone.js');
 for(const modelId of ['site-dumptruck','site-excavator']){const source=createConstructionModel(modelId),copy=cloneBuilderRuntime(source);source.userData.construction={load:2,cargo:{soil:0,gravel:2},telemetry:{loadCapacity:modelId==='site-dumptruck'?40:2}};copy.userData.construction={load:2,cargo:{soil:2,gravel:0}};updateConstructionModel(source);updateConstructionModel(copy);const a=source.userData.constructionParts.load,b=copy.userData.constructionParts.load;assert.notEqual(a.material,b.material);assert.equal(a.material.color.getHexString(),'9a9f98');assert.equal(b.material.color.getHexString(),'795332');if(modelId==='site-dumptruck'){assert.equal(a.scale.y,.05);assert.ok(Math.abs(a.position.y-.6*a.scale.y/2-.2)<1e-9,'payload sits on the bed floor as the real fill fraction changes');}}
});

test('continuous excavation rebuilds only the changed terrain patch and preserves untouched gravel geometry',()=>{
 const scene=new THREE.Scene(),view=createConstructionScene(THREE,scene),patch=id=>({id,origin:{x:id==='cut'?0:10,z:0},cellSize:2,columns:2,rows:1,baseY:0,minY:-8,heights:[0,1],soil:[32,32],gravel:[0,4]}),cut=patch('cut'),stock=patch('stock'),snapshot={construction:{earthworks:{revision:1,patches:[cut,stock]}}};view.update(snapshot);
 const oldCut=view.root.getObjectByName('EARTH_PATCH_cut'),oldStock=view.root.getObjectByName('EARTH_PATCH_stock'),stockGravel=view.root.getObjectByName('LOOSE_GRAVEL_stock');let cutDisposed=0,stockDisposed=0;oldCut.geometry.addEventListener('dispose',()=>cutDisposed++);oldStock.geometry.addEventListener('dispose',()=>stockDisposed++);
 for(let revision=2;revision<=10;revision++){cut.heights[0]=-.05*revision;snapshot.construction.earthworks.revision=revision;view.update(snapshot);assert.equal(view.root.getObjectByName('EARTH_PATCH_stock'),oldStock);assert.equal(view.root.getObjectByName('LOOSE_GRAVEL_stock'),stockGravel);assert.equal(view.groundMeshes.length,2);}
 assert.equal(cutDisposed,1,'superseded cut geometry is released');assert.equal(stockDisposed,0,'untouched stockpile keeps its geometry throughout repeated cuts');assert.equal(oldStock.userData.terrainRevision,10);
 snapshot.construction.earthworks.patches=[cut];snapshot.construction.earthworks.revision=11;view.update(snapshot);assert.equal(view.root.getObjectByName('EARTH_PATCH_stock'),undefined);assert.equal(stockDisposed,1,'removed patches release their resources');view.dispose();
});

test('leaving construction clears room-local terrain and crew before a fresh room reuses the same revision',()=>{
 const scene=new THREE.Scene(),view=createConstructionScene(THREE,scene),patch=height=>({id:'stockpile',origin:{x:10,z:20},cellSize:2,columns:1,rows:1,baseY:0,minY:-8,heights:[height],soil:[32+height*4],gravel:[0]}),site=height=>({earthworks:{revision:1,patches:[patch(height)]},tower:{x:5,z:-10,width:18,depth:18,maxFloors:16,floorHeight:4,placed:0,target:{x:5,y:4,z:-19}},crew:{workers:[{id:'maya',name:'Maya Chen',state:'walking',position:{x:1,y:0,z:1}}]}});
 view.update({construction:site(1)});const first=view.groundMeshes[0];let disposed=0;first.geometry.addEventListener('dispose',()=>disposed++);assert.equal(first.geometry.boundingBox.max.y,1);assert.ok(view.root.getObjectByName('CONSTRUCTION_WORKER_maya'));
 view.update({construction:null});assert.equal(view.root.visible,false);assert.deepEqual(view.groundMeshes,[]);assert.equal(disposed,1);for(const name of ['CONSTRUCTION_FRAME','CONSTRUCTION_LIFT_GUIDES','CONSTRUCTION_EARTHWORKS','CONSTRUCTION_CREW','CONSTRUCTION_STEEL_HIGHLIGHTS'])assert.equal(view.root.getObjectByName(name).children.length,0,name+' releases the old room');
 view.update({construction:site(4)});assert.equal(view.root.visible,true);assert.notEqual(view.groundMeshes[0],first);assert.equal(view.groundMeshes[0].geometry.boundingBox.max.y,4,'new room terrain renders despite matching revision, patch id and layout');assert.equal(view.root.getObjectByName('EARTH_MOVEMENT_PARTICLES').count,0,'room changes do not emit stale earth movement');view.dispose();
});
