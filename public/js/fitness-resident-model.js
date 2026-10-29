import * as T from '../vendor/three/three.module.min.js';

function fitnessEquipment(root){
 if(root.userData.fitnessEquipment)return root.userData.fitnessEquipment;
 const body=root.userData.residentParts.body,limbs=root.userData.residentLimbs,props=new T.Group();props.name='FITNESS_WORKOUT_PROPS';body.add(props);
 const steel=new T.MeshStandardMaterial({color:'#a5b3be',metalness:.75,roughness:.3}),rubber=new T.MeshStandardMaterial({color:'#253449',roughness:.9}),gloveMat=new T.MeshStandardMaterial({color:'#ed7650',roughness:.65});
 const gloves=[],weights=[];
 for(const side of [-1,1]){
  const glove=new T.Mesh(new T.SphereGeometry(.115,12,10),gloveMat);glove.name='FITNESS_GLOVE';glove.position.set(0,-.03,-.025);glove.scale.set(1,1.1,1.2);(limbs[side].wrist||limbs[side].arm).add(glove);gloves.push(glove);
  const weight=new T.Group();weight.name='FITNESS_DUMBBELL';weight.position.set(0,-.03,0);(limbs[side].wrist||limbs[side].arm).add(weight);
  const handle=new T.Mesh(new T.CylinderGeometry(.022,.022,.35,8),steel);handle.rotation.z=Math.PI/2;weight.add(handle);
  for(const x of [-.16,.16]){const plate=new T.Mesh(new T.CylinderGeometry(.1,.1,.1,12),rubber);plate.rotation.z=Math.PI/2;plate.position.x=x;weight.add(plate);}weights.push(weight);
 }
 const ropePositions=[];for(let i=0;i<=48;i++){const angle=i/48*Math.PI*2;ropePositions.push(new T.Vector3(Math.cos(angle)*.68,Math.sin(angle)*.98,0));}
 const rope=new T.Line(new T.BufferGeometry().setFromPoints(ropePositions),new T.LineBasicMaterial({color:'#b7eee0'}));rope.name='FITNESS_JUMP_ROPE';props.add(rope);
 const bar=new T.Group();bar.name='FITNESS_PRESS_BAR';props.add(bar);const shaft=new T.Mesh(new T.CylinderGeometry(.025,.025,1.9,8),steel);shaft.rotation.z=Math.PI/2;bar.add(shaft);
 for(const x of [-.7,.7]){const plate=new T.Mesh(new T.CylinderGeometry(.2,.2,.14,16),rubber);plate.rotation.z=Math.PI/2;plate.position.x=x;bar.add(plate);}
 const ball=new T.Group();ball.name='FITNESS_BASKETBALL';props.add(ball);const orange=new T.MeshStandardMaterial({color:'#e89637',roughness:.9}),black=new T.MeshStandardMaterial({color:'#243445',roughness:.8});ball.add(new T.Mesh(new T.SphereGeometry(.14,16,12),orange));
 for(const angle of [0,Math.PI/2]){const seam=new T.Mesh(new T.TorusGeometry(.142,.006,5,24),black);seam.rotation.y=angle;ball.add(seam);}const equator=new T.Mesh(new T.TorusGeometry(.142,.006,5,24),black);equator.rotation.x=Math.PI/2;ball.add(equator);
 const paddle=new T.Group();paddle.name='FITNESS_TABLE_TENNIS_PADDLE';paddle.position.set(0,-.04,-.03);(limbs[1].wrist||limbs[1].arm).add(paddle);const blade=new T.Mesh(new T.CylinderGeometry(.095,.095,.025,16),new T.MeshStandardMaterial({color:'#b95767',roughness:.8}));blade.rotation.x=Math.PI/2;blade.position.y=-.07;blade.scale.y=1.12;paddle.add(blade);const handle=new T.Mesh(new T.BoxGeometry(.035,.12,.025),rubber);paddle.add(handle);
 const tableBall=new T.Mesh(new T.SphereGeometry(.025,10,8),new T.MeshStandardMaterial({color:'#fff4d7',roughness:.65}));tableBall.name='FITNESS_TABLE_TENNIS_BALL';props.add(tableBall);
 const stripes=new T.Group();stripes.name='FITNESS_REFEREE_STRIPES';body.add(stripes);const white=new T.MeshStandardMaterial({color:'#f7f4e7',roughness:.8});for(const x of [-.16,-.08,0,.08,.16]){const stripe=new T.Mesh(new T.BoxGeometry(.025,.35,.025),white);stripe.position.set(x,1.1,-.235);stripes.add(stripe);}
 const equipment={props,gloves,weights,rope,bar,ball,paddle,tableBall,stripes};root.userData.fitnessEquipment=equipment;return equipment;
}
/** Applies workout poses after the shared resident rig has reset its limbs.
 * Positions come from the gym cast, while time only drives visual repetition. */
