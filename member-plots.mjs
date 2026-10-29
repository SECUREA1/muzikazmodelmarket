export const plotSpaceId=deed=>`plot-${deed.id}`;
export function plotPlayUrl(deed){const id=encodeURIComponent(plotSpaceId(deed));return `model-explorer.html?environment=${id}&house=${id}&autoplay=1`;}
export function memberPlotDeliveryMetadata(deed,base={}){
 const id=plotSpaceId(deed),size=Math.max(16,Number(deed.lot?.size||base.builderScene?.mapSize)||80),spawn=base.spawn?.position||base.spawn||{};
 // A deed field's world coordinates belong to its regional room. Its hosted
 // plot is a separate, centred room and must never reuse those XYZ values.
 const position=deed.lot?{x:0,y:0,z:size/2-4}:{x:Number(spawn.x)||0,y:Number(spawn.y)||0,z:Number.isFinite(Number(spawn.z))?Number(spawn.z):size/2-4};
 const authored=!deed.lot&&(base.delivery||base.builderScene?.layoutMeta?.delivery)||{},anchors={};
 for(const key of ['hub','dropoff'])if(authored[key]?.position&&['x','y','z'].every(axis=>Number.isFinite(authored[key].position[axis])))anchors[key]={...authored[key],mapId:id,position:{...authored[key].position}};
 return {version:1,deedId:deed.id,dropoffId:'deed-dropoff:'+deed.id,mode:'door-or-plot-entrance',mapId:id,entrance:{id:'deed-entrance:'+deed.id,name:deed.name+' · Delivery entrance',kind:'plot-entrance',mapId:id,position},...anchors,...(deed.lot?{regionalEntry:{mapId:deed.lot.mapId,position:{...deed.lot.entry},kind:'regional-deed-entrance',name:deed.lot.name+' · Regional transfer'}}:{})};
}
export function memberPlotEnvironment(deed,bases){
 const available=bases.filter(base=>!base.memberPlot&&base.playable!==false&&base.visibility!=='private');
 const base=available.find(item=>item.id===deed.hostedSpace?.environmentId)||available.find(item=>item.id==='muzikaz-main')||available[0];
 if(!base)return null;
 const toVector=(value,fallback=0)=>({x:Number(value?.[0])||fallback,y:Number(value?.[1])||fallback,z:Number(value?.[2])||fallback});
 const placements=(deed.placements||[]).filter(item=>item.modelUrl||item.buildAssetId).map(item=>({id:item.id,modelId:item.buildAssetId||item.assetId,name:item.name,objectType:item.objectType,asset:{id:item.assetId,name:item.name,modelUrl:item.modelUrl||null,buildAssetId:item.buildAssetId||null},position:toVector(item.transform?.position),rotation:toVector(item.transform?.rotation),scale:toVector(item.transform?.scale,1),functionalSettings:item.functionalSettings||{behavior:'decor'}}));
 const savedScene=deed.lot?{version:3,layout:'grand-floor',mapSize:deed.lot.size,objects:placements,catalogModels:placements.map(item=>({id:item.modelId,...item.asset}))}:base.builderScene||placements.length?{...(base.builderScene||{version:3,layout:'member-plot',mapSize:80}),objects:[...(base.builderScene?.objects||[]).filter(object=>!object.atlasDestination),...placements],catalogModels:[...(base.builderScene?.catalogModels||[]),...placements.map(item=>({id:item.modelId,...item.asset}))],atlasGatewaySignature:undefined}:undefined;
 const id=plotSpaceId(deed),name=deed.hostedSpace?.name||`${deed.name} · Member plot`,delivery=memberPlotDeliveryMetadata(deed,base);
 return {...base,id,aliases:[],name,label:'Member-hosted plot',description:`${deed.ownerName||'MUZIKAZ member'}’s multiplayer plot · ${base.name}`,category:'Member plots',source:'member-plot',memberPlot:true,delivery,publicDestination:false,ownerId:deed.ownerId,ownerName:deed.ownerName||'MUZIKAZ member',deedId:deed.id,worldId:deed.worldId,lot:deed.lot||null,landLots:deed.lot?[]:base.landLots,baseEnvironmentId:base.id,playUrl:plotPlayUrl(deed),visibility:'public',playable:true,multiplayer:true,live:true,roomId:id,canEdit:false,canDelete:false,builderScene:base.builderScene&&savedScene?{...savedScene,id,name}:undefined,placementScene:!base.builderScene&&savedScene?{...savedScene,id,name}:undefined,atlasDistrict:undefined,districtId:undefined,districtName:undefined,districtColor:undefined,portalTargets:deed.lot?[deed.lot.mapId,'public-commons']:['public-commons'],createdAt:deed.acquiredAt,updatedAt:deed.updatedAt,contentUpdatedAt:[deed.updatedAt,base.id,base.contentUpdatedAt||base.updatedAt,...(deed.placements||[]).map(item=>item.id+':'+item.updatedAt)].join(':')};
}
