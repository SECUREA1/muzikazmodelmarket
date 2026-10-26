import * as THREE from '../vendor/three/three.module.min.js';
import {createHarborBoat,HARBOR_HELM_POSES} from './harbor-models.js';
import {FISHING_GEAR} from './fishing-config.js';
const mat=(color,metalness=.1)=>new THREE.MeshStandardMaterial({color,metalness,roughness:metalness>.5?.24:.68});
function piece(parent,geometry,material,position,name){const mesh=new THREE.Mesh(geometry,material);mesh.position.set(...position);mesh.name=name;mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;}
function segment(parent,start,end,radius,material,name){const a=new THREE.Vector3(...start),b=new THREE.Vector3(...end),mesh=piece(parent,new THREE.CylinderGeometry(radius*.65,radius,a.distanceTo(b),8),material,a.clone().add(b).multiplyScalar(.5).toArray(),name);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.sub(a).normalize());return mesh;}
// Real spinning tackle: cork grip, tapered blank, reel, bail, handle and line guides.
export function createFishingRod(pro=false){
 const root=new THREE.Group();root.name=pro?'CARBON_SPINNING_ROD':'COASTAL_SPINNING_ROD';const carbon=mat(pro?0x172b38:0x31676b),cork=mat(0xcda46d),silver=mat(0xc6d5dc,.85),dark=mat(0x26353d),line=mat(0xd3f2ee);
 segment(root,[0,0,0],[0,.45,0],.035,cork,'CORK_ROD_GRIP');segment(root,[0,.45,0],[0,2.45,0],.019,carbon,'TAPERED_ROD_BLANK');
 const reel=piece(root,new THREE.CylinderGeometry(.083,.083,.11,18),silver,[.09,.31,0],'SPINNING_REEL_SPOOL');reel.rotation.z=Math.PI/2;segment(root,[0,.30,0],[.09,.25,0],.018,dark,'REEL_SEAT');
 const bail=piece(root,new THREE.TorusGeometry(.098,.008,6,20,Math.PI*1.5),silver,[.145,.31,0],'REEL_BAIL');bail.rotation.y=Math.PI/2;
 segment(root,[.05,.26,0],[-.12,.26,.07],.012,silver,'REEL_CRANK');piece(root,new THREE.CapsuleGeometry(.023,.075,3,8),dark,[-.12,.26,.07],'REEL_HANDLE');
 for(const y of [.65,1.1,1.55,1.95,2.3,2.45]){const radius=.013+(2.45-y)*.009;const guide=piece(root,new THREE.TorusGeometry(radius,.004,5,12),silver,[.025,y,0],'ROD_LINE_GUIDE');guide.rotation.x=Math.PI/2;}
 segment(root,[.145,.31,0],[.025,2.45,0],.002,line,'THREADED_FISHING_LINE');const tip=new THREE.Object3D();tip.name='FISHING_ROD_TIP';tip.position.set(.025,2.45,0);root.add(tip);root.userData.tip=tip;return root;
}
export function createFishingGear(id){
 if(!FISHING_GEAR.some(item=>item.id===id))return null;
 let root;if(id==='fishing-rod'||id==='fishing-pro-rod')root=createFishingRod(id==='fishing-pro-rod');
 else{root=new THREE.Group();const silver=mat(0xbad4dc,.8),dark=mat(0x205466),orange=mat(0xe6b268);
  if(id==='fishing-net'){segment(root,[0,0,0],[0,1.05,0],.022,silver,'LANDING_NET_HANDLE');const rim=piece(root,new THREE.TorusGeometry(.29,.016,6,24),silver,[0,1.34,0],'NET_HOOP');for(let i=-3;i<=3;i++){const x=i*.07,span=Math.sqrt(.29*.29-x*x);segment(root,[x,1.34-span,0],[x,1.34+span,0],.004,dark,'WOVEN_NET');segment(root,[-span,1.34+x,0],[span,1.34+x,0],.004,dark,'WOVEN_NET');}}
  else if(id==='fishing-lure'){const lure=piece(root,new THREE.SphereGeometry(.08,16,10),silver,[0,.12,0],'SILVER_SPOON_LURE');lure.scale.set(.5,1.5,.25);segment(root,[0,.015,0],[.045,0,0],.004,dark,'LURE_HOOK');piece(root,new THREE.SphereGeometry(.013,8,6),mat(0xe34949),[0,.16,.02],'LURE_EYE');}
  else if(id==='fishing-reel'){const spool=piece(root,new THREE.CylinderGeometry(.12,.12,.16,18),silver,[0,.18,0],'PRECISION_DRAG_REEL');spool.rotation.z=Math.PI/2;segment(root,[0,.1,0],[-.2,.1,.06],.015,dark,'REEL_HANDLE');}
  else{const bait=id==='fishing-bait';piece(root,new THREE.BoxGeometry(bait?.25:.55,bait?.16:.30,bait?.18:.32),bait?orange:dark,[0,bait?.08:.15,0],bait?'RENEWABLE_BAIT_TIN':'TACKLE_BOX');piece(root,new THREE.BoxGeometry(.20,.035,.06),silver,[0,bait?.18:.34,0],'CARRY_HANDLE');if(!bait)for(const x of [-.17,.17])piece(root,new THREE.BoxGeometry(.045,.065,.02),orange,[x,.23,.17],'TACKLE_LATCH');}
 }
 root.userData={builderObject:true,modelId:id,fishingGear:true};return root;
}
export function createFishingBoat(){
 const root=new THREE.Group(),launch=createHarborBoat('harbor-skiff');launch.scale.set(1.30,1,1.30);root.add(launch);root.name='REEFRUNNER_ANGLER_FISHING_BOAT';
 const teak=mat(0xa77e50),ivory=mat(0xe6e8dc),silver=mat(0xc9dce2,.8),blue=mat(0x26546d);
 piece(root,new THREE.BoxGeometry(2.1,.12,2),teak,[0,.28,1.05],'OPEN_ANGLED_CASTING_DECK');piece(root,new THREE.BoxGeometry(.62,.36,.46),ivory,[-.47,.50,.95],'INSULATED_CATCH_LIVEWELL');piece(root,new THREE.BoxGeometry(.42,.25,.28),blue,[.44,.46,1.13],'ONBOARD_TACKLE_LOCKER');
 const rods=[],tips=[];for(const side of [-1,1]){
  const pivot=new THREE.Group();pivot.name=side<0?'PORT_FISHING_ROD':'STARBOARD_FISHING_ROD';pivot.position.set(side*1.15,.52,.8);pivot.rotation.z=-side*.58;
  const rod=createFishingRod();pivot.add(rod);root.add(pivot);rods.push(pivot);tips.push(rod.getObjectByName('FISHING_ROD_TIP'));segment(root,[side*1.12,.33,.8],[side*1.15,.61,.8],.045,silver,'GUNWALE_ROD_HOLDER');
  piece(root,new THREE.BoxGeometry(.18,.025,.65),blue,[side*1.02,.37,.8],side<0?'PORT_CASTING_STATION':'STARBOARD_CASTING_STATION');
 }
 const net=createFishingGear('fishing-net');net.position.set(-.65,.30,1.5);net.rotation.x=Math.PI/2;root.add(net);
 // Rod tips remain render-only and cannot enlarge the vessel's collision hull.
 for(const rod of rods)rod.traverse(node=>{node.userData.collisionDisabled=true;node.userData.collider=false;});
 const fishingRig={rods,tips};root.userData={...launch.userData,modelId:'harbor-fishing-boat',dimensions:[2.7,2.7,6.3],helmPose:HARBOR_HELM_POSES['harbor-fishing-boat'],fishingRig,boatRig:{...launch.userData.boatRig,fishingRig},vehicle:{mode:'boat',seat:[...HARBOR_HELM_POSES['harbor-fishing-boat'].position],speed:8,turnSpeed:.7}};return root;
}
