import * as T from '../vendor/three/three.module.min.js';

function fitnessEquipment(root){
 if(root.userData.fitnessEquipment)return root.userData.fitnessEquipment;
 const body=root.userData.residentParts.body,limbs=root.userData.residentLimbs,props=new T.Group();props.name='FITNESS_WORKOUT_PROPS';body.add(props);
 const steel=new T.MeshStandardMaterial({color:'#a5b3be',metalness:.75,roughness:.3}),rubber=new T.MeshStandardMaterial({color:'#253449',roughness:.9}),gloveMat=new T.MeshStandardMaterial({color:'#ed7650',roughness:.65});
 const gloves=[],weights=[];
 for(const side of [-1,1]){
  const glove=new T.Mesh(new T.SphereGeometry(.115,12,10),gloveMat);glove.name='FITNESS_GLOVE';glove.position.set(0,-.49,-.025);glove.scale.set(1,1.1,1.2);limbs[side].arm.add(glove);gloves.push(glove);
  const weight=new T.Group();weight.name='FITNESS_DUMBBELL';weight.position.set(0,-.49,0);limbs[side].arm.add(weight);
  const handle=new T.Mesh(new T.CylinderGeometry(.022,.022,.35,8),steel);handle.rotation.z=Math.PI/2;weight.add(handle);
  for(const x of [-.16,.16]){const plate=new T.Mesh(new T.CylinderGeometry(.1,.1,.1,12),rubber);plate.rotation.z=Math.PI/2;plate.position.x=x;weight.add(plate);}weights.push(weight);
 }
 const ropePositions=[];for(let i=0;i<=48;i++){const angle=i/48*Math.PI*2;ropePositions.push(new T.Vector3(Math.cos(angle)*.68,Math.sin(angle)*.98,0));}
 const rope=new T.Line(new T.BufferGeometry().setFromPoints(ropePositions),new T.LineBasicMaterial({color:'#b7eee0'}));rope.name='FITNESS_JUMP_ROPE';props.add(rope);
 const bar=new T.Group();bar.name='FITNESS_PRESS_BAR';props.add(bar);const shaft=new T.Mesh(new T.CylinderGeometry(.025,.025,1.9,8),steel);shaft.rotation.z=Math.PI/2;bar.add(shaft);
 for(const x of [-.7,.7]){const plate=new T.Mesh(new T.CylinderGeometry(.2,.2,.14,16),rubber);plate.rotation.z=Math.PI/2;plate.position.x=x;bar.add(plate);}
 const equipment={props,gloves,weights,rope,bar};root.userData.fitnessEquipment=equipment;return equipment;
}
/** Applies workout poses after the shared resident rig has reset its limbs.
 * Positions come from the gym cast, while time only drives visual repetition. */
export function updateFitnessResident(root,time){
 const state=root.userData.residentState||{},body=root.userData.residentParts?.body;
 if(!body)return;
 if(!state.fitness){if(root.userData.fitnessEquipment){body.position.set(0,0,0);body.rotation.set(0,0,0);const equipment=root.userData.fitnessEquipment;equipment.props.visible=false;for(const object of [...equipment.gloves,...equipment.weights])object.visible=false;}return;}
 const equipment=fitnessEquipment(root),{gloves,weights,rope,bar}=equipment,parts=root.userData.residentParts,limbs=root.userData.residentLimbs;
 body.position.set(0,0,0);body.rotation.set(0,0,0);equipment.props.visible=true;for(const object of [...gloves,...weights,rope,bar])object.visible=false;
 for(const side of [-1,1]){limbs[side].leg.rotation.y=0;limbs[side].leg.rotation.z=0;}
 if(state.moving||state.workoutPaused||state.speaking||state.duty==='trainer'||state.workout?.phase==='rest')return;
 const activity=state.activity||state.workout?.kind,phase=time+(state.index||0)*.63,pulse=(Math.sin(phase*2.1)+1)/2;
 if(activity==='boxing'){
  for(const side of [-1,1]){const beat=Math.max(0,Math.sin(phase*5+side*Math.PI/2));limbs[side].arm.rotation.set(1.2+beat*.6,side*.1,-side*.18);limbs[side].leg.rotation.x=Math.sin(phase*5+side)*.08;}
  body.rotation.y=Math.sin(phase*2.5)*.1;body.position.y=Math.abs(Math.sin(phase*5))*.035;gloves.forEach(object=>{object.visible=true;});
 }else if(activity==='lifting'){
  for(const side of [-1,1]){limbs[side].arm.rotation.set(.3+pulse*1.6,0,-side*.08);weights[side<0?0:1].visible=true;}body.rotation.x=-.02;parts.head.rotation.x=.05;
 }else if(activity==='running'){
  for(const side of [-1,1]){const stride=Math.sin(phase*8+side*Math.PI/2);limbs[side].leg.rotation.x=stride*.65;limbs[side].arm.rotation.x=-stride*.65-.35;}body.position.y=Math.abs(Math.sin(phase*8))*.055;body.rotation.x=-.08;
 }else if(activity==='rowing'){
  body.position.y=-.4;body.rotation.x=-.2+pulse*.4;
  for(const side of [-1,1]){limbs[side].leg.rotation.x=1.1-pulse*.4;limbs[side].arm.rotation.set(1.25-pulse*.9,0,side*.08);}
 }else if(activity==='jump-rope'){
  body.position.y=Math.pow(Math.max(0,Math.sin(phase*6)),1.2)*.2;
  for(const side of [-1,1]){limbs[side].arm.rotation.set(-.25,0,-side*.4);limbs[side].leg.rotation.x=-Math.max(0,Math.sin(phase*6))*.12;}
  rope.visible=true;rope.rotation.x=phase*6;rope.position.y=.8;
 }else if(activity==='stretching'){
  body.rotation.z=Math.sin(phase*.8)*.18;limbs[-1].arm.rotation.set(-2.6,0,.2);limbs[1].arm.rotation.set(-2.6,0,-.2);limbs[-1].leg.rotation.z=.12;limbs[1].leg.rotation.z=-.12;
 }else if(activity==='bench-press'){
  body.position.set(0,.65,-.7);body.rotation.x=Math.PI/2;
  for(const side of [-1,1]){limbs[side].arm.rotation.set(1.2+pulse*.55,0,-side*.25);limbs[side].leg.rotation.x=.5;}
  bar.visible=true;bar.position.set(0,1.22,-.5-pulse*.35);
 }else if(activity==='deadlift'){
  body.position.y=-.12*(1-pulse);body.rotation.x=-.45*(1-pulse);
  for(const side of [-1,1]){limbs[side].arm.rotation.x=.2*(1-pulse);limbs[side].leg.rotation.x=.18*(1-pulse);}
  bar.visible=true;bar.position.set(0,.42+pulse*.28,-.28);
 }
}
