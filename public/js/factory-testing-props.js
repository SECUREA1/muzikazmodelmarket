import * as T from '../vendor/three/three.module.min.js';

/** Fictional game-range and underground power-facility props, in world metres. */
export const TESTING_MODEL_INFO=Object.freeze({
 'testing-launch-pad':['Atlas Test Launch Pad','Drive-over range platform with concentric markings, inset service plates and guidance lights.',[14,.12,18]],
 'testing-launch-console':['Range Launch Console','Three-screen game control desk with status lights, protected controls and an operator apron.',[5,2.5,2.4]],
 'testing-range-target':['Segmented Range Target','A seven-metre target gantry with layered scoring sectors, a central beacon and animated tracking line.',[7,7,2.5]],
 'testing-telemetry-terminal':['Range Telemetry Terminal','Test setup desk with illustrated telemetry channels, diagnostics screens and an integrated systems rack.',[5,2.6,2.5]],
 'testing-blast-door':['Compound Blast Door','Heavy doorway with an eight-metre clear opening, static steel jambs and decorative sliding panels.',[12,7,1.4]],
 'testing-containment-core':['Luminous Containment Core','Fictional underground energy-core exhibit with luminous orbital rings, an observation sphere and service pipes.',[8,6,8]],
 'testing-cargo-platform':['Cargo Test Platform','Drive-over cargo receiving platform with an illuminated landing grid and corner alignment marks.',[10,.12,12]]
});

function parts(root){
 const cube=new T.BoxGeometry(1,1,1),round=new T.CylinderGeometry(1,1,1,16),sphere=new T.SphereGeometry(1,20,12),torus=new T.TorusGeometry(1,.018,6,48),materials=new Map();
 const colors={steel:'#8ea7ae',dark:'#162a35',deep:'#0b1b23',slate:'#3d5964',white:'#e0eeeb',orange:'#ed9450',yellow:'#e3c36d',cyan:'#55d7de',green:'#7de6ae',blue:'#6c9cec'};
 const mat=(color,glow=false,opacity=1)=>{const value=colors[color]||color,key=[value,glow,opacity].join(':');if(!materials.has(key))materials.set(key,new T.MeshStandardMaterial({color:value,roughness:color==='steel'?.36:.7,metalness:color==='steel'?.7:.18,emissive:glow?value:'#000000',emissiveIntensity:glow?.6:0,transparent:opacity<1,opacity,depthWrite:opacity===1}));return materials.get(key);};
 const mesh=(parent,name,geometry,color,x,y,z,solid=true)=>{const node=new T.Mesh(geometry,typeof color==='string'?mat(color):color);node.name='TESTING_'+name;node.position.set(x,y,z);node.castShadow=solid;node.receiveShadow=true;if(!solid)node.userData.collisionDisabled=true;parent.add(node);return node;};
 const box=(parent,name,x,y,z,w,h,d,color='dark',solid=true)=>{const node=mesh(parent,name,cube,color,x,y,z,solid);node.scale.set(w,h,d);return node;};
 const cylinder=(parent,name,x,y,z,r,h,color='steel',solid=true)=>{const node=mesh(parent,name,round,color,x,y,z,solid);node.scale.set(r,h,r);return node;};
 const ball=(parent,name,x,y,z,r,color='cyan',solid=false)=>{const node=mesh(parent,name,sphere,color,x,y,z,solid);node.scale.setScalar(r);return node;};
 const ring=(parent,name,x,y,z,r,color='cyan',rotationX=0)=>{const node=mesh(parent,name,torus,mat(color,true),x,y,z,false);node.scale.setScalar(r);node.rotation.x=rotationX;return node;};
 const pipe=(parent,name,a,b,r=.09,color='steel')=>{const from=new T.Vector3(...a),to=new T.Vector3(...b),delta=to.clone().sub(from),center=from.add(to).multiplyScalar(.5),node=cylinder(parent,name,center.x,center.y,center.z,r,delta.length(),color,false);node.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());return node;};
 const screen=(parent,name,x,y,z,w,h,color='cyan')=>{box(parent,name+'_FRAME',x,y,z,w+.14,h+.14,.15,'steel');box(parent,name+'_FACE',x,y,z+.086,w,h,.02,'deep',false);for(let i=0;i<5;i++){box(parent,name+'_CHANNEL',x-w*.3,y-h*.35+i*h*.17,z+.1,w*(.28+(i%3)*.16),.025,.009,mat(color,true),false);for(let dot=0;dot<3;dot++)box(parent,name+'_DATA',x+w*.22+dot*.07,y-h*.35+i*h*.17,z+.1,.035,.018,.009,'white',false);}};
 return {mat,mesh,box,cylinder,ball,ring,pipe,screen};
}

