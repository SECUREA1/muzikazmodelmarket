import {randomUUID} from 'node:crypto';
import {cleanWallet} from './user-json-database.mjs';
import {nativeBuilderItem} from './public/js/native-builder-items.js';
import {FOREST_SPECIES,FOREST_PRODUCTS,FOREST_RECIPES,FOREST_STATIONS,isForestHarvestEnvironment} from './public/js/forest-harvest-config.js';

const fail=(message,statusCode=409)=>{throw Object.assign(Error(message),{statusCode});};
const exportType='FOREST_ITEM_EXPORTED';
const source='forest-harvest-earned';
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value||{},key);
function context(sim,player,environment,walletId){
 if(!isForestHarvestEnvironment(environment)||!sim.forestHarvest||!player.forestHarvest)fail('Start a forest shift before exporting lumber.');
 const wallet=cleanWallet(walletId);
 if(!player.walletId||cleanWallet(player.walletId)!==wallet)fail('This forest shift belongs to another account.',403);
 if(!sim.forestHarvest.instanceId)sim.forestHarvest.instanceId=randomUUID();
 return {wallet,self:player.forestHarvest,scope:sim.forestHarvest.instanceId,actorId:player.actorId};
}
function localDebit(self,receipt){
 self.exportReceipts ||= [];
 if(self.exportReceipts.includes(receipt.id))return;
 if(receipt.kind==='lumber'){
  const available=self.stock?.dry?.[receipt.stockKey]||0;
  if(!Number.isSafeInteger(available)||available<receipt.quantity)fail('Forest stock needs recovery before this export can be reconciled.',503);
  self.stock.dry[receipt.stockKey]=available-receipt.quantity;
 }else{
  const index=self.crafted?.findIndex(item=>item.id===receipt.craftedId);
  if(index===undefined||index<0)fail('The exported crafted batch needs recovery before another export.',503);
  self.crafted.splice(index,1);
 }
 self.exportReceipts.push(receipt.id);
}
const scopeReceipts=(data,wallet,scope,actorId)=>(data.transactions||[]).filter(row=>row.type===exportType&&row.walletId===wallet&&row.scope===scope&&row.actorId===actorId);

/** Account receipts outlive a partially saved room. Reconcile them before every
 * forest command so recovered room stock cannot be spent or exported twice. */
export async function reconcileForestExports(database,walletId,sim,player,environment){
 if(!isForestHarvestEnvironment(environment)||!player.forestHarvest)return;
 if(!database)fail('Forest Backpack storage is unavailable.',503);
 const {wallet,self,scope,actorId}=context(sim,player,environment,walletId);
 await database.initialize();
 for(const receipt of scopeReceipts(await database.read(),wallet,scope,actorId))localDebit(self,receipt);
}
function canonicalItem(receipt,id){
 const species=FOREST_SPECIES[receipt.speciesId],recipe=receipt.kind==='crafted'?FOREST_RECIPES[receipt.recipeId]:null,product=receipt.kind==='lumber'?FOREST_PRODUCTS[receipt.productId]:null;
 if(!species||(!recipe&&!product))return null;
 const buildAssetId=recipe?.modelId||'forestry-lumber-'+product.id,native=nativeBuilderItem(buildAssetId);
 if(!native)return null;
 const name=species.name+' '+(recipe?.name||product.name),configuration={behavior:'decor',action:'none',damage:0,buildAssetId,materialId:'wood',color:species.woodColor,forestSpecies:species.id,forestProduct:product?.id||null,forestRecipe:recipe?.id||null};
 return {...native,id,name,buildAssetId,configuration,function_data:configuration,type:'forest-item',assetType:'props',format:'procedural-3d',behavior:'decor',source,earnedOnly:true,tradable:false,listing:{active:false},color:species.woodColor,materialId:'wood',forestry:{speciesId:species.id,productId:product?.id||null,recipeId:recipe?.id||null,receiptId:receipt.id},acquiredAt:receipt.createdAt};
}
function intent(command){
 if(command.kind==='lumber'){
  if(!own(FOREST_SPECIES,command.speciesId)||!own(FOREST_PRODUCTS,command.productId))fail('Choose a lumber species and product.',422);
  if(!Number.isSafeInteger(command.quantity)||command.quantity<1||command.quantity>50)fail('Export between 1 and 50 dry lumber units.',422);
  return {kind:'lumber',speciesId:command.speciesId,productId:command.productId,quantity:command.quantity,stockKey:command.speciesId+':'+command.productId};
 }
 if(command.kind==='crafted'&&typeof command.craftedId==='string'&&/^[\w-]{1,100}$/.test(command.craftedId))return {kind:'crafted',craftedId:command.craftedId};
 fail('Choose dry lumber or a completed crafted batch.',422);
}
function matches(receipt,wanted){return Object.entries(wanted).every(([key,value])=>receipt[key]===value);}

