import * as T from '../vendor/three/three.module.min.js';
import {FOREST_HARVEST_ITEMS} from './forest-harvest-items.js';
import {FORESTRY_ROAD_VEHICLES} from './road-vehicles.js';

/** Grounded native models shared by the forest, Builder and portable items. */
export function createForestHarvestModel(id){
 const info=FOREST_HARVEST_ITEMS[id];if(!info)return null;
 const root=new T.Group();root.name=info.name;root.userData={builderObject:true,modelId:id,dimensions:info.dimensions,forestHarvestModel:true};
 const mat=(color,roughness=.75,metalness=.2,extra={})=>new T.MeshStandardMaterial({color,roughness,metalness,...extra});
 const paint=mat('#dcae3f',.55,.48),green=mat('#345a4c'),dark=mat('#23312d'),steel=mat('#9ca9a4',.34,.78),wood=mat('#b18a58',.9,.02),rubber=mat('#171d1a',.94,.02),glass=mat('#a2d4cd',.1,.05,{transparent:true,opacity:.23,depthWrite:false,side:T.DoubleSide}),leaf=mat('#568552'),white=mat('#e8e9ce'),orange=mat('#de702d');
 const mesh=(name,geometry,material,position,parent=root,rotation=[0,0,0],collide=true)=>{const value=new T.Mesh(geometry,material);value.name=name;value.position.set(...position);value.rotation.set(...rotation);value.castShadow=value.receiveShadow=true;value.userData={collisionDisabled:!collide};parent.add(value);return value;};
 const box=(name,size,position,material=paint,parent=root,rotation=[0,0,0],collide=true)=>mesh(name,new T.BoxGeometry(...size),material,position,parent,rotation,collide);
 const cylinder=(name,radius,length,position,material=steel,parent=root,rotation=[0,0,0],collide=false)=>mesh(name,new T.CylinderGeometry(radius,radius,length,12),material,position,parent,rotation,collide);
 const tube=(name,a,b,r=.07,material=steel,parent=root)=>{const start=new T.Vector3(...a),end=new T.Vector3(...b),delta=end.clone().sub(start),part=cylinder(name,r,delta.length(),start.add(end).multiplyScalar(.5).toArray(),material,parent);part.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());return part;};
 const group=(name,position,parent=root)=>{const value=new T.Group();value.name=name;value.position.set(...position);parent.add(value);return value;};
 const bolt=(x,y,z,parent=root)=>cylinder('FORESTRY_FASTENER',.035,.025,[x,y,z],steel,parent,[Math.PI/2,0,0]);
 const console=(x,z)=>{box('FORESTRY_CONSOLE_PEDESTAL',[.25,1.05,.25],[x,.525,z],dark);box('FORESTRY_OPERATOR_CONSOLE',[1.1,.24,.65],[x,1.15,z],green,root,[-.25,0,0]);box('FORESTRY_STATUS_DISPLAY',[.46,.03,.28],[x-.15,1.3,z-.06],glass,root,[-.25,0,0],false);for(const dx of [.25,.4])cylinder('FORESTRY_CONTROL_BUTTON',.055,.035,[x+dx,1.31,z+.08],dx>.3?orange:leaf);};
 const log=(x,y,z,length=3,parent=root)=>{cylinder('FORESTRY_TIMBER_LOG',.19,length,[x,y,z],wood,parent,[Math.PI/2,0,0]);for(const side of [-1,1])cylinder('FORESTRY_LOG_END_GRAIN',.16,.018,[x,y,z+side*(length/2+.01)],white,parent,[Math.PI/2,0,0]);};
 const wheel=(x,z,r=.62)=>{const value=group('FORESTRY_DRIVE_WHEEL',[x,r,z]);cylinder('FORESTRY_RUBBER_TYRE',r,.36,[0,0,0],rubber,value,[0,0,Math.PI/2]);for(const side of [-1,1]){cylinder('FORESTRY_WHEEL_HUB',r*.55,.025,[side*.19,0,0],paint,value,[0,0,Math.PI/2]);for(let i=0;i<8;i++)box('FORESTRY_TYRE_LUG',[.41,.055,.17],[0,Math.cos(i*Math.PI/4)*r,Math.sin(i*Math.PI/4)*r],dark,value,[i*Math.PI/4,0,0],false);}value.userData.forestWheel=true;};
 const cab=(z,width=1.75,base=1.2)=>{const value=group('FORESTRY_PROTECTED_CAB',[0,base,z]);box('FORESTRY_CAB_FLOOR',[width,.12,1.7],[0,0,0],dark,value);box('FORESTRY_CAB_ROOF',[width+.12,.15,1.85],[0,1.75,0],green,value);for(const x of [-width/2,width/2])for(const end of [-.8,.8])box('FORESTRY_ROPS_POST',[.11,1.75,.11],[x,.86,end],paint,value);for(const end of [-.81,.81])box('FORESTRY_CAB_GLASS',[width-.12,1.4,.025],[0,.88,end],glass,value);for(const x of [-width/2,width/2])box('FORESTRY_SIDE_GLASS',[.025,1.4,1.5],[x,.88,0],glass,value);box('FORESTRY_OPERATOR_SEAT',[.65,.18,.65],[0,.42,.15],dark,value);box('FORESTRY_SEAT_BACK',[.65,.65,.12],[0,.75,.4],dark,value);box('FORESTRY_CAB_DASH',[width-.2,.2,.3],[0,.82,-.6],dark,value);for(const x of [-.47,.47]){cylinder('FORESTRY_JOYSTICK',.045,.22,[x,.68,0],steel,value);box('FORESTRY_STEP',[.35,.12,.8],[x*2,-.4,.2],steel,value);}cylinder('FORESTRY_AMBER_BEACON',.11,.2,[.5,1.93,.3],orange,value);return value;};
 const boom=(base,head=true)=>{const value=group('FORESTRY_GRAPPLE_BOOM',base);cylinder('FORESTRY_BOOM_TURRET',.42,.4,[0,.2,0],dark,value);tube('FORESTRY_MAIN_BOOM',[0,.35,0],[0,2.6,-1.7],.19,paint,value);tube('FORESTRY_BOOM_STICK',[0,2.6,-1.7],[0,1.4,-3.1],.16,paint,value);tube('FORESTRY_HYDRAULIC_RAM',[.24,.5,-.15],[.24,2.1,-1.4],.085,steel,value);tube('FORESTRY_HYDRAULIC_RAM',[.2,2.4,-1.6],[.2,1.7,-2.8],.075,steel,value);box(head?'FORESTRY_HARVESTER_HEAD':'FORESTRY_GRAPPLE_HEAD',[head?.85:.5,head?.7:.3,.55],[0,1.12,-3.1],head?orange:dark,value);for(const side of [-1,1])tube('FORESTRY_GRAPPLE_JAW',[side*.35,1.1,-3.1],[side*.2,.55,-3.1],.1,dark,value);return value;};
 if(info.kind==='lumber'){
  const [w,h,d]=info.dimensions;
  if(id==='forestry-lumber-dowel')cylinder('FORESTRY_TURNED_WOOD_DOWEL',w/2,d,[0,h/2,0],wood,root,[Math.PI/2,0,0],true);
  else{box('FORESTRY_MILLED_LUMBER',[w,h,d],[0,h/2,0],wood);for(const side of [-1,1])box('FORESTRY_TIMBER_END_GRAIN',[w*.94,h*.9,.003],[0,h/2,side*(d/2+.002)],white,root,[0,0,0],false);for(let x=-w*.3;x<=w*.35;x+=w*.23)box('FORESTRY_TIMBER_GRAIN',[Math.min(.006,w*.02),.001,d*.94],[x,h+.001,0],dark,root,[0,0,0],false);}
 }else if(info.kind==='vehicle'){
  const spec=FORESTRY_ROAD_VEHICLES[id];root.userData.roadVehicle=true;root.userData.vehicle={mode:'drive',speed:spec.speed,turnSpeed:spec.turn,seat:spec.seat};
  const grinder=id==='forestry-stump-grinder',truck=id==='forestry-log-truck',harvester=id==='forestry-harvester',width=spec.width,length=spec.length;
  box('FORESTRY_MAIN_CHASSIS',[width*.84,.45,length*.82],[0,.85,0],dark);box('FORESTRY_ENGINE_HOOD',[width*.7,.7,grinder?1.2:1.6],[0,1.35,grinder?.45:truck?-3.8:1.7],green);
  if(harvester||grinder){for(const side of [-1,1]){box('FORESTRY_TRACK_BELT',[.6,.75,grinder?2.6:3.6],[side*(width/2-.3),.43,.5],rubber);for(let z=-1;z<=2;z+=.3)box('FORESTRY_TRACK_SHOE',[.64,.07,.18],[side*(width/2-.3),.84,z*(grinder?.7:1)],steel);}}
  else for(const z of truck?[-3.4,2,3.5]:[-2.5,-1.1,1.2,2.8])for(const x of [-1,1])wheel(x*(width/2-.2),z,truck?.57:.62);
  cab(truck?-2.55:grinder?0:-.65,grinder?1.5:truck?2.25:1.75,grinder?.85:1.2);
  if(harvester)boom([.6,1,-.7]);
  if(id==='forestry-forwarder')boom([0,1.15,-.4],false);
  if(truck||id==='forestry-forwarder'){
   box('FORESTRY_TIMBER_DECK',[width*.9,.15,truck?6.3:3.5],[0,1.08,truck?1.4:1.65],green);
   for(const z of truck?[-1.3,1.4,4.1]:[.2,1.8,3.3])for(const x of [-1,1]){box('FORESTRY_LOAD_BUNK',[width+.15,.15,.25],[0,1.2,z],steel);box('FORESTRY_TIMBER_STAKE',[.14,1.85,.14],[x*width*.43,2.1,z],paint);}
  }
  if(grinder){const arm=box('FORESTRY_GRINDING_ARM',[.45,.35,1.5],[0,.65,-1.45],paint);const disc=cylinder('FORESTRY_GRINDING_DISC',.53,.18,[0,.49,-1.95],steel,root,[0,0,Math.PI/2]);disc.userData.forestCutter=true;box('FORESTRY_CUTTER_GUARD',[.65,.28,1.15],[0,.85,-1.9],orange);}
  for(const side of [-1,1])box('FORESTRY_HEADLIGHT',[.22,.13,.04],[side*width*.32,1.3,-length*.44],white);
 }else if(id==='forestry-axe'){
  box('FORESTRY_ASH_HANDLE',[.075,1.15,.065],[0,.575,0],wood);box('FORESTRY_FORGED_AXE_HEAD',[.43,.2,.13],[.12,1.1,0],steel,root,[0,0,-.12]);box('FORESTRY_AXE_EDGE',[.035,.22,.1],[.33,1.08,0],white);
 }else if(id==='forestry-chainsaw'){
  box('FORESTRY_CHAINSAW_MOTOR',[.32,.29,.4],[0,.18,.27],orange);box('FORESTRY_SAW_GUIDE_BAR',[.07,.14,.72],[0,.2,-.24],steel);for(let z=-.59;z<.1;z+=.07)for(const y of [.12,.28])box('FORESTRY_CHAIN_TOOTH',[.09,.025,.035],[0,y,z],dark);tube('FORESTRY_WRAP_HANDLE',[-.2,.15,.1],[-.2,.48,.1],.035,dark);tube('FORESTRY_WRAP_HANDLE',[-.2,.48,.1],[.2,.48,.1],.035,dark);box('FORESTRY_REAR_HANDLE',[.1,.15,.3],[0,.25,.6],dark);
 }else if(id==='forestry-planter'){
  cylinder('FORESTRY_PLANTING_TUBE',.06,1.2,[0,.65,0]);tube('FORESTRY_PLANTER_HANDLE',[-.2,1.2,0],[.2,1.2,0],.04,dark);box('FORESTRY_SEEDLING_TRAY',[.4,.16,.32],[0,.3,0],green);for(const x of [-.12,.12])for(const z of [-.1,.1])cylinder('FORESTRY_SEEDLING',.04,.3,[x,.52,z],leaf);
 }else if(id==='forestry-sawmill'){
  for(const x of [-3.6,0,3.6])for(const z of [-1.2,1.2])box('FORESTRY_MILL_SUPPORT',[.16,1.1,.16],[x,.55,z],dark);
  for(const z of [-1.3,1.3])box('FORESTRY_MILL_RAIL',[8.6,.2,.14],[0,1.1,z],green);
  for(let x=-3.9;x<=3.9;x+=.6)cylinder('FORESTRY_MILL_ROLLER',.11,2.5,[x,1.2,0],steel,root,[Math.PI/2,0,0]);
  for(const z of [-1.5,1.5])box('FORESTRY_SAW_GANTRY_POST',[.32,2.5,.32],[.4,2.1,z],orange);box('FORESTRY_SAW_COVER',[2,1,3.4],[.4,3.1,0],green);box('FORESTRY_BANDSAW_BLADE',[.05,1.6,2.7],[.4,2.05,0],steel);log(-1.5,1.55,0,2.2);console(3.2,2.5);
 }else if(id==='forestry-drying-kiln'){
  box('FORESTRY_KILN_REAR',[5.9,3.5,.14],[0,1.75,-2.5],green);for(const x of [-2.95,2.95])box('FORESTRY_KILN_SIDE',[.14,3.5,5],[x,1.75,0],green);box('FORESTRY_KILN_ROOF',[6.2,.2,5.4],[0,3.6,0],steel);for(const y of [.45,1.15,1.85,2.55]){box('FORESTRY_DRYING_RACK',[4.3,.09,3.8],[0,y,0],steel);for(let x=-1.7;x<=1.8;x+=.55)box('FORESTRY_KILN_LUMBER',[.4,.16,3.5],[x,y+.15,0],wood);}for(const x of [-1.6,1.6])cylinder('FORESTRY_KILN_VENT',.45,.22,[x,3.76,-1.4],dark);console(2.3,2.5);
 }else if(id==='forestry-nursery'){
  for(const x of [-2.3,2.3])for(const z of [-1.3,1.3])box('FORESTRY_NURSERY_LEG',[.12,.9,.12],[x,.45,z],dark);box('FORESTRY_PROPAGATION_BENCH',[5.2,.12,3],[0,.95,0],wood);
  for(let x=-2;x<=2;x+=.8)for(const z of [-.9,0,.9]){box('FORESTRY_SEEDLING_POT',[.4,.28,.4],[x,1.15,z],orange);cylinder('FORESTRY_SEEDLING_STEM',.025,.65,[x,1.59,z],wood);mesh('FORESTRY_SEEDLING_CROWN',new T.ConeGeometry(.23,.6,6),leaf,[x,1.95,z]);}
  tube('FORESTRY_IRRIGATION_PIPE',[-2.5,2.3,-1.35],[2.5,2.3,-1.35],.04,steel);for(let x=-2;x<=2;x++)box('FORESTRY_NURSERY_LABEL',[.48,.23,.035],[x,1.3,1.55],white);
 }else if(id==='forestry-workbench'){
  for(const x of [-2,2])for(const z of [-1,1])box('FORESTRY_JOINERY_LEG',[.2,1,.2],[x,.5,z],green);box('FORESTRY_JOINERY_TOP',[4.8,.2,2.6],[0,1.12,0],wood);box('FORESTRY_JOINERY_SHELF',[4.3,.12,2.2],[0,.28,0],wood);box('FORESTRY_TOOL_BACKBOARD',[4.9,1.2,.12],[0,1.9,-1.4],green);for(let x=-1.8;x<2;x+=.6){box('FORESTRY_TOOL_HANDLE',[.07,.45,.06],[x,1.9,-1.29],wood);box('FORESTRY_TOOL_HEAD',[.25,.09,.09],[x,2.13,-1.25],steel);}box('FORESTRY_BENCH_VICE',[.7,.3,.4],[1.5,1.37,1.1],steel);cylinder('FORESTRY_VICE_SCREW',.045,.8,[1.5,1.3,1.25],dark,root,[0,0,Math.PI/2]);box('FORESTRY_MEASURING_RULE',[2,.025,.12],[-.8,1.235,.2],white);for(let i=0;i<12;i++)box('FORESTRY_RULE_MARK',[.015,.005,.08],[-1.7+i*.15,1.25,.2],dark);box('FORESTRY_WORKPIECE',[1.6,.18,.7],[0,1.32,-.4],wood);
 }
 root.traverse(part=>{if(part.isMesh)part.userData.builderRoot=root;});root.updateMatrixWorld(true);return root;
}

export function updateForestHarvestModel(root,elapsed=0){
 const state=root.userData.driving||{};
 root.traverse(part=>{if(part.userData.forestWheel)part.rotation.x=(state.distance||0)/.62;if(part.userData.forestCutter)part.rotation.x=elapsed*(Math.abs(state.speed||0)>.05?16:0);});
}
