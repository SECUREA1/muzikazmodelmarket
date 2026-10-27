import * as T from '../vendor/three/three.module.min.js';
import {FACTORY_STATIONS,FACTORY_STATION_MODELS} from './missile-factory-config.js';
import {constructionCutoutPatches,createConstructionBaseGeometry} from './construction-terrain.js';

export const FACTORY_MODEL_INFO=Object.freeze({
 'factory-training-missile':['Atlas Training Missile','Factory-crafted inert training collectible with segmented shell, stabilizer fins and a display cradle.',[2.4,2.3,8.7]],
 'factory-cargo-rocket':['Atlas Cargo Rocket','Factory-crafted cargo rocket collectible with booster pods, payload fairing and a service cradle.',[4.2,3.7,12.8]],
 'factory-fabricator':['CNC Shell Fabricator','Enclosed industrial shell press with sliding tool head, stock rollers and an operator console.',[7,4.8,4]],
 'factory-assembly-jig':['Rocket Assembly Jig','Open assembly cradle with twin robotic arms, segmented workpiece and overhead service gantry.',[11,6.5,5]],
 'factory-calibration-rig':['Systems Calibration Rig','Circular inspection arch, animated scan bar and twin systems consoles.',[4.8,4.8,4]],
 'factory-procurement-terminal':['Procurement Terminal','MZK procurement desk with stock manifest screen and material bins.',[6,2.4,3]],
 'factory-dispatch-terminal':['Factory Dispatch Terminal','Shipment console with freight labels, finished item pallet and dispatch screen.',[6,2.4,3]],
 'factory-conveyor':['Industrial Roller Conveyor','Steel material conveyor with individual cylindrical rollers and safety rails.',[3.5,1.1,8]],
 'factory-loading-bay':['Factory Freight Loading Bay','Drive-over freight loading pad with high-visibility lane markings and a broad clear truck approach.',[9,.12,14]]
});

function workshop(){
 const materials=new Map(),cube=new T.BoxGeometry(1,1,1),round=new T.CylinderGeometry(1,1,1,16);
 const palette={steel:'#93a9ad',dark:'#172a34',floor:'#293c44',white:'#e7eeec',orange:'#ef8b45',teal:'#53d4d0',yellow:'#e6c765',glass:'#72b7c6',black:'#0c1b23'};
 const mat=(color,glow=false)=>{const key=color+':'+glow;if(!materials.has(key))materials.set(key,new T.MeshStandardMaterial({color:palette[color]||color,roughness:color==='steel'?.35:.72,metalness:color==='steel'?.7:.2,emissive:glow?(palette[color]||color):'#000000',emissiveIntensity:glow?.55:0}));return materials.get(key);};
 const mesh=(root,name,geometry,color,x,y,z,solid=true)=>{const node=new T.Mesh(geometry,typeof color==='string'?mat(color):color);node.name='FACTORY_'+name;node.position.set(x,y,z);node.castShadow=solid;node.receiveShadow=true;if(!solid)node.userData.collisionDisabled=true;root.add(node);return node;};
 const box=(root,name,x,y,z,w,h,d,color='dark',solid=true)=>{const node=mesh(root,name,cube,color,x,y,z,solid);node.scale.set(w,h,d);return node;};
 const cylinder=(root,name,x,y,z,r,h,color='steel',solid=true)=>{const node=mesh(root,name,round,color,x,y,z,solid);node.scale.set(r,h,r);return node;};
 function sign(root,text,x,y,z,w=8,h=1,color='#e7eeec',sub=''){
  let texture=null;if(typeof document!=='undefined'){const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;const ctx=canvas.getContext('2d');if(ctx){ctx.fillStyle='#102832';ctx.fillRect(0,0,1024,256);ctx.fillStyle=color;ctx.textAlign='center';ctx.font='700 '+(text.length>24?48:65)+'px system-ui';ctx.fillText(text,512,sub?118:155,985);if(sub){ctx.fillStyle='#9fc1c6';ctx.font='500 27px system-ui';ctx.fillText(sub,512,190,990);}texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;}}
  return mesh(root,'SIGN_'+text,new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:texture,color:texture?'#ffffff':color,side:T.DoubleSide}),x,y,z,false);
 }
 function consoleAt(root,name,x,z){box(root,name+'_PEDESTAL',x,.6,z,.9,1.2,.7);box(root,name+'_SCREEN_FRAME',x,1.55,z,1.5,.85,.16);box(root,name+'_SCREEN',x,1.55,z+.09,1.3,.65,.025,mat('teal',true),false);box(root,name+'_KEYPAD',x,1.05,z+.3,1.4,.1,.5,'steel');for(const dx of [-.35,0,.35])cylinder(root,name+'_BUTTON',x+dx,1.12,z+.35,.05,.025,'orange',false);}
 return {mat,mesh,box,cylinder,sign,consoleAt};
}

