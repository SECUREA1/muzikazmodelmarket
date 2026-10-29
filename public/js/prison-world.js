import * as T from '../vendor/three/three.module.min.js';
import {articulateLimb,updateArticulatedCharacter,finalizeArticulatedCharacter} from './articulated-character-rig.js';
import {PRISON_ID,PRISON_SIZE,PRISON_WALLS,PRISON_CELLS,PRISON_STATIONS,PRISON_NPCS} from './prison-config.js';

// Facial markings are part of the existing head draw, with no image/texture
// request or extra material. The shared white hand colors retain each skin tone.
function residentHeadGeometry(){
 const sphere=new T.SphereGeometry(1,10,8),positions=Array.from(sphere.attributes.position.array),normals=Array.from(sphere.attributes.normal.array),uvs=Array.from(sphere.attributes.uv.array),indices=Array.from(sphere.index.array),colors=Array(sphere.attributes.position.count*3).fill(1);
 const mark=(x,y,z,w,h,shade)=>{const offset=positions.length/3;positions.push(x-w/2,y-h/2,z,x+w/2,y-h/2,z,x+w/2,y+h/2,z,x-w/2,y+h/2,z);for(let i=0;i<4;i++){normals.push(0,0,1);uvs.push(0,0);colors.push(shade,shade,shade);}indices.push(offset,offset+1,offset+2,offset,offset+2,offset+3);};
 for(const x of [-.27,.27]){mark(x,.11,.985,.12,.105,.09);mark(x,.31,.94,.21,.035,.15);}
 mark(0,-.27,.965,.23,.035,.24);
 sphere.setAttribute('position',new T.Float32BufferAttribute(positions,3));sphere.setAttribute('normal',new T.Float32BufferAttribute(normals,3));sphere.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));sphere.setAttribute('color',new T.Float32BufferAttribute(colors,3));sphere.setIndex(indices);sphere.computeBoundingBox();sphere.computeBoundingSphere();return sphere;
}

/** Ironwood is intentionally open-roofed: first person reads as a substantial
 * secure facility while the overview can still show every playable room. */
