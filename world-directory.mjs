import {memberPlotEnvironment} from './member-plots.mjs';
import {WORLD_DISTRICTS,districtMapId} from './world-districts.mjs';
import {attachAtlas} from './world-atlas.mjs';
// One authoritative catalogue for the registry, SVG atlas and physical gateways.
export async function synchronizeWorldDirectory(atlas,published,deeds=[]){
 const maps=[...new Map(published.filter(map=>map.id!=='public-commons'&&!map.id.startsWith('world-district-')&&map.visibility!=='private'&&map.playable!==false).map(map=>[map.id,map])).values()];
 const initial=await atlas.synchronize(maps);
 const templates=[...maps,...Object.values(initial.cells).filter(cell=>cell.generated).map(cell=>cell.environment)];
 const plots=deeds.map(deed=>memberPlotEnvironment(deed,templates)).filter(Boolean);
 const state=await atlas.synchronize([...maps,...plots],{complete:true});
 const generated=Object.values(state.cells).filter(cell=>cell.generated).map(cell=>cell.environment);
 const all=[...new Map([...generated,...maps,...plots].map(map=>[map.id,attachAtlas(map,state)])).values()],byId=new Map(all.map(map=>[map.id,map]));
 for(const map of all){
  const region=WORLD_DISTRICTS.find(region=>districtMapId(region.id)===map.id);if(region)map.aliases=[...new Set([...(map.aliases||[]),region.id,'space-'+region.id,'district-'+region.id])];
  map.sharedWorld=true;map.multiplayer=true;map.roomId=map.id;map.playUrl='model-explorer.html?environment='+encodeURIComponent(map.id)+'&house='+encodeURIComponent(map.id)+'&mode=multiplayer&autoplay=1';
  if(map.source!=='community-atlas'){
   map.portalTargets=[...new Set([map.districtId,'public-commons'].filter(id=>id&&id!==map.id&&byId.has(id)))];
   map.travelPortals=map.portalTargets.map(id=>({mapId:id,name:byId.get(id).name,color:byId.get(id).districtColor}));
  }
 }
 return {atlas:state,environments:all};
}
