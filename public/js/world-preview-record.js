import {previewWorldId,worldPreviewKey} from './world-preview-data.js';

// A directory entry may contain an old thumbnail, model URL or a partial scene.
// Resolve its identity before loading geometry, just as joining that map does.
export function createWorldPreviewResolver(api,{limit=24,maxAge=30000,now=Date.now}={}){
 const records=new Map();
 return async world=>{
  const id=previewWorldId(world);if(!id)return world;
  const key=worldPreviewKey(world);let entry=records.get(key);
  if(!entry||now()-entry.at>=maxAge){
   entry={at:now()};
   entry.pending=Promise.resolve().then(()=>api('/api/environments/'+encodeURIComponent(id))).then(record=>{
    if(!record||typeof record!=='object'||record.id&&record.id!==id)throw Error('The saved map does not match this destination.');
    // Do not merge the list's render fields back in: a procedural destination
    // can intentionally have no modelUrl, and a saved base can have changed.
    return {...record,id,name:record.name||world.name||'World destination'};
   }).catch(error=>{if(records.get(key)===entry)records.delete(key);throw error;});
   records.set(key,entry);if(records.size>limit)records.delete(records.keys().next().value);
  }
  return entry.pending;
 };
}
