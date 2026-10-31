import * as DefaultThree from '../vendor/three/three.module.min.js';
import {forgeStations,isForgeEnvironment} from './forge-config.js?v=forge-atelier-20261031';

const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const finite=value=>Number.isFinite(Number(value))?Number(value):0;
const gap=(a,b)=>a&&b?Math.hypot(a.x-b.x,(a.y||0)-(b.y||0),a.z-b.z):Infinity;
const stages=new Set(['sourcing','heat','hammer','quench','temper','finish']);
const currentJob=job=>job&&(!job.status||job.status!=='collected');
const lastStage=(job,kind)=>(job.completedStages||[]).filter(value=>value.stage===kind).at(-1)?.at||0;
const activityRank=activity=>finite(activity.lastStrikeAt||activity.phaseAt||activity.cycleStartedAt||activity.startedAt);

/** Derive presentation from accepted jobs and AI routines. This function cannot
 * advance a work order, consume materials, grant ownership or complete freight. */
export function forgeVisualActivities(snapshot={},environment={}){
 const now=finite(snapshot.serverTime),stations=forgeStations(environment||{}).filter(station=>{
  const actor=snapshot.actors?.[station.objectId||station.id];return !actor||actor.active!==false&&actor.health!==0;
 }),result=new Map(),counts={activeJobs:0,demonstrations:0};
 const choose=(kind,player,job,explicit)=>stations.filter(station=>station.kind===kind&&(!explicit||station.id===explicit)).sort((a,b)=>gap(player?.position,a.approach)-gap(player?.position,b.approach)||a.id.localeCompare(b.id))[0];
 const offer=(station,activity)=>{if(!station)return;const previous=result.get(station.id);if(!previous||previous.demonstration&&!activity.demonstration||previous.demonstration===activity.demonstration&&activityRank(activity)>activityRank(previous))result.set(station.id,{...activity,stationId:station.id,kind:station.kind});};
 for(const [playerId,player]of Object.entries(snapshot.players||{})){
  const job=player.forge?.job;if(!job||job.environmentId&&job.environmentId!==environment?.id)continue;
  if(currentJob(job)){
   counts.activeJobs++;
   const station=choose(job.stage,player,job,job.status==='processing'?job.stationId:null);
   offer(station,{...job,jobId:job.id,playerId,demonstration:false,phaseAt:job.cycleStartedAt||job.lastStrikeAt||job.startedAt});
   if(now-finite(job.startedAt)<2400)offer(choose('sourcing',player,job),{...job,stage:'sourcing',jobId:job.id,playerId,status:'selected',phaseAt:job.startedAt,demonstration:false});
  }else if(now-finite(job.collectedAt)<15000){
   offer(choose('finish',player,job),{...job,stage:'finish',jobId:job.id,playerId,phaseAt:job.collectedAt,demonstration:false});
  }
  if(job.stage!=='hammer'&&job.lastStrikeAt&&now-job.lastStrikeAt<700)offer(choose('hammer',player,job),{...job,stage:'hammer',jobId:job.id,playerId,status:'struck',phaseAt:job.lastStrikeAt,demonstration:false});
  const quenchedAt=lastStage(job,'quench');
  if(quenchedAt&&now-quenchedAt<2200)offer(choose('quench',player,job),{...job,stage:'quench',jobId:job.id,playerId,status:'cooling',phaseAt:quenchedAt,demonstration:false});
 }
 for(const [actorId,actor]of Object.entries(snapshot.actors||{})){
  const work=actor.resident?.forgeActivity;if(actor.active===false||work?.phase!=='working'||!stages.has(work.kind))continue;
  const station=stations.find(station=>station.id===work.stationId&&station.kind===work.kind);if(!station||result.has(station.id))continue;
  const cycle=Math.max(1500,finite(work.cycleMs)||6000),elapsed=Math.max(0,now-finite(work.startedAt));
  offer(station,{stage:work.kind,status:'demonstrating',jobId:null,playerId:actorId,demonstration:true,startedAt:work.startedAt,phaseAt:work.startedAt,cycleStartedAt:work.startedAt,readyAt:finite(work.startedAt)+cycle,cycleMs:cycle,lastStrikeAt:work.kind==='hammer'?now-(elapsed%950):null,strikes:0,requiredStrikes:1});counts.demonstrations++;
 }
 return {stations:[...result.values()],...counts};
}

