import * as T from '../../vendor/three/three.module.min.js';
import {FITNESS_STATIONS} from '../fitness-config.js';

/** A single physical gym shared by the browser and authoritative collision world. */
export function createFitnessLand(environment={}){
 const root=new T.Group();root.name='MUZIKAZ_FITNESS_CENTRE';
 root.userData={proceduralLand:true,layout:'fitness-centre',cleanSportsWorld:true,streetHeightAt:()=>0};
 const materials=new Map(),animations=[],cube=new T.BoxGeometry(1,1,1),round=new T.CylinderGeometry(1,1,1,18),ball=new T.SphereGeometry(1,12,8);
 const material=(color,metalness=0,emissive=false)=>{const key=[color,metalness,emissive].join(':');if(!materials.has(key))materials.set(key,new T.MeshStandardMaterial({color,roughness:metalness?.4:.8,metalness,emissive:emissive?color:0,emissiveIntensity:emissive?.45:0}));return materials.get(key);};
 const palette={floor:'#1a252c',rubber:'#26353d',steel:'#8cabb3',dark:'#15212a',white:'#e8eee9',orange:'#ed7955',teal:'#55c6ba',yellow:'#eac765',wood:'#a67855',blue:'#638db7',purple:'#a28ad2'};
 const mat=key=>material(palette[key]||key,['steel'].includes(key)?.7:0,['teal','orange'].includes(key));
 function mesh(parent,name,geo,m,x,y,z,solid=true){const node=new T.Mesh(geo,m);node.name=name;node.position.set(x,y,z);node.castShadow=solid;node.receiveShadow=true;if(!solid)node.userData.collisionDisabled=true;parent.add(node);return node;}
 function box(name,x,y,z,w,h,d,color='dark',solid=true,parent=root){const node=mesh(parent,'FITNESS_'+name,cube,typeof color==='string'?mat(color):color,x,y,z,solid);node.scale.set(w,h,d);return node;}
 function cylinder(name,x,y,z,r,h,color='steel',solid=true,parent=root){const node=mesh(parent,'FITNESS_'+name,round,typeof color==='string'?mat(color):color,x,y,z,solid);node.scale.set(r,h,r);return node;}
 function sphere(name,x,y,z,r,color='orange',solid=false,parent=root){const node=mesh(parent,'FITNESS_'+name,ball,mat(color),x,y,z,solid);node.scale.setScalar(r);return node;}
 function group(name,x,z,rotation=0){const g=new T.Group();g.name='FITNESS_'+name;g.position.set(x,0,z);g.rotation.y=rotation;root.add(g);return g;}
 function sign(text,x,y,z,w,h,color='#e6eee8',rotation=0,sub=''){
  let texture=null;if(typeof document!=='undefined'){const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;const ctx=canvas.getContext('2d');if(ctx){ctx.clearRect(0,0,1024,256);ctx.fillStyle=color;ctx.textAlign='center';ctx.font='700 '+(text.length>23?55:72)+'px system-ui';ctx.fillText(text,512,sub?112:156,990);if(sub){ctx.fillStyle='#a8bec3';ctx.font='500 25px system-ui';ctx.fillText(sub,512,184,990);}texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;}}
  const face=mesh(root,'FITNESS_SIGN_'+text,new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:texture,color:texture?'#ffffff':color,transparent:true,side:T.DoubleSide,depthWrite:false}),x,y,z,false);face.rotation.y=rotation;return face;
 }
 function floorLabel(text,x,z,w=10,color='#6f979d'){const label=sign(text,x,.07,z,w,1.5,color);label.rotation.x=-Math.PI/2;return label;}
 function pad(name,x,z,w,d,color='rubber'){box(name,x,.024,z,w,.048,d,color,false);}
 function stripe(name,x,z,w,d,color='teal'){box(name,x,.056,z,w,.016,d,color,false);}
 function barbell(name,x,y,z,width=2.5,parent=root,color='orange'){
  const bar=cylinder(name+'_BAR',x,y,z,.035,width,'steel',false,parent);bar.rotation.z=Math.PI/2;
  for(const side of [-1,1])for(let i=0;i<3;i++){const plate=cylinder(name+'_PLATE',x+side*(width*.35+i*.085),y,z,.25+i*.018,.075,i===2?color:'dark',false,parent);plate.rotation.z=Math.PI/2;}
  return bar;
 }
 function bench(name,x,z,rotation=0){const g=group(name,x,z,rotation);box('BENCH_CUSHION',0,.65,0,.65,.19,2.1,'orange',true,g);for(const dz of [-.7,.7]){box('BENCH_FOOT',0,.1,dz,1.1,.16,.25,'dark',true,g);box('BENCH_LEG',0,.34,dz,.13,.48,.13,'steel',true,g);}for(const side of [-1,1]){box('PRESS_UPRIGHT',side*.9,1,-.9,.13,2,.16,'steel',true,g);box('PRESS_SPOTTER',side*.9,.9,-.45,.14,.12,1.2,'steel',true,g);box('PRESS_CRADLE',side*.9,1.5,-.88,.18,.12,.26,'orange',true,g);}barbell(name,0,1.65,-.95,2.6,g);return g;}
 function rower(name,x,z,rotation=Math.PI/2){const g=group(name,x,z,rotation);box('ROW_RAIL',0,.35,0,.16,.12,2.5,'steel',true,g);box('ROW_SEAT',0,.6,.3,.68,.16,.5,'dark',true,g);cylinder('ROW_FLYWHEEL',0,.7,-1.2,.49,.36,'dark',true,g).rotation.z=Math.PI/2;for(const side of [-1,1]){box('ROW_FOOT',side*.33,.38,-.6,.28,.1,.42,'orange',true,g);box('ROW_BASE',side*.4,.12,-1.1,.12,.2,.8,'steel',true,g);}box('ROW_HANDLE',0,.95,-.6,.65,.07,.07,'teal',false,g);box('ROW_DISPLAY',0,1.3,-1.1,.45,.3,.06,'teal',false,g);return g;}
 // An 80 m atlas footprint contains a 72 × 72 m open training hall.
 box('WALKABLE_FLOOR',0,-.12,0,80,.24,80,'floor').userData.walkableFloor=true;
 pad('CENTRAL_PROMENADE',0,1,9,67,'#3d5359');for(const x of [-4.6,4.6])stripe('WAYFINDING',x,0,.08,69,'teal');
 for(const z of [-7,21])pad('CROSS_AISLE',0,z,69,3.8,'#3d5359');
 for(const x of [-36,36]){box('PERIMETER_WALL',x,4.2,0,.55,8.4,72,'dark');box('WALL_SKIRT',x-Math.sign(x)*.32,.5,0,.12,1,71,'#3d5963');}
 box('BACK_WALL',0,4.2,-36,72,8.4,.55,'dark');
 for(const x of [-22,22])box('ENTRY_WALL',x,4.2,36,28,8.4,.55,'dark');box('ENTRY_LINTEL',0,6.9,36,16,3,.55,'dark');
 for(const x of [-8,8])box('ENTRY_FRAME',x,2.7,35.5,.18,5.4,.25,'teal');
 const glass=new T.MeshStandardMaterial({color:'#9acecf',transparent:true,opacity:.33,roughness:.18,metalness:.35,side:T.DoubleSide});
 for(let z=-29;z<=27;z+=14){box('WEST_WINDOW',-35.68,3.8,z,.07,4.4,10.5,glass,false);for(const dz of [-5.4,5.4])box('WINDOW_MULLION',-35.57,3.8,z+dz,.12,4.8,.14,'steel',false);}
 for(let x=-26;x<=26;x+=13){box('HIGH_WINDOW',x,6.1,-35.65,10.5,2.4,.08,glass,false);box('HIGH_WINDOW_SILL',x,4.85,-35.45,10.8,.15,.35,'steel');}
 // Exposed rafters leave the overview readable while giving the hall a roofline.
 for(const z of [-33,-16,1,18,34]){box('RAFTER',0,8.2,z,71,.25,.28,'wood',false);for(const x of [-18,18]){box('RAFTER_BRACE',x,7.75,z,.16,.12,8,'steel',false);}box('LED_STRIP',0,7.98,z,66,.055,.11,'white',false);}
 for(const x of [-34,34])for(const z of [-32,-7,21,33])box('STRUCTURAL_COLUMN',x,3.7,z,.45,7.4,.45,'steel');
 sign('MUZIKAZ FITNESS',0,6.6,-35.5,27,4,'#e6eee8',0,'MOVE WITH PURPOSE  /  TRAIN FOR MZK');
 sign('TRAINING FLOOR',0,4.4,34.9,13,2,'#55c6ba',Math.PI,'BOXING  ·  STRENGTH  ·  MOVEMENT');
 // Boxing ring, open south access, suspended heavy bags and corner stools.
 pad('BOXING_ZONE',-23,-20,23,26,'#293d4b');
 box('BOXING_RING_APRON',-22,.06,-18,12,.12,12,'blue');box('BOXING_RING_CANVAS',-22,.13,-18,11.3,.02,11.3,'#3b626c',false);
 for(const x of [-28,-16])for(const z of [-24,-12]){cylinder('RING_POST',x,1.12,z,.115,2.24,x===-28?'orange':'teal');for(const y of [.7,1.15,1.6])box('CORNER_PAD',x,y,z,.32,.3,.32,x===-28?'orange':'teal',false);}
 for(const y of [.7,1.15,1.6]){for(const x of [-28,-16])box('RING_ROPE_SIDE',x,y,-18,.055,.055,12,'white');box('RING_ROPE_NORTH',-22,y,-24,12,.055,.055,'white');for(const x of [-25.8,-18.2])box('RING_ROPE_SOUTH',x,y,-12,4.4,.055,.055,'white');}
 floorLabel('COMBINATION LAB',-22,-18,8,'#94bbc6');sign('01 / BOXING',-22,4.4,-30.5,14,2,'#ed7955',0,'READ THE CUE  ·  THROW THE COMBINATION');
 for(const [x,z]of [[-31,-27],[-31,-18],[-30,-9.3]]){box('HEAVY_BAG_SUPPORT',x,2.5,z-.5,.13,5,.13,'steel');box('BAG_ARM',x,4.8,z,.13,.13,1.1,'steel');cylinder('BAG_CHAIN',x,3.95,z,.025,1.6,'steel',false);const bag=group('HEAVY_BAG',x,z);cylinder('PUNCH_BAG',0,2.15,0,.45,1.5,'orange',true,bag);for(const y of [1.6,2.7])cylinder('BAG_BAND',0,y,0,.46,.1,'dark',false,bag);animations.push(time=>{bag.rotation.z=Math.sin(time*1.3+z)*.025;});}
 for(const [x,z]of [[-29,-29],[-15,-29]]){cylinder('CORNER_STOOL',x,.46,z,.36,.12,'orange');for(const dx of [-.22,.22])box('STOOL_LEG',x+dx,.23,z,.07,.46,.07,'steel');}
 // Two presses, a deadlift platform, dumbbell rack and open power rack.
 pad('STRENGTH_ZONE',22,-20,27,27,'#303334');for(const x of [8.5,35.5])stripe('STRENGTH_EDGE',x,-20,.09,27,'orange');
 bench('PRIMARY_BENCH',18,-22);bench('MEMBER_BENCH',12,-27,Math.PI/2);
 pad('DEADLIFT_TIMBER',29,-11,8,6,'wood');for(const x of [26,32])pad('DEADLIFT_RUBBER',x,-11,2.2,6,'dark');barbell('DEADLIFT',29,.3,-11,2.8);
 for(const x of [24,28]){box('POWER_RACK_UPRIGHT',x,1.5,-28,.12,3,.12,'steel');box('POWER_RACK_FOOT',x,.08,-28,1,.16,2.7,'dark');}box('POWER_RACK_PULLUP',26,2.92,-28,4.1,.1,.1,'teal');barbell('SQUAT_BAR',26,1.6,-28,2.8);
 box('DUMBBELL_RACK',22,.66,-33,14,.12,1.1,'steel');for(const x of [15.5,28.5])box('DUMBBELL_RACK_LEG',x,.32,-33,.15,.64,1.2,'steel');
 for(let i=0;i<9;i++){const x=16+i*1.5;const dumbbell=barbell('DUMBBELL_'+i,x,.88,-33,.55,root,i%2?'orange':'teal');dumbbell.rotation.z=Math.PI/2;}
 for(const z of [-22,-16]){cylinder('PLATE_TREE',34,1,z,.065,2,'steel');for(const y of [.5,1,1.5])for(const side of [-1,1]){const p=cylinder('STORED_PLATE',34+side*.3,y,z,.28,.16,'orange');p.rotation.z=Math.PI/2;}}
 sign('02 / STRENGTH',22,4.6,-31,16,2,'#ed7955',0,'CONTROL  ·  TEMPO  ·  POWER');floorLabel('LIFT WITH CONTROL',22,-9,13,'#b19678');
 // Window-side cardio with treadmills, bikes and two rowing stations.
 pad('CARDIO_ZONE',-25,13,18,21,'#273c40');
 for(const [i,x]of [-31,-26].entries()){const z=5,g=group('TREADMILL_'+i,x,z);box('RUNNING_BASE',0,.18,0,1.6,.3,3.2,'dark',true,g);box('RUNNING_BELT',0,.36,0,1.2,.04,2.8,'#42575a',false,g);for(const side of [-1,1]){box('TREADMILL_RAIL',side*.75,.9,-1,.09,1.4,.09,'steel',true,g);box('TREADMILL_HANDGRIP',side*.65,1.44,-.65,.09,.08,.9,'teal',true,g);}box('TREADMILL_CONSOLE',0,1.55,-1.2,1.4,.4,.12,'dark',true,g);box('TREADMILL_SCREEN',0,1.57,-1.12,.8,.27,.025,'teal',false,g);}
 rower('PRIMARY_ROWER',-27,15);rower('MEMBER_ROWER',-26,20);
 for(const x of [-32,-28]){const g=group('BIKE',x,25,Math.PI/2);cylinder('BIKE_FLYWHEEL',0,.45,0,.4,.18,'dark',true,g).rotation.z=Math.PI/2;box('BIKE_FRAME',0,.65,0,.08,1,.85,'steel',true,g).rotation.x=.35;box('BIKE_SADDLE',0,1.1,.3,.42,.15,.42,'orange',true,g);box('BIKE_HANDLE',0,1.4,-.55,.8,.06,.08,'teal',true,g);for(const dz of [-.6,.6])box('BIKE_FOOT',0,.1,dz,.8,.12,.16,'steel',true,g);}
 sign('03 / ENDURANCE',-25,3.7,1,16,2,'#55c6ba',0,'DRIVE  ·  RECOVER  ·  REPEAT');floorLabel('ROW + RUN',-25,11,10);
 // Rhythm studio: marked circle, spare ropes, mirror and movement area.
 pad('RHYTHM_MAT',-12,5,13,13,'#36404b');const rhythmRing=mesh(root,'FITNESS_RHYTHM_RING',new T.TorusGeometry(3.7,.045,6,56),mat('teal'),-12,.075,5,false);rhythmRing.rotation.x=Math.PI/2;
 floorLabel('FIND YOUR RHYTHM',-12,8.5,10,'#a7bcbf');for(const x of [-16,-13,-10]){box('ROPE_HOOK',x,2.2,-1,.08,.08,.2,'steel');const rope=mesh(root,'FITNESS_SPARE_JUMP_ROPE',new T.TorusGeometry(.45,.025,5,30),mat('orange'),x,1.45,-1,false);rope.scale.y=1.5;}
 // Fast footwork ladder, soft hurdles, slalom cones and a short sprint lane.
 pad('AGILITY_TURF',22,8,24,19,'#2f5148');for(const x of [12,20,28])stripe('LANE_EDGE',x,8,.06,17,'white');
 for(let i=0;i<9;i++){const z=.5+i*1.6;stripe('LADDER_RUNG',16,z,2.6,.1,'yellow');}for(const x of [14.7,17.3])stripe('LADDER_SIDE',x,7,0.08,15,'yellow');
 for(let i=0;i<5;i++){const z=1+i*3.1,x=24+(i%2?1:-1);cylinder('CONE_BASE',x,.08,z,.4,.16,'orange');mesh(root,'FITNESS_CONE',new T.ConeGeometry(.28,.8,12),mat('orange'),x,.52,z,false);}
 for(const z of [1,6,11]){for(const x of [30,32])box('HURDLE_FOOT',x,.1,z,.7,.14,.6,'dark');for(const x of [30,32])box('HURDLE_UPRIGHT',x,.5,z,.07,.9,.07,'yellow');box('HURDLE_CROSSBAR',31,.9,z,2.1,.08,.08,'yellow');}
 floorLabel('QUICK FEET / CLEAR MIND',22,17,17,'#c8d9be');sign('04 / REACTION',22,3.8,-2.5,15,2,'#eac765',0,'READ  ·  REACT  ·  MOVE');
 // Low, walkable balance course and recovery mats with foam rollers.
 pad('RECOVERY_FLOOR',24,26,23,11,'#39364b');box('BALANCE_BEAM',25,.16,25,8,.32,.45,'wood');for(const x of [21.5,28.5])box('BALANCE_FOOT',x,.08,25,.25,.16,1.4,'dark');
 for(let i=0;i<4;i++){const x=15+i*1.6;cylinder('BALANCE_PAD',x,.14,29,.55,.28,i%2?'teal':'purple');}
 for(let i=0;i<3;i++){pad('RECOVERY_MAT',28+i*2.3,30,1.4,3,'purple');const roller=cylinder('FOAM_ROLLER',28+i*2.3,.2,31.6,.17,.6,'teal',false);roller.rotation.z=Math.PI/2;}
 sign('05 / RECOVER',25,3.7,33,17,1.8,'#c1aadf',Math.PI,'BALANCE  ·  STABILITY  ·  MOBILITY');
 // A readable reception, locker wall, hydration station and trainer podiums.
 box('RECEPTION_COUNTER',0,.66,28,8,1.3,1.5,'wood');box('RECEPTION_TOP',0,1.35,28,8.3,.13,1.8,'white');box('RECEPTION_ACCENT',0,.75,28.77,7.6,.13,.05,'teal',false);
 box('RECEPTION_MONITOR',2,1.75,28,.9,.6,.08,'dark');box('RECEPTION_SCREEN',2,1.75,28.05,.8,.5,.015,'teal',false);sign('WELCOME / LET’S MOVE',0,2.4,28.83,8,1.2,'#e6eee8');
 for(let i=0;i<9;i++){const x=-32+i*1.7;box('LOCKER',x,1.3,33.6,1.5,2.6,1.2,i%2?'#435b65':'#526c72');for(const y of [1,2.1])box('LOCKER_VENT',x,y,34.22,.8,.04,.025,'steel',false);box('LOCKER_HANDLE',x+.4,1.45,34.26,.06,.28,.07,'orange',false);}
 for(const x of [-28,-20]){box('LOCKER_BENCH',x,.55,29,5,.15,1,'wood');for(const dx of [-2,2])box('LOCKER_BENCH_LEG',x+dx,.25,29,.15,.5,.8,'steel');}
 box('WATER_STATION',-13,1,31,1.4,2,1,'white');cylinder('WATER_BOTTLE',-13,2.35,31,.38,.7,'teal',false);box('WATER_TAP',-13,1.3,31.55,.2,.12,.17,'steel',false);
 sign('LOCKERS / HYDRATE',-24,4.2,35.4,18,2,'#a8bec3',Math.PI);
 for(const [x,z,color]of [[-6,26.5,'orange'],[7,-9.5,'teal']]){cylinder('COACH_BASE',x,.04,z,.7,.08,color,false);box('COACH_BOARD',x,1.5,z-1.2,1.9,1.5,.12,'dark');box('COACH_BOARD_EDGE',x,2.3,z-1.2,2,.08,.16,color,false);}
 sign('COACH MAYA',-6,2.35,25.25,4.8,.75,'#ed7955');sign('COACH LEON',7,2.35,-10.75,4.8,.75,'#55c6ba');
 for(const station of FITNESS_STATIONS){const {x,z}=station.position;const beacon=cylinder('ACTIVITY_MARKER_'+station.kind,x,.055,z,.7,.045,'teal',false);beacon.userData.fitnessStationId=station.id;const ring=mesh(root,'FITNESS_ACTIVITY_RING',new T.TorusGeometry(.85,.035,6,32),mat('teal'),x,.1,z,false);ring.rotation.x=Math.PI/2;animations.push(time=>{ring.scale.setScalar(1+Math.sin(time*2)*.06);});}
 // Plants and ceiling fixtures add depth without blocking training circulation.
 for(const [x,z]of [[-10,33],[10,33],[-33,-33],[33,-33]]){cylinder('PLANTER',x,.5,z,.55,1,'#536b65');for(let i=0;i<5;i++){const leaf=sphere('PLANT_LEAF',x+Math.cos(i*2)*.3,1.25+i*.12,z+Math.sin(i*2)*.3,.45,'#4c8060');leaf.scale.set(.25,.9,.35);leaf.rotation.z=Math.sin(i)*.6;}}
 // Builder drafts keep the architecture as a base and expose every equipment
 // assembly as a selectable object. Removing or moving a draft item must never
 // leave a second, fixed copy hidden in the procedural backdrop.
 const fitness=environment.fitness||environment.builderScene?.sourceFitness||environment.builderScene?.layoutMeta?.fitness||{};
 if(fitness.editableEquipment){
  const names=new Set(['BOXING_RING_APRON','BOXING_RING_CANVAS','RING_POST','CORNER_PAD','RING_ROPE_SIDE','RING_ROPE_NORTH','RING_ROPE_SOUTH','HEAVY_BAG_SUPPORT','BAG_ARM','BAG_CHAIN','CORNER_STOOL','STOOL_LEG','DEADLIFT_TIMBER','DEADLIFT_RUBBER','POWER_RACK_UPRIGHT','POWER_RACK_FOOT','POWER_RACK_PULLUP','DUMBBELL_RACK','DUMBBELL_RACK_LEG','PLATE_TREE','STORED_PLATE','RHYTHM_RING','ROPE_HOOK','SPARE_JUMP_ROPE','LADDER_RUNG','LADDER_SIDE','CONE_BASE','CONE','HURDLE_FOOT','HURDLE_UPRIGHT','HURDLE_CROSSBAR','BALANCE_BEAM','BALANCE_FOOT','BALANCE_PAD','RECOVERY_MAT','FOAM_ROLLER','RECEPTION_COUNTER','RECEPTION_TOP','RECEPTION_ACCENT','RECEPTION_MONITOR','RECEPTION_SCREEN','SIGN_WELCOME / LET’S MOVE','LOCKER','LOCKER_VENT','LOCKER_HANDLE','LOCKER_BENCH','LOCKER_BENCH_LEG','WATER_STATION','WATER_BOTTLE','WATER_TAP','COACH_BASE','COACH_BOARD','COACH_BOARD_EDGE','SIGN_COACH MAYA','SIGN_COACH LEON','ACTIVITY_RING']);
  const prefixes=['HEAVY_BAG','PRIMARY_BENCH','MEMBER_BENCH','DEADLIFT_','SQUAT_BAR','DUMBBELL_','TREADMILL_','PRIMARY_ROWER','MEMBER_ROWER','BIKE','ACTIVITY_MARKER_'];
  for(const child of [...root.children]){const name=child.name.replace(/^FITNESS_/,'');if(names.has(name)||prefixes.some(prefix=>name.startsWith(prefix)))root.remove(child);}
  animations.length=0;root.userData.editableEquipment=true;
 }
 root.userData.updateFitnessEffects=elapsed=>{for(const animate of animations)animate(elapsed);};
 return root;
}
