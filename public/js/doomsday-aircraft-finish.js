import * as THREE from '../vendor/three/three.module.min.js';
import {DOOMSDAY_AIRCRAFT_IDS} from './doomsday-config.js';

// Complete the shared airframe before its single native vehicle finish. The
// original cockpit, control surfaces, gear and live instruments stay intact.
export function finishDoomsdayAircraft(root,id){
 if(!DOOMSDAY_AIRCRAFT_IDS.includes(id))return root;
 const command=id==='doomsday-command-aircraft';
 root.traverse(node=>{if(node.name==='AIRCRAFT_LABEL')node.visible=false;if(node.isMesh&&node.material?.color){const color=node.material.color.getHex();if(color===0xf1f5f7)node.material.color.setHex(command?0x52616b:0xf2f4e8);if(color===0x176a91)node.material.color.setHex(command?0xd2a552:0xdd483d);}});
 const material=color=>new THREE.MeshStandardMaterial({color,roughness:.55,metalness:.2});
 const white=material(0xe8eeea),red=material(0xd43c32),metal=material(0x98a4a5),yellow=material(0xffc93b),dark=material(0x1c2b36);
 const box=(w,h,d,x,y,z,mat,name)=>{const part=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);part.position.set(x,y,z);part.name=name;root.add(part);return part;};
 if(command){
  const dome=new THREE.Mesh(new THREE.SphereGeometry(1,20,12),white);dome.position.set(0,2.7,1.6);dome.scale.set(.65,.42,.78);dome.name='CONTINUITY_COMMUNICATIONS_DOME';root.add(dome);
  for(const side of [-1,1]){box(.06,.8,.06,side*.43,2.5,1.95,metal,'RELAY_ANTENNA');box(.16,.07,.25,side*.43,2.9,1.95,yellow,'ANTENNA_CAP');}
  box(.12,.1,3,0,2.6,1.5,dark,'DOME_SUPPORT');
 }else{
  for(const side of [-1,1]){box(.24,.035,1.15,side*3,.84,-.45,red,'RESCUE_CROSS_LONG');box(1,.035,.24,side*3,.845,-.45,red,'RESCUE_CROSS_SHORT');}
  box(.32,.23,.32,.29,.83,1.2,red,'FIRST_AID_CARGO');box(.05,.16,.02,.29,.84,1.37,white,'CARGO_CROSS_LONG');box(.16,.05,.02,.29,.84,1.38,white,'CARGO_CROSS_SHORT');
 }
 const used=new Set();root.traverse(node=>{for(const mat of Array.isArray(node.material)?node.material:[node.material])if(mat)used.add(mat);});for(const mat of [white,red,metal,yellow,dark])if(!used.has(mat))mat.dispose();
 root.userData.doomsdayAircraft=true;root.userData.doomsdayModel=true;
 return root;
}