const fallbackNames={workpiece:['FORGE_SOURCE_WORKPIECE','FORGE_HEARTH_WORKPIECE','FORGE_ANVIL_WORKPIECE','FORGE_QUENCH_WORKPIECE','FORGE_TEMPER_WORKPIECE','FORGE_FINISH_WORKPIECE'],flame:['FORGE_HEARTH_FLAME'],hammer:['FORGE_ANVIL_HAMMER'],bellows:['FORGE_BELLOWS_MOVING_BOARD'],water:['FORGE_QUENCH_WATER'],gauge:['FORGE_OVEN_DIAL_NEEDLE'],finishWheel:['FORGE_FINISH_WHEEL'],grindWheel:['FORGE_TREADLE_GRINDSTONE'],leftArm:['FORGE_SMITH_ARM_LEFT'],rightArm:['FORGE_SMITH_ARM_RIGHT'],leftLeg:['FORGE_SMITH_LEG_LEFT'],rightLeg:['FORGE_SMITH_LEG_RIGHT']};
const array=value=>Array.isArray(value)?value:value?.children||[];

/** All transient meshes are presentation-only children. They are bounded and
 * removed before a world unload, preserving native model collision and size. */
export function createForgeSceneActivity({THREE: T=DefaultThree,getRoots=()=>[],getEnvironment=()=>null,getReducedMotion=()=>false,createItem=null}={}){
 let environment=null,snapshot=null,serverAt=0,receivedAt=0,lastElapsed=0,enabled=false,disposed=false,rootSignature=[],visual={stations:[],activeJobs:0,demonstrations:0},supply={warehouse:{},lots:[],shipments:[]};
 const entries=new Map(),materials=new Map(),cargo=new Map();
 const monotonic=()=>globalThis.performance?.now?.()??Date.now();
 const serverNow=()=>serverAt+Math.max(0,monotonic()-receivedAt);
 const roots=()=>array(getRoots()).filter(root=>root?.isObject3D);
 function restorePose(node,pose){node.position.copy(pose.position);node.rotation.copy(pose.rotation);node.scale.copy(pose.scale);node.visible=pose.visible;}
 function capture(node){return {position:node.position.clone(),rotation:node.rotation.clone(),scale:node.scale.clone(),visible:node.visible};}
 function bind(wrapper){
  let model=wrapper.userData.forgeModel?wrapper:null;if(!model)wrapper.traverse(node=>{if(!model&&node.userData.forgeModel)model=node;});
  if(!model)return null;
  const rigs={},poses=new Map();
  for(const [key,names]of Object.entries(fallbackNames)){const name=model.userData.forgeRig?.[key],node=(name&&model.getObjectByName(name))||names.map(value=>model.getObjectByName(value)).find(Boolean);if(node){rigs[key]=node;poses.set(node,capture(node));}}
  const entry={wrapper,model,id:wrapper.userData.builderObjectId||model.userData.builderObjectId,modelId:model.userData.modelId,rigs,poses,effects:null,product:null,productId:null,activity:null};
  entries.set(wrapper,entry);return entry;
 }
 function disposeMeshes(root){if(!root)return;root.traverse(node=>{node.geometry?.dispose();for(const material of [].concat(node.material||[]))material.dispose?.();});root.removeFromParent();}
 function clearEntry(entry){
  for(const [node,pose]of entry.poses)restorePose(node,pose);
  entry.model.userData.forgeWorking=false;delete entry.model.userData.forgeActivity;
  entry.model.traverse(node=>{const record=materials.get(node);if(!record)return;if(node.material===record.copies[0]||Array.isArray(node.material)&&node.material.every((value,index)=>value===record.copies[index]))node.material=record.original;for(const material of record.copies)material.dispose();materials.delete(node);});
  disposeMeshes(entry.effects?.root);disposeMeshes(entry.product);entry.product=null;
 }
 function syncRoots(){
  const next=roots();if(next.length===rootSignature.length&&next.every((value,index)=>value===rootSignature[index]))return;
  rootSignature=next;
  for(const [wrapper,entry]of entries)if(!next.includes(wrapper)){clearEntry(entry);entries.delete(wrapper);}
  for(const wrapper of next)if(!entries.has(wrapper))bind(wrapper);
 }
 function cloneMaterial(node){
  let record=materials.get(node);if(record)return record;
  const original=node.material,copies=[].concat(original||[]).map(value=>value.clone()),baseline=copies.map(material=>({emissive:material.emissive?.clone(),emissiveIntensity:material.emissiveIntensity,opacity:material.opacity}));
  node.material=Array.isArray(original)?copies:copies[0];record={original,copies,baseline};materials.set(node,record);return record;
 }
 function glow(group,intensity,color){
  group?.traverse(node=>{if(!node.isMesh||!node.material)return;const record=cloneMaterial(node);record.copies.forEach((material,index)=>{if(material.emissive){if(color)material.emissive.set(color);else if(record.baseline[index].emissive)material.emissive.copy(record.baseline[index].emissive);material.emissiveIntensity=intensity;}});});
 }
 function effects(entry){
  if(entry.effects)return entry.effects;
  const root=new T.Group();root.name='FORGE_ACCEPTED_WORK_EFFECTS';root.userData={collisionDisabled:true,forgePresentationOnly:true};entry.model.add(root);
  const steam=[];
  if(entry.modelId==='forge-quench-tank')for(let index=0;index<3;index++){
   const puff=new T.Mesh(new T.SphereGeometry(.2,8,6),new T.MeshBasicMaterial({color:0xd9e4df,transparent:true,opacity:0,depthWrite:false,toneMapped:false}));puff.name='FORGE_QUENCH_STEAM_'+index;puff.userData={collisionDisabled:true,forgePresentationOnly:true};puff.visible=false;root.add(puff);steam.push(puff);
  }
  let ripple=null;if(entry.modelId==='forge-quench-tank'){
   ripple=new T.Mesh(new T.RingGeometry(.19,.215,24),new T.MeshBasicMaterial({color:0xc9eef2,transparent:true,opacity:0,depthWrite:false,side:T.DoubleSide,toneMapped:false}));ripple.name='FORGE_QUENCH_WATER_RIPPLE';ripple.rotation.x=-Math.PI/2;ripple.userData={collisionDisabled:true,forgePresentationOnly:true};root.add(ripple);
  }
  let sparks=null;if(entry.modelId==='forge-anvil'){
   const positions=new Float32Array(9*3),geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3));sparks=new T.Points(geometry,new T.PointsMaterial({color:0xffce72,size:.055,transparent:true,opacity:0,depthWrite:false,toneMapped:false}));sparks.name='FORGE_ACCEPTED_HAMMER_SPARKS';sparks.userData={collisionDisabled:true,forgePresentationOnly:true};root.add(sparks);
  }
  entry.effects={root,steam,ripple,sparks,steamOpacity:0,sparkOpacity:0};return entry.effects;
 }
 function updateProduct(entry,activity){
  const id=activity?.status==='collected'?activity.buildAssetId:null;
  if(entry.productId===id)return;
  disposeMeshes(entry.product);entry.product=null;entry.productId=id;
  if(!id||typeof createItem!=='function')return;
  const product=createItem(id);if(!product)return;
  product.name='FORGE_CONFIRMED_FINISHED_ITEM';product.userData.forgeFinishedItemId=id;
  product.traverse(node=>{node.userData={...node.userData,collisionDisabled:true,forgePresentationOnly:true};if(node.isMesh){node.castShadow=false;node.receiveShadow=true;}});
  product.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(product),size=bounds.getSize(new T.Vector3()),factor=Math.min(1,.9/Math.max(size.x,.001),.85/Math.max(size.y,.001),.7/Math.max(size.z,.001));
  product.scale.multiplyScalar(factor);product.updateMatrixWorld(true);const final=new T.Box3().setFromObject(product);product.position.x-=final.getCenter(new T.Vector3()).x;product.position.z-=final.getCenter(new T.Vector3()).z;product.position.y+=1.19-final.min.y;
  entry.model.add(product);entry.product=product;
 }
 function animate(entry,activity,now,reduced){
  for(const [node,pose]of entry.poses)restorePose(node,pose);
  entry.activity=activity||null;entry.model.userData.forgeWorking=!!activity;entry.model.userData.forgeActivity=activity?{stage:activity.stage,status:activity.status,demonstration:activity.demonstration}:null;
  const {rigs}=entry,workpiece=rigs.workpiece;
  for(const group of [workpiece,rigs.flame])group?.traverse(node=>{const record=materials.get(node);if(record)record.copies.forEach((material,index)=>{const base=record.baseline[index];if(material.emissive&&base.emissive)material.emissive.copy(base.emissive);if(Number.isFinite(base.emissiveIntensity))material.emissiveIntensity=base.emissiveIntensity;});});
  if(workpiece)workpiece.visible=!!activity&&activity.status!=='collected';
  const processing=activity?.status==='processing'||activity?.demonstration,duration=Math.max(1,finite(activity?.readyAt)-finite(activity?.cycleStartedAt||activity?.startedAt)),progress=processing?clamp((now-finite(activity.cycleStartedAt||activity.startedAt))/duration):0;
  const phase=reduced?0:now/1000;
  if(rigs.flame){rigs.flame.visible=true;rigs.flame.scale.y=entry.poses.get(rigs.flame).scale.y*(processing ? .85+(reduced?0:Math.sin(phase*9)*.12) : .35);glow(rigs.flame,processing?1.4+(reduced?0:Math.sin(phase*8)*.15):.45);}
  if(activity?.kind==='sourcing'&&workpiece&&!reduced)workpiece.position.y+=Math.sin(clamp((now-activity.startedAt)/2400)*Math.PI)*.07;
  if(activity?.kind==='heat'&&workpiece)glow(workpiece,processing?.5+progress*1.5:.025,processing?'#ff6e25':'#76848b');
  const strikeAge=(now-finite(activity?.lastStrikeAt))/1000,striking=activity?.kind==='hammer'&&activity?.lastStrikeAt&&strikeAge>=0&&strikeAge<.6;
  if(rigs.hammer&&striking&&!reduced)rigs.hammer.rotation.z-=Math.sin(strikeAge/.6*Math.PI)*.7;
  if(activity?.kind==='hammer'&&workpiece){const ratio=clamp(finite(activity.strikes)/Math.max(1,finite(activity.requiredStrikes)));workpiece.scale.x*=1+ratio*.42;workpiece.scale.y*=1-ratio*.18;glow(workpiece,.7,'#e77b39');}
  const quenchAge=activity?.status==='cooling'?(now-finite(activity.phaseAt))/1000:Infinity,quenching=quenchAge>=0&&quenchAge<2.2;
  if(entry.modelId==='forge-quench-tank'){
   const fx=effects(entry),fade=quenching?clamp(1-quenchAge/2.2):0;fx.steamOpacity=reduced?0:fade*.32;
   fx.steam.forEach((puff,index)=>{puff.visible=fx.steamOpacity>0;puff.material.opacity=fx.steamOpacity*(1-index*.14);const rise=(quenchAge+index*.32)%1.5;puff.position.set((index-1)*.25,1.1+(Number.isFinite(rise)?rise:0)*.48,Math.sin(index*2)*.13);puff.scale.set(.9+index*.2,1.3+Math.max(0,rise||0)*.4,.85);});
   if(fx.ripple){fx.ripple.visible=fade>0;fx.ripple.position.set(0,(rigs.water?.position.y||.91)+.018,0);fx.ripple.material.opacity=fade*.55;fx.ripple.scale.setScalar(reduced||!quenching?1:.5+quenchAge*.75);}
   if(rigs.water&&quenching&&!reduced)rigs.water.position.y+=Math.sin(quenchAge*17)*.012*fade;
   if(workpiece&&quenching){workpiece.position.y-=Math.sin(clamp(quenchAge/.6)*Math.PI)*.15;glow(workpiece,fade*.65,'#d95b2a');}
  }
  if(entry.modelId==='forge-anvil'){
   const fx=effects(entry),fade=striking&&!reduced?clamp(1-strikeAge/.4):0;fx.sparkOpacity=fade;
   if(fx.sparks){fx.sparks.visible=fade>0;fx.sparks.material.opacity=fade;const positions=fx.sparks.geometry.attributes.position,age=striking?strikeAge:0;for(let index=0;index<9;index++){const angle=index*2.399;positions.setXYZ(index,Math.cos(angle)*age*(.6+index*.06),1.26+Math.sin(index+.4)*age*.75-age*age*1.7,Math.sin(angle)*age*.65);}positions.needsUpdate=true;}
  }
  if(activity?.kind==='temper'){if(rigs.gauge)rigs.gauge.rotation.z+=-.9+progress*1.8;if(workpiece)glow(workpiece,.25+progress*.55,'#cc622b');}
  if(activity?.kind==='finish'&&activity.status!=='collected'&&rigs.finishWheel&&!reduced)rigs.finishWheel.rotation.x=phase*7;
  if(rigs.grindWheel&&activity?.kind==='finish'&&!reduced)rigs.grindWheel.rotation.x=phase*7;
  if(rigs.bellows&&activity?.kind==='heat'&&processing&&!reduced){rigs.bellows.position.y+=Math.sin(phase*4)*.07;rigs.bellows.rotation.x+=Math.sin(phase*4)*.035;}
  updateProduct(entry,activity);
 }
 function animateCrew(entry,actor,now,reduced){
  const work=actor?.resident?.forgeActivity;if(!work)return;
  for(const key of ['leftArm','rightArm','leftLeg','rightLeg']){const node=entry.rigs[key];if(node)restorePose(node,entry.poses.get(node));}
  if(reduced||actor.resident?.speaking)return;
  if(work.phase==='walking'){for(const [key,sign]of [['leftLeg',1],['rightLeg',-1]]){const leg=entry.rigs[key];if(leg)leg.rotation.x=Math.sin(now/1000*6)*.25*sign;}return;}
  if(work.phase!=='working')return;
  const phase=(now-finite(work.startedAt))/1000,left=entry.rigs.leftArm,right=entry.rigs.rightArm;
  if(work.kind==='hammer'){if(right)right.rotation.x=-.55-Math.max(0,Math.sin(phase*6.6))*.7;if(left)left.rotation.x=-.35;}
  else if(['heat','quench','temper'].includes(work.kind)){if(left)left.rotation.x=-.4+Math.sin(phase*2)*.07;if(right)right.rotation.x=-.5+Math.sin(phase*2)*.07;}
  else if(right)right.rotation.x=-.35+Math.sin(phase*3)*.08;
 }
 function clearCargo(){for(const record of cargo.values())disposeMeshes(record.root);cargo.clear();}
 function syncCargo(now,reduced){
  const slots=environment?.builderScene?.layoutMeta?.forgeYard?.cargoSlots||[],available=Math.max(0,Math.floor(finite(supply.warehouse?.availableUnits))),visible=Math.min(3,slots.length,available),all=roots();
  for(const [id,record]of cargo)if(!slots.slice(0,visible).some(slot=>slot.id===id)){disposeMeshes(record.root);cargo.delete(id);}
  if(typeof createItem!=='function')return;
  for(const slot of slots.slice(0,visible)){
   const pallet=all.find(root=>root.userData.builderObjectId===(slot.objectId||slot.id));if(!pallet)continue;
   let record=cargo.get(slot.id);
   if(!record||record.pallet!==pallet){
    if(record)disposeMeshes(record.root);const crate=createItem('factory-freight-crate');if(!crate)continue;
    crate.name='FORGE_CONFIRMED_SEALED_CARGO';crate.traverse(node=>{node.userData={...node.userData,collisionDisabled:true,forgePresentationOnly:true};if(node.isMesh)node.castShadow=false;});
    pallet.updateWorldMatrix(true,false);const worldScale=pallet.getWorldScale(new T.Vector3()),bounds=new T.Box3().setFromObject(crate),size=bounds.getSize(new T.Vector3()),factor=Math.min(1,1.65/Math.max(size.x,.001),1.35/Math.max(size.y,.001),1.65/Math.max(size.z,.001));crate.scale.multiplyScalar(factor).divide(worldScale);
    const paletteBounds=new T.Box3().setFromObject(pallet),top=paletteBounds.max.y;const center=paletteBounds.getCenter(new T.Vector3());pallet.add(crate);crate.position.copy(pallet.worldToLocal(new T.Vector3(center.x,top+.025,center.z)));crate.updateWorldMatrix(true,true);const crateBounds=new T.Box3().setFromObject(crate);crate.position.y+=(top+.025-crateBounds.min.y)/worldScale.y;
    record={root:crate,pallet,position:crate.position.clone(),addedAt:now};cargo.set(slot.id,record);
   }
   const settle=reduced?0:Math.max(0,1-(now-record.addedAt)/800);record.root.position.copy(record.position);record.root.position.y+=Math.sin(settle*Math.PI)*.035;
  }
 }
 function update(next,id,env=getEnvironment()){
  if(disposed)return;const changed=environment?.id!==env?.id;
  if(changed)reset();environment=env||null;snapshot=next||null;enabled=isForgeEnvironment(environment);serverAt=finite(next?.serverTime)||Date.now();receivedAt=monotonic();
  visual=enabled?forgeVisualActivities(next||{},environment):{stations:[],activeJobs:0,demonstrations:0};syncRoots();
 }
 function tick(elapsed=lastElapsed){
  if(disposed)return;lastElapsed=finite(elapsed);if(!enabled)return;syncRoots();
  const now=serverNow(),reduced=!!getReducedMotion(),byId=new Map(visual.stations.map(activity=>[activity.stationId,activity])),heat=visual.stations.find(activity=>activity.kind==='heat'),finish=visual.stations.find(activity=>activity.kind==='finish');
  for(const entry of entries.values()){
   let activity=byId.get(entry.id)||null;if(!activity&&entry.modelId==='forge-bellows')activity=heat||null;if(!activity&&entry.modelId==='forge-grinding-wheel')activity=finish||null;
   animate(entry,activity,now,reduced);if(entry.id)animateCrew(entry,snapshot?.actors?.[entry.id],now,reduced);
  }
  syncCargo(now,reduced);
 }
 function reset(){
  for(const entry of entries.values())clearEntry(entry);entries.clear();rootSignature=[];clearCargo();
  for(const [node,record]of materials){if(node.material===record.copies[0]||Array.isArray(node.material)&&node.material.every((value,index)=>value===record.copies[index]))node.material=record.original;for(const material of record.copies)material.dispose();}materials.clear();
  enabled=false;snapshot=null;visual={stations:[],activeJobs:0,demonstrations:0};supply={warehouse:{},lots:[],shipments:[]};
 }
 return {update,tick,updateSupply(data){if(!disposed)supply=data||{warehouse:{},lots:[],shipments:[]};},reset,dispose(){if(disposed)return;reset();disposed=true;},snapshot(){return {enabled,stationCount:enabled?forgeStations(environment).length:0,modelCount:entries.size,activeJobs:visual.activeJobs,demonstrations:visual.demonstrations,reducedMotion:!!getReducedMotion(),stations:[...entries.values()].filter(entry=>entry.activity).map(entry=>({id:entry.id,kind:entry.activity.kind,stage:entry.activity.stage,status:entry.activity.status,jobId:entry.activity.jobId,workpieceId:entry.productId||entry.activity.buildAssetId||'forge-steel-billet',strikes:finite(entry.activity.strikes),processing:entry.activity.status==='processing',demonstration:!!entry.activity.demonstration,pose:{hammer:entry.rigs.hammer?.rotation.z??null,water:entry.rigs.water?.position.y??null,gauge:entry.rigs.gauge?.rotation.z??null,workpiece:entry.rigs.workpiece?.visible??false},steamOpacity:entry.effects?.steamOpacity||0,sparkOpacity:entry.effects?.sparkOpacity||0})),warehouse:{...supply.warehouse,visibleCrates:cargo.size},shipments:(supply.shipments||[]).map(shipment=>({id:shipment.id,phase:shipment.phase,quantity:shipment.quantity}))};}};
}
