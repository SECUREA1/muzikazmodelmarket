import {randomUUID} from 'node:crypto';
import {cleanWallet} from './user-json-database.mjs';
import {FORGE_ID,FORGE_STATIONS,isForgeEnvironment,forgeStations} from './public/js/forge-config.js';
import {FORGE_RECIPES,FORGE_STAGE_ORDER,FORGE_STRIKE_COOLDOWN_MS,forgeRecipe} from './public/js/forge-recipes.js';
import {ownedForgeItem,canonicalForgeItem} from './forge-item-provenance.mjs';

const fail=(message,statusCode=409)=>{throw Object.assign(Error(message),{statusCode});};
const copy=value=>structuredClone(value);
const distance=(a,b)=>a&&b?Math.hypot(a.x-b.x,(a.y||0)-(b.y||0),a.z-b.z):Infinity;
const stationRevision=station=>JSON.stringify([station.id,station.kind,station.position,station.approach,station.interactionDistance]);
const stageName=kind=>FORGE_STATIONS.find(station=>station.kind===kind)?.name||kind;
function account(data,wallet){data.forge ||= {accounts:{},stationLocks:{}};data.forge.accounts ||= {};data.forge.stationLocks ||= {};return data.forge.accounts[wallet] ||= {job:null,completedItems:0,totalSpentMzk:0,byRecipe:{},badges:[]};}
function userFor(data,wallet){const user=data.users[wallet];if(!user)fail('Member wallet not found.',404);user.tokens ||= {MZK:0};user.items ||= [];return user;}
const progress=state=>({completedItems:state.completedItems,totalSpentMzk:state.totalSpentMzk,byRecipe:{...state.byRecipe},badges:[...state.badges]});
const snapshot=(state,user)=>({job:copy(state.job),progress:progress(state),balance:Number(user.tokens.MZK||0)});
export const publicForgeState=state=>state?{job:copy(state.job||null),progress:copy(state.progress||{})}:null;
function release(data,job){for(const [id,lock]of Object.entries(data.forge.stationLocks))if(lock.jobId===job.id)delete data.forge.stationLocks[id];}
function advanceStage(job,now){
 job.completedStages.push({stage:job.stage,at:now});job.stage=FORGE_STAGE_ORDER[FORGE_STAGE_ORDER.indexOf(job.stage)+1];job.status='awaiting';job.readyAt=null;job.stationId=null;job.stationRevision=null;job.message='Continue at '+stageName(job.stage)+'.';
}
function advance(data,state,environment,stations,now){
 const job=state.job;if(!job||job.environmentId!==environment?.id||job.status!=='processing')return;
 const station=stations.find(station=>station.id===job.stationId&&station.kind===job.stage);
 if(!station||stationRevision(station)!==job.stationRevision){release(data,job);job.status='awaiting';job.readyAt=null;job.message='Equipment changed during the cycle. Restart this stage at an active '+stageName(job.stage)+'.';return;}
 if(now>=job.readyAt){release(data,job);advanceStage(job,job.readyAt);}
}
function proximity(player,stations,kind,stationId){
 const candidates=stations.filter(station=>station.kind===kind&&(!stationId||station.id===stationId));
 const station=candidates.sort((a,b)=>distance(player.position,a.approach||a.position)-distance(player.position,b.approach||b.position))[0];
 if(!station)fail('Place or enable '+stageName(kind)+' before using this stage.',422);
 if(distance(player.position,station.approach||station.position)>station.interactionDistance)fail('Walk closer to '+station.name+' before working.');
 return station;
}
function record(data,user,wallet,type,now,extra={}){const receipt={id:'forge-receipt:'+randomUUID(),type,walletId:wallet,amountMzk:0,balanceAfterMzk:Number(user.tokens.MZK||0),createdAt:new Date(now).toISOString(),...extra};(data.transactions ||= []).push(receipt);return receipt;}

/** Every material debit, authoritative operation and output is committed in the
 * same wallet transaction. Editable save memory cannot fabricate progress. */
