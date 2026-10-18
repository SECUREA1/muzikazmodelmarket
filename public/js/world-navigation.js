import {canonicalWorldId} from './sports-worlds.js';
export function selectedWorldId(registry,params){
 const requested=canonicalWorldId(params.get('environment')||params.get('house'));
 return requested?(registry.find(requested)?.id||requested):(registry.find('muzikaz-main')?.id||registry.all()[0]?.id);
}
export function outsideDestination(currentId,returnId){
 return currentId==='public-commons'?(returnId||'muzikaz-main'):'public-commons';
}
export function outsideLabel(currentId,returnId){
 return currentId==='public-commons'?(returnId&&returnId!=='muzikaz-main'?'Return to your map':'Enter house'):'🚪 Outside · Public map';
}
