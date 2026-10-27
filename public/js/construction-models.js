import {finishVehicleDesign} from './vehicle-design-system.js';
import * as T from '../vendor/three/three.module.min.js';
import {ROAD_VEHICLES} from './road-vehicles.js';
import {finishGameItem} from './game-item-finish.js';
import {constructionKinematics} from './construction-kinematics.js';
import {CONSTRUCTION_LOAD_OFFSET} from './construction-state.js';

export const CONSTRUCTION_MODEL_IDS=Object.freeze(['tower-crane','site-dumptruck','site-bulldozer','site-excavator','construction-steel-beam']);
const dashboards=new WeakMap(),driveAnimations=new WeakMap();
const localCabGlass=new WeakSet(),localCargoMaterials=new WeakSet();
const finiteNumber=value=>Number.isFinite(Number(value))?Number(value):0;
const clamp=(value,min,max,fallback=min)=>Math.max(min,Math.min(max,Number.isFinite(value)?value:fallback));
// This affects the occupied player's view only. The dedicated mechanical
// colliders remain solid, and other copies keep their own glazing materials.
export function setConstructionCabView(root,operator=false){
 if(!root)return;
 root.traverse(mesh=>{
  if(mesh.userData.constructionCabRoof)mesh.visible=!operator;
  if(mesh.userData.constructionCabGlass){if(!localCabGlass.has(mesh)){mesh.material=mesh.material.clone();localCabGlass.add(mesh);}mesh.material.opacity=operator?.055:.16;mesh.material.depthWrite=false;}
 });
}
// Each joint is a real transform: server snapshots drive the mechanism, including
// the wire rope, hydraulic pistons, tracks and load indicators.
export function createConstructionModel(id){
 if(!CONSTRUCTION_MODEL_IDS.includes(id))return null;
 const config=ROAD_VEHICLES[id],root=new T.Group();root.name=config?.name||'18 m Structural Steel I-Beam';
 root.userData={builderObject:true,modelId:id,constructionModel:true,...(config?{roadVehicle:true,vehicle:{mode:'drive',speed:config.speed,turnSpeed:config.turn,seat:config.seat}}:{})};
 const paint=new T.MeshStandardMaterial({color:config?.color||'#bd633a',roughness:.5,metalness:.55}),steel=new T.MeshStandardMaterial({color:'#64747a',roughness:.4,metalness:.8}),dark=new T.MeshStandardMaterial({color:'#17252c',roughness:.6,metalness:.5}),rubber=new T.MeshStandardMaterial({color:'#18201f',roughness:.95}),chrome=new T.MeshStandardMaterial({color:'#c3d4d7',roughness:.2,metalness:.9}),glass=new T.MeshPhysicalMaterial({color:'#c3e5ec',transparent:true,opacity:.16,roughness:.08,depthWrite:false,side:T.DoubleSide}),red=new T.MeshStandardMaterial({color:'#f15b43',emissive:'#f15b43',emissiveIntensity:.35}),soil=new T.MeshStandardMaterial({color:'#795332',roughness:1}),seatMat=new T.MeshStandardMaterial({color:'#26383d',roughness:.9});
 const refs={wheels:[],tracks:[],beacons:[],hydraulics:[],links:[],joysticks:[],dashes:[],slings:[],colliders:[]};root.userData.constructionParts=refs;
 const mesh=(geometry,material,position=[0,0,0],parent=root)=>{const part=new T.Mesh(geometry,material);part.position.set(...position);part.castShadow=part.receiveShadow=true;parent.add(part);return part;};
 const box=(size,position,material=paint,parent=root)=>mesh(new T.BoxGeometry(...size),material,position,parent);
 const cylinder=(radius,length,position,material=steel,parent=root)=>mesh(new T.CylinderGeometry(radius,radius,length,12),material,position,parent);
 const tube=(a,b,r=.05,material=steel,parent=root)=>{const start=new T.Vector3(...a),end=new T.Vector3(...b),delta=end.clone().sub(start),part=cylinder(r,delta.length(),start.add(end).multiplyScalar(.5).toArray(),material,parent);part.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());return part;};
 const group=(name,position,parent=root)=>{const result=new T.Group();result.name=name;result.position.set(...position);parent.add(result);return result;};
 const pin=(position,parent=root,r=.13,length=.8)=>{const result=group('LINK_PIN',position,parent),axle=cylinder(r,length,[0,0,0],steel,result);axle.rotation.z=Math.PI/2;for(const x of [-length/2,length/2]){const cap=cylinder(r*1.2,.035,[x,0,0],chrome,result);cap.rotation.z=Math.PI/2;}return result;};
 const linkage=(a,b,r=.075,parent=root)=>{const part=cylinder(r,1,[0,0,0],steel,parent);part.name='ARTICULATED_LINK';refs.links.push({part,a,b});return part;};
 const hydraulic=(a,b,parent=root)=>{const assembly=group('HYDRAULIC_RAM',[0,0,0],parent),body=cylinder(.105,1,[0,0,0],dark,assembly),rod=cylinder(.055,1,[0,0,0],chrome,assembly),eyeA=pin([0,0,0],assembly,.14,.32),eyeB=pin([0,1,0],assembly,.12,.3),hose=group('HYDRAULIC_HOSE',[.14,0,0],assembly);for(const [start,end]of [[[0,0,0],[.11,.2,.02]],[[.11,.2,.02],[.11,.8,.02]],[[.11,.8,.02],[0,1,0]]])tube(start,end,.019,rubber,hose);refs.hydraulics.push({assembly,body,rod,eyeA,eyeB,hose,a,b});return assembly;};
 const beacon=(position,parent=root)=>{const housing=cylinder(.11,.16,position,new T.MeshStandardMaterial({color:'#ffbe32',emissive:'#ffa522',emissiveIntensity:1}),parent);refs.beacons.push(housing);};
 const decal=(text,size,position,parent=root,rotation=[0,0,0],hazard=false)=>{
  if(typeof document==='undefined'||typeof Image==='undefined')return;
  const bands=hazard?'<path d="M-30 0 30 0 90 100 30 100Zm100 0h60l60 100h-60Zm100 0h60l60 100h-60Zm100 0h60l60 100h-60Zm100 0h60l60 100h-60Z" fill="#17252c"/>':'';
  const markup=`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="128" viewBox="0 0 512 128"><rect width="512" height="128" rx="8" fill="${hazard?'#efba3a':'#16313b'}"/>${bands}<rect x="8" y="76" width="496" height="44" rx="4" fill="#16313b"/><text x="256" y="107" text-anchor="middle" fill="#e8f7ed" font-family="sans-serif" font-weight="700" font-size="26">${text}</text><path d="M18 25h30m-15-15v30" stroke="#e8f7ed" stroke-width="4"/></svg>`;
  const texture=new T.TextureLoader().load('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(markup));texture.colorSpace=T.SRGBColorSpace;
  const label=mesh(new T.PlaneGeometry(...size),new T.MeshBasicMaterial({map:texture,side:T.DoubleSide,transparent:true}),position,parent);label.rotation.set(...rotation);label.userData.collisionDisabled=true;label.name='CONSTRUCTION_SVG_SAFETY_DECAL';
 };
 const cab=(position,size=[1.8,1.9,1.9],parent=root)=>{
  const cabin=group('OPERATOR_CAB',position,parent),[w,h,d]=size;
  box([w,.16,d],[0,0,0],dark,cabin);const roof=box([w+.12,.14,d+.12],[0,h,0],paint,cabin);roof.name='CONSTRUCTION_CAB_ROOF';roof.userData.constructionCabRoof=true;
  for(const x of [-w/2,w/2])for(const z of [-d/2,d/2])tube([x,0,z],[x,h,z],.055,paint,cabin);
  for(const z of [-d/2,d/2]){const pane=box([w-.1,h-.15,.025],[0,h/2,z],glass,cabin);pane.name=z<0?'CONSTRUCTION_CAB_WINDSHIELD':'CONSTRUCTION_CAB_REAR_WINDOW';pane.userData.constructionCabGlass=true;}
  for(const x of [-w/2,w/2]){const pane=box([.025,h-.15,d-.1],[x,h/2,0],glass,cabin);pane.userData.constructionCabGlass=true;box([.035,.07,d],[x,h*.55,0],paint,cabin);box([.05,.025,.22],[x,h*.45,.15],chrome,cabin);}
  box([.65,.18,.65],[0,.45,.25],seatMat,cabin);box([.65,.75,.16],[0,.85,.52],seatMat,cabin);box([.3,.14,.2],[0,1.25,.55],seatMat,cabin);
  box([w-.2,.25,.36],[0,.8,-d*.32],dark,cabin);
  for(const x of [-.43,.43]){box([.22,.18,.65],[x,.62,.12],dark,cabin);const stick=group('OPERATOR_JOYSTICK',[x,.72,-.08],cabin);tube([0,0,0],[0,.28,-.1],.028,chrome,stick);box([.08,.12,.07],[0,.28,-.1],dark,stick);refs.joysticks.push({mesh:stick,side:Math.sign(x)});for(let i=0;i<3;i++)box([.028,.018,.03],[x-.06+i*.06,.72,.22],i===0?red:chrome,cabin);}
  const dash=box([.74,.36,.022],[0,1.01,-d*.32-.2],dark,cabin);dash.name='CONSTRUCTION_LIVE_DASHBOARD';
  refs.dash=dash;refs.dashes.push(dash);
  for(const z of [-d*.35,d*.35])box([w*.8,.09,.21],[0,-.3,z],steel,cabin);
  beacon([w*.4,h+.2,d*.3],cabin);return cabin;
 };
 const wheels=(positions,radius=.66,parent=root)=>{for(const [x,y,z]of positions){const wheel=group('CONSTRUCTION_WHEEL',[x,y,z],parent),tyre=cylinder(radius,.48,[0,0,0],rubber,wheel);tyre.rotation.z=Math.PI/2;for(const side of [-1,1]){const rim=cylinder(radius*.55,.04,[side*.255,0,0],paint,wheel);rim.rotation.z=Math.PI/2;for(let i=0;i<8;i++){const a=i*Math.PI/4,bolt=cylinder(.035,.055,[side*.29,Math.sin(a)*radius*.36,Math.cos(a)*radius*.36],chrome,wheel);bolt.rotation.z=Math.PI/2;}}for(let i=0;i<20;i++){const a=i*Math.PI/10,tread=box([.5,.08,.15],[0,Math.cos(a)*radius,Math.sin(a)*radius],rubber,wheel);tread.rotation.x=-a;}refs.wheels.push(wheel);}};
 const tracks=(length=4.5,width=3)=>{for(const sign of [-1,1]){const track=group('CRAWLER_TRACK',[sign*width*.39,.52,0]);box([.68,.67,length-.8],[0,0,0],rubber,track);for(const z of [-length/2+.42,length/2-.42]){const sprocket=cylinder(.49,.72,[0,0,z],steel,track);sprocket.rotation.z=Math.PI/2;}for(let j=0;j<6;j++){const roller=cylinder(.25,.74,[0,-.1,-length*.33+j*length*.132],dark,track);roller.rotation.z=Math.PI/2;}const shoes=[];for(let j=0;j<22;j++){const z=-length/2+j*length/21;for(const y of [-.49,.49]){const shoe=box([.8,.075,.19],[0,y,z],steel,track);shoes.push(shoe);}}refs.tracks.push({track,shoes,length});}};
 if(id==='construction-steel-beam'){
  const rust=new T.MeshStandardMaterial({color:'#8b4c35',metalness:.72,roughness:.6});
  box([18,.075,.44],[0,.038,0],rust);box([18,.075,.44],[0,.563,0],rust);box([18,.45,.045],[0,.3,0],rust);
  for(const x of [-8.7,0,8.7]){box([.12,.45,.37],[x,.3,0],steel);for(const z of [-.15,.15])for(const y of [.13,.47])mesh(new T.SphereGeometry(.025,6,4),chrome,[x+.07,y,z]);}
  for(const x of [-4,4]){const ring=mesh(new T.TorusGeometry(.075,.02,6,16),steel,[x,.65,0]);ring.rotation.y=Math.PI/2;}
  decal('S355 STEEL · 18 M · LIFT POINTS',[2,.5],[0,.3,.235]);
 }else if(id==='tower-crane'){
  for(const x of [-2.2,2.2])for(const z of [-2.2,2.2]){box([2,.6,2],[x,.3,z],steel);tube([x,.7,z],[x*.5,5,z*.5],.18);}
  box([5,.45,5],[0,.85,0],dark);
  for(const x of [-1.1,1.1])for(const z of [-1.1,1.1])tube([x,1,z],[x,78,z],.14,paint);
  for(let y=1;y<78;y+=3)for(const side of [-1,1]){tube([-1.1,y,side*1.1],[1.1,y,side*1.1],.075,paint);tube([side*1.1,y,-1.1],[side*1.1,y,1.1],.075,paint);tube([-1.1,y,side*1.1],[1.1,Math.min(78,y+3),side*1.1],.065,paint);tube([side*1.1,y,-1.1],[side*1.1,Math.min(78,y+3),1.1],.065,paint);}
  for(let y=1;y<77;y+=.45)tube([.6,y,1.2],[1,y,1.2],.018,steel);
  const slewing=cylinder(1.8,.7,[0,77.5,0],dark);slewing.name='CRANE_SLEW_BEARING';
  const jib=group('CRANE_SLEW',[0,78,0]);refs.slew=jib;
  for(const z of [-14,46])for(const x of [-.75,.75])tube([x,0,0],[x,0,z],.11,paint,jib);
  tube([0,1.7,-14],[0,1.7,46],.095,paint,jib);
  for(let z=-14;z<46;z+=2){tube([-.75,0,z],[.75,0,z],.065,paint,jib);for(const x of [-.75,.75]){tube([x,0,z],[0,1.7,z+2],.055,paint,jib);tube([x,0,z+2],[0,1.7,z],.055,paint,jib);}}
  tube([0,0,0],[0,6,0],.15,paint,jib);for(const z of [-13,36])for(const x of [-.7,.7])tube([0,6,0],[x,.3,z],.045,steel,jib);
  for(let i=0;i<5;i++)box([2.3,1.9,.9],[0,-.6,-9.5-i*.9],steel,jib);
  box([2.4,.25,3],[1.75,-.5,1.8],steel,jib);const serviceCab=cab([1.7,-2.2,1.5],[1.7,1.9,2.1],jib);serviceCab.name='CRANE_SERVICE_CAB';
  const trolley=group('CRANE_TROLLEY',[0,-.18,22],jib);refs.trolley=trolley;box([1.8,.35,1.2],[0,0,0],dark,trolley);
  for(const x of [-.8,.8])for(const z of [-.4,.4]){const pulley=cylinder(.21,.12,[x,.05,z],steel,trolley);pulley.rotation.z=Math.PI/2;}
  const cable=group('CRANE_WIRE_ROPE',[0,0,0],trolley);refs.cable=cable;for(const x of [-.2,.2])cylinder(.022,1,[x,-.5,0],dark,cable);
  const hook=group('CRANE_HOOK_BLOCK',[0,-77,0],trolley);refs.hook=hook;box([.8,.65,.45],[0,.15,0],paint,hook);for(const x of [-.28,.28]){const pulley=cylinder(.22,.05,[x,.15,0],steel,hook);pulley.rotation.z=Math.PI/2;}const hookShape=mesh(new T.TorusGeometry(.22,.065,8,20,Math.PI*1.55),steel,[0,-.35,0],hook);hookShape.rotation.z=.25;
  const slingFrame=group('CRANE_LOAD_SLINGS',[0,0,0],hook);refs.slingFrame=slingFrame;for(const side of [-1,1])refs.slings.push({side,part:cylinder(.035,1,[0,0,0],steel,slingFrame)});
  decal('TITAN 78 · 12 TONNE',[1.8,.55],[0,.2,.24],hook,[0,0,0],true);
  const controlCab=cab([3.4,.7,3.2],[1.85,1.85,2]);controlCab.name='CRANE_GROUND_CONTROL_STATION';
  decal('TITAN 78 · REMOTE CONTROL',[1.8,.5],[3.4,1.15,2.18]);
  for(const x of [-1.4,1.4])for(const z of [-1.4,1.4])beacon([x,79,z]);
 }else if(id==='site-dumptruck'){
  const front=group('TRUCK_ARTICULATED_FRONT',[0,0,-.6]);refs.front=front;
  wheels([-1,1].flatMap(sign=>[1.5,3].map(z=>[sign*1.42,.74,z])),.72);wheels([-1,1].map(sign=>[sign*1.42,.74,-2.2]),.72,front);
  box([2.65,.5,4.7],[0,1.05,1.8],dark);box([2.65,.5,3.4],[0,1.05,-1.7],dark,front);box([2.8,.65,1.4],[0,1.4,-2.65],paint,front);
  cab([-.48,1.35,-1.65],[1.9,2,2],front);box([.8,1.2,2],[1,1.9,-1.65],paint,front);cylinder(.24,.8,[0,1.05,-.6],chrome);for(const x of [-.9,.9])hydraulic([x,1.05,.4],{point:[x,1.05,-.7],frame:front});
  const wheel=mesh(new T.TorusGeometry(.22,.027,8,22),dark,[-.48,2.28,-2.17],front);wheel.rotation.x=-.3;refs.steeringWheel=wheel;
  for(let i=0;i<7;i++)box([.045,.6,.06],[.73+i*.09,1.9,-2.7],dark,front);
  for(const x of [-1.3,1.3]){box([.45,.18,.12],[x,1.4,-3.4],new T.MeshStandardMaterial({color:'#e6f7ff',emissive:'#e6f7ff',emissiveIntensity:.8}),front);tube([x,1.6,-2.2],[x*1.3,2.6,-2.2],.035,steel,front);box([.3,.45,.1],[x*1.3,2.6,-2.2],chrome,front);}
  const bed=group('DUMP_BED_HINGE',[0,1.5,3.7]);refs.bed=bed;
  box([2.9,.2,5.1],[0,.1,-2.3],paint,bed);for(const x of [-1.5,1.5]){box([.16,1.1,5.2],[x,.6,-2.3],paint,bed);for(let z=-4.4;z<.3;z+=.8)box([.1,1.15,.12],[x*1.06,.6,z],steel,bed);}
  box([3,.9,.15],[0,.55,-4.9],paint,bed);const tailgate=group('DUMP_TAILGATE',[0,1,.2],bed);box([2.9,.9,.13],[0,-.45,0],paint,tailgate);refs.tailgate=tailgate;pin([0,0,0],tailgate,.09,3.1);pin([0,0,0],bed,.13,3.3);
  const load=box([2.65,.6,4.7],[0,.5,-2.3],soil,bed);refs.load=load;
  hydraulic([-.7,1.1,-.5],{point:[-.7,.2,-2.5],frame:bed});
  hydraulic([.7,1.1,-.5],{point:[.7,.2,-2.5],frame:bed});
  decal('TERRA 40 · HAUL DIVISION',[2.4,.55],[0,-.45,.075],tailgate,[0,0,0],true);
  for(const sign of [-1,1])decal('TERRA 40',[2.5,.6],[sign*1.59,2.15,1.2],root,[0,sign*Math.PI/2,0]);
 }else if(id==='site-bulldozer'){
  tracks(4.7,3.1);box([2.3,.6,3.7],[0,1,0],dark);box([1.7,.65,1.8],[0,1.5,-1.1]);
  cab([0,1.25,.55],[1.75,1.6,1.8]);for(const x of [-1,1])for(let z=-2;z<-.4;z+=.22)box([.035,.35,.09],[x,1.55,z],dark);
  tube([.65,1.7,-1.15],[.65,3.2,-1.15],.075,dark);cylinder(.12,.16,[.65,3.25,-1.15],dark);
  const blade=group('DOZER_BLADE',[0,.38,-3]);refs.blade=blade;
  box([4.2,1.1,.35],[0,.2,0],paint,blade);box([4.35,.16,.5],[0,-.37,-.12],steel,blade);for(const x of [-2,2])box([.18,1.1,.65],[x,.2,.1],paint,blade);
  for(const x of [-1.25,1.25]){linkage([x,.8,1],{point:[x,.07,.2],frame:blade},.13);pin([x,.8,1],root,.15,.3);pin([x,.07,.2],blade,.14,.32);hydraulic([x,1.5,-1.1],{point:[x,.27,.2],frame:blade});}
  decal('D9 · EARTHWORKS',[1.7,.5],[0,1.55,-2.03]);decal('KEEP CLEAR',[2.5,.45],[0,.17,-.31],blade,[0,Math.PI,0],true);
 }else if(id==='site-excavator'){
  tracks(4.5,3.2);box([2.7,.5,3.5],[0,1.05,0],dark);cylinder(1.1,.25,[0,1.4,0],steel);
  const house=group('EXCAVATOR_SWING',[0,1.5,0]);refs.swing=house;box([2.7,.65,2.9],[0,.28,.1],paint,house);cab([-.78,.4,-.2],[1.25,1.7,1.85],house);
  box([1.25,1.1,2],[.72,.63,.2],paint,house);box([2.65,1.1,.7],[0,.63,1.65],paint,house);for(let i=0;i<8;i++)box([.055,.5,.035],[.28+i*.13,.8,2.02],dark,house);
  const boom=group('EXCAVATOR_BOOM',[.7,.5,-1],house);refs.boom=boom;
  for(const x of [-.24,.24])box([.2,3.8,.5],[x,1.9,0],paint,boom);pin([0,0,0],boom,.18,.9);pin([0,3.8,0],boom,.16,.9);
  const stick=group('EXCAVATOR_STICK',[0,3.8,0],boom);refs.stick=stick;box([.48,2.8,.42],[0,1.4,0],paint,stick);pin([0,2.8,0],stick,.14,.9);
  const bucket=group('EXCAVATOR_BUCKET',[0,2.8,0],stick);refs.bucket=bucket;box([1.15,.8,.4],[0,.25,.18],dark,bucket);box([1.15,.13,1.1],[0,-.15,-.25],steel,bucket);for(const x of [-.58,.58])box([.1,.75,1.1],[x,.15,-.25],paint,bucket);for(const x of [-.45,-.15,.15,.45])box([.13,.17,.5],[x,-.16,-.95],steel,bucket);
  refs.load=box([.9,.35,.7],[0,.08,-.35],soil,bucket);for(const x of [-.4,.4]){linkage([x,2.35,-.18],{point:[x,.35,-.12],frame:bucket},.055,stick);pin([x,.35,-.12],bucket,.07,.17);}
  hydraulic([.7,.5,-.2],{point:[0,2.8,.22],frame:boom},house);
  hydraulic([0,1.6,.25],{point:[0,1.4,.18],frame:stick},boom);
  hydraulic([0,1.45,.24],{point:[0,.3,.3],frame:bucket},stick);
  decal('HX350 · HYDRAULIC',[1.8,.45],[0,.9,2.025],house,[0,0,0],true);beacon([1.1,1.4,1.3],house);
 }
 // Walking and placement consume these same rigid boxes as the server. Hiding
 // their materials keeps the detailed artwork visible without turning gaps in
 // the mast, cab or tracks into client-only passages.
 const colliderGeometry=new T.BoxGeometry(1,1,1),colliderMaterial=new T.MeshBasicMaterial({visible:false,side:T.DoubleSide});
 for(const box of constructionKinematics({modelId:id}).boxes){const collider=new T.Mesh(colliderGeometry,colliderMaterial);collider.name='CONSTRUCTION_COLLIDER_'+box.part;collider.matrixAutoUpdate=false;collider.userData={collider:true,collisionOnly:true,constructionCollider:true,constructionPart:box.part};collider.castShadow=collider.receiveShadow=false;root.add(collider);refs.colliders.push(collider);}
 root.traverse(part=>{if(part.isMesh)part.userData.builderRoot=root;});updateConstructionModel(root,0);return finishVehicleDesign(T,finishGameItem(T,root),id);
}

