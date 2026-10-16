// The illustrated 0–100 map covers the live atlas's -8192–8192 world grid.
export function atlasPercentPoint(position){
 const coordinate=value=>{const n=Number(value);if(!Number.isFinite(n))throw Error('Choose valid map coordinates.');return (Math.max(0,Math.min(100,n))-50)*163.84;};
 return {x:coordinate(position.x),z:coordinate(position.y)};
}
export async function resolveIndexDestination(inventory,position,asset){
 if(asset){const id='world-district-'+asset.id;return `model-explorer.html?environment=${encodeURIComponent(id)}&house=${encodeURIComponent(id)}&autoplay=1&mode=multiplayer`;}
 const session=await inventory.roomSession();
 const result=await inventory.api('/api/world-atlas/resolve',{method:'POST',headers:{'X-CSRF-Token':session.csrfToken},body:JSON.stringify(atlasPercentPoint(position))});
 if(!result?.playUrl)throw Error('The server has not confirmed this destination. Try again.');
 return result.playUrl;
}
