import {nativeBuilderItem} from './public/js/native-builder-items.js';
import {catalogItemPrice} from './public/js/game-item-pricing.js';
import {factoryUnitPriceMzk} from './world-factory-pricing.mjs';
import {cleanCustomItem} from './custom-item-rules.mjs';
// Convert trusted, public marketplace records into manufacturing blueprints.
// Listing/ownership IDs are references only; production never copies licenses,
// certificates, deeds or the seller's unique inventory instance.
const excludedTypes=new Set(['land-deed','land-entitlement','published-map','shipping-stock','access-code','license','certificate','stock','bundle']);
const privateItem=item=>!item||item.visibility==='private'||item.earnedOnly||item.tradable===false||item.shippingSupplyId||item.source==='prison-earned'||item.source==='shipping-delivery'||item.source==='mzk-access-code'||excludedTypes.has(item.type)||excludedTypes.has(item.kind);
const fields=['description','format','scale','dimensions','targetHeight','configuration','behavior','action','materialId','toolId','vehicleSettings','movementSettings','aiSettings','questSettings','dialogueSettings','environmentSettings','animationState','animation_data','collider_data','physics_data','spawn_data','interaction_data','ai_profile','game_function','script_reference','version'];
const copy=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));

export function normalizeFactoryCatalogItem(source,{priceMzk,sourceKind='published',variantId,marketAliases=[]}={}){
 if(privateItem(source))return null;
 const functionData=source.function_data||{},modelUrl=String(source.modelUrl||source.glb_url||''),buildAssetId=String(source.buildAssetId||functionData.buildAssetId||functionData.modelId||'');
 const image=source.renderKind==='image'&&source.format==='svg'&&/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(source.thumbnailUrl||'');
 if(!modelUrl&&!buildAssetId&&!image)return null;
 if(modelUrl&&!/\.(?:glb|gltf)(?:[?#]|$)/i.test(modelUrl))return null;
 const native=buildAssetId?nativeBuilderItem(buildAssetId):null;
 if(!modelUrl&&!image&&!native)return null;
 if(native?.earnedOnly)return null;
 const item={...Object.fromEntries(fields.filter(key=>source[key]!==undefined).map(key=>[key,copy(source[key])])),id:String(source.id||source.catalogId||''),name:String(source.name||source.title||source.id||'Marketplace item'),kind:'asset',assetType:source.assetType||source.asset_type||(source.type!=='custom-item'&&source.type)||(/avatar|character/i.test(source.category||'')?'avatars':'props'),category:source.category||source.builder_category||'Marketplace blueprints',modelUrl,buildAssetId:buildAssetId||undefined,thumbnailUrl:source.thumbnailUrl||source.thumbnail_url||'',function_data:copy(functionData),productionSource:sourceKind,marketAliases:[...new Set(marketAliases.filter(alias=>typeof alias==='string'&&alias.length<=300))]};
 if(variantId){item.factoryVariant=true;item.supplyId='blueprint:'+variantId;item.sku=item.supplyId;item.catalogId=item.id;}
 else for(const key of ['supplyId','sku','economySku','catalogId'])if(source[key])item[key]=source[key];
 const amount=source.priceMzk??source.price_mzk??priceMzk;
 if(amount!==undefined)item.priceMzk=amount;
 else if(source.priceUsd!==undefined)item.priceUsd=source.priceUsd;
 else if(source.price!==undefined)item.price=source.price;
 else item.priceMzk=catalogItemPrice(item);
 if(image)item.renderKind='image';
 item.behavior=source.behavior||source.configuration?.behavior||functionData.behavior||native?.behavior||'decor';
 if(source.creatorId||source.creator)item.creatorId=source.creatorId||source.creator;
 try{factoryUnitPriceMzk(item);}catch{return null;}
 return item;
}

export function marketplaceFactoryCatalog({builderListings=[],playerListings=[]}={}){
 const items=[];
 for(const listing of builderListings){
  const asset=listing.asset;
  if(listing.listing_status!=='active'||asset?.asset_usage!=='game_builder'||asset.owner!==listing.seller_id)continue;
  const item=normalizeFactoryCatalogItem(asset,{priceMzk:listing.price_mzk,sourceKind:'Builder marketplace',variantId:'builder:'+asset.id,marketAliases:['builder:'+listing.listing_id]});
  if(item)items.push(item);
 }
 for(const listing of playerListings){
  const source=listing.item;if(!source?.listing?.active)continue;
  const item=normalizeFactoryCatalogItem(source,{priceMzk:listing.priceMzk,sourceKind:'Player marketplace',...(source.type==='custom-item'?{variantId:'custom:'+source.id}:{}),marketAliases:['player:'+listing.sellerId+':'+listing.itemId]});
  if(item)items.push(item);
 }
 return items;
}

/** A saved design is a blueprint, not a newly granted copy or market listing.
 * Re-read its current authoritative holder on every manufacture request. */
export function ownedCustomFactoryItem(data,walletId,customItemId){
 const owner=String(walletId||'').trim().toLowerCase();
 const source=data.users?.[owner]?.items?.find(item=>item.id===customItemId&&item.type==='custom-item'&&item.source==='server-custom-library');
 if(!source)throw Object.assign(new Error('Only the current holder of a saved custom design can develop it in the factory.'),{statusCode:403});
 // Reuse the save validator. No caller-supplied artwork, model URL, price,
 // certificate, license or configuration enters a registered blueprint.
 const clean=cleanCustomItem({...source,requestId:source.saveRequestId||source.id},data.users[owner].items);
 const item=normalizeFactoryCatalogItem({...clean,id:source.id,type:'custom-item',creatorId:source.creatorId,assetType:'props'},{variantId:'custom:'+source.id,sourceKind:'Private custom development'});
 if(!item)throw Object.assign(new Error('This saved design cannot be developed in the factory.'),{statusCode:422});
 return {...item,privateFactoryBlueprint:true,factoryBlueprintItemId:source.id,factoryBlueprintOwnerId:owner};
}
