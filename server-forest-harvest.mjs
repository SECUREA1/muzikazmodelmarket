import {randomUUID} from 'node:crypto';
import {FOREST_HARVEST_ID,FOREST_SPECIES,FOREST_TREES,FOREST_PLOTS,FOREST_STATIONS,FOREST_VEHICLES,FOREST_EQUIPMENT,FOREST_PRODUCTS,FOREST_RECIPES,FOREST_CHALLENGES,FOREST_GROWTH_MS,FOREST_MILL_MS,FOREST_DRY_MS,isForestHarvestEnvironment} from './public/js/forest-harvest-config.js';

const copy=value=>JSON.parse(JSON.stringify(value));
const fail=(message,statusCode=409)=>{throw Object.assign(new Error(message),{statusCode});};
const lookup=(record,id,label)=>typeof id==='string'&&Object.hasOwn(record,id)?record[id]:fail('Choose a valid '+label+'.',422);
const quantity=(value,max=50)=>{if(!Number.isInteger(value)||value<1||value>max)fail('Quantity must be a whole number from 1 to '+max+'.',422);return value;};
const distance=(a,b)=>!a||!b?Infinity:Math.hypot(a.x-b.x,(a.y||0)-(b.y||0),a.z-b.z);
const playerId=player=>player.actorId||player.id;
const sum=record=>Object.values(record).reduce((total,value)=>total+value,0);
const add=(record,key,amount)=>{record[key]=(record[key]||0)+amount;};
const take=(record,key,amount,label)=>{if((record[key]||0)<amount)fail('Not enough '+label+'.');record[key]-=amount;};
const keyFor=(speciesId,productId)=>speciesId+':'+productId;
const stationFor=kind=>FOREST_STATIONS.find(station=>station.kind===kind);
function near(player,position,radius=9,label='station'){if(distance(player.position,position)>radius)fail('Move within '+radius+' metres of the '+label+'.');}
function atStation(player,kind){const station=stationFor(kind);if(Math.min(distance(player.position,station.position),distance(player.position,station.approach))>10)fail('Go to the '+station.name+'.');}
function personal(player){
 return player.forestHarvest ||= {equipment:'axe',cargo:{},stock:{logs:{},green:{},dry:{},seedlings:Object.fromEntries(Object.keys(FOREST_SPECIES).map(id=>[id,8])),chips:0},crafted:[],progress:{harvested:0,milled:0,dried:0,crafted:0,ground:0,clearedPlots:0,planted:0,regrown:0},badges:[],lastWorkAt:null};
}
function plotIsClear(state,plotId){return Object.values(state.trees).filter(tree=>tree.plotId===plotId).every(tree=>tree.phase==='cleared')&&!Object.values(state.logs).some(log=>state.trees[log.treeId]?.plotId===plotId);}
export function ensureForestHarvest(sim,environment,now=Date.now()){
 if(!isForestHarvestEnvironment(environment))return null;
 sim.forestHarvest ||= {version:1,instanceId:randomUUID(),mapId:environment.id||FOREST_HARVEST_ID,trees:Object.fromEntries(FOREST_TREES.map(tree=>[tree.id,{...copy(tree),phase:'standing',hits:0,generation:0}])),logs:{},jobs:[],clearedPlots:[],sequence:0,message:'Fell a tree, buck the trunk, haul logs to the mill, then dry and craft your chosen lumber.'};
 sim.forestHarvest.instanceId ||= randomUUID();
 for(const player of Object.values(sim.players||{}))personal(player);
 return sim.forestHarvest;
}
function finishJob(state,job,player){
 const data=personal(player),key=keyFor(job.speciesId,job.productId);
 if(job.kind==='mill'){add(data.stock.green,key,job.output);data.stock.chips+=job.quantity;data.progress.milled+=job.output;}
 else {add(data.stock.dry,key,job.quantity);data.progress.dried+=job.quantity;}
 job.completedAt=job.endsAt;job.phase='complete';
}
export function stepForestHarvest(sim,environment,now=Date.now()){
 const state=ensureForestHarvest(sim,environment,now);if(!state)return;
 for(const tree of Object.values(state.trees))if(tree.phase==='growing'&&now>=tree.growthEndsAt){tree.phase='standing';tree.hits=0;const planter=Object.values(sim.players||{}).find(player=>playerId(player)===tree.plantedBy);if(planter)personal(planter).progress.regrown++;delete tree.growthEndsAt;}
 for(const job of state.jobs)if(job.phase==='working'&&now>=job.endsAt){const owner=Object.values(sim.players||{}).find(player=>playerId(player)===job.ownerId);if(owner)finishJob(state,job,owner);}
 // Finished jobs are informational; their output was delivered exactly once.
 state.jobs=state.jobs.filter(job=>job.phase==='working'||now-job.completedAt<60_000).slice(-100);
}
function treeFor(state,command){return lookup(state.trees,command.treeId,'tree');}
function work(data,now){if(data.lastWorkAt!==null&&now-data.lastWorkAt<700)fail('Let the current tool stroke finish.');data.lastWorkAt=now;}
function recordClearPlots(state,data){for(const plot of FOREST_PLOTS)if(!state.clearedPlots.includes(plot.id)&&plotIsClear(state,plot.id)){state.clearedPlots.push(plot.id);data.progress.clearedPlots++;}}
function equipmentFor(data){return lookup(FOREST_EQUIPMENT,data.equipment,'equipment');}
function requireMachine(sim,player,equipment){
 if(equipment.kind!=='vehicle')return null;
 const definition=FOREST_VEHICLES.find(vehicle=>vehicle.kind===equipment.id),actor=definition&&sim.actors?.[definition.id];
 if(!actor||actor.active===false||player.vehicleId!==actor.id||actor.holderId!==playerId(player))fail('Board the '+equipment.name+' before operating it.');
 near(player,actor.position,6,'vehicle operator seat');return actor;
}
function queueJob(state,player,kind,speciesId,productId,count,now){
 if(state.jobs.some(job=>job.kind===kind&&job.phase==='working'))fail('The '+(kind==='mill'?'saw line':'drying kiln')+' is busy. Wait for its current batch.');
 const product=lookup(FOREST_PRODUCTS,productId,'lumber output'),data=personal(player),key=keyFor(speciesId,productId),output=kind==='mill'?count*product.yield:count;
 if(kind==='mill')take(data.stock.logs,speciesId,count,'delivered '+FOREST_SPECIES[speciesId].name+' logs');else take(data.stock.green,key,count,'green '+FOREST_SPECIES[speciesId].name+' '+product.name);
 const job={id:'forest-job-'+ ++state.sequence,kind,ownerId:playerId(player),speciesId,productId,quantity:count,output,phase:'working',startedAt:now,endsAt:now+(kind==='mill'?FOREST_MILL_MS:FOREST_DRY_MS)+count*120};
 state.jobs.push(job);return job;
}
/** Every mutation is checked against the shared forest and server-owned inventory.
 * The room's ordinary requestId cache supplies network retry idempotency. */
