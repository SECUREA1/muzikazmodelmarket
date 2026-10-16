import {memberPlotEnvironment} from './member-plots.mjs';
import {attachAtlas} from './world-atlas.mjs';
// One authoritative catalogue for the registry, SVG atlas and physical gateways.
export async function synchronizeWorldDirectory(atlas,published,deeds=[]){
 const maps=[...new Map(published.filter(map=>map.id!=='public-commons'&&!map.id.startsWith('world-district-')&&map.visibility!=='private'&&map.playable!==false).map(map=>[map.id,map])).values()];
 const initial=await atlas.synchronize(maps);
 const templates=[...maps,...Object.values(initial.cells).filter(cell=>cell.generated).map(cell=>cell.environment)];
 const plots=deeds.map(deed=>memberPlotEnvironment(deed,templates)).filter(Boolean);
 const state=await atlas.synchronize([...maps,...plots],{complete:true});
 const generated=Object.values(state.cells).filter(cell=>cell.generated).map(cell=>cell.environment);
 return {atlas:state,environments:[...new Map([...generated,...maps,...plots].map(map=>[map.id,attachAtlas(map,state)])).values()]};
}