export function createTestingModel(id){
 if(!TESTING_MODEL_INFO[id])return null;
 const root=new T.Group(),{mat,mesh,box,cylinder,ball,ring,pipe,screen}=parts(root);root.name=id;root.userData.testingModel=true;root.userData.testingItemId=id;
 if(id==='testing-launch-pad'||id==='testing-cargo-platform'){
  const cargo=id==='testing-cargo-platform',width=cargo?10:14,depth=cargo?12:18;
  box(root,cargo?'CARGO_PLATFORM':'LAUNCH_PLATFORM',0,.025,0,width,.05,depth,'slate').userData.walkableFloor=true;
  for(const x of [-width/2+.3,width/2-.3])box(root,'PLATFORM_EDGE',x,.058,0,.12,.01,depth-.6,'orange',false);
  for(const z of [-depth/2+.3,depth/2-.3])box(root,'PLATFORM_EDGE',0,.058,z,width-.6,.01,.12,'orange',false);
  if(cargo){
   for(const x of [-3,-1,1,3])box(root,'RECEIVING_GRID',x,.065,0,.035,.008,9,'steel',false);
   for(const z of [-4,-2,0,2,4])box(root,'RECEIVING_GRID',0,.065,z,8,.008,.035,'steel',false);
   for(const side of [-1,1])for(const end of [-1,1]){box(root,'CARGO_ALIGNMENT',side*3.3,.075,end*4.3,1.6,.01,.12,mat('cyan',true),false);box(root,'CARGO_ALIGNMENT',side*4,.075,end*3.7,.12,.01,1.3,mat('cyan',true),false);}
   const beacon=ring(root,'CARGO_GUIDANCE',0,.079,0,2.3,'cyan',Math.PI/2);beacon.userData.testingPulse=true;
  }else{
   cylinder(root,'LAUNCH_DISC',0,.06,0,5.4,.02,'dark').userData.walkableFloor=true;
   for(const radius of [2.2,3.8,5]){const line=ring(root,'LAUNCH_MARKING',0,.078,0,radius,'yellow',Math.PI/2);line.scale.z=.2;}
   for(const side of [-1,1]){box(root,'PAD_ALIGNMENT',side*5.6,.07,0,.8,.01,.12,'white',false);box(root,'PAD_ALIGNMENT',0,.07,side*6.3,.12,.01,1.1,'white',false);}
   for(let i=0;i<12;i++){const a=i/12*Math.PI*2,light=box(root,'INSET_GUIDANCE_LIGHT',Math.cos(a)*5.8,.08,Math.sin(a)*5.8,.22,.02,.15,mat(i%3?'cyan':'orange',true),false);light.rotation.y=-a;light.userData.testingPulse=true;}
   for(const x of [-5.3,5.3])for(const z of [-7.1,7.1]){box(root,'SERVICE_PLATE',x,.065,z,1.5,.01,1.4,'steel',false);for(const dx of [-.55,.55])for(const dz of [-.45,.45])cylinder(root,'PLATE_BOLT',x+dx,.076,z+dz,.035,.008,'dark',false);}
  }
 }else if(id==='testing-launch-console'||id==='testing-telemetry-terminal'){
  const telemetry=id==='testing-telemetry-terminal';
  box(root,'CONSOLE_BASE',0,.13,0,5,.26,2.4,'deep');
  box(root,'CONSOLE_CABINET',0,.79,-.12,4.5,1.34,1.7,'dark');box(root,'CONTROL_WORKTOP',0,1.5,.1,4.85,.18,2.1,'steel');
  for(const x of [-1.55,0,1.55]){screen(root,'CONTROL_DISPLAY',x,2.03,-.6,1.3,.76,telemetry?'green':'cyan');box(root,'MONITOR_STAND',x,1.64,-.62,.12,.28,.12,'dark');}
  for(let i=0;i<9;i++)box(root,'CONTROL_KEY',-1.7+i*.42,1.605,.48,.24,.03,.14,i===8?'orange':'slate',false);
  cylinder(root,'PRIMARY_CONTROL',1.65,1.66,.73,.16,.1,mat('orange',true),false);
  for(const x of [-2.05,2.05])for(const z of [-.7,.7])box(root,'CONSOLE_LEG',x,.31,z,.15,.62,.15,'steel');
  for(const side of [-1,1]){box(root,'CONSOLE_ACCENT',side*2.26,.9,.76,.08,.95,.04,'orange',false);for(let i=0;i<5;i++)box(root,'RACK_VENT',side*1.4,.48+i*.13,.745,.8,.035,.025,'steel',false);}
  const status=box(root,'OPERATOR_STATUS',0,1.02,.75,1.1,.18,.03,mat(telemetry?'green':'cyan',true),false);status.userData.testingPulse=true;
  if(telemetry)for(const x of [-2.2,2.2])cylinder(root,'TELEMETRY_ANTENNA',x,2.32,-.95,.025,.55,'steel',false);
 }else if(id==='testing-range-target'){
  for(const x of [-3.3,3.3]){box(root,'TARGET_FOOT',x,.09,0,.4,.18,2.5,'dark');box(root,'TARGET_UPRIGHT',x,3.5,-.55,.24,7,.28,'steel');}
  box(root,'TARGET_HEADER',0,6.82,-.55,7,.28,.35,'orange');
  const face=new T.Group();face.name='TESTING_TARGET_FACE';face.position.set(0,3.65,-.45);root.add(face);
  const backing=cylinder(face,'TARGET_BACKING',0,0,0,3.1,.24,'dark');backing.rotation.x=Math.PI/2;
  for(const [index,radius]of [2.9,2.05,1.2].entries()){const sectorGeometry=new T.RingGeometry(radius-.38,radius,4,1,.025,Math.PI/6-.05);for(let sector=0;sector<12;sector++){const segment=mesh(face,'SCORING_SECTOR',sectorGeometry,mat((sector+index)%2?'steel':index===1?'orange':'cyan'),0,0,.135,false);segment.rotation.z=sector*Math.PI/6;segment.userData.scoringRing=index;}}
  ring(face,'TARGET_OUTER_RING',0,0,.145,3.05,'orange');ball(face,'TARGET_CENTER',0,0,.18,.48,mat('cyan',true));
  const tracker=box(face,'TARGET_TRACKING_LINE',0,0,.22,.025,5.8,.018,mat('green',true),false);tracker.userData.testingTracker=true;
 }else if(id==='testing-blast-door'){
  for(const side of [-1,1]){box(root,'DOOR_JAMB',side*5,3.5,0,2,7,1.4,'dark');box(root,'JAMB_TRIM',side*4.08,3.25,.76,.12,6.5,.08,'orange',false);for(let i=0;i<6;i++)box(root,'JAMB_PLATE',side*5,.7+i*1.05,.73,1.5,.8,.06,'steel',false);}
  box(root,'DOOR_HEADER',0,6.55,0,8, .9,1.4,'steel');
  for(const side of [-1,1]){const panel=new T.Group();panel.name='TESTING_SLIDING_PANEL';panel.position.set(side*5,3,.02);panel.userData={collisionDisabled:true,testingDoorPanel:side};root.add(panel);box(panel,'DOOR_PANEL',0,0,0,1.75,5.65,.28,'slate',false);for(const z of [-.16,.16])for(const y of [-1.9,0,1.9])box(panel,'PANEL_RIB',0,y,z,1.65,.13,.06,'steel',false);box(panel,'PANEL_HANDLE',-side*.45,0,.25,.12,.6,.12,'orange',false);}
  for(const x of [-3,0,3]){const beacon=box(root,'HATCH_STATUS',x,6.5,.76,.55,.16,.06,mat('cyan',true),false);beacon.userData.testingPulse=true;}
 }else if(id==='testing-containment-core'){
  cylinder(root,'CORE_PLINTH',0,.11,0,3.9,.22,'dark').userData.walkableFloor=true;
  cylinder(root,'CORE_INNER_BASE',0,.3,0,2.7,.2,'steel');ring(root,'BASE_SERVICE_RING',0,.43,0,3.4,'orange',Math.PI/2);
  const center=ball(root,'CONTAINMENT_SPHERE',0,3,0,1.18,mat('cyan',true));center.userData.testingCore=true;
  ball(root,'OBSERVATION_SHELL',0,3,0,1.55,mat('cyan',false,.13));
  for(let i=0;i<3;i++){const g=new T.Group();g.name='TESTING_ORBITAL_GIMBAL';g.position.y=3;g.userData.testingOrbit=i+1;g.rotation.set(i===0?Math.PI/2:i===1?.75:-.75,i===2?Math.PI/2:0,0);root.add(g);ring(g,'LUMINOUS_CORE_RING',0,0,0,1.65+i*.12,i===1?'orange':'cyan');for(let j=0;j<4;j++){const a=j*Math.PI/2,clamp=box(g,'GIMBAL_CLAMP',Math.cos(a)*(1.65+i*.12),Math.sin(a)*(1.65+i*.12),0,.3,.3,.24,'steel',false);clamp.rotation.z=a;}}
  for(const [x,z]of [[-3.35,0],[3.35,0],[0,-3.35],[0,3.35]]){pipe(root,'SERVICE_RISER',[x,.25,z],[x,5.6,z],.13);const inset={x:x*.65,z:z*.65};pipe(root,'UPPER_SERVICE_FEED',[x,5.6,z],[inset.x,5.6,inset.z],.13);cylinder(root,'COOLING_PUMP',x,.9,z,.35,1.1,'slate');for(const y of [.5,1.3,4.4])cylinder(root,'PIPE_COLLAR',x,y,z,.2,.12,'orange',false);}
  ring(root,'TOP_CONTAINMENT_RING',0,5.7,0,2.8,'steel',Math.PI/2);
 }
 return root;
}

/** Decorative movement stays inside the static model envelope. */
export function updateTestingModel(root,elapsed=0){
 const t=Math.max(0,Number(elapsed)||0),doorOpen=root.userData.testingDoorOpen!==false;
 root.traverse(node=>{
  if(node.userData.testingTracker)node.rotation.z=t*.42;
  if(node.userData.testingOrbit){const speed=.07+node.userData.testingOrbit*.025;node.rotation.z=t*speed;}
  if(node.userData.testingCore)node.scale.setScalar(1.18*(1+Math.sin(t*1.4)*.025));
  if(node.userData.testingDoorPanel)node.position.x=node.userData.testingDoorPanel*(doorOpen?5:2.8);
  if(node.userData.testingPulse&&node.material?.emissive)node.material.emissiveIntensity=.46+Math.sin(t*1.8)*.12;
 });
}
