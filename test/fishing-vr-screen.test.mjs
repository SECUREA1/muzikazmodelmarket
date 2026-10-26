import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createFishingVRScreen} from '../public/js/fishing-vr-screen.js';
import {createHarborCamera,fishingSeatPose} from '../public/js/harbor-camera.js';

function canvas(){return {width:0,height:0,getContext:()=>new Proxy({},{get:(target,key)=>target[key]||(()=>{}),set:(target,key,value)=>(target[key]=value,true)})};}
function fixture(){
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();camera.position.set(145,1.8,-38);scene.add(camera);const actions=[],holds=[];
 const screen=createFishingVRScreen({scene,camera,createCanvas:canvas,onAction:action=>actions.push(action),onReel:holding=>holds.push(holding)});
 const state={enabled:true,playing:true,presenting:true,menuOpen:false,phase:'ready',primaryEnabled:true,side:'starboard',boatId:'angler',boatPosition:{x:145,y:0,z:-38},message:'Ready to cast',location:'Marina Fishing Grounds',tension:.2,progress:0};screen.update(state);
 const ray=action=>{const mesh=screen.root.getObjectByName('FISHING_VR_ACTION_'+action.toUpperCase()),origin=camera.getWorldPosition(new THREE.Vector3()),point=mesh.getWorldPosition(new THREE.Vector3());return {origin,direction:point.sub(origin).normalize()};};
 return {scene,camera,screen,state,actions,holds,ray};
}

test('the VR sports screen uses real scene buttons for cast, hook, catch and side actions',()=>{
 const f=fixture();assert.equal(f.screen.snapshot().visible,true);assert.ok(f.screen.root.parent===f.scene);
 assert.ok(f.screen.root.position.y<f.camera.position.y-.4,'the panel stays below the cast sightline');
 assert.equal(f.screen.pointerDown(f.ray('auto'),'right'),true);assert.deepEqual(f.actions,['auto']);
 f.screen.pointerDown(f.ray('side'),'left');assert.equal(f.actions.at(-1),'side');
 f.screen.update({...f.state,phase:'bite'});f.screen.pointerDown(f.ray('auto'),'right');assert.equal(f.actions.at(-1),'auto');assert.equal(f.screen.snapshot().buttons.find(button=>button.action==='auto').label,'Hook now');
 f.screen.update({...f.state,phase:'caught',fish:{name:'Mackerel',weightKg:1.2}});f.screen.pointerDown(f.ray('release'),'left');assert.equal(f.actions.at(-1),'release');f.screen.pointerDown(f.ray('keep'),'right');assert.equal(f.actions.at(-1),'keep');
 f.screen.update({...f.state,canJoin:true,tournament:{status:'open'}});f.screen.pointerDown(f.ray('join'));assert.equal(f.actions.at(-1),'join');
 f.screen.update({...f.state,canJoin:false,canClaim:true,tournament:{status:'active'}});f.screen.pointerDown(f.ray('join'));assert.equal(f.actions.at(-1),'claim','a previous finished cup stays claimable while a new cup is active');
 f.screen.dispose();
});

test('pending casts keep Helm usable while primary, side and cup actions stay unavailable',()=>{
 const f=fixture();f.screen.update({...f.state,phase:'waiting',pending:true,primaryEnabled:false});
 for(const action of ['auto','side','join'])assert.equal(f.screen.pointerDown(f.ray(action)),true,'panel consumes a disabled control without sending a cast');
 assert.deepEqual(f.actions,[]);f.screen.pointerDown(f.ray('exit'));assert.deepEqual(f.actions,['exit']);
 f.screen.update({...f.state,phase:'reeling',primaryEnabled:true,tournament:{status:'open'}});f.screen.pointerDown(f.ray('join'));assert.equal(f.actions.length,1,'a live fight cannot open a competing tournament action');
 f.screen.dispose();
});

test('independent controller releases and global hide release held reeling exactly once',()=>{
 const f=fixture();f.screen.update({...f.state,phase:'reeling'});
 f.screen.pointerDown(f.ray('auto'),'right');f.screen.pointerDown(f.ray('auto'),'left');assert.deepEqual(f.holds,[true]);
 f.screen.pointerUp('left');assert.equal(f.screen.snapshot().reeling,true);assert.deepEqual(f.holds,[true]);f.screen.pointerUp('unheld-controller');assert.equal(f.screen.snapshot().reeling,true);
 f.screen.pointerUp('right');assert.equal(f.screen.snapshot().reeling,false);assert.deepEqual(f.holds,[true,false]);
 f.screen.pointerDown(f.ray('auto'),'right');f.screen.update({...f.state,phase:'reeling',menuOpen:true});assert.deepEqual(f.holds,[true,false,true,false]);
 f.screen.pointerUp();f.screen.dispose();assert.deepEqual(f.holds,[true,false,true,false]);
});

