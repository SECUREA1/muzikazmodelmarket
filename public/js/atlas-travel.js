// Saving a shortcut is optional: the destination's server still authorizes entry.
// Keep its canonical URL, including the game page and selected meeting point.
export function atlasMeetingDestination(playUrl,mapId,meetingId,roomId=mapId) {
 const destination=new URL(playUrl||'model-explorer.html','https://world.invalid/');
 destination.searchParams.set('environment',mapId);destination.searchParams.set('house',roomId);destination.searchParams.set('autoplay','1');
 if(meetingId)destination.searchParams.set('meet',meetingId);else destination.searchParams.delete('meet');
 return destination.pathname.replace(/^\//,'')+destination.search+destination.hash;
}

export async function atlasTravelDestination(inventory, playUrl, {mapId, meetingId=null, point}={}) {
 if (!mapId) return playUrl;
 try {
  const session=await inventory.roomSession({timeout:1500});
  if (session) await inventory.api('/api/world-atlas/pins', {
   method:'POST', timeout:1500, headers:{'X-CSRF-Token':session.csrfToken},
   body:JSON.stringify({mapId,meetingId,...(point?{point}:{})})
  });
 } catch { /* Pin storage must not prevent travel to an existing destination. */ }
 return playUrl;
}
