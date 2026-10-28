import {finishVehicleDesign} from './vehicle-design-system.js';
import * as THREE from '../vendor/three/three.module.min.js';
import {createHarborBoat,HARBOR_HELM_POSES} from './harbor-models.js';
import {FISHING_GEAR} from './fishing-config.js';
const mat=(color,metalness=.1)=>new THREE.MeshStandardMaterial({color,metalness,roughness:metalness>.5?.24:.68});
function piece(parent,geometry,material,position,name){const mesh=new THREE.Mesh(geometry,material);mesh.position.set(...position);mesh.name=name;mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;}
function segment(parent,start,end,radius,material,name){const a=new THREE.Vector3(...start),b=new THREE.Vector3(...end),mesh=piece(parent,new THREE.CylinderGeometry(radius*.65,radius,a.distanceTo(b),8),material,a.clone().add(b).multiplyScalar(.5).toArray(),name);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.sub(a).normalize());return mesh;}
function cosmetic(object){object.traverse(node=>{node.userData.collisionDisabled=true;node.userData.collider=false;});return object;}
function nameplate(parent,text,position,rotation){if(typeof document==='undefined')return;const canvas=document.createElement('canvas');canvas.width=768;canvas.height=128;const context=canvas.getContext('2d');context.fillStyle='#e5e9d6';context.font='600 80px sans-serif';context.textAlign='center';context.textBaseline='middle';context.fillText(text,384,64);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const plate=piece(parent,new THREE.PlaneGeometry(1.18,.2),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,side:THREE.DoubleSide}),position,'ANGLER_NAMEPLATE');plate.rotation.y=rotation;}
// Real spinning tackle: cork grip, tapered blank, reel, bail, handle and line guides.
export function createFishingRod(pro=false){
 const root=new THREE.Group();root.name=pro?'CARBON_SPINNING_ROD':'COASTAL_SPINNING_ROD';const carbon=mat(pro?0x172b38:0x31676b),cork=mat(0xcda46d),silver=mat(0xc6d5dc,.85),dark=mat(0x26353d),line=mat(0xd3f2ee);
 segment(root,[0,0,0],[0,.45,0],.035,cork,'CORK_ROD_GRIP');
 const reel=piece(root,new THREE.CylinderGeometry(.083,.083,.11,18),silver,[.09,.31,0],'SPINNING_REEL_SPOOL');reel.rotation.z=Math.PI/2;segment(root,[0,.30,0],[.09,.25,0],.018,dark,'REEL_SEAT');
 const rotor=new THREE.Group();rotor.name='SPINNING_REEL_ROTOR';rotor.position.set(.145,.31,0);root.add(rotor);const bail=piece(rotor,new THREE.TorusGeometry(.098,.008,6,20,Math.PI*1.5),silver,[0,0,0],'REEL_BAIL');bail.rotation.y=Math.PI/2;
 const crank=new THREE.Group();crank.name='REEL_CRANK_ASSEMBLY';crank.position.set(.05,.26,0);root.add(crank);segment(crank,[0,0,0],[-.17,0,.07],.012,silver,'REEL_CRANK');piece(crank,new THREE.CapsuleGeometry(.023,.075,3,8),dark,[-.17,0,.07],'REEL_HANDLE');
 // Articulate the blank itself. Each guide and its threaded line moves with
 // its own section, so bending never detaches the outgoing line from the tip.
 let parent=root;const length=.25;
 for(let i=0;i<8;i++){
  const joint=new THREE.Group();joint.name='ROD_FLEX_'+i;joint.position.y=i?length:.45;parent.add(joint);segment(joint,[0,0,0],[0,length,0],.019-i*.0018,carbon,'TAPERED_ROD_BLANK');
  segment(joint,[.025,0,0],[.025,length,0],.0015,line,'THREADED_FISHING_LINE');
  if(i>0){const guide=piece(joint,new THREE.TorusGeometry(.034-i*.0025,.004,5,12),silver,[.025,0,0],'ROD_LINE_GUIDE');guide.rotation.x=Math.PI/2;}
  parent=joint;
 }
 segment(root,[.145,.31,0],[.025,.45,0],.0015,line,'REEL_FEED_LINE');
 const tip=new THREE.Object3D();tip.name='FISHING_ROD_TIP';tip.position.set(.025,length,0);parent.add(tip);root.userData.tip=tip;return root;
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
 const teak=mat(0xa77e50),ivory=mat(0xe6e8dc),silver=mat(0xc9dce2,.8),blue=mat(0x26546d),dark=mat(0x183642),orange=mat(0xf1a557),rubber=mat(0x426569);
 // The Angler has a forward center console and a clear working deck aft.
 // Its existing helm eye at z=-.1 now actually sits behind the wheel.
 for(const name of ['MARINE_HELM_CONSOLE','HELM_SEAT_CUSHION','HELM_SEAT_BACK','ENGINE_THROTTLE_LEVER','FRAMED_HELM_WINDSCREEN']){const part=launch.getObjectByName(name);if(part)part.position.z-=1.2;}
 for(const name of ['BOW_SEAT_CUSHION','BOW_SEAT_BACKREST'])launch.getObjectByName(name)?.removeFromParent();
 const oldLabels=[];launch.traverse(node=>{if(node.name==='VESSEL_NAMEPLATE')oldLabels.push(node);});for(const label of oldLabels){label.removeFromParent();label.geometry.dispose();label.material.map?.dispose();label.material.dispose();}
 piece(root,new THREE.BoxGeometry(1.95,.12,2.1),teak,[0,.28,1],'OPEN_ANGLED_CASTING_DECK');
 const details=new THREE.Group();details.name='ANGLER_MARINE_FITTINGS';root.add(cosmetic(details));
 for(const side of [-1,1])nameplate(details,'REEFRUNNER',[side*1.23,.18,-.4],side*Math.PI/2);
 for(let x=-.82;x<=.82;x+=.205)piece(details,new THREE.BoxGeometry(.012,.003,1.94),dark,[x,.342,1],'CASTING_DECK_CAULKING');
 piece(details,new THREE.BoxGeometry(.62,.36,.46),ivory,[-.47,.50,1.83],'INSULATED_CATCH_LIVEWELL');piece(details,new THREE.BoxGeometry(.55,.025,.39),blue,[-.47,.695,1.83],'LIVEWELL_LID');
 for(const x of [-.65,-.29])piece(details,new THREE.BoxGeometry(.045,.03,.065),silver,[x,.716,1.64],'LIVEWELL_LATCH');
 piece(details,new THREE.BoxGeometry(.42,.25,.28),blue,[.47,.46,1.85],'ONBOARD_TACKLE_LOCKER');piece(details,new THREE.BoxGeometry(.32,.02,.03),silver,[.47,.602,1.85],'TACKLE_LOCKER_HANDLE');
 for(const side of [-1,1]){
  piece(details,new THREE.BoxGeometry(.24,.018,.7),rubber,[side*.83,.35,.8],side<0?'PORT_NONSLIP_FOOT_PAD':'STARBOARD_NONSLIP_FOOT_PAD');
  for(let z=.56;z<1.08;z+=.09)piece(details,new THREE.BoxGeometry(.19,.004,.012),ivory,[side*.83,.362,z],'NONSLIP_STATION_GRIP');
  piece(details,new THREE.BoxGeometry(.055,.06,.46),ivory,[side*1.16,.57,.8],'PADDED_FISHING_GUNWALE');
  for(const z of [-1.85,-.55])segment(details,[side*.68,.4,z],[side*.68,2.16,z],.019,silver,'ANGLER_TTOP_SUPPORT');
 }
 piece(details,new THREE.BoxGeometry(1.52,.075,1.72),ivory,[0,2.19,-1.2],'ANGLER_SUN_CANOPY');piece(details,new THREE.BoxGeometry(1.34,.02,1.52),blue,[0,2.235,-1.2],'CANOPY_SOLAR_PANEL');
 for(const x of [-.42,-.14,.14,.42])piece(details,new THREE.BoxGeometry(.012,.004,1.35),silver,[x,2.248,-1.2],'SOLAR_CELL_DIVIDER');
 const sonar=new THREE.Group();sonar.name='ANGLER_FISHFINDER';sonar.position.set(-.35,1.12,-1.27);piece(sonar,new THREE.BoxGeometry(.25,.19,.06),dark,[0,0,0],'FISHFINDER_CASE');piece(sonar,new THREE.PlaneGeometry(.20,.14),mat(0x71c7a9),[0,0,.032],'FISHFINDER_DISPLAY');
 for(let i=0;i<3;i++)segment(sonar,[-.075+i*.055,-.035,0.036],[-.04+i*.055,.02+i*.009,.036],.004,ivory,'SONAR_FISH_ECHO');details.add(sonar);
 const ring=piece(details,new THREE.TorusGeometry(.17,.04,8,24),orange,[.98,.61,1.74],'ANGLER_LIFERING');ring.rotation.y=Math.PI/2;
 const rods=[],tips=[];for(const side of [-1,1]){
  const pivot=new THREE.Group();pivot.name=side<0?'PORT_FISHING_ROD':'STARBOARD_FISHING_ROD';pivot.position.set(side*1.15,.52,.8);pivot.rotation.z=-side*.58;
  const rod=createFishingRod();pivot.add(rod);root.add(pivot);rods.push(pivot);tips.push(rod.getObjectByName('FISHING_ROD_TIP'));segment(root,[side*1.12,.33,.8],[side*1.15,.61,.8],.045,silver,'GUNWALE_ROD_HOLDER');
  piece(root,new THREE.BoxGeometry(.18,.025,.65),blue,[side*1.02,.37,.8],side<0?'PORT_CASTING_STATION':'STARBOARD_CASTING_STATION');
 }
 const net=createFishingGear('fishing-net');net.position.set(-.75,.39,1.33);net.rotation.x=Math.PI/2;net.rotation.z=Math.PI/2;details.add(net);cosmetic(details);
 // Rod tips remain render-only and cannot enlarge the vessel's collision hull.
 for(const rod of rods)rod.traverse(node=>{node.userData.collisionDisabled=true;node.userData.collider=false;});
 const fishingRig={rods,tips,flexJoints:rods.map(rod=>Array.from({length:8},(_,i)=>rod.getObjectByName('ROD_FLEX_'+i))),rotors:rods.map(rod=>rod.getObjectByName('SPINNING_REEL_ROTOR')),cranks:rods.map(rod=>rod.getObjectByName('REEL_CRANK_ASSEMBLY'))};root.userData={...launch.userData,modelId:'harbor-fishing-boat',dimensions:[2.7,2.7,6.3],helmPose:HARBOR_HELM_POSES['harbor-fishing-boat'],fishingRig,boatRig:{...launch.userData.boatRig,fishingRig},vehicle:{mode:'boat',seat:[...HARBOR_HELM_POSES['harbor-fishing-boat'].position],speed:8,turnSpeed:.7}};return finishVehicleDesign(THREE,root,'harbor-fishing-boat');
}