export function updateFitnessResident(root,time){
 const state=root.userData.residentState||{},body=root.userData.residentParts?.body;
 if(!body)return;
 if(!state.fitness){if(root.userData.fitnessEquipment){body.position.set(0,0,0);body.rotation.set(0,0,0);const equipment=root.userData.fitnessEquipment;equipment.props.visible=false;equipment.stripes.visible=false;equipment.paddle.visible=false;for(const side of [-1,1])root.userData.residentLimbs[side].arm.position.z=0;for(const object of [...equipment.gloves,...equipment.weights])object.visible=false;}return;}
 const equipment=fitnessEquipment(root),{gloves,weights,rope,bar,ball,paddle,tableBall,stripes}=equipment,parts=root.userData.residentParts,limbs=root.userData.residentLimbs;
 // Gym characters are visual, social actors. Their animated equipment must
 // never become a wall or a moving floor for the human player's capsule.
 root.userData.solid=false;root.userData.collisionDisabled=true;
 body.position.set(0,0,0);body.rotation.set(0,0,0);equipment.props.visible=true;for(const object of [...gloves,...weights,rope,bar,ball,paddle,tableBall])object.visible=false;stripes.visible=state.duty==='referee';
 for(const side of [-1,1]){limbs[side].leg.rotation.y=0;limbs[side].leg.rotation.z=0;limbs[side].arm.position.z=0;}
 if(state.duty==='referee')root.userData.residentMaterials?.outfit.color.set('#26303b');
 if(state.moving||state.workoutPaused||state.speaking)return;
 const activity=state.currentActivity||state.activity||state.workout?.kind,phase=time+(state.index||0)*.63,pulse=(Math.sin(phase*2.1)+1)/2;
 if(activity==='spectating'){
  for(const side of [-1,1]){limbs[side].arm.rotation.set(.8,side*(.3+pulse*.15),side*.35);limbs[side].leg.rotation.x=0;}parts.head.rotation.x=-.04;return;
 }
 if(activity==='refereeing'){
  body.rotation.y=Math.sin(phase*.8)*.08;const stopping=state.sparring?.phase==='recovery';for(const side of [-1,1])limbs[side].arm.rotation.set(stopping?1.4:.35,0,-side*(stopping?.7:.12));return;
 }
 if(state.duty==='trainer'||state.workout?.phase==='rest'||activity==='recovery')return;
 if(activity==='sparring'||activity==='boxing-sparring'){
  const pose=state.combatPose||'guard',jab=Math.max(0,Math.sin(phase*7)),red=state.sparringSide==='red';for(const glove of gloves){glove.visible=true;glove.material.color.set(red?'#e67465':'#659dd9');}
  for(const side of [-1,1]){limbs[side].arm.rotation.set(1.75,side*.16,-side*.22);limbs[side].leg.rotation.x=Math.sin(phase*5+side)*.09;}
  const lead=limbs[-1].arm,rear=limbs[1].arm;body.rotation.y=Math.sin(phase*3)*.1;body.position.y=Math.abs(Math.sin(phase*5))*.035;
  if(pose==='jab'){lead.rotation.x=1.5+jab*.45;lead.position.z=-jab*.22;}
  else if(pose==='cross'){rear.rotation.x=1.5+jab*.5;rear.position.z=-jab*.24;body.rotation.y=-.18*jab;}
  else if(pose==='hook'){lead.rotation.set(1.5,-.7+jab*.5,.4);body.rotation.y=.22*jab;}
  else if(pose==='uppercut'){rear.rotation.set(1.1+jab*1.4,.12,-.15);body.position.y=-.08+jab*.1;}
  else if(pose==='slip')body.rotation.z=Math.sin(phase*5)*.18;
  else if(pose==='duck'){body.position.y=-.2;body.rotation.x=-.15;for(const side of [-1,1])limbs[side].leg.rotation.x=.18;}
 }else if(activity==='boxing'){
  for(const side of [-1,1]){const beat=Math.max(0,Math.sin(phase*5+side*Math.PI/2));limbs[side].arm.rotation.set(1.2+beat*.6,side*.1,-side*.18);limbs[side].leg.rotation.x=Math.sin(phase*5+side)*.08;}
  body.rotation.y=Math.sin(phase*2.5)*.1;body.position.y=Math.abs(Math.sin(phase*5))*.035;gloves.forEach(object=>{object.visible=true;});
 }else if(activity==='lifting'){
  for(const side of [-1,1]){limbs[side].arm.rotation.set(.3+pulse*1.6,0,-side*.08);weights[side<0?0:1].visible=true;}body.rotation.x=-.02;parts.head.rotation.x=.05;
 }else if(activity==='running'||activity==='sprint'){
  const pace=activity==='sprint'?11:8;for(const side of [-1,1]){const stride=Math.sin(phase*pace+side*Math.PI/2);limbs[side].leg.rotation.x=stride*(activity==='sprint'?.9:.65);limbs[side].arm.rotation.x=-stride*.65-.35;}body.position.y=Math.abs(Math.sin(phase*pace))*.055;body.rotation.x=activity==='sprint'?-.2:-.08;
 }else if(activity==='rowing'){
  body.position.y=-.4;body.rotation.x=-.2+pulse*.4;
  for(const side of [-1,1]){limbs[side].leg.rotation.x=1.1-pulse*.4;limbs[side].arm.rotation.set(1.25-pulse*.9,0,side*.08);}
 }else if(activity==='jump-rope'){
  body.position.y=Math.pow(Math.max(0,Math.sin(phase*6)),1.2)*.2;
  for(const side of [-1,1]){limbs[side].arm.rotation.set(-.25,0,-side*.4);limbs[side].leg.rotation.x=-Math.max(0,Math.sin(phase*6))*.12;}
  rope.visible=true;rope.rotation.x=phase*6;rope.position.y=.8;
 }else if(activity==='stretching'){
  body.rotation.z=Math.sin(phase*.8)*.18;limbs[-1].arm.rotation.set(2.6,0,.2);limbs[1].arm.rotation.set(2.6,0,-.2);limbs[-1].leg.rotation.z=.12;limbs[1].leg.rotation.z=-.12;
 }else if(activity==='bench-press'){
  body.position.set(0,.65,-.7);body.rotation.x=Math.PI/2;
  for(const side of [-1,1]){limbs[side].arm.rotation.set(1.2+pulse*.55,0,-side*.25);limbs[side].leg.rotation.x=.5;}
  bar.visible=true;bar.position.set(0,1.22,-.5-pulse*.35);
 }else if(activity==='deadlift'){
  body.position.y=-.12*(1-pulse);body.rotation.x=-.45*(1-pulse);
  for(const side of [-1,1]){limbs[side].arm.rotation.x=.2*(1-pulse);limbs[side].leg.rotation.x=.18*(1-pulse);}
  bar.visible=true;bar.position.set(0,.42+pulse*.28,-.28);
 }else if(activity==='basketball'){
  const cycle=(phase%3+3)%3;ball.visible=true;
  if(cycle<1.7){const bounce=Math.abs(Math.sin(phase*7));ball.position.set(.35,.19+bounce*.7,-.25);ball.rotation.z=phase*3;limbs[1].arm.rotation.set(.6+bounce*.5,0,-.15);limbs[-1].arm.rotation.set(.5,0,.25);body.rotation.x=-.08;}
  else{const shot=(cycle-1.7)/1.3;limbs[1].arm.rotation.set(2.5,0,-.15);limbs[-1].arm.rotation.set(2.3,0,.2);body.position.y=Math.sin(shot*Math.PI)*.12;ball.position.set(.12,1.55+Math.sin(shot*Math.PI)*1.6,-.35-shot*2.6);ball.rotation.x=-phase*3;}
 }else if(activity==='table-tennis'){
  paddle.visible=true;tableBall.visible=true;const stroke=Math.sin(phase*4);limbs[1].arm.rotation.set(.9+Math.max(0,stroke)*.7,.3+stroke*.55,-.15);limbs[-1].arm.rotation.set(.7,0,.25);body.rotation.y=stroke*.12;body.position.y=-.025;tableBall.position.set(stroke*.25,.92+Math.abs(stroke)*.12,-.35-Math.abs(stroke)*.8);parts.head.rotation.y=stroke*.15;
 }
}