export function updateConstructionModel(root,elapsed=0){
 const parts=root.userData.constructionParts;if(!parts)return;
 const state=root.userData.construction||{},driving=root.userData.driving||{},id=root.userData.modelId;
 let drive=driveAnimations.get(root);if(!drive){drive={last:elapsed,wheel:0,tracks:[0,0]};driveAnimations.set(root,drive);}const delta=Math.max(0,Math.min(.1,elapsed-drive.last));drive.last=elapsed;drive.wheel+=finiteNumber(driving.speed)*delta/.72;for(const wheel of parts.wheels)wheel.rotation.x=drive.wheel;
 for(let index=0;index<parts.tracks.length;index++){const track=parts.tracks[index].track,turn=driving.blocked?0:-finiteNumber(driving.steering)*(ROAD_VEHICLES[id]?.turn||0)*Math.sign(finiteNumber(driving.speed)||1);drive.tracks[index]+=(finiteNumber(driving.speed)+turn*track.position.x)*delta;}
 for(const [trackIndex,{shoes,length}]of parts.tracks.entries()){const r=.49,straight=length-2*r,perimeter=straight*2+Math.PI*r*2;for(let i=0;i<shoes.length;i++){let travel=((i/shoes.length*perimeter+drive.tracks[trackIndex])%perimeter+perimeter)%perimeter,y,z,angle=0;if(travel<straight){y=r;z=-straight/2+travel;}else if((travel-=straight)<Math.PI*r){const a=Math.PI/2-travel/r;y=Math.sin(a)*r;z=straight/2+Math.cos(a)*r;angle=-(Math.PI/2-a);}else if((travel-=Math.PI*r)<straight){y=-r;z=straight/2-travel;}else{travel-=straight;const a=-Math.PI/2-travel/r;y=Math.sin(a)*r;z=-straight/2+Math.cos(a)*r;angle=-(Math.PI/2-a);}shoes[i].position.set(0,y,z);shoes[i].rotation.x=angle;}}
 for(const beacon of parts.beacons)beacon.material.emissiveIntensity=state.engine===false?.1:.45+Math.max(0,Math.sin(elapsed*6))*1.6;
 const pose=constructionKinematics({modelId:id,construction:state,driving});
 for(let index=0;index<parts.colliders.length;index++){const collider=parts.colliders[index],box=pose.boxes[index];collider.visible=!!box;if(box){collider.matrix.fromArray(box.matrix).scale(new T.Vector3(...box.size));collider.matrixWorldNeedsUpdate=true;}}
 for(const [name,part]of Object.entries({slew:parts.slew,trolley:parts.trolley,hook:parts.hook,front:parts.front,bed:parts.bed,tailgate:parts.tailgate,blade:parts.blade,swing:parts.swing,boom:parts.boom,stick:parts.stick,bucket:parts.bucket})){const frame=pose.nodes[name];if(part&&frame){part.position.set(...frame.position);part.rotation.set(...frame.rotation);}}
 if(parts.cable)parts.cable.scale.y=77.82-clamp(state.hoist,.8,74,.8);
 if(parts.steeringWheel)parts.steeringWheel.rotation.z=-finiteNumber(driving.steering)*.6;
 if(parts.load){const cargo=state.cargo||state.telemetry?.cargo||{},soilVolume=finiteNumber(cargo.soil),gravelVolume=finiteNumber(cargo.gravel),total=soilVolume+gravelVolume,capacity=finiteNumber(state.telemetry?.loadCapacity)||(id==='site-dumptruck'?40:2),fill=Math.max(.04,Math.min(1,finiteNumber(state.load)/capacity));parts.load.visible=finiteNumber(state.load)>.01;if(!localCargoMaterials.has(parts.load)){parts.load.material=parts.load.material.clone();localCargoMaterials.add(parts.load);}parts.load.material.color.set('#795332').lerp(new T.Color('#9a9f98'),total>0?gravelVolume/total:0);parts.load.scale.y=fill;parts.load.position.y=id==='site-dumptruck'?.2+.3*fill:-.095+.175*fill;root.userData.constructionPayload=total>0?(gravelVolume>soilVolume?'gravel':'soil'):null;}
 const axes=state.axes||{};for(const {mesh,side}of parts.joysticks){const x=id==='tower-crane'?(side<0?axes.slew:axes.loadYaw):id==='site-excavator'?(side<0?axes.slew:axes.bucket):side<0?driving.steering:0,y=id==='tower-crane'?(side<0?axes.trolley:axes.hoist):id==='site-excavator'?(side<0?axes.stick:axes.boom):id==='site-dumptruck'?axes.bed:axes.blade;const forwardExtension=(id==='tower-crane'||id==='site-excavator')&&side<0;mesh.rotation.x=(forwardExtension?-1:1)*finiteNumber(y)*.23;mesh.rotation.z=-finiteNumber(x)*.23;}
 root.updateMatrixWorld(true);
 const jointPoint=value=>Array.isArray(value)?new T.Vector3(...value):new T.Vector3(...value.point).applyMatrix4(value.frame.matrix);
 for(const link of parts.links){const a=jointPoint(link.a),b=jointPoint(link.b),delta=b.clone().sub(a),length=delta.length();link.part.position.copy(a).add(b).multiplyScalar(.5);link.part.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());link.part.scale.y=length;}
 for(const ram of parts.hydraulics){const a=jointPoint(ram.a),b=jointPoint(ram.b),delta=b.clone().sub(a),length=Math.max(.001,delta.length());ram.assembly.position.copy(a);ram.assembly.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());ram.body.scale.y=length*.58;ram.body.position.y=length*.29;ram.rod.scale.y=length*.58;ram.rod.position.y=length*.71;ram.eyeB.position.y=length;ram.hose.scale.y=length;}
 root.updateMatrixWorld(true);
 if(parts.slingFrame){parts.slingFrame.visible=!!state.load;const hook=parts.hook.getWorldPosition(new T.Vector3()),yaw=finiteNumber(state.loadYaw);for(const {side,part}of parts.slings){const a=new T.Vector3(0,-.4,0),b=parts.slingFrame.worldToLocal(new T.Vector3(hook.x+Math.cos(yaw)*side*4,hook.y-CONSTRUCTION_LOAD_OFFSET+.65,hook.z-Math.sin(yaw)*side*4)),direction=b.clone().sub(a);part.position.copy(a).add(b).multiplyScalar(.5);part.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),direction.clone().normalize());part.scale.y=direction.length();}parts.slingFrame.updateMatrixWorld(true);}
 let dash=dashboards.get(root);if(!dash&&parts.dash&&typeof document!=='undefined'){const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const ctx=canvas.getContext('2d');if(ctx){const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;for(const screen of parts.dashes||[parts.dash])screen.material=new T.MeshBasicMaterial({map:texture});dash={canvas,ctx,texture,key:''};dashboards.set(root,dash);}}
 if(dash){const speed=Math.abs(finiteNumber(driving.speed))*3.6,metrics=id==='tower-crane'?[['HOOK',clamp(state.hoist,.8,74,.8).toFixed(1)+' m'],['RADIUS',clamp(state.trolley,4,42,21.47).toFixed(1)+' m'],['SLEW',Math.round(finiteNumber(state.slew)*180/Math.PI)+'°'],['HOOK LOAD',state.load?'STEEL':'CLEAR']]:id==='site-dumptruck'?[['ROAD SPEED',speed.toFixed(1)+' km/h'],['DUMP BODY',Math.round(finiteNumber(state.bed)*180/Math.PI)+'°'],['PAYLOAD',finiteNumber(state.load).toFixed(1)+' m³'],['STEERING',Math.round(finiteNumber(driving.steering)*35)+'%']]:id==='site-excavator'?[['BOOM',Math.round(finiteNumber(state.boom)*180/Math.PI)+'°'],['STICK',Math.round(finiteNumber(state.stick)*180/Math.PI)+'°'],['BUCKET',Math.round(finiteNumber(state.bucket)*180/Math.PI)+'°'],['BUCKET LOAD',finiteNumber(state.load).toFixed(1)+' m³']]:[['ROAD SPEED',speed.toFixed(1)+' km/h'],['BLADE LIFT',finiteNumber(state.blade).toFixed(2)+' m'],['TRACK INPUT',Math.round(finiteNumber(driving.throttle)*100)+'%'],['STEERING',Math.round(finiteNumber(driving.steering)*100)+'%']];
  const inputNames=id==='tower-crane'?['slew','trolley','hoist','loadYaw']:id==='site-excavator'?['slew','boom','stick','bucket']:id==='site-dumptruck'?['bed']:['blade'],status=driving.blocked?'MOTION BLOCKED':state.blocked?'IMPLEMENT BLOCKED':state.workCycle?'CYCLE: '+state.workCycle.mode:state.assist?'ALIGN: '+state.assist:driving.parked?'PARK BRAKE':state.precision?'PRECISION CONTROL':'MANUAL CONTROL',key=JSON.stringify([metrics,status,inputNames.map(name=>Math.round(finiteNumber(axes[name])*100))]);
  if(key!==dash.key){dash.key=key;const ctx=dash.ctx;ctx.fillStyle='#0d252d';ctx.fillRect(0,0,512,256);ctx.fillStyle='#eab94a';ctx.font='bold 18px sans-serif';ctx.fillText(id==='tower-crane'?'TITAN · LIFT MANAGEMENT':id==='site-excavator'?'HX350 · IMPLEMENT MONITOR':'MUZIKAZ · MACHINE MONITOR',14,26);
   for(let index=0;index<metrics.length;index++){const x=14+index%2*248,y=43+Math.floor(index/2)*66;ctx.fillStyle='#173640';ctx.fillRect(x,y,236,59);ctx.fillStyle='#84b9b9';ctx.font='12px sans-serif';ctx.fillText(metrics[index][0],x+9,y+17);ctx.fillStyle='#e2faec';ctx.font='bold 25px monospace';ctx.fillText(metrics[index][1],x+9,y+46);}
   const slot=484/inputNames.length;for(let i=0;i<inputNames.length;i++){const x=14+i*slot,value=finiteNumber(axes[inputNames[i]]);ctx.fillStyle='#6b999f';ctx.font='10px sans-serif';ctx.fillText(inputNames[i].toUpperCase()+' '+Math.round(value*100)+'%',x,191);ctx.fillStyle='#38545a';ctx.fillRect(x,199,slot-12,8);ctx.fillStyle='#eab94a';ctx.fillRect(x+(slot-12)/2,199,value*(slot-12)/2,8);}
   ctx.fillStyle=status.includes('BLOCKED')?'#f59b66':'#a8d4c5';ctx.font='bold 16px monospace';ctx.fillText(status.toUpperCase(),14,239);dash.texture.needsUpdate=true;}}
}
