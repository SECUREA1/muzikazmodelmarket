const modelPath=value=>{
 if(!value)return '';
 try{
  const url=new URL(String(value),'https://catalog.invalid/');
  return decodeURIComponent((url.origin==='https://catalog.invalid'?'':url.origin)+url.pathname).replace(/^\/+/,'');
 }catch{return String(value).split(/[?#]/)[0].replace(/^\/+/,'');}
};

// Public world instances can reference a native id, a market SKU, an owned
// catalog id, or a local model alias. Resolve each to the existing item rather
// than publishing another SKU for each placement of the same model.
export function marketItemResolver(economy){
 const byModel=new Map(),bySku=new Map(),byId=new Map(),byPath=new Map();
 for(const item of economy){
  if(item.sku)bySku.set(item.sku,item);
  for(const id of [item.id,item.catalogId])if(id&&!byId.has(id))byId.set(id,item);
  if(item.buildAssetId&&!byModel.has(item.buildAssetId))byModel.set(item.buildAssetId,item);
  const path=modelPath(item.modelUrl||item.glb_url||item.modelPath);
  if(path&&!byPath.has(path))byPath.set(path,item);
 }
 return (object={},definition={})=>{
  const asset=object.asset||{},configuration=definition.function_data||{};
  const modelId=asset.buildAssetId||object.buildAssetId||definition.buildAssetId||configuration.buildAssetId||configuration.modelId||(object.materialId?'material:'+object.materialId:object.modelId);
  for(const sku of [asset.sku,asset.economySku,object.sku,object.economySku,definition.sku,definition.economySku])if(bySku.has(sku))return bySku.get(sku);
  if(byModel.has(modelId))return byModel.get(modelId);
  for(const id of [asset.catalogId,asset.sourceId,asset.id,definition.catalogId,definition.sourceId,object.modelId])if(byId.has(id))return byId.get(id);
  for(const url of [asset.modelUrl,asset.glb_url,object.modelUrl,object.glb_url,definition.modelUrl,definition.glb_url,definition.modelPath]){
   const item=byPath.get(modelPath(url));if(item)return item;
  }
  return null;
 };
}

// Public map bills of materials reference the same SKUs as the authoritative
// economy. Instances remain in their map; browsing never grants ownership.
export function nativeMarketCatalog(economy, environments = []) {
  const resolveItem=marketItemResolver(economy);
  const usage = new Map(), seen = new Set();
  const maps = environments.filter(map => map?.id && map.visibility !== 'private' && map.playable !== false && !map.memberPlot && !seen.has(map.id) && (seen.add(map.id), true)).map(map => {
    const scene = map.builderScene || map.placementScene || {};
    // Procedural destinations can publish their authored assembly inventory
    // without spawning a second copy of those same objects in the live world.
    const objects = [...(scene.objects?.length ? scene.objects : scene.nativeComponents || [])];
    const basePaths=new Set();
    for(const url of [...(map.modelUrls||[]),map.modelUrl].filter(Boolean)){
      const path=modelPath(url);if(basePaths.has(path)||!resolveItem({modelUrl:url}))continue;
      basePaths.add(path);objects.push({id:'world-base-model:'+path,modelUrl:url});
    }
    const definitions = new Map([...(map.catalogModels || []), ...(scene.catalogModels || []), ...(scene.placedModels || []), ...(scene.customModels || [])].map(item => [item.id, item]));
    const groups = new Map();
    for (const object of objects) {
      const definition = definitions.get(object.modelId) || {};
      if(object.hidden===true||object.visible===false||object.internal===true||object.metadata?.internal===true||object.visibility==='private'||object.asset?.visibility==='private'||definition.visibility==='private')continue;
      const item=resolveItem(object,definition);
      const modelId=item?.buildAssetId||object.asset?.buildAssetId||definition.buildAssetId||definition.function_data?.buildAssetId||definition.function_data?.modelId||object.modelId;
      const key = item?.sku || modelId || 'unknown';
      const group = groups.get(key) || {sku:item?.sku || null, buildAssetId:item?.modelUrl&&!item.buildAssetId?null:modelId, ...(item?.modelUrl?{modelUrl:item.modelUrl}:{}), name:item?.name || definition.name || modelId || 'Map geometry', count:0, nativeFunction:item?.nativeFunction || object.functionalSettings?.behavior || 'decor'};
      group.aliases ||= [];
      for(const name of [object.name,definition.name])if(name&&name!==group.name&&!group.aliases.includes(name))group.aliases.push(name);
      group.count += Number.isSafeInteger(object.count) && object.count > 0 ? object.count : 1;
      if (Array.isArray(object.includedIn) && object.includedIn.length) {
        group.includedIn ||= [];
        for (const part of object.includedIn) {
          const owner = resolveItem(part,definitions.get(part.modelId)), count = Number.isSafeInteger(part.count) && part.count > 0 ? part.count : 1;
          const existing = group.includedIn.find(value => owner?.sku?value.sku===owner.sku:value.buildAssetId===part.modelId);
          if (existing) existing.count += count;
          else group.includedIn.push({buildAssetId:part.modelId, sku:owner?.sku || null, name:owner?.name || part.modelId, count});
        }
      }
      groups.set(key, group);
    }
    const components = [...groups.values()].sort((a,b) => a.name.localeCompare(b.name));
    for (const component of components.filter(component => component.sku)) {
      const list = usage.get(component.sku) || [];
      list.push({id:map.id, name:map.name, count:component.count,...(component.aliases.length?{aliases:component.aliases}:{})});
      usage.set(component.sku, list);
    }
    if(!['repository','community-atlas'].includes(map.source))return null;
    return {id:'native-map:'+map.id, worldId:map.id, name:map.name, description:map.description || 'Reusable native map template.', source:'native-map', native:true, nativeFunction:'map-template', category:'Maps and worlds', assetType:'environment', basic:true, priceMzk:0, thumbnailUrl:map.thumbnailUrl || map.image || '', builderUrl:'/environment-builder.html?layout=repository-'+encodeURIComponent(map.id), visitUrl:map.playUrl || '/model-explorer.html?environment='+encodeURIComponent(map.id)+'&autoplay=1', itemCount:components.reduce((sum, component) => sum + component.count, 0), components, geometryOnly:!objects.length};
  }).filter(Boolean);
  const items = economy.map(item => ({...item, nativeMaps:usage.get(item.sku) || []}));
  return {items, maps};
}