export async function forgeCommand(sim,player,environment,command,now,{database,walletId}={}){
 if(!isForgeEnvironment(environment))fail('Forge work requires an active forge map.');
 if(!database)fail('Forge account storage is unavailable.',503);
 if(!Number.isFinite(now))fail('The forge server clock is unavailable.',422);
 const wallet=cleanWallet(walletId),action=command.action,stations=forgeStations(environment);
 if(player.walletId&&cleanWallet(player.walletId)!==wallet)fail('This work order belongs to another account.',403);
 if(!['forge-status','forge-start',...FORGE_STAGE_ORDER.map(stage=>'forge-'+stage)].includes(action))fail('Choose a supported forge action.',422);
 if(action!=='forge-status'&&(player.health<=0||player.replacedByRoom||player.grounded===false||player.vehicleId||player.seatedId||player.heldId))fail('Stand on the forge floor with your hands free before working.');
 const requestId=String(command.requestId||'');
 if(action!=='forge-status'&&(!requestId||requestId.length>140||/[\x00-\x1f\x7f]/.test(requestId)))fail('A forge request id of 1 to 140 characters is required.',422);
 const signature=JSON.stringify([action,command.recipeId||null,command.jobId||null,command.stationId||null]);
 const response=await database.transaction(data=>{
  const user=userFor(data,wallet),state=account(data,wallet);advance(data,state,environment,stations,now);
  const prior=action!=='forge-status'&&(data.transactions||[]).find(row=>row.type==='FORGE_COMMAND'&&row.walletId===wallet&&row.requestId===requestId);
  if(prior){if(prior.signature!==signature)fail('This request id was already used for another forge action.');const receipt=(data.transactions||[]).find(row=>row.id===prior.forgeReceiptId);return {message:prior.message,forge:snapshot(state,user),duplicate:true,...(receipt?{forgeReceipt:receipt}:{}),...(prior.itemId&&ownedForgeItem(data,wallet,prior.itemId)?{item:canonicalForgeItem(ownedForgeItem(data,wallet,prior.itemId))}:{})};}
  if(action==='forge-status')return {message:state.job?.message||'Choose a workpiece at the metal and fuel rack.',forge:snapshot(state,user)};
  let job=state.job,item=null,receipt=null;
  if(action==='forge-start'){
   const recipe=forgeRecipe(command.recipeId);if(!recipe)fail('Choose a listed forge recipe.',422);
   proximity(player,stations,'sourcing',command.stationId);
   const missing=FORGE_STAGE_ORDER.find(stage=>!stations.some(station=>station.kind===stage));if(missing)fail('Place or enable '+stageName(missing)+' before funding a workpiece.');
   if(job&&job.status!=='collected')fail('Finish your current forge workpiece before buying another material kit.');
   const balance=Number(user.tokens.MZK||0);if(!Number.isSafeInteger(balance)||balance<recipe.costMzk)fail('Not enough MZK for this metal and fuel kit.');
   job={id:randomUUID(),environmentId:environment.id,recipeId:recipe.id,buildAssetId:recipe.buildAssetId,name:recipe.name,status:'awaiting',stage:'heat',readyAt:null,strikes:0,requiredStrikes:recipe.hammerStrikes,completedStages:[],materials:copy(recipe.materials),costMzk:recipe.costMzk,startedAt:now,message:'Metal and fuel counted into your workpiece. Continue at '+stageName('heat')+'.'};
   user.tokens.MZK=balance-recipe.costMzk;state.job=job;state.totalSpentMzk+=recipe.costMzk;
   receipt=record(data,user,wallet,'FORGE_MATERIAL_KIT',now,{requestId,jobId:job.id,recipeId:recipe.id,environmentId:environment.id,amountMzk:-recipe.costMzk,materials:copy(recipe.materials),reason:recipe.name+' metal and fuel consumed into workpiece'});
  }else{
   if(!job||command.jobId!==job.id)fail('This forge workpiece is no longer current. Refresh the work order.');
   if(job.environmentId!==environment.id)fail('Return to the forge where this workpiece was started.');
   if(job.status==='collected'&&action==='forge-finish')return {message:'This workpiece is already saved in your Backpack.',forge:snapshot(state,user),duplicate:true};
   const stage=action.slice(6);if(job.stage!==stage)fail('Complete '+stageName(job.stage)+' before this operation.');
   if(job.status==='processing')fail('Wait for the current heat treatment cycle to finish.');
   const station=proximity(player,stations,stage,command.stationId),key=environment.id+':'+station.id,lock=data.forge.stationLocks[key];
   if(lock&&lock.jobId!==job.id&&lock.expiresAt>now)fail('This station is processing another workpiece. Wait for its cycle to finish.');
   const recipe=forgeRecipe(job.recipeId);if(!recipe)fail('The current forge recipe is unavailable.',503);
   if(stage==='heat'||stage==='temper'){
    const duration=stage==='heat'?recipe.heatMs:recipe.temperMs;job.status='processing';job.readyAt=now+duration;job.stationId=station.id;job.stationRevision=stationRevision(station);job.cycleStartedAt=now;job.message=stage==='heat'?'Billet heating. Let the hearth reach forging temperature.':'Tempering in progress. Let the heat treatment restore toughness.';
    data.forge.stationLocks[key]={jobId:job.id,expiresAt:job.readyAt};
   }else if(stage==='hammer'){
    if(job.lastStrikeAt!==undefined&&now-job.lastStrikeAt<FORGE_STRIKE_COOLDOWN_MS)fail('Let the hammer recover before the next controlled strike.',429);
    job.lastStrikeAt=now;job.strikes++;job.message='Controlled anvil strikes '+job.strikes+'/'+job.requiredStrikes+'.';if(job.strikes>=job.requiredStrikes)advanceStage(job,now);
   }else if(stage==='quench'){advanceStage(job,now);job.message='Workpiece quenched. Continue at '+stageName('temper')+'.';}
   else if(stage==='finish'){
    if(user.items.length>=10000)fail('Your Backpack is full. Make room before collecting.');
    const itemId='forge-item:'+job.id;
    receipt=record(data,user,wallet,'FORGE_ITEM_CREATED',now,{requestId,jobId:job.id,recipeId:job.recipeId,buildAssetId:recipe.buildAssetId,itemId,environmentId:environment.id,materials:copy(recipe.materials)});
    item=canonicalForgeItem({id:itemId,buildAssetId:recipe.buildAssetId,recipeId:job.recipeId,jobId:job.id,proofId:receipt.id,crafted:true,materials:recipe.materials,acquiredAt:receipt.createdAt});
    user.items.push(item);job.status='collected';job.collectedAt=now;job.itemId=itemId;job.completedStages.push({stage:'finish',at:now});job.message=item.name+' finished and saved in your Backpack.';
    state.completedItems++;state.byRecipe[job.recipeId]=(state.byRecipe[job.recipeId]||0)+1;
    for(const [count,badge]of [[1,'Forge Apprentice'],[4,'Journeyman Smith'],[10,'Master Metallurgist']])if(state.completedItems>=count&&!state.badges.includes(badge))state.badges.push(badge);
   }
  }
  user.revision=Number(user.revision||0)+1;user.updatedAt=new Date(now).toISOString();
  record(data,user,wallet,'FORGE_COMMAND',now,{requestId,signature,jobId:job.id,message:job.message,...(receipt?{forgeReceiptId:receipt.id}:{}),...(item?{itemId:item.id}:{})});
  return {message:job.message,forge:snapshot(state,user),...(item?{item}:{}),...(receipt?{forgeReceipt:receipt}:{})};
 });
 player.forge=response.forge;sim.forgeEnabled=true;sim.forgeStations=stations;return response;
}
export async function forgeAccountState(database,walletId,{now=Date.now(),environment}={}){
 const wallet=cleanWallet(walletId);return database.transaction(data=>{const user=userFor(data,wallet),state=account(data,wallet);if(environment)advance(data,state,environment,forgeStations(environment),now);return snapshot(state,user);});
}
export async function resolveForgeAsset(database,walletId,itemId){
 const wallet=cleanWallet(walletId);await database.initialize();const data=await database.read(),proof=ownedForgeItem(data,wallet,itemId);return proof?canonicalForgeItem(proof):null;
}
export function forgeView(sim){return sim.forgeEnabled?{id:FORGE_ID,stations:sim.forgeStations||[],recipes:FORGE_RECIPES}:null;}
