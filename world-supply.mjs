import {createHash} from 'node:crypto';
import {GAME_ECONOMY,CARE_SUPPLIES} from './game-economy.mjs';
import {ownedCustomFactoryItem} from './world-factory-catalog.mjs';

export const INITIAL_WORLD_STOCK=1000;
const fail=(message,statusCode=422)=>{throw Object.assign(new Error(message),{statusCode});};
const own=(value,key)=>Object.hasOwn(value,key);
const safeKey=value=>typeof value==='string'&&value.length>0&&value.length<=300&&!['__proto__','prototype','constructor'].includes(value);
const modelPath=value=>{try{const url=new URL(String(value||''),'https://catalog.invalid/');return decodeURIComponent((url.origin==='https://catalog.invalid'?'':url.origin)+url.pathname).replace(/^\/+/, '');}catch{return String(value||'').split(/[?#]/)[0].replace(/^\/+/, '');}};
const storeId=value=>String(value||'').replace(/^(?:repository-|store-model-)/,'');
const physical=item=>item&&!item.earnedOnly&&item.visibility!=='private'&&item.kind!=='stock';
const aliasesFor=item=>[
 item.supplyId,item.sku,item.economySku,
 !item.factoryVariant&&item.modelUrl&&'model:'+modelPath(item.modelUrl),
 !item.factoryVariant&&item.buildAssetId&&'native:'+item.buildAssetId,
 !item.factoryVariant&&item.materialId&&'material:'+item.materialId,
 !item.factoryVariant&&item.toolId&&'tool:'+item.toolId,
 item.catalogId,item.id,item.catalogId&&'store:'+storeId(item.catalogId),item.id&&'store:'+storeId(item.id),...(item.marketAliases||[])
].filter(safeKey);

// A model appearing in the Backpack and repository is one physical item.
// Stable existing economy SKUs remain the public identifiers for that item.
const staticAliases=new Map(),staticItems=new Map();
for(const item of GAME_ECONOMY.filter(physical)){
 const modelAlias=item.modelUrl&&'model:'+modelPath(item.modelUrl);
 const nativeAlias=item.buildAssetId&&'native:'+item.buildAssetId;
 const id=(modelAlias&&staticAliases.get(modelAlias))||(nativeAlias&&staticAliases.get(nativeAlias))||item.sku;
 if(!staticItems.has(id))staticItems.set(id,{...item,supplyId:id});
 for(const alias of aliasesFor(item))if(!staticAliases.has(alias))staticAliases.set(alias,id);
}
for(const item of CARE_SUPPLIES){
 const id='care:'+item.id;
 staticItems.set(id,{...item,supplyId:id,sku:id,kind:'care',assetType:'supplies',priceMzk:item.price});
 staticAliases.set(id,id);
 // Bare care ids do not collide with economy ids in this catalog.
 if(!staticAliases.has(item.id))staticAliases.set(item.id,id);
}
const STATIC_REVISION=createHash('sha256').update(JSON.stringify([...staticItems.values()])).digest('hex');
const LEDGER_FIELDS=Object.freeze(['catalog','aliases','worldStock','factoryStock','maps','production','shipments','receipts']);

export function canonicalSupplyId(item){
 if(typeof item==='string')return staticAliases.get(item)||item;
 if(!item||typeof item!=='object')return null;
 if(item.factoryVariant&&safeKey(item.supplyId))return item.supplyId;
 for(const alias of aliasesFor(item))if(staticAliases.has(alias))return staticAliases.get(alias);
 if(safeKey(item.supplyId))return item.supplyId;
 const id=storeId(item.catalogId||item.id);
 if(safeKey(id))return 'store:'+id;
 if(item.modelUrl)return 'model:'+createHash('sha256').update(modelPath(item.modelUrl)).digest('hex').slice(0,24);
 return null;
}

function register(ledger,item,{initialStock=item?.privateFactoryBlueprint?0:INITIAL_WORLD_STOCK}={}){
 if(!physical(item))return;
 const aliases=aliasesFor(item),known=aliases.map(alias=>own(ledger.aliases,alias)?ledger.aliases[alias]:null).find(Boolean);
 const canonical=canonicalSupplyId(item),id=item.factoryVariant?canonical:staticItems.has(canonical)?canonical:known||canonical;
 if(!safeKey(id))fail('A supply item requires a valid catalog identifier.');
 const definition=staticItems.get(id)||{...ledger.catalog[id],...item};
 ledger.catalog[id]={...definition,supplyId:id,sku:definition.sku||id};
 // Publishing a formerly private design reveals the existing physical SKU;
 // it does not grant the initial reserve for a second time.
 if(!item.privateFactoryBlueprint&&ledger.catalog[id].privateFactoryBlueprint){
  delete ledger.catalog[id].privateFactoryBlueprint;
  delete ledger.catalog[id].factoryBlueprintOwnerId;
  delete ledger.catalog[id].factoryBlueprintItemId;
 }
 // Stock presence, rather than truthiness, is the durable initialization marker.
 // A depleted zero remains zero across restarts and catalog reconciliation.
 if(!own(ledger.worldStock,id))ledger.worldStock[id]=initialStock;
 for(const alias of [id,...aliases])if(!own(ledger.aliases,alias)||item.factoryVariant&&!staticAliases.has(alias))ledger.aliases[alias]=id;
 return id;
}

// This predicate mirrors only ensureWorldSupply(data)'s default initialization
// and catalog reconciliation. It makes no claim about calls adding items/maps.
// Keep its no-write contract aligned with the default ensure implementation so
// private wallet-only transactions may safely borrow an already-current ledger.
export function worldSupplyIsCurrent(data){
 const ledger=data?.worldSupply;
 return Boolean(ledger&&ledger.catalogRevision===STATIC_REVISION&&LEDGER_FIELDS.every(field=>ledger[field]));
}

export function ensureWorldSupply(data,{items=[],maps=[]}={}){
 const ledger=data.worldSupply ||= {schemaVersion:1,createdAt:new Date().toISOString()};
 for(const field of LEDGER_FIELDS)ledger[field] ||= {};
 if(ledger.catalogRevision!==STATIC_REVISION){
  for(const item of staticItems.values())register(ledger,item);
  for(const [alias,id] of staticAliases)if(!own(ledger.aliases,alias))ledger.aliases[alias]=id;
  ledger.catalogRevision=STATIC_REVISION;
 }
 for(const item of items){
  // Extra catalog entries must refer to an authored native item or model.
  // Arbitrary request objects are never allowed to become factory recipes.
  if(item?.modelUrl||item?.buildAssetId||item?.factoryVariant&&item.renderKind==='image'||staticAliases.has(item?.sku))register(ledger,item);
 }
 for(const map of maps){
  const id=typeof map==='string'?map:map?.id;
  if(!safeKey(id))fail('Choose a valid destination map.');
  const name=typeof map==='string'?map:String(map.name||map.id).slice(0,160);
  if(!own(ledger.maps,id))ledger.maps[id]={id,name,stock:{}};
  else {ledger.maps[id].name=name;ledger.maps[id].stock ||= {};}
 }
 return ledger;
}

export function supplyItem(data,item){
 const ledger=ensureWorldSupply(data),aliases=typeof item==='string'?[item,canonicalSupplyId(item)]:aliasesFor(item||{}).concat(canonicalSupplyId(item)||[]);
 // A saved configured creation keeps its own stock identity even when it uses
 // the same GLB or native geometry as a base catalog item.
 const exact=typeof item==='object'&&item?.id&&ledger.aliases[item.id];
 if(exact&&ledger.catalog[exact]?.factoryVariant)return ledger.catalog[exact];
 for(const alias of aliases){
  const id=own(ledger.aliases,alias)?ledger.aliases[alias]:alias;
  if(own(ledger.catalog,id))return ledger.catalog[id];
 }
 fail('This item is not registered in the world supply catalog.',404);
}

export function factoryLineupItems(data,items=[],{walletId}={}){
 const ledger=ensureWorldSupply(data),ids=new Set(staticItems.keys());
 for(const item of items)if(physical(item)&&(!item.privateFactoryBlueprint||supplyItemVisibleTo(data,item.supplyId,walletId))){
  try{ids.add(supplyItem(data,item).supplyId);}catch(error){if(error.statusCode!==404)throw error;}
 }
 if(walletId)for(const item of Object.values(ledger.catalog)){
  const customItemId=customBlueprintItemId(item);
  if(!customItemId)continue;
  try{ownedCustomFactoryItem(data,walletId,customItemId);ids.add(item.supplyId);}catch{}
 }
 return [...ids].map(id=>ledger.catalog[id]).filter(Boolean);
}

export function factoryProductionItem(data,id,items=[],{walletId}={}){
 const item=supplyItem(data,id);
 if(!factoryLineupItems(data,items,{walletId}).some(entry=>entry.supplyId===item.supplyId))fail('This blueprint is no longer publicly listed for new production.',409);
 return item;
}

const customBlueprintItemId=item=>item?.factoryBlueprintItemId||(String(item?.supplyId||'').startsWith('blueprint:custom:')?item.supplyId.slice('blueprint:custom:'.length):null);
function customBlueprintOwner(data,item){
 const customItemId=customBlueprintItemId(item);if(!customItemId)return null;
 return Object.entries(data.users||{}).find(([,user])=>user.items?.some(source=>source.id===customItemId&&source.type==='custom-item'&&source.source==='server-custom-library'))?.[0]||null;
}

export function registerPrivateFactoryBlueprint(data,walletId,customItemId){
 const item=ownedCustomFactoryItem(data,walletId,customItemId),ledger=ensureWorldSupply(data),existing=ledger.catalog[item.supplyId];
 // Existing public blueprints remain public and keep their authoritative
 // published price and stock. Private development cannot unpublish a listing.
 if(existing&&!existing.privateFactoryBlueprint)return existing;
 register(ledger,item,{initialStock:0});
 return ledger.catalog[item.supplyId];
}

export function supplyItemVisibleTo(data,itemId,walletId){
 let item;
 try{item=supplyItem(data,itemId);}catch{return false;}
 return !item.privateFactoryBlueprint||!!walletId&&customBlueprintOwner(data,item)===String(walletId).trim().toLowerCase();
}

/** Private design ownership controls catalog and stock visibility. A payer
 * retains their own immutable manufacturing and freight history after selling
 * the design, so they can inspect or cancel already-funded work. */
export function filterSupplyState(state,{walletId,data}={}){
 const viewer=String(walletId||'').trim().toLowerCase(),paidByViewer=record=>!!viewer&&record.ownerId===viewer;
 const definitions=new Map([...(state.catalog||[]),...(state.transferCatalog||[])].map(item=>[item.supplyId||item.id,item]));
 const visible=id=>{if(data)return supplyItemVisibleTo(data,id,walletId);const item=definitions.get(id);return !!item&&(!item.privateFactoryBlueprint||!!walletId&&item.factoryBlueprintOwnerId===walletId);};
 const stock=source=>Object.fromEntries(Object.entries(source||{}).filter(([id])=>visible(id)));
 const output={...state};
 for(const field of ['catalog','transferCatalog'])if(Array.isArray(state[field]))output[field]=state[field].filter(item=>visible(item.supplyId||item.id)).map(item=>item.privateFactoryBlueprint&&data?{...item,factoryBlueprintOwnerId:customBlueprintOwner(data,item)}:item);
 for(const field of ['worldStock','factoryStock','availableFactoryStock'])if(state[field])output[field]=stock(state[field]);
 if(Array.isArray(state.maps))output.maps=state.maps.map(map=>({...map,stock:stock(map.stock)}));
 for(const field of ['production','orders','shipments'])if(Array.isArray(state[field]))output[field]=state[field].filter(record=>visible(record.itemId)||paidByViewer(record));
 const productionIds=new Set((output.production||[]).map(record=>record.id).filter(Boolean)),shipmentIds=new Set((output.shipments||[]).map(record=>record.id).filter(Boolean));
 if(Array.isArray(state.lots))output.lots=state.lots.filter(record=>visible(record.itemId)||productionIds.has(record.productionId));
 for(const field of ['allocations','stockReceipts','deliveryTasks','portReceipts','portEscrow','dropoffReceipts','airTasks','airReceipts'])if(Array.isArray(state[field]))output[field]=state[field].filter(record=>visible(record.itemId)||paidByViewer(record)||shipmentIds.has(record.shipmentId));
 if(Array.isArray(state.challenges))output.challenges=state.challenges.filter(record=>visible(record.itemId));
 return output;
}

/** Must be called inside the same database transaction as the purchase or use. */
function stockFor(ledger,id,mapId){
 let stock=ledger.worldStock;
 if(mapId&&mapId!=='world'){
  if(!safeKey(mapId)||!own(ledger.maps,mapId))fail('This map has no registered supply inventory.',404);
  // Untouched maps use the initial world reserve. Once an item has its own
  // delivered map stock, including zero, that inventory must be replenished.
  if(own(ledger.maps[mapId].stock,id))stock=ledger.maps[mapId].stock;
 }
 return stock;
}

export function supplyAvailability(data,item,{mapId}={}){
 const ledger=ensureWorldSupply(data),catalog=supplyItem(data,item),stock=stockFor(ledger,catalog.supplyId,mapId);
 return own(stock,catalog.supplyId)?stock[catalog.supplyId]:0;
}

export function consumeWorldStock(data,item,quantity,{mapId}={}){
 if(!Number.isSafeInteger(quantity)||quantity<1)fail('Supply quantity must be a positive whole number.');
 const ledger=ensureWorldSupply(data),catalog=supplyItem(data,item),id=catalog.supplyId,stock=stockFor(ledger,id,mapId);
 const available=own(stock,id)?stock[id]:0;
 if(!Number.isSafeInteger(available)||available<quantity)fail(catalog.name+' is out of stock. Produce it at the world factory and complete a shipping delivery to restock.',409);
 stock[id]=available-quantity;
}
