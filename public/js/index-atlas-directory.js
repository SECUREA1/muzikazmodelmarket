export function filterAtlasLocations(locations,query=''){
 const words=query.toLowerCase().trim().split(/\s+/).filter(Boolean);
 return locations.filter(place=>words.every(word=>[place.name,place.mapId,place.ownerName,place.districtName,place.deedId].filter(Boolean).join(' ').toLowerCase().includes(word)));
}
export function atlasLocationPosition(place,cellSize=256){
 if(!place?.mapId)throw Error('Choose a listed server destination.');
 return {mapId:place.mapId,meetingId:null,playUrl:place.playUrl,place:place.name||place.mapId,detail:place.description||[place.districtName,place.ownerName,'Shared server destination'].filter(Boolean).join(' · '),x:Math.max(0,Math.min(100,50+(Number(place.column)||0)*cellSize/163.84)),y:Math.max(0,Math.min(100,50+(Number(place.row)||0)*cellSize/163.84))};
}
