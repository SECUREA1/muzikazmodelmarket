import {randomUUID} from 'node:crypto';
import {cleanWallet} from './user-json-database.mjs';
import {PRISON_STATIONS,isPrisonEnvironment} from './public/js/prison-config.js';
import {PRISON_REWARDS,prisonRewardFor} from './public/js/prison-rewards.js';
import {prisonNativeItem} from './public/js/prison-items.js';
import {prisonView} from './public/js/prison-game.js';

const fail=(message,statusCode=409)=>{throw Object.assign(Error(message),{statusCode});};
const earned=(data,wallet)=>Object.fromEntries((data.transactions||[]).filter(row=>row.type==='PRISON_ITEM_EARNED'&&row.walletId===wallet&&prisonRewardFor(row.buildAssetId)).map(row=>[row.buildAssetId,row]));
const stateFor=(data,wallet)=>({claimedItems:Object.keys(earned(data,wallet))});
export function applyPrisonRewardState(sim,player,rewards){
 const self=sim.prison?.players?.[player.actorId];if(self)self.claimedItems=[...(rewards?.claimedItems||[])];
}
export async function prisonAccountState(database,walletId){
 const wallet=cleanWallet(walletId);await database.initialize();return stateFor(await database.read(),wallet);
}
function canonicalItem(id,buildAssetId,now){
 const native=prisonNativeItem(buildAssetId);
 return {...native,configuration:{...native.function_data},id,type:'prison-item',assetType:'props',buildAssetId,economySku:'backpack:builder-'+buildAssetId,format:'procedural-3d',source:'prison-earned',earnedOnly:true,tradable:false,listing:{active:false},acquiredAt:new Date(now).toISOString()};
}
/** Runs under the room lock and durable account transaction. Only the room's
 * canonical milestone opens a claim; client reward, balance and item fields
 * never cross into the account record. A lifetime receipt prevents farming. */
export async function claimPrisonItem(sim,player,environment,command,now,{database,walletId}={}){
 if(command.action!=='prison-claim-item')fail('Choose a supported prison collection action.',422);
 if(!isPrisonEnvironment(environment))fail('Collect earned items at Ironwood Prison intake.');
 if(!database)fail('Prison Backpack storage is unavailable.',503);
 if(!Number.isFinite(now))fail('The prison clock is unavailable.',422);
 if(player.health<=0||player.vehicleId||player.seatedId||player.grounded===false||player.replacedByRoom)fail('Stand at intake before collecting a Backpack item.');
 const intake=PRISON_STATIONS.find(station=>station.id==='intake'),position=player.position;
 if(command.stationId!=='intake'||!position||Math.hypot(position.x-intake.position.x,(position.y||0)-(intake.position.y||0),position.z-intake.position.z)>intake.interactionDistance)fail('Walk closer to intake to collect your earned item.');
 const reward=prisonRewardFor(command.itemId);if(!reward)fail('Choose an earned prison collectible.',422);
 const requestId=String(command.requestId||'');if(!/^[\w-]{1,100}$/.test(requestId))fail('A prison collection request id is required.',422);
 const wallet=cleanWallet(walletId);if(player.walletId&&cleanWallet(player.walletId)!==wallet)fail('This prison shift belongs to another account.',403);
 const self=sim.prison?.players?.[player.actorId];if(!self)fail('Start your prison shift before collecting.');
 if(self.caughtUntil>now)fail('Finish your detention before collecting a Backpack item.');
 const response=await database.transaction(data=>{
  const user=data.users[wallet];if(!user)fail('Member wallet not found.',404);user.items ||= [];
  const prior=(data.transactions||[]).find(row=>row.type==='PRISON_CLAIM_COMMAND'&&row.walletId===wallet&&row.requestId===requestId);
  if(prior&&prior.buildAssetId!==reward.id)fail('This request id was already used for another prison collectible.');
  let receipt=earned(data,wallet)[reward.id],duplicate=Boolean(receipt);
  if(!receipt){
   if(!self.completed?.includes(reward.goal))fail(reward.instructions);
   if(user.items.length>=10000)fail('Your Backpack is full. Make room before collecting.');
   const id='prison-item:'+randomUUID(),item=canonicalItem(id,reward.id,now);user.items.push(item);
   receipt={id:'prison-reward-'+randomUUID(),type:'PRISON_ITEM_EARNED',walletId:wallet,itemId:id,buildAssetId:reward.id,goal:reward.goal,worldId:environment.id,requestId,createdAt:new Date(now).toISOString()};
   (data.transactions ||= []).push(receipt);user.revision=Number(user.revision||0)+1;user.updatedAt=new Date(now).toISOString();
  }
  const item=user.items.find(item=>item.id===receipt.itemId);
  if(!item)fail('This collectible was already claimed. Its original Backpack record is no longer present.');
  if(!prior)(data.transactions ||= []).push({id:'prison-claim-'+randomUUID(),type:'PRISON_CLAIM_COMMAND',walletId:wallet,requestId,buildAssetId:reward.id,itemId:receipt.itemId,createdAt:new Date(now).toISOString()});
  return {item:canonicalItem(receipt.itemId,reward.id,Date.parse(receipt.createdAt)),prisonReceipt:{id:receipt.id,itemId:receipt.itemId,buildAssetId:reward.id,goal:reward.goal},rewards:stateFor(data,wallet),duplicate,message:duplicate?'This collectible is already saved in your Backpack.':reward.name+' saved to your Backpack. Take it to another world and place it there.'};
 });
 applyPrisonRewardState(sim,player,response.rewards);delete response.rewards;
 return {...response,prison:prisonView(sim.prison,player.actorId)};
}
/** Mutable legacy wallet fields cannot manufacture a prison item or change the
 * awarded model. Both the account-bound receipt and owned item id must agree. */
export async function resolvePrisonAsset(database,walletId,itemId){
 const wallet=cleanWallet(walletId);await database.initialize();const data=await database.read(),user=data.users[wallet];
 if(!user?.items?.some(item=>item.id===itemId))return null;
 const receipt=(data.transactions||[]).find(row=>row.type==='PRISON_ITEM_EARNED'&&row.walletId===wallet&&row.itemId===itemId);
 if(!receipt||!prisonRewardFor(receipt.buildAssetId))return null;
 return canonicalItem(itemId,receipt.buildAssetId,Date.parse(receipt.createdAt));
}
