export const FITNESS_MAP_GOLD='#d8ad45';
export const isFitnessDestination=(place={})=>place.game==='fitness'||(place.mapId||place.id)==='muzikaz-fitness-centre'||place.builderScene?.layout==='fitness-centre'||place.builderScene?.sourceLayout==='fitness-centre';
export function destinationTheme(place={}){
 return place.mapTheme==='gold'||isFitnessDestination(place)?'gold':'';
}
/** Map accents belong to destinations; their district identity stays separate. */
export function destinationColor(place={},fallback='#9cffba'){
 if(/^#[a-f0-9]{6}$/i.test(place.mapColor||''))return place.mapColor;
 return destinationTheme(place)==='gold'?FITNESS_MAP_GOLD:place.districtColor||fallback;
}
export function destinationIcon(place) {
  const label = `${place.mapId || place.id || ''} ${place.name || ''} ${place.category || ''} ${place.game || ''}`;
  if (place.memberPlot || place.deedId || /deed|plot|land parcel/i.test(label)) return '⚑';
  if (place.basketball || /basketball/i.test(label)) return '🏀';
  if (/fitness|gym/i.test(label)) return '🏋';
  if (/hockey/i.test(label)) return '🏒';
  if (/range/i.test(label)) return '🎯';
  if (/pixel.?peak|ski|alpine/i.test(label)) return '⛷';
  if (/marina|dock|yacht|harbou?r/i.test(label)) return '⚓';
  if (/airport|airfield|runway/i.test(label)) return '✈';
  if (/forest|woodland/i.test(label)) return '🌲';
  if (/music|main.?floor|muzikaz.?floor/i.test(label)) return '♫';
  if (/arcade|neon-junction/i.test(label)) return '🎮';
  return '🏠';
}
export function destinationMatches(place, query) {
  return `${place.name} ${place.mapId} ${place.ownerName} ${place.category || ''} ${place.deedId || ''} ${place.districtName || ''} ${place.worldId || ''} ${place.column * 256}, ${place.row * 256}`.toLowerCase().includes(query);
}
