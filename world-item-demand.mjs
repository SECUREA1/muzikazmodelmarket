import {createHash} from 'node:crypto';
import {mapDeliveryAddresses} from './world-delivery-addresses.mjs';
import {FORGE_RECIPES} from './public/js/forge-recipes.js';

const forgeProducts=new Set(FORGE_RECIPES.map(recipe=>recipe.buildAssetId));
const count=value=>Number.isSafeInteger(value)&&value>=0?value:0;
const text=(value,fallback)=>String(value||fallback||'').replace(/[\u0000-\u001f\u007f<>]/g,'').replace(/\b(?:account:|0x)[a-z0-9_-]+/gi,'member').trim().slice(0,120);
const active=value=>value&&value.active!==false&&value.visible!==false&&value.hidden!==true&&!value.deleted&&!value.disabled;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,24);
const point=value=>({x:Number(value?.x)||0,z:Number(value?.z)||0});
const distance=(a,b)=>Math.hypot(point(a).x-point(b).x,point(a).z-point(b).z);

function publicCatalog(catalog,ledger){
 const entries=Array.isArray(catalog)?catalog:Object.values(catalog||ledger.catalog||{}),items=new Map(),aliases=new Map();
 for(const item of entries){
  const id=item?.supplyId||item?.id;
  if(typeof id!=='string'||!id||item.privateFactoryBlueprint||item.visibility==='private'||item.earnedOnly)continue;
  items.set(id,{...item,supplyId:id});
  for(const alias of [id,item.id,item.sku,item.buildAssetId,item.buildAssetId&&'native:'+item.buildAssetId,...(item.marketAliases||[])])if(typeof alias==='string'&&alias&&!aliases.has(alias))aliases.set(alias,id);
 }
 return {items,resolve:alias=>items.get(aliases.get(alias))};
}
function source(item){return forgeProducts.has(item.buildAssetId||String(item.supplyId).replace(/^native:/,''))?'forge':'factory';}
function preference(catalog,context){
 const find=ids=>ids.map(id=>catalog.resolve(id)).find(Boolean),label=String(context||'').toLowerCase();
 if(/metallurg/.test(label))return find(['forge-bronze-bell','forge-lantern']);
 if(/smith|forge/.test(label))return find(['forge-damascus-blade','forge-lantern','tool:repair-tool']);
 if(/quarry|miner|construction|builder/.test(label))return find(['forge-pickaxe','tool:repair-tool','material:metal']);
 if(/pharmacy|clinic|medic|care/.test(label))return [...catalog.items.values()].find(item=>item.kind==='care');
 if(/bakery|supermarket|grocer/.test(label)){
  const food=[...catalog.items.values()].find(item=>/bread|food|water bottle|apple|ration/i.test(item.name||'')&&!/building|store|bakery|house/i.test(item.name||''));
  if(food)return food;
 }
 return find(['forge-lantern','tool:repair-tool','material:metal'])||[...catalog.items.values()].find(item=>item.kind==='care');
}
function fixture(map,room,id){
 const authored=(map.builderScene?.objects||map.placementScene?.objects||[]).find(object=>object.id===id),actor=room.simulation?.actors?.[id],saved=room.objects?.[id];
 return {...authored,...(actor?.spawned?actor:{}),...saved};
}
function publicReceiving(address,walletId){
 return address?.canOrder!==false&&(address.owner?.kind==='public'||address.recipientId===walletId||address.kind==='store'||address.kind==='building');
}

/** Suggestions describe deficits in the existing shared receiving-map stock.
 * They are not funded orders and never initialize stock, grant currency, create
 * inventory, or turn a visual AI routine into a paid transaction. */
