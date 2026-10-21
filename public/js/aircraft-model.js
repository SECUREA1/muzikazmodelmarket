import * as THREE from '../vendor/three/three.module.min.js';

// Root origin and footprint deliberately match the public airport's aircraft stands.
export const AIRCRAFT_COCKPIT_POSE=Object.freeze({position:Object.freeze([0,1.78,.68]),lookForward:Object.freeze([0,0,-1]),near:.035,fov:74});
const mat=(color,roughness=.5,metalness=.3,extra={})=>new THREE.MeshStandardMaterial({color,roughness,metalness,...extra});
const part=(geometry,material,position=[0,0,0],rotation=[0,0,0])=>{const mesh=new THREE.Mesh(geometry,material);mesh.position.set(...position);mesh.rotation.set(...rotation);return mesh;};
function cosmetic(object){object.traverse(node=>{node.userData.collisionDisabled=true;node.userData.collider=false;});return object;}
function tube(parent,a,b,radius,material,name='AIRFRAME_DETAIL'){
 const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start),mesh=part(new THREE.CylinderGeometry(radius,radius,delta.length(),8),material,start.add(end).multiplyScalar(.5).toArray());mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());mesh.name=name;parent.add(mesh);return mesh;
}
function fuselageGeometry(){
 const rings=[[-3.7,.98,.40,.44],[-3.42,.98,.61,.61],[-2.8,.98,.64,.66],[-2.1,.97,.63,.65],[-1.3,.98,.57,.59],[-.45,1.0,.52,.54],[.25,1.0,.49,.53],[1.2,1.01,.42,.45],[1.9,1.06,.30,.32],[2.75,1.12,.19,.21],[3.72,1.15,.055,.10]],segments=32,positions=[],indices=[];
 for(const [z,y,rx,ry]of rings)for(let i=0;i<=segments;i++){const a=i/segments*Math.PI*2;positions.push(Math.cos(a)*rx,y+Math.sin(a)*ry,z);}
 for(let j=0;j<rings.length-1;j++)for(let i=0;i<segments;i++){
  // A real open cockpit, rather than placing the camera inside a solid body.
  const angle=(i+.5)/segments*Math.PI*2;if(j>=5&&j<=6&&Math.sin(angle)>.45)continue;
  const a=j*(segments+1)+i,b=a+segments+1;indices.push(a,b,a+1,b,b+1,a+1);
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
function wingGeometry(side){
 const sections=[[0,.76,-1.35,1.12],[1.55,.32,-1.07,1.01],[2.1,.39,-.98,.91],[4.75,.78,-.47,.49],[5.25,.83,-.27,.31]],points=24,positions=[],indices=[];
 for(const [span,y,front,rear]of sections)for(let j=0;j<points;j++){
  const a=j/points*Math.PI*2,t=(1-Math.cos(a))*.5,chord=rear-front,thickness=Math.sin(a)*(.075*Math.sqrt(Math.max(0,Math.sin(Math.PI*t)))+.012)*chord;
  positions.push(side*span,y+thickness,front+t*chord);
 }
 for(let i=0;i<sections.length-1;i++)for(let j=0;j<points;j++){const a=i*points+j,b=i*points+(j+1)%points,c=a+points,d=b+points;if(side>0)indices.push(a,b,c,b,d,c);else indices.push(a,c,b,b,c,d);}
 const tip=(sections.length-1)*points;for(let j=1;j<points-1;j++)indices.push(tip,tip+j,tip+j+1);
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
function flatSurface(points,depth,material,name){
 const shape=new THREE.Shape();shape.moveTo(...points[0]);for(const point of points.slice(1))shape.lineTo(...point);shape.closePath();const geometry=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSize:.025,bevelThickness:.02,bevelSegments:1,steps:1});geometry.translate(0,0,-depth/2);const mesh=part(geometry,material);mesh.name=name;return mesh;
}
function gauge(panel,x,y,r,kind,materials,needles){
 const face=part(new THREE.CircleGeometry(r,28),materials.face,[x,y,-.334]);face.name='INSTRUMENT_'+kind.toUpperCase();panel.add(face);
 const rim=part(new THREE.TorusGeometry(r,.009,5,28),materials.steel,[x,y,-.329]);panel.add(rim);
 for(let i=0;i<12;i++){const a=i/12*Math.PI*2,tick=part(new THREE.BoxGeometry(.008,i%3===0?.026:.015,.003),materials.pale,[x+Math.sin(a)*r*.78,y+Math.cos(a)*r*.78,-.323],[0,0,-a]);panel.add(tick);}
 const pivot=new THREE.Group();pivot.position.set(x,y,-.315);const needle=part(new THREE.BoxGeometry(.008,r*.71,.005),materials.needle,[0,r*.28,0]);pivot.add(needle,part(new THREE.CircleGeometry(.015,10),materials.steel,[0,0,.004]));pivot.userData.instrument=kind;needles.push(pivot);panel.add(pivot);
}
export function createAircraftModel(){
 const root=new THREE.Group();root.name='BLACKWING_CORSAIR_MK_II';const paint=mat(0x183443,.4,.57),darkPaint=mat(0x0d2029,.45,.49),pale=mat(0xdce2da,.58,.2),steel=mat(0x8b9fa5,.28,.8),dark=mat(0x11181c,.8,.12),rubber=mat(0x101315,.94,.02),brass=mat(0xb9a16c,.4,.7),red=mat(0xd95a43,.6,.1),glass=mat(0xa9d9df,.12,.05,{transparent:true,opacity:.20,side:THREE.DoubleSide,depthWrite:false});
 const add=(mesh,name)=>{if(name)mesh.name=name;root.add(mesh);return mesh;};
 add(part(fuselageGeometry(),paint),'TAPERED_MONOCOQUE_FUSELAGE');
 const cowl=add(part(new THREE.CylinderGeometry(.635,.60,.67,32,1,true),darkPaint,[0,.98,-3.34],[Math.PI/2,0,0]),'RADIAL_ENGINE_COWLING');
 add(part(new THREE.TorusGeometry(.61,.025,8,40),steel,[0,.98,-3.686]),'COWL_LIP');
 const engine=cosmetic(new THREE.Group());engine.name='RADIAL_ENGINE_DETAIL';engine.position.set(0,.98,-3.62);for(let i=0;i<9;i++){const angle=i/9*Math.PI*2,cylinder=part(new THREE.CylinderGeometry(.095,.12,.35,10),steel,[Math.sin(angle)*.35,Math.cos(angle)*.35,0],[Math.PI/2,0,0]);engine.add(cylinder);for(let fin=0;fin<4;fin++)engine.add(part(new THREE.TorusGeometry(.105,.009,4,10),dark,[Math.sin(angle)*.35,Math.cos(angle)*.35,-.10+fin*.06]));}add(engine);
 const spinner=add(part(new THREE.ConeGeometry(.20,.46,24),darkPaint,[0,.98,-3.94],[-Math.PI/2,0,0]),'PROPELLER_SPINNER');
 const propeller=new THREE.Group();propeller.name='FOUR_BLADE_PROPELLER';propeller.position.set(0,.98,-3.78);propeller.userData.vehiclePropeller=true;
 for(let i=0;i<4;i++){const blade=new THREE.Group();blade.rotation.z=i*Math.PI/2;const shape=new THREE.Shape();shape.moveTo(-.06,.16);shape.bezierCurveTo(-.16,.55,-.20,1.13,-.06,1.23);shape.bezierCurveTo(.075,1.26,.14,1.05,.11,.75);shape.lineTo(.045,.16);shape.closePath();const geometry=new THREE.ExtrudeGeometry(shape,{depth:.035,bevelEnabled:true,bevelThickness:.008,bevelSize:.012,bevelSegments:1,steps:1});blade.add(part(geometry,dark));const tip=part(new THREE.BoxGeometry(.16,.13,.045),brass,[-.025,1.12,.019],[0,0,-.06]);blade.add(tip);propeller.add(blade);}cosmetic(propeller);add(propeller);
 const blur=cosmetic(part(new THREE.CircleGeometry(1.23,40),new THREE.MeshBasicMaterial({color:0x9aafba,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}),[0,.98,-3.81]));blur.name='PROPELLER_BLUR_DISC';add(blur);
 const ailerons=[],flaps=[],gear=[],needles=[];
 for(const side of [-1,1]){
  add(part(wingGeometry(side),paint),side<0?'PORT_GULL_WING':'STARBOARD_GULL_WING');
  const aileron=new THREE.Group();aileron.name=side<0?'PORT_AILERON':'STARBOARD_AILERON';aileron.position.set(side*3.65,.63,.56);aileron.add(part(new THREE.BoxGeometry(2.15,.055,.28),darkPaint));aileron.userData.side=side;add(aileron);ailerons.push(aileron);
  const flap=new THREE.Group();flap.name='LANDING_FLAP_'+side;flap.position.set(side*1.75,.38,.95);flap.add(part(new THREE.BoxGeometry(1.28,.06,.35),darkPaint,[0,0,.12]));add(flap);flaps.push(flap);
  // Painted identification stripes follow the outer wing and remain visual only.
  const stripes=cosmetic(new THREE.Group());stripes.name='WING_IDENTIFICATION_'+side;for(let i=0;i<3;i++)stripes.add(part(new THREE.BoxGeometry(.18,.012,.68),pale,[side*(3.78+i*.25),.80,.02],[0,0,side*.12]));add(stripes);
  const lamp=cosmetic(part(new THREE.SphereGeometry(.065,10,8),new THREE.MeshBasicMaterial({color:side<0?0xff5546:0x63e8aa}),[side*5.17,.85,.04]));lamp.name=side<0?'PORT_NAV_LIGHT':'STARBOARD_NAV_LIGHT';add(lamp);
  const leg=new THREE.Group();leg.name='RETRACTABLE_GEAR_'+side;leg.position.set(side*1.25,.64,-.64);tube(leg,[0,0,0],[0,-.60,.12],.045,steel,'SHOCK_STRUT');tube(leg,[0,-.05,0],[side*.17,-.43,.13],.025,darkPaint,'GEAR_BRACE');
  const wheel=part(new THREE.CylinderGeometry(.34,.34,.19,24),rubber,[0,-.695,.12],[0,0,Math.PI/2]);wheel.userData.vehicleWheel=true;wheel.name='MAIN_WHEEL_'+side;leg.add(wheel);for(const direction of [-1,1])leg.add(part(new THREE.CylinderGeometry(.13,.13,.008,16),steel,[direction*.1,-.695,.12],[0,0,Math.PI/2]));leg.userData.side=side;add(leg);gear.push(leg);
 }
 // Tapered tailplanes and a separate rudder/elevator permit visible control movement.
 const tailplane=flatSurface([[-1.7,3.18],[-1.25,2.69],[0,2.70],[1.25,2.69],[1.7,3.18],[1.38,3.47],[-1.38,3.47]],.055,paint,'HORIZONTAL_TAILPLANE');tailplane.rotation.x=Math.PI/2;tailplane.position.y=1.1;add(tailplane);
 const elevator=new THREE.Group();elevator.name='ELEVATOR';elevator.position.set(0,1.1,3.42);elevator.add(part(new THREE.BoxGeometry(2.72,.065,.36),darkPaint,[0,0,.12]));add(elevator);
 const fin=flatSurface([[2.62,1.15],[3.05,2.25],[3.39,2.30],[3.76,1.35],[3.77,1.13]],.08,paint,'VERTICAL_FIN');fin.rotation.y=-Math.PI/2;add(fin);
 const rudder=new THREE.Group();rudder.name='RUDDER';rudder.position.set(0,1.66,3.61);rudder.add(part(new THREE.BoxGeometry(.065,1.02,.28),darkPaint,[0,0,.08]));add(rudder);
 const tailLeg=new THREE.Group();tailLeg.position.set(0,.65,3.12);tailLeg.name='TAIL_GEAR';tube(tailLeg,[0,0,0],[0,-.78,.15],.025,steel);tailLeg.add(part(new THREE.CylinderGeometry(.17,.17,.11,18),rubber,[0,-.875,.15],[0,0,Math.PI/2]));add(tailLeg);gear.push(tailLeg);
 // Cockpit: a recessed well, upholstery, harness, controls and a framed windscreen.
 const cockpit=cosmetic(new THREE.Group());cockpit.name='OPEN_COCKPIT';cockpit.add(part(new THREE.BoxGeometry(.76,.08,1.49),dark,[0,.62,.40]));
 for(const side of [-1,1])cockpit.add(part(new THREE.BoxGeometry(.08,.43,1.52),darkPaint,[side*.43,1.1,.40]));
 cockpit.add(part(new THREE.BoxGeometry(.53,.12,.62),mat(0x705c43,.95,.01),[0,.84,.63]),part(new THREE.BoxGeometry(.55,.60,.11),mat(0x705c43,.95,.01),[0,1.16,1.0],[.12,0,0]),part(new THREE.BoxGeometry(.28,.19,.10),dark,[0,1.56,1.05]));
 for(const side of [-1,1]){tube(cockpit,[side*.18,1.43,.96],[side*.09,.91,.60],.025,pale,'SEAT_HARNESS');tube(cockpit,[side*.45,1.40,-.41],[side*.44,1.40,1.2],.034,darkPaint,'COCKPIT_SILL');}
 const stick=new THREE.Group();stick.position.set(0,.72,.26);tube(stick,[0,0,0],[0,.47,-.04],.026,dark);stick.add(part(new THREE.BoxGeometry(.14,.06,.05),dark,[0,.46,-.04]));stick.name='CONTROL_STICK';cockpit.add(stick);
 tube(cockpit,[-.37,.97,.52],[-.37,1.2,.14],.025,dark,'THROTTLE_LEVER');cockpit.add(part(new THREE.SphereGeometry(.055,10,8),red,[-.37,1.2,.14]));
 const panel=new THREE.Group();panel.name='COCKPIT_INSTRUMENT_PANEL';panel.add(part(new THREE.BoxGeometry(.91,.44,.10),dark,[0,1.25,-.41]));const gaugeMaterials={face:mat(0x071015,.72,.1),steel,pale,needle:mat(0xffd993,.45,.1,{emissive:0x6b3e11,emissiveIntensity:.4})};
 for(const [x,y,r,kind]of [[-.29,1.30,.12,'airspeed'],[0,1.30,.13,'attitude'],[.29,1.30,.12,'altitude'],[-.24,1.04,.075,'rpm'],[0,1.04,.075,'heading'],[.24,1.04,.075,'verticalSpeed']])gauge(panel,x,y,r,kind,gaugeMaterials,needles);cockpit.add(panel);
 const windows=[[[ -.38,1.45,-.65],[.38,1.45,-.65],[.29,1.96,-.48],[-.29,1.96,-.48]],[[ -.38,1.45,-.65],[-.29,1.96,-.48],[-.45,1.80,-.03],[-.49,1.44,-.05]],[[.38,1.45,-.65],[.49,1.44,-.05],[.45,1.80,-.03],[.29,1.96,-.48]]];
 for(const points of windows){const geometry=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p)));geometry.setIndex([0,1,2,0,2,3]);geometry.computeVertexNormals();cockpit.add(part(geometry,glass));for(let i=0;i<4;i++)tube(cockpit,points[i],points[(i+1)%4],.015,darkPaint,'WINDSCREEN_FRAME');}add(cockpit);
 // Raised panel seams and rivets produce highlights without texture downloads.
 const rivets=cosmetic(new THREE.InstancedMesh(new THREE.SphereGeometry(.014,5,4),steel,64)),matrix=new THREE.Matrix4();rivets.name='AIRFRAME_RIVETS';for(let i=0;i<64;i++){const z=-2.65+(i%16)*.40,side=i<32?-1:1,x=side*(.56-Math.max(0,z)*.11),y=i%32<16?.88:1.17;matrix.makeTranslation(x,y,z);rivets.setMatrixAt(i,matrix);}add(rivets);
 for(const z of [-2.58,-1.8]){const seam=cosmetic(part(new THREE.TorusGeometry(.63,.008,4,32),darkPaint,[0,.98,z]));seam.scale.x=.96;add(seam);}
 const exhaust=cosmetic(new THREE.Group());exhaust.name='EXHAUST_STACKS';for(const side of [-1,1])for(let i=0;i<4;i++)exhaust.add(part(new THREE.CylinderGeometry(.045,.055,.20,8),steel,[side*.62,.74,-2.65+i*.16],[0,0,side*.65]));add(exhaust);
 root.userData={builderObject:true,modelId:'corsair-aircraft',aircraftModel:true,dimensions:[10.5,2.7,8.2],vehicle:{mode:'fly',seat:[0,.89,.63],cockpit:[...AIRCRAFT_COCKPIT_POSE.position],speed:24,turnSpeed:1.15},aircraftRig:{propeller,blur,ailerons,flaps,gear,elevator,rudder,stick,needles},cockpitPose:AIRCRAFT_COCKPIT_POSE};
 root.traverse(node=>{if(node.parent?.userData.collisionDisabled){node.userData.collisionDisabled=true;node.userData.collider=false;}if(node.isMesh){node.castShadow=!node.userData.collisionDisabled;node.receiveShadow=true;}});root.updateMatrixWorld(true);updateAircraftModel(root,{},0);return root;
}
export function updateAircraftModel(root,flight={},elapsed=0){
 const rig=root?.userData?.aircraftRig;if(!rig)return;const safe=value=>Number.isFinite(Number(value))?Number(value):0,throttle=THREE.MathUtils.clamp(safe(flight.throttle),0,1),rpm=safe(flight.rpm)||700+throttle*2300,airborne=flight.airborne===true,bank=THREE.MathUtils.clamp(safe(flight.bank),-.8,.8),pitch=THREE.MathUtils.clamp(safe(flight.pitch),-.6,.6),flaps=THREE.MathUtils.clamp(safe(flight.flaps),0,1),gearDeployed=flight.gear!==false;
 rig.propeller.rotation.z=safe(elapsed)*rpm*.045;rig.blur.material.opacity=rpm>1100?Math.min(.14,(rpm-1100)/14000):0;rig.blur.visible=rig.blur.material.opacity>0;
 rig.ailerons.forEach(surface=>surface.rotation.x=surface.userData.side*bank*.45);rig.flaps.forEach(surface=>surface.rotation.x=flaps*.6);rig.elevator.rotation.x=-pitch*.7;rig.rudder.rotation.y=THREE.MathUtils.clamp(safe(flight.rudder),-1,1)*.35;rig.stick.rotation.set(-pitch*.45,0,-bank*.35);
 rig.gear.forEach(leg=>{leg.rotation.z=gearDeployed?0:leg.userData.side?leg.userData.side*1.30:0;leg.visible=gearDeployed||!!leg.userData.side;});
 for(const needle of rig.needles){const kind=needle.userData.instrument;let angle=0;if(kind==='airspeed')angle=-2.2+Math.min(1,safe(flight.airspeed||flight.speed)/32)*4.4;else if(kind==='altitude')angle=-safe(flight.altitude)/100*Math.PI*2;else if(kind==='rpm')angle=-2.2+rpm/3200*4.4;else if(kind==='heading')angle=-safe(flight.heading)*Math.PI/180;else if(kind==='verticalSpeed')angle=-THREE.MathUtils.clamp(safe(flight.verticalSpeed)/12,-1,1)*2;else if(kind==='attitude')angle=-bank;needle.rotation.z=angle;}
 root.userData.aircraftAnimatedAt=safe(elapsed);root.userData.aircraftAnimationState={throttle,rpm,airborne,gear:gearDeployed,flaps};
}
