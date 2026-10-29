import {constructionAccessPoint} from './public/js/construction-access.js';
import {randomUUID} from 'node:crypto';
import {quarryConfig,QUARRY_MATERIALS} from './public/js/quarry-config.js';
import {earthCargoVolume,earthCargo,earthworksTake,earthworksDeposit} from './public/js/construction-earthworks.js';
import {constructionMachineKind} from './public/js/construction-state.js';
const fail=(message,statusCode=409)=>{throw Object.assign(Error(message),{statusCode});};
const gap=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),keys=Object.keys(QUARRY_MATERIALS);
const center=patch=>({x:patch.origin.x+patch.columns*patch.cellSize/2,y:Infinity,z:patch.origin.z+patch.rows*patch.cellSize/2});
const add=(into,cargo)=>{for(const [key,value]of Object.entries(cargo))into[key]=(into[key]||0)+value;};
export function ensureQuarry(sim,environment){
 const config=quarryConfig(environment);if(!config?.enabled||!sim.construction)return null;
 if(!sim.quarry)sim.quarry={version:1,id:randomUUID(),sequence:0,bins:Object.fromEntries(keys.map(key=>[key,0])),stations:Object.fromEntries(Object.keys(config.stations).map(key=>[key,{enabled:false,running:false,processed:0,manualOwner:null,status:'Parked'}])),conveyor:true,aiEnabled:false,pendingExports:{},stats:{screened:0,crushed:0,stacked:0,booked:0},message:'Mine, tip raw material in a feed bay, then start the screen. All product volumes are finite.'};
 const crew=sim.construction.crew;
 for(const worker of crew?.workers||[]){const id=worker.id==='crew-noor'?'quarry-excavator':worker.id==='crew-jules'?'quarry-truck':worker.id==='crew-ellis'?'quarry-dozer':null,actor=sim.actors[id],home=worker.id==='crew-maya'?config.operatorHome:actor?constructionAccessPoint(actor):null;if(home&&!worker.quarryStationed){worker.position={...home};worker.home={...home};worker.quarryStationed=true;}}
 const worker=crew?.workers?.find(worker=>worker.id==='crew-maya');if(worker){worker.role='Quarry plant operator';worker.home={...config.operatorHome};}
 return sim.quarry;
}
function feed(sim,patchId,amount,materials){const patch=sim.construction.earthworks.patches.find(p=>p.id===patchId);return patch?earthworksTake(sim.construction.earthworks,center(patch),amount,{radius:Math.max(patch.columns,patch.rows)*patch.cellSize,looseOnly:true,materials,patchId}):{soil:0,gravel:0};}
function previewFeed(sim,patchId,amount,materials){const patch=sim.construction.earthworks.patches.find(p=>p.id===patchId);return patch?earthworksTake(sim.construction.earthworks,center(patch),amount,{radius:Math.max(patch.columns,patch.rows)*patch.cellSize,looseOnly:true,materials,dryRun:true,patchId}):{soil:0,gravel:0};}
export function stepQuarry(sim,environment,now,dt){
 const q=sim.quarry,config=quarryConfig(environment);if(!q||!config)return;dt=Math.max(0,Math.min(.25,Number(dt)||0));
 const worker=sim.construction.crew?.workers.find(worker=>worker.id==='crew-maya'),ai=q.aiEnabled&&sim.construction.crew?.enabled&&worker?.enabled&&gap(worker.position,config.operatorHome)<2.5;
 if(ai){worker.state='operating';worker.phase='screen / crush / stack';worker.message='Running the quarry line with real feed material and available stockpile space.';worker.role='Quarry plant operator';}
 for(const [kind,state]of Object.entries(q.stations)){
  const owner=sim.players[state.manualOwner],station=config.stations[kind];if(state.manualOwner&&(!owner||owner.health<=0||owner.replacedByRoom||now-owner.lastSeen>15000||gap(owner.position,station)>15))state.manualOwner=null;
  state.running=state.enabled&&!!(state.manualOwner||ai);state.status=state.running?'Running':state.enabled?'Waiting for an operator':'Parked';
 }
 const screen=q.stations.screener;
 if(screen?.running){
  const amount=config.stations.screener.rate*dt,preview=previewFeed(sim,config.stations.screener.feedPatch,amount,['soil','gravel']);
  if(!earthCargoVolume(preview))screen.status='Waiting for soil or gravel in the screen feed bay';
  else if(keys.some(key=>q.bins[key]+earthCargoVolume(preview)>40))screen.status='Output buffer full; run the stacker';
  else {const raw=feed(sim,config.stations.screener.feedPatch,amount,['soil','gravel']),output={sand:raw.gravel*.2,fines:raw.gravel*.2,stone:raw.gravel*.6,topsoil:raw.soil*.75,mulch:raw.soil*.25};add(q.bins,output);const moved=earthCargoVolume(raw);screen.processed+=moved;q.stats.screened+=moved;screen.status='Screening sand, fines, stone and seed-ready soil';}
 }
 const crusher=q.stations.crusher;
 if(crusher?.running){
  const requested=config.stations.crusher.rate*dt;
  if(q.bins.crushed+requested*.75>40||q.bins.fines+requested*.25>40)crusher.status='Output buffer full; run the stacker';
  else {let amount=q.conveyor?Math.min(requested,q.bins.stone):0;q.bins.stone-=amount;if(amount<requested)amount+=feed(sim,config.stations.crusher.feedPatch,requested-amount,['stone']).stone||0;
   if(amount){q.bins.crushed+=amount*.75;q.bins.fines+=amount*.25;crusher.processed+=amount;q.stats.crushed+=amount;crusher.status='Crushing screened stone to aggregate and fines';}else crusher.status='Waiting for screened stone; tip stone in the crusher feed bay or enable the transfer conveyor';}
 }
 const stacker=q.stations.stacker;
 if(stacker?.running){let capacity=config.stations.stacker.rate*dt,moved=0;
  for(const key of keys){const patch=sim.construction.earthworks.patches.find(p=>p.id===config.outputPatches[key]);if(!patch||q.bins[key]<=1e-8||capacity<=1e-8)continue;const placed=earthworksDeposit(sim.construction.earthworks,center(patch),{[key]:Math.min(q.bins[key],capacity)},{radius:8,maxHeight:5}),volume=earthCargoVolume(placed);q.bins[key]-=volume;capacity-=volume;moved+=volume;}
  stacker.processed+=moved;q.stats.stacked+=moved;stacker.status=moved?'Stacking separated products into marked stockpiles':'Waiting for products or clear pile capacity';
 }
 for(const [kind,station]of Object.entries(config.stations)){const actor=sim.actors[station.actorId];if(actor)actor.quarryMachine={kind,...q.stations[kind],operator:q.stations[kind].manualOwner||ai&&worker.id||null};}
 const transfer=sim.actors['quarry-transfer'];if(transfer)transfer.quarryMachine={kind:'conveyor',running:q.conveyor&&!!crusher?.running};
}
function requireVisitor(sim,player,environment){const config=quarryConfig(environment);if(!config?.enabled||!sim.quarry||!player||player.health<=0||player.replacedByRoom)fail('Join the live quarry to use these controls.',403);const yard=(environment.construction||environment.builderScene?.layoutMeta?.construction)?.yard;if(yard&&(player.position.x<yard.minX-12||player.position.x>yard.maxX+12||player.position.z<yard.minZ-12||player.position.z>yard.maxZ+12))fail('Return to the quarry yard.');return config;}
export async function quarryCommand(sim,player,environment,command,now,{identity={},inventory}={}){
 const config=requireVisitor(sim,player,environment),q=sim.quarry,operation=command.operation;
 if(operation==='status')return {message:q.message};
 if(operation==='ai-start'||operation==='ai-stop'){
  q.aiEnabled=operation==='ai-start';const worker=sim.construction.crew?.workers.find(w=>w.id==='crew-maya');if(worker){worker.enabled=q.aiEnabled;if(q.aiEnabled)sim.construction.crew.enabled=true;worker.home={...config.operatorHome};}
  for(const station of Object.values(q.stations)){station.enabled=q.aiEnabled;if(!q.aiEnabled&&!station.manualOwner)station.running=false;}
  return {message:q.aiEnabled?(worker?.name||'The operator')+(worker&&gap(worker.position,config.operatorHome)<2.5?' is at the controls. The processing line is engaged.':' is walking to the control station. The line starts on arrival.'):'AI plant operation paused safely.'};
 }
 if(operation==='emergency-stop'){q.aiEnabled=false;for(const station of Object.values(q.stations)){station.enabled=false;station.running=false;station.manualOwner=null;}return {message:'All quarry plants stopped. Material remains in feed bays, buffers and stockpiles.'};}
 if(operation==='conveyor'){q.conveyor=command.enabled!==false;return {message:q.conveyor?'Screened stone transfers to the crusher.':'Stone transfer stopped; the stacker stores garden stone.'};}
 if(operation==='start'||operation==='stop'){
  const definition=config.stations[command.stationId],station=q.stations[command.stationId];if(!definition||!station)fail('Choose a quarry station.',422);
  if(gap(player.position,definition)>12)fail('Walk to this plant’s controls before operating it.');if(player.vehicleId)fail('Park and exit the vehicle before using plant controls.');
  if(station.manualOwner&&station.manualOwner!==player.actorId&&sim.players[station.manualOwner]&&now-sim.players[station.manualOwner].lastSeen<15000)fail('Another player is operating this plant.');
  station.enabled=operation==='start';station.manualOwner=operation==='start'?player.actorId:null;station.running=operation==='start';return {message:operation==='start'?'Plant engaged. Feed material and free output space are still required.':'Plant parked; material retained.'};
 }
 if(operation==='reserve-stock'){
  const key=command.material,amount=command.quantity;if(!QUARRY_MATERIALS[key]||!Number.isSafeInteger(amount)||amount<1||amount>1000)fail('Choose a material and 1–1,000 whole cubic metres.',422);
  const patch=sim.construction.earthworks.patches.find(p=>p.id===config.outputPatches[key]);if(!patch)fail('The product stockpile is unavailable.');
  const available=earthworksTake(sim.construction.earthworks,center(patch),amount,{radius:18,looseOnly:true,materials:[key],dryRun:true,patchId:patch.id});if(earthCargoVolume(available)<amount-1e-7)fail('Stack enough of this material before booking warehouse stock.');
  const cargo=earthworksTake(sim.construction.earthworks,center(patch),amount,{radius:18,looseOnly:true,materials:[key],patchId:patch.id}),id=q.id+':'+ ++q.sequence;
  q.pendingExports[id]={id,ownerId:identity.walletId,material:key,quantity:amount,sourceMapId:environment.id,status:'reserved',createdAt:now};
  return {message:'Material reserved for warehouse booking. Complete booking before ordering freight.',exportId:id};
 }
 if(operation==='book-stock'){
  const reservation=q.pendingExports[command.exportId];if(!reservation||reservation.ownerId!==identity.walletId)fail('Choose your reserved quarry stock.',403);if(reservation.status==='booked')return {message:'This stock is already booked.',booking:reservation.booking};if(!inventory)fail('Warehouse storage is unavailable.',503);
  const booking=await inventory(identity,{...reservation,operation:'export'},now);reservation.status='booked';reservation.booking=booking;q.stats.booked+=reservation.quantity;return {message:'Material booked into the quarry warehouse. You can now order deed freight.',booking};
 }
 fail('Choose a listed quarry operation.',422);
}
export function quarryMass(sim){const e=sim.construction?.earthworks;if(!e)return 0;let total=0;for(const p of e.patches)for(let i=0;i<p.heights.length;i++)total+=(p.soil[i]||0)+(p.gravel[i]||0)+Object.values(p.products||{}).reduce((sum,array)=>sum+(array[i]||0),0);for(const actor of Object.values(sim.actors))if(constructionMachineKind(actor))total+=earthCargoVolume(actor.construction?.cargo);for(const value of Object.values(sim.quarry?.bins||{}))total+=value;for(const record of Object.values(sim.quarry?.pendingExports||{}))total+=record.quantity;return total;}