/** The room lock owns the earned stock; the account transaction owns delivered
 * inventory. Only canonical server recipes/species can become Backpack items. */
export async function exportForestItem(sim,player,environment,command,now,{database,walletId}={}){
 if(command.action!=='forest-export')fail('Choose a supported forest export action.',422);
 if(!database)fail('Forest Backpack storage is unavailable.',503);
 if(!Number.isFinite(now))fail('The forest clock is unavailable.',422);
 const {wallet,self,scope,actorId}=context(sim,player,environment,walletId);
 if(player.health<=0||player.vehicleId||player.seatedId||player.grounded===false||player.replacedByRoom)fail('Stand at the timber workshop before exporting.');
 const workshop=FOREST_STATIONS.find(station=>station.kind==='craft'),position=player.position;
 if(!position||![workshop.position,workshop.approach].some(point=>Math.hypot(position.x-point.x,(position.y||0)-(point.y||0),position.z-point.z)<=10))fail('Walk closer to the timber workshop to export.');
 const requestId=String(command.requestId||'');if(!/^[\w-]{1,100}$/.test(requestId))fail('A forest export request id is required.',422);
 const wanted=intent(command);
 const response=await database.transaction(data=>{
  const user=data.users[wallet];if(!user)fail('Member wallet not found.',404);user.items ||= [];
  const receipts=scopeReceipts(data,wallet,scope,actorId);
  // Validate every pending debit on a copy before modifying either live store.
  const reconciled=structuredClone(self);for(const receipt of receipts)localDebit(reconciled,receipt);
  let receipt=(data.transactions||[]).find(row=>row.type===exportType&&row.walletId===wallet&&row.requestId===requestId);
  if(receipt&&(receipt.scope!==scope||receipt.actorId!==actorId||!matches(receipt,wanted)))fail('This request id was already used for another forest export.');
  let duplicate=!!receipt;
  if(!receipt&&wanted.kind==='crafted'){
   receipt=receipts.find(row=>row.kind==='crafted'&&row.craftedId===wanted.craftedId);
   duplicate=!!receipt;
  }
  if(!receipt){
   let details=wanted;
   if(wanted.kind==='lumber'){
    if((reconciled.stock?.dry?.[wanted.stockKey]||0)<wanted.quantity)fail('Dry that quantity of harvested lumber before exporting.');
   }else{
    const crafted=reconciled.crafted?.find(item=>item.id===wanted.craftedId);
    if(!crafted||!own(FOREST_RECIPES,crafted.recipeId)||!own(FOREST_SPECIES,crafted.speciesId))fail('Craft that batch at the workshop before exporting.');
    if(!Number.isSafeInteger(crafted.quantity)||crafted.quantity<1||crafted.quantity>50)fail('This crafted batch is invalid.',422);
    details={...wanted,recipeId:crafted.recipeId,speciesId:crafted.speciesId,quantity:crafted.quantity};
   }
   if(user.items.length+details.quantity>10000)fail('Your Backpack is full. Make room before exporting.');
   receipt={id:'forest-export:'+randomUUID(),type:exportType,walletId:wallet,scope,actorId,worldId:environment.id,requestId,...details,itemIds:Array.from({length:details.quantity},()=> 'forest-item:'+randomUUID()),createdAt:new Date(now).toISOString()};
   const items=receipt.itemIds.map(id=>canonicalItem(receipt,id));if(items.some(item=>!item))fail('The selected lumber model is unavailable.',503);
   user.items.push(...items);(data.transactions ||= []).push(receipt);user.revision=Number(user.revision||0)+1;user.updatedAt=receipt.createdAt;
  }
  const items=receipt.itemIds.map(id=>user.items.some(item=>item.id===id)?canonicalItem(receipt,id):null);
  if(items.some(item=>!item))fail('This export was already delivered. Its original Backpack items are no longer present.');
  return {items,forestReceipt:receipt,duplicate,message:duplicate?'This forest export is already saved in your Backpack.':receipt.quantity+' earned timber '+(receipt.quantity===1?'item':'items')+' saved to your Backpack.'};
 });
 // Apply all receipts, including an account write completed before room recovery.
 await reconcileForestExports(database,wallet,sim,player,environment);
 return response;
}

export async function resolveForestAsset(database,walletId,itemId){
 if(!String(itemId||'').startsWith('forest-item:'))return null;
 const wallet=cleanWallet(walletId);await database.initialize();const data=await database.read();
 if(!data.users[wallet]?.items?.some(item=>item.id===itemId))return null;
 const receipt=(data.transactions||[]).find(row=>row.type===exportType&&row.walletId===wallet&&row.itemIds?.includes(itemId));
 return receipt?canonicalItem(receipt,itemId):null;
}
