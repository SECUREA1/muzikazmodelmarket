import {addHockeyFacilities,createHockeyFacility} from './hockey-facilities.js';
import * as THREE from '../vendor/three/three.module.min.js';
import {RINK} from './hockey-rules.js';
import {mergeGeometries} from '../vendor/three/addons/utils/BufferGeometryUtils.js';
const mat=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.5,...extra});
function box(root,size,pos,color){const m=new THREE.Mesh(new THREE.BoxGeometry(...size),mat(color));m.position.set(...pos);root.add(m);return m;}
function pipe(root,a,b,r,color){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start),mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,delta.length(),12),mat(color));mesh.position.copy(start).add(end).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());root.add(mesh);return mesh;}
const hockeyEquipment=[
 ['hockey-stick','Hockey Stick',[.035,1.368,.723]],['hockey-skates','Ice Skates',[.43,.255,.35]],['hockey-puck','Hockey Puck',[.0762,.0254,.0762]],['hockey-net','Regulation Hockey Net',[1.043,1.24,1.879]],['hockey-player','AI Hockey Skater',[.94,1.83,.723]],['hockey-goalie','AI Goaltender',[.94,1.83,.723]],['hockey-referee','AI Referee',[.92,1.83,.455]],['hockey-linesman','AI Linesman',[.92,1.83,.455]]
];
const hockeyArchitecture=[
 ['hockey-arena','Complete Hockey Stadium',[96,19,77],'Regulation rink, goals, glass, benches, penalty boxes, seating, fans, concourses, scoreboard and arena lighting.'],
 ['hockey-rink','Complete Regulation Hockey Rink',[61.081,2.27,26.029],'Regulation 200 × 85 ft rounded ice with markings, boards, safety glass and two goals.'],
 ['hockey-ice-surface','Regulation Ice Surface',[60.96,.01,25.908],'Rounded regulation ice floor, ready for custom boards and rink markings.'],
 ['hockey-rink-markings','Complete Hockey Rink Markings',[54.375,.018,24.908],'Red and blue lines, all faceoff circles and dots, and both goal creases.'],
 ['hockey-rink-boards','Complete Rounded Rink Boards',[61.081,1.07,26.029],'Full regulation rounded rink perimeter without glass.'],
 ['hockey-rink-glass','Complete Rink Safety Glass',[60.985,1.2,25.933],'Transparent safety glass perimeter matching the regulation rink boards.'],
 ['hockey-board-section','Hockey Board Section',[2,1.07,.12],'Two-metre board section for custom ice boundaries.'],
 ['hockey-glass-panel','Hockey Safety Glass Panel',[2,1.2,.025],'Transparent two-metre safety glass section to position above rink boards.'],
 ['hockey-faceoff-circle','Hockey Faceoff Circle',[9.144,.002,9.144],'Regulation faceoff circle and centre dot.'],
 ['hockey-center-circle','Hockey Center-Ice Circle',[9.144,.002,9.144],'Regulation blue centre-ice faceoff circle and dot.'],
 ['hockey-faceoff-dot','Hockey Faceoff Dot',[.6096,.001,.6096],'Regulation red faceoff spot for custom rink layouts.'],
 ['hockey-blue-line','Hockey Blue Line',[.3,.012,24.908],'Regulation blue zone line for custom rink layouts.'],
 ['hockey-red-line','Hockey Red Line',[.12,.012,24.908],'Red centre or goal line for custom rink layouts.'],
 ['hockey-guard-rail','Arena Tier Guard Rail',[68,1,.07],'Full-width guard rail matching the spectator tiers.'],
 ['hockey-goal-crease','Hockey Goal Crease',[1.8288,.011,3.6576],'Regulation blue half-circle crease with a red perimeter.'],
 ['hockey-home-bench','Home Team Bench',[13.08,2.6,2.47],'Home bench with reserves, gate, glass partitions, spare sticks and bottles.'],
 ['hockey-away-bench','Away Team Bench',[13.08,2.6,2.47],'Away bench with reserves, gate, glass partitions, spare sticks and bottles.'],
 ['hockey-home-penalty-box','Home Penalty Box',[4.07,2.555,2.57],'Home penalty seating with transparent partitions and an ice gate.'],
 ['hockey-away-penalty-box','Away Penalty Box',[4.07,2.555,2.57],'Away penalty seating with transparent partitions and an ice gate.'],
 ['hockey-scorers-table','Official Scorer’s Table',[4,2.28,1.65],'Scorer’s desk and official scorekeeper sign.'],
 ['hockey-locker-tunnel','Player Locker Room Tunnel',[3,3.4,7.1],'Player access tunnel and locker-room sign.'],
 ['hockey-seating-section','Lower Bowl Seating Section',[68,5.4,7.185],'Six-row lower spectator stand with seats, aisle gaps and a guard rail.'],
 ['hockey-upper-seating-section','Upper Bowl Seating Section',[68,5.7,6.335],'Five-row upper spectator stand with seats, aisle gaps and a guard rail.'],
 ['hockey-end-seating-section','End Bowl Seating Section',[6.95,4.615,31],'Six-row end stand for a complete seating bowl.'],
 ['hockey-seat','Arena Spectator Seat',[.46,.625,.475],'Individual matching arena seat for custom spectator layouts.'],
 ['hockey-concourse','Arena Concourse Platform',[90,.35,3],'Upper-level walkway platform around stadium seating.'],
 ['hockey-entry-tunnel','Spectator Entry Tunnel',[3,3.58,4.1],'Spectator access tunnel with an entrance sign.'],
 ['hockey-scoreboard','Center-Ice Scoreboard',[6,2,3.52],'Suspended centre-ice jumbotron matching the live hockey arena.'],
 ['hockey-light-bank','Arena Light Bank',[8,.335,1],'Emissive arena light bank and its supporting truss.'],
 ['hockey-roof-truss','Arena Roof Truss',[3.4,.4175,68],'Full-width overhead truss with five emissive lighting strips.'],
 ['hockey-arena-wall','Arena Enclosure Wall',[94,19,.6],'Full-width stadium enclosure wall.'],
 ['hockey-arena-floor','Arena Foundation Floor',[96,.2,77],'Metal stadium foundation for a full hockey arena.'],
 ['hockey-led-ribbon','Arena LED Ribbon',[90,.38,.06],'Emissive arena ribbon panel.'],
 ['hockey-water-bottle','Hockey Bench Water Bottle',[.08,.22,.08],'Matching water bottle for player benches.'],
 ['hockey-crowd-section','Arena Spectator Crowd',[59.49,4.225,6.02],'Instanced lower-bowl spectator crowd with team-colour jerseys.']
];
export const HOCKEY_ITEMS=[
 ...hockeyEquipment.map(([id,name,dimensions])=>({id,name,dimensions,type:'interactive',behavior:'hockey',animation:/hockey-(player|goalie|referee|linesman)$/.test(id)?'skate':'none',description:'Hockey equipment and match role; active in hockey arenas.'})),
 ...hockeyArchitecture.map(([id,name,dimensions,description])=>({id,name,dimensions,description,type:['hockey-seat','hockey-water-bottle','hockey-scorers-table'].includes(id)?'interior':'landscape',behavior:'decor',animation:'none'}))
].map(item=>({...item,category:'hockey',size:85,image:'public/images/hockey.svg',procedural:true,buildAssetId:item.id,basic:true,priceMzk:0,assetKind:'premade',scale:item.dimensions.map(value=>Number(value.toFixed(3))).join(' × ')+' m'}));
export function createHockeyItem(id,color='#237ad4'){
 const structure=createHockeyStructure(id)||createHockeyFacility(id);if(structure){structure.userData.hockeyComponent=id;structure.userData.dimensions=HOCKEY_ITEMS.find(item=>item.id===id)?.dimensions;return structure;}
 const g=new THREE.Group();g.name=id;g.userData.hockeyRole=id;
 if(id==='hockey-puck'){const m=new THREE.Mesh(new THREE.CylinderGeometry(.0381,.0381,.0254,20),mat('#141822'));m.position.y=.03;g.add(m);}
 else if(id==='hockey-stick'){box(g,[.035,1.4,.035],[0,.78,0],'#292c35');box(g,[.035,.06,.32],[0,.09,.14],'#292c35');g.rotation.x=-.3;}
 else if(id==='hockey-skates'){for(const x of [-.14,.14]){box(g,[.15,.19,.33],[x,.16,0],'#1b2530');box(g,[.025,.05,.35],[x,.025,0],'#a5c6d9');}}
 else if(id==='hockey-net'){
  const w=RINK.goalWidth,h=RINK.goalHeight,depth=1;
  for(const z of [-w/2,w/2]){pipe(g,[0,.025,z],[0,h,z],.025,'#e54351');pipe(g,[0,h,z],[depth,h*.72,z*.84],.018,'#e54351');pipe(g,[0,.025,z],[depth,.025,z*.84],.018,'#e54351');pipe(g,[depth,.025,z*.84],[depth,h*.72,z*.84],.018,'#e54351');}pipe(g,[0,h,-w/2],[0,h,w/2],.025,'#e54351');pipe(g,[depth,h*.72,-w*.42],[depth,h*.72,w*.42],.018,'#e54351');
  const grid=[];const line=(a,b)=>grid.push(...a,...b);const divisions=26,rows=18;
  for(let i=0;i<=divisions;i++){const z=-w/2+w*i/divisions;line([depth,.025,z*.84],[depth,h*.72,z*.84]);line([0,h,z],[depth,h*.72,z*.84]);}
  for(let i=0;i<=rows;i++){const y=.025+(h*.72-.025)*i/rows;line([depth,y,-w*.42],[depth,y,w*.42]);for(const sign of [-1,1])line([0,y/(h*.72)*h,sign*w/2],[depth,y,sign*w*.42]);}
  for(const sign of [-1,1])for(let i=0;i<=12;i++){const t=i/12;line([depth*t,.025,sign*w/2*(1-.16*t)],[depth*t,h*(1-.28*t),sign*w/2*(1-.16*t)]);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(grid,3));const mesh=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:'#f7fcff',transparent:true,opacity:.74}));mesh.name='WOVEN_GOAL_NET';g.add(mesh);
 }else if(['hockey-player','hockey-goalie','hockey-referee','hockey-linesman'].includes(id)){
  const ref=id==='hockey-referee'||id==='hockey-linesman',goalie=id==='hockey-goalie';const torso=box(g,[.55,.68,.32],[0,1.1,0],ref?'#fafafa':color);torso.name='HOCKEY_TORSO';if(!ref){for(const y of [.87,.96])box(g,[.565,.045,.335],[0,y,0],'#eaf5ff');const crest=box(g,[.2,.22,.014],[0,1.2,.168],'#eaf5ff');crest.rotation.z=Math.PI/4;}const head=new THREE.Mesh(new THREE.SphereGeometry(.21,14,10),mat('#1d2938'));head.name='HOCKEY_HELMET';head.position.set(0,1.65,0);g.add(head);const visor=box(g,[.32,.12,.04],[0,1.63,.19],'#badcec');visor.material.transparent=true;visor.material.opacity=.5;for(const x of [-.1,.1])pipe(g,[x,1.51,.19],[x,1.66,.22],.009,'#91aebf');
  const legs=[];for(const x of [-.16,.16]){const leg=new THREE.Group();leg.name=x<0?'HOCKEY_LEG_LEFT':'HOCKEY_LEG_RIGHT';leg.position.set(x,.78,0);box(leg,[goalie?.25:.17,.58,.2],[0,-.28,0],goalie?'#f5f1de':'#243143');box(leg,[.18,.16,.36],[0,-.63,.05],'#172431');box(leg,[.025,.04,.4],[0,-.73,.05],'#a2c8dc');g.add(leg);legs.push(leg);}
  for(const x of [-.37,.37]){const arm=box(g,[.17,.55,.2],[x,1.02,0],ref?'#151c28':color);if(!ref){box(g,[.2,.16,.23],[x,.73,.04],'#172431');box(g,[.18,.055,.21],[x,.9,0],'#eaf5ff');}arm.name=x<0?'HOCKEY_ARM_LEFT':'HOCKEY_ARM_RIGHT';}
  if(id==='hockey-referee')for(const x of [-.37,.37])box(g,[.18,.1,.21],[x,1.13,0],'#ee842e');
  if(ref)for(let x=-.22;x<=.23;x+=.11)box(g,[.045,.67,.015],[x,1.1,.17],'#151c28');else{const stick=createHockeyItem('hockey-stick');stick.position.set(.43,0,.18);stick.name='HOCKEY_STICK';g.add(stick);}

 }else return null;return g;
}
export function animateHockeyPose(g,animation,time,signal='play'){
 for(const [i,name]of ['HOCKEY_ARM_LEFT','HOCKEY_ARM_RIGHT'].entries()){const arm=g.getObjectByName(name);if(arm)arm.rotation.z=signal!=='play'?(i?1:-1)*(signal==='goal'?Math.PI/2:Math.PI):0;}
 const stride=animation==='skate'?Math.sin(time*12)*.42:0;
 for(const [i,name]of ['HOCKEY_LEG_LEFT','HOCKEY_LEG_RIGHT'].entries()){const leg=g.getObjectByName(name);if(leg)leg.rotation.x=stride*(i?-1:1);}
 const stick=g.getObjectByName('HOCKEY_STICK');if(stick)stick.rotation.z=['shoot','pass','check'].includes(animation)?-.8:0;
}
export function animateHockeyPlayer(g,p,time){animateHockeyPose(g,p.animation,time,p.signal||'play');g.position.set(p.x,0,p.z);g.rotation.y=p.yaw||0;g.rotation.z=p.animation==='save'?.35:0;}
function rinkShape(){
 const hx=RINK.length/2,hz=RINK.width/2,r=RINK.corner,shape=new THREE.Shape();shape.moveTo(-hx+r,-hz);shape.lineTo(hx-r,-hz);shape.absarc(hx-r,-hz+r,r,-Math.PI/2,0,false);shape.lineTo(hx,hz-r);shape.absarc(hx-r,hz-r,r,0,Math.PI/2,false);shape.lineTo(-hx+r,hz);shape.absarc(-hx+r,hz-r,r,Math.PI/2,Math.PI,false);shape.lineTo(-hx,-hz+r);shape.absarc(-hx+r,-hz+r,r,Math.PI,Math.PI*1.5,false);return shape;
}
function ring(root,x,z,r,color){const m=new THREE.Mesh(new THREE.RingGeometry(r-.04,r,64),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide}));m.rotation.x=-Math.PI/2;m.position.set(x,.031,z);root.add(m);}
function dot(root,x,z,r,color){const m=new THREE.Mesh(new THREE.CircleGeometry(r,32),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide}));m.rotation.x=-Math.PI/2;m.position.set(x,.033,z);root.add(m);}
function addGoalCrease(root,sign=1,x=0){
 const start=sign>0?Math.PI/2:-Math.PI/2,crease=new THREE.Mesh(new THREE.CircleGeometry(1.8288,40,start,Math.PI),new THREE.MeshBasicMaterial({color:'#9dd7ed',side:THREE.DoubleSide}));crease.name='HOCKEY_GOAL_CREASE';crease.rotation.x=-Math.PI/2;crease.position.set(x,.023,0);root.add(crease);
 const arc=new THREE.Mesh(new THREE.RingGeometry(1.79,1.8288,40,1,start,Math.PI),new THREE.MeshBasicMaterial({color:'#e04b63',side:THREE.DoubleSide}));arc.name='HOCKEY_CREASE_ARC';arc.rotation.x=-Math.PI/2;arc.position.set(x,.034,0);root.add(arc);
}
function addHockeyRink(root,{ice=true,boards=true,glass=true,markings=true,goals=true}={}){
 const shape=rinkShape();
 if(ice){const surface=new THREE.Mesh(new THREE.ShapeGeometry(shape,48),mat('#e3f6ff',{roughness:.18,metalness:.1}));surface.name='REGULATION_ICE_SURFACE';surface.userData.sportsSurface='ice';surface.userData.sportsSurfaceRepeat=[1,1];surface.rotation.x=-Math.PI/2;surface.position.y=.005;root.add(surface);}
 if(boards||glass){const points=shape.getPoints(24);for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],len=a.distanceTo(b),pos=[(a.x+b.x)/2,.535,-(a.y+b.y)/2],rotation=Math.atan2(a.y-b.y,b.x-a.x);
  if(boards){const board=box(root,[len+.015,1.07,.12],pos,'#f2f7fa');board.name='HOCKEY_RINK_BOARD';board.rotation.y=rotation;}
  if(glass){const panel=box(root,[len,1.2,.025],[pos[0],1.67,pos[2]],'#92cddd');panel.name='HOCKEY_RINK_GLASS';panel.rotation.y=rotation;panel.material.transparent=true;panel.material.opacity=.2;}
 }}
 if(markings){
  for(const x of [-RINK.goalX,-RINK.blue,0,RINK.blue,RINK.goalX]){const line=box(root,[Math.abs(x)===RINK.blue?.3:.12,.012,RINK.width-1],[x,.022,0],Math.abs(x)===RINK.blue?'#2477d8':'#e04b63');line.name='HOCKEY_RINK_LINE';}
  ring(root,0,0,4.572,'#2477d8');dot(root,0,0,.1524,'#2477d8');for(const x of [-21.0312,21.0312])for(const z of [-6.7056,6.7056]){ring(root,x,z,4.572,'#e04b63');dot(root,x,z,.3048,'#e04b63');}for(const x of [-6.096,6.096])for(const z of [-6.7056,6.7056])dot(root,x,z,.3048,'#e04b63');
  for(const sign of [-1,1])addGoalCrease(root,sign,sign*RINK.goalX);
 }
 if(goals)for(const sign of [-1,1]){const net=createHockeyItem('hockey-net');net.position.set(sign*RINK.goalX,0,0);if(sign<0)net.rotation.y=Math.PI;root.add(net);}
}
function createHockeyStructure(id){
 if(id==='hockey-arena')return createHockeyArena();
 const root=new THREE.Group();root.name=id;
 if(['hockey-rink','hockey-ice-surface','hockey-rink-markings','hockey-rink-boards','hockey-rink-glass'].includes(id)){
  const all=id==='hockey-rink';addHockeyRink(root,{ice:all||id==='hockey-ice-surface',boards:all||id==='hockey-rink-boards',glass:all||id==='hockey-rink-glass',markings:all||id==='hockey-rink-markings',goals:all});root.userData.preservePlacementOrigin=true;
 }else if(id==='hockey-board-section'){const board=box(root,[2,1.07,.12],[0,.535,0],'#f2f7fa');board.name='HOCKEY_RINK_BOARD';}
 else if(id==='hockey-glass-panel'){const panel=box(root,[2,1.2,.025],[0,.6,0],'#92cddd');panel.name='HOCKEY_RINK_GLASS';panel.material.transparent=true;panel.material.opacity=.2;}
 else if(id==='hockey-faceoff-circle'||id==='hockey-center-circle'){const center=id==='hockey-center-circle';ring(root,0,0,4.572,center?'#2477d8':'#e04b63');dot(root,0,0,center?.1524:.3048,center?'#2477d8':'#e04b63');root.userData.preservePlacementOrigin=true;}
 else if(id==='hockey-faceoff-dot'){dot(root,0,0,.3048,'#e04b63');root.userData.preservePlacementOrigin=true;}
 else if(id==='hockey-blue-line'||id==='hockey-red-line'){const blue=id==='hockey-blue-line';box(root,[blue?.3:.12,.012,RINK.width-1],[0,.022,0],blue?'#2477d8':'#e04b63');root.userData.preservePlacementOrigin=true;}
 else if(id==='hockey-guard-rail'){box(root,[68,1,.07],[0,.5,0],'#6e859b');}
 else if(id==='hockey-goal-crease'){addGoalCrease(root);root.userData.preservePlacementOrigin=true;}
 else if(id==='hockey-roof-truss'){addRoofTruss(root,0,.39);}
 else if(id==='hockey-arena-wall'){addArenaWall(root,94,19,.6,[0,9.5,0]);}
 else if(id==='hockey-arena-floor'){addArenaFloor(root);root.userData.preservePlacementOrigin=true;}
 else if(id==='hockey-led-ribbon'){addArenaRibbon(root,[0,.19,0]);}
 else if(id==='hockey-crowd-section'){addArenaCrowd(root,[1]);centerOnGround(root);}
 else return null;
 return root;
}
export function createHockeyArena(){
 const root=new THREE.Group();root.name='HOCKEY_ARENA';root.userData.cleanSportsWorld=true;root.userData.preservePlacementOrigin=true;addHockeyRink(root);addHockeyFacilities(root);addHockeyAtmosphere(root);return root;
}

