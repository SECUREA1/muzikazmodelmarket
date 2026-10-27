/** Permanent Ironwood keepsakes share one identity across rewards, Backpack,
 * Builder, the market and room placement. Security tools remain in the prison. */
const item=(name,description,dimensions,goal)=>Object.freeze({
 name,description,dimensions:Object.freeze(dimensions),goal,type:'props',assetType:'props',
 category:'prison',collection:'Ironwood earned collection',earnedOnly:true,earnedWorld:'ironwood-prison',
 tradable:false,priceMzk:0,useCostMzk:0,format:'procedural-3d'
});
const definitions={
 'prison-radio':item('Ironwood Portable Radio','An earned portable radio with a folding handle, tuning dial and telescopic aerial. Place it in another world to share a direct audio stream.',[.94,1.15,.39],'radio'),
 'prison-chess-set':item('Ironwood Chess Set','A workshop-made folding chessboard with thirty-two individual pieces, a brass clasp and timber edging. An earned display collectible for your home or custom map.',[.92,.43,.95],'arcade'),
 'prison-earned-trophy':item('Ironwood Escape Cup','A polished brass escape-challenge trophy on an engraved dark plinth. Earn it by completing the prison escape, then display it in any of your worlds.',[.71,1.22,.54],'escape'),
 'prison-supply-crate':item('Ironwood Workshop Crate','A reusable workshop-crafted keepsake crate with timber slats, steel corners, handles and a stamped inventory panel. This display collectible does not grant consumable supplies.',[1.19,.9,.92],'work')
};
export const PRISON_ITEMS=Object.freeze(Object.fromEntries(Object.entries(definitions).map(([id,value])=>[id,Object.freeze({...value,thumbnailUrl:'/public/images/prison/items/'+id+'.svg'})])));
export const PRISON_MODEL_INFO=Object.freeze(Object.fromEntries(Object.entries(PRISON_ITEMS).map(([id,value])=>[id,[value.name,value.description,value.dimensions]])));
export function prisonItemSettings(id){
 const value=PRISON_ITEMS[id];if(!value)return null;
 return {active:true,behavior:id==='prison-radio'?'interact':'decor',damage:0,destructible:false,prisonCollectible:id,
  ...(id==='prison-radio'?{device:'radio-console',interactionKey:'e',interactionDistance:3,prompt:'Use '+value.name+' · E / Use'}:{})};
}
export function prisonNativeItem(id){
 const value=PRISON_ITEMS[id];if(!value)return null;const settings=prisonItemSettings(id);
 return {...value,id,buildAssetId:id,image:value.thumbnailUrl,procedural:true,assetKind:'premade',behavior:settings.behavior,function_data:settings};
}
