// The illustrated 0–100 map covers the live atlas's -8192–8192 world grid.
export function atlasPercentPoint(position){
 const coordinate=value=>{const n=Number(value);if(!Number.isFinite(n))throw Error('Choose valid map coordinates.');return (Math.max(0,Math.min(100,n))-50)*163.84;};
 return {x:coordinate(position.x),z:coordinate(position.y)};
}
export function savedDestination(position){
 let linked=null;try{linked=new URL(position.playUrl,'https://world.invalid/');}catch{}
 return position.mapId||position.environmentId||position.spaceId||(position.deedId?'plot-'+position.deedId:null)||linked?.searchParams.get('environment')||linked?.searchParams.get('house')||null;
}
function savedMeeting(position){try{return position.meetingId||new URL(position.playUrl||'','https://world.invalid/').searchParams.get('meet');}catch{return position.meetingId||null;}}
export function rememberDestination(position,url){
 const parsed=new URL(url,'https://world.invalid/');return {...position,mapId:parsed.searchParams.get('environment')||parsed.searchParams.get('house'),meetingId:parsed.searchParams.get('meet'),playUrl:parsed.pathname.replace(/^\//,'')+parsed.search};
}
export async function resolveIndexDestination(inventory,position,asset){
 const saved=savedDestination(position);
 if(saved){
  const map=await inventory.api('/api/environments/'+encodeURIComponent(saved));
  if(!map?.id)throw Error('This pinned map is not currently listed on the server.');
  const session=await inventory.roomSession();
  const pin=await inventory.api('/api/world-atlas/pins',{method:'POST',headers:{'X-CSRF-Token':session.csrfToken},body:JSON.stringify({mapId:map.id,meetingId:savedMeeting(position),point:{x:Number(position.x),y:Number(position.y)}})});
  if(!pin?.playUrl)throw Error('The server has not confirmed this pinned destination.');return pin.playUrl;
 }
 if(asset){const id='world-district-'+asset.id;return `model-explorer.html?environment=${encodeURIComponent(id)}&house=${encodeURIComponent(id)}&autoplay=1&mode=multiplayer`;}
 const session=await inventory.roomSession();
 const result=await inventory.api('/api/world-atlas/resolve',{method:'POST',headers:{'X-CSRF-Token':session.csrfToken},body:JSON.stringify(atlasPercentPoint(position))});
 if(!result?.playUrl)throw Error('The server has not confirmed this destination. Try again.');
 return result.playUrl;
}
