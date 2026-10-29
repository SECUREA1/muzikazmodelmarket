import {articulateLimb,finalizeArticulatedCharacter,updateArticulatedCharacter} from '../articulated-character-rig.js';
import {funhouseRideCue} from '../funhouse-experience-rules.js';
import {finishVehicleDesign} from '../vehicle-design-system.js';
import {FUNHOUSE_ADVENTURE_START,FUNHOUSE_ADVENTURE_CLUES,funhouseAdventureAvailable} from '../funhouse-adventure-rules.js';
import * as T from '../../vendor/three/three.module.min.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import {createCreepyClownFace} from '../creepy-clown-face.js';
import {FUNHOUSE_WALLS} from '../clown-funhouse-config.js';
import {createFunhouseHauntScenery} from '../funhouse-haunt-scenery.js';

// One metre-based scene supplies both the visible world and its walking solids.
// Set dressing and animated performers never become invisible walking barriers.
export function createClownFunhouseLand(environment={}) {
 const assetId=environment.funhouseAssetId||null,full=!assetId,part=id=>full||assetId===id;
 const root=new T.Group();root.name='MIDNIGHT_LAUGHS_FUNHOUSE';
 root.userData={proceduralLand:true,layout:'clown-funhouse',cleanSportsWorld:true,streetHeightAt:()=>0};
 const material=(color,extra={})=>new T.MeshStandardMaterial({color,roughness:.72,metalness:.06,...extra});
 const ink=material('#161325'),purple=material('#412053'),plum=material('#6b2458'),red=material('#d5334d'),cream=material('#f4dfae'),yellow=material('#f4ba35'),blue=material('#28788d'),mint=material('#5bc4ae'),black=material('#1c1a29'),wood=material('#53322d'),steel=material('#b4b7bc',{metalness:.8,roughness:.3});
 const lamp=material('#ffe7a0',{emissive:'#ffd269',emissiveIntensity:1.4}),pink=material('#ef5cbd',{emissive:'#c53490',emissiveIntensity:.6}),cyan=material('#56d9e8',{emissive:'#37b8ce',emissiveIntensity:.6}),mirror=material('#8cabb5',{metalness:1,roughness:.14,emissive:'#204454',emissiveIntensity:.2});
 const clownPallor=material('#e7e4dc'),clownCrimson=material('#68152f'),clownPlum=material('#30162e'),clownInk=material('#18111e'),clownIvory=material('#f8edd2'),clownIris=material('#e4b96e',{emissive:'#9a452f',emissiveIntensity:.18});
 let propellerPaint;
 const clownFaceMaterials={pallor:clownPallor,ink:clownInk,crimson:clownCrimson,ivory:clownIvory,iris:clownIris};
 const animations=[],targets=[],jackPops=[],performers=[],balloons=[],bulbs=[],bursts=[],interactionTargets=[],ballTargets=[],tossBalls=[];
 const rideAnchors={},balanceControls=[],adventureMarkers=[],adventureRigs=[],storyDetails=[];
 let hornCue=null,hauntScenery=null;
 let galleryRoot=null,splashRay=null,tossRay=null;
 let experienceState={},experienceTime=0,experienceReceivedAt=0,ballTarget=-1,tossTargetId=0,tossUntil=-1;
 const liveLabels={};
 let lastTime=0,spinnerUntil=-1,carUntil=-1,jackUntil=-1,splashUntil=-1,ballUntil=-1,dressUntil=-1,activeTarget=-1,splashTargetId=0;
 const timed=new Map(),stations=new Map(),seenEffects=new Map();
 const ballMats=[red,yellow,blue,mint,pink,cream],passengers=[];
 let bell=null,car=null,spinning=null,dressClown=null;
 function mesh(parent,geometry,mat,name,x=0,y=0,z=0,solid=false){const node=new T.Mesh(geometry,mat);node.name=name;node.position.set(x,y,z);node.castShadow=solid;node.receiveShadow=true;if(!solid)node.userData.collisionDisabled=true;parent.add(node);return node;}
 const box=(parent,name,x,y,z,w,h,d,mat,solid=false)=>mesh(parent,new T.BoxGeometry(w,h,d),mat,name,x,y,z,solid);
 const cylinder=(parent,name,x,y,z,r,h,mat,solid=false,segments=24)=>mesh(parent,new T.CylinderGeometry(r,r,h,segments),mat,name,x,y,z,solid);
 const sphere=(parent,name,x,y,z,r,mat)=>mesh(parent,new T.SphereGeometry(r,16,12),mat,name,x,y,z);
 function group(parent,name,x=0,z=0,y=0){const node=new T.Group();node.name=name;node.position.set(x,y,z);parent.add(node);return node;}
 function action(node,{id,stationId,kind,operation,targetId,clueId,radius=.45,offset={x:0,y:0,z:0}}){
  const fields={id,stationId,kind,operation,...(targetId!==undefined?{targetId}:{}),...(clueId?{clueId}:{})};
  const descriptor={...fields,root:node,radius,offset};
  node.userData.funhouseAction=fields;node.userData.dynamicDecoration=true;
  interactionTargets.push(descriptor);return node;
 }
 function control(parent,name,x,y,z,text,stationId,kind,operation,mat=cyan){
  const panel=box(parent,name,x,y,z,1.2,.64,.08,mat);action(panel,{id:name,stationId,kind,operation,radius:.48});
  sign(parent,text,x,y,z+.05,1.1,.42);return panel;
 }
 function liveSign(kind,parent,x,y,z,w,h,title){const face=sign(parent,title,x,y,z,w,h);face.userData.funhouseStatus='';liveLabels[kind]=face;return face;}
 function updateLiveSign(kind,title,subtitle=''){
  const face=liveLabels[kind];if(!face)return;const key=title+'|'+subtitle;if(face.userData.funhouseStatus===key)return;face.userData.funhouseStatus=key;
  const map=face.material.map,canvas=map?.image,ctx=canvas?.getContext?.('2d');if(!ctx)return;
  ctx.fillStyle='#191425';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='#8adfcc';ctx.lineWidth=8;ctx.strokeRect(8,8,canvas.width-16,canvas.height-16);ctx.textAlign='center';ctx.fillStyle='#fff0c8';ctx.font='bold 70px system-ui';ctx.fillText(title,canvas.width/2,subtitle?115:157,canvas.width-50);if(subtitle){ctx.fillStyle='#8debe1';ctx.font='36px system-ui';ctx.fillText(subtitle,canvas.width/2,196,canvas.width-50);}map.needsUpdate=true;
 }
 function localRay(parent,result,distance=12){
  const source=result?.origin,direction=result?.direction;if(!source||!Array.isArray(direction)||direction.length!==3)return null;
  const origin=Array.isArray(source)?new T.Vector3(...source):new T.Vector3(Number(source.x),Number(source.y),Number(source.z)),aim=new T.Vector3(...direction);if(![...origin,...aim].every(Number.isFinite)||aim.lengthSq()<.001)return null;
  aim.normalize();root.updateWorldMatrix(true,true);const cast=new T.Raycaster(origin,aim,.02,distance),hit=cast.intersectObject(root,true).find(value=>{
   for(let node=value.object;node;node=node.parent)if(node.visible===false||node.userData.collisionDisabled===true)return false;
   return [].concat(value.object.material||[]).some(material=>material?.visible!==false);
  });
  const end=origin.clone().addScaledVector(aim,hit?.distance||distance);return {origin:parent.worldToLocal(origin.clone()),end:parent.worldToLocal(end)};
 }
 function texture(width,height,paint){if(typeof document==='undefined')return null;const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');if(!ctx)return null;paint(ctx,width,height);const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.anisotropy=4;return map;}
 function sign(parent,text,x,y,z,w=5,h=.8,sub='',color='#f4dfae',rotation=0){
  const map=texture(1024,256,(ctx,W,H)=>{ctx.fillStyle='#191425';ctx.fillRect(0,0,W,H);ctx.strokeStyle='#cfa34f';ctx.lineWidth=9;ctx.strokeRect(10,10,W-20,H-20);ctx.textAlign='center';ctx.fillStyle=color;ctx.font='bold '+(sub?72:90)+'px Georgia,serif';ctx.fillText(text,W/2,sub?119:155,W-60);if(sub){ctx.font='29px system-ui,sans-serif';ctx.fillStyle='#d0bfcc';ctx.fillText(sub,W/2,194,W-65);}});
  const face=mesh(parent,new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map,color:map?'#ffffff':color,side:T.DoubleSide}),'FUNHOUSE_SIGN_'+text,x,y,z);face.rotation.y=rotation;return face;
 }
 function torus(parent,name,x,y,z,r,tube,mat,rotationX=0){const node=mesh(parent,new T.TorusGeometry(r,tube,8,40),mat,name,x,y,z);node.rotation.x=rotationX;return node;}
 function line(parent,name,points,mat){const curve=new T.CatmullRomCurve3(points.map(point=>new T.Vector3(...point)));return mesh(parent,new T.TubeGeometry(curve,Math.max(8,points.length*4),.025,4,false),mat,name);}
 function bulb(parent,x,y,z,mat=lamp,r=.11){const node=sphere(parent,'FUNHOUSE_MARQUEE_BULB',x,y,z,r,mat);bulbs.push(node);return node;}
 function light(x,y,z,color,intensity=40,distance=32){const node=new T.PointLight(color,intensity,distance,2);node.position.set(x,y,z);root.add(node);return node;}
 function stripedBox(parent,name,x,y,z,w,h,d){box(parent,name,x,y,z,w,h,d,cream,true);for(let i=0;i<Math.ceil(w/.65);i++)box(parent,'FUNHOUSE_PAINTED_STRIPE',x-w/2+.3+i*.65,y,z+d/2+.008,.28,h,.012,i%2?plum:red);}
 function floorInlay(text,x,z,w=6,color='#e7c878') {const map=texture(1024,160,(ctx,W,H)=>{ctx.clearRect(0,0,W,H);ctx.fillStyle=color;ctx.textAlign='center';ctx.font='bold 68px Georgia';ctx.fillText(text,W/2,109,W-20);});const plane=mesh(root,new T.PlaneGeometry(w,1),new T.MeshBasicMaterial({map,color:map?'#ffffff':color,transparent:true,depthWrite:false}),'FUNHOUSE_FLOOR_LABEL_'+text,x,.035,z);plane.rotation.x=-Math.PI/2;}

 function waterGun(parent,x,y,z,rotation=0){const gun=group(parent,'FUNHOUSE_WATER_GUN',x,z,y);gun.rotation.y=rotation;box(gun,'FUNHOUSE_WATER_GUN_BODY',0,0,0,.29,.35,.76,mint);const barrel=cylinder(gun,'FUNHOUSE_WATER_GUN_BARREL',0,.04,-.62,.11,.6,blue);barrel.rotation.x=Math.PI/2;cylinder(gun,'FUNHOUSE_WATER_GUN_NOZZLE',0,.04,-.95,.07,.12,yellow).rotation.x=Math.PI/2;box(gun,'FUNHOUSE_WATER_GUN_GRIP',0,-.26,.16,.16,.44,.21,red);sphere(gun,'FUNHOUSE_WATER_GUN_TANK',0,.25,.16,.24,cyan);torus(gun,'FUNHOUSE_WATER_GUN_TRIGGER',0,-.22,-.18,.14,.025,yellow,Math.PI/2);return gun;}
 function jackBox(x,z,index){const base=group(root,'FUNHOUSE_JACK_IN_THE_BOX_'+index,x,z);stripedBox(base,'FUNHOUSE_JACK_BOX',0,1.2,0,2.9,2.4,2.9);for(const dx of [-1.5,1.5])for(const dz of [-1.5,1.5])cylinder(base,'FUNHOUSE_JACK_BOX_CORNER',dx,1.25,dz,.09,2.5,yellow);const lid=group(base,'FUNHOUSE_JACK_LID',0,-1.5,2.45);box(lid,'FUNHOUSE_JACK_LID_PANEL',0,0,1.5,3.1,.17,3.1,blue);const crank=group(base,'FUNHOUSE_JACK_CRANK_ASSEMBLY',0,1.75,1.15);const arm=cylinder(crank,'FUNHOUSE_JACK_CRANK_STEM',0,0,0,.06,.6,steel);arm.rotation.x=Math.PI/2;box(crank,'FUNHOUSE_JACK_CRANK',.28,.3,.3,.07,.65,.08,steel);const handle=sphere(crank,'FUNHOUSE_JACK_CRANK_HANDLE',.3,.65,.3,.14,red);action(handle,{id:'jack-wind-'+index,stationId:'funhouse-jack-box',kind:'jackbox',operation:'wind',radius:.5});const surprise=clown(base,'FUNHOUSE_POPUP_CLOWN_'+index,0,0,.95,index%2?blue:plum);surprise.position.y=1.2;action(surprise,{id:'jack-catch-'+index,stationId:'funhouse-jack-box',kind:'jackbox',operation:'catch',radius:.75,offset:{x:0,y:2.1,z:0}});const spring=mesh(base,new T.TubeGeometry(new T.CatmullRomCurve3(Array.from({length:65},(_,i)=>{const a=i/64*Math.PI*12;return new T.Vector3(Math.cos(a)*.32,2+i/64*1.8,Math.sin(a)*.32);})),64,.05,6,false),steel,'FUNHOUSE_JACK_SPRING');spring.visible=false;spring.userData.dynamicDecoration=true;surprise.visible=false;jackPops.push({base,lid,surprise,spring,crank});return base;}
 function stall(name,x,z,frontMat,label,sub){const g=group(root,name,x,z);stripedBox(g,'FUNHOUSE_MIDWAY_STALL',0,1.2,0,7,2.4,3.6);box(g,'FUNHOUSE_STALL_COUNTER',0,2.45,2,7.8,.18,1,wood,true);for(const dx of [-3.6,3.6])cylinder(g,'FUNHOUSE_STALL_POLE',dx,3,1.8,.09,6,yellow,true);mesh(g,new T.ConeGeometry(5.3,2.5,4),frontMat,'FUNHOUSE_STALL_ROOF',0,6.3,0).rotation.y=Math.PI/4;sign(g,label,0,4.2,2.15,7.7,1.5,sub);return g;}
 function balloonBunch(x,z){const g=group(root,'FUNHOUSE_BALLOON_BUNCH',x,z);cylinder(g,'FUNHOUSE_BALLOON_WEIGHT',0,.14,0,.24,.28,yellow,true);for(let i=0;i<5;i++){const a=i*2.4,dx=Math.cos(a)*.65,dz=Math.sin(a)*.55,h=3.1+(i%3)*.45;line(g,'FUNHOUSE_BALLOON_STRING',[[0,.2,0],[dx*.4,h*.5,dz*.4],[dx,h,dz]],cream);const b=sphere(g,'FUNHOUSE_HELIUM_BALLOON',dx,h+.4,dz,.46,ballMats[i]);b.scale.set(.85,1.2,.85);b.userData.dynamicDecoration=true;animations.push(t=>b.position.x=dx+Math.sin(t*.65+i)*.08);}}
 function bunting(x1,z1,x2,z2,y){const points=[];for(let i=0;i<=16;i++){const f=i/16;points.push([x1+(x2-x1)*f,y-Math.sin(f*Math.PI)*1.15,z1+(z2-z1)*f]);}line(root,'FUNHOUSE_BUNTING_CABLE',points,black);for(let i=1;i<16;i++){const f=i/16,x=x1+(x2-x1)*f,z=z1+(z2-z1)*f,h=y-Math.sin(f*Math.PI)*1.15;const flag=mesh(root,new T.ConeGeometry(.42,.8,3),ballMats[i%ballMats.length],'FUNHOUSE_BUNTING_FLAG',x,h-.35,z);flag.rotation.z=Math.PI;flag.scale.z=.06;bulb(root,x,h+.08,z,i%2?lamp:pink,.075);}}
 function storyArea(id,name,x,z){const node=group(root,id,x,z);node.userData.funhouseScenery=name;storyDetails.push({id,name,root:node});return node;}
 function theatreLantern(parent,x,y,z){
  const holder=group(parent,'FUNHOUSE_THEATRE_LANTERN',x,z,y);
  cylinder(holder,'FUNHOUSE_LANTERN_CAP',0,.33,0,.24,.09,black);
  cylinder(holder,'FUNHOUSE_LANTERN_BASE',0,-.33,0,.24,.09,black);
  for(const dx of [-.19,.19])for(const dz of [-.19,.19])box(holder,'FUNHOUSE_LANTERN_CAGE',dx,0,dz,.025,.68,.025,steel);
  sphere(holder,'FUNHOUSE_LANTERN_GLOW',0,0,0,.15,lamp);
  torus(holder,'FUNHOUSE_LANTERN_HANDLE',0,.5,0,.14,.025,steel);
  return holder;
 }
 function storyPortrait(parent,x,y,z,index=0,rotation=0){
  const portrait=group(parent,'FUNHOUSE_WHISPERING_PORTRAIT',x,z,y);portrait.rotation.y=rotation;
  box(portrait,'FUNHOUSE_PORTRAIT_BACK',0,0,0,1.55,2.08,.07,black);
  for(const dx of [-.81,.81])box(portrait,'FUNHOUSE_PORTRAIT_FRAME',dx,0,.02,.1,2.28,.12,yellow);
  for(const dy of [-1.09,1.09])box(portrait,'FUNHOUSE_PORTRAIT_FRAME',0,dy,.02,1.72,.1,.12,yellow);
  const head=createCreepyClownFace({radius:.38,depth:.12,materials:clownFaceMaterials});head.position.set(0,.1,.08);portrait.add(head);
  const collar=box(portrait,'FUNHOUSE_PORTRAIT_COLLAR',0,-.6,.09,.9,.32,.09,index%2?plum:blue);collar.rotation.z=index%2 ? .08 : -.08;
  for(const side of [-1,1])sphere(portrait,'FUNHOUSE_PORTRAIT_CURL',side*.43,.15,.08,.2,index%2?red:plum);
  return portrait;
 }
 function buildStoryScenery(){
  // These additions belong to the whole destination. A market thumbnail or a
  // placed ride still allocates only the attraction that was requested.
  const ribs=storyArea('FUNHOUSE_VELVET_HOUSE_RIBS','Open theatre rafters',0,-28);
  for(const z of [-12.7,-21,-30,-42.8]){
   box(ribs,'FUNHOUSE_VELVET_RAFTER',0,5.65,z+28,46,.18,.22,wood);
   for(const x of [-21,0,21]){line(ribs,'FUNHOUSE_LANTERN_CHAIN',[[x,5.65,z+28],[x,4.65,z+28]],steel);theatreLantern(ribs,x,4.35,z+28);}
  }
  for(const x of [-23.7,23.7])box(ribs,'FUNHOUSE_UPPER_VELVET_SWAG',x,5.15,0,.2,.65,30,plum);
  const gallery=storyArea('FUNHOUSE_STORY_GALLERY','Hall of missing laughs',0,0);
  for(const [index,z]of [-16.4,-20.2,-28,-37.5].entries())storyPortrait(gallery,-23.65,2.25,z,index,Math.PI/2);
  for(const [index,x]of [-20,-15,-10].entries())storyPortrait(gallery,x,2.2,-43.65,index,0);
  sign(gallery,'HALL OF MISSING LAUGHS',-15,4,-43.6,13,1,'THE PORTRAITS REMEMBER EVERY VISITOR');
  for(const [x,z,angle]of [[-4.5,-20,0],[-4.5,-28,Math.PI/2],[-22.5,-28,0],[-22.5,-38,-Math.PI/2]]){
   const marker=group(gallery,'FUNHOUSE_MAZE_WAYFINDING',x,z);
   const disc=torus(marker,'FUNHOUSE_MAZE_FLOOR_MEDALLION',0,.055,0,.48,.025,cyan,Math.PI/2);
   const arrow=mesh(marker,new T.CircleGeometry(.3,3),lamp,'FUNHOUSE_MAZE_ROUTE_ARROW',0,.057,0);arrow.rotation.x=-Math.PI/2;arrow.rotation.z=angle;
   disc.userData.dynamicDecoration=true;
  }
  const stage=storyArea('FUNHOUSE_CLOCKWORK_THEATRE','Clockwork puppet theatre',7,-42.9);
  box(stage,'FUNHOUSE_PUPPET_STAGE',0,.28,0,8,.56,1.1,wood);
  for(const side of [-1,1]){
   box(stage,'FUNHOUSE_STAGE_CURTAIN',side*3.5,2.35,0,.8,4,.28,plum);
   for(let i=0;i<4;i++)cylinder(stage,'FUNHOUSE_CURTAIN_FOLD',side*(3.2+i*.16),2.35,.2,.1,3.9,red);
  }
  box(stage,'FUNHOUSE_STAGE_HEADER',0,4.45,0,8.2,.3,.32,black);
  sign(stage,'THE CLOCKWORK LAUGH',0,4.45,.19,7.6,.58,'');
  const puppet=clown(stage,'FUNHOUSE_CLOCKWORK_PUPPET',0,.05,.63,blue);puppet.position.y=.35;puppet.userData.dynamicDecoration=true;
  for(const x of [-.52,.52])line(stage,'FUNHOUSE_MARIONETTE_STRING',[[x,4.3,.05],[x,1.8,.05]],cream);
  const clock=group(stage,'FUNHOUSE_CLOCKWORK_CLOCK',2.25,.08,2.6);
  cylinder(clock,'FUNHOUSE_CLOCK_FACE',0,0,0,.61,.08,cream).rotation.x=Math.PI/2;
  const hand=box(clock,'FUNHOUSE_CLOCK_HAND',0,.19,.06,.05,.42,.04,black);hand.userData.dynamicDecoration=true;
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2;sphere(clock,'FUNHOUSE_CLOCK_HOUR',Math.sin(a)*.48,Math.cos(a)*.48,.065,.035,red);}
  animations.push(t=>{puppet.rotation.z=Math.sin(t*.45)*.035;hand.rotation.z=-t*.12;});
  const nursery=storyArea('FUNHOUSE_TOY_NURSERY','Forgotten toy nursery',20.5,-16.5);
  for(let i=0;i<3;i++){const block=box(nursery,'FUNHOUSE_FORGOTTEN_TOY_BLOCK',-1.2+i*.95,.3,-.25,.6,.6,.6,ballMats[i]);block.rotation.y=i*.25;sign(nursery,['B','O','O'][i],-1.2+i*.95,.3,.06,.45,.45);}
  const hoop=torus(nursery,'FUNHOUSE_CROOKED_NURSERY_HOOP',0,1.4,-.5,.7,.05,yellow);hoop.rotation.z=.16;
  sign(nursery,'TOYS AFTER MIDNIGHT',0,2.8,-.6,4.6,.68,'SOMEONE FORGOT TO GO HOME');
  const walk=storyArea('FUNHOUSE_LANTERN_WALK','Lantern walk and ride queues',0,0);
  for(const z of [32,44]){
   line(walk,'FUNHOUSE_LANTERN_ARCH',[[-7,0,z],[-7,4.7,z],[-4,6.1,z],[4,6.1,z],[7,4.7,z],[7,0,z]],steel);
   for(const x of [-5,0,5])theatreLantern(walk,x,5.2,z);
  }
  for(const [x,z,label,sub]of [[0,29,'MIRRORS ←   → RIDES','FOLLOW THE LOST LAUGH TRAIL'],[0,9,'SPLASH ←   → SPIN','THRILLS AHEAD IN THE GRINNING HOUSE'],[0,-8,'MIRROR PASSAGES ←   → TOY ROOM','EXIT BELL AT THE FAR LEFT']])sign(walk,label,x,2.8,z,7.4,.85,sub);
  for(const [x,z]of [[20,31],[20,27],[20,23],[20,6],[20,2],[20,-2]]){
   cylinder(walk,'FUNHOUSE_QUEUE_STANCHION',x,.52,z,.035,1.04,steel);sphere(walk,'FUNHOUSE_QUEUE_FINIAL',x,1.08,z,.07,yellow);
   const foot=cylinder(walk,'FUNHOUSE_QUEUE_FOOT',x,.035,z,.23,.05,black);foot.userData.collisionDisabled=true;
  }
  for(const [a,b,z]of [[20,24,31],[20,24,23],[20,23,6],[20,23,-2]])line(walk,'FUNHOUSE_QUEUE_ROPE',[[a,1,z],[(a+b)/2,.83,z],[b,1,z]],red);
  floorInlay('THE LOST LAUGH TRAIL',0,46,9,'#83e3d4');
  floorInlay('HORROR HOUSE',0,-6,8,'#ecc77f');
 }
 function adventureMarker(definition,index=-1){
  const isStart=index<0,id=isStart?'START':definition.id,base=storyArea('FUNHOUSE_ADVENTURE_'+id,isStart?FUNHOUSE_ADVENTURE_START.name:definition.name,definition.position.x,definition.position.z);
  base.userData.funhouseAdventureMarker=definition.id;
  cylinder(base,'FUNHOUSE_ADVENTURE_MEDALLION',0,.045,0,.62,.04,purple);
  torus(base,'FUNHOUSE_ADVENTURE_GROUND_RING',0,.07,0,.55,.025,yellow,Math.PI/2);
  const token=group(base,'FUNHOUSE_ADVENTURE_TOKEN',0,0,1.3);
  const gem=mesh(token,new T.OctahedronGeometry(.18),isStart?lamp:cyan,'FUNHOUSE_LOST_LAUGH_GEM');gem.userData.dynamicDecoration=true;
  const halo=torus(token,'FUNHOUSE_ADVENTURE_ACTIVE_HALO',0,0,0,.38,.028,isStart?yellow:cyan);halo.userData.dynamicDecoration=true;
  const seal=torus(token,'FUNHOUSE_ADVENTURE_FOUND_SEAL',0,0,.025,.27,.035,lamp);seal.visible=false;seal.userData.dynamicDecoration=true;
  action(token,{id:isStart?'adventure-start':'adventure-'+definition.id,stationId:'funhouse-adventure',kind:'adventure',operation:isStart?'adventure-start':'inspect',...(isStart?{}:{clueId:definition.id}),radius:.5});
  const label=sign(base,isStart?'THE LOST LAUGH TRAIL':definition.name.toUpperCase(),0,.68,.28,isStart?4.6:3.7,.6,isStart?'START A SIX-CLUE MIDNIGHT ADVENTURE':'AIM + INSPECT / TRIGGER');label.rotation.x=-.18;
  cylinder(base,'FUNHOUSE_ADVENTURE_PLAQUE_STAND',0,.32,.18,.035,.6,steel);
  const marker={id:definition.id,clueId:isStart?null:definition.id,index,root:base,token,highlight:halo,seal,gem,position:{...definition.position},baseY:1.3};adventureMarkers.push(marker);
  if(isStart)return;
  const rig=group(base,'FUNHOUSE_ADVENTURE_SETPIECE',0,-.4);
  if(definition.scare==='ticket'){
   const ticket=sign(rig,'TICKET 13',0,.7,0,1.25,.48,'ADMIT ONE LOST LAUGH');ticket.rotation.z=-.14;
   for(const x of [-.59,.59])for(let i=0;i<4;i++)sphere(rig,'FUNHOUSE_TICKET_PERFORATION',x,.53+i*.11,.01,.025,cream);
   adventureRigs.push({id:definition.id,kind:'ticket',node:ticket});
  }else if(definition.scare==='wardrobe'){
   box(rig,'FUNHOUSE_WHISPER_WARDROBE',0,.68,0,1.1,1.35,.45,wood);
   const door=group(rig,'FUNHOUSE_WHISPER_WARDROBE_DOOR',-.55,.25,.7);box(door,'FUNHOUSE_WARDROBE_DOOR_PANEL',.55,0,0,1.08,1.3,.07,plum);sphere(door,'FUNHOUSE_WARDROBE_KNOB',.94,0,.08,.055,yellow);
   adventureRigs.push({id:definition.id,kind:'door',node:door});
  }else if(definition.scare==='mask'){
   const basin=cylinder(rig,'FUNHOUSE_DROWNED_MASK_BASIN',0,.22,0,.58,.4,blue);basin.scale.z=.8;
   const mask=createCreepyClownFace({radius:.23,depth:.11,materials:clownFaceMaterials});mask.position.set(0,.74,.08);rig.add(mask);
   adventureRigs.push({id:definition.id,kind:'mask',node:mask,baseY:.74});
  }else if(definition.scare==='shadow'){
   const shadow=mesh(rig,new T.CircleGeometry(.95,20),black,'FUNHOUSE_SECOND_SHADOW',0,.08,0);shadow.rotation.x=-Math.PI/2;shadow.scale.set(.5,1.8,1);
   for(const x of [-.12,.12])sphere(rig,'FUNHOUSE_SHADOW_WATCHING_EYE',x,.37,.3,.045,lamp);
   adventureRigs.push({id:definition.id,kind:'shadow',node:shadow});
  }else if(definition.scare==='chest'){
   box(rig,'FUNHOUSE_SECRET_TOY_CHEST',0,.27,0,1.45,.52,.9,red);
   const lid=group(rig,'FUNHOUSE_SECRET_CHEST_LID',0,-.45,.56);box(lid,'FUNHOUSE_CHEST_LID_PANEL',0,0,.45,1.52,.1,.92,yellow);
   const face=createCreepyClownFace({radius:.2,depth:.1,materials:clownFaceMaterials});face.position.set(0,.5,.12);rig.add(face);
   adventureRigs.push({id:definition.id,kind:'lid',node:lid});
  }else if(definition.scare==='lantern'){
   const lantern=theatreLantern(rig,0,.55,0);adventureRigs.push({id:definition.id,kind:'lantern',node:lantern});
  }
 }
 if(full&&environment.builderScene?.layoutMeta?.funhouse?.editableItems){
  box(root,'BUILDER_WALKABLE_FLOOR_clown-funhouse',0,-.2,0,120,.4,120,purple,true);
  return root;
 }
 if(part('funhouse-midway-floor')) {
 const paving=texture(512,512,(ctx,W,H)=>{ctx.fillStyle='#292039';ctx.fillRect(0,0,W,H);for(let y=0;y<8;y++)for(let x=0;x<8;x++){ctx.fillStyle=(x+y)%2?'#32263f':'#272034';ctx.fillRect(x*64+1,y*64+1,62,62);}ctx.fillStyle='#b48b5733';for(let i=0;i<30;i++){const x=(i*137)%W,y=(i*91)%H;ctx.fillRect(x,y,3,3);}});
 if(paving){paving.wrapS=paving.wrapT=T.RepeatWrapping;paving.repeat.set(15,15);}
 box(root,'BUILDER_WALKABLE_FLOOR_clown-funhouse',0,-.2,0,120,.4,120,material('#ffffff',{map:paving}),true);
 box(root,'FUNHOUSE_CENTRAL_PROMENADE',0,.01,14,11,.02,88,purple);
 for(const x of [-5.5,5.5])box(root,'FUNHOUSE_PROMENADE_GOLD',x,.026,14,.1,.02,88,yellow);
 for(let z=-8;z<49;z+=7){const a=mesh(root,new T.CircleGeometry(.35,3),cream,'FUNHOUSE_PATH_ARROW',0,.034,z);a.rotation.x=-Math.PI/2;a.rotation.z=Math.PI;}
 for(const z of [20,42])box(root,'FUNHOUSE_CROSS_PROMENADE',0,.014,z,88,.02,5,purple);
 }
 if(part('funhouse-horror-house')) {
 const houseFloor=texture(256,256,(ctx,W,H)=>{for(let y=0;y<4;y++)for(let x=0;x<4;x++){ctx.fillStyle=(x+y)%2?'#493353':'#c9b8b7';ctx.fillRect(x*64,y*64,64,64);}ctx.strokeStyle='#22172c';ctx.lineWidth=2;for(let p=0;p<=256;p+=64){ctx.beginPath();ctx.moveTo(p,0);ctx.lineTo(p,H);ctx.moveTo(0,p);ctx.lineTo(W,p);ctx.stroke();}});
 if(houseFloor){houseFloor.wrapS=houseFloor.wrapT=T.RepeatWrapping;houseFloor.repeat.set(12,8);}
 box(root,'FUNHOUSE_HOUSE_CHECKER_FLOOR',0,.018,-28,47.5,.025,31.5,material('#ffffff',{map:houseFloor}));
 }
 for(const wall of FUNHOUSE_WALLS){
  const isMirror=!!wall.mirror;
  if(!full&&(isMirror?(assetId!=='funhouse-mirror-wall'||wall.id!=='maze-turn-one'):assetId!=='funhouse-horror-house'))continue;
  box(root,'FUNHOUSE_WALL_'+wall.id,wall.x,wall.height/2,wall.z,wall.width,wall.height,wall.depth,isMirror?mirror:purple,true);
  box(root,'FUNHOUSE_WALL_COPING_'+wall.id,wall.x,wall.height+.06,wall.z,wall.width+.09,.12,wall.depth+.09,isMirror?cyan:red);
  if(isMirror){
   if(wall.width>wall.depth)for(let x=wall.x-wall.width/2+.15;x<=wall.x+wall.width/2;x+=2.9){for(const z of [wall.z-wall.depth/2-.015,wall.z+wall.depth/2+.015]){box(root,'FUNHOUSE_MIRROR_FRAME',x,1.65,z,.1,3.1,.025,yellow);const slash=box(root,'FUNHOUSE_CROOKED_REFLECTION',x+1.2,1.7,z,1.8,.06,.02,cyan);slash.rotation.z=.45;}}
   else for(let z=wall.z-wall.depth/2+.2;z<=wall.z+wall.depth/2;z+=3)for(const x of [wall.x-wall.width/2-.015,wall.x+wall.width/2+.015])box(root,'FUNHOUSE_MIRROR_FRAME',x,1.65,z,.025,3.1,.1,yellow);
  }else if(wall.id.includes('front')){
   for(let x=wall.x-wall.width/2+.5;x<wall.x+wall.width/2;x+=1.1)box(root,'FUNHOUSE_FACADE_STRIPE',x,3.5,-11.73,.45,7,.025,red);
  }
 }
 if(part('funhouse-horror-house')) {
 // The mouth is a genuine open entrance; teeth and lips stay above head height.
 const face=group(root,'FUNHOUSE_GIANT_CLOWN_FACADE',0,-11);
 face.userData.creepyClownFace=true;
 const forehead=sphere(face,'FUNHOUSE_CLOWN_FOREHEAD',0,11.1,0,7.3,clownPallor);forehead.scale.set(1.05,.84,.31);
 for(const side of [-1,1]){
  const cheek=sphere(face,'FUNHOUSE_CLOWN_CHEEK',side*6.2,5.6,.4,2.45,clownPallor);cheek.scale.set(1,1.2,.6);
  const rouge=sphere(face,'FUNHOUSE_CLOWN_ROUGE',side*6.9,5.8,1.75,1.02,red);rouge.scale.z=.22;
  const eye=sphere(face,'FUNHOUSE_CLOWN_EYE',side*3.35,10.8,1.7,1.6,black);eye.scale.set(1.1,.86,.25);eye.rotation.z=side*.19;
  const pupil=sphere(face,'FUNHOUSE_CLOWN_EYE_GLOW',side*3.15,10.65,2.14,.61,cyan);pupil.scale.set(.6,1,.25);
  const shine=sphere(face,'FUNHOUSE_CLOWN_EYE_SHINE',side*3.15-.1,10.85,2.3,.12,cream);
  const brow=box(face,'FUNHOUSE_ANGRY_BROW',side*3.25,12.3,1.9,3.7,.5,.22,clownInk);brow.rotation.z=side*.21;
  const tear=mesh(face,new T.ConeGeometry(.55,2.1,3),clownInk,'FUNHOUSE_CLOWN_TEAR',side*3.3,8.45,1.95);tear.rotation.z=Math.PI;tear.scale.z=.2;
  for(let i=0;i<5;i++){const puff=sphere(face,'FUNHOUSE_CLOWN_CURL',side*(6.6+(i%2)*.8),9.2+i*.84,-.2,.98,i%2?red:plum);puff.scale.z=.6;}
 }
 sphere(face,'FUNHOUSE_CLOWN_RED_NOSE',0,8.7,2.05,1.28,red);
 const lip=torus(face,'FUNHOUSE_OPEN_MOUTH',0,2.9,.3,4.25,.42,red);lip.scale.y=1.04;
 for(let i=0;i<7;i++){const x=(i-3)*.87,y=6.35-Math.abs(i-3)*.12;const tooth=mesh(face,new T.ConeGeometry(.38,.8,3),cream,'FUNHOUSE_CLOWN_TOOTH',x,y,1);tooth.rotation.z=Math.PI;tooth.scale.z=.5;}
 const noseShine=sphere(face,'FUNHOUSE_NOSE_SHINE',-.34,9.15,3.1,.22,lamp);noseShine.scale.z=.1;
 const giantHat=group(face,'FUNHOUSE_GIANT_SPINNER_HAT',0,0,16.5);
 const brim=cylinder(giantHat,'FUNHOUSE_GIANT_HAT_BRIM',0,0,0,6.2,.35,yellow);brim.scale.z=.65;
 const crown=mesh(giantHat,new T.SphereGeometry(4.4,20,10,0,Math.PI*2,0,Math.PI/2),blue,'FUNHOUSE_GIANT_HAT_CROWN',0,0,0);crown.scale.set(1,.7,.7);
 cylinder(giantHat,'FUNHOUSE_HAT_PROPELLER_STEM',0,3.3,0,.12,1.4,steel);
 const giantPropeller=group(giantHat,'FUNHOUSE_GIANT_HAT_PROPELLER',0,0,4);
 box(giantPropeller,'FUNHOUSE_HAT_BLADE_RED',0,0,0,10,.14,.7,red);box(giantPropeller,'FUNHOUSE_HAT_BLADE_YELLOW',0,.01,0,.7,.14,10,yellow);sphere(giantPropeller,'FUNHOUSE_HAT_PROPELLER_HUB',0,.06,0,.4,cream);
 animations.push(t=>giantPropeller.rotation.y=t*.8);
 sign(root,'MIDNIGHT LAUGHS',0,15.4,-7.9,24,2.4,'ENTER THE FUNHOUSE • EVERY SCREAM IS A LAUGH','#ffe2a2');
 for(let x=-11.4;x<=11.5;x+=.6){bulb(root,x,14.2,-7.85);bulb(root,x,16.65,-7.85);}
 for(const x of [-22,22]){
  stripedBox(root,'FUNHOUSE_GATE_TOWER',x,4.9,-11.7,3.4,9.8,2.7);
  mesh(root,new T.ConeGeometry(2.8,4,8),plum,'FUNHOUSE_TOWER_ROOF',x,11.8,-11.7);
  sphere(root,'FUNHOUSE_TOWER_FINIAL',x,14,-11.7,.42,lamp);
  const window=box(root,'FUNHOUSE_BOARDED_WINDOW',x,5,-10.3,2,2.9,.12,black);
  const board=box(root,'FUNHOUSE_WINDOW_BOARD',x,4.9,-10.2,2.3,.26,.14,wood);board.rotation.z=.45;
  const board2=box(root,'FUNHOUSE_WINDOW_BOARD',x,5,-10.1,2.3,.26,.14,wood);board2.rotation.z=-.5;
 }
 sign(root,'CROOKED MIRRORS',-13.5,4.4,-13.8,15,1.2,'FIND THE EXIT BELL');
 sign(root,'MONSTER PLAYROOM',13.5,4.4,-13.8,15,1.2,'NOTHING HERE BITES… MUCH');
 control(root,'FUNHOUSE_MAZE_START_BUTTON',-8,1.35,-19,'START MAZE','funhouse-mirror-maze','mirrors','start',cyan);
 }
 if(full)sign(root,'THIS WAY… MAYBE',-13,2.7,-23.76,8,.8,'RIGHT AROUND THE MIRRORS','#76e3e1');
 if(full)sign(root,'KEEP LAUGHING',-13,2.7,-32.76,8,.8,'LEFT, THEN TOWARD THE BELL','#76e3e1');
 if(part('funhouse-maze-bell')) {
 sign(root,'THE EXIT BELL',-18,3.8,-43.7,8,1,'YOU MADE IT!','#ffe2a2');
 bell=group(root,'FUNHOUSE_MAZE_EXIT_BELL',-18,-41.8);
 cylinder(bell,'FUNHOUSE_BELL_POST',0,1.5,0,.12,3,red,true);box(bell,'FUNHOUSE_BELL_ARM',0,3,0,2,.14,.2,yellow);
 const bellBody=mesh(bell,new T.CylinderGeometry(.26,.52,.7,16,1,true),yellow,'FUNHOUSE_EXIT_BELL',.6,2.7,0);sphere(bell,'FUNHOUSE_BELL_CLAPPER',.6,2.3,0,.12,steel);
 action(bellBody,{id:'maze-exit-bell',stationId:'funhouse-maze-finish',kind:'maze-finish',operation:'ring',radius:.7});
 sign(bell,'RING TO FINISH',0,1.6,.18,3,.6,'AIM + USE / TRIGGER');
 stations.set('funhouse-maze-finish',bell);

 }
 function propellerHat(parent,x,y,z,size=1){
  const hat=group(parent,'FUNHOUSE_PROPELLER_HAT',x,z,y);
  propellerPaint=clownIvory;propellerPaint.vertexColors=true;
  const paint=(geometry,color)=>{
   const colors=new Uint8Array(geometry.attributes.position.count*3);
   for(let i=0;i<colors.length;i+=3){colors[i]=Math.round(color.r/clownIvory.color.r*255);colors[i+1]=Math.round(color.g/clownIvory.color.g*255);colors[i+2]=Math.round(color.b/clownIvory.color.b*255);}
   geometry.setAttribute('color',new T.Uint8BufferAttribute(colors,3,true));return geometry;
  };
  const combine=(parent,parts,name)=>{
   const geometry=mergeGeometries(parts);for(const part of parts)part.dispose();
   return mesh(parent,geometry,propellerPaint,name);
  };
  const brim=new T.CylinderGeometry(.58*size,.58*size,.08*size,24);brim.scale(1,1,.85);
  const cap=new T.SphereGeometry(.43*size,12,8,0,Math.PI*2,0,Math.PI/2);cap.translate(0,.02*size,0);
  combine(hat,[paint(brim,yellow.color),paint(cap,blue.color)],'FUNHOUSE_PAINTED_HAT');
  cylinder(hat,'FUNHOUSE_HAT_STEM',0,.53*size,0,.035*size,.24*size,steel);
  const blades=group(hat,'FUNHOUSE_HAT_SPINNER',0,0,.67*size),parts=[];
  for(const [dimensions,offset,color]of [[[1.32,.04,.14],0,red.color],[[.14,.04,1.32],.01,yellow.color]]){
   const geometry=new T.BoxGeometry(...dimensions.map(value=>value*size));geometry.translate(0,offset,0);parts.push(paint(geometry,color));
  }
  // Rigid hat panels and blades retain their authored colors in fewer draws,
  // paying for independently articulated trouser joints without extra meshes.
  combine(blades,parts,'FUNHOUSE_HAT_PROPELLER_BLADES');
  animations.push(t=>blades.rotation.y=t*(2+size*.1));return hat;
 }
 function shoe(parent,x,y,z,size=1,mat=red){const node=group(parent,'FUNHOUSE_OVERSIZED_CLOWN_SHOE',x,z,y);const sole=box(node,'FUNHOUSE_CLOWN_SHOE_SOLE',0,.12*size,.16*size,.68*size,.18*size,1.6*size,cream);const toe=sphere(node,'FUNHOUSE_CLOWN_SHOE_TOE',0,.36*size,.55*size,.47*size,mat);toe.scale.set(.85,.65,1.3);const heel=box(node,'FUNHOUSE_CLOWN_SHOE_HEEL',0,.34*size,-.32*size,.52*size,.5*size,.55*size,mat);for(let i=0;i<3;i++)box(node,'FUNHOUSE_CLOWN_SHOE_LACE',0,.62*size,-.32*size+i*.16*size,.38*size,.025*size,.05*size,cream);return node;}
 function clown(parent,name,x,z,scale=1,coat=plum,withHat=true){
  const c=group(parent,name,x,z);c.scale.setScalar(scale);c.userData.creepyClownCharacter=true;
  const darkCoat=coat===red?clownCrimson:coat===blue?clownPlum:clownInk;
  const body=sphere(c,'FUNHOUSE_CLOWN_SUIT',0,1.04,0,.67,darkCoat);body.scale.set(.83,1.08,.68);
  for(const side of [-1,1]){
   const hip=group(c,'FUNHOUSE_CLOWN_HIP',side*.25,0,.9);
   // The extra longitudinal ring replaces radial slices, keeping the original
   // silhouette and one draw while allowing an actual knee bend.
   const trouser=mesh(hip,new T.CylinderGeometry(.17,.17,.64,12,2),side<0?clownInk:clownCrimson,'FUNHOUSE_CLOWN_TROUSER',0,-.33,0);
   const foot=shoe(hip,side*.02,-.9,.08,.8,side<0?red:yellow);
   articulateLimb(T,hip,{mesh:trouser,bend:[0,-.34,0],end:[0,-.65,0],attachments:[foot],kind:'leg',side,prefix:'FUNHOUSE_CLOWN',forward:1});
  }
  const head=createCreepyClownFace({radius:.48,materials:clownFaceMaterials});head.position.set(0,2.13,.02);c.add(head);
  for(const side of [-1,1]){
   sphere(c,'FUNHOUSE_CLOWN_HAIR',side*.4,2.23,0,.22,clownCrimson);
   const arm=group(c,'FUNHOUSE_CLOWN_ARM',side*.53,0,1.45);
   const sleeve=mesh(arm,new T.CylinderGeometry(.15,.15,.62,12,2),darkCoat,'FUNHOUSE_CLOWN_SLEEVE',0,-.2,0);
   const glove=sphere(arm,'FUNHOUSE_CLOWN_GLOVE',0,-.55,0,.17,clownPallor);arm.rotation.z=side*.18;
   articulateLimb(T,arm,{mesh:sleeve,bend:[0,-.28,0],end:[0,-.55,0],attachments:[glove],kind:'arm',side,prefix:'FUNHOUSE_CLOWN',forward:1});
  }
  for(const y of [.8,1.09,1.38])sphere(c,'FUNHOUSE_CLOWN_BUTTON',0,y,.55,.075,yellow);
  box(c,'FUNHOUSE_CLOWN_BOWTIE',0,1.73,.36,.65,.2,.14,clownPlum);sphere(c,'FUNHOUSE_CLOWN_BOW_KNOT',0,1.73,.48,.1,red);
  for(let i=0;i<8;i++){const a=i/8*Math.PI*2;sphere(c,'FUNHOUSE_CLOWN_RUFF',Math.cos(a)*.33,1.68,Math.sin(a)*.26,.12,clownPallor);}
  if(withHat)propellerHat(c,0,2.58,0,.9);
  performers.push(c);return c;
 }
 if(part('funhouse-greeter-avatar'))clown(root,'FUNHOUSE_MIDWAY_GREETER',full?7:0,full?37:0,1.15,red);
 if(assetId==='funhouse-ringmaster-avatar')clown(root,'FUNHOUSE_COSTUME_ASSISTANT',0,0,1.1,blue);
 if(assetId==='funhouse-driver-avatar')clown(root,'FUNHOUSE_BALLOON_CLOWN',0,0,1.05,blue);
 if(assetId==='funhouse-scare-clown-avatar')clown(root,'FUNHOUSE_PLAYROOM_CLOWN',0,0,1.05,red);
 if(assetId==='funhouse-propeller-hat')propellerHat(root,0,0,0);
 if(assetId==='funhouse-clown-shoes'){shoe(root,-.4,0,0,1,red);shoe(root,.4,0,0,1,yellow);}
 if(assetId==='funhouse-water-gun')waterGun(root,0,.47,0);
 if(full)sign(root,'WELCOME, BRAVE GUEST',0,3.6,39,9,1,'WATER GUNS • RIDES • MIRRORS • CLOWN GEAR');
 if(part('funhouse-welcome-board')) {
 // A physical welcome board sits beside, never in, the spawn promenade.
 stripedBox(root,'FUNHOUSE_WELCOME_PODIUM',-8,.72,40,2,1.44,1.1);sign(root,'MAP & ATTRACTIONS',-8,2.5,40.57,4,1,'USE THE LOCAL MAP TO EXPLORE');
 }
 if(part('funhouse-midway-floor'))floorInlay('MIDNIGHT MIDWAY',0,31,9);

 if(part('funhouse-water-gallery')||assetId==='funhouse-clown-target') {
 // The water gallery has real squirt-gun models, clown targets and splash jets.
 const gallery=group(root,'FUNHOUSE_WATER_GALLERY',-30,3);
 galleryRoot=gallery;
 if(part('funhouse-water-gallery')){
 stripedBox(gallery,'FUNHOUSE_GALLERY_COUNTER',0,.6,4.5,17,1.2,1.4);
 box(gallery,'FUNHOUSE_GALLERY_COUNTER_TOP',0,1.25,4.5,17.6,.16,1.7,wood,true);
 box(gallery,'FUNHOUSE_GALLERY_BACKDROP',0,2.4,-.3,19,4.8,.35,blue,true);
 for(const x of [-9.5,9.5]){cylinder(gallery,'FUNHOUSE_GALLERY_POLE',x,3,2,.14,6,red,true);cylinder(gallery,'FUNHOUSE_GALLERY_POLE_RING',x,1.4,2,.2,.28,cream);}
 box(gallery,'FUNHOUSE_GALLERY_CANOPY',0,5.7,1.8,20,.35,8,plum);
 for(let i=0;i<20;i++)box(gallery,'FUNHOUSE_GALLERY_CANOPY_STRIPE',-9.5+i,5.91,1.8,.44,.025,8,i%2?red:cream);
 sign(gallery,'SPLASH THE CLOWNS',0,5.1,5.95,18,1.6,'WATER GUNS • HIT THE MOVING TARGETS','#a0f5f0');
 for(let x=-9;x<=9;x+=.65)bulb(gallery,x,6.08,5.98);

 for(const x of [-5,0,5]){cylinder(gallery,'FUNHOUSE_SQUIRTER_MOUNT',x,1.39,4.5,.14,.35,steel);waterGun(gallery,x,1.63,4.5);}
 }
 for(let i=0;i<6;i++){
  if(assetId==='funhouse-clown-target'&&i!==0)continue;
  const x=-7.5+i*3,target=group(gallery,'FUNHOUSE_SPLASH_TARGET_'+i,x,0,2.1+(i%2)*.65);
  const head=createCreepyClownFace({radius:.68,depth:.34,materials:clownFaceMaterials});head.position.set(0,.45,0);target.add(head);target.userData.creepyClownCharacter=true;
  for(const side of [-1,1])sphere(target,'FUNHOUSE_TARGET_HAIR',side*.58,.6,-.03,.27,clownCrimson);
  const cap=mesh(target,new T.ConeGeometry(.48,.7,12),i%2?blue:yellow,'FUNHOUSE_TARGET_HAT',0,1.3,-.03);sphere(target,'FUNHOUSE_TARGET_HAT_BOBBLE',0,1.7,-.03,.12,lamp);
  cylinder(target,'FUNHOUSE_TARGET_STEM',0,-.6,-.03,.06,1.6,steel);
  const highlight=torus(target,'FUNHOUSE_TARGET_HIGHLIGHT',0,.48,.01,.96,.045,cyan);highlight.visible=false;highlight.userData.dynamicDecoration=true;
  target.userData.baseY=target.position.y;targets.push({id:i,position:{x:-30+x,y:target.position.y+.5,z:3},root:target,highlight,radius:.8});
  action(target,{id:'water-target-'+i,stationId:'funhouse-water-gallery',kind:'water',operation:'squirt',targetId:i,radius:.8,offset:{x:0,y:.45,z:0}});
 }
 if(part('funhouse-water-gallery')){
 const jetMaterial=new T.MeshBasicMaterial({color:'#8ceeff',transparent:true,opacity:.76});
 for(let i=0;i<15;i++){const jet=sphere(gallery,'FUNHOUSE_WATER_JET',0,1.65,4.1,.07,jetMaterial);jet.visible=false;jet.userData.dynamicDecoration=true;bursts.push(jet);}
 stations.set('funhouse-water-gallery',gallery);
 floorInlay('WATER-GUN GALLERY',-30,15,13,'#80e3e5');
 control(gallery,'FUNHOUSE_GALLERY_START_BUTTON',-5,1.3,8.4,'START SPLASH','funhouse-water-gallery','water','start',cyan);
 sign(gallery,'AIM AT THE GLOWING CLOWN',0,3.1,8.7,12,.8,'CLICK / TRIGGER TO SPLASH');
 liveSign('water',gallery,0,4.35,.18,8,.9,'SPLASH THE CLOWNS');
 }

 }
 if(part('funhouse-clown-car')) {
 // A deliberately impossible tiny car: four wheels, steering wheel and horn.
 const court=group(root,'FUNHOUSE_CLOWN_CAR_COURT',28,25);
 cylinder(court,'FUNHOUSE_CAR_DISPLAY_RING',0,.03,0,7,.045,plum,false,48);
 torus(court,'FUNHOUSE_CAR_COURT_RIM',0,.065,0,6.9,.09,yellow,Math.PI/2);
 car=group(court,'FUNHOUSE_TINY_CLOWN_CAR',0,0);
 const chassis=box(car,'FUNHOUSE_CLOWN_CAR_CHASSIS',0,.57,0,2.5,.36,4.2,blue,true);
 const body=box(car,'FUNHOUSE_CLOWN_CAR_BODY',0,1,0,2.45,.7,3.7,red,true);
 box(car,'FUNHOUSE_CLOWN_CAR_HOOD',0,1.37,-1.1,2.3,.35,1.3,yellow);
 box(car,'FUNHOUSE_CLOWN_CAR_TRUNK',0,1.3,1.45,2.3,.4,.65,blue);
 for(const x of [-1.32,1.32])for(const z of [-1.25,1.25]){
  const wheel=cylinder(car,'FUNHOUSE_CLOWN_CAR_WHEEL',x,.55,z,.56,.3,black);wheel.rotation.z=Math.PI/2;
  const hub=cylinder(car,'FUNHOUSE_CLOWN_CAR_HUBCAP',x+(x<0?-.17:.17),.55,z,.3,.04,cream);hub.rotation.z=Math.PI/2;
  const cap=sphere(car,'FUNHOUSE_CLOWN_CAR_HUB',x+(x<0?-.22:.22),.55,z,.13,yellow);cap.scale.x=.3;
 }
 for(const x of [-.68,.68]){box(car,'FUNHOUSE_CLOWN_CAR_SEAT',x,1.42,.55,.92,.28,1,plum);box(car,'FUNHOUSE_CLOWN_CAR_SEAT_BACK',x,1.87,.98,.94,.9,.2,plum);sphere(car,'FUNHOUSE_CLOWN_CAR_HEADLIGHT',x,1,-1.9,.25,lamp);sphere(car,'FUNHOUSE_CLOWN_CAR_TAILLIGHT',x,1,1.92,.15,red);}
 box(car,'FUNHOUSE_CLOWN_CAR_BUMPER',0,.65,-2.08,2.7,.18,.18,steel);
 box(car,'FUNHOUSE_CLOWN_CAR_BUMPER',0,.65,2.08,2.7,.18,.18,steel);
 sphere(car,'FUNHOUSE_CLOWN_CAR_RED_NOSE',0,1.23,-2.01,.33,red);
 for(const x of [-1.08,1.08])cylinder(car,'FUNHOUSE_CLOWN_CAR_WINDSCREEN_POST',x,1.9,-.42,.035,1.1,steel);
 const glass=box(car,'FUNHOUSE_CLOWN_CAR_WINDSCREEN',0,1.96,-.42,2.1,.9,.04,new T.MeshPhysicalMaterial({color:'#98e5e4',transparent:true,opacity:.28,roughness:.1,metalness:0}));
 const steering=torus(car,'FUNHOUSE_CLOWN_CAR_STEERING_WHEEL',-.65,1.82,-.21,.3,.04,steel,.5);cylinder(car,'FUNHOUSE_CLOWN_CAR_STEERING_COLUMN',-.65,1.5,-.25,.04,.65,steel);
 const dashHorn=sphere(car,'FUNHOUSE_CLOWN_CAR_DASH_HORN',-.65,1.75,-.12,.15,red);action(dashHorn,{id:'clown-car-dash-horn',stationId:'funhouse-clown-car',kind:'car',operation:'honk',radius:.24});
 hornCue=torus(car,'FUNHOUSE_CLOWN_CAR_HORN_CUE',-.65,1.75,-.1,.23,.035,cyan);hornCue.visible=false;hornCue.userData.dynamicDecoration=true;
 const horn=cylinder(car,'FUNHOUSE_CLOWN_CAR_HORN',1.17,1.6,-.9,.16,.42,yellow);horn.rotation.z=Math.PI/2;const hornBulb=sphere(car,'FUNHOUSE_CLOWN_CAR_HORN_BULB',.95,1.6,-.9,.19,black);
 action(hornBulb,{id:'clown-car-horn',stationId:'funhouse-clown-car',kind:'car',operation:'honk',radius:.42});
 sign(car,'HONK!',0,.8,-2.19,1.1,.4,'','#251b32');
 propellerHat(car,0,2.12,.65,1.2);
 liveSign('car',car,0,1.57,-.33,1.9,.36,'HONK ON THE CUE');
 for(let i=0;i<5;i++){const p=clown(court,'FUNHOUSE_CAR_SURPRISE_CLOWN_'+i,(i-2)*1.4,-3.8,.72,i%2?blue:plum);p.visible=false;passengers.push(p);}
 sign(root,'IMPOSSIBLE CLOWN CAR',28,4.6,19.1,14,1.5,'HOW MANY CLOWNS FIT INSIDE?');
 control(court,'FUNHOUSE_CAR_BOARD_BUTTON',-4,1.3,2.6,'TAKE A SEAT','funhouse-clown-car','car','ride',yellow);
 rideAnchors.car={stationId:'funhouse-clown-car',kind:'car',root:car,feetOffset:{x:-.65,y:.6,z:.55},eyeHeight:1.15,exit:{x:24,y:.02,z:28}};
 finishVehicleDesign(T,car,'funhouse-clown-car');
 stations.set('funhouse-clown-car',court);

 }
 if(part('funhouse-dizzy-spinner')) {
 // Propeller ride rotates above a flat, accessible court; there is no teleport.
 const spinner=group(root,'FUNHOUSE_DIZZY_HAT_SPINNER',28,-4);
 cylinder(spinner,'FUNHOUSE_SPINNER_FLOOR',0,.035,0,7.3,.05,plum,false,48);
 torus(spinner,'FUNHOUSE_SPINNER_RIM',0,.07,0,7.15,.1,yellow,Math.PI/2);
 for(let i=0;i<24;i++){const a=i/24*Math.PI*2;bulb(spinner,Math.cos(a)*7.1,.15,Math.sin(a)*7.1,i%2?cyan:pink,.12);}
 cylinder(spinner,'FUNHOUSE_SPINNER_CENTRE',0,1.7,0,.45,3.4,red,true);
 spinning=group(spinner,'FUNHOUSE_SPINNER_TURNTABLE',0,0,2.9);
 for(let i=0;i<6;i++){const a=i/6*Math.PI*2,arm=box(spinning,'FUNHOUSE_SPINNER_ARM',Math.cos(a)*2.5,0,Math.sin(a)*2.5,5,.14,.18,i%2?yellow:mint);arm.rotation.y=-a;const cup=group(spinning,'FUNHOUSE_SPINNER_CUP',Math.cos(a)*4.8,Math.sin(a)*4.8,-1.9);cylinder(cup,'FUNHOUSE_SPINNER_CUP_BODY',0,0,0,.7,.8,i%2?red:blue);torus(cup,'FUNHOUSE_SPINNER_CUP_RIM',0,.42,0,.69,.06,yellow,Math.PI/2);sphere(cup,'FUNHOUSE_SPINNER_CUP_SEAT',0,.05,0,.4,plum);if(i===0){rideAnchors.spinner={stationId:'funhouse-spinner',kind:'spinner',root:cup,feetOffset:{x:0,y:-.6,z:0},eyeHeight:1.15,exit:{x:24,y:.02,z:2}};action(cup,{id:'spinner-seat',stationId:'funhouse-spinner',kind:'spinner',operation:'ride',radius:.85,offset:{x:0,y:.15,z:0}});for(let side=0;side<2;side++){const handle=sphere(cup,'FUNHOUSE_SPINNER_BALANCE_HANDLE_'+side,-.5,.55,side?-.42:.42,.13,side?pink:cyan);action(handle,{id:'spinner-balance-'+side,stationId:'funhouse-spinner',kind:'spinner',operation:'balance',targetId:side,radius:.22});const highlight=torus(cup,'FUNHOUSE_SPINNER_BALANCE_CUE',-.49,.55,side?-.42:.42,.21,.035,lamp);highlight.rotation.y=Math.PI/2;highlight.visible=false;highlight.userData.dynamicDecoration=true;balanceControls.push({targetId:side,root:handle,highlight});}}}
 const spinnerHat=propellerHat(spinner,0,3.3,0,4.3);
 sign(root,'DIZZY HAT SPINNER',28,5.2,4,15,1.5,'A LITTLE SPIN • A LOT OF LAUGHTER');
 control(spinner,'FUNHOUSE_SPINNER_BOARD_BUTTON',-4,1.3,5.6,'RIDE SPINNER','funhouse-spinner','spinner','ride',cyan);
 liveSign('spinner',spinner,-4,2.1,5.6,3.8,.62,'TAKE A GENTLE SPIN');
 stations.set('funhouse-spinner',spinner);

 }
 if(part('funhouse-dressing-room')) {
 // Costume stall: mirrors, hat racks, giant shoes, face paint and bow ties.
 const dress=group(root,'FUNHOUSE_CLOWN_DRESSING_ROOM',-28,29);
 stripedBox(dress,'FUNHOUSE_DRESSUP_BACK_WALL',0,2.25,-2.7,17,4.5,.35);
 box(dress,'FUNHOUSE_DRESSUP_FLOOR',0,.035,1.6,18,.05,11,purple);
 for(const x of [-8.5,8.5])cylinder(dress,'FUNHOUSE_DRESSUP_POLE',x,2.6,1,.12,5.2,red,true);
 box(dress,'FUNHOUSE_DRESSUP_CANOPY',0,5.2,1,18,.2,8,plum);
 sign(dress,'CLOWN DRESSING ROOM',0,4.5,5.1,17,1.4,'SPINNER HATS • BIG SHOES • BIGGER SMILES');
 box(dress,'FUNHOUSE_COSTUME_MIRROR_FRAME',0,2.2,-2.42,3.8,3.6,.16,yellow);
 box(dress,'FUNHOUSE_COSTUME_MIRROR',0,2.2,-2.31,3.5,3.3,.06,mirror);
 for(const x of [-5.5,5.5]){box(dress,'FUNHOUSE_COSTUME_DISPLAY_TABLE',x,.9,0,4.5,1.8,2,purple,true);box(dress,'FUNHOUSE_COSTUME_TABLETOP',x,1.86,0,4.8,.12,2.3,yellow);}
 for(let i=0;i<3;i++)propellerHat(dress,-7.1+i*1.65,2,0,.95+i*.12);
 for(const x of [4.6,6.3])shoe(dress,x,1.9,.1,1.4,x<5?red:yellow);
 shoe(dress,-2.6,.06,1.6,2.4,red);shoe(dress,2.6,.06,1.6,2.4,yellow);
 for(let i=0;i<4;i++){const x=-6+i*4;box(dress,'FUNHOUSE_HANGING_BOWTIE',x,3.4,-2.45,1.2,.5,.12,i%2?blue:red);sphere(dress,'FUNHOUSE_BOWTIE_KNOT',x,3.4,-2.27,.18,yellow);}
 dressClown=clown(dress,'FUNHOUSE_COSTUME_ASSISTANT',9.6,1.4,1.1,blue);
 control(dress,'FUNHOUSE_DRESS_HAT_BUTTON',-.85,1.3,4.8,'TRY HAT','funhouse-dressup','dressup','hat',yellow);
 control(dress,'FUNHOUSE_DRESS_SHOES_BUTTON',.85,1.3,4.8,'BIG SHOES','funhouse-dressup','dressup','shoes',pink);
 stations.set('funhouse-dressup',dress);

 }
 if(part('funhouse-ball-pit')) {
 // An open ball pit leaves its play point (10,-21) clear on the floor.
 const pit=group(root,'FUNHOUSE_MONSTER_BALL_PIT',14,-23.5);
 const pitBase=cylinder(pit,'FUNHOUSE_BALL_PIT_BASE',0,.035,0,4.6,.05,plum,false,40);
 torus(pit,'FUNHOUSE_BALL_PIT_SOFT_RIM',0,.4,0,4.45,.35,mint,Math.PI/2);
 for(let i=0;i<110;i++){const a=i*2.399963,r=Math.sqrt((i+.5)/110)*3.9,x=Math.cos(a)*r,z=Math.sin(a)*r;const b=sphere(pit,'FUNHOUSE_BALL_PIT_BALL',x,.23+(i%3)*.12,z,.29,ballMats[i%ballMats.length]);b.userData.baseY=b.position.y;b.userData.dynamicDecoration=true;balloons.push(b);}
 for(const side of [-1,1]){const eye=sphere(pit,'FUNHOUSE_BALL_PIT_MONSTER_EYE',side*1.7,1.4,-4.2,.75,cream);sphere(pit,'FUNHOUSE_BALL_PIT_MONSTER_PUPIL',side*1.7,1.43,-3.5,.31,black);}
 const hoopMaterials=[red,yellow,cyan,plum];
 for(let i=0;i<4;i++){
  const target=group(pit,'FUNHOUSE_BALL_TOSS_TARGET_'+i,[-2.4,-.8,.8,2.4][i],-1.6,[1.1,1.4,1.4,1.1][i]);
  torus(target,'FUNHOUSE_BALL_TOSS_HOOP',0,0,0,.48,.07,hoopMaterials[i]);
  cylinder(target,'FUNHOUSE_BALL_TOSS_POST',0,-.6,0,.04,1.2,yellow);
  const highlight=torus(target,'FUNHOUSE_BALL_TOSS_HIGHLIGHT',0,0,.02,.62,.045,cyan);highlight.visible=false;highlight.userData.dynamicDecoration=true;
  action(target,{id:'ball-toss-'+i,stationId:'funhouse-ball-pit',kind:'ballpit',operation:'toss',targetId:i,radius:.58});
  ballTargets.push({id:i,root:target,highlight});
 }
 const thrown=sphere(pit,'FUNHOUSE_THROWN_CARNIVAL_BALL',-4,1.2,2.5,.2,yellow);thrown.visible=false;thrown.userData.dynamicDecoration=true;tossBalls.push({root:thrown,parent:pit});
 control(pit,'FUNHOUSE_BALL_PIT_START_BUTTON',-4,1.3,2.1,'START TOSS','funhouse-ball-pit','ballpit','start',yellow);
 liveSign('ballpit',pit,0,2.7,-2.9,6,.7,'FOLLOW THE LIT HOOP');
 sign(root,'MONSTER BALL PIT',13,3.4,-18,12,1.1,'START • AIM AT THE LIT HOOP • TOSS');
 stations.set('funhouse-ball-pit',pit);

 }
 if(part('funhouse-jack-box')) {
 // Hand-cranked jack-in-the-boxes use a spring and a hinged lid.

 jackBox(16,-38,0);if(full)jackBox(20,-29,1);
 sign(root,'JACK IN THE FRIGHT BOX',14,4.2,-43.7,15,1.4,'WIND THREE TIMES • CATCH THE CLOWN');
 control(root,'FUNHOUSE_JACK_START_BUTTON',14,1.3,-36.65,'START FRIGHT','funhouse-jack-box','jackbox','start',pink);
 liveSign('jackbox',root,14,2.2,-36.65,3.8,.65,'WIND THE HANDLE');
 stations.set('funhouse-jack-box',jackPops[0].base);

 }
 // Midway food stalls and fairground details give the whole map a lived-in edge.

 if(part('funhouse-popcorn-stall')) {
 const popcorn=stall('FUNHOUSE_POPCORN_STALL',-45,29,red,'MIDNIGHT POPCORN','FRESH POPS & CANDY FLOSS');
 box(popcorn,'FUNHOUSE_POPCORN_MACHINE_BASE',0,2.85,1.3,2.4,.6,1.2,red);const glassMat=new T.MeshPhysicalMaterial({color:'#d8f0e7',transparent:true,opacity:.2,roughness:.08});box(popcorn,'FUNHOUSE_POPCORN_MACHINE_GLASS',0,3.45,1.3,2.3,1.1,1.1,glassMat);box(popcorn,'FUNHOUSE_POPCORN_MACHINE_TOP',0,4.1,1.3,2.6,.22,1.3,red);for(let i=0;i<24;i++)sphere(popcorn,'FUNHOUSE_POPCORN_KERNEL',-.9+(i%6)*.35,3.02+Math.floor(i/6)*.08,1+(i%3)*.22,.12,cream);
 }
 if(part('funhouse-ticket-booth')) {
 const tickets=stall('FUNHOUSE_TICKET_STALL',45,39,plum,'TICKETS & TRICKS','ALL THE FUN OF THE FAIR');
 for(let i=0;i<4;i++)box(tickets,'FUNHOUSE_TICKET_ROLL',-2.1+i*1.4,2.7,1.7,.9,.24,.6,i%2?red:yellow);
 }
 if(part('funhouse-candy-stall')) {
 const candy=stall('FUNHOUSE_CANDY_STALL',45,14,blue,'SWEET NIGHTMARES','CANDY • LOLLIPOPS • LAUGHS');
 for(let i=0;i<5;i++){const x=-2.5+i*1.25;cylinder(candy,'FUNHOUSE_LOLLIPOP_STICK',x,3.15,1.5,.025,1.3,cream);const sweet=sphere(candy,'FUNHOUSE_SWIRL_LOLLIPOP',x,3.85,1.5,.4,i%2?pink:mint);sweet.scale.z=.3;torus(candy,'FUNHOUSE_LOLLIPOP_SWIRL',x,3.85,1.64,.24,.055,cream);}
 }
 if(part('funhouse-circus-tent')) {
 for(const [x,z]of (full?[[-48,9],[47,-9],[-44,-12],[42,-33]]:[[0,0]])){
  const tent=group(root,'FUNHOUSE_CIRCUS_TENT',x,z);cylinder(tent,'FUNHOUSE_TENT_WALL',0,2,0,5,4,purple,true,12);const roof=mesh(tent,new T.ConeGeometry(6.3,5.5,12),red,'FUNHOUSE_TENT_ROOF',0,6.75,0);for(let i=0;i<6;i++){const a=i/6*Math.PI*2;line(tent,'FUNHOUSE_TENT_ROPE',[[Math.cos(a)*5,4,Math.sin(a)*5],[Math.cos(a)*7.2,.05,Math.sin(a)*7.2]],cream);}sphere(tent,'FUNHOUSE_TENT_FINIAL',0,9.65,0,.24,yellow);
 }
 }
 if(part('funhouse-fence')) {
 // Fence frames the map, while a large gate keeps the entry route inviting.
 if(!full){for(const x of [-2,2])cylinder(root,'FUNHOUSE_FENCE_POST',x,1.15,0,.11,2.3,red,true);for(const y of [.7,1.6])box(root,'FUNHOUSE_FENCE_RAIL',0,y,0,4.1,.09,.09,wood);}
 if(full)for(const side of [-1,1])for(let z=-56;z<=56;z+=4){cylinder(root,'FUNHOUSE_FENCE_POST',side*56,1.15,z,.11,2.3,red,true);for(const y of [.7,1.6])box(root,'FUNHOUSE_FENCE_RAIL',side*56,y,z,.09,.09,4.1,wood);}
 if(full)for(const z of [-56,56])for(let x=-56;x<=56;x+=4){if(z>0&&Math.abs(x)<9)continue;cylinder(root,'FUNHOUSE_FENCE_POST',x,1.15,z,.11,2.3,red,true);for(const y of [.7,1.6])box(root,'FUNHOUSE_FENCE_RAIL',x,y,z,4.1,.09,.09,wood);}

 }
 if(part('funhouse-balloon-bunch'))for(const [x,z]of (full?[[-9,46],[9,46],[-39,19],[38,33],[-10,-8],[10,-8],[-37,40],[35,8]]:[[0,0]]))balloonBunch(x,z);

 if(part('funhouse-bunting')){if(full){bunting(-38,39,38,39,7.5);bunting(-38,20,38,20,8);bunting(-38,-6,38,-6,8.2);}else bunting(-6,0,6,0,1.5);}
 if(part('funhouse-lamp')) {
 for(const [x,z]of (full?[[-9,23],[9,23],[-40,40],[39,40],[-9,4],[9,4],[-31,-8],[32,-17]]:[[0,0]])){
  cylinder(root,'FUNHOUSE_LAMP_POST',x,2.8,z,.09,5.6,black,true);cylinder(root,'FUNHOUSE_LAMP_BASE',x,.25,z,.3,.5,yellow,true);cylinder(root,'FUNHOUSE_LAMP_SHADE',x,5.8,z,.42,.35,plum);sphere(root,'FUNHOUSE_LAMP_GLOBE',x,5.45,z,.29,lamp);
 }
 }
 if(part('funhouse-juggler-avatar')) {
 const juggling=clown(root,'FUNHOUSE_JUGGLING_CLOWN',full?13:0,full?19:0,1.05,plum);
 const jugglingBalls=[];for(let i=0;i<3;i++){const ball=sphere(juggling,'FUNHOUSE_JUGGLING_BALL',0,2.6,0,.13,ballMats[i]);ball.userData.dynamicDecoration=true;jugglingBalls.push(ball);}animations.push(t=>jugglingBalls.forEach((b,i)=>{const a=t*1.4+i*Math.PI*2/3;b.position.set(Math.cos(a)*.8,2.3+Math.sin(a)*.65,.3);}));
 }
 if(full)clown(root,'FUNHOUSE_BALLOON_CLOWN',-10,7,1.05,blue);
 if(full)clown(root,'FUNHOUSE_PLAYROOM_CLOWN',19,-17,1.05,red);

 if(full) {
 buildStoryScenery();
 if(!environment.id||funhouseAdventureAvailable(environment)){
  adventureMarker(FUNHOUSE_ADVENTURE_START);
  FUNHOUSE_ADVENTURE_CLUES.forEach(adventureMarker);
  hauntScenery=createFunhouseHauntScenery();root.add(hauntScenery.root);interactionTargets.push(...hauntScenery.targets);
 }
 // Soft theatre light, stable without flashes or a ceiling over the overview.
 root.add(new T.HemisphereLight('#b8afdd','#241328',2.1));
 const fill=new T.DirectionalLight('#ffd5b0',1.8);fill.position.set(-18,30,22);root.add(fill);
 light(0,12,-4,'#e75bad',110,55);light(-30,7,8,'#66ddf1',80,35);light(28,7,-4,'#d46cf4',65,32);light(10,5,-31,'#ff9571',45,26);

 }
 function splashTarget(id){const i=typeof id==='number'?id:Number(String(id).replace(/^clown-/,'')),target=targets[i];if(target){timed.set(target.id,lastTime+1);splashTargetId=i;}splashUntil=lastTime+.65;}
 root.userData.funhouseStations=stations;
 root.userData.funhouseTargets=targets;
 root.userData.funhouseInteractionTargets=interactionTargets;
 root.userData.funhouseRideAnchors=rideAnchors;
 root.userData.funhouseBallTargets=ballTargets;
 root.userData.funhouseAdventureMarkers=adventureMarkers;
 root.userData.funhouseHauntMarkers=hauntScenery?.markers||[];
 root.userData.funhouseHauntScenery=hauntScenery;
 root.userData.funhouseScenery=storyDetails;
 root.userData.splashFunhouseTarget=splashTarget;
 root.userData.animateFunhouseStation=(id,result={})=>{
  if(['adventure','adventure-discovery'].includes(result.kind)&&result.clueId)timed.set('adventure:'+result.clueId,lastTime+3.5);
  else if(id==='funhouse-clown-car')carUntil=lastTime+7;
  else if(id==='funhouse-spinner')spinnerUntil=lastTime+4;
  else if(id==='funhouse-jack-box')jackUntil=lastTime+5;
  else if(id==='funhouse-ball-pit'){ballUntil=lastTime+4;if(result.kind==='toss'){if(ballTargets[result.targetId])tossTargetId=result.targetId;tossUntil=lastTime+.65;tossRay=tossBalls[0]?localRay(tossBalls[0].parent,result,10):null;if(result.hit&&ballTargets[result.targetId])timed.set('ball-'+result.targetId,lastTime+.5);}}
  else if(id==='funhouse-dressup')dressUntil=lastTime+5;
  else if(id==='funhouse-water-gallery'){splashUntil=lastTime+.7;splashRay=galleryRoot?localRay(galleryRoot,result):null;const index=Number(String(result.targetId??result.target??Number.NaN).replace(/^clown-/,''));if(targets[index]){splashTargetId=index;if(result.hit!==false)splashTarget(index);}}
  else if(id==='funhouse-maze-finish')timed.set('bell',lastTime+3);
 };
 function sceneOwner(){for(let node=root;node;node=node.parent)if(node.userData?.builderObjectId)return String(node.userData.builderObjectId);return null;}
 function localActivity(value){return value&&(value.objectId||null)===sceneOwner();}
 function stateFrames(){const value=experienceState.funhouse||experienceState;return [value,...Object.values(experienceState.players||{}).map(player=>player.funhouse).filter(Boolean)];}
 function activity(kind,field){const values=stateFrames().map(value=>value?.[field]).filter(value=>value&&value.kind===kind&&localActivity(value));return values.find(value=>value.status==='active')||values[0]||null;}
 function serverClock(explicit){if(Number.isFinite(explicit))return explicit;const now=typeof performance==='undefined'?Date.now():performance.now();return experienceTime+(now-experienceReceivedAt);}
 root.userData.setFunhouseState=(state={},serverTime=Date.now())=>{
  experienceState=state||{};experienceTime=Number.isFinite(serverTime)?serverTime:Date.now();experienceReceivedAt=typeof performance==='undefined'?Date.now():performance.now();
  const round=stateFrames().map(value=>value.round).find(value=>value?.status==='active'&&localActivity(value));
  activeTarget=round?.status==='active'&&localActivity(round)&&Number.isInteger(round.targetId)?round.targetId:-1;
  const challenge=activity('ballpit','challenge');ballTarget=challenge?.status==='active'&&Number.isInteger(challenge.targetId)?challenge.targetId:-1;
  for(const frame of stateFrames())for(const [id,effect]of Object.entries(frame.effects||{}))if(effect?.at&&localActivity(effect)&&seenEffects.get(id)!==effect.at){seenEffects.set(id,effect.at);if(Number(effect.until)>experienceTime)root.userData.animateFunhouseStation(effect.canonicalStationId||id,effect);}
  while(seenEffects.size>256)seenEffects.delete(seenEffects.keys().next().value);
 };
 root.userData.updateFunhouseEffects=(elapsed,reducedMotion=false,serverTime,motion={})=>{
  const time=Number.isFinite(elapsed)?elapsed:0;lastTime=time;const now=serverClock(serverTime);
  const projectRide=ride=>ride?{...ride,...funhouseRideCue(ride,now)}:null;
  const carRide=projectRide(activity('car','ride')),spinnerRide=projectRide(activity('spinner','ride')),jackGame=activity('jackbox','challenge'),ballGame=activity('ballpit','challenge');
  const ridingCar=carRide?.status==='active'&&now<carRide.endsAt,ridingSpinner=spinnerRide?.status==='active'&&now<spinnerRide.endsAt;
  if(!reducedMotion)for(const animate of animations)animate(time);
  const adventures=stateFrames().map(value=>value.adventure).filter(Boolean),adventure=experienceState.funhouse?experienceState.funhouse.adventure:adventures.find(value=>value.status==='active')||adventures[0];
  const haunts=stateFrames().map(value=>value.haunt).filter(Boolean),haunt=experienceState.funhouse?experienceState.funhouse.haunt:haunts.find(value=>value.status==='active')||haunts[0];
  hauntScenery?.update(haunt,time,reducedMotion,now);
  for(const marker of adventureMarkers){
   const found=marker.clueId&&adventure?.found?.includes(marker.clueId),next=marker.index<0?adventure?.status!=='active':adventure?.status==='active'&&marker.index===adventure.clueIndex;
   marker.highlight.visible=Boolean(next);marker.seal.visible=Boolean(found);
   marker.token.position.y=marker.baseY+(reducedMotion?0:Math.sin(time*.85+Math.max(0,marker.index))*.055);
   marker.gem.rotation.y=reducedMotion?0:time*.3;
   marker.highlight.scale.setScalar(next&&!reducedMotion?1+Math.sin(time*1.4)*.045:1);
  }
  for(const rig of adventureRigs){
   const active=(timed.get('adventure:'+rig.id)||-1)>time,pulse=active&&!reducedMotion?Math.sin(time*4):0;
   if(rig.kind==='ticket')rig.node.rotation.z=-.14+pulse*.12;
   else if(rig.kind==='door')rig.node.rotation.y=active?-.65+pulse*.035:0;
   else if(rig.kind==='mask')rig.node.position.y=rig.baseY+(active ? .16 : 0)+pulse*.035;
   else if(rig.kind==='shadow')rig.node.rotation.z=active ? .3+pulse*.025 : 0;
   else if(rig.kind==='lid')rig.node.rotation.x=active?-.8+pulse*.035:0;
   else if(rig.kind==='lantern')rig.node.rotation.z=pulse*.07;
  }
  for(let i=0;i<performers.length;i++){
   const c=performers[i];c.rotation.z=reducedMotion?0:Math.sin(time*1.25+i)*.025;
   // The cached rig updates both sides without repeatedly searching the scene.
   updateArticulatedCharacter(c,time+i*.37,{...motion,gesture:motion.gesture||'idle',reducedMotion});
  }
  for(const [i,target]of targets.entries()){
   const hit=(timed.get(target.id)||-1)>time;
   target.highlight.visible=target.id===(activeTarget>=0?activeTarget:Math.floor(time*.7)%targets.length);
   target.root.rotation.z=hit?-.45:0;
   target.root.position.y=target.root.userData.baseY+(hit?-.7:reducedMotion?0:Math.sin(time*.9+i*.8)*.2);
  }
  // The platform is the physical seat frame. Its server phase stays exact even
  // when a rider chooses a fixed-heading comfort view; decorative motion stops.
  if(spinning)spinning.rotation.y=ridingSpinner?Math.max(0,now-spinnerRide.startedAt)/1000*.4:reducedMotion?0:time*((spinnerUntil>time)?1.15:.08);
  const carShow=carUntil>time||ridingCar;
  // Keep the occupied cockpit in the same metre frame as its authoritative
  // seat. The passengers provide the ride's comic motion around the rider.
  if(car)car.rotation.z=reducedMotion||ridingCar?0:carShow?Math.sin(time*8)*.045:0;
  if(car)car.position.y=carShow&&!ridingCar&&!reducedMotion?Math.abs(Math.sin(time*4))*.15:0;
  passengers.forEach((p,i)=>{p.visible=carShow;p.position.y=!reducedMotion&&carShow?Math.abs(Math.sin(time*2+i))*.2:0;});
  if(hornCue)hornCue.visible=Boolean(ridingCar&&now>=carRide.nextCueAt&&now<=carRide.cueUntil&&carRide.lastCueHit!==carRide.cueIndex);
  for(const button of balanceControls)button.highlight.visible=Boolean(ridingSpinner&&button.targetId===spinnerRide.targetId&&spinnerRide.lastCueHit!==spinnerRide.cueIndex);
  const jackReady=jackGame?.status==='active'&&jackGame.phase==='ready'&&now>=jackGame.readyAt&&now<=jackGame.catchUntil;
  const caught=jackGame?.status==='complete'&&jackGame.hits>0&&now-(jackGame.finishedAt||0)<1500;
  for(const pop of jackPops){const active=jackGame?jackReady||caught:jackUntil>time;pop.lid.rotation.x=active?-1.45:0;pop.surprise.visible=pop.spring.visible=active;pop.surprise.position.y=3+(active&&!reducedMotion?Math.sin(time*6)*.2:0);pop.crank.rotation.z=-Number(jackGame?.windCount||0)*Math.PI*2/3;}
  for(const [i,b]of balloons.entries())b.position.y=b.userData.baseY+(ballUntil>time&&!reducedMotion?Math.abs(Math.sin(time*4+i))*.65:0);
  for(const target of ballTargets)target.highlight.visible=target.id===ballTarget||(timed.get('ball-'+target.id)||-1)>time;
  for(const thrown of tossBalls){const active=tossUntil>time;thrown.root.visible=active;if(active){const f=1-(tossUntil-time)/.65,target=ballTargets[tossTargetId];if(tossRay){thrown.root.position.lerpVectors(tossRay.origin,tossRay.end,f);thrown.root.position.y+=Math.sin(f*Math.PI)*.35;}else if(target){const point=target.root.position;thrown.root.position.set(-4+(point.x+4)*f,1.2+(point.y-1.2)*f+Math.sin(f*Math.PI)*1.2,2.5+(point.z-2.5)*f);}}}
  for(let i=0;i<bursts.length;i++){const drop=bursts[i],active=splashUntil>time;drop.visible=active;if(active){const f=(time*2.6+i/bursts.length)%1,target=targets[splashTargetId]||targets[0];if(splashRay){drop.position.lerpVectors(splashRay.origin,splashRay.end,f);drop.position.x+=Math.sin(i)*.025;drop.position.y-=f*f*.15;}else drop.position.set((target.position.x+30)*f+Math.sin(i)*.05,1.65+(target.position.y-1.65)*f+Math.sin(f*Math.PI)*.35,4.1*(1-f));}}
  if(bell)bell.rotation.z=(timed.get('bell')||-1)>time&&!reducedMotion?Math.sin(time*7)*.055:0;
  if(dressClown)dressClown.rotation.y=dressUntil>time&&!reducedMotion?time*.8:0;
  const round=stateFrames().map(value=>value.round).find(value=>value?.status==='active'&&localActivity(value));
  updateLiveSign('water',round?'SCORE '+round.score+' · '+Math.max(0,Math.ceil((round.endsAt-now)/1000))+'s':'SPLASH THE CLOWNS',round?'AIM AT THE GLOWING TARGET':'START · AIM · CLICK / TRIGGER');
  updateLiveSign('car',ridingCar?hornCue?.visible?'HONK NOW!':'WAIT FOR THE LIGHT':'TAKE A SEAT',ridingCar?'SCORE '+carRide.score:'AIM + USE / TRIGGER');
  updateLiveSign('spinner',ridingSpinner?'BALANCE '+(spinnerRide.targetId===0?'LEFT':'RIGHT'):'TAKE A GENTLE SPIN',ridingSpinner?'SCORE '+spinnerRide.score:'AIM + USE / TRIGGER');
  updateLiveSign('ballpit',ballGame?.status==='active'?'SCORE '+ballGame.score+' · '+Math.max(0,Math.ceil((ballGame.endsAt-now)/1000))+'s':'FOLLOW THE LIT HOOP','START · AIM · TOSS');
  updateLiveSign('jackbox',jackReady?'CATCH THE CLOWN!':jackGame?.status==='active'?'WIND '+jackGame.windCount+' / 3':'WIND THE HANDLE',jackGame?.phase==='ready'&&!jackReady?'WAIT FOR THE POP':'AIM + USE / TRIGGER');
 };
 // Existing ivory teeth share the hat's paint material; neutral vertex colors
 // retain their original finish without allocating another material variant.
 if(propellerPaint)root.traverse(node=>{if(node.isMesh&&node.material===propellerPaint&&!node.geometry.getAttribute('color'))node.geometry.setAttribute('color',new T.Uint8BufferAttribute(new Uint8Array(node.geometry.attributes.position.count*3).fill(255),3,true));});
 // Flatten only the newly authored static set dressing. Transforming parts
 // into each area's local frame retains its appearance while keeping all
 // animated doors, tokens, puppets and physical attraction meshes separate.
 for(const rig of adventureRigs)rig.node.userData.dynamicDecoration=true;
 root.updateWorldMatrix(true,true);
 for(const area of storyDetails){
  const parent=area.root,inverse=parent.matrixWorld.clone().invert(),batches=new Map();
  parent.traverse(node=>{
   if(!node.isMesh||node.isSkinnedMesh||node.userData.collisionDisabled!==true||node.userData.dynamicDecoration||!node.visible||Array.isArray(node.material)||node.material.transparent)return;
   for(let ancestor=node.parent;ancestor&&ancestor!==parent;ancestor=ancestor.parent)if(ancestor.userData.dynamicDecoration)return;
   const nodes=batches.get(node.material)||[];nodes.push(node);batches.set(node.material,nodes);
  });
  for(const [mat,nodes]of batches){
   if(nodes.length<2)continue;
   const parts=nodes.map(node=>node.geometry.clone().applyMatrix4(new T.Matrix4().multiplyMatrices(inverse,node.matrixWorld))),geometry=mergeGeometries(parts);
   for(const part of parts)part.dispose();if(!geometry)continue;
   const batch=new T.Mesh(geometry,mat);batch.name='FUNHOUSE_BATCHED_STORY_SCENERY';batch.userData.collisionDisabled=true;batch.receiveShadow=true;parent.add(batch);
   for(const node of nodes){node.removeFromParent();node.geometry.dispose();}
  }
 }
 // Batch static sibling decorations by material. Animated groups keep their
 // own coordinate system, and physical meshes remain individually queryable.
 const groups=[];root.traverse(node=>{if(node.isGroup)groups.push(node);});
 for(const parent of groups){const batches=new Map();for(const node of parent.children){if(!node.isMesh||node.isSkinnedMesh||!node.userData.collisionDisabled||node.userData.dynamicDecoration||!node.visible||Array.isArray(node.material)||node.material.transparent)continue;const parts=batches.get(node.material)||[];parts.push(node);batches.set(node.material,parts);}for(const [mat,nodes]of batches){if(nodes.length<2)continue;const parts=nodes.map(node=>{node.updateMatrix();return node.geometry.clone().applyMatrix4(node.matrix);}),geometry=mergeGeometries(parts);for(const part of parts)part.dispose();if(!geometry)continue;const batch=new T.Mesh(geometry,mat);batch.name='FUNHOUSE_BATCHED_DECORATION';batch.userData.collisionDisabled=true;batch.receiveShadow=true;parent.add(batch);for(const node of nodes){node.removeFromParent();node.geometry.dispose();}}}
 for(const performer of performers)finalizeArticulatedCharacter(performer);
 root.userData.updateFunhouseEffects(0);
 return root;
}
