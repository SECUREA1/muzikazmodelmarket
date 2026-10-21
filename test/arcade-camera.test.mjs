import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/vendor/three/three.module.min.js';
import {createArcadePart} from '../public/js/arcade-park.js';
import {arcadeGameCameraPose,arcadeGamePoint,createArcadeGamePresentation} from '../public/js/arcade-3d-games.js';

const ids=['hockey','shooting','basketball','air-hockey','billiards'];
function dispose(root){root.traverse(node=>{node.geometry?.dispose();for(const material of Array.isArray(node.material)?node.material:[node.material])material?.dispose();});}

test('each arcade game has a standing eye view and a distinct elevated map view on portrait and desktop',()=>{
 for(const id of ids)for(const aspect of [.45,1.6]){
  const first=arcadeGameCameraPose(id,'first-person',{aspect}),top=arcadeGameCameraPose(id,'top-down',{aspect});
  assert.ok(first.eye[1]>=2&&first.eye[1]<3,id+' keeps the first-person camera at player height');
  assert.ok(top.eye[1]>first.eye[1]+6,id+' has a separate elevated view');
  assert.equal(first.mode,'first-person');assert.equal(top.mode,'top-down');
  assert.ok([...first.eye,...top.eye,...top.up].every(Number.isFinite));
  if(id!=='shooting')assert.deepEqual(top.up,[0,0,-1],'north stays at the top of the game');
 }
 assert.equal(arcadeGameCameraPose('missing'),null);
 assert.equal(arcadeGameCameraPose('hockey','bad').mode,'first-person');
});

test('standing camera follows basketball release position without changing the projectile or round state',()=>{
 const state={gameElapsed:.5,shot:{x:600,p:.4,endX:400,scored:true}},before=structuredClone(state);
 const pose=arcadeGameCameraPose('basketball','first-person',{state});
 assert.ok(Math.abs(pose.eye[0]-(1.6-.55))<1e-8);
 arcadeGameCameraPose('basketball','top-down',{state});
 assert.deepEqual(state,before);
});

test('all camera modes preserve transformed world-space aiming for all five games and aspect ratios',()=>{
 for(const id of ids){
  const scene=new T.Scene(),parent=new T.Group(),station=createArcadePart(id),presentation=createArcadeGamePresentation({scene});
  parent.position.set(9,2,-6);parent.rotation.set(.08,.7,-.06);parent.scale.set(1.3,.85,1.1);scene.add(parent);parent.add(station);
  presentation.activate(id,{anchor:station});
  const state={gameElapsed:.4,pointer:{x:525,y:185},puck:{x:500,y:100},balls:[{x:220,y:240,vx:0,vy:0}],targets:[{dx:525,dy:185,r:24}]};presentation.update(state);
  try{
   for(const aspect of [.45,1.6])for(const mode of ['first-person','top-down','broadcast']){
    const camera=new T.PerspectiveCamera(43,aspect,.1,250);assert.equal(presentation.setCamera(camera,mode),true);
    const world=presentation.root.localToWorld(arcadeGamePoint(id,525,185));
    const xrPointer=presentation.rayPointer(camera.position.clone(),world.clone().sub(camera.position).normalize());
    assert.ok(Math.abs(xrPointer.x-525)<1e-7&&Math.abs(xrPointer.y-185)<1e-7,id+' tracked controller ray matches the world target');
    const projected=world.project(camera);
    assert.ok(Math.abs(projected.x)<1&&Math.abs(projected.y)<1,`${id} ${mode} aim plane remains in the viewport`);
    const pointer=presentation.pointer(projected.x,projected.y,camera);
    assert.ok(Math.abs(pointer.x-525)<1e-7&&Math.abs(pointer.y-185)<1e-7,`${id} ${mode} pointer matches the same physical target`);
    assert.equal(presentation.snapshot().cameraMode,mode);
   }
  }finally{presentation.dispose();dispose(scene);}
 }
});

test('a first-person avatar cannot block its own camera and returns for the elevated view',()=>{
 for(const id of ['hockey','basketball']){
  const scene=new T.Scene(),station=createArcadePart(id),presentation=createArcadeGamePresentation({scene});scene.add(station);presentation.activate(id,{anchor:station});
  const name=id==='hockey'?'PLAYER_SKATER_HEAD':'PLAYER_BASKETBALL_HEAD',head=presentation.root.getObjectByName(name),camera=new T.PerspectiveCamera(43,1.6,.1,250);
  try{
   presentation.setCamera(camera,'first-person');assert.equal(head.visible,false);
   presentation.setCamera(camera,'top-down');assert.equal(head.visible,true);
   presentation.setCamera(camera,'first-person');assert.equal(head.visible,false);
  }finally{presentation.dispose();dispose(scene);}
 }
});


test('the raised basketball rim stays clear of the top HUD in the overhead view',()=>{
 const scene=new T.Scene(),station=createArcadePart('basketball'),presentation=createArcadeGamePresentation({scene});scene.add(station);presentation.activate('basketball',{anchor:station});
 const hoop=presentation.root.getObjectByName('LIVE_BASKETBALL_HOOP');let rim;hoop.traverse(node=>{if(node.geometry?.type==='TorusGeometry')rim=node;});
 try{
  assert.ok(rim);
  for(const [width,height] of [[1120,800],[390,844]]){
   const camera=new T.PerspectiveCamera(43,width/height,.1,250);presentation.setCamera(camera,'top-down');
   const vertices=rim.geometry.attributes.position,point=new T.Vector3();let top=height;
   rim.updateWorldMatrix(true,false);
   for(let vertex=0;vertex<vertices.count;vertex++){point.fromBufferAttribute(vertices,vertex);rim.localToWorld(point);point.project(camera);top=Math.min(top,(1-point.y)*height/2);}
   assert.ok(top>120,`the complete physical rim clears the 95px desktop HUD: ${top}`);
  }
 }finally{presentation.dispose();dispose(scene);}
});