export function forestHarvestCommand(sim,player,environment,command,now=Date.now()){
 if(!isForestHarvestEnvironment(environment))fail('Visit the Forest Harvest map to use forestry equipment.',422);
 stepForestHarvest(sim,environment,now);
 const state=sim.forestHarvest,data=personal(player),equipment=equipmentFor(data),action=String(command.action||'');
 if(action!=='forest-status'){
  if(player.health<=0)fail('Respawn before operating forestry equipment.');
  if(player.replacedByRoom)fail('Rejoin this forest before working.');
  if(player.grounded===false)fail('Return to the ground before operating forestry equipment.');
 }
 let message='',crafted=null,job=null;
 if(action==='forest-status'){
  message='Forest operations ready.';
 }else if(action==='forest-equip'){
  const next=lookup(FOREST_EQUIPMENT,command.equipmentId,'equipment');
  const vehicle=FOREST_VEHICLES.find(value=>value.kind===next.id),actor=vehicle&&sim.actors?.[vehicle.id];
  const accessible=Math.min(distance(player.position,stationFor('equipment').position),distance(player.position,stationFor('equipment').approach),vehicle?distance(player.position,actor?.position||vehicle.position):Infinity);
  if(accessible>10)fail('Collect equipment at the depot or approach its parked vehicle.');
  if(sum(data.cargo)>next.capacity)fail('Unload the current timber cargo before choosing smaller equipment.');
  data.equipment=next.id;message=next.name+' ready.';
 }else if(action==='forest-fell'){
  const tree=treeFor(state,command);near(player,tree.position,equipment.reach,'tree');
  if(!equipment.power)fail('Equip an axe, chainsaw or tree harvester to fell trees.');
  if(tree.phase!=='standing')fail(tree.phase==='growing'?'This tree is still growing.':'Choose a standing tree.');
  requireMachine(sim,player,equipment);work(data,now);tree.hits+=equipment.power;
  if(tree.hits>=4){tree.phase='felled';tree.felledBy=playerId(player);tree.felledAt=now;message=FOREST_SPECIES[tree.speciesId].name+' felled. Buck the trunk into haulable logs.';}else message='Cut '+tree.hits+'/4 · keep working the same tree.';
 }else if(action==='forest-buck'){
  const tree=treeFor(state,command);near(player,tree.position,equipment.reach,'felled trunk');
  if(!['axe','chainsaw','harvester'].includes(data.equipment))fail('Use an axe, chainsaw or harvester to buck the trunk.');
  if(tree.phase!=='felled')fail('Fell this tree before cutting its trunk into logs.');
  requireMachine(sim,player,equipment);work(data,now);const species=FOREST_SPECIES[tree.speciesId];
  for(let index=0;index<species.logs;index++){const id=tree.id+'-g'+tree.generation+'-log-'+index;state.logs[id]={id,treeId:tree.id,speciesId:tree.speciesId,position:{x:tree.position.x+(index%2)*1.5,y:.35,z:tree.position.z+2+Math.floor(index/2)*1.5}};}
  tree.phase='stump';data.progress.harvested++;add(data.stock.seedlings,tree.speciesId,2);message=species.logs+' '+species.name+' logs ready for loading. The stump can now be ground.';
 }else if(action==='forest-load'){
  const machine=requireMachine(sim,player,equipment);
  if(sum(data.cargo)&&data.cargoVehicleId!==(machine?.id||null))fail('Unload the original vehicle before transferring its cargo.');
  if(sum(data.cargo)>=equipment.capacity)fail('Your timber load is full. Deliver it to the mill.');
  let logs=Object.values(state.logs).filter(log=>distance(player.position,log.position)<=equipment.reach);
  if(command.logId)logs=logs.filter(log=>log.id===command.logId);if(command.treeId)logs=logs.filter(log=>log.treeId===command.treeId);
  if(!logs.length)fail('Move near cut logs to load them.');
  const selected=logs.slice(0,equipment.capacity-sum(data.cargo));for(const log of selected){add(data.cargo,log.speciesId,1);delete state.logs[log.id];}
  data.cargoVehicleId=machine?.id||null;recordClearPlots(state,data);message='Loaded '+selected.length+' logs · '+sum(data.cargo)+'/'+equipment.capacity+' capacity. Haul them to the mill.';
 }else if(action==='forest-unload'){
  atStation(player,'mill');if(data.cargoVehicleId){const actor=sim.actors?.[data.cargoVehicleId];if(player.vehicleId!==data.cargoVehicleId||actor?.holderId!==playerId(player)||distance(player.position,actor.position)>6)fail('Drive the loaded vehicle to the mill before unloading.');}
  if(!sum(data.cargo))fail('Load timber before unloading at the mill.');
  const count=sum(data.cargo);for(const [speciesId,amount]of Object.entries(data.cargo))add(data.stock.logs,speciesId,amount);data.cargo={};data.cargoVehicleId=null;message=count+' logs delivered to your mill stock.';
 }else if(action==='forest-mill'||action==='forest-dry'){
  const kind=action==='forest-mill'?'mill':'dry';atStation(player,kind);lookup(FOREST_SPECIES,command.speciesId,'wood species');quantity(command.quantity);
  job=queueJob(state,player,kind,command.speciesId,command.productId,command.quantity,now);message=(kind==='mill'?'Sawing':'Drying')+' '+FOREST_SPECIES[command.speciesId].name+' '+FOREST_PRODUCTS[command.productId].name+' · batch '+job.id+'.';
 }else if(action==='forest-craft'){
  atStation(player,'craft');const recipe=lookup(FOREST_RECIPES,command.recipeId,'recipe'),species=lookup(FOREST_SPECIES,command.speciesId,'wood species'),count=quantity(command.quantity??1,10);
  for(const [productId,amount]of Object.entries(recipe.cost))if((data.stock.dry[keyFor(species.id,productId)]||0)<amount*count)fail('Dry '+(amount*count)+' '+species.name+' '+FOREST_PRODUCTS[productId].name+' for this recipe.');
  for(const [productId,amount]of Object.entries(recipe.cost))take(data.stock.dry,keyFor(species.id,productId),amount*count,'dry lumber');
  crafted={id:'forest-crafted-'+ ++state.sequence,recipeId:recipe.id,speciesId:species.id,quantity:count,name:species.name+' '+recipe.name,modelId:recipe.modelId,category:recipe.category,color:species.woodColor,craftedAt:now};
  data.crafted.push(crafted);data.progress.crafted+=count;message='Crafted '+count+' '+crafted.name+'. Export it from the workshop to your Backpack.';
 }else if(action==='forest-grind'){
  const tree=treeFor(state,command);near(player,tree.position,equipment.reach,'stump');if(data.equipment!=='stump-grinder')fail('Equip the stump grinder to reclaim the ground.');
  if(tree.phase!=='stump')fail('Buck the felled trunk before grinding its stump.');
  requireMachine(sim,player,equipment);work(data,now);tree.phase='cleared';tree.clearedBy=playerId(player);data.stock.chips+=2;data.progress.ground++;recordClearPlots(state,data);message='Stump removed. This spot is clear land ready for planting or building.';
 }else if(action==='forest-plant'){
  const tree=treeFor(state,command),species=lookup(FOREST_SPECIES,command.speciesId,'wood species');near(player,tree.position,7,'cleared planting spot');
  if(data.equipment!=='planter')fail('Equip the seedling planter at the depot.');if(tree.phase!=='cleared')fail('Remove the tree and stump before planting this spot.');
  if(Object.values(state.logs).some(log=>log.treeId===tree.id))fail('Haul the remaining logs before replanting.');
  take(data.stock.seedlings,species.id,1,species.name+' seedlings');tree.speciesId=species.id;tree.phase='growing';tree.hits=0;tree.generation++;tree.plantedAt=now;tree.growthEndsAt=now+FOREST_GROWTH_MS;tree.plantedBy=playerId(player);tree.tended=false;data.progress.planted++;message=species.name+' planted. Growth takes 90 seconds; tend it once to save 30 seconds.';
 }else if(action==='forest-tend'){
  const tree=treeFor(state,command);near(player,tree.position,7,'seedling');if(tree.phase!=='growing')fail('Choose a growing seedling.');if(tree.tended)fail('This seedling has already been tended.');
  tree.growthEndsAt=Math.max(now+1000,tree.growthEndsAt-30_000);tree.tended=true;message='Seedling watered and mulched · growth accelerated.';
 }else if(action==='forest-claim'){
  const challenge=FOREST_CHALLENGES.find(value=>value.id===command.challengeId);if(!challenge)fail('Choose a valid forest challenge.',422);
  if(data.badges.includes(challenge.id))fail('This challenge badge has already been earned.');if((data.progress[challenge.stat]||0)<challenge.target)fail('Complete the '+challenge.name+' objective first.');
  data.badges.push(challenge.id);message=challenge.name+' badge earned.';
 }else fail('Unknown forestry operation.',422);
 state.message=message;return {message,...(crafted?{crafted}:{}),...(job?{job:copy(job)}:{})};
}
export function forestHarvestView(sim,player){
 if(!sim.forestHarvest)return null;const state=copy(sim.forestHarvest);if(player)state.personal=copy(personal(player));return state;
}
export const forestHarvestSnapshot=forestHarvestView;