test('head tracking changes do not steer the panel or mutate the camera, and resources release on disposal',()=>{
 const f=fixture(),yaw=f.screen.snapshot().yaw,eye=f.camera.position.clone(),facing=f.camera.quaternion.clone(),draws=f.screen.snapshot().drawCount;
 f.screen.update({...f.state});assert.equal(f.screen.snapshot().drawCount,draws,'unchanged server heartbeats do not redraw textures');
 f.camera.rotation.set(.2,1.1,-.05);const tracked=f.camera.quaternion.clone();f.screen.update({...f.state});assert.equal(f.screen.snapshot().yaw,yaw,'looking away leaves the screen at the fishing station');assert.ok(f.camera.position.equals(eye));assert.ok(f.camera.quaternion.equals(tracked));assert.ok(facing.angleTo(tracked)>.5);
 let released=0;f.screen.root.traverse(mesh=>{mesh.geometry?.addEventListener('dispose',()=>released++);mesh.material?.addEventListener('dispose',()=>released++);mesh.material?.map?.addEventListener('dispose',()=>released++);});
 f.screen.dispose();assert.ok(released>=21);assert.equal(f.scene.getObjectByName('FISHING_VR_SPORTS_SCREEN'),undefined);assert.equal(f.screen.pointerDown(f.ray('auto')),false);
});

test('the boat-mounted screen keeps positional parallax under headset lean and follows the vessel',()=>{
 const f=fixture(),mounted=f.screen.root.position.clone();
 f.camera.position.add(new THREE.Vector3(.24,.13,-.09));const leaned=f.camera.position.clone();f.screen.update({...f.state});
 assert.ok(f.screen.root.position.equals(mounted),'headset lean must not drag the panel with the head');assert.ok(f.camera.position.equals(leaned),'mounting a screen never rewrites headset tracking');
 f.screen.update({...f.state,boatPosition:{x:146,y:.02,z:-40}});
 assert.ok(f.screen.root.position.distanceTo(mounted.clone().add(new THREE.Vector3(1,.02,-2)))<1e-8,'a mounted screen follows the actual boat translation');
 f.screen.dispose();
});

test('an explicit boat seat mounts correctly before the tracked ArrayCamera has a world pose',()=>{
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),screen=createFishingVRScreen({scene,camera,createCanvas:canvas});scene.add(camera);
 const boat={id:'angler',position:{x:145,y:0,z:-38},rotation:{y:.7}},pose=fishingSeatPose(boat,'port');
 const state={enabled:true,playing:true,presenting:true,phase:'ready',primaryEnabled:true,side:'port',boatId:boat.id,boatPosition:boat.position,anchorPosition:pose.eye,anchorYaw:pose.yaw};screen.update(state);
 assert.equal(screen.snapshot().yaw,pose.yaw);assert.ok(screen.root.position.distanceTo(new THREE.Vector3(pose.eye.x,pose.eye.y,pose.eye.z))<1.5);assert.ok(screen.root.position.length()>100,'the screen cannot be left at the old world origin');
 const mounted=screen.root.position.clone();camera.position.set(200,1.7,100);camera.rotation.y=2;screen.update(state);assert.ok(screen.root.position.equals(mounted),'late XR world-matrix initialization must not move the mounted screen');
 screen.dispose();
});

test('desktop fishing retains the real cast focus while permitting free head look',()=>{
 const rig=new THREE.Group(),camera=new THREE.PerspectiveCamera(),model=new THREE.Group();rig.position.set(40,.55,60);rig.rotation.y=.7;rig.add(camera);
 const boat={id:'boat',modelId:'harbor-fishing-boat',position:{x:40,y:0,z:60},rotation:{y:.7}},origin=new THREE.Vector3(40,0,60),focus={x:47,y:.05,z:58},controller=createHarborCamera({camera,playerRig:rig});
 controller.update({boat,model,origin,view:'fishing-starboard',fishingTarget:focus,immediate:true});const neutral=camera.getWorldDirection(new THREE.Vector3()),point=camera.getWorldPosition(new THREE.Vector3());assert.ok(neutral.dot(new THREE.Vector3(focus.x,focus.y,focus.z).sub(point).normalize())>.999);
 controller.update({boat,model,origin,view:'fishing-starboard',fishingTarget:focus,immediate:true,lookYaw:.5,lookPitch:.15});assert.ok(camera.getWorldDirection(new THREE.Vector3()).angleTo(neutral)>.4,'free look is not reset to a fixed target each frame');assert.ok(model.position.equals(origin));
 const pose=fishingSeatPose(boat,'starboard',focus),head=new THREE.PerspectiveCamera();head.position.set(.03,1.61,-.06);head.rotation.set(.1,.3,0);const previous=head.matrix.clone(),quaternion=head.quaternion.clone();assert.equal(pose.position.y,.2);assert.ok(Number.isFinite(pose.yaw));assert.ok(head.quaternion.equals(quaternion));assert.ok(head.matrix.equals(previous));
});
