import * as T from '../vendor/three/three.module.min.js';
import {PROVING_COUNTDOWN_MS,PROVING_FLIGHT_MS,testingStations,testingTargets} from './factory-test-config.js';
import {createFactoryModel} from './missile-factory-model.js';
export {createMountainCompoundLand} from './mountain-compound-model.js';

/** A common physical scene is used by the client, previews and server collision. */
export function createFactoryProvingGroundsLand(environment={}){
 const root=new T.Group(),materials=new Map(),cube=new T.BoxGeometry(1,1,1),round=new T.CylinderGeometry(1,1,1,16),animations=[];
 root.name='ATLAS_FACTORY_PROVING_GROUNDS';root.userData={proceduralLand:true,layout:'factory-proving-grounds',streetHeightAt:()=>0};
 const palette={floor:'#526162',dark:'#152b35',steel:'#8ca8ae',orange:'#ef8b45',yellow:'#e4cd78',white:'#dce9e6',teal:'#5dd9cb',rock:'#626d69',road:'#3c5057'};
 const mat=(name,glow=false)=>{const key=name+':'+glow;if(!materials.has(key))materials.set(key,new T.MeshStandardMaterial({color:palette[name]||name,roughness:name==='steel'?.35:.85,metalness:name==='steel'?.65:.12,emissive:glow?(palette[name]||name):0,emissiveIntensity:glow?.6:0}));return materials.get(key);};
 const mesh=(name,geometry,material,x,y,z,solid=true)=>{const node=new T.Mesh(geometry,typeof material==='string'?mat(material):material);node.name='PROVING_'+name;node.position.set(x,y,z);node.castShadow=solid;node.receiveShadow=true;if(!solid)node.userData.collisionDisabled=true;root.add(node);return node;};
 const box=(name,x,y,z,w,h,d,color='dark',solid=true)=>{const node=mesh(name,cube,color,x,y,z,solid);node.scale.set(w,h,d);return node;};
 const cylinder=(name,x,y,z,r,h,color='steel',solid=true)=>{const node=mesh(name,round,color,x,y,z,solid);node.scale.set(r,h,r);return node;};
 function sign(text,x,y,z,w,h,sub='',rotation=0){
  let texture=null;if(typeof document!=='undefined'){const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;const ctx=canvas.getContext('2d');if(ctx){ctx.fillStyle='#102a34';ctx.fillRect(0,0,1024,256);ctx.fillStyle='#efb583';ctx.textAlign='center';ctx.font='700 '+(text.length>24?47:62)+'px system-ui';ctx.fillText(text,512,sub?114:154,980);if(sub){ctx.fillStyle='#b5d6d5';ctx.font='500 27px system-ui';ctx.fillText(sub,512,185,990);}texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;}}
  const node=mesh('SIGN_'+text,new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({color:texture?'#ffffff':'#efb583',map:texture,side:T.DoubleSide}),x,y,z,false);node.rotation.y=rotation;return node;
 }
 function illustratedPanel(path,x,y,z,w,h){let texture=null;if(typeof document!=='undefined'){texture=new T.TextureLoader().load(path);texture.colorSpace=T.SRGBColorSpace;}return mesh('SVG_TELEMETRY_PANEL',new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:texture,color:texture?'#ffffff':'#5dd9cb',side:T.DoubleSide}),x,y,z,false);}
 box('WALKABLE_FLOOR',0,-.15,0,220,.3,220,'floor').userData.walkableFloor=true;
 box('WEST_ARRIVAL_ROUTE',-57,.012,35,50,.024,12,'road',false);box('PREPARATION_APRON',-42,.012,35,27,.024,25,'road',false);
 box('PAD_SERVICE_ROUTE',0,.012,32,14,.024,85,'road',false);box('MOUNTAIN_APPROACH',28,.012,35,52,.024,10,'road',false);
 for(const x of [-7.2,7.2])box('SERVICE_EDGE',x,.04,30,.1,.02,82,'yellow',false);
 for(let z=-6;z<70;z+=10)box('LANE_CENTER',0,.04,z,.15,.02,4,'white',false);
 // Observation berms frame both targets while the central course stays clear.
 for(const [x,z,r,h]of [[-38,-73,16,7],[68,-73,20,9],[-20,-96,21,10],[18,-102,22,12],[56,-98,18,8]]){const mound=mesh('RANGE_BERM',new T.ConeGeometry(r,h,9),mat('rock'),x,h/2,z);mound.rotation.y=x*.07;}
 for(const x of [-13,13])for(let z=-31;z>=-78;z-=11){box('COURSE_LIGHT_POLE',x,.75,z,.1,1.5,.1,'steel');cylinder('COURSE_LIGHT',x,1.55,z,.16,.15,mat('teal',true),false);}
 // Reinforced control bunker has an open south doorway and an exposed roofline
 // so its console is reachable in first-person and readable from above.
 box('BUNKER_BACK',-24,2.4,7,25,4.8,.7);for(const x of [-36.5,-11.5])box('BUNKER_SIDE',x,2.4,16,.7,4.8,18,'dark');
 for(const x of [-32,-16])box('BUNKER_FRONT',x,2.4,25,9,4.8,.7,'dark');box('BUNKER_LINTEL',-24,4.45,25,7,.7,.8,'steel');
 for(const x of [-36,-12])box('BUNKER_ROOFLINE',x,4.9,16,.3,.3,18,'steel',false);box('BUNKER_REAR_RAFTER',-24,4.9,7,25,.3,.4,'steel',false);
 for(const x of [-32,-16]){box('BUNKER_OBSERVATION_GLASS',x,2.8,7.4,6,1.5,.06,'#75a9b6',false);box('BUNKER_SCREEN_FRAME',x,2.3,8,5,2.2,.15,'steel');}
 illustratedPanel('/public/images/factory/proving-range-panel.svg',-32,2.3,8.1,4.7,2);illustratedPanel('/public/images/factory/proving-range-panel.svg',-16,2.3,8.1,4.7,2);
 sign('LAUNCH CONTROL',-24,5.5,25.5,21,2,'ARM THE TEST  /  WATCH SHARED TELEMETRY');
 sign('ATLAS / PROVING GROUNDS',-43,6,52,38,4,'CRAFT  ·  DEPLOY  ·  TEST  ·  UNLOCK');
 sign('FACTORY WEST GATE',-76,4.5,43,25,2.4,'RETURN TO THE NEIGHBORING FACTORY');
 sign('TRAINING COURSE',0,5.5,-33,22,2,'SCRIPTED PRACTICE FLIGHT');
 sign('CARGO TOUCHDOWN',35,4.5,-48,22,2,'MARKED LANDING APRON');
 // Angular mountain shells leave an open forecourt in front of the locked
 // hatch. The only entrance is its authenticated command console.
 for(const [x,z,r,h]of [[85,7,21,29],[87,40,23,35],[62,60,19,24],[58,-1,16,22],[102,67,17,27]]){const rock=mesh('MOUNTAIN_RIDGE',new T.ConeGeometry(r,h,7),mat('rock'),x,h/2,z);rock.rotation.y=x*.11;}
 for(const x of [42,58])box('MOUNTAIN_HATCH_PILLAR',x,4.5,17,1.2,9,2,'steel');box('MOUNTAIN_HATCH_LINTEL',50,8.6,17,17,1,2,'dark');
 box('LOCKED_MOUNTAIN_HATCH',50,3.8,17,14,7.6,.65,'dark');for(const x of [44,56])box('HATCH_LOCK_STRIP',x,3.8,17.38,.14,7,.08,mat('orange',true),false);
 illustratedPanel('/public/images/factory/mountain-compound.svg',50,4.1,17.4,10,5);sign('MOUNTAIN ACCESS / LOCKED',50,10,18,29,2.5,'EARN FACTORY TEST CLEARANCE AT THIS CONSOLE');
 for(const z of [-108,108])box('BOUNDARY_FENCE',0,1.2,z,210,2.4,.15,'steel');
 box('EAST_BOUNDARY',108,1.2,0,.15,2.4,216,'steel');for(const [z,depth]of [[-39,138],[77,62]])box('WEST_BOUNDARY',-108,1.2,z,.15,2.4,depth,'steel');
 for(const [x,z]of [[-90,70],[-50,-45],[43,70],[95,-47]]){cylinder('YARD_LIGHT',x,5,z,.12,10);box('FLOODLIGHT',x,9.8,z,2,.4,.6,mat('white',true),false);}
 // Cosmetic flight objects never enter collision or alter the server result.
 const flightRoot=new T.Group();flightRoot.name='PROVING_SHARED_FLIGHT';flightRoot.userData.collisionDisabled=true;root.add(flightRoot);
 const vehicles=new Map();for(const id of ['factory-training-missile','factory-cargo-rocket']){const model=createFactoryModel(id);for(const part of [...model.children])if(/CRADLE/.test(part.name))model.remove(part);model.visible=false;model.scale.setScalar(.55);flightRoot.add(model);vehicles.set(id,model);}
 const flameMaterial=new T.MeshBasicMaterial({color:'#ffb962',transparent:true,opacity:.85,depthWrite:false}),exhaust=new T.Mesh(new T.ConeGeometry(.4,3,12),flameMaterial);exhaust.name='PROVING_EXHAUST';exhaust.rotation.x=Math.PI/2;exhaust.position.z=3.8;flightRoot.add(exhaust);
 const pulse=mesh('TARGET_RESULT_PULSE',new T.TorusGeometry(1,.08,6,48),new T.MeshBasicMaterial({color:'#78e6cf',transparent:true,opacity:.8,depthWrite:false}),0,.15,-70,false);pulse.rotation.x=Math.PI/2;pulse.visible=false;
 const touchdown=mesh('CARGO_TOUCHDOWN_PULSE',new T.TorusGeometry(1,.08,6,48),new T.MeshBasicMaterial({color:'#e5c97a',transparent:true,opacity:.8,depthWrite:false}),35,.15,-60,false);touchdown.rotation.x=Math.PI/2;touchdown.visible=false;
 let state=null,serverTime=Date.now(),receivedAt=Date.now();
 root.userData.setTestingState=(value,at=Date.now())=>{state=value?.testing||value;serverTime=Number(at)||Date.now();receivedAt=Date.now();};
 root.userData.updateTestingEffects=(elapsed,reducedMotion=false,at=null)=>{
  const now=Number.isFinite(at)?at:serverTime+Date.now()-receivedAt,t=reducedMotion?0:Number(elapsed)||0;for(const animate of animations)animate(t);
  const active=(state?.sessions||[]).map(row=>row.session||row).find(session=>['deployed','armed','countdown','flight','impact'].includes(session.status)||session.launchAt&&now>=session.launchAt-PROVING_COUNTDOWN_MS&&now<=Number(session.endsAt||session.flightEndsAt+2000));
  flightRoot.visible=Boolean(active);pulse.visible=false;touchdown.visible=false;if(!active)return;
  const stations=state?.stations||testingStations(environment),targets=state?.targets||testingTargets(environment),pad=stations.find(station=>station.id===active.padId)||stations.find(station=>station.kind==='pad'),target=targets.find(value=>value.id===active.targetId)||targets.find(value=>value.profileId===active.profileId)||targets[0];
  if(!pad||!target){flightRoot.visible=false;return;}for(const [id,model]of vehicles)model.visible=id===active.buildAssetId;
  const start=pad.position,end=active.impactPosition||target.position,flightStart=Number(active.launchAt)||Infinity,flightEnd=Number(active.flightEndsAt)||flightStart+PROVING_FLIGHT_MS,phase=Math.max(0,Math.min(1,(now-flightStart)/Math.max(1,flightEnd-flightStart))),airborne=now>=flightStart&&now<flightEnd;
  const x=start.x+(end.x-start.x)*phase,z=start.z+(end.z-start.z)*phase,height=airborne?2+Math.sin(phase*Math.PI)*(active.profileId==='cargo'?25:34):.25,dx=end.x-start.x,dz=end.z-start.z,dy=Math.cos(phase*Math.PI)*Math.PI*(active.profileId==='cargo'?25:34);
  flightRoot.position.set(x,height,z);flightRoot.rotation.set(airborne?Math.atan2(dy,Math.hypot(dx,dz)):0,Math.atan2(-dx,-dz),0);exhaust.visible=airborne;exhaust.scale.y=reducedMotion?1:.9+Math.sin(t*31)*.15;
  if(now>=flightEnd){flightRoot.visible=active.profileId==='cargo';flightRoot.position.set(end.x,.25,end.z);flightRoot.rotation.x=0;const effect=active.profileId==='cargo'?touchdown:pulse,age=(now-flightEnd)/1000;effect.visible=age<2;effect.position.set(end.x,.15,end.z);effect.scale.setScalar(1+age*4);effect.material.opacity=Math.max(0,.8-age*.4);}
 };
 root.userData.setFactoryTestingState=root.userData.setTestingState;root.userData.updateFactoryTestingEffects=root.userData.updateTestingEffects;root.userData.updateTestingEffects(0);return root;
}
