import * as T from '../vendor/three/three.module.min.js';
import {BUNKER_MODEL_INFO} from './bunker-items.js';
export {BUNKER_MODEL_INFO};
const mat=(name,color,metalness=.5,roughness=.55)=>Object.assign(new T.MeshStandardMaterial({color,metalness,roughness}),{name});
function palette(){return {steel:mat('BUNKER_BRUSHED_STEEL',0x394f59,.78,.4),dark:mat('BUNKER_GRAPHITE',0x111e26,.5,.75),edge:mat('BUNKER_TITANIUM_EDGE',0x8ba6ad,.75,.32),concrete:mat('BUNKER_CONCRETE',0x536265,.04,.94),amber:mat('BUNKER_HAZARD_AMBER',0xe9a743,.35,.6),cloth:mat('BUNKER_WOVEN_CLOTH',0x2b4148,.02,.96),green:mat('BUNKER_LEAF',0x5f9e58,.01,.85),skin:mat('BUNKER_SKIN',0xc99470,.02,.85),light:Object.assign(mat('BUNKER_CYAN_STATUS',0x64e7ce,.2,.28),{emissive:new T.Color(0x46cfb9),emissiveIntensity:.8}),warm:Object.assign(mat('BUNKER_AMBER_STATUS',0xf2bd62,.2,.28),{emissive:new T.Color(0xe79938),emissiveIntensity:.65})};}
function add(root,name,geometry,material,pos=[0,0,0],rotation=[0,0,0],cosmetic=false){const node=new T.Mesh(geometry,material);node.name=name;node.position.set(...pos);node.rotation.set(...rotation);node.castShadow=node.receiveShadow=true;if(cosmetic)node.userData.collisionDisabled=true;root.add(node);return node;}
const box=(root,name,size,material,pos,rot,cosmetic=false)=>add(root,name,new T.BoxGeometry(...size),material,pos,rot,cosmetic);
const cyl=(root,name,top,bottom,height,material,pos,rot=[0,0,0],segments=16,cosmetic=false)=>add(root,name,new T.CylinderGeometry(top,bottom,height,segments),material,pos,rot,cosmetic);
const ring=(root,name,radius,thickness,material,pos,rot=[Math.PI/2,0,0])=>add(root,name,new T.TorusGeometry(radius,thickness,6,28),material,pos,rot,true);
function group(root,name,pos){const node=new T.Group();node.name=name;node.position.set(...pos);root.add(node);return node;}
function glow(node,phase=0){node.userData.bunkerGlow=phase;return node;}
function bolts(root,p,xs,ys,z){for(const x of xs)for(const y of ys)cyl(root,'CAPTIVE_PANEL_BOLT',.025,.025,.025,p.edge,[x,y,z],[Math.PI/2,0,0],6,true);}
function slats(root,p,x,y,z,width,count=6){for(let i=0;i<count;i++)box(root,'RECESSED_VENT_LOUVRE',[width,.025,.04],p.dark,[x,y+i*.065,z],undefined,true);}
function screen(root,p,name,w,h,pos){box(root,name+'_FRAME',[w+.09,h+.09,.11],p.steel,pos);const face=[pos[0],pos[1],pos[2]-.064];box(root,name+'_GLASS',[w,h,.015],p.dark,face,undefined,true);for(let row=0;row<5;row++)glow(box(root,name+'_CODE_LINE',[w*(.3+(row%3)*.18),.016,.008],row===0?p.warm:p.light,[pos[0]-w*.12,pos[1]+h*.32-row*h*.145,pos[2]-.077],undefined,true),row*.7);}
function floor(root,p,ceiling){
 const slab=box(root,ceiling?'CEILING_CONCRETE_PANEL':'BUILDER_WALKABLE_FLOOR_BUNKER',[4,ceiling?.25:.2,4],p.concrete,[0,ceiling?.125:.1,0]);if(!ceiling)slab.userData.walkableFloor=true;
 if(ceiling){for(const x of [-1.4,1.4]){box(root,'OVERHEAD_SERVICE_DUCT',[.42,.1,3.9],p.dark,[x,.025,0]);glow(box(root,'RECESSED_EMERGENCY_STRIP',[.1,.025,3.5],p.light,[x,-.008,0],undefined,true));}box(root,'OVERHEAD_CROSS_SUPPORT',[3.95,.1,.16],p.steel,[0,.02,0]);}
 else{for(const x of [-.99,.99])for(const z of [-.99,.99])box(root,'NONSLIP_INSET_TREAD',[1.9,.012,1.9],p.steel,[x,.194,z],undefined,true);for(const x of [-1.92,1.92])box(root,'RECESSED_CABLE_CHANNEL',[.045,.012,3.85],p.light,[x,.197,0],undefined,true);}
}
function wall(root,p){
 box(root,'LOAD_BEARING_CONCRETE_WALL',[4,4,.28],p.concrete,[0,2,0]);
 for(const x of [-1.86,1.86])box(root,'WALL_STEEL_STIFFENER',[.18,4,.35],p.steel,[x,2,0]);
 for(const side of [-1,1]){for(const y of [.25,3.65])box(root,'WALL_SERVICE_RACEWAY',[3.7,.15,.055],p.dark,[0,y,side*.15]);box(root,'CYAN_FLOOR_GUIDANCE',[3.5,.035,.012],p.light,[0,.45,side*.146],undefined,true);for(const x of [-.9,.9])box(root,'INSET_WALL_ARMOUR',[1.72,2.9,.025],p.steel,[x,2,side*.15],undefined,true);}
}
function blastDoor(root,p){
 for(const x of [-1.65,1.65])box(root,'BLAST_DOOR_FRAME',[.5,3.8,.7],p.steel,[x,1.9,0]);box(root,'BLAST_DOOR_LINTEL',[2.8,.5,.7],p.steel,[0,3.55,0]);
 box(root,'REINFORCED_DOOR_LEAF',[2.78,3.3,.28],p.dark,[0,1.65,0]);
 for(const x of [-.68,.68]){box(root,'ARMOURED_DOOR_CASSETTE',[1.3,2.95,.11],p.steel,[x,1.65,-.19]);for(const y of [.5,2.8])box(root,'DOOR_LOCKING_DOG',[.45,.12,.14],p.edge,[x,y,-.29]);}
 for(let i=0;i<8;i++)for(const x of [-1.65,1.65])box(root,'DOOR_HAZARD_STRIPE',[.36,.11,.02],i%2?p.dark:p.amber,[x,.3+i*.43,-.36],[0,0,-.45],true);
 glow(box(root,'DOOR_STATUS_STRIP',[.055,2.5,.025],p.light,[0,1.7,-.26],undefined,true));box(root,'DOOR_ACCESS_PANEL',[.28,.45,.06],p.dark,[1.65,1.4,-.38]);glow(box(root,'DOOR_ACCESS_DISPLAY',[.17,.16,.02],p.light,[1.65,1.48,-.422],undefined,true));
}
function terminal(root,p){
 for(const x of [-.85,.85])box(root,'CONSOLE_PEDESTAL',[.35,.9,.8],p.dark,[x,.45,0]);box(root,'CONSOLE_WORKTOP',[2.2,.12,1.1],p.steel,[0,.96,0]);
 for(const x of [-.72,0,.72]){box(root,'MONITOR_STAND',[.07,.42,.07],p.edge,[x,1.18,.22]);screen(root,p,'SECURE_DISPLAY',.62,.47,[x,1.53,.2]);}
 box(root,'KEYBOARD_RECESS',[1.2,.035,.28],p.dark,[0,1.04,-.28]);for(let row=0;row<3;row++)for(let key=0;key<10;key++)box(root,'MECHANICAL_KEY',[.085,.018,.055],key===0?p.light:p.edge,[-.5+key*.11,1.066,-.38+row*.08],undefined,true);
 for(const x of [-.94,.94]){box(root,'PATCH_BAY',[.2,.22,.04],p.dark,[x,.67,-.42]);for(let i=0;i<3;i++)cyl(root,'PATCH_SOCKET',.024,.024,.025,p.amber,[x,.6+i*.06,-.45],[Math.PI/2,0,0],10,true);}
}
function rack(root,p){
 box(root,'SERVER_FOOT',[1.3,.12,1.05],p.dark,[0,.06,0]);box(root,'SERVER_CABINET',[1.2,2.35,.94],p.steel,[0,1.29,0]);
 for(let i=0;i<8;i++){const y=.31+i*.26;box(root,'REMOVABLE_COMPUTE_TRAY',[1.05,.21,.035],p.dark,[0,y,-.49]);box(root,'TRAY_HANDLE',[.3,.035,.04],p.edge,[-.17,y,-.53],undefined,true);for(let j=0;j<3;j++)glow(box(root,'NETWORK_STATUS_LED',[.026,.025,.015],j===2?p.warm:p.light,[.27+j*.075,y,-.518],undefined,true),i+j);}
 for(const x of [-.5,.5])bolts(root,p,[x],[.19,2.35],-.515);slats(root,p,0,2.27,-.512,.6,3);
}
function core(root,p){
 cyl(root,'CORE_REINFORCED_BASE',1.4,1.4,.22,p.dark,[0,.11,0],undefined,24);cyl(root,'CORE_CENTRAL_PRESSURE_VESSEL',.62,.7,2.6,p.steel,[0,1.5,0],undefined,24);
 for(let i=0;i<5;i++)ring(root,'SEGMENTED_POWER_COIL',.76,.09,p.light,[0,.57+i*.45,0]);
 for(let i=0;i<4;i++){const a=i*Math.PI/2,x=Math.cos(a)*.98,z=Math.sin(a)*.98;box(root,'CORE_PROTECTIVE_PILLAR',[.18,2.75,.18],p.edge,[x,1.53,z]);}
 cyl(root,'CORE_TOP_MANIFOLD',1.18,1.18,.22,p.steel,[0,2.99,0],undefined,24);for(const y of [.38,2.75])ring(root,'CORE_COLLAR',1.08,.07,p.amber,[0,y,0]);screen(root,p,'CORE_PRESSURE_DISPLAY',.48,.32,[0,1.3,-1.06]);
 const rotor=group(root,'CORE_ROTATING_INDUCTION_RING',[0,1.65,0]);ring(rotor,'CORE_INDUCTION_HALO',1.12,.035,p.light,[0,0,0]);rotor.userData.bunkerSpin={axis:'y',speed:.24};for(let i=0;i<4;i++)box(rotor,'INDUCTION_MARKER',[.1,.12,.1],p.warm,[Math.cos(i*Math.PI/2)*1.12,0,Math.sin(i*Math.PI/2)*1.12],undefined,true);
}
function relay(root,p){
 box(root,'RELAY_PLINTH',[1.5,.2,1.3],p.dark,[0,.1,0]);box(root,'COMMUNICATIONS_CABINET',[.9,1.4,.8],p.steel,[0,.9,0]);screen(root,p,'RELAY_DISPLAY',.55,.31,[0,1.16,-.43]);slats(root,p,0,.45,-.42,.62,5);cyl(root,'AERIAL_MAST',.06,.08,1.1,p.edge,[0,2.05,0]);
 for(const [r,y]of [[.48,2.15],[.62,2.46]])ring(root,'CONCENTRIC_RELAY_AERIAL',r,.035,p.light,[0,y,0],[Math.PI/2,.3,0]);cyl(root,'RELAY_CAP',.09,.08,.18,p.amber,[0,2.71,0]);
}
function medic(root,p){
 box(root,'MEDICAL_SUPPLIES_CABINET',[1.6,1.9,.58],p.steel,[0,.95,0]);box(root,'MEDICAL_CLEAN_PANEL',[1.1,1.55,.04],p.edge,[-.15,1,-.31]);for(const size of [[.36,.1,.025],[.1,.36,.025]])glow(box(root,'RECOVERY_CROSS',size,p.light,[-.15,1.43,-.343],undefined,true));screen(root,p,'VITAL_SIGNS',.65,.24,[-.15,.93,-.35]);for(const x of [-.55,.55])cyl(root,'MEDICAL_OXYGEN_CYLINDER',.13,.13,.78,p.dark,[x,.5,0]);box(root,'RECOVERY_SUPPLY_DRAWER',[.75,.27,.06],p.dark,[-.15,.37,-.35]);box(root,'DRAWER_HANDLE',[.27,.035,.05],p.light,[-.15,.37,-.4],undefined,true);
}
function cache(root,p){
 box(root,'SUPPLY_CASE_SHELL',[1.3,.86,.9],p.dark,[0,.43,0]);for(const x of [-.5,.5]){box(root,'CASE_TITANIUM_STRAP',[.08,.89,.92],p.edge,[x,.445,0]);box(root,'CASE_LOCK',[.16,.13,.045],p.amber,[x,.68,-.49]);}for(const side of [-1,1])box(root,'RECESSED_CARRY_HANDLE',[.04,.12,.3],p.steel,[side*.67,.49,0]);box(root,'SEALED_SUPPLY_MANIFEST',[.48,.26,.025],p.steel,[0,.46,-.465]);for(let i=0;i<3;i++)box(root,'MANIFEST_CODE',[.27-i*.04,.02,.01],p.light,[0,.53-i*.06,-.485],undefined,true);
}
function bunk(root,p){
 for(const x of [-1,1])for(const z of [-.42,.42])box(root,'BUNK_STEEL_POST',[.09,2.2,.09],p.steel,[x,1.1,z]);for(const y of [.39,1.45]){box(root,'BUNK_SLEEPING_PLATFORM',[2.1,.1,.95],p.dark,[0,y,0]);box(root,'WOVEN_BUNK_MATTRESS',[1.95,.14,.85],p.cloth,[0,y+.12,0]);box(root,'BUNK_PILLOW',[.42,.1,.65],p.edge,[-.69,y+.23,0]);}for(const y of [.3,.65,1,1.35,1.7])box(root,'BUNK_ACCESS_RUNG',[.42,.045,.045],p.edge,[.7,y,-.49]);box(root,'UNDER_BUNK_STORAGE',[1.6,.24,.72],p.steel,[-.12,.17,0]);
}
function bench(root,p){
 for(const x of [-1,1])box(root,'WORKSHOP_PEDESTAL',[.3,.9,.8],p.steel,[x,.45,0]);box(root,'ELECTRONICS_WORKSURFACE',[2.4,.12,1.1],p.edge,[0,.96,0]);box(root,'BENCH_TOOLBOARD',[2.3,.63,.07],p.dark,[0,1.38,.45]);for(let i=0;i<5;i++){box(root,'PARTS_BIN',[.32,.2,.22],i%2?p.steel:p.amber,[-.84+i*.42,1.16,.24]);cyl(root,'INSULATED_TOOL_HANDLE',.032,.032,.28,p.light,[-.84+i*.42,1.49,.385],[0,0,.15],10,true);}box(root,'BLUEPRINT_PAD',[.9,.025,.55],p.dark,[-.25,1.04,-.16]);for(let i=0;i<4;i++)box(root,'CIRCUIT_TRACE',[.52-i*.08,.006,.014],p.light,[-.25,1.055,-.34+i*.1],undefined,true);screen(root,p,'BENCH_DIAGNOSTIC',.36,.25,[.88,1.52,.36]);
}
function garden(root,p){
 for(const x of [-1.08,1.08])for(const z of [-.43,.43])box(root,'HYDROPONIC_FRAME',[.07,1.8,.07],p.steel,[x,.9,z]);for(const y of [.32,1.02]){box(root,'RECIRCULATING_GROW_TRAY',[2.25,.2,1],p.dark,[0,y,0]);for(let i=0;i<6;i++){const x=-.88+i*.35;cyl(root,'GROW_NET_POT',.11,.075,.16,p.steel,[x,y+.15,0],undefined,8);for(const side of [-1,1]){const leaf=add(root,'HYDROPONIC_LEAF',new T.SphereGeometry(.13,8,6),p.green,[x+side*.055,y+.32,0],[0,0,side*.6],true);leaf.scale.set(.65,1.6,.3);}}glow(box(root,'FULL_SPECTRUM_GROW_LAMP',[2.1,.05,.1],p.warm,[0,y+.61,0],undefined,true));}for(const x of [-1.13,1.13])cyl(root,'WATER_RETURN_PIPE',.035,.035,1.5,p.edge,[x,.84,.24]);
}
function vent(root,p){
 box(root,'AIR_FILTER_HOUSING',[2,1.1,1.05],p.steel,[0,.55,0]);box(root,'INTAKE_RECESS',[1.75,.85,.04],p.dark,[0,.55,-.54]);const fan=group(root,'FILTER_IMPELLER',[.42,.55,-.57]);for(let i=0;i<6;i++){const blade=box(fan,'CURVED_FAN_BLADE',[.11,.34,.035],p.edge,[Math.sin(i*Math.PI/3)*.17,Math.cos(i*Math.PI/3)*.17,0],[0,0,-i*Math.PI/3-.4],true);}fan.userData.bunkerSpin={axis:'z',speed:1.8};ring(root,'FAN_SAFETY_GUARD',.37,.026,p.steel,[.42,.55,-.61],[0,0,0]);for(const x of [-.4,0,.4])box(root,'INTAKE_SAFETY_BAR',[.027,.82,.04],p.steel,[x+.42,.55,-.64],undefined,true);slats(root,p,-.56,.23,-.575,.45,9);glow(box(root,'FILTER_QUALITY_INDICATOR',[.25,.045,.02],p.light,[-.55,.92,-.58],undefined,true));
}
function person(root,p,engineer){
 const cloth=engineer?p.amber:p.cloth;
 for(const side of [-1,1]){const leg=group(root,side<0?'BUNKER_LEFT_LEG':'BUNKER_RIGHT_LEG',[side*.14,.77,0]);box(leg,'BUNKER_FIELD_BOOT',[.2,.16,.31],p.dark,[0,-.69,-.055]);cyl(leg,'BUNKER_TROUSERS',.09,.085,.62,p.cloth,[0,-.31,0]);leg.userData.bunkerLimb={kind:'leg',side};}
 box(root,'FIELD_JACKET',[.48,.58,.3],cloth,[0,1.06,0]);box(root,'UTILITY_VEST',[.41,.38,.04],p.dark,[0,1.09,-.17]);for(const x of [-.115,.115])box(root,'VEST_COMPONENT_POUCH',[.14,.16,.07],p.steel,[x,1.05,-.22]);box(root,'TOOL_BELT',[.5,.07,.33],p.dark,[0,.8,0]);
 for(const side of [-1,1]){const arm=group(root,side<0?'BUNKER_LEFT_ARM':'BUNKER_RIGHT_ARM',[side*.3,1.28,0]);cyl(arm,'PADDED_JACKET_ARM',.085,.07,.47,cloth,[side*.025,-.2,0],[0,0,side*.1]);box(arm,'TACTICAL_GLOVE',[.12,.14,.12],p.dark,[side*.05,-.48,-.015]);arm.userData.bunkerSway={axis:'x',amount:.025,phase:side};arm.userData.bunkerLimb={kind:'arm',side};}
 const head=group(root,'BUNKER_HEAD',[0,1.59,0]);add(head,'BUNKER_SPECIALIST_FACE',new T.SphereGeometry(.18,16,12),p.skin,[0,0,0]).scale.set(.85,1.1,.85);
 if(engineer){cyl(head,'ENGINEER_HELMET',.19,.22,.12,p.amber,[0,.15,0],undefined,16);box(head,'RESPIRATOR_MASK',[.22,.105,.11],p.dark,[0,-.08,-.15]);for(const x of [-.13,.13])cyl(head,'RESPIRATOR_FILTER',.055,.055,.07,p.edge,[x,-.08,-.16],[Math.PI/2,0,0],12,true);}
 else{const hood=add(head,'HACKER_HOOD',new T.SphereGeometry(.225,16,12,0,Math.PI*2,0,Math.PI*.65),p.dark,[0,.04,.025]);box(head,'FIELD_VISOR_FRAME',[.34,.12,.08],p.steel,[0,.03,-.17]);glow(box(head,'CIPHER_LUMINOUS_VISOR',[.29,.055,.02],p.light,[0,.03,-.218],undefined,true));}
 head.userData.bunkerSway={axis:'y',amount:.035,phase:.7};glow(box(root,'CREW_BADGE',[.07,.035,.016],p.light,[.135,1.22,-.2],undefined,true));
}
function protectedDescent(root,p){
 // The visible tread plane is the physical floor; detail ribs never create
 // additional step barriers. Bottom and upper treads are exactly 12 m apart.
 const geometry=new T.BufferGeometry();
 geometry.setAttribute('position',new T.Float32BufferAttribute([-3,0,-16,3,0,-16,3,12,16,-3,12,16,-3,.2,-16,3,.2,-16,3,12.2,16,-3,12.2,16],3));
 geometry.setIndex([4,7,6,4,6,5,0,1,2,0,2,3,0,4,5,0,5,1,3,2,6,3,6,7,0,3,7,0,7,4,1,5,6,1,6,2]);geometry.computeVertexNormals();
 const ramp=add(root,'BUILDER_WALKABLE_FLOOR_BUNKER_ACCESS',geometry,p.steel);ramp.userData.walkableFloor=true;ramp.userData.colliderShape='mesh';
 const pitch=-Math.atan2(12,32),length=Math.hypot(12,32),surface=z=>.2+(z+16)*.375;
 for(const x of [-3.15,3.15])box(root,'DESCENT_REINFORCED_SIDEWALL',[.3,3.8,length],p.concrete,[x,8.1,0],[pitch,0,0]);
 // Short roof sections keep each collision envelope close to the actual
 // slope. One long sloping box would create a twelve-metre tall AABB across
 // the whole passage in the shared-room body-clearance collector.
 const roof=group(root,'DESCENT_OVERHEAD_ROOF',[0,0,0]);roof.userData.buildingRoof=true;
 for(let z=-15;z<=15;z+=2)box(roof,'DESCENT_CEILING_PANEL',[6.6,.25,Math.hypot(2,.75)],p.steel,[0,surface(z)+3.9,z],[pitch,0,0]);
 for(const z of [-14,-10,-6,-2,2,6,10,14]){
  const y=surface(z);
  for(const x of [-2.91,2.91])box(root,'DESCENT_RIB_UPRIGHT',[.14,3.25,.2],p.dark,[x,y+1.65,z]);
  const beam=box(root,'DESCENT_ROOF_RIB',[5.94,.18,.2],p.dark,[0,y+3.23,z]);beam.userData.buildingRoof=true;
  box(root,'DESCENT_NONSLIP_TREAD_MARK',[5.5,.012,.055],p.edge,[0,y+.009,z],[pitch,0,0],true);
  for(const x of [-2.68,2.68])glow(box(root,'DESCENT_WAYFINDING_LIGHT',[.06,.025,1.2],p.light,[x,y+.06,z],[pitch,0,0],true),z);
 }
}
function alarmIndicator(root,p,name,size,pos){const indicator=box(root,name,size,p.light.clone(),pos,undefined,true);indicator.userData.bunkerAlarm=true;return indicator;}
function alertConsole(root,p){
 for(const x of [-1.05,1.05])box(root,'ALERT_CONSOLE_PEDESTAL',[.38,1.05,1.1],p.dark,[x,.525,0]);
 box(root,'EMERGENCY_CONTROL_DESK',[2.7,.16,1.35],p.steel,[0,1.08,0]);box(root,'COMMAND_SCREEN_BACKPLATE',[2.65,.95,.13],p.dark,[0,1.64,.42]);
 screen(root,p,'TACTICAL_THREAT_DISPLAY',1.55,.7,[-.43,1.65,.32]);screen(root,p,'CREW_RESPONSE_DISPLAY',.65,.7,[.8,1.65,.32]);
 for(const x of [-.8,-.4,0,.4,.8])box(root,'GUARDED_ACKNOWLEDGEMENT_KEY',[.18,.055,.16],x===0?p.amber:p.edge,[x,1.195,-.28],undefined,true);
 for(let i=0;i<4;i++)box(root,'RESPONSE_ASSIGNMENT_SLIDER',[.28,.035,.065],p.light,[-.7+i*.46,1.195,-.49],undefined,true);
 alarmIndicator(root,p,'COMMAND_ALERT_STATUS',[.35,.07,.022],[1.08,1.98,.24]);
 for(const x of [-1.13,1.13]){slats(root,p,x,.34,-.565,.21,7);bolts(root,p,[x],[.15,.9],-.575);}
}
function alarmBeacon(root,p){
 box(root,'ALARM_ANCHORED_BASE',[.95,.18,.8],p.dark,[0,.09,0]);box(root,'ALARM_STEEL_COLUMN',[.42,2.58,.38],p.steel,[0,1.47,0]);
 box(root,'CIVIL_DEFENCE_ID_PANEL',[.72,.62,.16],p.dark,[0,1.15,-.25]);
 alarmIndicator(root,p,'ALARM_REPEATER_LAMP',[.4,.12,.025],[0,1.25,-.343]);
 for(const side of [-1,1]){
  const horn=cyl(root,'DIRECTIONAL_SIREN_HORN',.34,.14,.58,p.steel,[side*.52,2.55,0],[0,0,-side*Math.PI/2],20);cyl(root,'HORN_DARK_APERTURE',.25,.25,.025,p.dark,[side*.82,2.55,0],[0,0,Math.PI/2],20,true);
 }
 cyl(root,'BEACON_PROTECTION_COLLAR',.34,.34,.1,p.edge,[0,2.9,0],undefined,20);
 const dome=add(root,'EMERGENCY_SIGNAL_DOME',new T.SphereGeometry(.31,20,12,0,Math.PI*2,0,Math.PI/2),p.light.clone(),[0,2.95,0]);dome.userData.collisionDisabled=true;dome.userData.bunkerAlarm=true;
 cyl(root,'BEACON_DOME_CAGE',.05,.05,.38,p.edge,[0,3.08,0],undefined,8,true);
 for(const x of [-.26,.26])box(root,'BEACON_CAGE_UPRIGHT',[.035,.36,.035],p.edge,[x,3.06,0],undefined,true);
}
function filtration(root,p){
 box(root,'SEALED_FILTRATION_CABINET',[2.6,2.8,1.2],p.steel,[0,1.4,0]);box(root,'FILTER_SERVICE_DOOR',[2.36,2.48,.045],p.dark,[0,1.43,-.625]);
 for(const x of [-.79,-.16]){cyl(root,'REPLACEABLE_FILTER_CANISTER',.24,.24,1.75,p.edge,[x,1.42,-.69],undefined,18);for(const y of [.64,2.15])ring(root,'FILTER_CLAMP',.25,.025,p.amber,[x,y,-.69]);}
 screen(root,p,'FILTER_PRESSURE_DISPLAY',.64,.38,[.76,2.2,-.65]);
 const fan=group(root,'LIFE_SUPPORT_IMPELLER',[.75,1.21,-.69]);for(let i=0;i<6;i++)box(fan,'SEALED_FILTER_FAN_BLADE',[.13,.52,.045],p.edge,[Math.sin(i*Math.PI/3)*.24,Math.cos(i*Math.PI/3)*.24,0],[0,0,-i*Math.PI/3-.4],true);
 fan.userData.bunkerSpin={axis:'z',speed:2};fan.userData.bunkerPoweredSpin=true;ring(root,'FILTER_FAN_GUARD',.52,.035,p.steel,[.75,1.21,-.75],[0,0,0]);
 glow(box(root,'FILTRATION_POWER_STATUS',[.53,.055,.025],p.light,[.75,.44,-.67],undefined,true));
 for(const x of [-1.12,1.12])bolts(root,p,[x],[.24,2.55],-.65);
}
function heavyShutter(root,p){
 for(const x of [-3.03,3.03])box(root,'PRESSURE_SEAL_OUTER_FRAME',[.54,4.2,.9],p.steel,[x,2.1,0]);box(root,'HEAVY_SHUTTER_LINTEL',[5.6,.45,.9],p.steel,[0,3.975,0]);
 box(root,'BLAST_SHUTTER_SEALING_LEAF',[5.52,3.73,.36],p.dark,[0,1.865,0]);
 for(const x of [-2.02,-.67,.67,2.02]){box(root,'SHUTTER_ARMOUR_CASSETTE',[1.25,3.35,.14],p.steel,[x,1.87,-.24]);for(const y of [.45,3.27])box(root,'HYDRAULIC_SEAL_DOG',[.4,.16,.2],p.edge,[x,y,-.37]);}
 for(const x of [-3.03,3.03])for(let i=0;i<8;i++)box(root,'SHUTTER_WARNING_STRIPE',[.4,.12,.025],i%2?p.dark:p.amber,[x,.32+i*.47,-.47],[0,0,-.45],true);
 box(root,'SHUTTER_CONTROL_BOX',[.31,.58,.12],p.dark,[3.03,1.37,-.51]);alarmIndicator(root,p,'SHUTTER_SEAL_STATUS',[.18,.16,.025],[3.03,1.5,-.585]);
}
function radiationMonitor(root,p){
 box(root,'MONITOR_STABILISING_BASE',[1.5,.17,.85],p.dark,[0,.085,0]);box(root,'CONTAMINATION_MONITOR_COLUMN',[.7,1.3,.6],p.steel,[0,.77,0]);box(root,'FALLOUT_SENSOR_HOUSING',[1.35,.72,.72],p.dark,[0,1.69,0]);
 screen(root,p,'EXPOSURE_STATUS_DISPLAY',.94,.42,[0,1.73,-.39]);alarmIndicator(root,p,'RADIATION_LEVEL_BAR',[.93,.065,.025],[0,1.39,-.45]);
 for(const x of [-.48,.48])cyl(root,'RADIATION_SENSOR_HEAD',.1,.1,.38,p.edge,[x,2.0,0],undefined,14);for(const x of [-.48,.48])cyl(root,'SENSOR_MESH_CAP',.12,.12,.05,p.amber,[x,2.145,0],undefined,14,true);
 box(root,'MONITOR_SELFTEST_KEY',[.19,.06,.12],p.amber,[.4,1.17,-.32],undefined,true);slats(root,p,0,.4,-.32,.4,5);
}
function emergencyLocker(root,p){
 box(root,'RESPONSE_LOCKER_BODY',[2.1,2.6,.85],p.steel,[0,1.3,0]);box(root,'EQUIPMENT_LOCKER_RECESS',[1.85,2.32,.04],p.dark,[0,1.3,-.455]);
 for(const y of [.35,1.1,1.85,2.49])box(root,'SEALED_EQUIPMENT_SHELF',[1.8,.055,.42],p.edge,[0,y,-.27]);
 for(const x of [-.54,.22]){box(root,'SEALED_MEDICAL_RESPONSE_PACK',[.58,.52,.25],p.cloth,[x,.65,-.35]);for(const size of [[.21,.055,.016],[.055,.21,.016]])box(root,'MEDICAL_PACK_CROSS',size,p.light,[x,.65,-.485],undefined,true);}
 for(const x of [-.58,0,.58]){const respirator=add(root,'CREW_RESPONSE_RESPIRATOR',new T.SphereGeometry(.17,12,8),p.dark,[x,1.45,-.37]);respirator.scale.set(1,.8,.5);for(const side of [-1,1])cyl(root,'RESPIRATOR_CARTRIDGE',.065,.065,.08,p.edge,[x+side*.13,1.44,-.43],[Math.PI/2,0,0],10,true);}
 for(const x of [-.57,0,.57])cyl(root,'SEALED_WATER_RATION',.13,.13,.43,p.amber,[x,2.15,-.3],undefined,12);
 bolts(root,p,[-.93,.93],[.15,2.45],-.46);
}
function waterReserve(root,p){
 box(root,'RESERVE_TANK_SUPPORT',[2.5,.18,1.4],p.dark,[0,.09,0]);
 for(const x of [-.61,.61]){cyl(root,'SEALED_DRINKING_WATER_TANK',.52,.52,2.12,p.edge,[x,1.25,0],undefined,24);for(const y of [.43,2.07])ring(root,'WATER_TANK_RETAINING_STRAP',.535,.035,p.steel,[x,y,0]);cyl(root,'TANK_INSPECTION_CAP',.2,.2,.14,p.dark,[x,2.38,0],undefined,18);}
 box(root,'WATER_RATION_MANIFOLD',[2.15,.14,.18],p.steel,[0,.59,-.62]);for(const x of [-.62,.62]){cyl(root,'RATIONS_VALVE',.115,.115,.08,p.amber,[x,.72,-.64],[Math.PI/2,0,0],16,true);cyl(root,'PRESSURE_GAUGE',.13,.13,.065,p.dark,[x,1.42,-.55],[Math.PI/2,0,0],18);box(root,'GAUGE_NEEDLE',[.015,.14,.018],p.light,[x,1.44,-.59],[0,0,.4],true);}
 glow(box(root,'WATER_RESERVE_STATUS',[.53,.055,.025],p.light,[0,.94,-.64],undefined,true));
}

