import {createHash} from 'node:crypto';
import {ENTERABLE_BUILDINGS} from './public/js/building-districts.js';
import {NATIVE_BUILDER_ITEMS} from './public/js/native-builder-items.js';
import {BUILDER_MODEL_INFO} from './public/js/builder-models-3d.js';
import {LAYOUT_SCENES} from './public/js/builder-layout-scenes.js';

const retail=new Set(['general-store','corner-bakery','community-supermarket','fashion-boutique','neighborhood-pharmacy','artisan-workshop','market-stall','item-vending-machine','market-atm']);
const forbidden=new Set(['__proto__','prototype','constructor']);
const vector=value=>Array.isArray(value)?{x:Number(value[0])||0,y:Number(value[1])||0,z:Number(value[2])||0}:{x:Number(value?.x)||0,y:Number(value?.y)||0,z:Number(value?.z)||0};
const fingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,24);
const visible=item=>item&&item.deleted!==true&&item.active!==false&&item.hidden!==true&&item.visible!==false&&item.visibility!=='private'&&!item.userData?.storeProductDisplay&&!item.storeProductDisplay;
export const deliveryAddressId=(mapId,objectId)=>'address:'+encodeURIComponent(mapId)+':'+encodeURIComponent(objectId);
export function addressMapId(id){
 if(typeof id!=='string'||id.length>1000||!id.startsWith('address:'))return null;
 try{const parts=id.slice(8).split(':');if(parts.length!==2)return null;const map=decodeURIComponent(parts[0]),object=decodeURIComponent(parts[1]);return map&&object&&!forbidden.has(map)&&!forbidden.has(object)?map:null;}catch{return null;}
}
function walletFor(data,identity){
 if(typeof identity!=='string')return null;
 const key=identity.trim().toLowerCase();if(Object.hasOwn(data.users||{},key))return key;
 const account=key.startsWith('account:')?key.slice(8):key;
 return Object.entries(data.users||{}).find(([,user])=>String(user.memory?.account?.accountId||'').toLowerCase()===account)?.[0]||null;
}
function publicName(data,wallet,fallback){const profile=data.users?.[wallet]?.memory?.profile||{};return String(profile.displayName||profile.username||fallback||'MUZIKAZ member').slice(0,120);}
function ownerFor(data,map,item,deed,trustedInstanceOwner){
 if(deed)return {recipientId:deed.ownerId,owner:{kind:'member',name:publicName(data,deed.ownerId,map.ownerName||'Deed holder')}};
 // Authored object owner fields and asset references come from a published
 // creator payload. Only the room's server-owned spawn identity can override
 // the authoritative map owner; a blueprint resale never transfers an instance.
 const wallet=walletFor(data,trustedInstanceOwner||map.ownerId);
 return wallet?{recipientId:wallet,owner:{kind:'member',name:publicName(data,wallet,map.ownerName)}}:{recipientId:'public:'+map.id,owner:{kind:'public',name:'MUZIKAZ · Public facility'}};
}
function transform(item,offset){
 const position=vector(item.position||item.transform?.position),scale=vector(item.scale||item.transform?.scale||{x:1,y:1,z:1}),rotation=vector(item.rotation||item.transform?.rotation),x=offset.x*(scale.x||1),z=offset.z*(scale.z||1);
 return {x:position.x+x*Math.cos(rotation.y)+z*Math.sin(rotation.y),y:position.y+(offset.y||0)*(scale.y||1),z:position.z-x*Math.sin(rotation.y)+z*Math.cos(rotation.y)};
}
function nearestStreet(map,room,position){
 const roads=[...(room.simulation?.streets||[]),...(map.streets||[]),...(map.builderScene?.streets||[])];let chosen=null,distance=Infinity;
 for(const road of roads){if(!road.from||!road.to||!road.name)continue;const a=vector(road.from),b=vector(road.to),dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((position.x-a.x)*dx+(position.z-a.z)*dz)/(dx*dx+dz*dz||1))),gap=Math.hypot(position.x-a.x-dx*t,position.z-a.z-dz*t);if(gap<distance){distance=gap;chosen=road.name;}}
 return String(chosen||map.name||map.id).slice(0,140);
}
function templateStores(map){
 const layout=map.builderScene?.layout||map.layout,rows=[];
 if(layout==='vendor-street')[-12,-6,0,6,12].forEach((z,index)=>{for(const x of [-15,15])rows.push({id:'layout-shop-'+index+'-'+(x<0?'west':'east'),modelId:'market-stall',name:'Vendor '+(index*2+(x<0?1:2)),position:{x:x+(x<0?3.5:-3.5),y:0,z},deliveryDropoff:{x:x+(x<0?3.5:-3.5),y:0,z}});});
 if(layout==='market-square')for(let index=0;index<10;index++){const a=index*Math.PI/5;rows.push({id:'layout-shop-'+index,modelId:'market-stall',name:'Market stall '+(index+1),position:{x:Math.cos(a)*13,y:0,z:Math.sin(a)*13},deliveryDropoff:{x:Math.cos(a)*13+Math.sin(a)*1.9,y:0,z:Math.sin(a)*13-Math.cos(a)*1.9}});}
 if(layout==='mega-mall')[-13,-6,6,13].forEach((x,index)=>rows.push({id:'layout-shop-'+index,modelId:'market-stall',name:'Mall store '+(index+1),position:{x,y:0,z:4.8},deliveryDropoff:{x,y:0,z:4.8}}));
 return rows;
}
/** Trusted map/room state only. Public records never contain account records,
 * wallet addresses, private custom configurations or credentials. */