export function createPrisonLand(environment={}){
 const root=new T.Group();root.name='MUZIKAZ_IRONWOOD_PRISON';
 root.userData={proceduralLand:true,layout:'prison',prison:true,streetHeightAt:()=>0};
 const cube=new T.BoxGeometry(1,1,1),round=new T.CylinderGeometry(1,1,1,10),ball=new T.SphereGeometry(1,10,8),handBall=new T.SphereGeometry(1,8,6),headGeometry=residentHeadGeometry(),materials=new Map(),doors=new Map(),people=new Map(),animations=[];
 handBall.setAttribute('color',new T.Float32BufferAttribute(Array(handBall.attributes.position.count*3).fill(1),3));
 const mat=(color,glow=false)=>{const key=color+':'+glow;if(!materials.has(key))materials.set(key,new T.MeshStandardMaterial({color,roughness:.76,metalness:color==='#a0b5bc'?.52:.12,emissive:glow?color:0,emissiveIntensity:glow?.55:0}));return materials.get(key);};
 function box(name,x,y,z,w,h,d,color='#647277',solid=false,parent=root){const m=new T.Mesh(cube,typeof color==='string'?mat(color):color);m.name='PRISON_'+name;m.position.set(x,y,z);m.scale.set(w,h,d);m.castShadow=solid;m.receiveShadow=true;if(!solid)m.userData.collisionDisabled=true;parent.add(m);return m;}
 function cylinder(name,x,y,z,r,h,color='#a0b5bc',solid=false,parent=root){const m=new T.Mesh(round,mat(color));m.name='PRISON_'+name;m.position.set(x,y,z);m.scale.set(r,h,r);m.castShadow=solid;m.receiveShadow=true;if(!solid)m.userData.collisionDisabled=true;parent.add(m);return m;}
 function sphere(name,x,y,z,r,color,parent=root){const m=new T.Mesh(ball,mat(color));m.name='PRISON_'+name;m.position.set(x,y,z);m.scale.setScalar(r);m.userData.collisionDisabled=true;parent.add(m);return m;}
 function sign(text,x,y,z,w=10,h=1.8,color='#f1e9d5',rotation=0,sub=''){
  let texture=null;if(typeof document!=='undefined'){const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;const ctx=canvas.getContext('2d');if(ctx){ctx.fillStyle='#172c35';ctx.fillRect(0,0,1024,256);ctx.fillStyle=color;ctx.textAlign='center';ctx.font='700 '+(text.length>22?51:68)+'px system-ui';ctx.fillText(text,512,sub?116:155,990);if(sub){ctx.fillStyle='#b2c6cb';ctx.font='500 27px system-ui';ctx.fillText(sub,512,190,990);}texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;}}
  const panel=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:texture,color:texture?'#ffffff':color,side:T.DoubleSide}));panel.name='PRISON_SIGN_'+text;panel.position.set(x,y,z);panel.rotation.y=rotation;panel.userData.collisionDisabled=true;root.add(panel);return panel;
 }
 function floor(name,x,z,w,d,color){const node=box(name,x,.014,z,w,.025,d,color);node.userData.walkableFloor=true;return node;}
 const floorMesh=box('WALKABLE_FLOOR',0,-.12,0,PRISON_SIZE,.24,PRISON_SIZE,'#65736b',true);floorMesh.userData.walkableFloor=true;
 floor('SECURITY_WALK',0,0,218,218,'#677678');
 floor('CENTRAL_BOULEVARD',0,5,25,195,'#859297');
 for(const x of [-11.5,11.5])floor('BOULEVARD_EDGE',x,5,.12,195,'#d4c38d');
 for(const z of [-60,0,57])floor('CROSS_AISLE',0,z,203,8,'#87969a');
 floor('YARD_TURF',-20,-84,151,36,'#60765c');
 floor('CAFETERIA_FLOOR',62,31,78,51,'#b3b4a1');
 floor('RECREATION_FLOOR',62,-31,78,51,'#6a8585');
 floor('INFIRMARY_FLOOR',-66,77,61,29,'#a2b6ac');
 floor('LAUNDRY_FLOOR',55,78,35,29,'#93a1a5');
 floor('SECURITY_FLOOR',89,78,19,29,'#566f7d');
 floor('WORKSHOP_FLOOR',84,-87,33,27,'#9a9075');
 for(const z of [27,-30]){floor('CELLBLOCK_FLOOR',-62,z,77,45,'#8e9894');floor('BLOCK_CENTRAL_AISLE',-62,z,77,15,'#7d9096');}
 // Full panel colliders keep narrow gaps between the bars from allowing capsule
 // clipping. Their visible metal bars preserve a readable prison silhouette.
 const invisible=new T.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false});
 for(const wall of PRISON_WALLS){
  const bars=wall.id.includes('-front-panel-'),node=box(wall.id,wall.x,wall.y,wall.z,wall.width,wall.height,wall.depth,bars?invisible:wall.color,true);
  if(bars){node.name='COLLIDER_PRISON_'+wall.id;node.userData.collider=true;for(let i=0;i<8;i++)box('CELL_FRONT_BAR',wall.x-wall.width/2+.16+i*(wall.width-.32)/7,1.95,wall.z,.065,3.9,.075,'#a0b5bc');for(const y of [.22,1.1,3.7])box('CELL_BAR_RAIL',wall.x,y,wall.z,wall.width,.08,.09,'#a0b5bc');}
  if(/perimeter|north-wall|south-wall|-east$|-north$|-south$/.test(wall.id)){box('WALL_BASE_TRIM',wall.x,.35,wall.z,wall.width+.02,.7,wall.depth+.025,'#455c64');box('WALL_CAP',wall.x,wall.y+wall.height/2+.06,wall.z,wall.width+.08,.12,wall.depth+.08,'#a4ad9f');}
 }
 // Cell interiors: two bunks, white bedding, writing desk and sanitary fixtures.
 for(const cell of PRISON_CELLS){const {x,z}=cell.position,side=cell.id.includes('-n')?-1:1;
  for(const y of [.65,1.95]){box('BUNK_MATTRESS',x-3.8,y,z,2.1,.17,4.25,'#bbc8bc');box('BUNK_BLANKET',x-3.8,y+.1,z+.55,2.1,.04,2.8,'#527884');box('BUNK_PILLOW',x-3.8,y+.16,z-1.45,1.7,.15,.7,'#edf0db');}
  for(const dz of [-1.9,1.9])box('BUNK_FRAME',x-3.8,1.25,z+dz,2.35,2.5,.09,'#293f4a');
  cylinder('CELL_TOILET',x+3.7,.36,z-side*4,.42,.72,'#d7ded4');box('CELL_SINK',x+3.7,.92,z-side*5,.9,.25,.65,'#d7ded4');
  box('DESK_NOTEBOOK',x+3.8,.84,z+side*3,1,.04,.7,'#ddd5af');
  const front=cell.doorPosition.z;sign(cell.name.replace('Block ','').replace(' · ',' / '),x,4.45,front,5,.72,'#f0cc83',side>0?0:Math.PI);
  // Place the authoritative closed mesh at the doorway, then translate only
  // the visible/dynamic assembly when state changes. The server actor with the
  // matching object id filters this door's collision when it is open.
  const door=new T.Group();door.name='PRISON_CELL_DOOR_'+cell.id;door.position.set(x,0,front);door.userData={builderObjectId:'prison-door-'+cell.id,prisonCellId:cell.id,prisonDoorId:cell.id};root.add(door);
  const barrier=box('CELL_DOOR_COLLIDER',0,1.5,0,2.8,3,.22,invisible,true,door);barrier.name='COLLIDER_PRISON_CELL_DOOR_'+cell.id;barrier.userData={collider:true,prisonCellId:cell.id,builderObjectId:'prison-door-'+cell.id};
  for(let i=0;i<7;i++)box('CELL_DOOR_BAR',-1.25+i*.416,1.5,0,.075,3,.1,'#b9c3bb',false,door);
  for(const y of [.12,1.2,2.88])box('CELL_DOOR_RAIL',0,y,0,2.8,.1,.12,'#b9c3bb',false,door);
  box('CELL_LOCK',.94,1.2,.11,.33,.3,.18,'#e2b866',false,door);door.userData.open=false;doors.set(cell.id,door);
 }
 // Exposed roof beams, block identifiers and direction signs retain overview visibility.
 for(const [block,z]of [['A',27],['B',-30]]){for(const x of [-96,-72,-48,-27]){box('CELLBLOCK_ROOF_RAFTER',x,5.35,z,.22,.24,45,'#334e5c');box('CELLBLOCK_LIGHT',x,5.12,z,.2,.08,12,mat('#f3e9c9',true));}sign('CELL BLOCK '+block,-22.6,4.9,z,18,2.3,'#f2c373',Math.PI/2,'12 CELLS  /  RESIDENTIAL WING');}
 for(const [x,z,w,text,color]of [[62,6,30,'CAFETERIA','#e0c894'],[62,-56,30,'RECREATION','#9fe0d4'],[-66,62,28,'INFIRMARY','#c5ebcf'],[55,63,22,'LAUNDRY','#ccd9ed'],[89,63,17,'SECURITY','#f4b79a'],[84,-100,24,'WORKSHOP','#e5cf96']]){sign(text,x,4,z,w,2,color);for(const dx of [-w/2,w/2])box('WING_LIGHT',x+dx,4.5,z,.1,.1,4,mat('#eee5c9',true));}
 sign('IRONWOOD CORRECTIONAL',0,6.6,96,47,4,'#efd29d',Math.PI,'LIVE THE DAY  /  FIND YOUR WAY');
 sign('INTAKE  /  DAILY CHALLENGES',9,4.1,80,8,1.4,'#f0d79d',0,'GUARD OR PRISONER  ·  YOUR CHOICE');
 sign('YARD  /  EXERCISE & GAMES',-10,4.5,-103,43,3,'#e4e3ba',0,'FITNESS  ·  BOXING  ·  BASKETBALL');
 for(const [z,text]of [[57,'CELLS  ←     CAFETERIA  →'],[0,'CELL BLOCKS  ←     COMMON ROOM  →'],[-60,'←  YARD     WORKSHOP  →']]){const label=sign(text,0,.075,z,21,1.6,'#e3d5af');label.rotation.x=-Math.PI/2;}
 // Cafeteria bench seating and individual trays; a staffed kitchen lies beyond.
 for(const x of [42,61,80])for(const z of [27,44]){for(const side of [-1,1]){box('DINING_BENCH',x,.58,z+side*2.6,8,.18,.9,'#657f80');for(const dx of [-2.7,2.7])box('BENCH_LEG',x+dx,.28,z+side*2.6,.1,.56,.6,'#3c545e');}for(const dx of [-2.4,0,2.4]){box('MEAL_TRAY',x+dx,1.09,z,1.6,.05,.9,'#a9b8ad');cylinder('MEAL_BOWL',x+dx-.35,1.17,z,.22,.12,'#c19357');cylinder('MEAL_CUP',x+dx+.45,1.24,z,.12,.25,'#e2e8d8');}}
 for(const x of [43,53,63,73,83]){box('SERVING_TRAY',x,1.14,12,5,.08,1.6,'#b3c5c7');cylinder('SOUP_POT',x,1.5,12,.5,.7,'#687f85');}
 sign('HOT MEALS  /  SERVING LINE',61,3.2,9,34,1.8,'#f0ddaf');
 box('KITCHEN_RANGE',94,.8,15,5,1.6,7,'#a3b4b5');for(const z of [13,16])cylinder('STOVE_RING',94,1.64,z,.7,.07,'#263f46');
 // Television with animated scan band, radio speakers and actual arcade cabinets.
 box('TV_FRAME',50,2.85,-45,14,7,.7,'#203944');const tv=box('TV_SCREEN',50,2.85,-44.6,12.8,5.9,.04,mat('#5eabb0',true));
 sign('IRONWOOD TV',50,4.1,-44.54,8.5,1.1,'#e5f4dc');sign('TONIGHT  /  THE GREAT GETAWAY',50,2.45,-44.54,11,1.1,'#d7e8d0');
 const scan=box('TV_SCAN_BAND',50,1.5,-44.5,12.7,.055,.015,mat('#9fddd5',true));animations.push(t=>{scan.position.y=.2+(Math.sin(t*.9)+1)*2.6;});
 box('RADIO_SHELF',69,1,-48,8,.14,1.5,'#b09a74');box('RADIO',69,1.7,-48,5,1.3,1.2,'#344b56');for(const dx of [-1.6,1.6])cylinder('RADIO_SPEAKER',69+dx,1.7,-47.35,.43,.08,'#172e38').rotation.x=Math.PI/2;box('RADIO_TUNER',69,1.85,-47.34,1.4,.4,.03,mat('#edc87f',true));
 for(const [i,x]of [78,84,90].entries()){box('ARCADE_SCREEN_FRAME',x,1.8,-18.94,1.8,1.3,.16,'#141f32');box('ARCADE_SCREEN',x,1.8,-18.83,1.5,.98,.025,mat(['#83daaf','#b2a1f0','#e9c477'][i],true));box('ARCADE_CONTROL_DECK',x,1.1,-18.6,2,.14,.8,'#536b83');cylinder('ARCADE_JOYSTICK',x-.4,1.32,-18.5,.06,.36,'#e9c477');sphere('JOYSTICK_TOP',x-.4,1.53,-18.5,.12,'#e58667');for(const dx of [.2,.55])cylinder('ARCADE_BUTTON',x+dx,1.21,-18.5,.11,.05,'#8be0bf');sign(['BREAKOUT','HIGH SCORE','PIXEL RALLY'][i],x,2.9,-18.84,2.2,.45,'#e5d7a8');}
 // Pool table and board games are deliberately clear of travel routes.
 box('POOL_FELT',51,.92,-13,10.4,.025,5.4,'#3f7967');for(const dx of [-4.9,4.9])for(const dz of [-2.4,2.4])cylinder('POOL_POCKET',51+dx,.94,-13+dz,.25,.04,'#1e3031');
 for(let i=0;i<7;i++)sphere('POOL_BALL',49+(i%3)*.7,1.02,-13+Math.floor(i/3)*.6,.13,['#e5cf72','#edeee0','#bd6c56'][i%3]);
 // Sports yard: striped basketball court, a low boxing apron and gym equipment.
 floor('BASKETBALL_COURT',13,-84,67,31,'#a58e6a');for(const z of [-98,-70])floor('COURT_END_LINE',13,z,64,.12,'#e9e1bb');for(const x of [-19,45])floor('COURT_SIDELINE',x,-84,.12,28,'#e9e1bb');floor('COURT_CENTRE_LINE',13,-84,.12,28,'#e9e1bb');
 const centre=new T.Mesh(new T.TorusGeometry(5,.06,5,40),mat('#e9e1bb'));centre.position.set(13,.06,-84);centre.rotation.x=-Math.PI/2;centre.userData.collisionDisabled=true;root.add(centre);
 for(const x of [-15,41]){box('BASKETBALL_POLE',x,2.4,-84,.18,4.8,.18,'#455f69');box('BASKETBALL_BACKBOARD',x,4,-84,.15,2.1,3.8,'#d5ded5');const hoop=new T.Mesh(new T.TorusGeometry(.6,.07,6,20),mat('#db8d56'));hoop.rotation.x=Math.PI/2;hoop.position.set(x+(x<0?1:-1),3.1,-84);hoop.userData.collisionDisabled=true;root.add(hoop);}
 sphere('YARD_BASKETBALL',8,.35,-86,.35,'#d88d4d');
 floor('BOXING_APRON',-66,-83,23,24,'#496f7c');for(const x of [-77,-55])for(const z of [-94,-72]){cylinder('BOXING_POST',x,1.1,z,.12,2.2,'#e1bb72');for(const y of [.7,1.2,1.7])box('BOXING_CORNER',x,y,z,.3,.28,.3,'#b2634f');}
 for(const y of [.7,1.2,1.7]){for(const z of [-94,-72])box('RING_ROPE',-66,y,z,22,.05,.05,'#d7d9bf');box('RING_ROPE',-77,y,-83,.05,.05,22,'#d7d9bf');for(const z of [-90,-76])box('RING_ENTRY_ROPE',-55,y,z,.05,.05,8,'#d7d9bf');}
 for(const x of [-91,-84]){cylinder('YARD_FITNESS_POST',x,1.5,-89,.08,3,'#4a6267');cylinder('YARD_FITNESS_POST',x,1.5,-80,.08,3,'#4a6267');box('YARD_PULLUP_BAR',x,2.9,-84.5,.08,.08,9,'#a0b5bc');}
 // Infirmary, laundry drums, maintenance entrance and guarded control consoles.
 for(const x of [-85,-72,-59,-46]){box('MEDICAL_MATTRESS',x,.78,80,2.8,.15,6.8,'#e0e8d4');box('MEDICAL_PILLOW',x,.94,77.7,2,.15,1,'#f1f0db');box('MEDICAL_BLANKET',x,.88,81,2.8,.06,4,'#74a399');}
 sign('+  MEDICAL',-66,3.4,91.65,18,1.8,'#b7ebbd',Math.PI);
 for(const x of [44,49,54,59,64]){cylinder('WASHER_DRUM',x,1.2,84.24,1.1,.07,'#344f5c').rotation.x=Math.PI/2;cylinder('WASHER_GLASS',x,1.2,84.18,.8,.08,'#7ba7ae').rotation.x=Math.PI/2;box('WASHER_CONTROLS',x,2.2,84.21,2.5,.3,.03,'#3b5a65');}
 box('LAUNDRY_SUPPLY_CRATE',55,.65,77,3.4,1.3,2.6,'#ad9873');for(const z of [76.2,77.8])box('SUPPLY_STRAP',55,.67,z,3.45,1.36,.12,'#536e72');
 for(const x of [85,89,93]){box('CCTV_FRAME',x,2.3,85.8,3.2,2,.18,'#1b3340');box('CCTV_MONITOR',x,2.3,85.67,2.8,1.6,.03,mat('#5ca994',true));}sign('CCTV  /  AUTHORIZED STAFF',89,3.8,85.65,15,1,'#bce0ce');
 box('MAINTENANCE_VENT',79,1.4,101,4.8,2.8,.4,'#344c59');for(let y=.3;y<2.8;y+=.33)box('VENT_LOUVER',79,y,100.72,4.4,.13,.05,'#9caaa2');sign('MAINTENANCE',79,3.4,101,9,1,'#e4c887');
 for(const x of [76,84,92]){box('WORKSHOP_VISE',x,1.3,-96,1,.6,1,'#4f6b70');box('WORKSHOP_TOOLBOARD',x,2.7,-100.65,5,2,.1,'#aa9877');for(const dx of [-1.5,0,1.5])box('WORKSHOP_TOOL',x+dx,2.65,-100.5,.1,1.2,.1,'#a0b5bc');}
 // Four watchtowers, wall-top security wire, floodlights and CCTV cones.
 for(const x of [-103,103])for(const z of [-103,103]){
  for(const dx of [-2.8,2.8])for(const dz of [-2.8,2.8])box('WATCHTOWER_COLUMN',x+dx,5,z+dz,.3,10,.3,'#3d535d');box('WATCHTOWER_DECK',x,9,z,7,.3,7,'#637c85');box('WATCHTOWER_CAB',x,10.5,z,6.7,2.7,6.7,'#637c85');for(const side of [-1,1]){box('TOWER_WINDOW',x+side*3.4,10.7,z,.03,1.5,5,'#9cbdba');box('TOWER_WINDOW',x,10.7,z+side*3.4,5,1.5,.03,'#9cbdba');}box('TOWER_ROOF',x,12.1,z,8,.25,8,'#2f4854');cylinder('TOWER_ANTENNA',x,13.5,z,.05,3,'#b3c1bc');
 }
 for(const z of [-108,108])for(let x=-96;x<=96;x+=12){if(z>0&&Math.abs(x)<12)continue;box('SECURITY_WIRE_POST',x,7.7,z,.07,1.4,.07,'#a3b4ad');box('SECURITY_WIRE',x,7.9,z,12,.035,.035,'#a3b4ad');box('SECURITY_WIRE',x,8.25,z,12,.035,.035,'#a3b4ad');}
 for(const x of [-108,108])for(const y of [7.9,8.25])box('SECURITY_WIRE_SIDE',x,y,0,.035,.035,216,'#a3b4ad');
 for(const [x,z]of [[-14,55],[14,55],[-14,-61],[14,-61],[-98,58],[99,58]]){cylinder('FLOODLIGHT_POLE',x,4.6,z,.09,9.2,'#3f5862');box('FLOODLIGHT_HEAD',x,9.05,z,2.8,.35,.7,mat('#e4e9c9',true));box('CCTV_BRACKET',x,6.3,z,.15,.15,1.4,'#a0b5bc');box('CCTV_CAMERA',x,6.25,z+.7,.45,.35,.9,'#d2d8c8');}
 const gate=new T.Group();gate.name='PRISON_SERVICE_GATE';gate.position.set(0,0,109);gate.userData={builderObjectId:'prison-gate-service',prisonDoorId:'service-gate',open:false};root.add(gate);
 const gateCollider=box('SERVICE_GATE_COLLIDER',0,2,0,18,4,.3,invisible,true,gate);gateCollider.name='COLLIDER_PRISON_SERVICE_GATE';gateCollider.userData={collider:true,builderObjectId:'prison-gate-service',prisonDoorId:'service-gate'};
 for(let x=-8.7;x<=8.7;x+=.65)box('SERVICE_GATE_BAR',x,2,0,.1,4,.14,'#adbcb4',false,gate);for(const y of [.15,1.4,3.85])box('SERVICE_GATE_RAIL',0,y,0,18,.14,.18,'#adbcb4',false,gate);doors.set('service-gate',gate);
 sign('SOUTH SERVICE GATE',0,5.2,108.6,19,2,'#e9c17e');floor('ESCAPE_FINISH',0,116,15,5,'#628d75');for(let i=0;i<14;i++)floor('FINISH_CHECKER',-6.5+i,114.5,1,1,i%2?'#ecdfb5':'#304c47');sign('FREEDOM  /  ESCAPE FINISH',0,2.5,119,18,1.8,'#bee7bb',Math.PI);
 // Low-detail articulated residents keep the large facility inhabited without
 // loading model assets or duplicating the game's player-avatar rigs.
 for(const npc of PRISON_NPCS){const actor=new T.Group();actor.name='PRISON_RESIDENT_'+npc.id;actor.position.set(npc.position.x,0,npc.position.z);actor.userData={prisonNpcId:npc.id,collisionDisabled:true};root.add(actor);const guard=npc.role==='guard',uniform=guard?'#304e67':'#d0874b',skin=['#bc896b','#d3ad86','#785541'][people.size%3];
  const hips=new T.Group();hips.name='PRISON_RESIDENT_HIPS';hips.position.y=.85;hips.userData.articulatedHips=true;actor.add(hips);
  box('RESIDENT_TORSO',0,.37,0,.62,.8,.35,uniform,false,hips);const head=sphere('RESIDENT_HEAD',0,1.08,0,.25,skin,hips);head.geometry=headGeometry;head.material.vertexColors=true;box('RESIDENT_HAIR',0,1.26,-.02,.46,.14,.4,guard?'#263f54':'#44392e',false,hips);
  const limbs=[];for(const side of [-1,1]){
   const leg=new T.Group();leg.name='PRISON_RESIDENT_HIP_'+(side<0?'LEFT':'RIGHT');leg.position.x=side*.17;hips.add(leg);
   const legMesh=box('RESIDENT_LEG',0,-.39,0,.25,.78,.26,guard?'#253c50':'#bd7846',false,leg),shoe=box('RESIDENT_SHOE',0,-.75,.08,.28,.2,.44,'#293835',false,leg);
   articulateLimb(T,leg,{mesh:legMesh,bend:[0,-.39,0],end:[0,-.67,0],attachments:[shoe],kind:'leg',side,forward:1,prefix:'PRISON_RESIDENT'});
   const arm=new T.Group();arm.name='PRISON_RESIDENT_SHOULDER_'+(side<0?'LEFT':'RIGHT');arm.position.set(side*.43,.725,0);hips.add(arm);
   const armMesh=box('RESIDENT_ARM',0,-.375,0,.2,.75,.24,uniform,false,arm),hand=sphere('RESIDENT_HAND',0,-.785,0,.11,skin,arm);hand.geometry=handBall;
   articulateLimb(T,arm,{mesh:armMesh,bend:[0,-.375,0],end:[0,-.75,0],attachments:[hand],kind:'arm',side,forward:1,prefix:'PRISON_RESIDENT'});limbs.push(leg,arm);
  }
  if(guard){box('GUARD_BELT',0,.08,.01,.65,.12,.37,'#172f40',false,hips);box('GUARD_BADGE',-.15,.6,.19,.13,.18,.03,'#e7c777',false,hips);box('GUARD_RADIO',.2,.55,.23,.14,.24,.1,'#182d34',false,hips);}else box('PRISONER_NUMBER',0,.55,.19,.3,.13,.02,'#ecdbb3',false,hips);
  finalizeArticulatedCharacter(actor);actor.userData.limbs=limbs;actor.userData.home=actor.position.clone();people.set(npc.id,actor);
 }
 // Activity beacons sit on the floor and carry station ids for UI/raycast use.
 for(const station of PRISON_STATIONS){if(station.kind==='cell')continue;const ring=new T.Mesh(new T.TorusGeometry(.75,.045,5,24),mat(['security','gate','vent'].includes(station.kind)?'#e5b970':'#a8d7bb',true));ring.name='PRISON_STATION_'+station.id;ring.rotation.x=-Math.PI/2;ring.position.set(station.position.x,.08,station.position.z);ring.userData={collisionDisabled:true,prisonStationId:station.id};root.add(ring);}
 let state=null;
 root.userData.setPrisonDoor=(id,open)=>{const door=doors.get(id);if(!door||door.userData.open===!!open)return false;door.userData.open=!!open;door.position.x=(id==='service-gate'?0:PRISON_CELLS.find(cell=>cell.id===id).doorPosition.x)+(open?(id==='service-gate'?19:3.1):0);door.traverse(child=>{if(child.userData.collider)child.userData.collisionDisabled=!!open;});root.updateMatrixWorld(true);return true;};
 root.userData.setPrisonState=view=>{state=view||null;let changed=false;for(const cell of PRISON_CELLS){const status=view?.cells?.[cell.id];if(status)changed=root.userData.setPrisonDoor(cell.id,status.locked===false)||changed;}if(view&&('gateOpen'in view||view.gate))changed=root.userData.setPrisonDoor('service-gate',view.gateOpen===true||view.gate?.open===true)||changed;for(const npc of Object.values(view?.npcs||{})){const actor=people.get(npc.id);if(!actor)continue;if(npc.position&&Number.isFinite(npc.position.x)&&Number.isFinite(npc.position.z))actor.position.set(npc.position.x,Number(npc.position.y)||0,npc.position.z);if(Number.isFinite(npc.rotationY))actor.rotation.y=npc.rotationY;actor.userData.state=npc.state;}root.updateMatrixWorld(true);return changed;};
 const movingStates=new Set(['patrolling','walking','chasing','fighting','pursuing','meal queue','yard time','work detail','cell check']),motionOptions={moving:false,reducedMotion:false};
 root.userData.updatePrisonEffects=(elapsed,reducedMotion=false)=>{const t=reducedMotion?0:Number(elapsed)||0;for(const animate of animations)animate(t);motionOptions.reducedMotion=reducedMotion;for(const actor of people.values()){motionOptions.moving=movingStates.has(String(actor.userData.state||'').toLowerCase());updateArticulatedCharacter(actor,t,motionOptions);}tv.material.emissiveIntensity=state?.phase==='lockdown'?.2:.55;};
 root.userData.prisonDoors=doors;root.userData.prisonNpcs=people;root.userData.prisonId=PRISON_ID;
 // Hundreds of repeating bars and bunk details share a handful of GPU draws.
 // Dynamic doors, articulated people and every physical collider retain their
 // own meshes and ids; they must never become baked into a static batch.
 const batches=new Map();for(const child of root.children){if(!child.isMesh||!child.userData.collisionDisabled||![cube,round,ball].includes(child.geometry)||child===scan)continue;const key=child.geometry.uuid+':'+child.material.uuid;const rows=batches.get(key)||[];rows.push(child);batches.set(key,rows);}
 for(const rows of batches.values()){if(rows.length<4)continue;const batch=new T.InstancedMesh(rows[0].geometry,rows[0].material,rows.length);batch.name='PRISON_STATIC_DETAILS';batch.userData.collisionDisabled=true;batch.receiveShadow=true;batch.castShadow=false;rows.forEach((child,index)=>{child.updateMatrix();batch.setMatrixAt(index,child.matrix);root.remove(child);});batch.instanceMatrix.needsUpdate=true;batch.computeBoundingSphere();root.add(batch);}
 return root;
}