function materialUseActor(record){
 const modelId=record.kind==='garden'?'quarry-garden-bed':record.kind==='storage'?'quarry-storage-bin':'quarry-gravel-pad',id='quarry-use-'+record.id;
 const scale=Math.sqrt(record.quantity);return {id,modelId,asset:{id:modelId,buildAssetId:modelId,name:record.kind==='garden'?'Seed-ready garden bed':record.kind==='storage'?'Aggregate storage bay':'Aggregate path',type:'building-material'},position:{...record.position},rotation:{x:0,y:record.rotationY||0,z:0},scale:{x:scale,y:1,z:scale},active:!record.recovered,spawned:true,health:1000,quarryUse:{id:record.id,kind:record.kind,material:record.material,quantity:record.quantity,seedReady:record.seedReady,ownerId:record.ownerId},definition:{objectId:id,modelId,gameplay:{behavior:'decor',destructible:false}}};
}
export async function quarryDeedCommand(sim,player,environment,command,now,{identity={},inventory,collision,objects={}}={}){
 if(!inventory)fail('Deed material storage is unavailable.',503);if(!player||player.health<=0||player.vehicleId||player.replacedByRoom)fail('Leave the vehicle and stand on your deed to manage materials.',403);
 const base={mapId:environment.id},operation=command.operation;
 if(operation==='deed-state'){
  const state=await inventory(identity,{...base,operation},now),live=new Set(state.uses.map(use=>use.id));for(const actor of Object.values(sim.actors))if(actor.quarryUse?.ownerId===identity.walletId&&!live.has(actor.quarryUse.id))actor.active=false;for(const use of state.uses){const actor=materialUseActor(use);sim.actors[actor.id]||=actor;}return {message:'Delivered deed materials and storage synchronized.',deedMaterials:state};
 }
 if(operation==='recover-storage'){
  const actor=sim.actors[command.entityId];if(!actor?.quarryUse||actor.quarryUse.kind!=='storage'||actor.active===false||gap(player.position,actor.position)>5)fail('Walk to the aggregate storage bay you want to recover.');
  const receipt=await inventory(identity,{...base,operation:'recover',useId:actor.quarryUse.id},now);actor.active=false;return {message:'Stored material returned to this deed inventory.',receipt};
 }
 if(operation!=='apply-material')fail('Choose a deed material operation.',422);
 const material=command.material,kind=command.kind,amount=command.quantity;
 if(!QUARRY_MATERIALS[material]||!['garden','path','storage'].includes(kind)||!Number.isSafeInteger(amount)||amount<1||amount>4)fail('Choose a material, garden/path/storage and 1–4 cubic metres.',422);
 if(kind==='garden'&&!['topsoil','mulch'].includes(material))fail('Use screened topsoil or organic mulch for a garden bed.');
 if(kind==='path'&&!['sand','fines','stone','crushed'].includes(material))fail('Use screened mineral material for paths and building bases.');
 const yaw=player.yaw||0,point={x:player.position.x-Math.sin(yaw)*4,y:player.position.y,z:player.position.z-Math.cos(yaw)*4};
 const floor=collision?.groundAt(environment,point,{actors:sim.actors,objects,maxRise:1});if(!floor)fail('Choose clear supported ground for this material use.');
 const half=1.25*Math.sqrt(amount);for(const dx of [-half,0,half])for(const dz of [-half,0,half]){const probe=collision.groundAt(environment,{x:floor.x+dx,y:floor.y,z:floor.z+dz},{actors:sim.actors,objects,maxRise:.3});if(!probe||Math.abs(probe.y-floor.y)>.25||!collision.hasBodyClearance(environment,probe,.38,{actors:sim.actors,objects}))fail('Move to a clear level work area before placing the material.');}
 const id=command.requestId;if(typeof id!=='string'||id.length>140)fail('A placement request id is required.',422);
 const receipt=await inventory(identity,{...base,operation:'apply',id,kind,material,quantity:amount,position:{x:floor.x,y:floor.y,z:floor.z},rotationY:yaw},now),actor=materialUseActor(receipt);sim.actors[actor.id]||=actor;
 player.progress||={};player.progress['quarry-'+kind]=(player.progress['quarry-'+kind]||0)+amount;
 return {message:kind==='garden'?'Seed-ready garden bed prepared with delivered material.':kind==='storage'?'Recoverable aggregate storage bay created.':'Delivered aggregate placed as a graded path / building base.',receipt};
}
