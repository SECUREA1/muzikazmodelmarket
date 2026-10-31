import * as THREE from '../vendor/three/three.module.min.js';
import {isBunkerEnvironment} from './bunker-config.js';

// A fixed pool of surface dust, flash and pressure-ring meshes follows the
// shared impact clock. Underground viewers see their intact shelter instead.
export function createBunkerStrikeEffects({scene}){
 const root=new THREE.Group();root.name='BUNKER_SURFACE_AIRSTRIKES';root.visible=false;root.userData.collisionDisabled=true;root.userData.collide=false;scene.add(root);
 const impacts=[[-12,68],[24,48],[-24,-12]].map(([x,z],index)=>{
  const group=new THREE.Group();group.position.set(x,0,z);root.add(group);
  const dust=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),new THREE.MeshBasicMaterial({color:0x5e6658,transparent:true,opacity:0,depthWrite:false}));dust.name='AIRSTRIKE_DUST_VFX';group.add(dust);
  const flash=new THREE.Mesh(new THREE.SphereGeometry(1,10,6),new THREE.MeshBasicMaterial({color:0xffc078,transparent:true,opacity:0,depthWrite:false}));flash.name='AIRSTRIKE_FLASH_VFX';group.add(flash);
  const wave=new THREE.Mesh(new THREE.RingGeometry(.9,1,32),new THREE.MeshBasicMaterial({color:0xcdd1bb,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}));wave.name='AIRSTRIKE_PRESSURE_VFX';wave.rotation.x=-Math.PI/2;wave.position.y=.08;group.add(wave);
  return {group,dust,flash,wave,index};
 });
 let worldId=null,eventId=null,lastServerTime=null,receivedAt=0;
 return {update(snapshot,environment,position,time,{reducedMotion=false}={}){
  const air=snapshot?.bunkerDefense?.airstrike;
  if(worldId!==environment?.id){worldId=environment?.id;eventId=null;lastServerTime=null;}
  if(!isBunkerEnvironment(environment)||!air?.id||!Number.isFinite(air.impactAt)||position.y<-3||!['impact','recovery'].includes(air.phase)){root.visible=false;return;}
  if(eventId!==air.id){eventId=air.id;lastServerTime=null;}
  if(lastServerTime!==snapshot.serverTime){lastServerTime=snapshot.serverTime;receivedAt=time;}
  const age=Math.max(0,(snapshot.serverTime-air.impactAt)/1000+Math.max(0,time-receivedAt));root.visible=age<12;root.userData.alertId=air.id;root.userData.age=age;if(!root.visible)return;
  for(const {group,dust,flash,wave,index}of impacts){
   const elapsed=age-index*.65,active=elapsed>=0&&elapsed<10,fade=Math.max(0,1-Math.max(0,elapsed-2)/8);group.visible=active;if(!active){flash.visible=wave.visible=false;continue;}
   const swell=reducedMotion?3:1+Math.min(7,elapsed)*.8;dust.position.y=1.2+Math.min(elapsed,6)*.7;dust.scale.set(swell,swell*.65,swell);dust.material.opacity=.48*fade;
   flash.visible=!reducedMotion&&elapsed<.45;flash.scale.setScalar(1.2+elapsed*4);flash.position.y=1;flash.material.opacity=Math.max(0,1-elapsed/.45)*.8;
   wave.visible=!reducedMotion&&elapsed<3;wave.scale.setScalar(1+elapsed*6);wave.material.opacity=Math.max(0,1-elapsed/3)*.3;
  }
 },snapshot:()=>({visible:root.visible,eventId,age:root.userData.age||0}),dispose(){root.traverse(node=>{node.geometry?.dispose();node.material?.dispose();});root.removeFromParent();}};
}
