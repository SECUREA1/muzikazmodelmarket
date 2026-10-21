// Display centers only; navigation chooses safe water-side approaches.
export function harborDestinations(environment){
 const meta=environment?.builderScene?.layoutMeta,harbor=meta?.harbor;if(!harbor)return [];
 const marina=(meta.locations||[]).find(place=>place.id==='marina')||{id:'marina',name:'Neon Marina',x:132,z:30};
 return [{id:'open-water',name:'Open water',x:184,z:80},{id:marina.id,name:marina.name,x:marina.x,z:marina.z},...(harbor.islands||[]).map(({id,name,x,z})=>({id,name,x,z}))];
}
