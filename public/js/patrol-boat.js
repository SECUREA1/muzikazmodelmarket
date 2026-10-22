import * as THREE from '../vendor/three/three.module.min.js';
import {createHarborBoat} from './harbor-models.js';
export {isCombatBoat,patrolGunPose} from './patrol-combat.js';
export function createPatrolBoat(){
 const root=new THREE.Group(),hull=createHarborBoat('harbor-skiff');hull.scale.set(1.4,1,1.6);root.add(hull);root.name='HARBOR_SENTINEL_PATROL';
 const navy=new THREE.MeshStandardMaterial({color:0x233a47,metalness:.45,roughness:.42}),metal=new THREE.MeshStandardMaterial({color:0x8dabad,metalness:.75,roughness:.3}),orange=new THREE.MeshStandardMaterial({color:0xf7a541}),black=new THREE.MeshStandardMaterial({color:0x142229});
 const box=(parent,name,size,pos,mat)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),mat);mesh.name=name;mesh.position.set(...pos);mesh.castShadow=true;parent.add(mesh);return mesh;};
 for(const x of [-1.32,1.32]){box(root,'ARMOR_GUNWALE',[.16,.55,5.6],[x,.65,.1],navy);box(root,'RESCUE_STRIPE',[.03,.12,4.2],[x*1.07,.8,.3],orange);}
 box(root,'STERN_ARMOR',[2.5,.7,.16],[0,.85,2.85],navy);box(root,'CABIN_ROLL_BAR',[2.75,.12,.16],[0,2.4,1.6],metal);for(const x of [-1.2,1.2])box(root,'ROLL_BAR_SUPPORT',[.12,1.65,.12],[x,1.58,1.6],metal);
 const radar=new THREE.Group();radar.position.set(0,2.65,1.6);box(radar,'RADAR_ARRAY',[1.2,.1,.2],[0,0,0],navy);root.add(radar);
 const turret=new THREE.Group();turret.position.set(0,.83,-2.45);root.add(turret);const mount=new THREE.Mesh(new THREE.CylinderGeometry(.48,.64,.5,20),navy);mount.position.y=.15;turret.add(mount);box(turret,'TURRET_SHIELD',[1.05,.65,.25],[0,.55,-.2],navy);
 const barrel=new THREE.Group();barrel.position.set(0,.72,-.25);turret.add(barrel);const tube=new THREE.Mesh(new THREE.CylinderGeometry(.075,.1,1.9,12),black);tube.rotation.x=Math.PI/2;tube.position.z=-.9;barrel.add(tube);box(barrel,'BARREL_MUZZLE',[.22,.2,.18],[0,0,-1.85],metal);
 const flash=new THREE.Mesh(new THREE.ConeGeometry(.22,.6,8),new THREE.MeshBasicMaterial({color:0xffd56f}));flash.rotation.x=-Math.PI/2;flash.position.z=-2.1;flash.visible=false;barrel.add(flash);
 for(const x of [-.7,.7]){const light=new THREE.Mesh(new THREE.SphereGeometry(.085,10,8),new THREE.MeshStandardMaterial({color:x<0?0x4daaff:0xff754d,emissive:x<0?0x4daaff:0xff754d,emissiveIntensity:1.8}));light.position.set(x,2.53,1.6);root.add(light);}
 root.userData={...hull.userData,modelId:'harbor-patrol',dimensions:[3,2.9,7.8],helmPose:{position:[.42,1.43,1.15],fov:74},vehicle:{mode:'boat',seat:[.42,1.43,1.15],speed:12,turnSpeed:.7},patrolGun:true,boatRig:{...hull.userData.boatRig,gunTurret:turret,gunBarrel:barrel,gunFlash:flash,radar}};
 for(const node of [turret,radar])node.traverse(mesh=>{mesh.userData.collisionDisabled=true;mesh.userData.collider=false;});return root;
}
export function updatePatrolBoat(root,elapsed){const rig=root.userData.boatRig,state=root.userData.boatState||{};if(!rig?.gunTurret)return;rig.gunTurret.rotation.y=state.gunYaw||0;rig.gunBarrel.rotation.x=state.gunPitch||0;rig.radar.rotation.y=elapsed*.7;if(root.userData.lastPatrolShot!==state.gunShotAt){root.userData.lastPatrolShot=state.gunShotAt;root.userData.patrolFlashUntil=performance.now()+90;}rig.gunFlash.visible=!!state.gunShotAt&&performance.now()<(root.userData.patrolFlashUntil||0);}
