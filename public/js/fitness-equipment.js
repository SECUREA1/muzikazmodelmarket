import * as THREE from '../vendor/three/three.module.min.js';

/** Grounded, human-scale equipment shared by Builder, Backpack and gym maps. */
const approaches=Object.freeze({
 'Gold Boxing Ring':{x:0,y:.16,z:4},'Gold Heavy Bag':{x:0,y:0,z:2.4},'Gold Bench Press':{x:0,y:0,z:3},
 'Gold Deadlift Platform':{x:0,y:0,z:4},'Gold Power Rack':{x:0,y:0,z:3},'Gold Olympic Barbell':{x:0,y:0,z:1.3},
 'Gold Rowing Machine':{x:2.4,y:0,z:0},'Gold Jump Rope':{x:2.3,y:0,z:0},'Gold Agility Ladder':{x:-2.6,y:0,z:0},
 'Gold Training Cone':{x:0,y:0,z:1.3},'Gold Training Hurdle':{x:0,y:0,z:1.6},'Gold Balance Beam':{x:-4,y:0,z:-2},'Gold Balance Pad':{x:0,y:0,z:1.3}
});
const item=(name,description,dimensions,priceMzk,kind=null)=>Object.freeze({name,description,dimensions:Object.freeze(dimensions),priceMzk,kind,...(kind?{approach:Object.freeze(approaches[name]||{x:0,y:0,z:dimensions[2]/2+1.2})}:{}),thumbnailUrl:'/public/images/fitness/equipment.svg'});
export const FITNESS_ITEMS=Object.freeze({
 'fitness-boxing-ring':item('Gold Boxing Ring','Open-entry training ring with padded gold corners, three ropes and a low canvas apron.',[12.4,2.24,12.4],850,'boxing'),
 'fitness-heavy-bag':item('Gold Heavy Bag','Freestanding steel suspension frame with a gold striking bag, chains and padded bands.',[1.8,5,1.8],220,'boxing'),
 'fitness-bench-press':item('Gold Bench Press','Padded strength bench with spotter rails, gold barbell plates and a stable steel rack.',[2.6,2,2.6],360,'bench-press'),
 'fitness-deadlift-platform':item('Gold Deadlift Platform','Timber and rubber lifting platform with a loaded gold-accented Olympic barbell.',[8,.62,6],350,'deadlift'),
 'fitness-power-rack':item('Gold Power Rack','Open squat and pull-up rack with gold safety catches, floor feet and a loaded bar.',[4.2,3,2.7],400,'deadlift'),
 'fitness-dumbbell-rack':item('Gold Dumbbell Rack','Long two-tier steel rack with nine individually modelled pairs of training dumbbells.',[14,1.2,1.3],300),
 'fitness-plate-tree':item('Gold Plate Tree','Stable plate-storage tower with three sets of gold Olympic weight plates.',[1.1,2,.9],120),
 'fitness-barbell':item('Gold Olympic Barbell','Grounded Olympic bar with black and gold removable-style weight plates.',[2.8,.6,.6],90,'deadlift'),
 'fitness-dumbbell':item('Gold Dumbbell','Single hand weight with a knurled steel grip and gold-edged rubber heads.',[.7,.28,.28],35),
 'fitness-treadmill':item('Gold Treadmill','Running deck, safety rails and a live-style gold-framed training console.',[1.6,1.75,3.2],300),
 'fitness-rower':item('Gold Rowing Machine','Rail-mounted seat, flywheel, foot plates and a gold training display.',[1.2,1.5,3.4],280,'rowing'),
 'fitness-bike':item('Gold Studio Bike','Indoor cycle with a flywheel, padded saddle, pedals and gold-trimmed handlebars.',[1,1.5,1.6],240),
 'fitness-jump-rope':item('Gold Jump Rope','Full-length gold training rope laid out with two ergonomic handles.',[1.8,.12,2.8],45,'jump-rope'),
 'fitness-agility-ladder':item('Gold Agility Ladder','Nine-rung gold footwork ladder laid flat for a clear fifteen-metre reaction lane.',[2.6,.04,15],100,'agility'),
 'fitness-cone':item('Gold Training Cone','Low slalom cone with a broad rubber foot and gold high-visibility marker.',[.8,.92,.8],20,'agility'),
 'fitness-hurdle':item('Gold Training Hurdle','Lightweight hurdle with a gold crossbar, adjustable-style uprights and wide stable feet.',[2.7,.94,.6],55,'agility'),
 'fitness-balance-beam':item('Gold Balance Beam','Low eight-metre stability beam with gold end caps and wide support feet.',[8,.32,1.4],140,'balance'),
 'fitness-balance-pad':item('Gold Balance Pad','Round textured stability pad with a gold rim for low-impact balance training.',[1.1,.28,1.1],40,'balance'),
 'fitness-recovery-mat':item('Gold Recovery Mat','Full-length cushioned exercise mat with stitched gold edges and alignment lines.',[1.4,.05,3],35),
 'fitness-foam-roller':item('Gold Foam Roller','Compact ribbed recovery roller with a gold core and dark padded surface.',[.6,.34,.34],25),
 'fitness-locker':item('Gold Gym Locker','Full-height steel locker with gold vents, handle and a numbered-style nameplate.',[1.5,2.6,1.2],100),
 'fitness-locker-bench':item('Gold Locker Bench','Five-metre timber changing bench with gold steel legs and supportive cross rails.',[5,.63,1],80),
 'fitness-water-station':item('Gold Hydration Station','Floor-standing water dispenser with a clear aqua bottle and gold taps.',[1.4,2.7,1.2],90),
 'fitness-reception-counter':item('Gold Gym Reception','Timber reception desk with a pale worktop, gold trim and recessed front panels.',[8.3,1.42,1.8],220),
 'fitness-monitor':item('Gold Training Monitor','Desk-mounted gold-framed display with an illustrated training progress screen.',[.9,.7,.45],70),
 'fitness-coach-board':item('Gold Coach Board','Freestanding gold-framed training board with a session diagram and stable feet.',[2,2.4,.7],80)
});
export const FITNESS_MODEL_INFO=Object.freeze(Object.fromEntries(Object.entries(FITNESS_ITEMS).map(([id,value])=>[id,[value.name,value.description,value.dimensions]])));
export function fitnessItemSettings(id){
 const value=FITNESS_ITEMS[id];if(!value)return null;
 return {active:true,behavior:value.kind?'interact':'decor',...(value.kind?{fitnessStation:value.kind,fitnessApproach:{...value.approach},interactionDistance:4,prompt:'Train '+value.name}:{}),destructible:false};
}


