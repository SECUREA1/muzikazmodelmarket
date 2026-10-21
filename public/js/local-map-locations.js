// Both the SVG and the authoritative landing checks use the loaded footprint.
// In particular an authored GLB need not be centred on the world origin.
export function localMapBounds(environment,bounds=null,{scale=1}={}){
 scale=Number.isFinite(scale)&&scale>0?scale:1;
 const base=environment?.builderScene?.baseEnvironment;
 // Terrain has a declared footprint. Decorations may extend its render or
 // collision bounds differently, so they must not move the portal coordinates.
 if((environment?.builderScene||environment?.proceduralLand)&&!(base?.modelUrl||base?.modelUrls?.length))bounds=null;
 const value=(axis,side)=>bounds?.[side]?.[axis]??bounds?.[side+axis.toUpperCase()];
 const minX=value('x','min'),maxX=value('x','max'),minZ=value('z','min'),maxZ=value('z','max');
 if([minX,maxX,minZ,maxZ].every(Number.isFinite)&&maxX>minX&&maxZ>minZ)return {minX,maxX,minZ,maxZ,minY:Number.isFinite(value('y','min'))?value('y','min'):0,maxY:Number.isFinite(value('y','max'))?value('y','max'):0};
 const harbor=Number(environment?.builderScene?.layoutMeta?.harbor?.extent),size=Number(environment?.builderScene?.mapSize)||Number(environment?.playableSize)||256,extent=(harbor>0?harbor:Math.max(1,size/2))*scale;
 return {minX:-extent,maxX:extent,minZ:-extent,maxZ:extent,minY:0,maxY:0};
}

export function localMapLocations(environment,bounds=null,{scale=1}={}){
 scale=Number.isFinite(scale)&&scale>0?scale:1;
 const meta=environment?.builderScene?.layoutMeta||{},places=[],seen=new Set(),footprint=localMapBounds(environment,bounds,{scale});
 const authored=[...(Array.isArray(meta.locations)?meta.locations:[]),...(Array.isArray(meta.commonsLocations)?meta.commonsLocations:[])];
 for(const [index,place]of authored.entries()){
  if(!place||![place.x,place.z].every(Number.isFinite))continue;
  const id=String(place.id||'local-'+index);if(seen.has(id))continue;seen.add(id);
  const scaled=point=>({...point,...Object.fromEntries(['x','y','z'].filter(axis=>Number.isFinite(point[axis])).map(axis=>[axis,point[axis]*scale]))});
  places.push({...scaled(place),...(place.arrival?{arrival:scaled(place.arrival)}:{}),id,name:String(place.name||'Location '+(index+1)),width:Math.max(2,(Number(place.width)||8)*scale),depth:Math.max(2,(Number(place.depth)||8)*scale)});
 }
 const spawn=environment?.spawn?.position||environment?.spawn||{},centerX=(footprint.minX+footprint.maxX)/2,centerZ=(footprint.minZ+footprint.maxZ)/2;
 const x=Number.isFinite(spawn.x)&&spawn.x*scale>=footprint.minX&&spawn.x*scale<=footprint.maxX?spawn.x*scale:centerX,z=Number.isFinite(spawn.z)&&spawn.z*scale>=footprint.minZ&&spawn.z*scale<=footprint.maxZ?spawn.z*scale:centerZ,y=Number.isFinite(spawn.y)?spawn.y*scale:footprint.minY;
 if(!seen.has('map-arrival'))places.push({id:'map-arrival',name:'Arrival',x,y,z,width:8,depth:8,teleportal:true,description:'Return to this map’s arrival area.'});
 // Rich maps already provide their authored destinations (including islands
 // and buildings). Unauthored maps get portals distributed over the footprint.
 if(places.length<5){
  for(const [id,name,fx,fz]of [['north','North',.5,.22],['north-east','North east',.78,.22],['east','East',.78,.5],['south-east','South east',.78,.78],['south','South',.5,.78],['south-west','South west',.22,.78],['west','West',.22,.5],['north-west','North west',.22,.22]]){
   if(seen.has('map-'+id))continue;
   places.push({id:'map-'+id,name:name+' teleportal',x:footprint.minX+(footprint.maxX-footprint.minX)*fx,y,z:footprint.minZ+(footprint.maxZ-footprint.minZ)*fz,width:6,depth:6,teleportal:true,description:'Travel to supported clear floor in this part of the map. Water and blocked areas cannot be used.'});
  }
 }
 return places;
}
