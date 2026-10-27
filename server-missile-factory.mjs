import {randomUUID} from 'node:crypto';
import {cleanWallet} from './user-json-database.mjs';
import {FACTORY_ID,FACTORY_STATIONS,FACTORY_RECIPES,isFactoryEnvironment,factoryStations,factoryCrew,factoryRecipeSteps,canonicalFactoryStation} from './public/js/missile-factory-config.js';
import {preemptFactoryCrewStation,factoryCrewWorkView} from './server-factory-crew-work.mjs';
import {ownedFactoryModel,factoryModelTestLocked} from './factory-item-provenance.mjs';
import {itemLocked} from './public/js/factory-logistics-config.js';

const fail=(message,statusCode=409)=>{throw Object.assign(new Error(message),{statusCode});};
const stationFor=(id,stations=FACTORY_STATIONS)=>stations.find(station=>station.id===id);
const recipeFor=id=>FACTORY_RECIPES.find(recipe=>recipe.id===id);
const clone=value=>structuredClone(value);
const near=(a,b,reach=6)=>a&&b&&Math.hypot(a.x-b.x,(a.y||0)-(b.y||0),a.z-b.z)<=reach;
const publicProgress=state=>({completedJobs:state.completedJobs||0,totalSpentMzk:state.totalSpentMzk||0,skills:{...state.skills},badges:[...(state.badges||[])]});
function account(data,wallet){
 data.factory ||= {accounts:{},stationLocks:{}};data.factory.accounts ||= {};data.factory.stationLocks ||= {};
 return data.factory.accounts[wallet] ||= {job:null,completedJobs:0,totalSpentMzk:0,skills:{},badges:[]};
}
function userFor(data,wallet){const user=data.users[wallet];if(!user)fail('Member wallet not found.',404);user.tokens ||= {MZK:0};user.items ||= [];return user;}
function stamp(user,now){user.revision=Number(user.revision||0)+1;user.updatedAt=new Date(now).toISOString();}
function snapshot(state,user){return {job:clone(state.job||null),progress:publicProgress(state),balance:Number(user.tokens?.MZK||0)};}
export function publicFactoryState(state){return state?{job:clone(state.job||null),progress:clone(state.progress||{})}:null;}
function release(data,job){for(const [key,lock]of Object.entries(data.factory.stationLocks))if(lock.jobId===job.id)delete data.factory.stationLocks[key];}
function advance(data,state,now,{stations,environmentId}={}){
 const job=state.job;if(!job||job.status!=='processing')return false;
 if(environmentId&&job.environmentId!==environmentId)return false;
 const step=job.steps[job.stepIndex];
 if(stations&&job.environmentId===environmentId){const station=stationFor(step.stationId,stations);if(!station||step.stationRevision&&step.stationRevision!==station.stationRevision){release(data,job);job.status='awaiting';job.readyAt=null;job.message='Equipment changed during this cycle. Return to an active '+(canonicalFactoryStation(step.kind||step.canonicalStationId||step.stationId)?.name||'production station')+' and run the cycle again.';return true;}}
 if(now<job.readyAt)return false;
 release(data,job);job.completedSteps ||= [];job.completedSteps.push({stationId:job.steps[job.stepIndex].stationId,at:job.readyAt,assisted:job.assisted});job.stepIndex++;job.readyAt=null;
 if(job.stepIndex>=job.steps.length){job.status='haul';job.message='Model passed its checks. Drive the factory truck to Freight loading bay and load it.';}
 else{job.status='awaiting';job.message='Continue at '+(canonicalFactoryStation(job.steps[job.stepIndex].kind||job.steps[job.stepIndex].canonicalStationId||job.steps[job.stepIndex].stationId)?.name||job.steps[job.stepIndex].name)+'.';}
 return true;
}
function stationProximity(player,id,{vehicle=null,stations=FACTORY_STATIONS,kind}={}){
 const position=vehicle?.position||player.position,station=id?stationFor(id,stations):stations.filter(value=>!kind||value.kind===kind).sort((a,b)=>Math.hypot(a.position.x-position.x,a.position.z-position.z)-Math.hypot(b.position.x-position.x,b.position.z-position.z))[0];
 if(!station||kind&&station.kind!==kind)fail('Choose an active '+(canonicalFactoryStation(kind)?.name||'factory station')+'.',422);
 if(!near(position,station.position,vehicle?station.vehicleInteractionDistance||9:station.interactionDistance))fail('Move closer to '+station.name+' before using it.');return station;
}
function bindJobSteps(job,stations){
 if(!job||job.status==='processing')return;
 for(let index=job.stepIndex;index<job.steps.length;index++){const step=job.steps[index],role=canonicalFactoryStation(step.kind||step.canonicalStationId||step.stationId),station=stationFor(step.stationId,stations)||stations.find(value=>value.kind===role?.kind);step.kind=role?.kind;step.canonicalStationId=role?.id;step.stationId=station?.id||null;step.stationRevision=station?.stationRevision||null;}
 for(const kind of ['loading','dispatch']){const field=kind+'StationId';if(!stationFor(job[field],stations))job[field]=stations.find(value=>value.kind===kind)?.id||null;}
}
function assertOnFoot(player){if(player.vehicleId||player.seatedId||player.heldId)fail('Exit your vehicle and stand with your hands free to operate this station.');}
function ledger(data,wallet,user,type,amountMzk,requestId,job,now,extra={}){
 const balance=Number(user.tokens.MZK||0)+amountMzk;if(!Number.isSafeInteger(balance)||balance<0)fail('Not enough MZK for this production order.');user.tokens.MZK=balance;
 const entry={id:'factory-'+randomUUID(),type,walletId:wallet,amountMzk,balanceAfterMzk:balance,requestId,jobId:job?.id,recipeId:job?.recipeId,createdAt:new Date(now).toISOString(),...extra};(data.transactions ||= []).push(entry);return entry;
}
function drivingTruck(sim,player){
 const vehicle=sim.actors?.[player.vehicleId],kind=vehicle?.asset?.buildAssetId||vehicle?.modelId;
 if(!vehicle||kind!=='site-dumptruck'||vehicle.active===false||vehicle.holderId&&vehicle.holderId!==player.actorId)fail('Enter the factory dump truck to move this freight.');
 if(Math.abs(vehicle.driving?.speed||0)>.5)fail('Stop the truck before loading or delivering.');return vehicle;
}

