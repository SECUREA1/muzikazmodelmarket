import {articulateLimb,finalizeArticulatedCharacter,updateArticulatedCharacter} from './articulated-character-rig.js';
// Lightweight humanoid athletes for local and replicated AI players.
export function createBasketballAIAvatar(THREE,number='01'){
 const root=new THREE.Group(),skin=new THREE.MeshStandardMaterial({color:0xb77b56,roughness:.85}),shorts=new THREE.MeshStandardMaterial({color:0x17253a}),shoes=new THREE.MeshStandardMaterial({color:0xf4eee1});
 const mesh=(geometry,material,x,y,z)=>{const part=new THREE.Mesh(geometry,material);part.position.set(x,y,z);part.castShadow=true;root.add(part);return part;};
 mesh(new THREE.SphereGeometry(.16,12,10),skin,0,1.64,0);
 mesh(new THREE.BoxGeometry(.43,.56,.27),skin,0,1.18,0);
 mesh(new THREE.BoxGeometry(.44,.25,.3),shorts,0,.8,0);
 const limbs=[];
 // A low-resolution lathed capsule keeps a real hinge ring at the elbow/knee.
 // Each limb remains one renderable mesh and uses fewer triangles than before.
 function limbGeometry(radius,length,hingeY){
  const half=length/2,cap=radius*Math.SQRT1_2;
  return new THREE.LatheGeometry([
   new THREE.Vector2(0,-half-radius),new THREE.Vector2(cap,-half-cap),
   new THREE.Vector2(radius,-half),new THREE.Vector2(radius,hingeY),
   new THREE.Vector2(radius,half),new THREE.Vector2(cap,half+cap),
   new THREE.Vector2(0,half+radius)
  ],8);
 }
 for(const side of [-1,1]){
  for(const arm of [false,true]){
   const joint=new THREE.Group();joint.name='BASKETBALL_'+(side<0?'LEFT_':'RIGHT_')+(arm?'SHOULDER':'HIP');joint.position.set(side*(arm?.28:.13),arm?1.4:.72,0);root.add(joint);
   const center=arm?-.21:-.25,bendY=arm?-.25:-.34;
   const part=new THREE.Mesh(limbGeometry(arm?.065:.085,arm?.38:.45,bendY-center),skin);part.position.y=center;part.name=arm?'BASKETBALL_ARM':'BASKETBALL_LEG';joint.add(part);
   const attachments=[];
   if(!arm){const shoe=new THREE.Mesh(new THREE.BoxGeometry(.17,.11,.3),shoes);shoe.name='BASKETBALL_SHOE';shoe.position.set(0,-.64,-.045);joint.add(shoe);attachments.push(shoe);}
   articulateLimb(THREE,joint,{mesh:part,bend:[0,bendY,0],end:[0,arm?-.45:-.59,0],attachments,kind:arm?'arm':'leg',side,prefix:'BASKETBALL'});
   limbs.push({joint,side,arm});
  }
 }
 root.userData.basketballLimbs=limbs;root.userData.basketballNumber=number;finalizeArticulatedCharacter(root);return root;
}
export function animateBasketballAIAvatar(root,walking,time,{reducedMotion=false}={}){
 walking=Boolean(walking)&&!reducedMotion;
 for(const {joint,side,arm}of root.userData.basketballLimbs||[])joint.rotation.x=walking?Math.sin(time*8+side*Math.PI/2)*(arm?-.45:.55):0;
 // Align the lower joints with the athlete's existing 8 rad/s cosine stride.
 updateArticulatedCharacter(root,time+Math.PI/16,{moving:walking,speed:1.5,reducedMotion,upperBody:false});
}
