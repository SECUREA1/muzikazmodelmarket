import * as THREE from '../../vendor/three/three.module.min.js';
import {FIRING_RANGE_LANES,FIRING_RANGE_TARGETS,FIRING_RANGE_DEFAULTS,firingRangeTargetOffset} from '../firing-range.js';

const clockLabel=milliseconds=>{const seconds=Math.max(0,Math.ceil((Number(milliseconds)||0)/1000));return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;};
const text=value=>String(value??'').replace(/[\r\n\t]/g,' ').slice(0,24);

export function createFiringRangeFloorMaterial(size=64) {
 const pixels=new Uint8Array(128*128*4);
 for(let y=0;y<128;y++)for(let x=0;x<128;x++){
  const offset=(y*128+x)*4,grain=((x*73+y*151+(x*y)%37)%17)-8,joint=x<2||y<2,shade=joint?42:91+grain;
  pixels[offset]=shade;pixels[offset+1]=shade+2;pixels[offset+2]=shade+3;pixels[offset+3]=255;
 }
 const texture=new THREE.DataTexture(pixels,128,128,THREE.RGBAFormat);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(size/4,size/4);texture.needsUpdate=true;
 return new THREE.MeshStandardMaterial({color:0xb3b0a7,map:texture,roughness:.94,metalness:.05});
}

