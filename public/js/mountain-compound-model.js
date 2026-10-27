import * as T from '../vendor/three/three.module.min.js';
import {createTestingModel,updateTestingModel} from './factory-testing-props.js';

/** Cutaway underground power facility. The live room owns every access decision. */
export function createMountainCompoundLand(environment={}){
 const editableEquipment=[environment.factoryTesting,environment.builderScene?.sourceFactoryTesting,environment.builderScene?.layoutMeta?.factoryTesting].some(settings=>settings?.editableEquipment===true);
 const authored=environment.builderScene?.objects||[],authoredConsoles=authored.some(object=>['testing-telemetry-terminal','testing-launch-console'].includes(object.asset?.buildAssetId||object.modelId)),authoredCore=authored.some(object=>(object.asset?.buildAssetId||object.modelId)==='testing-containment-core');
 const root=new T.Group();root.name='MUZIKAZ_MOUNTAIN_COMPOUND';
 root.userData={proceduralLand:true,layout:'mountain-compound',streetHeightAt:()=>0,editableEquipment};
 const materials=new Map(),cube=new T.BoxGeometry(1,1,1),tube=new T.CylinderGeometry(1,1,1,20),animations=[];
 const colors={floor:'#202d35',steel:'#84999e',dark:'#0e1c26',wall:'#33434d',trim:'#4c646d',white:'#d9e8e4',amber:'#f2b75f',teal:'#52ddc9',red:'#e16d62',rock:'#26313a',blue:'#61a8dc'};
 const mat=(color,glow=false)=>{const key=color+':'+glow;if(!materials.has(key))materials.set(key,new T.MeshStandardMaterial({color:colors[color]||color,metalness:color==='steel'?.75:.22,roughness:color==='steel'?.35:.78,emissive:glow?(colors[color]||color):'#000000',emissiveIntensity:glow?.58:0}));return materials.get(key);};
 const mesh=(parent,name,geometry,material,x,y,z,solid=true)=>{const node=new T.Mesh(geometry,typeof material==='string'?mat(material):material);node.name='COMPOUND_'+name;node.position.set(x,y,z);node.castShadow=solid;node.receiveShadow=true;if(!solid)node.userData.collisionDisabled=true;parent.add(node);return node;};
 const box=(parent,name,x,y,z,w,h,d,color='wall',solid=true)=>{const node=mesh(parent,name,cube,color,x,y,z,solid);node.scale.set(w,h,d);return node;};
 const cylinder=(parent,name,x,y,z,r,h,color='steel',solid=true)=>{const node=mesh(parent,name,tube,color,x,y,z,solid);node.scale.set(r,h,r);return node;};
 const group=(name,x=0,z=0)=>{const node=new T.Group();node.name='COMPOUND_'+name;node.position.set(x,0,z);root.add(node);return node;};
 function panel(text,sub,x,y,z,width=9,height=1.5,color='teal',rotation=0){
  let canvas=null,texture=null,context=null;
  if(typeof document!=='undefined'){canvas=document.createElement('canvas');canvas.width=1200;canvas.height=320;context=canvas.getContext('2d');if(context){texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;}}
  const material=new T.MeshBasicMaterial({map:texture,color:texture?'#ffffff':colors[color]||color,side:T.DoubleSide});
  const face=mesh(root,'SIGN_'+text,new T.PlaneGeometry(width,height),material,x,y,z,false);face.rotation.y=rotation;
  const draw=(title=text,detail=sub,accent=colors[color]||color)=>{if(!context)return;const ctx=context;ctx.fillStyle='#0c1a23';ctx.fillRect(0,0,1200,320);ctx.strokeStyle=accent;ctx.lineWidth=5;ctx.strokeRect(10,10,1180,300);ctx.fillStyle=accent;ctx.fillRect(28,30,12,260);ctx.textAlign='left';ctx.font='700 '+(title.length>29?47:62)+'px system-ui';ctx.fillText(title,70,134,1060);ctx.fillStyle='#bfd4d6';ctx.font='500 28px system-ui';ctx.fillText(detail||'',73,208,1050);ctx.strokeStyle='#35515d';ctx.lineWidth=2;for(let i=0;i<7;i++){ctx.beginPath();ctx.moveTo(74+i*150,253);ctx.lineTo(162+i*150,253);ctx.stroke();}texture.needsUpdate=true;};
  draw();return {face,draw};
 }
 const stripe=(name,x,z,w,d,color='amber')=>box(root,name,x,.018,z,w,.012,d,color,false);
 function consoleAt(name,x,z,caption,sub){
  if(editableEquipment||authoredConsoles&&['RETURN_LIFT_CONSOLE','CONTAINMENT_CONSOLE','DEEP_ACCESS_CONSOLE'].includes(name))return {draw:()=>{}};
  box(root,name+'_BASE',x,.55,z,3.8,1.1,1.6,'dark');box(root,name+'_TOP',x,1.15,z,4.1,.15,1.85,'steel');
  box(root,name+'_SCREEN_FRAME',x,2,z-.35,4,1.7,.25,'dark');
  const display=panel(caption,sub,x,2,z-.205,3.65,1.4,'teal');
  for(const dx of [-1.2,-.6,0,.6,1.2]){cylinder(root,name+'_BUTTON',x+dx,1.26,z+.4,.085,.045,dx===0?mat('amber',true):'steel',false);}
  for(const side of [-1,1])box(root,name+'_HANDLE',x+side*1.6,1.35,z+.5,.1,.2,.45,'steel',false);
  return display;
 }
 function arch(name,z,width=6,height=5,color='steel'){
  for(const side of [-1,1]){box(root,name+'_JAMB',side*(width/2+.35),height/2,z,.7,height,1.4,color);box(root,name+'_GUIDE',side*(width/2+.8),height/2,z+.72,.13,height,.12,mat('teal',true),false);}
  box(root,name+'_LINTEL',0,height+.2,z,width+1.4,.8,1.4,color);
  for(const side of [-1,1])for(let y=.6;y<height-.3;y+=.7){const mark=box(root,name+'_HAZARD',side*(width/2+.36),y,z+.72,.55,.15,.025,'amber',false);mark.rotation.z=side*.35;}
 }
 function wallRibs(x,start,end,skip=[]){for(let z=start;z<=end;z+=8){if(skip.includes(z))continue;box(root,'BULKHEAD_RIB',x,3.6,z,.35,7.2,.55,'trim');box(root,'WALL_LAMP',x-Math.sign(x)*.23,4.4,z,.08,1.5,.25,mat('teal',true),false);}}
 // The complete atlas footprint is a flat physical floor; the architecture
 // bounds the usable corridor and chambers, with no opaque ceiling in overview.
 box(root,'WALKABLE_FLOOR',0,-.15,0,160,.3,160,'floor').userData.walkableFloor=true;
 box(root,'FACILITY_FLOOR',0,-.025,-3,74,.05,98,'#2c3d46',false);
 for(const x of [-37,37]){box(root,'OUTER_HALL_WALL',x,4,-23,.7,8,54,'wall');wallRibs(x,-47,1);}
 box(root,'CORE_BACK_WALL',0,4,-50,74,8,.7,'wall');
 // East and west chamber shoulders leave a six metre checkpoint entrance.
 for(const side of [-1,1])box(root,'ENTRY_BULKHEAD',side*20.75,4,3,31.5,8,.7,'wall');
 for(const x of [-8,8]){
  // The east service doorway is a real opening through the corridor wall.
  // Its ends keep the checkpoint corridor and the surface-lift enclosure solid.
  if(x===8){for(const [from,to]of [[3,26],[36,47]])box(root,'ENTRY_CORRIDOR_WALL',x,3.5,(from+to)/2,.6,7,to-from,'wall');wallRibs(x,7,43,[31]);}
  else{box(root,'ENTRY_CORRIDOR_WALL',x,3.5,25,.6,7,44,'wall');wallRibs(x,7,43);}
 }
 // Facility receiving stays on the entry level, before the deep-access gate.
 // The ordinary placed-item pipeline supplies its terminal and freight crates.
 box(root,'SERVICE_HALL_FLOOR',22,.006,31,28,.012,24,'#314b54',false);
 box(root,'SERVICE_HALL_EAST_WALL',36,3.5,31,.6,7,24,'wall');
 for(const z of [19,43]){box(root,'SERVICE_HALL_END_WALL',22,3.5,z,28,7,.6,'wall');box(root,'SERVICE_HALL_ROOF_EDGE',22,7.1,z,28,.3,.35,'steel',false);}
 for(const z of [26,36]){box(root,'SERVICE_DOOR_JAMB',8,3.4,z,.75,6.8,.4,'steel');box(root,'SERVICE_DOOR_LIGHT',7.58,3.4,z,.05,5.5,.12,mat('teal',true),false);}
 box(root,'SERVICE_DOOR_LINTEL',8,6.7,31,.8,.65,10.4,'steel');
 for(const z of [22,31,40]){box(root,'SERVICE_HALL_COLUMN',35.5,3.5,z,.4,7,.4,'trim');box(root,'SERVICE_HALL_RAFTER',22,7,z,27,.22,.25,'steel',false);box(root,'SERVICE_HALL_LIGHT',22,6.7,z,21,.045,.1,mat('white',true),false);}
 panel('SERVICE / FACILITY RECEIVING','CERTIFIED SUPPLIES · MANIFESTS · SURFACE FREIGHT',22,5.3,19.4,24,2,'amber');
 panel('RECEIVING →', 'WALK THROUGH THE EAST SERVICE DOOR',7.5,5,31,8,1.4,'teal',-Math.PI/2);
 panel('← SURFACE RETURN LIFT','MAIN CORRIDOR · RETURN TO THE PROVING GROUNDS',22,5.2,42.6,23,1.8,'teal',Math.PI);
 for(const z of [28,34])stripe('SERVICE_WALKWAY_EDGE',16,z,25,.08,'teal');
 for(const x of [11,16,21]){const arrow=box(root,'SERVICE_ROUTE_ARROW',x,.022,31,.65,.012,.65,'teal',false);arrow.rotation.y=Math.PI/4;}
 for(const z of [22,39]){
  // Shallow outer-wall racks leave the receiving apron and crate lanes clear.
  for(const x of [33.35,35.05])for(const end of [-2.3,2.3])box(root,'SERVICE_STORAGE_UPRIGHT',x,1.8,z+end,.12,3.6,.12,'steel');
  for(const y of [.3,1.55,2.8]){box(root,'SERVICE_STORAGE_SHELF',34.2,y,z,1.8,.12,5,'trim');for(const offset of [-1.5,0,1.5]){box(root,'SERVICE_SUPPLY_BIN',34.2,y+.35,z+offset,1.3,.58,1.15,'dark');box(root,'SERVICE_BIN_LABEL',33.54,y+.39,z+offset,.025,.21,.56,'amber',false);}}
  panel('STORES / SEALED SUPPLIES','KEEP THE CENTRAL RECEIVING LANE CLEAR',35.6,4.8,z,7,1.2,'teal',-Math.PI/2);
 }

 box(root,'LIFT_BACK_WALL',0,3.5,47,16,7,.65,'wall');
 for(const z of [7,19,31,44]){box(root,'CORRIDOR_ROOF_RIB',0,7,z,16.7,.3,.45,'steel',false);box(root,'CORRIDOR_LED',0,6.75,z,13,.06,.12,mat('white',true),false);}
 for(const z of [-46,-32,-15,1]){box(root,'HALL_CROSSBEAM',0,8.15,z,74,.3,.6,'steel',false);for(const x of [-26,26]){const brace=box(root,'HALL_BEAM_BRACE',x,7.75,z,20,.13,.2,'trim',false);brace.rotation.z=x<0?.06:-.06;}}
 // Rough outer rock faces suggest a mountain excavation in a readable cutaway.
 for(const side of [-1,1])for(let row=0;row<6;row++){
  const rock=mesh(root,'MOUNTAIN_ROCK_FACE',new T.DodecahedronGeometry(1,0),mat('rock'),side*(45+row%2*2),3.5,-45+row*17,true);rock.scale.set(6+row%3,4+row%2*2,9);rock.rotation.set(row*.2,side*.35,row*.05);
 }
 for(let i=0;i<7;i++){const stone=mesh(root,'BACK_ROCK_CUT',new T.DodecahedronGeometry(1,0),mat('rock'),-40+i*13,4.5,-58,true);stone.scale.set(8,5+i%2,7);stone.rotation.y=i*.4;}
 // Return lift and checkpoint are deliberately clear at their interaction feet.
 box(root,'RETURN_LIFT_PAD',0,.005,37,11,.01,10,'#3c5660',false);
 for(const x of [-5.4,5.4])stripe('LIFT_GUIDE',x,37,.13,9,'teal');
 for(const side of [-1,1])box(root,'LIFT_MACHINERY',side*5.5,2.2,43,2.3,4.4,4,'dark');
 consoleAt('RETURN_LIFT_CONSOLE',-5,33,'SURFACE LIFT','RETURN TO THE TESTING GROUNDS');
 panel('MUZIKAZ / MOUNTAIN COMPOUND','UNDERGROUND SYSTEMS · AUTHORIZED PERSONNEL',0,5.2,46.6,14,2.2,'amber');
 panel('01 / CONTAINMENT CHECKPOINT','WALK TO THE CONSOLE · RESTORE THE CIRCUIT',0,5.6,13,12,1.7,'teal');
 consoleAt('CONTAINMENT_CONSOLE',0,4.5,'CONTAINMENT CONTROL','COMPLETE THE CIRCUIT TO REQUEST DEEP ACCESS');
 arch('CHECKPOINT_ARCH',3,10,5.2);
 // Paired conduits and cable trays run overhead, clear of every walking route.
 for(const x of [-6.8,6.8]){const pipe=cylinder(root,'SERVICE_PIPE',x,5.8,25,.18,40,'steel',false);pipe.rotation.x=Math.PI/2;for(const z of [7,18,29,40]){const clamp=mesh(root,'PIPE_CLAMP',new T.TorusGeometry(.21,.035,5,12),mat('trim'),x,5.8,z,false);clamp.rotation.x=0;}}
 stripe('ENTRY_CENTERLINE',0,22,.11,23,'teal');
 for(const z of [28,21,14])for(const side of [-1,1]){const arrow=box(root,'ENTRY_ARROW',side*.4,.025,z,.9,.012,.1,'teal',false);arrow.rotation.y=side*.55;}
 // The deep security threshold is enforced by the shared server at z=-26.
 // Door leaves are visual only; they cannot create different collision worlds.
 for(const side of [-1,1])box(root,'DEEP_BULKHEAD',side*20.75,4,-25,31.5,8,.8,'wall');
 arch('DEEP_SECURITY_ARCH',-25,10,5.5);
 const leaves=[];for(const side of [-1,1]){const leaf=group('DEEP_SECURITY_LEAF',side*6.8,-25);box(leaf,'DEEP_DOOR_PANEL',0,2.6,0,2.8,5.2,.25,'dark',false);box(leaf,'DEEP_DOOR_INLAY',0,2.6,.14,2.55,4.9,.025,'trim',false);for(const y of [1.1,2.2,3.3,4.4])box(leaf,'DEEP_DOOR_BAND',0,y,.17,2.4,.08,.02,'amber',false);leaf.userData.side=side;leaves.push(leaf);}
 const gateStatus=panel('02 / DEEP CORE ACCESS','LOCKED · CONTAINMENT CLEARANCE REQUIRED',0,6.5,-24.5,15,1.8,'amber');
 consoleAt('DEEP_ACCESS_CONSOLE',-5,-21.5,'DEEP CORE / SECURITY','USE THE HATCH CONTROL AT THE MARKED CHECKPOINT');
 stripe('DEEP_APPROACH',0,-20,12,8,'#3b5660');
 for(const x of [-6,6])stripe('DEEP_LIMIT',x,-20,.12,8,'amber');
 // Observation room has an open central door, consoles against its outer wall,
 // and clear walking space at (24,-20) for jobs and local-map destinations.
 const glass=new T.MeshStandardMaterial({color:'#72b8ca',roughness:.17,metalness:.22,transparent:true,opacity:.28,side:T.DoubleSide});
 for(const [z,length]of [[-8,10],[-37,22]]){box(root,'OBSERVATION_FRAME',16,2.5,z,.22,5,length,'steel');box(root,'OBSERVATION_GLASS',16.13,2.6,z,.035,4.5,length-.6,glass,false);}
 for(const z of [-13,-26]){box(root,'OBSERVATION_DOOR_JAMB',16,2.5,z,.3,5,.3,'steel');}
 panel('OBSERVATION / SYSTEMS','POWER · TEMPERATURE · CONTAINMENT',26,6,-12,15,1.6,'teal');
 for(const z of [-16,-24,-40]){
  box(root,'SERVER_RACK',33,1.8,z,2.2,3.6,3,'dark');
  for(let row=0;row<7;row++){box(root,'RACK_DRAWER',31.87,.4+row*.43,z,.05,.28,2.7,'trim',false);for(const dz of [-.8,0,.8]){const led=box(root,'RACK_LED',31.82,.4+row*.43,z+dz,.025,.06,.12,mat('teal',true),false);animations.push(t=>{led.visible=Math.sin(t*.8+row+z+dz)>-.5;});}}
 }
 const observation=consoleAt('OBSERVATION_TERMINAL',26,-23.5,'CORE TELEMETRY','STANDBY · AWAITING AUTHORIZED TEST');
 // The fictional containment core is the same reusable advanced item as Builder.
 const core=editableEquipment||authoredCore?null:createTestingModel('testing-containment-core');
 if(core){core.name='COMPOUND_CONTAINMENT_CORE';core.position.set(-18,0,-36);root.add(core);}
 box(root,'CORE_PLINTH',-18,.08,-36,13,.16,14,'dark').userData.walkableFloor=true;
 for(const x of [-24.8,-11.2])stripe('CORE_SAFETY_BOUNDARY',x,-36,.12,16,'amber');
 for(const z of [-44,-28])stripe('CORE_SAFETY_BOUNDARY',-18,z,13.5,.12,'amber');
 panel('DEEP HALL / CONTAINMENT CORE','MONITOR THE POWER SYSTEM · REPORT TO CONTROL',-18,6.6,-49.5,24,2.1,'teal');
 for(const x of [-30,-7]){
  cylinder(root,'COOLANT_RESERVOIR',x,2.8,-43,1.2,5.6,'steel');
  for(const y of [.8,4.8])cylinder(root,'RESERVOIR_COLLAR',x,y,-43,1.25,.16,'dark',false);
  const outlet=cylinder(root,'COOLANT_OUTLET',x,1.5,-40,.2,5,'teal',false);outlet.rotation.x=Math.PI/2;
  const valve=mesh(root,'COOLANT_VALVE',new T.TorusGeometry(.4,.045,7,18),mat('amber'),x,1.5,-37.5,false);animations.push(t=>{valve.rotation.z=Math.sin(t*.2)*.2;});
 }
 for(const x of [-31,-26,-21,-16]){box(root,'WEST_ELECTRICAL_CABINET',x,1.7,-9,3.3,3.4,2,'dark');box(root,'CABINET_FACE',x,1.7,-7.96,3,3.1,.04,'steel',false);box(root,'CABINET_STATUS',x,2.5,-7.92,2.4,.2,.04,mat('teal',true),false);for(const dx of [-.8,.8])box(root,'CABINET_HANDLE',x+dx,1.7,-7.85,.08,.5,.08,'dark',false);}
 panel('EMERGENCY POWER / AUXILIARY BUS','ISOLATED CIRCUIT · CONTROLLED FROM CHECKPOINT',-23,4.8,-7.9,19,1.5,'amber');
 // Floor wayfinding is paint, never a false elevated walking surface.
 for(const x of [-2.5,2.5])stripe('HALL_WALKWAY_EDGE',x,-17,.08,50,'teal');
 for(let z=-44;z<=0;z+=8)stripe('HALL_WALKWAY_DASH',0,z,.12,2.5,'white');
 let deepOpen=false,containmentState='awaiting',lastStatus='',doorAmount=0;
 root.userData.setTestingState=(state={},serverTime=0)=>{
  const testing=state.testing||state,own=state.player?.testing||state.self?.testing||testing.player||testing.own||testing;
  const sessions=Array.isArray(testing.sessions)?testing.sessions:Object.values(testing.sessions||{}),session=own.containment||own.session||sessions.find(row=>row.session?.containment)?.session?.containment||{};
  deepOpen=Boolean(own.clearance?.deep||own.containment?.clearance?.deep||session.clearance?.deep||session.deepClearance||testing.clearance?.deep);
  containmentState=String(session.status||session.phase||own.containment?.status||'awaiting');
  const status=[deepOpen,containmentState].join(':');if(status!==lastStatus){lastStatus=status;gateStatus.draw('02 / DEEP CORE ACCESS',deepOpen?'AUTHORIZED · DEEP HALL AVAILABLE':'LOCKED · CONTAINMENT CLEARANCE REQUIRED',deepOpen?colors.teal:colors.amber);observation.draw('CORE TELEMETRY',deepOpen?'CONTAINMENT STABLE · CORE MONITORING ONLINE':'CONTROL STATUS: '+containmentState.toUpperCase(),deepOpen?colors.teal:colors.blue);}
  root.userData.testingVisualState={deepOpen,containmentState,serverTime:Number(serverTime)||0};
 };
 root.userData.updateTestingEffects=(elapsed=0,reducedMotion=false)=>{
  const time=reducedMotion?0:Math.max(0,Number(elapsed)||0);for(const animate of animations)animate(time);
  doorAmount=reducedMotion?(deepOpen?1:0):doorAmount+((deepOpen?1:0)-doorAmount)*.08;
  for(const leaf of leaves)leaf.position.x=leaf.userData.side*(6.8+doorAmount*2.4);
  core?.userData.updateTestingEffects?.(time,reducedMotion);
  if(core)updateTestingModel(core,time);
 };
 root.userData.setFactoryTestingState=root.userData.setTestingState;root.userData.updateFactoryTestingEffects=root.userData.updateTestingEffects;root.userData.setTestingState({});root.userData.updateTestingEffects(0,true);return root;
}
