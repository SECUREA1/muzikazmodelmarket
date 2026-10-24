// Public map bills of materials reference the same SKUs as the authoritative
// economy. Instances remain in their map; browsing never grants ownership.
export function nativeMarketCatalog(economy, environments = []) {
  const byModel = new Map(), bySku = new Map(economy.map(item => [item.sku, item]));
  for (const item of economy) {
    if (item.buildAssetId && !byModel.has(item.buildAssetId)) byModel.set(item.buildAssetId, item);
  }
  const usage = new Map(), seen = new Set();
  const maps = environments.filter(map => map?.id && map.visibility !== 'private' && map.playable !== false && !map.memberPlot && ['repository', 'community-atlas'].includes(map.source) && !seen.has(map.id) && (seen.add(map.id), true)).map(map => {
    const scene = map.builderScene || map.placementScene || {};
    const definitions = new Map([...(scene.catalogModels || []), ...(scene.placedModels || []), ...(scene.customModels || [])].map(item => [item.id, item]));
    const groups = new Map();
    for (const object of scene.objects || []) {
      const definition = definitions.get(object.modelId) || {};
      const modelId = object.asset?.buildAssetId || definition.buildAssetId || definition.function_data?.buildAssetId || object.modelId;
      const item = bySku.get(object.asset?.sku || object.asset?.economySku) || byModel.get(modelId);
      const key = item?.sku || modelId || 'unknown';
      const group = groups.get(key) || {sku:item?.sku || null, buildAssetId:modelId, name:item?.name || definition.name || modelId || 'Map geometry', count:0, nativeFunction:item?.nativeFunction || object.functionalSettings?.behavior || 'decor'};
      group.count++;
      groups.set(key, group);
    }
    const components = [...groups.values()].sort((a,b) => a.name.localeCompare(b.name));
    for (const component of components.filter(component => component.sku)) {
      const list = usage.get(component.sku) || [];
      list.push({id:map.id, name:map.name, count:component.count});
      usage.set(component.sku, list);
    }
    return {id:'native-map:'+map.id, worldId:map.id, name:map.name, description:map.description || 'Reusable native map template.', source:'native-map', native:true, nativeFunction:'map-template', category:'Maps and worlds', assetType:'environment', basic:true, priceMzk:0, thumbnailUrl:map.thumbnailUrl || map.image || '', builderUrl:'/environment-builder.html?layout=repository-'+encodeURIComponent(map.id), visitUrl:map.playUrl || '/model-explorer.html?environment='+encodeURIComponent(map.id)+'&autoplay=1', itemCount:(scene.objects || []).length, components, geometryOnly:!scene.objects?.length};
  });
  const items = economy.map(item => ({...item, nativeMaps:usage.get(item.sku) || []}));
  return {items, maps};
}