/** Reusable, game-scale models also used for the actual crafted Backpack items. */
export function createFactoryModel(id){
 if(!FACTORY_MODEL_INFO[id])return null;const root=new T.Group(),{mat,mesh,box,cylinder,consoleAt}=workshop();root.name=id;root.userData.factoryModel=true;root.userData.factoryStationKind=FACTORY_STATION_MODELS[id]||null;
 if(id==='factory-training-missile'||id==='factory-cargo-rocket'){
  const cargo=id==='factory-cargo-rocket',length=cargo?10:6.6,radius=cargo?1:.58,y=cargo?2.05:1.35;
  const body=cylinder(root,'SEGMENTED_SHELL',0,y,0,radius,length,'white');body.rotation.x=Math.PI/2;
  const nose=mesh(root,'PAYLOAD_FAIRING',new T.ConeGeometry(radius,cargo?2:1.4,24),mat('orange'),0,y,-length/2-(cargo?1:.7));nose.rotation.x=-Math.PI/2;
  for(const z of [-length*.4,-length*.15,length*.15,length*.4]){const ring=mesh(root,'SHELL_COLLAR',new T.TorusGeometry(radius+.025,.035,6,24),mat('steel'),0,y,z,false);ring.rotation.x=0;}
  for(const side of [-1,1]){
   box(root,'CRADLE_FOOT',0,.12,side*length*.3,cargo?3.7:2.25,.24,.65,'dark');
   for(const x of [-radius,radius])box(root,'CRADLE_UPRIGHT',x,y*.43,side*length*.3,.16,y*.85,.24,'steel');
   const fin=box(root,'STABILIZER',side*(radius+.3),y,length*.35,.7,.12,1.6,'orange',false);fin.rotation.y=side*.23;
  }
  box(root,'DORSAL_FIN',0,y+radius+.25,length*.36,.12,.65,1.5,'orange',false);
  const nozzle=cylinder(root,'INERT_NOZZLE',0,y,length/2+.2,radius*.67,.5,'dark',false);nozzle.rotation.x=Math.PI/2;
  if(cargo)for(const x of [-1.45,1.45]){const booster=cylinder(root,'CARGO_BOOSTER',x,y,1,.38,6,'steel',false);booster.rotation.x=Math.PI/2;const cap=mesh(root,'BOOSTER_CAP',new T.ConeGeometry(.38,.9,16),mat('orange'),x,y,-2.45,false);cap.rotation.x=-Math.PI/2;}
  for(const z of [-length*.25,0,length*.25])box(root,'IDENTIFICATION_STRIPE',radius+.006,y,z,.025,.25,.6,'teal',false);
 }else if(id==='factory-fabricator'){
  box(root,'FABRICATOR_BASE',0,.45,0,7,.9,4);for(const x of [-3.25,3.25]){box(root,'PRESS_UPRIGHT',x,2.6,-.6,.45,4.1,2.6,'steel');box(root,'PRESS_SAFETY_STRIPE',x,1.3,.76,.47,.18,.03,'yellow',false);}
  box(root,'PRESS_CROSSHEAD',0,4.4,-.6,7,.7,2.6);box(root,'PRESS_WORKBED',0,1.2,.2,5.8,.18,2.6,'steel');
  const tool=box(root,'FABRICATOR_TOOL',0,3.1,-.5,1.1,1.8,1.1,'orange',false);tool.userData.factoryTool=true;
  for(let i=0;i<7;i++){const roller=cylinder(root,'STOCK_ROLLER',-2.5+i*.85,1.4,.45,.1,2.1,'steel',false);roller.rotation.x=Math.PI/2;}
  const billet=cylinder(root,'SHELL_BLANK',0,1.8,.1,.4,3,'white',false);billet.rotation.z=Math.PI/2;consoleAt(root,'FABRICATION_CONSOLE',2.6,1.1);
 }else if(id==='factory-assembly-jig'){
  box(root,'ASSEMBLY_BASE',0,.3,0,11,.6,5);for(const x of [-5,5]){box(root,'GANTRY_COLUMN',x,3,-1,.35,6,.35,'steel');box(root,'GANTRY_FOOT',x,.15,-1,1.3,.3,2,'orange');}box(root,'GANTRY_BEAM',0,6.1,-1,10.5,.45,.5,'orange');
  const shell=createFactoryModel('factory-training-missile');shell.name='FACTORY_LIVE_ASSEMBLY';shell.rotation.y=Math.PI/2;shell.position.y=.6;root.add(shell);
  for(const side of [-1,1]){const arm=new T.Group();arm.name='FACTORY_ROBOT_ARM';arm.position.set(side*3.9,.6,1.5);arm.userData.factoryArm=side;root.add(arm);cylinder(arm,'ROBOT_BASE',0,.3,0,.45,.6,'dark');const first=box(arm,'ROBOT_SHOULDER',0,1,0,.35,1.5,.35,'orange',false);first.rotation.z=side*.35;box(arm,'ROBOT_FOREARM',-side*.5,1.9,0,1.3,.28,.28,'steel',false);box(arm,'ROBOT_GRIPPER',-side*1.2,1.7,0,.18,.55,.4,'dark',false);}
 }else if(id==='factory-calibration-rig'){
  box(root,'SCAN_BASE',0,.16,0,4.8,.32,4);for(const x of [-2.15,2.15])box(root,'SCAN_COLUMN',x,2.5,-.6,.35,4.4,.5,'steel');box(root,'SCAN_HEADER',0,4.55,-.6,4.65,.4,.5,'orange');
  const arch=mesh(root,'SCAN_ARCH',new T.TorusGeometry(1.75,.16,8,32),mat('steel'),0,2.4,-.6);arch.scale.y=1.1;
  const scanner=box(root,'SCAN_LINE',0,2.4,-.35,3.4,.04,.05,mat('teal',true),false);scanner.userData.factoryScanner=true;consoleAt(root,'CALIBRATION_CONSOLE',1.45,1.3);
 }else if(id==='factory-conveyor'){
  for(const x of [-1.6,1.6]){box(root,'CONVEYOR_RAIL',x,.9,0,.16,.3,8,'steel');for(const z of [-3,3])box(root,'CONVEYOR_FOOT',x,.4,z,.18,.8,.35);}
  for(let i=0;i<18;i++){const roller=cylinder(root,'CONVEYOR_ROLLER',0,.88,-3.7+i*.435,.14,3,'steel',false);roller.rotation.z=Math.PI/2;roller.userData.factoryRoller=true;}
 }else if(id==='factory-loading-bay'){
  box(root,'LOADING_PAD',0,.02,0,9,.04,14,'dark').userData.walkableFloor=true;
  for(const x of [-4.25,4.25])box(root,'LOADING_LANE_EDGE',x,.047,0,.12,.006,13.5,'orange',false);
  for(const z of [-6.7,6.7])for(const x of [-3.4,3.4])box(root,'LOADING_CORNER',x,.047,z,1.8,.006,.12,'orange',false);
  for(let z=-5;z<=5;z+=2.5)box(root,'LOADING_CENTERLINE',0,.047,z,.1,.006,1.1,'white',false);
  for(const x of [-3.7,3.7])for(let z=-5;z<=5;z+=2){const mark=box(root,'LOADING_CHEVRON',x,.05,z,.38,.006,.1,'yellow',false);mark.rotation.y=x<0?-.65:.65;}
 }else{
  box(root,'TERMINAL_BODY',0,.65,0,6,1.3,2.4);box(root,'TERMINAL_TOP',0,1.34,0,6.2,.18,2.6,'steel');consoleAt(root,'ORDER_CONSOLE',0,-.35);
  for(const x of [-2.1,2.1])box(root,'STOCK_BIN',x,1.62,0,1.1,.42,1.1,id==='factory-dispatch-terminal'?'teal':'orange');
 }
 return root;
}