export function createBunkerModel(id){
 const info=BUNKER_MODEL_INFO[id];if(!info)return null;const root=new T.Group(),p=palette();root.name=info[0];root.userData={builderObject:true,bunkerModel:true,modelId:id,label:info[0],dimensions:[...info[2]],animated:true};
 if(id==='bunker-floor'||id==='bunker-ceiling')floor(root,p,id==='bunker-ceiling');else if(id==='bunker-wall')wall(root,p);else if(id==='bunker-blast-door')blastDoor(root,p);else if(id==='bunker-terminal')terminal(root,p);else if(id==='bunker-server-rack')rack(root,p);else if(id==='bunker-power-core')core(root,p);else if(id==='bunker-signal-relay')relay(root,p);else if(id==='bunker-med-station')medic(root,p);else if(id==='bunker-supply-cache')cache(root,p);else if(id==='bunker-bunk')bunk(root,p);else if(id==='bunker-workbench')bench(root,p);else if(id==='bunker-hydroponics')garden(root,p);else if(id==='bunker-vent')vent(root,p);else if(id==='bunker-access-stairs')protectedDescent(root,p);else if(id==='bunker-alert-console')alertConsole(root,p);else if(id==='bunker-alarm-beacon')alarmBeacon(root,p);else if(id==='bunker-filtration-unit')filtration(root,p);else if(id==='bunker-blast-shutter')heavyShutter(root,p);else if(id==='bunker-radiation-monitor')radiationMonitor(root,p);else if(id==='bunker-emergency-locker')emergencyLocker(root,p);else if(id==='bunker-water-reserve')waterReserve(root,p);else person(root,p,id==='bunker-engineer');
 if(id==='bunker-ceiling')root.userData.buildingRoof=true;
 const character=id==='bunker-hacker'||id==='bunker-engineer';if(character)root.userData.collider=false;
 root.traverse(node=>{if(node.isMesh){node.userData.builderRoot=root;if(character)node.userData.collisionDisabled=true;}});return root;
}
export function updateBunkerModel(root,elapsed){
 if(!root?.userData?.bunkerModel)return false;
 const rate=Number(root.userData.animationState?.speed),time=(Number.isFinite(elapsed)?elapsed:0)*(Number.isFinite(rate)?Math.max(0,rate):1);
 const motion=root.userData.residentState||root.userData.avatarMotion||{},animate=root.userData.animationState?.enabled!==false&&!motion.reducedMotion,moving=motion.moving===true&&animate;
 const switched=root.userData.serverSwitched??root.userData.switched,alert=root.userData.bunkerAlertState,level=typeof alert==='string'?alert:alert?.level||'standby';
 root.traverse(node=>{
  const spin=node.userData.bunkerSpin,sway=node.userData.bunkerSway;
  if(animate){
   if(spin)node.rotation[spin.axis]=node.userData.bunkerPoweredSpin&&switched===false?0:time*spin.speed;
   if(sway)node.rotation[sway.axis]=Math.sin(time*.9+sway.phase)*sway.amount;
   if(node.name==='BUNKER_HEAD')node.rotation.x=motion.speaking?Math.sin(time*7)*.045:Math.sin(time*.8)*.008;
   const limb=node.userData.bunkerLimb;if(limb)node.rotation.x=moving?Math.sin(time*6)*limb.side*(limb.kind==='leg'?.32:-.27):limb.kind==='leg'?0:Math.sin(time*.9+limb.side)*.025;
  }
  // Functional indicators remain readable with animation or motion disabled.
  // Every factory owns these materials; shared alert updates cannot recolour
  // another placed copy or move the saved placement transform.
  if(node.userData.bunkerAlarm&&node.material?.emissive){
   const color=({warning:0xf2b54d,recovery:0xf2b54d,danger:0xff5466,'all-clear':0x8dde6b,standby:0x5be2c8})[level]||0x5be2c8;
   node.material.color.setHex(color);node.material.emissive.setHex(color);
   node.material.emissiveIntensity=level==='danger'?(animate?.55+(Math.sin(time*7)>0?.75:0):.95):level==='warning'?(animate?.65+Math.sin(time*3)*.25:.75):.45;
  }
  if(node.userData.bunkerGlow!==undefined&&node.material?.emissive)node.material.emissiveIntensity=switched===false?.1:animate?.72+Math.sin(time*1.8+node.userData.bunkerGlow)*.13:.72;
 });
 return true;
}