// Applied after station-specific shoulders/hips, so gloves and equipment follow
// the real wrists while elbows and knees stay within anatomical hinge limits.
export function updateFitnessArticulation(root,time){
 const state=root.userData.residentState||{},limbs=root.userData.residentLimbs;if(!state.fitness||!limbs||state.moving||state.workoutPaused||state.speaking)return;
 const activity=state.currentActivity||state.activity||state.workout?.kind,phase=(state.reducedMotion?0:time)+(state.index||0)*.63,pulse=(Math.sin(phase*2.1)+1)/2;
 for(const side of [-1,1]){
  const limb=limbs[side];if(!limb.elbow)continue;let elbow=.08,knee=0,wrist=0;
  if(['boxing','sparring','boxing-sparring'].includes(activity)){elbow=1.15;const punching=activity==='boxing'||['jab','cross','hook','uppercut'].includes(state.combatPose);if(punching){const beat=Math.max(0,Math.sin(phase*(activity==='boxing'?5:7)+(activity==='boxing'?side*Math.PI/2:0))),lead=state.combatPose==='cross'||state.combatPose==='uppercut'?1:-1;elbow=activity==='boxing'||side===lead?1.15-beat*.95:1.15;}if(state.combatPose==='duck')knee=-.7;}
  else if(activity==='lifting'){limb.arm.rotation.x=.15;elbow=.25+pulse*1.55;}
  else if(activity==='running'||activity==='sprint'){const step=Math.sin(phase*(activity==='sprint'?11:8)+side*Math.PI/2);elbow=1.05;knee=-Math.max(0,-step)*1.05;}
  else if(activity==='rowing'){elbow=.15+pulse*.85;knee=-1.2+pulse*.6;}
  else if(activity==='jump-rope'){elbow=.25;knee=-Math.max(0,-Math.sin(phase*6))*.25;}
  else if(activity==='stretching')elbow=.12;
  else if(activity==='bench-press'){elbow=.9-pulse*.75;knee=-.75;}
  else if(activity==='deadlift'){knee=-(1-pulse)*.65;elbow=.02;}
  else if(activity==='basketball'){const cycle=(phase%3+3)%3;elbow=cycle<1.7?.7:.3;wrist=cycle<1.7?-.08:-.3;}
  else if(activity==='table-tennis'){elbow=side===1?.65:.35;wrist=side===1?-.12:0;knee=-.08;}
  else if(activity==='spectating')elbow=.55;
  limb.elbow.rotation.x=elbow;limb.knee.rotation.x=knee;limb.ankle.rotation.x=-limb.leg.rotation.x-knee;limb.wrist.rotation.x=wrist;
 }
}
