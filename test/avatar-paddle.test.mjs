import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/vendor/three/three.module.min.js';
import {createPingPongPaddle,updateAvatarPaddle,disposeAvatarPaddle} from '../public/js/avatar-paddle.js';
import {createWorldResident,updateWorldResident} from '../public/js/world-resident-model.js';

const pose=node=>[...node.position,...node.quaternion,...node.scale];

test('a paddle has a real wood blade, handle and two striking faces within hand scale',()=>{
 const paddle=createPingPongPaddle(T),bounds=new T.Box3().setFromObject(paddle),size=bounds.getSize(new T.Vector3());
 for(const name of ['PADDLE_WOOD_HANDLE','PADDLE_WOOD_BLADE','PADDLE_RED_RUBBER','PADDLE_BLACK_RUBBER'])assert.ok(paddle.getObjectByName(name));
 assert.ok(size.x>.19&&size.x<.23);assert.ok(size.y>.35&&size.y<.4);assert.ok(size.z<.04);
 paddle.traverse(node=>{assert.equal(node.userData.collisionDisabled,true);if(node.isMesh){assert.equal(node.userData.collider,false);assert.ok([...node.geometry.attributes.position.array].every(Number.isFinite));}});
});

test('a front waist prop is drawn once, follows the swing and returns to its belt',()=>{
 const root=new T.Group(),state={equipped:false,equippedAt:1000};
 const group=updateAvatarPaddle(T,root,state,1000),projection=root.userData.avatarPaddle,stowed=projection.mount.position.clone();
 assert.equal(group.visible,true);assert.equal(projection.hand.visible,false);
 state.equipped=true;state.equippedAt=1100;updateAvatarPaddle(T,root,state,1100);assert.deepEqual(projection.mount.position.toArray(),stowed.toArray());
 updateAvatarPaddle(T,root,state,1310);const midway=projection.mount.position.clone();assert.ok(midway.y>stowed.y&&midway.y<1.12);
 updateAvatarPaddle(T,root,state,1600);assert.equal(projection.draw,1);assert.equal(projection.hand.visible,true);const idle=projection.mount.position.clone();
 state.swingAt=1700;state.stroke='forehand';updateAvatarPaddle(T,root,state,1920);assert.ok(projection.mount.position.z<idle.z);const forehand=projection.mount.position.x;
 state.stroke='backhand';updateAvatarPaddle(T,root,state,1920);assert.ok(projection.mount.position.x<forehand);
 updateAvatarPaddle(T,root,state,2200);assert.deepEqual(projection.mount.position.toArray(),idle.toArray());assert.equal(root.children.length,1);
 state.equipped=false;updateAvatarPaddle(T,root,state,2300);assert.equal(projection.draw,1,'an old equip timestamp does not skip the stow animation');updateAvatarPaddle(T,root,state,2800);assert.deepEqual(projection.mount.position.toArray(),stowed.toArray());assert.equal(projection.hand.visible,false);
 disposeAvatarPaddle(root);assert.equal(root.children.length,0);assert.equal(root.userData.avatarPaddle,undefined);
});

test('named authored paddle is reused and restored without disposing its shared resources',()=>{
 const root=new T.Group(),avatar=new T.Group(),belt=new T.Group(),paddle=new T.Mesh(new T.BoxGeometry(.18,.3,.025),new T.MeshStandardMaterial());
 root.add(avatar);avatar.add(belt);root.userData.serverAvatarModel=avatar;paddle.name='WAIST_PADDLE';paddle.position.set(.1,.9,-.25);paddle.rotation.z=.2;belt.add(paddle);
 const before=pose(paddle),geometry=paddle.geometry,material=paddle.material;let disposed=0;geometry.addEventListener('dispose',()=>disposed++);material.addEventListener('dispose',()=>disposed++);
 updateAvatarPaddle(T,root,{equipped:true,equippedAt:1000},1500);assert.equal(root.userData.avatarPaddle.source,paddle);assert.equal(paddle.parent.name,'PING_PONG_GRIP');assert.equal(paddle.geometry,geometry);assert.equal(paddle.material,material);
 paddle.visible=false;updateAvatarPaddle(T,root,{equipped:true,equippedAt:1000},1600);assert.equal(paddle.visible,true,'an authored animator cannot hide a paddle while it is in the playing grip');
 disposeAvatarPaddle(root);assert.equal(paddle.parent,belt);assert.deepEqual(pose(paddle),before);assert.equal(disposed,0);
});