/** Runs under the live room lock. Every authoritative job mutation, MZK debit,
 * machine reservation and item grant is also serialized in the durable wallet
 * database, so room resets and retries cannot duplicate purchases or outputs. */
export async function factoryCommand(sim,player,environment,command,now,{database,walletId}={}){
 const stations=factoryStations(environment,{actors:sim.actors}),crew=factoryCrew(environment,{actors:sim.actors});
 if(!isFactoryEnvironment(environment)&&!stations.length)fail('Factory jobs require active factory equipment in this map.');
 sim.factoryStations=stations;sim.factoryCrew=crew;
 if(!database)fail('Factory account storage is unavailable.',503);
 if(!Number.isFinite(now))fail('Invalid factory server time.',422);
 if(player.health<=0||player.replacedByRoom)fail('Rejoin the factory floor before working.');
 const wallet=cleanWallet(walletId),action=command.action;
 if(!['factory-start','factory-work','factory-haul','factory-assist','factory-collect','factory-status'].includes(action))fail('Choose a supported factory action.',422);
 const requestId=String(command.requestId||'');
 if(action!=='factory-status'&&(!requestId||requestId.length>140||/[\x00-\x1f\x7f]/.test(requestId)))fail('A factory request id of 1 to 140 characters is required.',422);
 const signature=JSON.stringify([action,command.recipeId||null,command.jobId||null,command.stationId||null,command.enabled??null]);
 const response=await database.transaction(data=>{
  const user=userFor(data,wallet),state=account(data,wallet);advance(data,state,now,{stations,environmentId:environment.id});if(state.job?.environmentId===environment.id)bindJobSteps(state.job,stations);
  const prior=action!=='factory-status'&&(data.transactions||[]).find(row=>row.type==='FACTORY_COMMAND'&&row.walletId===wallet&&row.requestId===requestId);
  if(prior){if(prior.signature!==signature)fail('This request id was already used for another factory action.');return {message:prior.message,factory:snapshot(state,user),duplicate:true};}
  if(action==='factory-status')return {message:state.job?.message||'Choose a production order at Procurement & jobs.',factory:snapshot(state,user)};
  let job=state.job,item=null;
  if(action==='factory-start'){
   const recipe=recipeFor(command.recipeId);if(!recipe)fail('Choose an available production recipe.',422);
   assertOnFoot(player);const procurement=stationProximity(player,command.stationId,{stations,kind:'procurement'}),steps=factoryRecipeSteps(recipe,stations);
   const missing=['fabrication','assembly','calibration','loading','dispatch'].find(kind=>!stations.some(station=>station.kind===kind));if(missing)fail('Place an active '+canonicalFactoryStation(missing).name+' before funding a production order.');
   if(job&&job.status!=='collected')fail('Finish and collect your current production order first.');
   const credits=data.factoryLogistics?.productionCredits,available=Number(credits?.[wallet]||0),supplyCreditMzk=Number.isSafeInteger(available)&&available>0?Math.min(20,recipe.costMzk):0,costMzk=recipe.costMzk-supplyCreditMzk;
   job={id:randomUUID(),environmentId:environment.id,recipeId:recipe.id,name:recipe.name,costMzk,baseCostMzk:recipe.costMzk,supplyCreditMzk,buildAssetId:recipe.buildAssetId,status:'awaiting',stepIndex:0,steps,procurementStationId:procurement.id,loadingStationId:stations.find(station=>station.kind==='loading').id,dispatchStationId:stations.find(station=>station.kind==='dispatch').id,startedAt:now,readyAt:null,assisted:false,completedSteps:[],message:'Order funded.'+(supplyCreditMzk?' Shipping parts saved '+supplyCreditMzk+' MZK.':'')+' Walk to Component fabrication to begin.'};
   ledger(data,wallet,user,'FACTORY_ORDER',-costMzk,requestId,job,now,{reason:recipe.name+' production order',supplyCreditMzk});if(supplyCreditMzk)credits[wallet]--;state.totalSpentMzk+=costMzk;state.job=job;
  }else{
   if(!job||command.jobId!==job.id)fail('This factory job is no longer current. Refresh the production board.');
   if(job.environmentId!==environment.id)fail('Return to the map where you started this production order.');
   if(action==='factory-assist'){
    assertOnFoot(player);if(!crew.some(person=>near(player.position,person.position||person.home,8)))fail('Meet a factory crew member before requesting assistance.');
    if(!['awaiting','processing'].includes(job.status))fail('Crew assistance is available during production.');
    if(typeof command.enabled!=='boolean')fail('Choose whether crew assistance is enabled.',422);
    job.assisted=command.enabled;job.message=job.assisted?'Crew assistance assigned. Your next machine cycle runs 25% faster.':'Manual production selected. Operate each station yourself.';
   }else if(action==='factory-work'){
    assertOnFoot(player);const step=job.steps[job.stepIndex];
    if(job.status!=='awaiting'||!step)fail(job.status==='processing'?'The current machine cycle is still running.':'Continue with the current freight or collection task.');
    const expected=canonicalFactoryStation(step.kind||step.canonicalStationId||step.stationId),station=stationFor(command.stationId,stations);
    if(!station||station.kind!==expected?.kind)fail('Complete '+(expected?.name||'the next production cell')+' next.');stationProximity(player,station.id,{stations,kind:expected.kind});step.stationId=station.id;step.stationRevision=station.stationRevision;
    const key=environment.id+':'+station.id,lock=data.factory.stationLocks[key];if(lock&&lock.jobId!==job.id&&lock.expiresAt>now)fail('This machine is processing another order. Wait for its cycle to finish.');
    job.status='processing';job.cycleStartedAt=now;job.readyAt=now+Math.ceil(step.durationMs*(job.assisted ? .75 : 1));job.message=step.name+' in progress.';
    data.factory.stationLocks[key]={jobId:job.id,expiresAt:job.readyAt,stationId:step.stationId};
   }else if(action==='factory-haul'){
    const vehicle=drivingTruck(sim,player);
    if(job.status==='haul'){
     const loading=stationProximity(player,command.stationId||job.loadingStationId,{vehicle,stations,kind:'loading'});job.loadingStationId=loading.id;
     if(Object.values(data.factory.accounts).some(other=>other.job?.id!==job.id&&other.job?.status==='loaded'&&other.job?.vehicleId===vehicle.id&&other.job?.environmentId===environment.id))fail('This truck already carries another production order.');
     job.status='loaded';job.vehicleId=vehicle.id;job.loadedAt=now;job.message='Freight loaded. Follow the haul lane to Dispatch & collection in this truck.';
    }else if(job.status==='loaded'){
     const dispatch=stationProximity(player,command.stationId||job.dispatchStationId,{vehicle,stations,kind:'dispatch'});job.dispatchStationId=dispatch.id;
     if(job.vehicleId!==vehicle.id)fail('Deliver using the same truck that loaded this order.');
     if(now-job.loadedAt<5000)fail('Complete the freight route before delivery.');
     job.status='ready';job.deliveredAt=now;job.message='Freight delivered. Exit the truck and collect your finished model at dispatch.';
    }else fail('Complete production before loading, or collect the delivered model.');
   }else if(action==='factory-collect'){
    assertOnFoot(player);stationProximity(player,command.stationId||job.dispatchStationId,{stations,kind:'dispatch'});
    if(job.status==='collected')return {message:'This model is already in your Backpack.',factory:snapshot(state,user),duplicate:true};
    if(job.status!=='ready')fail('Complete the production cells and freight delivery before collection.');
    if(user.items.length>=10000)fail('Your Backpack is full. Make room before collecting.');
    item={id:'factory-item:'+job.id,name:job.name,type:'factory-model',assetType:'props',buildAssetId:job.buildAssetId,format:'procedural-3d',source:'missile-factory',factoryJobId:job.id,recipeId:job.recipeId,description:recipeFor(job.recipeId).description,configuration:{behavior:'decor',buildAssetId:job.buildAssetId,animated:true},listing:{active:false},acquiredAt:new Date(now).toISOString()};
    if(!user.items.some(owned=>owned.id===item.id))user.items.push(item);
    job.status='collected';job.collectedAt=now;job.itemId=item.id;job.message=job.name+' saved to Backpack. Start another factory job when you are ready.';state.completedJobs++;state.skills.fabrication=(state.skills.fabrication||0)+1;state.skills.logistics=(state.skills.logistics||0)+1;
    for(const [count,badge]of [[1,'Factory Apprentice'],[5,'Production Specialist'],[10,'Factory Foreman']])if(state.completedJobs>=count&&!state.badges.includes(badge))state.badges.push(badge);
    ledger(data,wallet,user,'FACTORY_ITEM_CREATED',0,requestId,job,now,{itemId:item.id,reason:job.name+' collected'});
   }
  }
  stamp(user,now);ledger(data,wallet,user,'FACTORY_COMMAND',0,requestId,job,now,{signature,message:job.message});
  return {message:job.message,factory:snapshot(state,user),...(item?{item}:{})};
 });
 if(response.factory.job?.status==='processing')preemptFactoryCrewStation(sim,response.factory.job.steps[response.factory.job.stepIndex]?.stationId,now,player.actorId);
 player.factory=response.factory;sim.factoryEnabled=true;
 if(response.factory.job?.status==='loaded'){const vehicle=sim.actors?.[response.factory.job.vehicleId];if(vehicle)vehicle.factoryCargo={jobId:response.factory.job.id,name:response.factory.job.name,buildAssetId:response.factory.job.buildAssetId};}
 else for(const actor of Object.values(sim.actors||{}))if(actor.factoryCargo?.jobId===response.factory.job?.id)delete actor.factoryCargo;
 return response;
}