export function mapDeliveryAddresses(data,map,room={}){
 if(!map?.id||map.visibility==='private'||map.playable===false)return [];
 const deed=Object.values(data.landDeeds||{}).find(row=>row.status==='active'&&(row.id===map.deedId||'plot-'+row.id===map.id)),scene=map.builderScene||map.placementScene||{},instanceOwners=new WeakMap(),objects=new Map((scene.objects||[]).filter(item=>item?.id).map(item=>[item.id,item]));
 for(const actor of Object.values(room.simulation?.actors||{}))if(actor?.id&&!actor.trafficAI&&(actor.spawned||objects.has(actor.id))){
  // Authored actors can lag behind a just-published scene until its next room
  // tick. Published placement remains authoritative; only spawned instances
  // take their geometry and ownership from the running server simulation.
  const item=actor.spawned?{...objects.get(actor.id),...actor}:{...objects.get(actor.id),...(actor.active===false?{active:false}:{})};objects.set(actor.id,item);if(actor.spawned&&actor.ownerId)instanceOwners.set(item,actor.ownerId);
 }
 for(const object of Object.values(room.objects||{}))if(object?.id){const previous=objects.get(object.id),item={...previous,...object};objects.set(object.id,item);if(previous&&instanceOwners.has(previous))instanceOwners.set(item,instanceOwners.get(previous));}
 const rows=[],nestedStores=[];
 for(const item of objects.values())if(visible(item)){const layout=LAYOUT_SCENES[item.asset?.buildAssetId||item.modelId]?.layout;if(!layout)continue;for(const child of templateStores({builderScene:{layout}})){const nested={...child,id:item.id+'/'+child.id,name:(item.name||LAYOUT_SCENES[item.modelId]?.name||'Activity scene')+' · '+child.name,position:transform(item,child.position),deliveryDropoff:transform(item,child.deliveryDropoff)};nestedStores.push(nested);if(instanceOwners.has(item))instanceOwners.set(nested,instanceOwners.get(item));}}
 const add=(objectId,item,kind,position)=>{
  const id=deliveryAddressId(map.id,objectId),ownership=ownerFor(data,map,item,deed,instanceOwners.get(item)),name=String(item.name||ENTERABLE_BUILDINGS[item.modelId]?.name||map.name||'Delivery entrance').slice(0,160),number=1+parseInt(fingerprint([map.id,objectId]).slice(0,8),16)%8999;
  const publicRecord={id,mapId:map.id,mapName:map.name||map.id,objectId,deedId:deed?.id||null,kind,name,addressLine:number+' '+nearestStreet(map,room,position)+' · '+name,position,dropoff:{id:'dropoff:'+id,mapId:map.id,kind:kind.includes('entrance')?'plot-entrance':'doorstep',name:name+' · Receiving entrance',position:{...position}},owner:ownership.owner,canOrder:true,orderPolicy:'any-signed-in-sender',playUrl:map.playUrl||'model-explorer.html?environment='+encodeURIComponent(map.id)+'&autoplay=1'};
  publicRecord.revision=fingerprint([id,position,ownership.recipientId,publicRecord.name,publicRecord.addressLine]);rows.push({...publicRecord,recipientId:ownership.recipientId});
 };
 const entrance=map.delivery?.dropoff?.position||map.delivery?.entrance?.position||map.spawn?.position||map.spawn||{x:0,y:0,z:0};
 add('entrance',{name:(deed?.name||map.name||map.id)+' · Delivery entrance'},deed?'deed-entrance':'map-entrance',vector(entrance));
 for(const item of [...objects.values(),...templateStores(map),...nestedStores]){
  if(!visible(item))continue;
  const modelId=item.asset?.buildAssetId||item.buildAssetId||item.modelId||'',native=NATIVE_BUILDER_ITEMS[modelId],dimensions=native?.dimensions||BUILDER_MODEL_INFO[modelId]?.[2],nativeBuilding=native?.category==='buildings'||['estate-house','drive-in-garage','open-office'].includes(modelId),building=ENTERABLE_BUILDINGS[modelId]||(nativeBuilding&&Array.isArray(dimensions)?{name:native?.name||BUILDER_MODEL_INFO[modelId]?.[0],depth:dimensions[2],height:dimensions[1],frontDirection:-1}:null),settings=item.functionalSettings||item.definition?.gameplay||{},isRetail=retail.has(modelId)||settings.behavior==='shop'||settings.action==='market'||settings.device==='market-atm';
  const structural=building||isRetail||item.objectType==='building'||item.asset?.assetType==='building'||item.building===true;
  if(!structural)continue;
  const explicit=item.deliveryDropoff?.position||item.deliveryDropoff||settings.deliveryDropoff?.position||settings.deliveryDropoff;
  const position=explicit&&['x','z'].every(axis=>Number.isFinite(Number(explicit[axis])))?vector(explicit):transform(item,{x:0,y:building ? .03 : 0,z:building?(building.frontDirection||1)*(building.depth/2+.9):1.1});
  add(item.id,item,isRetail?'store':'building',position);
 }
 return [...new Map(rows.map(address=>[address.id,address])).values()];
}
export function publicDeliveryAddress(address){if(!address)return null;const {recipientId,...record}=address;return record;}
export function resolveDeliveryAddress(data,maps,rooms,addressId){const mapId=addressMapId(addressId),map=maps.find(map=>map.id===mapId);return map?mapDeliveryAddresses(data,map,rooms?.[mapId]||{}).find(address=>address.id===addressId)||null:null;}
export function addressRecipientValid(data,maps,rooms,record){const address=resolveDeliveryAddress(data,maps,rooms,record.addressId);if(!address||address.recipientId!==(record.recipientId||record.ownerId))return false;return !address.deedId||!!data.users[address.recipientId]?.items?.some(item=>item.id===address.deedId&&item.type==='land-deed');}