export function worldItemDemandCalls({data={},ledger=data.worldSupply||{},maps=[],rooms={},catalog,walletId=null,mapId=null,preferredMapId=mapId,limit=48,perMap=3}={}){
 const maximum=Math.max(0,Math.min(96,Math.floor(Number(limit)||0))),mapMaximum=Math.max(0,Math.min(6,Math.floor(Number(perMap)||0)));
 if(!maximum||!mapMaximum)return [];
 const products=publicCatalog(catalog,ledger),result=[],activeRequests=Object.values(ledger.itemRequests||{}).filter(request=>!['cancelled','delivered'].includes(request.phase)),activeCalls=new Set(activeRequests.map(request=>request.originCallId).filter(Boolean));
 const pending=new Map();
 for(const request of activeRequests){const key=JSON.stringify([request.destinationMapId,request.itemId]);pending.set(key,(pending.get(key)||0)+Math.max(0,count(request.quantity)-count(request.deliveredQuantity)));}
 // Keep the current play space visible in a bounded global board. Priority is
 // applied before either map or call limits and never changes a call's identity.
 const available=[...new Map(maps.filter(map=>map?.id&&map.visibility!=='private'&&map.playable!==false).map(map=>[map.id,map])).values()].sort((a,b)=>Number(b.id===preferredMapId)-Number(a.id===preferredMapId)||String(a.id).localeCompare(String(b.id))).slice(0,256);
 for(const map of available){
  if(result.length>=maximum)break;
  const room=rooms[map.id]||{},addresses=mapDeliveryAddresses(data,map,room).filter(address=>publicReceiving(address,walletId)),groups={shop:[],ai:[],deed:[]},seen=new Set();
  const add=(kind,address,item,{contact,title,actorId}={})=>{
   if(!item||!address||!products.items.has(item.supplyId))return;
   const id='inventory-call:'+hash([kind,map.id,address.id,item.supplyId,actorId||address.objectId]);
   if(seen.has(id)||activeCalls.has(id))return;seen.add(id);
   const targetQuantity=source(item)==='forge'?2:4,currentStock=count(ledger.maps?.[map.id]?.stock?.[item.supplyId]),pendingQuantity=pending.get(JSON.stringify([map.id,item.supplyId]))||0,shortfall=Math.max(0,targetQuantity-currentStock-pendingQuantity);
   if(!shortfall)return;
   groups[kind].push({id,kind,itemId:item.supplyId,itemName:text(item.name,'World item'),quantity:shortfall,targetQuantity,currentStock,pendingQuantity,shortfall,stockScope:'map',stockLabel:'Shared receiving map stock',addressId:address.id,addressRevision:address.revision,addressName:text(address.name,'Receiving address'),mapId:map.id,destinationMapId:map.id,mapName:text(map.name,map.id),contact:text(contact,'Inventory desk'),title:text(title,'Inventory restock call'),source:source(item),funded:false});
  };
  for(const address of addresses.filter(address=>address.kind==='store').slice(0,18)){
   const object=fixture(map,room,address.objectId),settings=object.functionalSettings||object.definition?.gameplay||{},curated=[...(Array.isArray(settings.storeProductIds)?settings.storeProductIds:[]),...(Array.isArray(settings.storeProductSkus)?settings.storeProductSkus:[])].slice(0,24).map(id=>products.resolve(id)).filter(Boolean);
   const selected=curated.length?curated:[preference(products,object.modelId||address.name)].filter(Boolean);
   for(const item of selected.slice(0,3))add('shop',address,item,{contact:address.name,title:(curated.length?'Shop restock · ':'Store supplies · ')+text(item.name,'World item')});
  }
  const residents=Object.values(room.simulation?.actors||{}).filter(actor=>active(actor)&&(actor.health===undefined||actor.health>0)&&actor.resident&&actor.resident.isAI!==false).sort((a,b)=>String(a.id).localeCompare(String(b.id))).slice(0,12);
  for(const actor of residents){
   const home=actor.resident.home||actor.position,address=[...addresses].sort((a,b)=>distance(a.position,home)-distance(b.position,home)||a.id.localeCompare(b.id))[0];
   const contact=text(actor.resident.name||actor.name,'World resident'),item=preference(products,[actor.resident.role,actor.resident.forge?'forge':'',map.category,map.name].join(' '));
   add('ai',address,item,{actorId:actor.id,contact,title:'AI stock review · '+contact});
  }
  const ownEntrance=addresses.find(address=>address.kind==='deed-entrance'&&address.recipientId===walletId);
  if(ownEntrance)add('deed',ownEntrance,preference(products,map.name+' '+map.category),{contact:ownEntrance.owner?.name,title:'Your deed · receiving supplies'});
  let used=0;
  for(let index=0;used<mapMaximum&&result.length<maximum;index++){
   let added=false;
   for(const kind of ['shop','ai','deed'])if(groups[kind][index]&&used<mapMaximum&&result.length<maximum){result.push(groups[kind][index]);used++;added=true;}
   if(!added)break;
  }
 }
 return result;
}
