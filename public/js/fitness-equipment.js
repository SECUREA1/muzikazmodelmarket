import * as THREE from '../vendor/three/three.module.min.js';

/** Grounded, human-scale equipment shared by Builder, Backpack and gym maps. */
const approaches=Object.freeze({
 'Gold Boxing Ring':{x:0,y:.16,z:4},'Gold Heavy Bag':{x:0,y:0,z:2.4},'Gold Bench Press':{x:0,y:0,z:3},
 'Gold Deadlift Platform':{x:0,y:0,z:4},'Gold Power Rack':{x:0,y:0,z:3},'Gold Olympic Barbell':{x:0,y:0,z:1.3},
 'Gold Rowing Machine':{x:2.4,y:0,z:0},'Gold Jump Rope':{x:2.3,y:0,z:0},'Gold Agility Ladder':{x:-2.6,y:0,z:0},
 'Gold Ring Scoreboard':{x:0,y:0,z:3},'Gold Basketball Hoop':{x:0,y:0,z:5.5},'Gold Table Tennis':{x:0,y:0,z:3},'Gold Sprint Gates':{x:0,y:0,z:15},
 'Gold Training Cone':{x:0,y:0,z:1.3},'Gold Training Hurdle':{x:0,y:0,z:1.6},'Gold Balance Beam':{x:-4,y:0,z:-2},'Gold Balance Pad':{x:0,y:0,z:1.3}
});
const item=(name,description,dimensions,priceMzk,kind=null)=>Object.freeze({name,description,dimensions:Object.freeze(dimensions),priceMzk,kind,...(kind?{approach:Object.freeze(approaches[name]||{x:0,y:0,z:dimensions[2]/2+1.2})}:{}),thumbnailUrl:'/public/images/fitness/equipment.svg'});
export const FITNESS_ITEMS=Object.freeze({
 'fitness-boxing-ring':item('Gold Boxing Ring','Championship training ring with four ropes, padded red and blue corners, an open south entrance, shallow access steps and a marked canvas apron.',[12.4,2.24,12.4],850,'boxing'),
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
 'fitness-coach-board':item('Gold Coach Board','Freestanding gold-framed training board with a session diagram and stable feet.',[2,2.4,.7],80),
 'fitness-basketball-hoop':item('Gold Basketball Hoop','Regulation-height 3.05 m rim, backboard, woven-style net and a weighted gold-trimmed portable stand.',[3.6,4.4,2.8],420,'basketball'),
 'fitness-table-tennis':item('Gold Table Tennis','Regulation 2.74 × 1.525 m playing surface at 0.76 m, centre net, folding-style underframe and gold court edging.',[2.74,1.1,1.525],280,'table-tennis'),
 'fitness-sprint-gates':item('Gold Sprint Gates','Three-lane sprint and hurdle course with start and finish timing gates, lane markings and low training hurdles.',[10,2.6,28],360,'sprint'),
 'fitness-ring-scoreboard':item('Gold Ring Scoreboard','Freestanding championship scoreclock with red and blue score panels, round display and a three-minute digital timer.',[5,3.4,1.2],240,'boxing-sparring'),
 'fitness-ringside-seating':item('Gold Ringside Seating','Three-tier ringside spectator stand with padded seats, gold aisle rails and a clear front approach.',[8,1.6,3],180)
});
export const FITNESS_MODEL_INFO=Object.freeze(Object.fromEntries(Object.entries(FITNESS_ITEMS).map(([id,value])=>[id,[value.name,value.description,value.dimensions]])));
export function fitnessItemSettings(id){
 const value=FITNESS_ITEMS[id];if(!value)return null;
 return {active:true,behavior:value.kind?'interact':'decor',...(value.kind?{fitnessStation:value.kind,fitnessApproach:{...value.approach},interactionDistance:4,prompt:'Train '+value.name}:{}),destructible:false};
}

