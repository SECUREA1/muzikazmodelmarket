import {isTropicalIslandEnvironment,TROPICAL_ISLAND_ID} from './tropical-island-config.js';
/** One native room and controller for links, atlas pins and legacy bookmarks. */
export const isTropicalIslandMap=isTropicalIslandEnvironment;
export function tropicalIslandPlayUrl(map={},options={}){
 const id=map.id||map.mapId||TROPICAL_ISLAND_ID;
 const params=new URLSearchParams({environment:id,house:map.roomId||id,mode:options.mode||'multiplayer',autoplay:'1'});
 if(options.meet)params.set('meet',options.meet);
 return 'model-explorer.html?'+params.toString();
}
