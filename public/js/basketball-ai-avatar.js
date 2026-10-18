// Lightweight humanoid athletes for local and replicated AI players.
export function createBasketballAIAvatar(THREE,number='01'){
 const root=new THREE.Group(),skin=new THREE.MeshStandardMaterial({color:0xb77b56,roughness:.85}),shorts=new THREE.MeshStandardMaterial({color:0x17253a}),shoes=new THREE.MeshStandardMaterial({color:0xf4eee1});
 const mesh=(geometry,material,x,y,z)=>{const part=new THREE.Mesh(geometry,material);part.position.set(x,y,z);part.castShadow=true;root.add(part);return part;};
 mesh(new THREE.SphereGeometry(.16,12,10),skin,0,1.64,0);
 mesh(new THREE.BoxGeometry(.43,.56,.27),skin,0,1.18,0);
 mesh(new THREE.BoxGeometry(.44,.25,.3),shorts,0,.8,0);
 const limbs=[];
 for(const side of [-1,1]){
  for(const arm of [false,true]){const joint=new THREE.Group();joint.position.set(side*(arm?.31:.13),arm?1.4:.72,0);const part=new THREE.Mesh(new THREE.CapsuleGeometry(arm?.065:.085,arm?.38:.45,4,8),skin);part.position.y=arm?-.21:-.25;joint.add(part);if(!arm){const shoe=new THREE.Mesh(new THREE.BoxGeometry(.17,.11,.3),shoes);shoe.position.set(0,-.64,-.045);joint.add(shoe);}root.add(joint);limbs.push({joint,side,arm});}
 }
 root.userData.basketballLimbs=limbs;root.userData.basketballNumber=number;return root;
}
export function animateBasketballAIAvatar(root,walking,time){
 for(const {joint,side,arm}of root.userData.basketballLimbs||[])joint.rotation.x=walking?Math.sin(time*8+side*Math.PI/2)*(arm?-.45:.55):0;
}
