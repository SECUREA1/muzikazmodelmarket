import {canonicalWorldId} from './sports-worlds.js';
export function selectedWorldId(registry,params){
 const requested=canonicalWorldId(params.get('environment')||params.get('house'));
 return requested?(registry.find(requested)?.id||requested):(registry.find('muzikaz-main')?.id||registry.all()[0]?.id);
}
export function freshWorldUrl(currentUrl,environment,{meetingId=null}={}){
 const url=new URL(currentUrl);
 url.searchParams.set('environment',environment.id);
 url.searchParams.set('house',environment.id);
 url.searchParams.set('autoplay','1');
 url.searchParams.set('mode',environment.multiplayer===false?'solo':url.searchParams.get('mode')||'multiplayer');
 // Each destination owns a fresh client and server join, including return visits.
 // Never carry a previous meeting or a one-shot item deployment into it.
 url.searchParams.delete('meet');
 url.searchParams.delete('useItem');
 if(meetingId)url.searchParams.set('meet',meetingId);
 url.hash='';
 return url;
}
export function outsideDestination(currentId,returnId){
 return currentId==='public-commons'?(returnId||'muzikaz-main'):'public-commons';
}
export function outsideLabel(currentId,returnId){
 return currentId==='public-commons'?(returnId&&returnId!=='muzikaz-main'?'Return to your map':'Enter house'):'🚪 Outside · Public map';
}
