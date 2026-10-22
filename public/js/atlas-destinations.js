export function destinationIcon(place) {
  const label = `${place.mapId || place.id || ''} ${place.name || ''} ${place.category || ''} ${place.game || ''}`;
  if (place.memberPlot || place.deedId || /deed|plot|land parcel/i.test(label)) return '⚑';
  if (place.basketball || /basketball/i.test(label)) return '🏀';
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