export function updateFactoryModel(root,elapsed=0,reducedMotion=false){
 const machine=root.userData.factoryMachineState,running=!reducedMotion&&(!machine||machine.processing),age=machine?Math.min(.75,Math.max(0,((globalThis.performance?.now?.()||0)-machine.receivedAt)/1000)):0;
 const t=running?(machine?Math.min((machine.readyAt-machine.startedAt)/1000,Math.max(0,(machine.serverTime-machine.startedAt)/1000+age)):Number(elapsed)||0):0;
 root.traverse(node=>{if(node.userData.factoryTool)node.position.y=3.1+Math.sin(t*.9)*.25;if(node.userData.factoryScanner)node.position.y=2.4+Math.sin(t*1.1)*1.3;if(node.userData.factoryArm)node.rotation.y=running?Math.sin(t*.65+node.userData.factoryArm)*.13:0;if(node.userData.factoryRoller)node.rotation.y=t*.7;});
}

/** Bind placed machines to shared server cycles. Unbound catalog previews
 * retain their demonstration animation; world machines rest while idle. */
export function applyFactoryMachineActivity(root,state){
 if(!root?.traverse)return;const stations=state?.stations||[],jobs=(state?.jobs||[]).map(row=>row.job||row),serverTime=Number(state?.serverTime)||0,receivedAt=globalThis.performance?.now?.()||0;
 root.updateWorldMatrix(true,true);
 root.traverse(model=>{
  const kind=model.userData.factoryStationKind;if(!kind)return;
  let owner=model;while(owner&&!owner.userData.builderObjectId)owner=owner.parent;
  const objectId=owner?.userData.builderObjectId,position=model.getWorldPosition(new T.Vector3());
  const station=stations.find(value=>value.objectId===objectId&&objectId)||stations.find(value=>{const equipment=value.equipmentPosition||value.position;return !value.objectId&&value.kind===kind&&equipment&&Math.hypot(position.x-equipment.x,position.z-equipment.z)<2;});
  if(!station){if(objectId)model.userData.factoryMachineState={processing:false,serverTime,startedAt:0,readyAt:0,receivedAt};return;}
  const job=jobs.find(value=>value.status==='processing'&&value.readyAt>serverTime&&value.steps?.[value.stepIndex]?.stationId===station.id);
  model.userData.factoryMachineState={stationId:station.id,processing:!!job,serverTime,startedAt:job?.cycleStartedAt||0,readyAt:job?.readyAt||0,receivedAt};
 });
}

