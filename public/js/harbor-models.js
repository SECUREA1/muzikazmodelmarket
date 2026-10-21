import * as THREE from '../vendor/three/three.module.min.js';

export const HARBOR_HELM_POSES=Object.freeze({
 'harbor-skiff':Object.freeze({position:Object.freeze([.30,1.43,1.12]),lookForward:Object.freeze([0,0,-1]),near:.025,fov:74}),
 'harbor-sailboat':Object.freeze({position:Object.freeze([.27,1.43,1.98]),lookForward:Object.freeze([0,0,-1]),near:.025,fov:74})
});
const material=(color,roughness=.55,metalness=.15,extra={})=>new THREE.MeshStandardMaterial({color,roughness,metalness,...extra});
const part=(geometry,mat,position=[0,0,0],rotation=[0,0,0])=>{const mesh=new THREE.Mesh(geometry,mat);mesh.position.set(...position);mesh.rotation.set(...rotation);mesh.castShadow=mesh.receiveShadow=true;return mesh;};
function cosmetic(object){object.traverse(node=>{node.userData.collisionDisabled=true;node.userData.collider=false;});return object;}
function tube(parent,a,b,radius,mat,name='MARINE_DETAIL'){
 const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start),mesh=part(new THREE.CylinderGeometry(radius,radius,delta.length(),8),mat,start.add(end).multiplyScalar(.5).toArray());mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());mesh.name=name;parent.add(mesh);return mesh;
}
function hullGeometry(){
 const rings=[[-2.35,.018,-.17],[-2.10,.36,-.31],[-1.55,.73,-.395],[-.8,.91,-.42],[.2,.96,-.42],[1.1,.88,-.36],[1.95,.70,-.22]],positions=[],indices=[],profile=[[-1,.36],[-1,.19],[-.94,-.04],[-.75,-.25],[-.36,-.39],[0,-.42],[.36,-.39],[.75,-.25],[.94,-.04],[1,.19],[1,.36]];
 for(const [z,width,keel]of rings)for(const [x,y]of profile)positions.push(x*width,y<0?y/-.42*keel:y,z);
 const count=profile.length;for(let ring=0;ring<rings.length-1;ring++)for(let segment=0;segment<count-1;segment++){const a=ring*count+segment,b=a+count;indices.push(a,b,a+1,b,b+1,a+1);}
 for(const offset of [0,(rings.length-1)*count])for(let j=1;j<count-1;j++)indices.push(offset,offset+j,offset+j+1);
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
function deckGeometry(sailboat){
 const shape=new THREE.Shape();shape.moveTo(0,2.35);shape.bezierCurveTo(.35,2.17,.89,1.26,.96,-.2);shape.bezierCurveTo(.96,-.8,.84,-1.65,.70,-1.95);shape.lineTo(-.70,-1.95);shape.bezierCurveTo(-.84,-1.65,-.96,-.8,-.96,-.2);shape.bezierCurveTo(-.89,1.26,-.35,2.17,0,2.35);shape.closePath();
 const front=sailboat?.20:-.65,rear=1.57,hole=new THREE.Path();hole.moveTo(-.64,-front);hole.lineTo(-.64,-rear);hole.lineTo(.64,-rear);hole.lineTo(.64,-front);hole.closePath();shape.holes.push(hole);const geometry=new THREE.ShapeGeometry(shape,18);geometry.rotateX(-Math.PI/2);return geometry;
}
function gauge(parent,x,y,z,r,kind,mats,needles){
 const face=part(new THREE.CircleGeometry(r,24),mats.black,[x,y,z]);face.name='MARINE_INSTRUMENT_'+kind.toUpperCase();parent.add(face,part(new THREE.TorusGeometry(r,.007,5,24),mats.chrome,[x,y,z+.005]));
 for(let i=0;i<10;i++){const angle=i/10*Math.PI*2;parent.add(part(new THREE.BoxGeometry(.005,i%2?.01:.016,.003),mats.white,[x+Math.sin(angle)*r*.75,y+Math.cos(angle)*r*.75,z+.009],[0,0,-angle]));}
 const needle=new THREE.Group();needle.position.set(x,y,z+.014);needle.userData.instrument=kind;needle.add(part(new THREE.BoxGeometry(.007,r*.65,.004),mats.orange,[0,r*.24,0]));parent.add(needle);needles.push(needle);
}
function sailGeometry(front,top,rear){
 const positions=[],indices=[],segments=14;
 for(let i=0;i<=segments;i++){const t=i/segments,y=front[1]+(top[1]-front[1])*t,width=(1-t)*(rear[2]-front[2]);for(let j=0;j<=6;j++){const u=j/6;positions.push(Math.sin(Math.PI*u)*Math.sin(Math.PI*(1-t)*.8)*.12,y,front[2]+(top[2]-front[2])*t+width*u);}}
 for(let i=0;i<segments;i++)for(let j=0;j<6;j++){const a=i*7+j,b=a+7;indices.push(a,b,a+1,b,b+1,a+1);}const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
export function createHarborBoat(id){
 const sailboat=id==='harbor-sailboat',root=new THREE.Group();root.name=sailboat?'SEA_GLASS_COASTAL_SLOOP':'NEON_MARINA_SPORT_LAUNCH';
 const navy=material(0x123e51,.37,.37,{side:THREE.DoubleSide}),ivory=material(0xe2e5d8,.46,.12,{side:THREE.DoubleSide}),teak=material(0xa17d56,.88,.03),seam=material(0x4e4334,.95,.01),chrome=material(0xa7b8bf,.24,.78),black=material(0x17242b,.73,.12),cushion=material(0xc7d0c9,.88,.02),orange=material(0xefad66,.46,.1),white=material(0xeaf4ee,.65,.05),glass=material(0x9bcbd7,.14,.08,{transparent:true,opacity:.18,side:THREE.DoubleSide,depthWrite:false});
 const detail=new THREE.Group();detail.name='MARINE_FITTINGS';const needles=[];const add=(mesh,name,parent=root)=>{mesh.name=name;parent.add(mesh);return mesh;};const box=(name,size,position,mat,parent=root)=>add(part(new THREE.BoxGeometry(...size),mat,position),name,parent);
 add(part(hullGeometry(),sailboat?ivory:navy),'SHAPED_DEEP_V_HULL');add(part(deckGeometry(sailboat),ivory,[0,.36,0]),'OPEN_COAMING_DECK');
 box('COCKPIT_TEAK_SOLE',[1.27,.10,sailboat?1.35:2.16],[0,.19,sailboat?.91:.43],teak);
 for(let i=-5;i<=5;i++)box('TEAK_PLANK_SEAM',[.008,.003,sailboat?1.32:2.13],[i*.105,.242,sailboat?.91:.43],seam,detail);
 box('BOW_WINDLASS',[.18,.065,.16],[0,.41,-1.94],chrome,detail);tube(detail,[0,.40,-2.01],[0,.16,-2.28],.016,chrome,'ANCHOR_ROLLER');tube(detail,[-.10,.08,-2.24],[0,.16,-2.28],.018,chrome,'ANCHOR_FLUKE');tube(detail,[.10,.08,-2.24],[0,.16,-2.28],.018,chrome,'ANCHOR_FLUKE');
 for(const side of [-1,1]){
  const line=new THREE.CatmullRomCurve3([new THREE.Vector3(0,.015,-2.32),new THREE.Vector3(side*.60,.015,-1.77),new THREE.Vector3(side*.91,.015,-.6),new THREE.Vector3(side*.92,.015,.5),new THREE.Vector3(side*.70,.015,1.94)]);add(part(new THREE.TubeGeometry(line,36,.012,5,false),sailboat?navy:ivory),'WATERLINE_BOOT_STRIPE',detail);
  box('PADDED_COCKPIT_COAMING',[.11,.18,sailboat?1.36:2.10],[side*.69,.47,sailboat?.9:.43],cushion,detail);
  for(const z of [-1.45,.35,1.65]){tube(detail,[side*(z<0?.73:.80),.37,z],[side*(z<0?.73:.80),.76,z],.016,chrome,'GUARDRAIL_STANCHION');const fender=part(new THREE.CapsuleGeometry(.075,.24,5,10),cushion,[side*.91,.16,z]);fender.name='DOCK_FENDER';detail.add(fender);}
  tube(detail,[side*.73,.77,-1.45],[side*.80,.77,1.65],.014,chrome,'SIDE_GUARDRAIL');
  for(const z of [-1.72,1.7]){const x=side*(z<0?.5:.61);box('MOORING_CLEAT_BASE',[.16,.025,.055],[x,.388,z],chrome,detail);tube(detail,[x-.09,.42,z],[x+.09,.42,z],.017,chrome,'MOORING_CLEAT');}
  const nav=material(side<0?0xd84a43:0x44bc82,.27,.1,{emissive:side<0?0x802821:0x145f3b,emissiveIntensity:.9});box(side<0?'NAV_LIGHT_PORT':'NAV_LIGHT_STARBOARD',[.065,.055,.10],[side*.87,.43,-.95],nav,detail);
 }
 const console=new THREE.Group();console.name='MARINE_HELM_CONSOLE';console.position.set(sailboat?.27:.30,0,sailboat?.73:-.05);box('HELM_PEDESTAL',[.48,.62,.33],[0,.63,0],black,console);box('HELM_DASHBOARD',[.61,.21,.08],[0,.94,.175],navy,console);
 const mats={black,chrome,white,orange};gauge(console,-.17,.955,.224,.065,'speed',mats,needles);gauge(console,0,.955,.224,.065,'rpm',mats,needles);gauge(console,.17,.955,.224,.065,'heading',mats,needles);
 const display=material(0x58b6ad,.5,.12,{emissive:0x1b6c62,emissiveIntensity:.5});box('HELM_CHART_DISPLAY',[.15,.07,.008],[0,.84,.225],display,console);for(let i=0;i<3;i++)box('CHART_COURSE_LINE',[.10-i*.02,.003,.004],[-.01+i*.01,.825+i*.018,.231],white,console);
 const wheel=new THREE.Group();wheel.name='HELM_STEERING_WHEEL';wheel.position.set(0,.75,.29);wheel.add(part(new THREE.TorusGeometry(.17,.018,8,32),chrome));for(let i=0;i<5;i++){const angle=i/5*Math.PI*2;tube(wheel,[0,0,0],[Math.sin(angle)*.16,Math.cos(angle)*.16,0],.009,chrome,'WHEEL_SPOKE');}wheel.add(part(new THREE.CylinderGeometry(.034,.034,.055,12),black,[0,0,0],[Math.PI/2,0,0]));console.add(wheel);detail.add(console);
 const throttle=new THREE.Group();throttle.name='ENGINE_THROTTLE_LEVER';throttle.position.set(sailboat?.67:.66,.66,sailboat?.93:.19);tube(throttle,[0,0,0],[0,.15,-.04],.014,chrome);throttle.add(part(new THREE.SphereGeometry(.035,10,8),orange,[0,.15,-.04]));detail.add(throttle);
 box('HELM_SEAT_CUSHION',[.51,.14,.43],[sailboat?.27:.30,.57,sailboat?1.33:.81],cushion,detail);box('HELM_SEAT_BACK',[.53,.39,.11],[sailboat?.27:.30,.80,sailboat?1.57:1.02],cushion,detail);
 let propeller=null,rudder=null,boom=null,sail=null;
 if(sailboat){
  const cabin=new THREE.Group();cabin.name='OPEN_COMPANIONWAY_CABIN';for(const side of [-1,1]){box('CABIN_SIDE',[.07,.45,1.72],[side*.565,.58,-.69],ivory,cabin);box('CABIN_PORTLIGHT',[.012,.20,.58],[side*.609,.65,-.71],glass,detail);box('COMPANIONWAY_POST',[.23,.45,.09],[side*.43,.58,.20],ivory,cabin);}
  box('CABIN_FORE_BULKHEAD',[1.12,.44,.08],[0,.58,-1.54],ivory,cabin);box('LOW_CABIN_ROOF',[1.18,.075,1.8],[0,.85,-.68],ivory,cabin);box('COMPANIONWAY_STEP',[.58,.085,.26],[0,.28,.23],teak,cabin);box('CABIN_TEAK_FLOOR',[1.03,.06,1.63],[0,.33,-.68],teak,cabin);root.add(cabin);
  tube(detail,[0,.88,-.68],[0,5.15,-.68],.035,chrome,'ALUMINIUM_MAST');tube(detail,[0,5.06,-.68],[0,.39,-2.19],.006,chrome,'FORESTAY');for(const side of [-1,1])tube(detail,[0,4.68,-.68],[side*.79,.40,.15],.006,chrome,'SHROUD_RIGGING');
  boom=new THREE.Group();boom.name='TRIMMABLE_MAIN_BOOM';boom.position.set(0,1.88,-.68);tube(boom,[0,0,0],[0,0,1.9],.022,chrome,'MAIN_BOOM');sail=part(sailGeometry([0,0,0],[0,3.0,0],[0,0,1.85]),material(0xe7f0dd,.88,.01,{side:THREE.DoubleSide}),[0,0,0]);sail.name='CAMBERED_MAINSAIL';boom.add(sail);const numberStripe=part(new THREE.BoxGeometry(.008,.10,.65),navy,[.08,2.10,.30]);boom.add(numberStripe);detail.add(boom);
  const jib=part(sailGeometry([0,.5,-2.14],[0,4.90,-.68],[0,.5,-.68]),material(0x9bcfc8,.88,.01,{side:THREE.DoubleSide}));jib.name='CAMBERED_HEADSAIL';detail.add(jib);
  rudder=new THREE.Group();rudder.name='SAILBOAT_RUDDER';rudder.position.set(0,-.18,1.98);box('RUDDER_BLADE',[.055,.41,.28],[0,-.03,0],navy,rudder);root.add(rudder);
 }else{
  box('BOW_SEAT_CUSHION',[.95,.15,.46],[0,.52,-1.29],cushion,detail);box('BOW_SEAT_BACKREST',[1.06,.26,.10],[0,.68,-1.55],cushion,detail);
  const screen=new THREE.Group();screen.name='FRAMED_HELM_WINDSCREEN';const screenGlass=part(new THREE.PlaneGeometry(1.25,.48),glass,[0,1.24,-.39],[.12,0,0]);screen.add(screenGlass);for(const side of [-1,1]){tube(screen,[side*.63,1.00,-.36],[side*.63,1.5,-.42],.018,chrome,'WINDSCREEN_PILLAR');tube(screen,[side*.63,1.5,-.42],[0,1.5,-.42],.018,chrome,'WINDSCREEN_FRAME');}tube(screen,[0,1.0,-.36],[0,1.5,-.42],.012,chrome,'WINDSCREEN_CENTRE');detail.add(screen);
  rudder=new THREE.Group();rudder.name='STEERABLE_OUTBOARD';rudder.position.set(0,.02,2.0);box('OUTBOARD_COWLING',[.46,.40,.31],[0,.47,.11],navy,rudder);box('OUTBOARD_SILVER_BAND',[.467,.055,.317],[0,.52,.11],chrome,rudder);box('OUTBOARD_LEG',[.11,.48,.14],[0,-.12,.08],black,rudder);propeller=new THREE.Group();propeller.name='MARINE_PROPELLER';propeller.position.set(0,-.22,.19);propeller.add(part(new THREE.SphereGeometry(.045,10,8),chrome));for(let i=0;i<3;i++){const blade=part(new THREE.SphereGeometry(.075,10,6),chrome,[Math.sin(i*2*Math.PI/3)*.085,Math.cos(i*2*Math.PI/3)*.085,0]);blade.scale.set(.5,1.1,.2);blade.rotation.z=-i*2*Math.PI/3;propeller.add(blade);}rudder.add(propeller);cosmetic(rudder);root.add(rudder);
 }
 const flag=new THREE.Group();flag.name='MARINA_ENSIGN';flag.position.set(-.65,1.22,1.65);tube(detail,[-.65,.36,1.65],[-.65,1.44,1.65],.012,chrome,'ENSIGN_STAFF');flag.add(part(new THREE.PlaneGeometry(.26,.16,4,2),material(0x65c3b7,.76,.01,{side:THREE.DoubleSide}),[.13,0,0]),part(new THREE.PlaneGeometry(.08,.16),ivory,[.045,0,.003]));detail.add(flag);cosmetic(detail);root.add(detail);
 const wake=cosmetic(new THREE.Group());wake.name='BOAT_WAKE_FOAM';const foam=[];for(let i=0;i<8;i++){const mesh=part(new THREE.RingGeometry(.21,.25,14,1,0,Math.PI),new THREE.MeshBasicMaterial({color:0xe1f9f5,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}),[0,-.165,2.3],[Math.PI/2,0,0]);mesh.name='COSMETIC_WAKE_RIPPLE';wake.add(mesh);foam.push(mesh);}cosmetic(wake);wake.visible=false;root.add(wake);
 root.userData={builderObject:true,modelId:id,watercraft:true,boatModel:true,vehicle:{mode:'boat',seat:[...HARBOR_HELM_POSES[id].position],speed:sailboat?8:11,turnSpeed:.8},dimensions:[2,sailboat?5.15:1.52,4.8],helmPose:HARBOR_HELM_POSES[id],boatRig:{wheel,throttle,propeller,rudder,boom,sail,flag,needles,wake,foam}};return root;
}
export function updateHarborBoat(root,state={},elapsed=0){
 const rig=root?.userData?.boatRig;if(!rig)return;const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback,time=finite(elapsed),speed=finite(state.speed),throttle=THREE.MathUtils.clamp(finite(state.throttle),-1,1),rudder=THREE.MathUtils.clamp(finite(state.rudder,finite(state.steering)),-1,1),rpm=Math.max(0,finite(state.rpm,Math.abs(throttle)*4800)),trim=THREE.MathUtils.clamp(finite(state.sailTrim,.45),0,1),power=THREE.MathUtils.clamp(finite(state.sailPower,.6),0,1);
 rig.wheel.rotation.z=-rudder*2.6;rig.throttle.rotation.x=-throttle*.65;if(rig.rudder)rig.rudder.rotation.y=-rudder*.44;if(rig.propeller)rig.propeller.rotation.z=time*rpm*.08;if(rig.boom)rig.boom.rotation.y=(.05+trim*.28)*(finite(state.windSide,1)<0?-1:1);if(rig.sail)rig.sail.scale.x=.72+power*.28;rig.flag.rotation.y=Math.sin(time*2.8)*.12+rudder*.05;
 for(const needle of rig.needles){const kind=needle.userData.instrument;needle.rotation.z=kind==='speed'?-2.2+Math.min(1,Math.abs(speed)/14)*4.4:kind==='rpm'?-2.2+Math.min(1,rpm/6000)*4.4:-finite(state.heading)*Math.PI/180;}
 const strength=THREE.MathUtils.clamp(finite(state.wakeStrength,Math.abs(speed)/10),0,1);rig.wake.visible=strength>.025;rig.foam.forEach((mesh,index)=>{const phase=(time*.6+index/rig.foam.length)%1;mesh.position.set(0,-.165,2.05+phase*3.3);mesh.scale.set(.7+phase*(2.8+strength),1,.65+phase*1.6);mesh.material.opacity=strength*(1-phase)*.34;});
 root.userData.boatAnimationState={speed,throttle,rudder,rpm,sailTrim:trim,sailPower:power,wakeStrength:strength};root.userData.boatAnimatedAt=time;
}
