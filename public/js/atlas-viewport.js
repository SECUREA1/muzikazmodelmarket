export function fitAtlasLocations(locations,focus=locations[0]){
 if(!locations.length)return {panX:0,panZ:0,zoom:5};
 const xs=locations.map(p=>p.column),zs=locations.map(p=>p.row);
 const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
 return {panX:(minX+maxX)/2-focus.column,panZ:(minZ+maxZ)/2-focus.row,zoom:Math.max(5,maxX-minX+2,maxZ-minZ+2)};
}