export function createMissileFactoryLand(environment={}){
 const editableEquipment=[environment.factory,environment.builderScene?.sourceFactory,environment.builderScene?.layoutMeta?.factory].some(settings=>settings?.editableEquipment===true||settings?.editableStations===true);
 const root=new T.Group(),{mat,mesh,box,cylinder,sign}=workshop(),animations=[];root.name='MUZIKAZ_MISSILE_FACTORY';root.userData={proceduralLand:true,layout:'missile-factory',streetHeightAt:()=>0,editableEquipment};
 const floor=mesh(root,'WALKABLE_FLOOR',createConstructionBaseGeometry(T,160,constructionCutoutPatches(environment),{color:0x293c44}),mat('floor'),0,0,0);floor.rotation.x=-Math.PI/2;floor.userData.walkableFloor=true;
 box(root,'PRODUCTION_FLOOR',0,-.02,-12,110,.04,88,'#344b53',false);
 for(const x of [-55,55]){box(root,'HALL_SIDE_WALL',x,5.5,-12,.6,11,88,'dark');for(const z of [-48,-23,2,22]){box(root,'HALL_COLUMN',x-Math.sign(x)*.5,5,z,.45,10,.45,'steel');box(root,'HIGH_WINDOW',x-Math.sign(x)*.32,7,z,.04,3,13,'glass',false);}}
 box(root,'HALL_BACK_WALL',0,5.5,-56,110,11,.6,'dark');
 for(const z of [-51,-26,-1,24]){box(root,'EXPOSED_ROOF_TRUSS',0,11,z,111,.45,.5,'steel',false);for(const x of [-24,24]){const brace=box(root,'TRUSS_DIAGONAL',x,10.2,z,30,.2,.25,'steel',false);brace.rotation.z=x<0?.07:-.07;}box(root,'HALL_LIGHT',0,10.7,z,96,.08,.2,mat('white',true),false);}
 sign(root,'ATLAS / MISSILE FACTORY',0,8.4,-55.6,37,5,'#ef8b45','PROCURE  /  FABRICATE  /  ASSEMBLE  /  DELIVER');
 sign(root,'SHARED PRODUCTION HALL',0,7.8,25,28,3,'#a9e8e4','MZK CRAFTING  ·  CREW  ·  HAULAGE');
 // An eight metre cross aisle connects all walking stations. The freight lane
 // stays east of the calibration equipment from loading to dispatch.
 box(root,'PEDESTRIAN_CROSS_AISLE',-10,.025,10,82,.018,7,'#526970',false);
 box(root,'FREIGHT_LANE',40,.025,8,9,.018,78,'#526064',false);
 for(const x of [35.3,44.7])box(root,'FREIGHT_EDGE',x,.04,8,.1,.02,78,'yellow',false);
 for(let z=-25;z<=44;z+=9)box(root,'FREIGHT_CENTER',40,.04,z,.13,.02,3.6,'white',false);
 box(root,'ENTRY_PROMENADE',0,.025,43,18,.018,30,'#3c5a60',false);
 for(const x of [-9.2,9.2])box(root,'ENTRY_EDGE',x,.04,43,.1,.02,30,'teal',false);
 if(!editableEquipment)for(const station of FACTORY_STATIONS){const p=station.position;if(station.id==='factory-loading'){for(const x of [35.5,44.5])box(root,'LOADING_GUIDE',x,.055,p.z,.12,.02,14,'orange',false);sign(root,'05 / LOAD FREIGHT',40,5,p.z-8,12,1.8,'#ef8b45','PARK YOUR TRUCK IN THE MARKED BAY');continue;}box(root,'OPERATOR_PAD',p.x,.045,p.z,5,.03,3,'#3a666a',false);for(const x of [-2.6,2.6])box(root,'OPERATOR_EDGE',p.x+x,.065,p.z,.08,.015,3,'teal',false);}
 // Warehouse racks and stock fit behind workstations, clear of the haul route.
 for(const x of [-43,-27,47])for(const z of [-44,-34]){for(const dx of [-3.8,3.8])box(root,'WAREHOUSE_UPRIGHT',x+dx,2.8,z,.18,5.6,.18,'orange');for(const y of [.35,2.7,5.1]){box(root,'WAREHOUSE_SHELF',x,y,z,8,.2,3,'steel');for(const offset of [-2.6,0,2.6]){box(root,'MATERIAL_CRATE',x+offset,y+.7,z,2,1.2,2,'#827c68');box(root,'CRATE_STRAP',x+offset,y+.7,z+1.01,.15,1.2,.025,'yellow',false);}}}
 sign(root,'MATERIAL WAREHOUSE',-31,7,-48,29,2.5,'#dbe8e6','STOCK BINS  ·  PARTS  ·  INBOUND MATERIALS');
 if(!editableEquipment){const rocket=createFactoryModel('factory-cargo-rocket');rocket.name='FACTORY_SHOWCASE_CARGO_ROCKET';rocket.position.set(3,0,-34);rocket.rotation.y=Math.PI/2;root.add(rocket);
 box(root,'SHOWCASE_PAD',3,.025,-34,17,.04,10,'#25383e',false);sign(root,'CARGO ROCKET / MK II',3,5.5,-41,15,2,'#53d4d0','ASSEMBLE YOUR OWN CRAFTED COLLECTIBLE');}
 for(const [x,z]of [[-66,-57],[66,-57],[-66,62],[66,62]]){cylinder(root,'YARD_LIGHT_POLE',x,5,z,.12,10,'steel');box(root,'YARD_FLOODLIGHT',x,9.8,z,2,.4,.6,'white',false);}
 for(const z of [-70,70])for(const x of [-48,48])box(root,'YARD_FENCE',x,1,z,56,2,.15,'steel');
 box(root,'YARD_FENCE',-76,1,0,.15,2,140,'steel');for(const [z,depth]of [[-20.5,99],[55.5,29]])box(root,'YARD_FENCE',76,1,z,.15,2,depth,'steel');
 for(const z of [28,42])box(root,'PROVING_GATE_POST',76,2.5,z,.35,5,.35,'orange');box(root,'PROVING_GATE_HEADER',76,5,35,.4,.45,14,'steel');sign(root,'PROVING GROUNDS →',68,4.5,43,21,2,'#53d4d0','TEST YOUR CRAFTED MODEL AT THE EAST GATE');
 sign(root,'WELCOME / FACTORY JOBS',-19,3.1,48,17,3,'#ef8b45','MEET MARA  ·  SPEND MZK ON A BUILD ORDER');
 if(!editableEquipment)for(const [x,text]of [[-32,'01 / PROCUREMENT'],[-30,'02 / FABRICATION'],[0,'03 / ASSEMBLY'],[27,'04 / CALIBRATION'],[30,'06 / DISPATCH']]){const z=x===-32||x===30?28:0;sign(root,text,x,5.9,z-5.6,x===0?18:13,2,'#ef8b45');}
 for(const [x,z]of [[-60,40],[-60,48]]){box(root,'CREW_REST_BENCH',x,.55,z,5,.15,1.2,'#9b7c59');for(const dx of [-1.8,1.8])box(root,'BENCH_LEG',x+dx,.25,z,.14,.5,1,'steel');}
 sign(root,'PLANT & CREW YARD',-63,4.5,30,18,2,'#d9ebdd','EXISTING VEHICLES  /  SHARED CONTROLS');
 const previews=new Map();if(!editableEquipment){const production=new T.Group();production.name='FACTORY_LIVE_WORK_ORDER';production.position.set(-10,0,-20);production.rotation.y=Math.PI/2;production.userData.collisionDisabled=true;root.add(production);
 for(const [id,model]of [['training-missile',createFactoryModel('factory-training-missile')],['cargo-rocket',createFactoryModel('factory-cargo-rocket')]]){model.visible=false;previews.set(id,model);production.add(model);}
 sign(root,'LIVE WORK ORDER',-10,4.8,-27,14,1.5,'#53d4d0','SHARED PRODUCTION PROGRESS');}
 let liveJobs=[];
 root.userData.setFactoryState=(state,serverTime)=>{applyFactoryMachineActivity(root,{...state,serverTime});const incoming=state?.jobs||state?.orders||[];liveJobs=(Array.isArray(incoming)?incoming:Object.values(incoming)).map(row=>row.job||row);const active=liveJobs.find(job=>!['collected','cancelled'].includes(job.status));for(const [id,model]of previews){model.visible=active?.recipeId===id;if(!model.visible)continue;const assembled=Number(active.stepIndex)>=1,finished=Number(active.stepIndex)>=2||['haul','loaded','ready','completed'].includes(active.status);model.traverse(node=>{if(/STABILIZER|DORSAL_FIN|PAYLOAD_FAIRING|CARGO_BOOSTER|BOOSTER_CAP/.test(node.name))node.visible=assembled;if(/IDENTIFICATION_STRIPE|SHELL_COLLAR/.test(node.name))node.visible=finished;});}};
 root.userData.updateFactoryEffects=(elapsed,reducedMotion=false)=>{
  const t=reducedMotion?0:Number(elapsed)||0;updateFactoryModel(root,t,reducedMotion);for(const animate of animations)animate(t);
  root.userData.activeProductionCount=liveJobs.filter(job=>!['collected','cancelled'].includes(job.status)).length;
 };
 return root;
}
