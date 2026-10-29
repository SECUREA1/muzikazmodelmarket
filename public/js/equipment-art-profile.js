// Renderer-free artwork identity shared by server catalog records and UI icons.
// Stable file paths retain old saved records; the revision bypasses hour-fresh
// browser/CDN SVG responses after this artwork update is published.
export const EQUIPMENT_ART_REVISION='equipment-vector-v1';
export const EQUIPMENT_ART_IDS=Object.freeze([
 ...['laser','pulse-rifle','rail-cannon','pulse-pistol','twin-blaster','heavy-bolt','scatter-shot','marksman','arc-carbine','bat','flamethrower','taser','toxin','dynamite','medkit','shield-kit','scanner','repair-tool','recycler','supply-kit','beacon','spray','brick','jetpack'].map(id=>'tool:'+id),
 'plasma-sword','battle-axe','arc-bow','crystal-staff','funhouse-water-gun',
]);
const ids=new Set(EQUIPMENT_ART_IDS);
export function equipmentArtworkUrl(value){
 const raw=String(value||''),id=ids.has(raw)?raw:ids.has('tool:'+raw)?'tool:'+raw:null;
 return id?'/public/images/native-designs/'+id.replace(':','-')+'.svg?art='+EQUIPMENT_ART_REVISION:'';
}

/** Resolve saved inventory and loadout records through the same artwork identity.
 * Explicit tool/native identities win over thumbnails retained by older saves. */
export function equipmentRecordArtwork(record={}){
 const item=record.asset||record,config=item.function_data||item.functionData||{};
 for(const id of [item.toolId,item.buildAssetId,item.materialId,config.buildAssetId,config.modelId,item.economySku,item.sku,item.id]){
  const artwork=equipmentArtworkUrl(id);if(artwork)return artwork;
 }
 return '';
}