export async function factoryAccountState(database,walletId,{now=Date.now(),environment,actors}={}){
 const wallet=cleanWallet(walletId);return database.transaction(data=>{const user=userFor(data,wallet),state=account(data,wallet);if(environment){const stations=factoryStations(environment,{actors});advance(data,state,now,{stations,environmentId:environment.id});if(state.job?.environmentId===environment.id)bindJobSteps(state.job,stations);}return snapshot(state,user);});
}
/** Wallet item fields can be edited through older save clients. Only the
 * immutable server crafting receipt authorizes deployment of a factory asset. */
export async function resolveFactoryAsset(database,walletId,itemId){
 const wallet=cleanWallet(walletId);await database.initialize();const data=await database.read(),user=data.users[wallet];
 if(!user?.items?.some(item=>item.id===itemId))return null;
 const proof=ownedFactoryModel(data,wallet,itemId);if(!proof)return null;
 if(itemLocked(data,wallet,itemId,Date.now())||factoryModelTestLocked(data,proof))fail('Finish or cancel this model’s launch or freight manifest before placing a display copy.');
 return {id:itemId,name:proof.name,buildAssetId:proof.buildAssetId,assetType:'props',type:'factory-model',behavior:'decor',format:'procedural-3d',source:'missile-factory',targetHeight:proof.profileId==='cargo'?7:4.5};
}
export async function assertFactoryDeploymentAvailable(database,walletId,command){
 const wallet=cleanWallet(walletId);await database.initialize();const data=await database.read();
 const ids=new Set([command.itemId,command.sku?'economy:'+command.sku:null]);
 for(const itemId of ids){const proof=ownedFactoryModel(data,wallet,itemId);if(proof&&(itemLocked(data,wallet,itemId,Date.now())||factoryModelTestLocked(data,proof)))fail('Finish or cancel this model’s launch or freight manifest before placing a display copy.');}
}
export function stepFactory(sim,environment,now){sim.factoryStations=factoryStations(environment,{actors:sim.actors});sim.factoryCrew=factoryCrew(environment,{actors:sim.actors});sim.factoryEnabled=isFactoryEnvironment(environment)||sim.factoryStations.length>0;if(!sim.factoryEnabled)return;for(const player of Object.values(sim.players||{})){const job=player.factory?.job;if(job?.status==='processing')job.remainingMs=Math.max(0,job.readyAt-now);}}
export function factoryView(sim,now){
 if(!sim.factoryEnabled)return null;
 const jobs=Object.values(sim.players||{}).filter(player=>player.factory?.job&&now-player.lastSeen<15000).map(player=>({playerId:player.actorId,name:player.username||'Factory worker',job:clone(player.factory.job)}));
 const crewWork=factoryCrewWorkView(sim,now);if(crewWork?.job)jobs.push({playerId:null,name:'Factory crew · shared demonstration',ai:true,demonstration:true,job:crewWork.job});
 return {id:FACTORY_ID,stations:(sim.factoryStations||[]).map(station=>({...station,occupiedBy:jobs.find(row=>row.job.status==='processing'&&row.job.readyAt>now&&row.job.steps[row.job.stepIndex]?.stationId===station.id)?.playerId||crewWork?.reservations.find(lock=>lock.stationId===station.id)?.workerId||null})),recipes:FACTORY_RECIPES,crew:sim.factoryCrew||[],jobs,crewWork};
}
