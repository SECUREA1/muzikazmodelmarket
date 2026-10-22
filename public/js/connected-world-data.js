// Each portal-linked room occupies its authoritative atlas cell. Fit the whole
// room uniformly; never shift or resize individual items to make an overview.
export const ATLAS_CELL_SIZE=256;
export function atlasPlotTransform(place,bounds,cellSize=ATLAS_CELL_SIZE){
 const width=Math.max(1,bounds.max.x-bounds.min.x),depth=Math.max(1,bounds.max.z-bounds.min.z),scale=cellSize*.9/Math.max(width,depth),cx=(bounds.min.x+bounds.max.x)/2,cz=(bounds.min.z+bounds.max.z)/2;
 return {scale,x:place.column*cellSize-cx*scale,y:-bounds.min.y*scale,z:place.row*cellSize-cz*scale};
}
export function atlasLocalPoint(transform,point){return {x:transform.x+point.x*transform.scale,y:transform.y+(point.y||0)*transform.scale,z:transform.z+point.z*transform.scale};}
export function atlasDetailCandidates(locations,view,cellSize=ATLAS_CELL_SIZE,limit=4){
 if(!view||view.radius>cellSize*2.5)return [];
 return locations.map(place=>({place,distance:Math.hypot(place.column*cellSize-view.target.x,place.row*cellSize-view.target.z)})).filter(row=>row.distance<=view.radius+cellSize*.75).sort((a,b)=>a.distance-b.distance).slice(0,limit).map(row=>row.place);
}
export function atlasContentVersion(place){return [place.updatedAt,place.contentUpdatedAt,place.savedObjectCount,place.buildingCount,place.activity?.at].join(':');}

export function atlasSnapshotGeometry(snapshot){return JSON.stringify([snapshot?.objects||{},Object.values(snapshot?.actors||{}).map(actor=>[actor.id,actor.modelId,actor.active,actor.open,actor.asset,actor.scale])]);}