/** A camera-mounted stick and gloves keep the on-ice view tangible without obscuring play. */
export function createHockeyViewRig(color='#237ad4'){
 const root=new THREE.Group();root.name='HOCKEY_FIRST_PERSON_EQUIPMENT';
 for(const [x,y,z]of [[.23,-.29,-.49],[.45,-.47,-.7]]){box(root,[.13,.16,.2],[x,y,z],'#172431');const sleeve=box(root,[.12,.18,.14],[x+.05,y+.1,z+.07],color);sleeve.rotation.z=-.35;}
 pipe(root,[.24,-.27,-.5],[.66,-.9,-1.32],.018,'#2b3441');const blade=box(root,[.05,.07,.36],[.65,-.89,-1.46],'#25303d');blade.rotation.y=-.3;
 for(const z of [-1.5,-1.44,-1.38])box(root,[.055,.075,.035],[.65,-.89,z],'#e8f3fa');
 root.traverse(part=>{if(part.isMesh){part.material.depthTest=false;part.material.depthWrite=false;part.renderOrder=12;}});return root;
}
export function animateHockeyViewRig(root,player,time){const moving=Math.min(1,Math.hypot(player?.vx||0,player?.vz||0)/7);root.position.y=-.08+Math.sin(time*9)*.005*moving;root.rotation.z=['shoot','pass'].includes(player?.animation)?-.2:Math.sin(time*4)*.007*moving;}
function addArenaFloor(root){const floor=box(root,[96,.2,77],[0,-.16,0],'#0f2436');floor.name='HOCKEY_ARENA_FOUNDATION';floor.userData.sportsSurface='metal';return floor;}
function addArenaWall(root,w,h,d,position){const wall=box(root,[w,h,d],position,'#101d2e');wall.name='HOCKEY_ARENA_WALL';return wall;}
function addArenaRibbon(root,position){const ribbon=box(root,[90,.38,.06],position,'#137fa8');ribbon.name='HOCKEY_ARENA_LED_RIBBON';ribbon.material.emissive.set('#187f9e');ribbon.material.emissiveIntensity=.65;return ribbon;}
function addRoofTruss(root,x,y=17.4){const truss=pipe(root,[x,y,-34],[x,y,34],.09,'#526779');truss.name='HOCKEY_ROOF_TRUSS';for(const z of [-24,-12,0,12,24]){const bank=box(root,[3.4,.055,.24],[x,y-.3,z],'#edfaff');bank.name='HOCKEY_ROOF_LIGHT_STRIP';bank.material.emissive.set('#b9e8ff');bank.material.emissiveIntensity=1.8;}}
function addArenaCrowd(root,sides=[-1,1]){
 // Crowd uses two instanced draw calls, preserving performance on integrated GPUs.
 const seats=[];for(const side of sides)for(let row=0;row<6;row++)for(let seat=0;seat<90;seat++){if((seat+row)%4===0||seat%24<2)continue;seats.push({x:-30+seat*.68,y:1.35+row*.7,z:side*(18+row*1.15),rotation:side<0?0:Math.PI});}
 const torsos=new THREE.InstancedMesh(new THREE.BoxGeometry(.33,.47,.27),mat('#237ad4'),seats.length),heads=new THREE.InstancedMesh(new THREE.SphereGeometry(.13,8,6),mat('#baa894'),seats.length),dummy=new THREE.Object3D(),colors=['#2b85b4','#d34b68','#7597ae','#d4dfeb','#58577d'];torsos.name='INSTANCED_ARENA_FANS';heads.name='INSTANCED_ARENA_FAN_HEADS';
 seats.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.y=p.rotation;dummy.updateMatrix();torsos.setMatrixAt(i,dummy.matrix);torsos.setColorAt(i,new THREE.Color(colors[(i*7)%colors.length]));dummy.position.y+=.36;dummy.updateMatrix();heads.setMatrixAt(i,dummy.matrix);});root.add(torsos,heads);root.userData.spectatorFanCount=seats.length;
}
function centerOnGround(root){const content=new THREE.Group();while(root.children.length)content.add(root.children[0]);root.add(content);const bounds=new THREE.Box3().setFromObject(content),center=bounds.getCenter(new THREE.Vector3());content.position.sub(new THREE.Vector3(center.x,bounds.min.y,center.z));return root;}
function addHockeyAtmosphere(root){
 const shell=new THREE.Group();shell.name='ENCLOSED_ARENA_ENVIRONMENT';addArenaFloor(shell);
 for(const side of [-1,1]){addArenaWall(shell,94,19,.6,[0,9,side*38]);addArenaWall(shell,.6,19,76,[side*47,9,0]);addArenaRibbon(shell,[0,11.9,side*34.8]);}
 // Open roof cutaway keeps the broadcast and seating cameras unobstructed.
 for(let x=-40;x<=40;x+=10)addRoofTruss(shell,x);
 addArenaCrowd(shell);root.userData.spectatorFanCount=shell.userData.spectatorFanCount;root.add(shell);
}

