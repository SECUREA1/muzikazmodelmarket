import {aircraftType} from './aircraft-types.js';
import * as THREE from '../vendor/three/three.module.min.js';
export function seatedPilot(){
 const root=new THREE.Group();root.name='SEATED_AIRCRAFT_PILOT';root.userData={collisionDisabled:true,collider:false};const uniform=new THREE.MeshStandardMaterial({color:0x526a70,roughness:.9}),dark=new THREE.MeshStandardMaterial({color:0x1c292d,roughness:.8}),skin=new THREE.MeshStandardMaterial({color:0xbf9470,roughness:.9}),helmet=new THREE.MeshStandardMaterial({color:0xd4d9cc,roughness:.65,metalness:.1});
 const add=(geometry,material,point)=>{const mesh=new THREE.Mesh(geometry,material);mesh.position.set(...point);mesh.castShadow=true;mesh.userData={collisionDisabled:true,collider:false,aircraftPilot:true};root.add(mesh);return mesh;};
 const limb=(a,b,r,material)=>{const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),mesh=add(new THREE.CylinderGeometry(r,r*.9,start.distanceTo(end),8),material,start.clone().add(end).multiplyScalar(.5).toArray());mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.sub(start).normalize());};
 add(new THREE.BoxGeometry(.38,.50,.25),uniform,[0,1.23,.67]);add(new THREE.BoxGeometry(.35,.16,.3),uniform,[0,.91,.68]);add(new THREE.CylinderGeometry(.055,.07,.12,10),skin,[0,1.52,.64]);add(new THREE.SphereGeometry(.13,16,12),skin,[0,1.70,.63]);const head=add(new THREE.SphereGeometry(.15,16,12,0,Math.PI*2,0,Math.PI*.62),helmet,[0,1.73,.65]);head.name='CREW_HEAD';head.rotation.x=-.08;for(const side of [-1,1])add(new THREE.BoxGeometry(.055,.1,.09),dark,[side*.15,1.7,.64]);add(new THREE.BoxGeometry(.015,.015,.14),dark,[.14,1.62,.52]);add(new THREE.BoxGeometry(.24,.055,.035),dark,[0,1.76,.508]);
 for(const side of [-1,1]){limb([side*.12,.93,.66],[side*.16,.8,.18],.085,uniform);limb([side*.16,.8,.18],[side*.15,.6,-.08],.065,uniform);add(new THREE.BoxGeometry(.12,.09,.24),dark,[side*.15,.57,-.13]);limb([side*.22,1.43,.66],[side*.23,1.15,.43],.06,uniform);limb([side*.23,1.15,.43],[side*.055,1.07,.25],.05,uniform);add(new THREE.SphereGeometry(.055,10,8),skin,[side*.055,1.07,.25]);}
 return root;
}
export function updateAircraftSeat(model,actor,{selfId=null,view='cockpit'}={}){
 if(!model?.userData?.aircraftModel)return;let pilot=model.userData.seatedPilot;
 if(!pilot){pilot=seatedPilot();const seat=aircraftType(actor)?.seat||[0,.89,.63];pilot.position.set(seat[0],seat[1]-.89,seat[2]-.63);model.add(pilot);model.userData.seatedPilot=pilot;}
 const occupied=!!(actor?.holderId||actor?.trafficAI&&!actor?.crewRecovered)&&actor.active!==false;pilot.visible=occupied&&!(selfId&&actor.holderId===selfId&&view==='cockpit');model.userData.cockpitOccupied=occupied;model.userData.cockpitOccupant=actor?.crew?.name||actor?.holderId||null;if(actor?.trafficAI){const head=pilot.getObjectByName('CREW_HEAD');if(head){head.rotation.y=Math.sin((actor.trafficAngle||0)*12)*.16;head.rotation.x=actor.speaking?Math.sin(performance.now()*.009)*.065:0;}}
}