test('unrigged authored body geometry is preserved and an avatar replacement discards old projection',()=>{
 const root=new T.Group(),body=new T.Mesh(new T.BoxGeometry(.5,1.8,.3),new T.MeshStandardMaterial());root.add(body);root.userData.serverAvatarModel=body;
 const geometry=body.geometry,bodyPose=pose(body);updateAvatarPaddle(T,root,{equipped:true,equippedAt:1},1000);assert.equal(root.userData.avatarPaddle.source,null);assert.equal(body.geometry,geometry);assert.deepEqual(pose(body),bodyPose);
 const previous=root.userData.avatarPaddle.group,newBody=new T.Group();root.userData.serverAvatarModel=newBody;updateAvatarPaddle(T,root,{equipped:false},1100);assert.equal(previous.parent,null);assert.equal(root.userData.avatarPaddle.model,newBody);disposeAvatarPaddle(root);
});

test('resident actual arm holds its paddle after the normal animation and is restored on cleanup',()=>{
 const root=createWorldResident(),arm=root.userData.residentLimbs[1].arm;
 updateWorldResident(root,1);const initial=arm.quaternion.clone();updateAvatarPaddle(T,root,{equipped:true,equippedAt:1,swingAt:1000,stroke:'forehand'},1220);
 const projection=root.userData.avatarPaddle,hand=arm.localToWorld(new T.Vector3(0,-.47,0)),grip=projection.mount.getWorldPosition(new T.Vector3());
 assert.ok(hand.distanceTo(grip)<1e-6);assert.equal(projection.hand.visible,false);assert.ok(arm.rotation.x>.5);
 updateAvatarPaddle(T,root,null,2000);updateAvatarPaddle(T,root,null,2500);assert.equal(projection.group.visible,false);
 disposeAvatarPaddle(root);assert.ok(arm.quaternion.angleTo(initial)<1e-6);
});

test('first person and reduced motion retain a usable grip without projecting a waist item',()=>{
 const camera=new T.PerspectiveCamera();assert.equal(updateAvatarPaddle(T,camera,null,1000,{firstPerson:true}),null);
 updateAvatarPaddle(T,camera,{equipped:true,equippedAt:1000,swingAt:1000},1220,{firstPerson:true,reducedMotion:true});
 const projection=camera.userData.avatarPaddle;assert.equal(projection.draw,1);assert.ok(projection.mount.position.z<-.5);assert.equal(projection.group.visible,true);
 projection.group.traverse(node=>{if(node.isMesh){assert.equal(node.material.depthTest,false);assert.equal(node.renderOrder,20);}});
 updateAvatarPaddle(T,camera,{equipped:false,equippedAt:1500},2000,{firstPerson:true,reducedMotion:true});assert.equal(projection.group.visible,false);disposeAvatarPaddle(camera);
});

test('XR paddle stays in the controller grip and hides the decorative hand',()=>{
 const controller=new T.Group();controller.position.set(1,2,3);updateAvatarPaddle(T,controller,{equipped:true,equippedAt:1,swingAt:1000},1220,{firstPerson:true,controller:true});
 const projection=controller.userData.avatarPaddle;assert.deepEqual(projection.mount.position.toArray(),[0,0,-.04]);assert.equal(projection.hand.visible,false);assert.equal(projection.cuff.visible,false);disposeAvatarPaddle(controller);
});

test('portrait first person keeps the paddle grip inside the camera view',()=>{
 const camera=new T.PerspectiveCamera(68,390/844,.025,100);
 updateAvatarPaddle(T,camera,{equipped:true,equippedAt:1},1000,{firstPerson:true});
 const point=camera.userData.avatarPaddle.mount.getWorldPosition(new T.Vector3()).project(camera);
 assert.ok(point.x>0&&point.x<.8);assert.ok(Math.abs(point.y)<1);disposeAvatarPaddle(camera);
});

test('scaled authored avatars keep the paddle in metres above their actual feet',()=>{
 const root=new T.Group(),body=new T.Mesh(new T.BoxGeometry(50,180,30),new T.MeshStandardMaterial());body.position.y=90;root.add(body);root.scale.setScalar(.01);root.position.set(2,0,3);
 updateAvatarPaddle(T,root,{equipped:true,equippedAt:1},1000);const projection=root.userData.avatarPaddle,point=projection.mount.getWorldPosition(new T.Vector3()),bounds=new T.Box3().setFromObject(projection.paddle);
 assert.ok(Math.abs(point.y-1.12)<1e-6);assert.ok(Math.abs(point.x-2.35)<1e-6);assert.ok(bounds.max.y-bounds.min.y>.3&&bounds.max.y-bounds.min.y<.4);disposeAvatarPaddle(root);
});
