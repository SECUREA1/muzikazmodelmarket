import * as THREE from '../vendor/three/three.module.min.js';
import {QUARRY_MODEL_INFO} from './quarry-config.js';
export function createQuarryModel(id){
 if(!QUARRY_MODEL_INFO[id])return null;
 const root=new THREE.Group(),steel=new THREE.MeshStandardMaterial({color:0x496573,metalness:.65,roughness:.45}),yellow=new THREE.MeshStandardMaterial({color:0xe8b23b,metalness:.4,roughness:.5}),black=new THREE.MeshStandardMaterial({color:0x233137,roughness:.9}),gravel=new THREE.MeshStandardMaterial({color:0x9d9b8d,roughness:1}),wood=new THREE.MeshStandardMaterial({color:0x896746,roughness:.9});
 root.name=id;root.userData={modelId:id,quarryModel:true,dimensions:QUARRY_MODEL_INFO[id][2]};
 const box=(x,y,z,w,h,d,mat=steel,parent=root)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);parent.add(mesh);mesh.castShadow=true;mesh.receiveShadow=true;return mesh;};
 const cyl=(x,y,z,r,length,mat=steel,rotationZ=0,parent=root)=>{const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,length,12),mat);mesh.position.set(x,y,z);mesh.rotation.z=rotationZ;parent.add(mesh);return mesh;};
 const belt=(parent,length,height=1.8)=>{
  box(0,height,0,2,.16,length,black,parent);for(const x of [-1.05,1.05])box(x,height+.08,0,.15,.4,length,yellow,parent);
  for(let z=-length/2+.5;z<=length/2;z+=1.3){const roller=cyl(0,height-.1,z,.14,2.1,steel,Math.PI/2,parent);roller.userData.quarryRoller=true;for(const x of [-.8,.8])box(x,height/2,z,.12,height,.12,steel,parent);}
  for(let z=-length/2;z<length/2;z+=.9){const rib=box(0,height+.12,z,1.85,.06,.09,steel,parent);rib.userData.collisionDisabled=true;}
 };
 const hopper=(x,y,z,w,d)=>{box(x,y,z,w,.22,d,yellow);for(const side of [-1,1]){const a=box(x+side*w/2,y+.8,z,.18,1.6,d,yellow);a.rotation.z=-side*.17;const b=box(x,y+.8,z+side*d/2,w,1.6,.18,yellow);b.rotation.x=side*.17;}box(x,y+.18,z,w*.7,.12,d*.7,gravel);};
 if(id==='quarry-garden-bed'||id==='quarry-gravel-pad'||id==='quarry-storage-bin'){
  const h=id==='quarry-storage-bin'?1.3:id==='quarry-garden-bed'?.35:.2;
  box(0,h*.4,0,2.4,h*.8,2.4,id==='quarry-garden-bed'?new THREE.MeshStandardMaterial({color:0x61452e,roughness:1}):gravel);
  if(id!=='quarry-gravel-pad')for(const side of [-1,1]){box(side*1.2,h/2,0,.12,h,2.55,wood);box(0,h/2,side*1.2,2.5,h,.12,wood);}
  if(id==='quarry-garden-bed')for(let z=-.8;z<=.8;z+=.4)box(0,h*.82,z,2.1,.035,.06,wood);
 }else if(id==='quarry-conveyor'||id==='quarry-stacker'){
  const group=new THREE.Group();root.add(group);group.rotation.x=id==='quarry-stacker'?-.22:-.08;group.position.y=id==='quarry-stacker'?1.6:0;belt(group,id==='quarry-stacker'?16:12,1.5);
  if(id==='quarry-stacker'){for(const x of [-1.3,1.3]){box(x,.4,1,.6,.8,4,black);box(x,2,0,.2,3.2,.2,steel);}box(0,1.5,-6,2.2,.35,2.2,yellow);}
 }else{
  for(const x of [-2.1,2.1]){box(x,.45,0,1,.9,7,black);for(let z=-2.4;z<=2.4;z+=1.2)cyl(x,.52,z,.38,.25,steel,Math.PI/2);}
  box(0,1.2,0,5,.55,8,steel);hopper(0,2.1,-2.1,4.4,3.5);
  if(id==='quarry-screening-plant'){
   const tray=new THREE.Group();tray.position.set(0,2.5,1);tray.name='VIBRATING_SCREEN';root.add(tray);
   for(const y of [0,.55]){box(0,y,0,4,.1,4.4,black,tray);for(let x=-1.8;x<=1.8;x+=.4)box(x,y+.08,0,.04,.04,4.3,steel,tray);for(let z=-2;z<=2;z+=.4)box(0,y+.09,z,3.8,.04,.035,steel,tray);}
   for(const x of [-2.4,2.4])box(x,3,1,.16,1.4,4.8,yellow);for(const x of [-2.7,2.7]){box(x,1.7,1,1,.15,6,steel);box(x,2.5,1,.07,1.2,6,yellow);}
  }else{
   const jaw=new THREE.Group();jaw.position.set(0,2.4,.5);jaw.name='CRUSHER_JAW';root.add(jaw);for(const x of [-.9,.9]){const part=box(x,.3,0,.5,1.8,2.6,steel,jaw);part.rotation.z=x*.22;}
   for(const x of [-2.6,2.6]){const wheel=cyl(x,2.4,.7,1.25,.3,yellow,Math.PI/2);wheel.userData.quarryFlywheel=true;for(let i=0;i<6;i++){const spoke=box(x,2.4,.7,.32,.13,2.3,black);spoke.rotation.x=i*Math.PI/3;}}
  }
  const discharge=new THREE.Group();discharge.position.set(0,0,4);root.add(discharge);belt(discharge,5,1.5);
  box(-2.6,2,-2,.5,1.2,1.3,steel);for(const y of [1.7,2,2.3]){const light=cyl(-2.88,y,-2,.09,.08,y===2?yellow:black,Math.PI/2);light.userData.collisionDisabled=true;}
  for(let y=.4;y<2.5;y+=.35)box(-2.8,y,-3.5,.85,.08,.25,yellow);
 }
 return root;
}
export function updateQuarryModel(root,elapsed){
 if(!root.userData.quarryModel)return false;const state=root.userData.quarryMachine||{},running=!!state.running;
 const tray=root.getObjectByName('VIBRATING_SCREEN');if(tray){tray.position.y=2.5+(running?Math.sin(elapsed*35)*.035:0);tray.rotation.z=running?Math.sin(elapsed*27)*.008:0;}
 const jaw=root.getObjectByName('CRUSHER_JAW');if(jaw)jaw.rotation.x=running?Math.sin(elapsed*12)*.12:0;
 root.traverse(part=>{if(part.userData.quarryRoller)part.rotation.y=running?elapsed*8:0;if(part.userData.quarryFlywheel)part.rotation.y=running?elapsed*6:0;});return true;
}
