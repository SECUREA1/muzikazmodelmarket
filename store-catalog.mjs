const COLLECTION_NAMES=Object.freeze({aape:'Originals · Ape',voltwolf:'Legends · Cyber Wolf',sharko:'Beasts · Red Beast',ioncduck:'Crew · Crew Penguin',flaminglow:'Chaos · Chaos Ape'});
export const COLLECTION_PRICES=Object.freeze({aape:39,voltwolf:64,sharko:58,ioncduck:44,flaminglow:69,muzikaz:52,pixella:46,beedeere:55});
export function resolveStoreCart(lines,catalog){
 if(!Array.isArray(lines)||!lines.length||lines.length>50)throw Object.assign(new Error('Choose up to 50 digital models.'),{statusCode:400});
 const items=lines.map(line=>{
  const id=String(line.deliverable?.id||'').replace(/^(?:repository-|store-model-)/,''),asset=catalog.find(item=>String(item.id).replace(/^(?:repository-|store-model-)/,'')===id);
  if(!asset?.modelUrl)throw Object.assign(new Error('Choose a catalog model with a game deliverable.'),{statusCode:400});
  const quantity=Number(line.quantity);if(!Number.isSafeInteger(quantity)||quantity<1||quantity>100)throw Object.assign(new Error('Invalid model quantity.'),{statusCode:400});
  return {id:'store-model-'+id,catalogId:id,name:COLLECTION_NAMES[id]||asset.name||asset.title,modelUrl:asset.modelUrl,thumbnailUrl:asset.thumbnailUrl||'',type:asset.assetType||'prop',assetType:asset.assetType||'prop',quantity,priceUsd:COLLECTION_PRICES[id]||Number(asset.priceUsd||asset.price)||25};
 });
 const subtotal=items.reduce((sum,item)=>sum+item.priceUsd*item.quantity,0),totalUsd=Math.round((subtotal+(subtotal<75?8.95:0)+subtotal*.0825)*100)/100;
 return {items,totalUsd,amountMzk:Math.round(totalUsd*100)};
}