/** The authored range is also the server's geometry: all target centers and motion use the shared rules. */
export function addFiringRangeDressing(root,add,ground=()=>0,{style='live'}={}){
 const training=style==='force-training';root.userData.rangeStyle=training?'force-training':'live';
 const materials={
  steel:new THREE.MeshStandardMaterial({color:0x57666d,roughness:.34,metalness:.78}),
  dark:new THREE.MeshStandardMaterial({color:0x17262d,roughness:.86}),
  rubber:new THREE.MeshStandardMaterial({color:0x101416,roughness:.94}),
  paper:new THREE.MeshStandardMaterial({color:0xe6dfc9,roughness:.88,side:THREE.DoubleSide}),
  red:new THREE.MeshStandardMaterial({color:0xff4058,emissive:0x60121c,emissiveIntensity:.4}),
  cyan:new THREE.MeshStandardMaterial({color:0x47dce5,emissive:0x12616b,emissiveIntensity:.45}),
  amber:new THREE.MeshStandardMaterial({color:0xe6ba57,roughness:.65}),
  black:new THREE.MeshStandardMaterial({color:0x20262a,roughness:.82})
 };
 const targets=new Map(),lights=[],interactions=[];
 const impactGeometry=new THREE.CircleGeometry(.027,12),impactMaterial=new THREE.MeshBasicMaterial({color:0x16110c,side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
 let lastImpactKey='',impactMatch=null;
 root.userData.firingRange={lanes:FIRING_RANGE_LANES,targets:FIRING_RANGE_TARGETS};
 root.userData.rangeInteractions=interactions;
 const part=(geometry,material,x,y,z,name='RANGE_DETAIL',decorative=false,rotation=[0,0,0])=>{
  const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.position.set(x,ground(x,z)+y,z);mesh.rotation.set(...rotation);mesh.castShadow=mesh.receiveShadow=true;
  if(decorative)mesh.userData.collisionDisabled=true;
  root.add(mesh);return mesh;
 };
 const box=(size,material,x,y,z,name,decorative=false)=>part(new THREE.BoxGeometry(...size),material,x,y,z,name,decorative);
 const structure=(size,x,z,color,y,name)=>{const mesh=add(size,x,z,color,y);mesh.name=name;return mesh;};
 const sign=(label,x,y,z,width=2.3,{height=.56,rotation=0,color='#e6c56f'}={})=>{
  const mesh=part(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({color:0x10212a,side:THREE.DoubleSide}),x,y,z,'RANGE_SIGN',true,[0,rotation,0]);mesh.userData.label=label;
  if(typeof document==='undefined')return mesh;
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=128;const context=canvas.getContext('2d');if(!context)return mesh;
  context.fillStyle='#10212a';context.fillRect(0,0,canvas.width,canvas.height);context.strokeStyle=color;context.lineWidth=5;context.strokeRect(5,5,758,118);context.fillStyle=color;context.textAlign='center';context.textBaseline='middle';context.font='800 41px sans-serif';context.fillText(label,384,66,730);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;mesh.material.map=map;mesh.material.color.setHex(0xffffff);mesh.material.toneMapped=false;return mesh;
 };
 const interactive=(intent,label,x,z,color=materials.cyan)=>{
  const entry={id:intent,intent,label,position:{x,y:0,z},radius:2.8};interactions.push(entry);
  box([1.25,.78,.64],materials.dark,x,.39,z,'RANGE_INTERACTION_CONSOLE');
  const console=box([1.12,.08,.54],color,x,.82,z,'RANGE_INTERACTION_SCREEN',true);console.rotation.x=.14;console.userData.rangeInteraction=entry;
  sign(label.toUpperCase(),x,1.26,z+.035,2.05,{height:.34});return entry;
 };

 // Ballistic backstop, acoustic side walls and a clear rear lobby. Safety
 // baffles are above head height and never become invisible player walls.
 structure([39,4.4,.6],0,-19,0x26373b,2.2,'RANGE_BALLISTIC_BACKSTOP');
 [-19.3,19.3].forEach(x=>structure([.6,4.4,38],x,0,0x253338,2.2,'RANGE_ACOUSTIC_WALL'));
 for(let x=-18;x<=18;x+=1.2)box([.7,2.65,.2],materials.rubber,x,1.37,-18.62,'RANGE_BACKSTOP_BAFFLE',true);
 for(let z=-14;z<=10;z+=6){
  const baffle=box([38,.28,.9],materials.dark,0,3.65,z,'RANGE_OVERHEAD_SAFETY_BAFFLE',true);baffle.rotation.x=-.16;
  FIRING_RANGE_LANES.forEach(({x,index})=>{const lamp=box([1.2,.045,.12],materials.cyan.clone(),x,3.47,z+.45,'RANGE_LANE_STATUS_LIGHT',true);lamp.userData.rangeLane=index;lights.push(lamp);});
 }
 FIRING_RANGE_LANES.forEach(({x,index})=>{
  box([5.8,.015,27.6],materials.dark,x,.012,-.4,'RANGE_LANE_FLOOR',true);
  [-2.9,2.9].forEach(offset=>box([.055,.02,27.6],materials.steel,x+offset,.025,-.4,'RANGE_LANE_BOUNDARY',true));
  if(index<FIRING_RANGE_LANES.length-1)structure([.2,2.45,training?15:3.6],x+3.5,training?5:12.6,training?0x3c443c:0x33454b,1.225,'RANGE_SHOOTING_BAY_PARTITION');
  structure([4.6,.85,.9],x,12.5,0x26353c,.425,'RANGE_SHOOTING_BENCH');
  box([4.7,.065,1.03],materials.rubber,x,.883,12.5,'RANGE_PADDED_FIRING_BENCH',true);
  if(training){box([.58,.72,.3],materials.dark,x,1.2,11.55,'RANGE_CLASSIC_LANE_CONSOLE',true);box([.5,.32,.025],materials.cyan,x,1.32,11.72,'RANGE_CLASSIC_LANE_MONITOR',true);}
  sign(`LANE ${String(index+1).padStart(2,'0')}  /  27.5 M`,x,1.1,13.03,3.5,{height:.28});
  sign('PAPER  /  PRECISION',x,2.95,-13.78,3.35,{height:.28});
  sign('STEEL  /  MOVING DRILLS',x,2.95,-16.18,3.75,{height:.28,color:'#74e9f3'});
  box([5.9,.02,.19],materials.amber,x,.033,11.2,'RANGE_FIRING_LINE',true);
  // Rails make the target carrier's actual travel envelope visible.
  box([5.25,.06,.08],materials.steel,x,.06,-15.45,'RANGE_MOVING_TARGET_TRACK',true);
 });
 // Warm task lighting, acoustic panels and target carrier rails are cosmetic.
 for(const side of [-1,1])for(let z=-16;z<=12;z+=3){
  box([.08,2.3,1.8],materials.rubber,side*18.94,1.6,z,'RANGE_ACOUSTIC_PANEL',true);
  box([.11,.08,1.8],materials.amber,side*18.87,2.8,z,'RANGE_WALL_TASK_LIGHT',true);
 }
 for(const {x} of FIRING_RANGE_LANES){
  box([.1,.1,28],materials.steel,x,3.3,-.6,'RANGE_OVERHEAD_CARRIER_RAIL',true);
  for(const z of [-10,2,10])box([2.4,.035,.22],training?materials.amber:materials.cyan,x,3.42,z,'RANGE_DIFFUSED_LUMINAIRE',true);
  for(let z=-12;z<12;z+=4)box([5.7,.008,.018],materials.steel,x,.023,z,'RANGE_FLOOR_EXPANSION_JOINT',true);
 }
 // Distance labels reflect the fixed 13.8 m firing position, rather than
 // decorative labels that disagree with the live target geometry.
 for(const distance of [10,15,20,25]){
  const z=13.8-distance;box([37.8,.012,.055],distance===20?materials.amber:materials.steel,0,.034,z,'RANGE_DISTANCE_LINE',true);
  [-17.6,17.6].forEach(x=>sign(`${distance} M`,x,.18,z,1.25,{height:.32}));
 }
 sign(training?'FORCE TRAINING  /  FIVE-POINT QUALIFICATION':'LIVE RANGE  /  EYES & EARS  /  FIRE FROM YOUR BAY',0,4.08,-18.61,12.5,{height:.48});
 sign(training?'FORCE TRAINING  /  READY AREA':'SAFE ZONE  /  MULTIPLAYER LOBBY',0,2.82,18.3,8.2,{height:.48,rotation:Math.PI});

 for(const definition of FIRING_RANGE_TARGETS){
  const group=new THREE.Group();group.name=`RANGE_TARGET_${definition.id}`;group.position.set(definition.position.x,definition.position.y,definition.position.z);group.userData.collisionDisabled=true;group.userData.rangeTargetId=definition.id;group.userData.rangeLane=definition.lane;root.add(group);
  const hitMaterial=definition.kind==='paper'?materials.red.clone():new THREE.MeshStandardMaterial({color:0x587281,roughness:.77,metalness:.3});
  const mount=(geometry,material,position,zone)=>{const mesh=new THREE.Mesh(geometry,material);mesh.name=`RANGE_TARGET_${definition.id}_${zone}`;mesh.position.set(...position);mesh.castShadow=mesh.receiveShadow=true;Object.assign(mesh.userData,{rangeTarget:group,rangeTargetId:definition.id,rangeLane:definition.lane,hitZone:zone,collisionDisabled:true});group.add(mesh);return mesh;};
  if(definition.kind==='paper'){
   // Circle faces are on the exact server ray plane; rings differ by only a
   // texture-depth offset to avoid z fighting, never by target size or center.
   mount(training?new THREE.PlaneGeometry(1.55,1.55):new THREE.CircleGeometry(definition.radius,48),materials.paper,[0,0,0],'outer');
   for(const radius of [.22,.38,.56,.74])mount(new THREE.RingGeometry(radius-.006,radius,48),materials.steel,[0,0,.006],'scoring-ring');
   [[.56,materials.black],[.38,materials.paper],[.22,materials.black],[.09,hitMaterial]].forEach(([radius,material],index)=>mount(new THREE.CircleGeometry(radius,40),material,[0,0,.001*(index+1)],index===3?'bullseye':'body'));
   box([.07,1.08,.07],materials.steel,definition.position.x,2.85,definition.position.z-.07,'RANGE_PAPER_CARRIER',true);
  }else{
   mount(new THREE.SphereGeometry(.3,20,14),hitMaterial,[0,2.18,0],'bullseye');
   mount(new THREE.BoxGeometry(.9,1.25,.12),hitMaterial,[0,1.35,0],'body');
   mount(new THREE.BoxGeometry(1.45,.28,.12),hitMaterial,[0,1.72,0],'body');
   const support=new THREE.Mesh(new THREE.BoxGeometry(.07,.66,.07),materials.steel);support.position.y=.36;group.add(support);
   const base=new THREE.Mesh(new THREE.BoxGeometry(.6,.12,.4),materials.dark);base.position.y=.08;group.add(base);
  }
  targets.set(definition.id,{definition,group,hitMaterial,impacts:[],baseColor:hitMaterial.color.clone(),baseEmissive:hitMaterial.emissive.clone()});
 }

 // Equipment remains in the safe zone, leaving every firing position clear.
 box([6.5,2.1,.35],materials.dark,-12,1.05,18.1,'RANGE_ARMORY_RACK');
 [-14.1,-12.7,-11.3,-9.9].forEach((x,index)=>{
  const rifle=box([1.05,.13,.16],materials.steel,x,1.34,17.86,'RANGE_ARMORY_TRAINING_WEAPON',true);rifle.rotation.z=.12;
  box([.18,.36,.14],materials.rubber,x-.12,1.15,17.86,'RANGE_ARMORY_TRAINING_GRIP',true);
  part(new THREE.CylinderGeometry(.045,.045,.62,10),materials.steel,x+.65,1.41,17.86,'RANGE_ARMORY_TRAINING_BARREL',true,[0,0,Math.PI/2]);
  box([.3,.11,.13],index%2?materials.cyan:materials.amber,x+.1,1.5,17.86,'RANGE_ARMORY_SCOPE',true);
 });
 sign('ARMORY  /  ADJUSTABLE OPTICS',-12,2.43,17.86,6.4,{height:.4});
 interactive('range-backpack','Backpack & equipment',-16.7,16.3,materials.amber);
 interactive('range-armory','Armory & optics',-12,16.2);
 interactive('range-market','Buy & sell market',-7,16.3,materials.amber);
 interactive('range-start','Join / start round',-3,16.1);
 interactive('range-settings','Tournament rules',0,17.15,materials.amber);
 interactive('range-watch','Watch live match',7,16.1);
 // Low floor markings and overhead signs guide arrivals without adding another
 // obstacle to the continuous path behind the firing bays.
 box([36.4,.012,.065],materials.cyan,0,.043,14.65,'RANGE_SAFE_LOBBY_GUIDE',true);
 sign('GEAR  /  OPTICS  /  MARKET',-12,2.86,18.62,9.4,{height:.4,rotation:Math.PI});
 sign('JOIN  /  TOURNAMENT RULES',-.6,2.15,18.62,7.6,{height:.4,rotation:Math.PI});
 sign('ALL FIVE LANES  /  EVERY GAME MODE',0,3.05,13.05,8.6,{height:.35});
 sign('OPEN PRACTICE  /  PRECISION  /  RAPID  /  ENDURANCE  /  MOVING',0,2.57,13.05,12.3,{height:.34});
 for(const z of [16.9,18.2]){
  box([7,.12,.7],materials.steel,12,.48,z,'RANGE_SPECTATOR_BENCH');
  box([7,.65,.12],materials.dark,12,.87,z+.36,'RANGE_SPECTATOR_BACKREST');
  [-2.7,2.7].forEach(dx=>box([.16,.42,.48],materials.dark,12+dx,.21,z,'RANGE_SPECTATOR_BENCH_LEG'));
 }
 sign('SPECTATORS  /  LIVE LEADERBOARD',12,2.15,18.45,7,{height:.4});

 let display=null;
 if(typeof document!=='undefined'){
  const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=512;const context=canvas.getContext('2d');
  if(context){const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;display={canvas,context,texture};}
 }
 const screenMaterial=new THREE.MeshBasicMaterial({color:display?0xffffff:0x07151e,map:display?.texture||null,toneMapped:false});
 // Mount the live board on the second overhead baffle, in front of its beam.
 // It stays above every target sightline and remains legible from the bays.
 const screen=part(new THREE.PlaneGeometry(10.2,2.16),screenMaterial,0,3.32,4.62,'RANGE_LIVE_SCOREBOARD',true);
 box([10.5,2.43,.18],materials.dark,0,3.32,4.48,'RANGE_SCOREBOARD_FRAME',true);
 // A duplicate lobby-facing display shares the same live texture.
 const lobbyScreen=part(new THREE.PlaneGeometry(5.4,1.14),screenMaterial,5.2,2.38,18.55,'RANGE_LOBBY_LIVE_SCOREBOARD',true,[0,Math.PI,0]);
 screen.userData.liveScoreboard=true;lobbyScreen.userData.liveScoreboard=true;
 let liveState={state:'lobby',settings:{...FIRING_RANGE_DEFAULTS},round:0,participants:{},leaderboard:[],remainingMs:FIRING_RANGE_DEFAULTS.durationSeconds*1000},locationId='main',serverTime=0,lastDisplayKey='',lastDraw=-Infinity;
 const draw=(now=serverTime,force=false)=>{
  const deadline=liveState.state==='countdown'?Number(liveState.startsAt):liveState.state==='live'?Number(liveState.endsAt):0;
  const clock=liveState.state==='live'&&liveState.settings?.mode==='freeplay'?'OPEN':clockLabel(deadline?deadline-now:liveState.remainingMs??liveState.settings?.durationSeconds*1000),participants=Object.values(liveState.participants||{}),leaders=(liveState.leaderboard||[]).filter(player=>player.role!=='spectator'||player.enrolled).slice(0,4),mode=text(liveState.settings?.mode||'precision').toUpperCase(),state=text(liveState.state||'lobby').toUpperCase();
  const snapshot={state,mode,clock,round:Number(liveState.round)||0,rounds:Number(liveState.settings?.rounds)||1,players:participants.filter(player=>player.role==='player'&&player.online!==false).length,spectators:participants.filter(player=>player.role==='spectator'&&player.online!==false).length,leaders:leaders.map((entry,index)=>({rank:Number(entry.rank)||index+1,name:text(entry.name||'Player'),score:Number(entry.score)||0,accuracy:Number(entry.accuracy)||0})),locationId};
  root.userData.rangeDisplay=snapshot;
  const key=JSON.stringify(snapshot),pulse=now-(Number(liveState.lastShot?.at)||-10000)<450;
  if(!force&&key===lastDisplayKey&&(!pulse||now-lastDraw<90))return;lastDisplayKey=key;lastDraw=now;
  if(!display)return;
  const {context:ctx,canvas,texture}=display,w=canvas.width,h=canvas.height;
  ctx.fillStyle='#07151e';ctx.fillRect(0,0,w,h);ctx.fillStyle='#102b35';ctx.fillRect(0,0,w,83);
  ctx.strokeStyle=pulse?'#f1d56e':'#41dbe9';ctx.lineWidth=7;ctx.strokeRect(7,7,w-14,h-14);
  ctx.fillStyle='#74e9f3';ctx.font='800 37px monospace';ctx.textAlign='left';ctx.fillText(training?'MUZIKAZ  //  FORCE TRAINING':'MUZIKAZ  //  LIVE RANGE',32,56);
  ctx.font='700 28px monospace';ctx.textAlign='right';ctx.fillStyle=state==='LIVE'?'#b7f26e':'#ecc76b';ctx.fillText(`${state}  ·  ${mode}`,w-32,54);
  ctx.textAlign='left';ctx.fillStyle='#f2fbff';ctx.font='900 108px monospace';ctx.fillText(clock,32,205);
  ctx.font='700 29px monospace';ctx.fillStyle='#8daebf';ctx.fillText(`ROUND ${snapshot.round || '—'} / ${snapshot.rounds}`,37,256);
  ctx.font='700 25px monospace';ctx.fillText(`${snapshot.players} PLAYERS   ${snapshot.spectators} WATCHING`,37,307);
  ctx.fillStyle='#102b35';ctx.fillRect(580,102,916,330);
  ctx.fillStyle='#76e8f2';ctx.font='700 25px monospace';ctx.fillText('LIVE LEADERBOARD',608,140);
  if(!snapshot.leaders.length){ctx.fillStyle='#c1d6df';ctx.font='700 28px monospace';ctx.fillText('JOIN A LANE TO COMPETE',608,218);ctx.font='600 22px monospace';ctx.fillText('ARMORY · RULES · START IN THE LOBBY',608,268);}
  snapshot.leaders.forEach((entry,index)=>{const y=194+index*65;ctx.fillStyle=index===0?'#f3d578':'#e7f5fb';ctx.font='700 29px monospace';ctx.textAlign='left';ctx.fillText(`${entry.rank}. ${entry.name}`,608,y,610);ctx.textAlign='right';ctx.fillText(String(entry.score).padStart(4,'0'),w-50,y);ctx.font='600 18px monospace';ctx.fillStyle='#92b5c4';ctx.fillText(`${entry.accuracy}% ACC`,w-50,y+23);});
  ctx.textAlign='left';ctx.fillStyle='#e6c56f';ctx.font='700 24px monospace';ctx.fillText('100 BULLSEYE  /  JOIN A ROUND · CLIMB THE LEADERBOARD',35,470);
  texture.needsUpdate=true;
 };
 root.userData.setFiringRangeState=(state={},options={})=>{
  liveState=state.firingRange||state;if(impactMatch!==liveState.matchId){impactMatch=liveState.matchId;lastImpactKey='';for(const target of targets.values()){for(const mark of target.impacts)mark.visible=false;target.nextImpact=0;}}locationId=String(options.locationId||locationId);serverTime=Number(options.serverTime??liveState.serverTime)||serverTime;draw(serverTime,true);root.userData.updateFiringRangeEffects(serverTime);
 };
 root.userData.updateFiringRangeEffects=(now=serverTime)=>{
  serverTime=Number(now)||serverTime;
  for(const {definition,group,hitMaterial,baseColor,baseEmissive} of targets.values()){
   const position=firingRangeTargetOffset(definition,serverTime,liveState.settings||FIRING_RANGE_DEFAULTS);group.position.set(position.x,position.y,position.z);
   const shot=liveState.lastShot,age=serverTime-Number(shot?.at),hit=shot?.targetId===definition.id&&(!shot.locationId||shot.locationId===locationId)&&age>=0&&age<400;
   hitMaterial.color.copy(baseColor);hitMaterial.emissive.copy(baseEmissive);
   if(hit){hitMaterial.color.setHex(0xffde78);hitMaterial.emissive.setHex(0xa05a0b);}hitMaterial.emissiveIntensity=hit?1.1:.35;
   group.userData.lastHit=hit;
  }
  const shot=liveState.lastShot,key=shot?`${shot.playerId}:${shot.at}`:'';
  if(key&&key!==lastImpactKey&&shot.impact&&(!shot.locationId||shot.locationId===locationId)){
   lastImpactKey=key;const target=targets.get(shot.targetId);
   if(target){let mark;if(target.impacts.length<24){mark=new THREE.Mesh(impactGeometry,impactMaterial);mark.name='RANGE_SHOT_IMPACT';mark.userData.collisionDisabled=true;target.group.add(mark);target.impacts.push(mark);}else mark=target.impacts[(target.nextImpact||0)%24];target.nextImpact=(target.nextImpact||0)+1;mark.visible=true;mark.position.set(shot.impact.x,shot.impact.y,target.definition.kind==='paper'?.014:.075);}
  }
  const live=liveState.state==='live',countdown=liveState.state==='countdown';
  for(const lamp of lights){lamp.material.color.setHex(live?0xff5264:countdown?0xf1c668:0x47dce5);lamp.material.emissive.setHex(live?0x65131d:countdown?0x78510c:0x12616b);}
  draw(serverTime);
 };
 draw(0,true);return root;
}
