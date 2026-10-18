import * as THREE from '../../vendor/three/three.module.min.js';
import {FIRING_RANGE_LANES,FIRING_RANGE_TARGETS,FIRING_RANGE_DEFAULTS,firingRangeTargetOffset} from '../firing-range.js';

const clockLabel=milliseconds=>{const seconds=Math.max(0,Math.ceil((Number(milliseconds)||0)/1000));return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;};
const text=value=>String(value??'').replace(/[\r\n\t]/g,' ').slice(0,24);

/** The authored range is also the server's geometry: all target centers and motion use the shared rules. */
export function addFiringRangeDressing(root,add,ground=()=>0){
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
  if(index<FIRING_RANGE_LANES.length-1)structure([.2,2.45,3.6],x+3.5,12.6,0x33454b,1.225,'RANGE_SHOOTING_BAY_PARTITION');
  structure([4.6,.85,.9],x,12.5,0x26353c,.425,'RANGE_SHOOTING_BENCH');
  box([4.7,.065,1.03],materials.rubber,x,.883,12.5,'RANGE_PADDED_FIRING_BENCH',true);
  sign(`LANE ${String(index+1).padStart(2,'0')}  /  27.5 M`,x,1.1,13.03,3.5,{height:.28});
  box([5.9,.02,.19],materials.amber,x,.033,11.2,'RANGE_FIRING_LINE',true);
  // Rails make the target carrier's actual travel envelope visible.
  box([5.25,.06,.08],materials.steel,x,.06,-15.45,'RANGE_MOVING_TARGET_TRACK',true);
 });
 // Distance labels reflect the fixed 13.8 m firing position, rather than
 // decorative labels that disagree with the live target geometry.
 for(const distance of [10,15,20,25]){
  const z=13.8-distance;box([37.8,.012,.055],distance===20?materials.amber:materials.steel,0,.034,z,'RANGE_DISTANCE_LINE',true);
  [-17.6,17.6].forEach(x=>sign(`${distance} M`,x,.18,z,1.25,{height:.32}));
 }
 sign('LIVE RANGE  /  EYES & EARS  /  FIRE FROM YOUR BAY',0,4.08,-18.61,12.5,{height:.48});
 sign('SAFE ZONE  /  MULTIPLAYER LOBBY',0,2.82,18.3,8.2,{height:.48,rotation:Math.PI});

 for(const definition of FIRING_RANGE_TARGETS){
  const group=new THREE.Group();group.name=`RANGE_TARGET_${definition.id}`;group.position.set(definition.position.x,definition.position.y,definition.position.z);group.userData.collisionDisabled=true;group.userData.rangeTargetId=definition.id;group.userData.rangeLane=definition.lane;root.add(group);
  const hitMaterial=definition.kind==='paper'?materials.red.clone():new THREE.MeshStandardMaterial({color:0x587281,roughness:.77,metalness:.3});
  const mount=(geometry,material,position,zone)=>{const mesh=new THREE.Mesh(geometry,material);mesh.name=`RANGE_TARGET_${definition.id}_${zone}`;mesh.position.set(...position);mesh.castShadow=mesh.receiveShadow=true;Object.assign(mesh.userData,{rangeTarget:group,rangeTargetId:definition.id,rangeLane:definition.lane,hitZone:zone,collisionDisabled:true});group.add(mesh);return mesh;};
  if(definition.kind==='paper'){
   // Circle faces are on the exact server ray plane; rings differ by only a
   // texture-depth offset to avoid z fighting, never by target size or center.
   mount(new THREE.CircleGeometry(definition.radius,48),materials.paper,[0,0,0],'outer');
   [[.56,materials.black],[.38,materials.paper],[.22,materials.black],[.09,hitMaterial]].forEach(([radius,material],index)=>mount(new THREE.CircleGeometry(radius,40),material,[0,0,.001*(index+1)],index===3?'bullseye':'body'));
   box([.07,1.08,.07],materials.steel,definition.position.x,2.85,definition.position.z-.07,'RANGE_PAPER_CARRIER',true);
  }else{
   mount(new THREE.SphereGeometry(.3,20,14),hitMaterial,[0,2.18,0],'bullseye');
   mount(new THREE.BoxGeometry(.9,1.25,.12),hitMaterial,[0,1.35,0],'body');
   mount(new THREE.BoxGeometry(1.45,.28,.12),hitMaterial,[0,1.72,0],'body');
   const support=new THREE.Mesh(new THREE.BoxGeometry(.07,.66,.07),materials.steel);support.position.y=.36;group.add(support);
   const base=new THREE.Mesh(new THREE.BoxGeometry(.6,.12,.4),materials.dark);base.position.y=.08;group.add(base);
  }
  targets.set(definition.id,{definition,group,hitMaterial,baseColor:hitMaterial.color.clone(),baseEmissive:hitMaterial.emissive.clone()});
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
 interactive('range-armory','Armory & optics',-12,16.2);
 interactive('range-start','Join / start round',-3,16.1);
 interactive('range-settings','Tournament rules',0,17.15,materials.amber);
 interactive('range-watch','Watch live match',7,16.1);
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
  const clock=liveState.state==='live'&&liveState.settings?.mode==='freeplay'?'OPEN':clockLabel(deadline?deadline-now:liveState.remainingMs??liveState.settings?.durationSeconds*1000),participants=Object.values(liveState.participants||{}),leaders=(liveState.leaderboard||[]).filter(player=>player.role!=='spectator').slice(0,4),mode=text(liveState.settings?.mode||'precision').toUpperCase(),state=text(liveState.state||'lobby').toUpperCase();
  const snapshot={state,mode,clock,round:Number(liveState.round)||0,rounds:Number(liveState.settings?.rounds)||1,players:participants.filter(player=>player.role==='player'&&player.online!==false).length,spectators:participants.filter(player=>player.role==='spectator'&&player.online!==false).length,leaders:leaders.map((entry,index)=>({rank:Number(entry.rank)||index+1,name:text(entry.name||'Player'),score:Number(entry.score)||0,accuracy:Number(entry.accuracy)||0})),locationId};
  root.userData.rangeDisplay=snapshot;
  const key=JSON.stringify(snapshot),pulse=now-(Number(liveState.lastShot?.at)||-10000)<450;
  if(!force&&key===lastDisplayKey&&(!pulse||now-lastDraw<90))return;lastDisplayKey=key;lastDraw=now;
  if(!display)return;
  const {context:ctx,canvas,texture}=display,w=canvas.width,h=canvas.height;
  ctx.fillStyle='#07151e';ctx.fillRect(0,0,w,h);ctx.fillStyle='#102b35';ctx.fillRect(0,0,w,83);
  ctx.strokeStyle=pulse?'#f1d56e':'#41dbe9';ctx.lineWidth=7;ctx.strokeRect(7,7,w-14,h-14);
  ctx.fillStyle='#74e9f3';ctx.font='800 37px monospace';ctx.textAlign='left';ctx.fillText('MUZIKAZ  //  LIVE RANGE',32,56);
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
  liveState=state.firingRange||state;locationId=String(options.locationId||locationId);serverTime=Number(options.serverTime??liveState.serverTime)||serverTime;draw(serverTime,true);root.userData.updateFiringRangeEffects(serverTime);
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
  const live=liveState.state==='live',countdown=liveState.state==='countdown';
  for(const lamp of lights){lamp.material.color.setHex(live?0xff5264:countdown?0xf1c668:0x47dce5);lamp.material.emissive.setHex(live?0x65131d:countdown?0x78510c:0x12616b);}
  draw(serverTime);
 };
 draw(0,true);return root;
}