const SCORE_SEGMENTS=Object.freeze({0:'abcdef',1:'bc',2:'abged',3:'abgcd',4:'fgbc',5:'afgcd',6:'afgecd',7:'abc',8:'abcdefg',9:'abfgcd'});
/** Update the physical ring clock from the shared competition state. */
export function updateFitnessScoreboard(model,{red=0,blue=0,round=1,seconds=180}={}){
 if(!model?.getObjectByName)return false;
 const safe=(value,max)=>Math.min(max,Math.max(0,Math.floor(Number(value)||0))),time=safe(seconds,5999),values={RED_TENS:Math.floor(safe(red,99)/10),RED_UNITS:safe(red,99)%10,BLUE_TENS:Math.floor(safe(blue,99)/10),BLUE_UNITS:safe(blue,99)%10,ROUND_TENS:Math.floor(safe(round,99)/10),ROUND_UNITS:safe(round,99)%10,TIME_MIN_TENS:Math.floor(time/600),TIME_MIN_UNITS:Math.floor(time/60)%10,TIME_SEC_TENS:Math.floor(time%60/10),TIME_SEC_UNITS:time%10};
 let changed=false;for(const [name,value]of Object.entries(values)){const digit=model.getObjectByName('FITNESS_SCORE_'+name);if(!digit)continue;digit.userData.scoreValue=value;for(const mesh of digit.children)if(mesh.userData.scoreSegment)mesh.visible=SCORE_SEGMENTS[value].includes(mesh.userData.scoreSegment);changed=true;}return changed;
}


