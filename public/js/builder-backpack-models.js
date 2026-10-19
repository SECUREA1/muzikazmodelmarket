import {normalizeCatalogModel} from './builder-catalog.js';
import {ownedBuilderModel} from './shared-game-inventory.js';
export function backpackPlacementModels(pack={},economy={}){
 const output=(pack.assets||[]).map(asset=>({...ownedBuilderModel(asset),category:'backpack'})),seen=new Set(output.map(model=>model.sourceId));
 for(const item of economy.ownedAssets||[]){
  if(seen.has(item.id)||['land-entitlement','land-deed'].includes(item.type))continue;
  const model=normalizeCatalogModel({...item,modelUrl:item.modelUrl||item.glb_url,format:item.renderKind==='image'?'png':item.format,function_data:{...item.function_data,buildAssetId:item.buildAssetId||item.function_data?.buildAssetId,behavior:item.configuration?.behavior||item.behavior||item.function_data?.behavior}},output.length);
  if(!model)continue;output.push({...model,id:'owned-builder:'+item.id,sourceId:item.id,ownedBuilder:true,source:'Member Backpack',category:'backpack',name:item.name||model.name});seen.add(item.id);
 }
 return output;
}
