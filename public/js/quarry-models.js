import * as THREE from '../vendor/three/three.module.min.js';
import {QUARRY_MODEL_INFO,QUARRY_MATERIALS} from './quarry-config.js';

const materialColor=key=>QUARRY_MATERIALS[key]?.color??(key==='soil'?0x72513a:0x9d9b8d);
const bounded=value=>Math.max(0,Number.isFinite(Number(value))?Number(value):0);
const pose=new THREE.Object3D();
export function createQuarryModel(id){
 if(!QUARRY_MODEL_INFO[id])return null;
 const root=new THREE.Group(),steel=new THREE.MeshStandardMaterial({color:0x496573,metalness:.65,roughness:.45}),yellow=new THREE.MeshStandardMaterial({color:0xe8b23b,metalness:.4,roughness:.5}),black=new THREE.MeshStandardMaterial({color:0x233137,roughness:.9}),gravel=new THREE.MeshStandardMaterial({color:materialColor('gravel'),roughness:1}),wood=new THREE.MeshStandardMaterial({color:0x896746,roughness:.9});
 steel.name='QUARRY_STEEL';yellow.name='QUARRY_SAFETY_GUARD';black.name='QUARRY_RUBBER_BELT';gravel.name='QUARRY_MINERAL_MATERIAL';wood.name='QUARRY_TIMBER';
 root.name=id;root.userData={modelId:id,quarryModel:true,dimensions:QUARRY_MODEL_INFO[id][2],quarryAnimation:{lastTime:null,phase:0}};
 const box=(x,y,z,w,h,d,mat=steel,parent=root)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);parent.add(mesh);mesh.castShadow=true;mesh.receiveShadow=true;return mesh;};
 const cyl=(x,y,z,r,length,mat=steel,rotationZ=0,parent=root)=>{const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,length,12),mat);mesh.position.set(x,y,z);mesh.rotation.z=rotationZ;parent.add(mesh);return mesh;};
 // Each stream is one draw call with a fixed, reusable instance buffer. These
 // are presentation of confirmed throughput, never physical or saleable stock.
 const flow=(parent,length,height,width=1.45,material=null,fall=false)=>{
  const stream=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.12,0),new THREE.MeshStandardMaterial({color:materialColor(material),roughness:1}),24);
  stream.name='QUARRY_MATERIAL_FLOW';stream.userData={collisionDisabled:true,quarryFlow:{length,height,width,material,fall}};stream.visible=false;stream.count=0;stream.frustumCulled=false;stream.instanceMatrix.setUsage(THREE.DynamicDrawUsage);parent.add(stream);return stream;
 };
 const belt=(parent,length,height=1.5)=>{
  const deck=box(0,height,0,2,.16,length,black,parent);deck.name='QUARRY_RUBBER_DECK';for(const x of [-1.05,1.05])box(x,height+.08,0,.15,.4,length,yellow,parent);
  for(let z=-length/2+.5;z<=length/2;z+=1.3){const roller=cyl(0,height-.1,z,.14,2.1,steel,Math.PI/2,parent);roller.name='QUARRY_BELT_ROLLER';roller.userData.quarryRoller=true;for(const x of [-.8,.8])box(x,height/2,z,.12,height,.12,steel,parent);}
  const count=Math.ceil(length/.9),cleats=new THREE.InstancedMesh(new THREE.BoxGeometry(1.85,.06,.09),steel,count);cleats.name='QUARRY_BELT_CLEATS';cleats.userData={collisionDisabled:true,quarryCleats:{length,height:height+.12,count}};cleats.instanceMatrix.setUsage(THREE.DynamicDrawUsage);parent.add(cleats);
  for(let i=0;i<count;i++){pose.position.set(0,height+.12,-length/2+i*length/count);pose.rotation.set(0,0,0);pose.scale.set(1,1,1);pose.updateMatrix();cleats.setMatrixAt(i,pose.matrix);}cleats.instanceMatrix.needsUpdate=true;
  flow(parent,length,height+.23);
  const motor=box(-.8,height-.4,-length/2+.6,.5,.45,.7,yellow,parent);motor.name='QUARRY_CONVEYOR_DRIVE';cyl(-1.12,height-.4,-length/2+.6,.16,.2,black,Math.PI/2,parent);
 };
 const hopper=(x,y,z,w,d)=>{
  box(x,y,z,w,.22,d,yellow);for(const side of [-1,1]){const a=box(x+side*w/2,y+.8,z,.18,1.6,d,yellow);a.rotation.z=-side*.17;const b=box(x,y+.8,z+side*d/2,w,1.6,.18,yellow);b.rotation.x=side*.17;}
  const fill=box(x,y+.18,z,w*.7,.24,d*.7,gravel.clone());fill.name='QUARRY_LIVE_HOPPER_CONTENTS';fill.userData={collisionDisabled:true,quarryHopper:{baseY:y+.12,capacity:12}};fill.visible=false;
  for(const side of [-1,1])box(x+side*w*.3,y-.55,z,.16,1.1,.16,steel);
 };
 const chute=(parent,x,y,z,material,yaw=0)=>{
  const group=new THREE.Group();group.name='QUARRY_'+material.toUpperCase()+'_OUTLET';group.position.set(x,y,z);group.rotation.y=yaw;parent.add(group);
  box(0,0,0,.65,.12,1.7,steel,group);for(const side of [-1,1])box(side*.35,.14,0,.08,.35,1.7,yellow,group);flow(group,1.7,.23,.45,material);
  const lip=box(0,-.13,.93,.7,.4,.14,yellow,group);lip.rotation.x=-.25;return group;
 };
 if(id==='quarry-garden-bed'||id==='quarry-gravel-pad'||id==='quarry-storage-bin'){
  const h=id==='quarry-storage-bin'?1.3:id==='quarry-garden-bed'?.35:.2;
  box(0,h*.4,0,2.4,h*.8,2.4,id==='quarry-garden-bed'?new THREE.MeshStandardMaterial({color:0x61452e,roughness:1}):gravel);
  if(id!=='quarry-gravel-pad')for(const side of [-1,1]){box(side*1.2,h/2,0,.12,h,2.55,wood);box(0,h/2,side*1.2,2.5,h,.12,wood);}
  if(id==='quarry-garden-bed')for(let z=-.8;z<=.8;z+=.4)box(0,h*.82,z,2.1,.035,.06,wood);
 }else if(id==='quarry-conveyor'||id==='quarry-stacker'){
  const group=new THREE.Group();group.name='QUARRY_CONVEYOR_BOOM';root.add(group);group.rotation.x=id==='quarry-stacker'?-.22:0;group.position.y=id==='quarry-stacker'?1.6:0;belt(group,id==='quarry-stacker'?16:12,1.5);
  if(id==='quarry-conveyor'){const drop=flow(root,1,1.5,.65,null,true);drop.position.z=6;drop.userData.quarryFlow.drop=true;drop.name='QUARRY_STOCKPILE_DISCHARGE';}
  if(id==='quarry-stacker'){
   for(const x of [-1.3,1.3]){box(x,.4,1,.6,.8,4,black);box(x,2,0,.2,3.2,.2,steel);for(let z=-5;z<=5;z+=2){const brace=box(x,1,z,.08,1.2,2.4,steel,group);brace.rotation.x=.48;}}
   box(0,1.5,-6,2.2,.35,2.2,yellow);cyl(0,1.5,0,.7,.35,steel);for(const x of [-1.5,1.5])cyl(x,1.7,0,.14,2.3,black,.36);
   const discharge=new THREE.Group();discharge.name='QUARRY_STACKER_DISCHARGE';discharge.position.set(0,1.35,8);group.add(discharge);flow(discharge,2.4,.1,.9,null,true);
  }
 }else{
  for(const x of [-2.1,2.1]){box(x,.45,0,1,.9,7,black);for(let z=-2.4;z<=2.4;z+=1.2)cyl(x,.52,z,.38,.25,steel,Math.PI/2);}
  box(0,1.2,0,5,.55,8,steel);hopper(0,2.1,-2.1,4.4,3.5);
  if(id==='quarry-screening-plant'){
   const tray=new THREE.Group();tray.position.set(0,2.5,1);tray.name='VIBRATING_SCREEN';root.add(tray);
   for(const y of [0,.55]){box(0,y,0,4,.1,4.4,black,tray);for(let x=-1.8;x<=1.8;x+=.4)box(x,y+.08,0,.04,.04,4.3,steel,tray);for(let z=-2;z<=2;z+=.4)box(0,y+.09,z,3.8,.04,.035,steel,tray);}
   for(const x of [-1.7,1.7])for(const z of [-.5,2.5]){cyl(x,2.2,z,.15,.6,black);for(let y=2;y<=2.4;y+=.13)cyl(x,y,z,.18,.035,yellow);}
   for(const x of [-2.4,2.4])box(x,3,1,.16,1.4,4.8,yellow);for(const x of [-2.7,2.7]){box(x,1.7,1,1,.15,6,steel);box(x,2.5,1,.07,1.2,6,yellow);}
   chute(root,-2.4,1.5,2.1,'sand',-Math.PI/2);chute(root,2.4,1.7,2.1,'fines',Math.PI/2);chute(root,0,1.85,3.1,'stone');
  }else{
   const jaw=new THREE.Group();jaw.position.set(0,2.4,.5);jaw.name='CRUSHER_JAW';root.add(jaw);
   for(const x of [-.9,.9]){const part=box(x,.3,0,.5,1.8,2.6,steel,jaw);part.rotation.z=x*.22;for(let z=-1;z<=1;z+=.3){const tooth=box(x*.75,.32,z,.1,1.6,.13,yellow,jaw);tooth.rotation.z=x*.22;}}
   for(const x of [-2.6,2.6]){
    const wheel=new THREE.Group();wheel.name='QUARRY_CRUSHER_FLYWHEEL';wheel.position.set(x,2.4,.7);wheel.userData.quarryFlywheel=true;root.add(wheel);cyl(0,0,0,1.25,.3,yellow,Math.PI/2,wheel);cyl(0,0,0,.22,.4,steel,Math.PI/2,wheel);
    for(let i=0;i<6;i++){const spoke=box(0,0,0,.32,.13,2.3,black,wheel);spoke.rotation.x=i*Math.PI/3;}
    for(const z of [-.7,2.1])box(x*1.09,2.4,z,.09,2.9,.08,yellow);for(const y of [.95,3.85])box(x*1.09,y,.7,.09,.08,2.8,yellow);for(const z of [-.35,.35,1.05,1.75])box(x*1.09,2.4,z,.035,2.8,.035,steel);
   }
   box(0,1.95,1.2,2.1,.25,2.7,black);chute(root,0,1.45,3.1,'crushed');
  }
  const discharge=new THREE.Group();discharge.position.set(0,0,4);root.add(discharge);belt(discharge,5,1.5);
  box(-2.6,2,-2,.5,1.2,1.3,steel);for(const y of [1.7,2,2.3]){const light=cyl(-2.88,y,-2,.09,.08,y===2?yellow:black,Math.PI/2);light.name='QUARRY_STATUS_LAMP';light.userData={collisionDisabled:true,quarryStatusLight:y===2};}
  for(let y=.4;y<2.5;y+=.35)box(-2.8,y,-3.5,.85,.08,.25,yellow);for(const x of [-3.2,-2.4])box(x,1.5,-3.5,.08,2.7,.08,steel);
 }
 return root;
}
export function updateQuarryModel(root,elapsed){
 if(!root.userData.quarryModel)return false;
 const state=root.userData.quarryMachine||{},running=state.running===true,throughput=bounded(state.throughput),flowing=running&&throughput>1e-8,animation=root.userData.quarryAnimation,now=bounded(elapsed),delta=animation.lastTime===null?0:Math.max(0,Math.min(.1,now-animation.lastTime));
 animation.lastTime=now;if(running)animation.phase+=delta*(1.4+Math.min(3,throughput));const phase=animation.phase;
 const dominant=state.material||Object.entries(state.materialVolumes||{}).filter(([,v])=>bounded(v)>1e-8).sort((a,b)=>b[1]-a[1])[0]?.[0]||'gravel';
 const tray=root.getObjectByName('VIBRATING_SCREEN');if(tray){tray.position.y=2.5+(running?Math.sin(phase*20)*.035:0);tray.rotation.z=running?Math.sin(phase*17)*.008:0;}
 const jaw=root.getObjectByName('CRUSHER_JAW');if(jaw)jaw.rotation.x=running?Math.sin(phase*9)*.12:0;
 root.traverse(part=>{
  if(part.userData.quarryRoller)part.rotation.y=phase*5;
  if(part.userData.quarryFlywheel)part.rotation.x=phase*4;
  if(part.userData.quarryStatusLight){part.material.emissive.setHex(running?0x38a96c:0x000000);part.material.emissiveIntensity=running?.7:0;}
  const hopper=part.userData.quarryHopper;
  if(hopper){const amount=bounded(state.payloadVolume);part.visible=amount>1e-8;part.scale.y=.2+Math.min(1,amount/hopper.capacity)*3;part.position.y=hopper.baseY+part.scale.y*.12;part.material.color.setHex(materialColor(dominant));}
  const cleats=part.userData.quarryCleats;
  if(cleats){for(let i=0;i<cleats.count;i++){pose.position.set(0,cleats.height,-cleats.length/2+(i*cleats.length/cleats.count+phase*.8)%cleats.length);pose.rotation.set(0,0,0);pose.scale.set(1,1,1);pose.updateMatrix();part.setMatrixAt(i,pose.matrix);}part.instanceMatrix.needsUpdate=true;}
  const stream=part.userData.quarryFlow;if(!stream)return;
  const volume=stream.material?bounded(state.materialVolumes?.[stream.material]):throughput,visible=flowing&&(!stream.material||volume>1e-8)&&(!stream.drop||bounded(state.dischargeDrop)>0)&&!(stream.fall&&!stream.drop&&state.routed);
  part.visible=visible;part.count=visible?Math.min(24,Math.max(6,Math.ceil(throughput*6))):0;if(!visible)return;
  part.material.color.setHex(materialColor(stream.material||dominant));
  for(let i=0;i<part.count;i++){
   const t=(i/part.count+phase*.28)%1,x=Math.sin(i*2.39996)*stream.width*.4,z=stream.drop?0:(t-.5)*stream.length,y=stream.height+(stream.drop?-t*t*bounded(state.dischargeDrop):stream.fall?-t*t*stream.length:Math.sin(i*1.7)*.025);
   pose.position.set(x,y,z);pose.rotation.set(i*.7+phase,i*1.1,phase*.5);const size=.55+(i%5)*.14;pose.scale.set(size,stream.fall?size:size*.65,size);pose.updateMatrix();part.setMatrixAt(i,pose.matrix);
  }
  part.instanceMatrix.needsUpdate=true;
 });return true;
}