/** Models use a ground origin and a centred X/Z footprint. No browser DOM is needed. */
export function createFitnessEquipment(id){
 const info=FITNESS_ITEMS[id];if(!info)return null;
 const root=new THREE.Group();root.name='FITNESS_EQUIPMENT_'+id;
 const colors={gold:0xd5ac55,lightGold:0xf1d18b,goldDark:0x9d702e,steel:0x8a9da0,dark:0x17232b,rubber:0x27353a,padding:0x59513c,wood:0xa47850,white:0xe6e9de,aqua:0x70c7bf,screen:0x102b2c,muted:0x59746d,red:0xd34d57,blue:0x4c82c6,canvas:0x345d70};
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
  box('RING_APRON',[12,.16,11.2],[0,.08,-.4],'dark').userData.walkableFloor=true;
  for(const x of [-3.7,3.7])box('RING_APRON_ENTRY_WING',[4.6,.16,.8],[x,.08,5.6],'dark').userData.walkableFloor=true;
  box('RING_CANVAS',[11.7,.018,11.7],[0,.169,0],'canvas',false);
  for(const x of [-6,6])for(const z of [-6,6]){
   const corner=x<0&&z<0?'red':x>0&&z>0?'blue':'white';
   cyl('RING_POST',.12,2.24,[x,1.12,z],'gold');cyl('POST_BOOT',.19,.23,[x,.115,z],'dark');
   for(const y of [.66,1.03,1.4,1.77]){box('CORNER_PAD',[.4,.31,.4],[x,y,z],corner,false);for(const side of [-1,1])box('TURNBUCKLE_COVER',[.28,.08,.12],[x+side*.2,y,z],'padding',false);}
   ball('POST_FINIAL',.13,[x,2.1,z],'lightGold');
  }
  for(const [i,y]of [.66,1.03,1.4,1.77].entries()){
   const ropeColor=i===0||i===3?'lightGold':'white';
   for(const x of [-6,6])rod('RING_ROPE_SIDE_'+i,[x,y,-6],[x,y,6],.035,ropeColor);
   rod('RING_ROPE_BACK_'+i,[-6,y,-6],[6,y,-6],.035,ropeColor);
   for(const side of [-1,1])rod('RING_ROPE_ENTRY_'+i,[side*1.65,y,6],[side*6,y,6],.035,ropeColor);
  }
  for(const x of [-5.5,5.5])box('CANVAS_BORDER',[.08,.008,11],[x,.183,0],'gold',false);for(const z of [-5.5,5.5])box('CANVAS_BORDER',[11,.008,.08],[0,.183,z],'gold',false);
  const badge=cyl('CANVAS_BADGE',1.15,.012,[0,.19,0],'goldDark',false);badge.userData.collisionDisabled=true;
  for(const [x,z,color]of [[-4.8,-4.8,'red'],[4.8,4.8,'blue']]){box('CORNER_TRIANGLE',[1.25,.012,1.25],[x,.19,z],color,false);}
  // The opening remains 3.3 m wide at every rope height. Low, shallow treads
  // stay inside the original footprint and preserve the existing approach.
  box('RING_ACCESS_STEP',[2.8,.08,.36],[0,.04,5.92],'goldDark').userData.walkableFloor=true;
  box('RING_ACCESS_TREAD',[2.8,.11,.36],[0,.055,5.56],'dark').userData.walkableFloor=true;
  for(const x of [-4.2,4.2])box('RING_APRON_BADGE',[1.7,.11,.025],[x,.08,6.012],'gold',false);
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
 }else if(id==='fitness-basketball-hoop'){
  box('HOOP_WEIGHTED_BASE',[3.6,.22,2.8],[0,.11,0],'dark');for(const x of [-1.72,1.72])box('HOOP_BASE_TRIM',[.08,.23,2.76],[x,.115,0],'gold',false);
  box('HOOP_SUPPORT_POST',[.2,3.9,.22],[0,2.05,-.88],'gold');rod('HOOP_BACKBOARD_BRACE',[0,2.6,-.88],[0,3.6,.55],.07,'steel');
  box('HOOP_BACKBOARD',[1.83,1.08,.075],[0,3.59,.6],'white');box('HOOP_BACKBOARD_PAD',[1.93,.13,.12],[0,3.01,.6],'blue');
  for(const x of [-.29,.29])box('HOOP_TARGET_BOX',[.025,.4,.015],[x,3.45,.647],'red',false);for(const y of [3.25,3.65])box('HOOP_TARGET_BOX',[.6,.025,.015],[0,y,.647],'red',false);
  rod('HOOP_RIM_BRACKET',[0,3.05,.65],[0,3.05,.97],.045,'red');
  const rim=mesh('REGULATION_BASKETBALL_RIM',new THREE.TorusGeometry(.225,.018,8,36),'gold',[0,3.05,.99]);rim.rotation.x=Math.PI/2;
  for(let i=0;i<12;i++){const a=i*Math.PI/6,b=a+.12;rod('BASKET_NET',[Math.cos(a)*.22,3.04,.99+Math.sin(a)*.22],[Math.cos(b)*.135,2.58,.99+Math.sin(b)*.135],.007,'white',false);}
  for(const [y,r]of [[2.8,.18],[2.58,.135]]){const netRing=mesh('BASKET_NET_RING',new THREE.TorusGeometry(r,.006,4,28),'white',[0,y,.99],[1,1,1],false);netRing.rotation.x=Math.PI/2;}
  box('HOOP_SHOT_CLOCK',[.7,.28,.15],[0,4.26,.62],'dark');for(const x of [-.2,0,.2])box('SHOT_CLOCK_SEGMENT',[.055,.14,.02],[x,4.26,.705],'gold',false);
 }else if(id==='fitness-table-tennis'){
  box('TABLE_TENNIS_TOP',[2.74,.06,1.525],[0,.73,0],'blue');for(const x of [-1.35,1.35])box('TABLE_EDGE_LINE',[.025,.006,1.5],[x,.763,0],'white',false);for(const z of [-.75,.75])box('TABLE_EDGE_LINE',[2.72,.006,.025],[0,.763,z],'white',false);
  box('TABLE_CENTRE_LINE',[2.72,.005,.018],[0,.763,0],'white',false);box('TABLE_GOLD_APRON',[2.74,.12,1.525],[0,.66,0],'goldDark');
  for(const x of [-.92,.92])for(const z of [-.56,.56]){box('TABLE_LEG',[.07,.59,.07],[x,.295,z],'steel');cyl('TABLE_CASTER',.045,.06,[x,.045,z],'dark').rotation.x=Math.PI/2;}
  for(const x of [-.92,.92])box('TABLE_LEG_BRACE',[.08,.08,1.2],[x,.22,0],'gold');box('TABLE_UNDERFRAME',[1.9,.07,.08],[0,.38,0],'steel');
  for(const z of [-.75,.75]){box('TABLE_NET_POST',[.04,.34,.025],[0,.93,z],'gold');box('TABLE_NET_CLAMP',[.14,.055,.025],[0,.7,z],'dark');}
  box('TABLE_NET',[.012,.1525,1.49],[0,.83625,0],'dark',false);box('TABLE_NET_TAPE',[.018,.01,1.51],[0,.9075,0],'white',false);
  for(let i=0;i<13;i++)box('NET_MESH_VERTICAL',[.016,.14,.006],[0,.84,-.7+i*.1167],'white',false);for(const y of [.79,.835,.88])box('NET_MESH_HORIZONTAL',[.016,.005,1.49],[0,y,0],'white',false);
  for(const x of [-1.17,1.17]){const paddle=cyl('TABLE_TENNIS_PADDLE',.09,.016,[x,.783,.5],x<0?'red':'dark',false);rod('PADDLE_HANDLE',[x-.11,.783,.5],[x-.02,.783,.5],.018,'wood',false);}
  ball('TABLE_TENNIS_BALL',.02,[1.08,.79,-.48],'white');
 }else if(id==='fitness-sprint-gates'){
  // Timing gates sit outside all three running lanes. The low rail feet leave
  // the centre 8.6 m clear, with a dedicated hurdle lane at the right.
  for(const z of [-13.9,13.9]){for(const x of [-4.9,4.9]){box('SPRINT_GATE_FOOT',[.2,.1,.2],[x,.05,z],'dark');box('SPRINT_GATE_POST',[.12,2.6,.12],[x,1.3,z],'gold');}box('SPRINT_GATE_HEADER',[10,.16,.2],[0,2.52,z],'dark');for(const x of [-3.3,0,3.3])box('SPRINT_GATE_LIGHT',[.12,.12,.225],[x,2.52,z],'gold',false);}
  for(const x of [-4.7,-1.55,1.55,4.7])box('SPRINT_LANE_LINE',[.05,.012,27.6],[x,.006,0],'white',false);for(const z of [-12.7,12.7])box('SPRINT_TIMING_LINE',[9.4,.015,.1],[0,.0075,z],'gold',false);
  for(const z of [-8,-3,7]){for(const x of [2.1,4.1]){box('SPRINT_HURDLE_FOOT',[.45,.1,.6],[x,.05,z],'dark');box('SPRINT_HURDLE_POST',[.055,.65,.055],[x,.325,z],'gold');}box('SPRINT_HURDLE',[2.1,.06,.06],[3.1,.65,z],'white');}
 }else if(id==='fitness-ring-scoreboard'){
  for(const x of [-1.9,1.9]){box('SCOREBOARD_FOOT',[.45,.12,1.2],[x,.06,0],'dark');box('SCOREBOARD_POST',[.1,1.6,.12],[x,.8,-.16],'gold');}
  box('SCOREBOARD_FRAME',[5,2.1,.3],[0,2.35,0],'gold');box('SCOREBOARD_FACE',[4.74,1.84,.035],[0,2.35,.175],'screen',false);
  const digit=(name,value,x,y,scale=1)=>{
   const g=new THREE.Group();g.name='FITNESS_SCORE_'+name;g.position.set(x,y,.215);g.scale.setScalar(scale);root.add(g);
   const bits={a:[0,.3,.28,.045],b:[.145,.15,.045,.255],c:[.145,-.15,.045,.255],d:[0,-.3,.28,.045],e:[-.145,-.15,.045,.255],f:[-.145,.15,.045,.255],g:[0,0,.28,.045]};
   for(const [segment,[dx,dy,w,h]]of Object.entries(bits)){const m=box('SCORE_SEGMENT_'+segment,[w,h,.025],[dx,dy,0],'gold',false,g);m.userData.scoreSegment=segment;m.visible=SCORE_SEGMENTS[value].includes(segment);}g.userData.scoreValue=value;return g;
  };
  for(const [x,color]of [[-1.72,'red'],[1.72,'blue']])box('CORNER_SCORE_HEADER',[1.1,.12,.04],[x,3.02,.205],color,false);
  digit('RED_TENS',0,-1.91,2.37,.9);digit('RED_UNITS',0,-1.53,2.37,.9);digit('BLUE_TENS',0,1.53,2.37,.9);digit('BLUE_UNITS',0,1.91,2.37,.9);
  digit('TIME_MIN_TENS',0,-.82,2.53);digit('TIME_MIN_UNITS',3,-.38,2.53);digit('TIME_SEC_TENS',0,.25,2.53);digit('TIME_SEC_UNITS',0,.69,2.53);for(const y of [2.41,2.66])ball('CLOCK_COLON',.032,[-.065,y,.215],'white');
  box('ROUND_LABEL',[1.3,.055,.025],[0,1.86,.215],'aqua',false);digit('ROUND_TENS',0,-.14,1.59,.46);digit('ROUND_UNITS',1,.14,1.59,.46);
 }else if(id==='fitness-ringside-seating'){
  for(let row=0;row<3;row++){const z=-1+row,y=.12+row*.34;box('SEATING_TIER',[8,.16,.96],[0,y,z],'dark').userData.walkableFloor=true;
   for(let seat=0;seat<6;seat++){const x=-3.25+seat*1.3;box('RINGSIDE_SEAT',[1.05,.13,.68],[x,y+.2,z],'padding');box('RINGSIDE_BACKREST',[1.08,.42,.12],[x,y+.475,z-.34],row===1?'blue':'goldDark');}}
  for(const x of [-3.95,3.95]){box('SEATING_END_FRAME',[.1,1.6,3],[x,.8,0],'gold');for(const z of [-1.4,1.4])box('SEATING_SUPPORT',[.1,.76,.1],[x,.38,z],'steel');}
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
