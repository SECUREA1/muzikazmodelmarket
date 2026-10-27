/** Native destination shared by the map directory, atlas and explorer. */
export const isTropicalIslandMap=(map={})=>map.id==='tropical-island'||map.mapId==='tropical-island'||map.game==='tropical-island';
export function tropicalIslandPlayUrl(map={}){
 return 'tropical-island.html?environment='+encodeURIComponent(map.id||map.mapId||'tropical-island')+'&mode=solo&autoplay=1';
}