/** Runtime-only batches retain the authored nodes for builder metadata and named rig controls. */
function batchHockeyMeshes(root,skater){
 if(root.userData.hockeyBatching)return {...root.userData.hockeyBatching};
 root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),groups=new Map();let sourceMeshes=0;
 root.traverse(node=>{
  const material=node.material;
  if(!node.isMesh||node.isInstancedMesh||!node.visible||Array.isArray(material)||!material||material.transparent||material.map||material.depthTest===false||node.userData.sportsSurface)return;
  for(let parent=node;parent&&parent!==root;parent=parent.parent)if(parent.name==='CENTER_ICE_JUMBOTRON'||skater&&/^HOCKEY_(ARM|LEG|STICK)/.test(parent.name))return;
  if(!node.geometry?.getAttribute('position')||node.geometry.morphAttributes?.position?.length)return;
  const signature=[material.type,material.color?.getHex(),material.emissive?.getHex(),material.emissiveIntensity,material.roughness,material.metalness,material.side,material.wireframe,material.opacity,Object.keys(node.geometry.attributes).sort().join(',')].join(':');
  if(!groups.has(signature))groups.set(signature,[]);groups.get(signature).push(node);
 });
 let batches=0;for(const nodes of groups.values()){
  if(nodes.length<2)continue;
  const copies=nodes.map(node=>node.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,node.matrixWorld))),geometry=mergeGeometries(copies,false);copies.forEach(copy=>copy.dispose());if(!geometry)continue;
  const mesh=new THREE.Mesh(geometry,nodes[0].material);mesh.name=skater?'HOCKEY_SKATER_STATIC_BATCH':'HOCKEY_ARENA_STATIC_BATCH';mesh.userData.hockeyRuntimeBatch=true;root.add(mesh);
  for(const node of nodes){node.visible=false;node.userData.hockeyBatchedSource=true;}sourceMeshes+=nodes.length;batches++;
 }
 root.userData.hockeyBatching={sourceMeshes,batches,savedDrawCalls:sourceMeshes-batches};return {...root.userData.hockeyBatching};
}
export const batchHockeyArena=root=>batchHockeyMeshes(root,false);
export const batchHockeySkater=root=>batchHockeyMeshes(root,true);
