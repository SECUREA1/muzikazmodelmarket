import * as T from '../vendor/three/three.module.min.js';

/** Metre-scale resort hulls use the same helm, wake and actor projection as
 * every other native boat. Local -Z is forward; the server owns their pose. */
export function createResortBoat(id,helmPose){
 const pontoon=id==='resort-pontoon',root=new T.Group();root.name=pontoon?'PALM_COAST_PONTOON':'PALM_COAST_PEDAL_BOAT';
 const palette=new Map();const material=color=>{if(!palette.has(color))palette.set(color,new T.MeshStandardMaterial({color,roughness:.7,metalness:.08}));return palette.get(color);};
 const mesh=(name,geometry,color,position=[0,0,0],parent=root)=>{const node=new T.Mesh(geometry,material(color));node.name=name;node.position.set(...position);node.castShadow=node.receiveShadow=true;parent.add(node);return node;};
 const box=(name,size,position,color,parent=root)=>mesh(name,new T.BoxGeometry(...size),color,position,parent);
 const pole=(name,a,b,r,color,parent=root)=>{const from=new T.Vector3(...a),to=new T.Vector3(...b),delta=to.clone().sub(from),node=mesh(name,new T.CylinderGeometry(r,r,delta.length(),8),color,[0,0,0],parent);node.position.copy(from.add(to).multiplyScalar(.5));node.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());return node;};
 const wheel=new T.Group(),throttle=new T.Group(),flag=new T.Group(),wake=new T.Group(),needles=[],foam=[];let paddleWheel=null;
 if(pontoon){
  for(const x of [-1.3,1.3]){const hull=mesh('PONTOON_FLOAT',new T.CapsuleGeometry(.4,5.4,6,12),'#d6d9bd',[x,-.02,0]);hull.rotation.x=Math.PI/2;}
  box('PONTOON_TEAK_DECK',[3.4,.23,6],[0,.49,0],'#b9996b');
  for(let z=-2.8;z<=2.8;z+=.3)box('DECK_PLANK_SEAM',[3.3,.008,.012],[0,.611,z],'#8f7755');
  for(const x of [-1.5,1.5])for(const z of [-2.7,2.7]){
   pole('CANOPY_POST',[x,.6,z],[x,3.08,z],.045,'#d5d8c6');
   pole('RAIL_POST',[x,.6,z],[x,1.35,z],.045,'#d5d8c6');
  }
  box('STRIPED_SUN_CANOPY',[3.7,.16,6.5],[0,3.13,0],'#efbb76');
  for(let x=-1.65;x<1.7;x+=.6)box('CANOPY_CREAM_STRIPE',[.25,.012,6.48],[x,3.218,0],'#fff0c5');
  for(const x of [-1.5,1.5])pole('SIDE_SAFETY_RAIL',[x,1.35,-2.7],[x,1.35,2.7],.045,'#d5d8c6');
  for(const z of [-.4,1.6]){box('PONTOON_BENCH',[2.6,.25,.8],[0,.95,z],'#f3e5bc');box('BENCH_BACK',[2.6,.7,.18],[0,1.35,z+.35],'#54a8a2');}
  box('PONTOON_HELM',[.7,.8,.6],[.9,1.12,-2.2],'#67ada6');
  wheel.position.set(.9,1.65,-1.85);mesh('CAPTAINS_WHEEL',new T.TorusGeometry(.23,.032,6,20),'#ece1b6',[0,0,0],wheel);
  for(let i=0;i<4;i++){const a=i*Math.PI/2;pole('WHEEL_SPOKE',[0,0,0],[Math.sin(a)*.2,Math.cos(a)*.2,0],.012,'#ece1b6',wheel);}
  throttle.position.set(1.24,1.43,-1.87);pole('THROTTLE_LEVER',[0,0,0],[0,.2,-.05],.02,'#e3dbbd',throttle);
  const motor=box('QUIET_ELECTRIC_OUTBOARD',[.5,.6,.4],[0,.1,3],'#496e70');motor.userData.collisionDisabled=true;
 }else{
  for(const x of [-.67,.67]){const hull=mesh('PEDAL_BOAT_FLOAT',new T.SphereGeometry(1,12,8),'#eea171',[x,.02,0]);hull.scale.set(.31,.32,1.7);box('PADDLE_SEAT',[.64,.14,.75],[x,.49,.15],'#fff1c8');box('SEAT_BACK',[.64,.5,.12],[x,.8,.5],'#fff1c8');}
  box('PADDLE_BOAT_FLOOR',[1.7,.14,1.8],[0,.18,.1],'#eea171');box('PADDLE_BOAT_BOW',[1.7,.23,.55],[0,.18,-1.08],'#eea171');
  paddleWheel=new T.Group();paddleWheel.name='PEDAL_DRIVEN_PADDLE_WHEEL';paddleWheel.position.set(0,-.02,1.22);root.add(paddleWheel);
  const axle=mesh('PADDLE_WHEEL_AXLE',new T.CylinderGeometry(.08,.08,1.75,8),'#e6ca87',[0,0,0],paddleWheel);axle.rotation.z=Math.PI/2;
  for(let i=0;i<6;i++){const a=i*Math.PI/3,blade=box('PADDLE_WHEEL_BLADE',[1.5,.06,.38],[0,Math.sin(a)*.34,Math.cos(a)*.34],'#e6ca87',paddleWheel);blade.rotation.x=-a;}
  pole('PEDAL_LINKAGE',[-.67,.27,-.2],[.67,.27,-.2],.025,'#6b8985');
  for(const x of [-.67,.67])box('PEDAL_FOOTREST',[.22,.06,.2],[x,.33,-.45],'#506e6b');
  wheel.position.set(.3,.75,-.35);mesh('PEDAL_STEERING_HANDLE',new T.TorusGeometry(.12,.023,5,16),'#5b7c71',[0,0,0],wheel);
  throttle.position.set(.5,.6,-.4);
 }
 flag.position.set(pontoon?-1.5:-.7,pontoon?1.8:1.15,pontoon?2.7:1.1);mesh('PALM_COAST_PENNANT',new T.PlaneGeometry(.32,.18),'#65c3b7',[.16,0,0],flag).material.side=T.DoubleSide;
 root.add(wheel,throttle,flag,wake);
 for(let i=0;i<7;i++){
  const ring=new T.Mesh(new T.RingGeometry(.21,.26,14,1,0,Math.PI),new T.MeshBasicMaterial({color:'#e1f9f5',side:T.DoubleSide,transparent:true,opacity:0,depthWrite:false}));ring.name='RESORT_BOAT_WAKE';ring.rotation.x=-Math.PI/2;ring.position.set(0,.015,pontoon?3.3:1.75);ring.userData.collisionDisabled=true;wake.add(ring);foam.push(ring);
 }
 wake.userData.collisionDisabled=true;wake.visible=false;
 root.userData={builderObject:true,modelId:id,watercraft:true,boatModel:true,dimensions:pontoon?[3.7,3.25,6.5]:[1.9,1.5,3.4],helmPose,vehicle:{mode:'boat',seat:[...helmPose.position],speed:pontoon?6:3.4,turnSpeed:pontoon?.6:1.15},wakeDesign:{stern:pontoon?3.3:1.75,length:pontoon?3:1.8,width:pontoon?1.25:.65},boatRig:{wheel,throttle,flag,wake,foam,needles,paddleWheel}};
 return root;
}
