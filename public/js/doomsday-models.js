import * as THREE from '../vendor/three/three.module.min.js';
import {createCivilAircraft} from './civil-aircraft-models.js';
import {DOOMSDAY_MODEL_INFO,DOOMSDAY_AIRCRAFT_IDS} from './doomsday-config.js';

const material=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.65,metalness:.22,...extra});
export function createDoomsdayModel(id){
 if(!DOOMSDAY_MODEL_INFO[id])return null;
 if(DOOMSDAY_AIRCRAFT_IDS.includes(id))return createCivilAircraft(id);
 const root=new THREE.Group();
 root.name=DOOMSDAY_MODEL_INFO[id][0];
 const dark=material(0x1c2b36),metal=material(0x98a4a5),yellow=material(0xffc93b,{emissive:0xc48612,emissiveIntensity:.12}),red=material(0xd43c32),white=material(0xe8eeea),green=material(0x8dffbd,{emissive:0x51e896,emissiveIntensity:.55});
 const mesh=(geometry,mat,x,y,z,name='')=>{const part=new THREE.Mesh(geometry,mat);part.position.set(x,y,z);part.name=name;root.add(part);return part;};
 const box=(w,h,d,x,y,z,mat,name)=>mesh(new THREE.BoxGeometry(w,h,d),mat,x,y,z,name);
 if(id==='nuclear-warning-beacon'){
  box(.65,.15,.65,0,.075,0,dark,'SIREN_BASE');box(.15,3.1,.15,0,1.65,0,metal,'SIREN_MAST');
  for(const side of [-1,1]){const horn=mesh(new THREE.CylinderGeometry(.34,.12,.6,16,1,true),yellow,side*.42,3.0,0,'SIREN_HORN');horn.rotation.z=side*Math.PI/2;}
  mesh(new THREE.SphereGeometry(.18,12,8),yellow,0,3.55,0,'WARNING_BEACON');
  box(.9,.7,.08,0,2,0,yellow,'NUCLEAR_WARNING_PANEL');
  for(let i=0;i<3;i++){const vane=mesh(new THREE.CircleGeometry(.23,12,0,Math.PI/3),dark,0,2,.045,'RADIATION_TREFOIL');vane.rotation.z=i*Math.PI*2/3;}
  mesh(new THREE.CircleGeometry(.055,12),dark,0,2,.052,'RADIATION_CENTRE');
 }else if(id==='fallout-shelter'){
  const concrete=material(0x6d7775);
  box(10,.18,8,0,.09,0,concrete,'SHELTER_FLOOR');box(10,.35,8,0,3.05,0,concrete,'SHELTER_ROOF');
  for(const side of [-1,1]){box(.35,2.75,8,side*4.825,1.55,0,concrete,'SHELTER_SIDE');box(3,2.75,.35,side*3.5,1.55,3.825,concrete,'SHELTER_FRONT_WING');box(1.1,.45,5,side*3.9,.45,0,dark,'RELIEF_BENCH');}
  box(10,2.75,.35,0,1.55,-3.825,concrete,'SHELTER_BACK');box(2.8,.22,.16,0,2.75,4.02,green,'ILLUMINATED_SHELTER_ENTRANCE');
  box(.7,.4,.1,0,2.35,4.02,green,'SHELTER_MARKER');
  // Furnish the edges, keeping the central doorway and walking aisle clear.
  for(const side of [-1,1]){
   box(.09,.025,6.4,side*1.35,.195,0,green,'SHELTER_AISLE_LIGHT');
   box(.8,.5,.45,side*4.1,.85,-2.8,white,'SHELTER_FIRST_AID');
   box(.12,.32,.025,side*4.1,.85,-2.56,red,'SHELTER_FIRST_AID_CROSS');
   box(.32,.12,.025,side*4.1,.85,-2.55,red,'SHELTER_FIRST_AID_CROSS');
  }
  box(1.4,.7,.5,-2.6,.53,-3.25,metal,'SHELTER_WATER_STATION');
  box(1.3,.5,.35,2.6,1.25,-3.4,dark,'SHELTER_RADIO_STATION');
  box(.85,.22,.04,2.6,1.3,-3.2,green,'SHELTER_RADIO_DISPLAY');
  box(3,.05,.8,0,.2,2.8,green,'SHELTER_ENTRY_THRESHOLD');

 }else{
  for(const side of [-1,1]){box(1,.9,1.1,side*.55,.45,0,dark,'RELIEF_CRATE');box(1.05,.12,1.15,side*.55,.97,0,yellow,'SEALED_LID');box(.13,.5,.025,side*.55,.5,.565,white,'SUPPLY_CROSS');box(.5,.13,.025,side*.55,.5,.57,white,'SUPPLY_CROSS');}
 }
 root.userData={...root.userData,builderObject:true,modelId:id,dimensions:DOOMSDAY_MODEL_INFO[id][2],doomsdayModel:true};
 root.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;}});
 // These palette materials are shared within this one model, never globally.
 const used=new Set();root.traverse(node=>{for(const mat of Array.isArray(node.material)?node.material:[node.material])if(mat)used.add(mat);});for(const mat of [dark,metal,yellow,red,white,green])if(!used.has(mat))mat.dispose();
 return root;
}