/** Models use a ground origin and a centred X/Z footprint. No browser DOM is needed. */
export function createFitnessEquipment(id){
 const info=FITNESS_ITEMS[id];if(!info)return null;
 const root=new THREE.Group();root.name='FITNESS_EQUIPMENT_'+id;
 const colors={gold:0xd5ac55,lightGold:0xf1d18b,goldDark:0x9d702e,steel:0x8a9da0,dark:0x17232b,rubber:0x27353a,padding:0x59513c,wood:0xa47850,white:0xe6e9de,aqua:0x70c7bf,screen:0x102b2c,muted:0x59746d};
 const materials=new Map(),cube=new THREE.BoxGeometry(1,1,1),round=new THREE.CylinderGeometry(1,1,1,18),sphere=new THREE.SphereGeometry(1,12,8);
 const material=color=>{const key=colors[color]??color;if(!materials.has(key)){const metallic=['gold','lightGold','goldDark','steel'].includes(color);materials.set(key,new THREE.MeshStandardMaterial({color:key,roughness:metallic?.38:.78,metalness:metallic?.7:.04}));}return materials.get(key);};
 const mesh=(name,geometry,color,position,scale=[1,1,1],solid=true,parent=root)=>{const m=new THREE.Mesh(geometry,material(color));m.name='FITNESS_'+name;m.position.set(...position);m.scale.set(...scale);m.castShadow=solid;m.receiveShadow=true;if(!solid)m.userData.collisionDisabled=true;parent.add(m);return m;};
 const box=(name,size,at,color='dark',solid=true,parent=root)=>mesh(name,cube,color,at,size,solid,parent);
 const cyl=(name,radius,height,at,color='gold',solid=true,parent=root)=>mesh(name,round,color,at,[radius,height,radius],solid,parent);
 const ball=(name,radius,at,color='gold',parent=root)=>mesh(name,sphere,color,at,[radius,radius,radius],false,parent);
 const rod=(name,a,b,radius=.035,color='gold',solid=true,parent=root)=>{const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),direction=bv.clone().sub(av);const m=cyl(name,radius,direction.length(),av.add(bv).multiplyScalar(.5).toArray(),color,solid,parent);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());return m;};
 const barbell=(at=[0,.3,0],width=2.8,parent=root,radius=.3)=>{
  rod('OLYMPIC_BAR',[-width/2,at[1],at[2]],[width/2,at[1],at[2]],.035,'steel',false,parent).position.x=at[0];
  for(const side of [-1,1])for(let i=0;i<3;i++){const weight=cyl('WEIGHT_PLATE',radius-i*.022,.075,[at[0]+side*(width*.33+i*.09),at[1],at[2]],i===2?'gold':'rubber',true,parent);weight.rotation.z=Math.PI/2;const hub=cyl('WEIGHT_COLLAR',.065,.085,[at[0]+side*(width*.33+i*.09),at[1],at[2]],'lightGold',false,parent);hub.rotation.z=Math.PI/2;}
 };
 const dumbbell=(x,y,z,width=.7,parent=root)=>{rod('DUMBBELL_GRIP',[x-width/2,y,z],[x+width/2,y,z],.027,'steel',false,parent);for(const side of [-1,1]){const head=cyl('DUMBBELL_HEAD',.14,.14,[x+side*(width/2-.07),y,z],'rubber',true,parent);head.rotation.z=Math.PI/2;const cap=cyl('DUMBBELL_GOLD_END',.125,.015,[x+side*(width/2-.003),y,z],'gold',false,parent);cap.rotation.z=Math.PI/2;}};
 const screen=(x,y,z,w=.75,h=.42,parent=root)=>{box('SCREEN_FRAME',[w+.1,h+.1,.08],[x,y,z],'gold',true,parent);box('SCREEN_FACE',[w,h,.018],[x,y,z+.05],'screen',false,parent);for(let i=0;i<4;i++)box('SCREEN_PROGRESS',[w*(.25+i*.13),.025,.005],[x-w*.1,y-h*.25+i*h*.16,z+.061],i===3?'gold':'aqua',false,parent);};
 const supportFeet=(width,depth,height=.1)=>{for(const z of [-depth/2,depth/2])box('STABILIZER',[width,height,.18],[0,height/2,z],'dark');};
 if(id==='fitness-boxing-ring'){
  box('RING_APRON',[12,.12,12],[0,.06,0],'dark').userData.walkableFloor=true;
  box('RING_CANVAS',[11.7,.025,11.7],[0,.1325,0],'padding',false);
  for(const x of [-6,6])for(const z of [-6,6]){cyl('RING_POST',.12,2.24,[x,1.12,z],'gold');for(const y of [.72,1.16,1.6])box('CORNER_PAD',[.4,.29,.4],[x,y,z],'goldDark',false);ball('POST_FINIAL',.13,[x,2.1,z],'lightGold');}
  for(const y of [.72,1.16,1.6]){for(const x of [-6,6])rod('SIDE_ROPE',[x,y,-6],[x,y,6],.032,'lightGold');rod('BACK_ROPE',[-6,y,-6],[6,y,-6],.032,'lightGold');for(const side of [-1,1])rod('ENTRY_ROPE',[side*1.65,y,6],[side*6,y,6],.032,'lightGold');}
  for(const x of [-5.5,5.5])box('CANVAS_BORDER',[.08,.008,11],[x,.149,0],'gold',false);for(const z of [-5.5,5.5])box('CANVAS_BORDER',[11,.008,.08],[0,.149,z],'gold',false);
  const badge=cyl('CANVAS_BADGE',1.15,.012,[0,.155,0],'goldDark',false);badge.userData.collisionDisabled=true;
 }else if(id==='fitness-heavy-bag'){
  box('BAG_FRAME_BASE',[1.8,.12,1.8],[0,.06,0],'dark');box('BAG_FRAME_POST',[.14,4.82,.14],[0,2.53,-.65],'gold');box('BAG_FRAME_ARM',[.16,.16,1.45],[0,4.92,-.025],'gold');rod('BAG_FRAME_BRACE',[0,3.9,-.65],[0,4.85,.45],.045,'steel');
  rod('BAG_CHAIN',[0,3.3,.4],[0,4.85,.4],.022,'steel',false);cyl('HEAVY_BAG',.44,1.6,[0,2.5,.4],'padding');for(const y of [1.8,3.2])cyl('BAG_GOLD_BAND',.448,.11,[0,y,.4],'gold',false);box('BAG_BADGE',[.34,.44,.025],[0,2.6,.835],'gold',false);
 }else if(id==='fitness-bench-press'){
  box('BENCH_PAD',[.65,.19,2.1],[0,.65,.2],'padding');box('BENCH_PAD_EDGE',[.69,.07,2.13],[0,.59,.2],'gold',false);
  for(const z of [-.5,.9]){box('BENCH_FOOT',[1.1,.16,.25],[0,.08,z],'dark');box('BENCH_LEG',[.13,.48,.13],[0,.34,z],'gold');}
  for(const side of [-1,1]){box('PRESS_UPRIGHT',[.13,2,.16],[side*.9,1,-.95],'steel');box('PRESS_BASE',[.34,.12,2.6],[side*.9,.06,0],'dark');box('PRESS_SPOTTER',[.14,.12,1.2],[side*.9,.9,-.4],'gold');box('PRESS_CRADLE',[.18,.12,.26],[side*.9,1.5,-.9],'gold');}
  barbell([0,1.65,-.95],2.6,root,.25);
 }else if(id==='fitness-deadlift-platform'){
  box('LIFT_TIMBER',[8,.06,6],[0,.03,0],'wood').userData.walkableFloor=true;for(const x of [-2.9,2.9])box('LIFT_RUBBER',[2.2,.08,6],[x,.04,0],'rubber').userData.walkableFloor=true;
  for(const x of [-3.95,3.95])box('PLATFORM_GOLD_EDGE',[.08,.085,6],[x,.0425,0],'gold',false);barbell([0,.32,0]);
 }else if(id==='fitness-power-rack'){
  for(const x of [-2,2]){box('RACK_UPRIGHT',[.12,3,.14],[x,1.5,-.6],'steel');box('RACK_FOOT',[.2,.16,2.7],[x,.08,0],'dark');box('RACK_SAFETY_ARM',[.18,.12,1.6],[x,1.05,.2],'gold');for(let i=0;i<9;i++)box('RACK_HEIGHT_MARK',[.135,.025,.155],[x,.55+i*.23,-.6],'goldDark',false);}
  rod('PULL_UP_BAR',[-2.1,2.94,-.6],[2.1,2.94,-.6],.05,'gold');barbell([0,1.65,-.6],2.8,root,.25);
 }else if(id==='fitness-dumbbell-rack'){
  for(const y of [.48,.93])box('DUMBBELL_SHELF',[14,.1,1.1],[0,y,0],'steel');for(const x of [-6.5,0,6.5]){box('RACK_LEG',[.16,1.1,1.1],[x,.55,0],'dark');box('RACK_FOOT',[.5,.12,1.3],[x,.06,0],'gold');}
  for(let i=0;i<9;i++){dumbbell(-6+i*1.5,.7,0,.7);dumbbell(-6+i*1.5,1.06,0,.7);}
 }else if(id==='fitness-plate-tree'){
  box('PLATE_TREE_BASE',[1.1,.12,.9],[0,.06,0],'dark');rod('PLATE_TREE_POST',[0,.1,0],[0,2,0],.065,'gold');
  for(const y of [.5,1,1.5])for(const side of [-1,1]){rod('PLATE_HOOK',[0,y,0],[side*.5,y,0],.035,'steel');const p=cyl('STORED_PLATE',.25,.13,[side*.33,y,0],'gold');p.rotation.z=Math.PI/2;}
 }else if(id==='fitness-barbell')barbell();
 else if(id==='fitness-dumbbell')dumbbell(0,.14,0);
 else if(id==='fitness-treadmill'){
  box('RUNNING_BASE',[1.6,.3,3.2],[0,.15,0],'dark');box('RUNNING_BELT',[1.22,.045,2.8],[0,.3225,0],'rubber',false);for(let i=0;i<9;i++)box('BELT_TREAD',[1.14,.008,.026],[0,.35,-1.18+i*.29],'muted',false);
  for(const side of [-1,1]){box('TREADMILL_SIDE_TRIM',[.07,.06,3.05],[side*.735,.34,0],'gold');box('TREADMILL_UPRIGHT',[.09,1.4,.09],[side*.7,1.02,-1.15],'steel');box('TREADMILL_HANDGRIP',[.09,.08,.9],[side*.65,1.44,-.65],'gold');}
  screen(0,1.51,-1.2,1.25,.38);
 }else if(id==='fitness-rower'){
  box('ROW_RAIL',[.16,.12,2.75],[0,.35,.225],'steel');box('ROW_SEAT',[.68,.16,.5],[0,.6,.3],'padding');for(const z of [-1.3,1.4])box('ROW_FOOT',[1.2,.14,.2],[0,.07,z],'gold');
  const flywheel=cyl('ROW_FLYWHEEL',.49,.36,[0,.7,-1.2],'dark');flywheel.rotation.z=Math.PI/2;for(const side of [-1,1]){const rim=cyl('ROW_FLYWHEEL_RIM',.39,.015,[side*.19,.7,-1.2],'gold',false);rim.rotation.z=Math.PI/2;box('ROW_PEDAL',[.28,.1,.42],[side*.33,.38,-.6],'padding');}
  rod('ROW_MONITOR_STALK',[0,1,-1.18],[0,1.2,-1.15],.04,'gold');screen(0,1.35,-1.15,.45,.2);rod('ROW_HANDLE',[-.35,.92,-.6],[.35,.92,-.6],.04,'gold');rod('ROW_CABLE',[0,.7,-1.1],[0,.92,-.6],.014,'steel',false);
 }else if(id==='fitness-bike'){
  supportFeet(1,1.4);const wheel=cyl('BIKE_FLYWHEEL',.4,.18,[0,.45,-.2],'dark');wheel.rotation.z=Math.PI/2;for(const side of [-1,1]){const rim=cyl('BIKE_WHEEL_RIM',.3,.02,[side*.11,.45,-.2],'gold',false);rim.rotation.z=Math.PI/2;rod('BIKE_PEDAL_ARM',[0,.47,0],[side*.34,.35,0],.025,'steel');box('BIKE_PEDAL',[.25,.07,.22],[side*.35,.35,0],'rubber');}
  rod('BIKE_FRAME',[0,.15,.6],[0,1.03,.3],.075,'steel');rod('BIKE_FRAME',[0,.3,.35],[0,.9,-.6],.075,'gold');box('BIKE_SADDLE',[.42,.15,.42],[0,1.1,.3],'padding');rod('BIKE_HANDLE_STEM',[0,.65,-.55],[0,1.38,-.55],.045,'steel');rod('BIKE_HANDLE',[-.4,1.4,-.55],[.4,1.4,-.55],.04,'gold');screen(0,1.35,-.56,.3,.2);
 }else if(id==='fitness-jump-rope'){
  const points=[[-.7,.04,1.15],[-.86,.04,.3],[-.78,.04,-.8],[0,.04,-1.35],[.78,.04,-.8],[.86,.04,.3],[.7,.04,1.15]].map(p=>new THREE.Vector3(...p));
  mesh('TRAINING_ROPE',new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),48,.018,6,false),'gold',[0,0,0],[1,1,1],false);
  for(const x of [-.7,.7]){rod('ROPE_HANDLE',[x,.06,.99],[x,.06,1.34],.06,'dark');for(const z of [1.02,1.3])rod('ROPE_HANDLE_TRIM',[x,.06,z-.02],[x,.06,z+.02],.062,'gold',false);}
 }else if(id==='fitness-agility-ladder'){
  for(const x of [-1.27,1.27])box('LADDER_SIDE',[.06,.03,15],[x,.015,0],'goldDark',false);for(let i=0;i<9;i++)box('LADDER_RUNG',[2.6,.04,.1],[0,.02,-7.1+i*1.775],'gold',false);
 }else if(id==='fitness-cone'){
  cyl('CONE_BASE',.4,.12,[0,.06,0],'dark');mesh('TRAINING_CONE',new THREE.ConeGeometry(.28,.8,14),'gold',[0,.52,0]);cyl('CONE_BAND',.16,.06,[0,.48,0],'white',false);
 }else if(id==='fitness-hurdle'){
  for(const x of [-1,1]){box('HURDLE_FOOT',[.7,.14,.6],[x,.07,0],'dark');box('HURDLE_UPRIGHT',[.07,.9,.07],[x,.45,0],'steel');box('HURDLE_CATCH',[.12,.1,.14],[x,.84,0],'goldDark');}
  box('HURDLE_CROSSBAR',[2.1,.08,.08],[0,.9,0],'gold');for(const x of [-.7,0,.7])box('HURDLE_MARK',[.16,.085,.085],[x,.9,0],'white',false);
 }else if(id==='fitness-balance-beam'){
  box('STABILITY_BEAM',[8,.24,.45],[0,.2,0],'wood').userData.walkableFloor=true;for(const x of [-3.5,3.5])box('BEAM_FOOT',[.25,.16,1.4],[x,.08,0],'dark');for(const x of [-3.96,3.96])box('BEAM_END_CAP',[.08,.25,.46],[x,.195,0],'gold',false);
 }else if(id==='fitness-balance-pad'){
  cyl('BALANCE_PAD',.55,.24,[0,.12,0],'padding').userData.walkableFloor=true;cyl('BALANCE_PAD_RIM',.55,.04,[0,.26,0],'gold',false);for(const x of [-.2,0,.2])for(const z of [-.2,0,.2])ball('PAD_TEXTURE',.027,[x,.265,z],'goldDark');
 }else if(id==='fitness-recovery-mat'){
  box('RECOVERY_MAT',[1.4,.045,3],[0,.0225,0],'padding',false);for(const x of [-.66,.66])box('MAT_STITCH',[.025,.005,2.9],[x,.0475,0],'gold',false);for(const z of [-1.46,1.46])box('MAT_STITCH',[1.34,.005,.025],[0,.0475,z],'gold',false);box('MAT_ALIGNMENT',[.02,.005,2.4],[0,.0475,0],'goldDark',false);
 }else if(id==='fitness-foam-roller'){
  const roller=cyl('FOAM_ROLLER',.16,.6,[0,.17,0],'rubber');roller.rotation.z=Math.PI/2;for(const x of [-.28,-.16,-.04,.08,.2,.28]){const rib=cyl('ROLLER_RIB',.17,.025,[x,.17,0],Math.abs(x)>.25?'gold':'padding',false);rib.rotation.z=Math.PI/2;}
 }else if(id==='fitness-locker'){
  box('LOCKER_BODY',[1.5,2.6,1.2],[0,1.3,0],'dark');box('LOCKER_DOOR',[1.35,2.45,.04],[0,1.3,.62],'padding');for(const y of [.65,.75,.85,2.03,2.13,2.23])box('LOCKER_VENT',[.8,.035,.02],[0,y,.655],'gold',false);box('LOCKER_HANDLE',[.06,.28,.08],[.43,1.4,.68],'gold');box('LOCKER_NAMEPLATE',[.34,.16,.018],[0,2.4,.655],'lightGold',false);for(const x of [-.68,.68])box('LOCKER_EDGE',[.04,2.48,.03],[x,1.3,.65],'goldDark',false);
 }else if(id==='fitness-locker-bench'){
  box('LOCKER_BENCH',[5,.15,1],[0,.555,0],'wood');for(const x of [-2,2]){box('BENCH_LEG',[.15,.48,.8],[x,.24,0],'gold');box('BENCH_FOOT',[.4,.08,1],[x,.04,0],'dark');}box('BENCH_STRETCHER',[4.2,.1,.12],[0,.27,0],'steel');for(const z of [-.42,0,.42])box('BENCH_SLAT',[4.92,.015,.26],[0,.6375,z],'wood',false);
 }else if(id==='fitness-water-station'){
  box('WATER_DISPENSER',[1.4,2,1],[0,1,0],'white');box('WATER_FRONT',[1.05,.95,.035],[0,1.05,.52],'dark');cyl('WATER_BOTTLE',.38,.7,[0,2.35,0],'aqua',false);cyl('BOTTLE_CAP',.2,.04,[0,2.68,0],'gold',false);for(const x of [-.24,.24])box('WATER_TAP',[.16,.12,.19],[x,1.3,.61],'gold');box('WATER_DRIP_TRAY',[.9,.07,.27],[0,.72,.575],'steel');
 }else if(id==='fitness-reception-counter'){
  box('RECEPTION_DESK',[8,1.3,1.5],[0,.65,0],'wood');box('RECEPTION_WORKTOP',[8.3,.12,1.8],[0,1.36,0],'white');for(const y of [.25,1.08])box('RECEPTION_GOLD_TRIM',[7.6,.07,.025],[0,y,.765],'gold',false);for(const x of [-2.8,-1.4,0,1.4,2.8])box('RECEPTION_PANEL',[1.2,.68,.02],[x,.66,.765],'padding',false);box('RECEPTION_KICK',[7.9,.12,.06],[0,.06,.76],'goldDark');
 }else if(id==='fitness-monitor'){
  box('MONITOR_BASE',[.62,.045,.45],[0,.0225,0],'gold');box('MONITOR_STAND',[.1,.3,.1],[0,.19,-.04],'steel');screen(0,.45,-.05,.8,.4);
 }else if(id==='fitness-coach-board'){
  for(const x of [-.72,.72]){box('COACH_BOARD_FOOT',[.2,.08,.7],[x,.04,0],'dark');box('COACH_BOARD_LEG',[.07,1.6,.07],[x,.8,0],'gold');}
  box('COACH_BOARD_PANEL',[2,1.55,.12],[0,1.625,0],'gold');box('COACH_BOARD_FACE',[1.82,1.36,.018],[0,1.625,.075],'screen',false);
  for(const [i,width]of [1.3,1,.75,.9].entries())box('COACH_SESSION_LINE',[width,.035,.006],[-.13,2.12-i*.22,.088],i===0?'lightGold':'aqua',false);
  for(let i=0;i<4;i++)ball('COACH_REP_MARKER',.045,[-.58+i*.38,1.16,.09],'gold');
 }
 // Keep published dimensions conservative and exact. This also guarantees
 // long props remain centred after grounding when a Builder scales them.
 root.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3());
 if(size.x>0&&size.y>0&&size.z>0){root.scale.set(info.dimensions[0]/size.x,info.dimensions[1]/size.y,info.dimensions[2]/size.z);root.updateMatrixWorld(true);const grounded=new THREE.Box3().setFromObject(root),centre=grounded.getCenter(new THREE.Vector3());for(const child of root.children){child.position.x-=centre.x/root.scale.x;child.position.y-=grounded.min.y/root.scale.y;child.position.z-=centre.z/root.scale.z;}}
 // Builder owns the public root scale. Preserve geometry normalization inside
 // a nested group so moving/scaling an item never erases its authored size.
 const model=new THREE.Group();model.name=root.name;root.name+='_PARTS';model.add(root);
 model.userData={builderObject:true,fitnessEquipment:true,modelId:id,label:info.name,description:info.description,dimensions:[...info.dimensions],fitnessKind:info.kind};
 return model;
}
