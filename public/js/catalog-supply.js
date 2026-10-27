// Supply counts come from the public market/economy response. Keep them
// separate from ownership and personal prepaid material credits: browsing or
// importing a map never grants a unit or consumes warehouse inventory.
const COUNTS=['availableStock','worldStock'];
const IDENTIFIERS=['supplyItemId','supplyMapId'];
const pathKey=value=>{
 if(!value)return '';
 try{const url=new URL(String(value),'https://catalog.invalid/');return decodeURIComponent((url.origin==='https://catalog.invalid'?'':url.origin)+url.pathname).replace(/^\/+/, '');}
 catch{return String(value).split(/[?#]/)[0].replace(/^\/+/, '');}
};

export function catalogSupplyMetadata(item={}){
 const result={};
 for(const key of COUNTS)if(Number.isSafeInteger(item[key])&&item[key]>=0)result[key]=item[key];
 for(const key of IDENTIFIERS)if(typeof item[key]==='string'&&item[key])result[key]=item[key];
 return result;
}

export function catalogSupplyLabel(item={}){
 const metadata=catalogSupplyMetadata(item);
 if(metadata.availableStock===undefined&&metadata.worldStock===undefined)return '';
 const local=Boolean(metadata.supplyMapId&&metadata.supplyMapId!=='world');
 const available=metadata.availableStock??metadata.worldStock;
 return `${Number(available).toLocaleString()} ${local?'available at this map':'in world stock'}`;
}

export function createCatalogSupplyIndex(records=[]){
 const bySku=new Map(),byNative=new Map(),byPath=new Map(),byId=new Map();
 for(const raw of records){
  const item={...raw.model,...raw};
  if(!Object.keys(catalogSupplyMetadata(item)).length)continue;
  for(const key of [item.sku,item.economySku])if(key&&!bySku.has(key))bySku.set(key,item);
  const native=item.buildAssetId||item.function_data?.buildAssetId||item.function_data?.modelId;
  for(const key of [native,item.materialId&&'material:'+item.materialId])if(key&&!byNative.has(key))byNative.set(key,item);
  const path=pathKey(item.modelUrl||item.modelPath||item.glb_url);
  if(path&&!byPath.has(path))byPath.set(path,item);
  for(const key of [item.id,item.sourceId,item.catalogId,raw.model?.id])if(key&&!byId.has(key))byId.set(key,item);
 }
 return model=>{
  const native=model.buildAssetId||(model.procedural&&!model.generated?model.id:null);
  const record=bySku.get(model.economySku||model.sku)||byNative.get(native)
   ||byNative.get(model.materialId&&'material:'+model.materialId)
   ||byPath.get(pathKey(model.modelUrl||model.modelPath||model.glb_url))
   ||byId.get(model.sourceId)||byId.get(model.id);
  if(!record)return model;
  return {...model,...catalogSupplyMetadata(record),
   ...(Array.isArray(record.nativeMaps)?{nativeMaps:record.nativeMaps}:{})};
 };
}
