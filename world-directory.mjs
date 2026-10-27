import {landFieldWorlds} from './land-field-worlds.mjs';
import {isHockeyMap} from './public/js/hockey-rules.js';
import {isArcadeMap} from './public/js/arcade-rules.js';
import {isTropicalIslandMap,tropicalIslandPlayUrl} from './public/js/tropical-island-destination.js';
import {memberPlotEnvironment} from './member-plots.mjs';
import {WORLD_DISTRICTS,districtMapId} from './world-districts.mjs';
import {attachAtlas} from './world-atlas.mjs';
import {readFileSync} from 'node:fs';
import {shippingWorld,SHIPPING_HARBOR_ID} from './shipping-world.mjs';
import {FACTORY_ID} from './public/js/missile-factory-config.js';
import {PROVING_ID,COMPOUND_ID} from './public/js/factory-test-config.js';
const permanentWorlds=JSON.parse(readFileSync(new URL('./public/models/environments/environments.json',import.meta.url),'utf8')).filter(map=>map.permanent===true).map(map=>({...map,source:'repository',visibility:'public',playable:true,multiplayer:true,canDelete:false,canEdit:false}));
// One authoritative catalogue for the registry, SVG atlas and physical gateways.
export async function synchronizeWorldDirectory(atlas,published,deeds=[]){
 // Permanent destinations are part of the world itself. A refresh of uploaded
 // or player-authored maps cannot remove them or override their shared room.
 const maps=[...new Map([...published,...permanentWorlds,shippingWorld(),...landFieldWorlds(deeds)].filter(map=>map.id!=='public-commons'&&!map.id.startsWith('world-district-')&&map.visibility!=='private'&&map.playable!==false).map(map=>[map.id,map])).values()];
 const initial=await atlas.synchronize(maps);
 const templates=[...maps,...Object.values(initial.cells).filter(cell=>cell.generated).map(cell=>cell.environment)];
 const plots=deeds.map(deed=>memberPlotEnvironment(deed,templates)).filter(Boolean);
 const state=await atlas.synchronize([...maps,...plots],{complete:true});
 const generated=Object.values(state.cells).filter(cell=>cell.generated).map(cell=>cell.environment);
 const all=[...new Map([...generated,...maps,...plots].map(map=>[map.id,attachAtlas(map,state)])).values()],byId=new Map(all.map(map=>[map.id,map]));
 for(const map of all){
  const region=WORLD_DISTRICTS.find(region=>districtMapId(region.id)===map.id);if(region)map.aliases=[...new Set([...(map.aliases||[]),region.id,'space-'+region.id,'district-'+region.id])];
  const solo=isTropicalIslandMap(map)||map.source==='custom-builder'&&map.builderScene?.gameplay?.multiplayer===false;
  map.sharedWorld=!solo;map.multiplayer=!solo;map.roomId=map.id;
  const page=isHockeyMap(map)?'hockey.html':isArcadeMap(map)?'arcade.html':'model-explorer.html';
  map.playUrl=isTropicalIslandMap(map)?tropicalIslandPlayUrl(map):page+'?environment='+encodeURIComponent(map.id)+'&house='+encodeURIComponent(map.id)+'&mode='+(solo?'solo':'multiplayer')+'&autoplay=1';
  if(map.source!=='community-atlas'){
   const factoryNeighbors=map.id===FACTORY_ID?[PROVING_ID]:map.id===PROVING_ID?[FACTORY_ID]:map.id===COMPOUND_ID?[PROVING_ID]:[];
   map.portalTargets=[...new Set([map.lot?.mapId,map.districtId,'public-commons',...factoryNeighbors,...(map.id==='hormuz-shipping'?[SHIPPING_HARBOR_ID]:[])].filter(id=>id&&id!==map.id&&byId.has(id)))];
   map.travelPortals=map.portalTargets.map(id=>({mapId:id,name:byId.get(id).name,color:byId.get(id).districtColor}));
  }
 }
 return {atlas:state,environments:all};
}
