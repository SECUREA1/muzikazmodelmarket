import {forgeWorld} from './forge-world.mjs';
import {worldItemFactoryWorld} from './world-item-factory-world.mjs';
import {forestHarvestWorld} from './forest-harvest-world.mjs';
import {landFieldWorlds} from './land-field-worlds.mjs';
import {isHockeyMap} from './public/js/hockey-rules.js';
import {isArcadeMap} from './public/js/arcade-rules.js';
import {isTropicalIslandMap,tropicalIslandPlayUrl} from './public/js/tropical-island-destination.js';
import {memberPlotEnvironment} from './member-plots.mjs';
import {WORLD_DISTRICTS,districtMapId} from './world-districts.mjs';
import {attachAtlas} from './world-atlas.mjs';
import {readFileSync} from 'node:fs';
import {open,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {shippingWorld,SHIPPING_HARBOR_ID} from './shipping-world.mjs';
import {FACTORY_ID} from './public/js/missile-factory-config.js';
import {PROVING_ID,COMPOUND_ID} from './public/js/factory-test-config.js';
import {buildWorldConnectivity} from './world-connectivity.mjs';
const permanentWorlds=JSON.parse(readFileSync(new URL('./public/models/environments/environments.json',import.meta.url),'utf8')).filter(map=>map.permanent===true).map(map=>({...map,source:'repository',visibility:'public',playable:true,multiplayer:true,canDelete:false,canEdit:false}));
const directories=new WeakMap();
function fileIdentity(info){return [info.dev,info.ino,info.birthtimeNs,info.mtimeNs,info.ctimeNs,info.size].join(':');}
async function atlasFileIdentity(atlas){
 if(!atlas.file)return null;
 try{return fileIdentity(await stat(atlas.file,{bigint:true}));}
 catch(error){if(error.code==='ENOENT')return null;throw error;}
}
function unstableAtlas(){return Object.assign(new Error('The world atlas changed during directory refresh. Please retry.'),{statusCode:503});}
async function persistedAtlas(atlas){
 if(!atlas.file)return {file:null,data:null};
 // Read a single persisted generation. A final path stat also catches an atomic
 // replacement while the old file descriptor remains readable.
 for(let attempt=0;attempt<3;attempt++){
  let handle;
  try{
   handle=await open(atlas.file,'r');
   const before=fileIdentity(await handle.stat({bigint:true}));
   const encoded=await handle.readFile('utf8'),after=fileIdentity(await handle.stat({bigint:true}));
   const visible=await atlasFileIdentity(atlas);
   if(before===after&&after===visible)return {file:visible,data:JSON.parse(encoded)};
  }catch(error){
   if(error.code!=='ENOENT')throw error;
   if(await atlasFileIdentity(atlas)===null)return {file:null,data:null};
  }finally{await handle?.close();}
 }
 throw unstableAtlas();
}
function freezeDirectory(value,seen=new WeakSet()){
 if(!value||typeof value!=='object'||seen.has(value))return value;
 seen.add(value);for(const child of Object.values(value))freezeDirectory(child,seen);return Object.freeze(value);
}
// One authoritative catalogue for the registry, SVG atlas and physical gateways.
// Inputs come from the current server stores on every call. Cache complete
// content, never a time-based ownership decision or only an updatedAt marker.
export async function synchronizeWorldDirectory(atlas,published,deeds=[],{readonly=false}={}){
 const encoded=JSON.stringify([published,deeds]),signature=createHash('sha256').update(encoded).digest('hex');
 let directory=directories.get(atlas);if(!directory){directory={queue:Promise.resolve(),cached:null};directories.set(atlas,directory);}
 const operation=directory.queue.then(async()=>{
 for(let attempt=0;attempt<3;attempt++){
  let queued,file;
  do{queued=atlas.queue;await queued;file=await atlasFileIdentity(atlas);}while(queued!==atlas.queue);
  const cached=directory.cached;
  if(cached&&cached.signature===signature&&cached.data===atlas.data&&cached.revision===atlas.data?.revision&&cached.file===file)return readonly?cached.result:structuredClone(cached.result);
  // Master restore invalidates atlas.data explicitly. Also recognize a replaced
  // checkpoint that was installed without that in-process invalidation hook.
  if(cached&&cached.data===atlas.data&&cached.file!==file)atlas.data=null;
  const [currentPublished,currentDeeds]=JSON.parse(encoded);
  const result=await buildWorldDirectory(atlas,currentPublished,currentDeeds),data=atlas.data,revision=result.atlas.revision,queue=atlas.queue;
  const persisted=await persistedAtlas(atlas);
  // A street/pin transaction may have completed while the directory was built.
  // Return this snapshot, but do not cache it against a newer atlas revision.
  if(data===atlas.data&&data?.revision===revision&&queue===atlas.queue&&atlas.file&&!isDeepStrictEqual(persisted.data,JSON.parse(JSON.stringify(result.atlas)))){
   // An external restore can land after buildWorldDirectory's last transaction.
   // Never tag that older result with the restored file's generation. Wait for
   // in-process transactions before invalidating, preserving any newer owner.
   directory.cached=null;
   await atlas.queue;
   if(data===atlas.data&&data?.revision===revision)atlas.data=null;
   continue;
  }
  const owned=freezeDirectory(structuredClone(result));
  if(data===atlas.data&&data?.revision===revision&&queue===atlas.queue)directory.cached={signature,data,revision,file:persisted.file,result:owned};
  return readonly?owned:result;
 }
 throw unstableAtlas();
 });
 directory.queue=operation.then(()=>{},()=>{});return operation;
}
async function buildWorldDirectory(atlas,published,deeds=[]){
 // Permanent destinations are part of the world itself. A refresh of uploaded
 // or player-authored maps cannot remove them or override their shared room.
 const maps=[...new Map([...published,...permanentWorlds,worldItemFactoryWorld(),forgeWorld(),forestHarvestWorld(),shippingWorld(),...landFieldWorlds(deeds)].filter(map=>map.id!=='public-commons'&&!map.id.startsWith('world-district-')&&map.visibility!=='private'&&map.playable!==false).map(map=>[map.id,map])).values()];
 const initial=await atlas.synchronize(maps);
 const templates=[...maps,...Object.values(initial.cells).filter(cell=>cell.generated).map(cell=>cell.environment)];
 const plots=deeds.map(deed=>memberPlotEnvironment(deed,templates)).filter(Boolean);
 const state=await atlas.synchronize([...maps,...plots],{complete:true});
 const generated=Object.values(state.cells).filter(cell=>cell.generated).map(cell=>cell.environment);
 const all=[...new Map([...generated,...maps,...plots].map(map=>[map.id,attachAtlas(map,state)])).values()],byId=new Map(all.map(map=>[map.id,map]));
 for(const map of all){
  const region=WORLD_DISTRICTS.find(region=>districtMapId(region.id)===map.id);if(region)map.aliases=[...new Set([...(map.aliases||[]),region.id,'space-'+region.id,'district-'+region.id])];
  const solo=map.source==='custom-builder'&&map.builderScene?.gameplay?.multiplayer===false;
  map.sharedWorld=!solo;map.multiplayer=!solo;map.roomId=map.id;
  const page=isHockeyMap(map)?'hockey.html':isArcadeMap(map)?'arcade.html':'model-explorer.html';
  map.playUrl=isTropicalIslandMap(map)?tropicalIslandPlayUrl(map,{mode:solo?'solo':'multiplayer'}):page+'?environment='+encodeURIComponent(map.id)+'&house='+encodeURIComponent(map.id)+'&mode='+(solo?'solo':'multiplayer')+'&autoplay=1';
  if(map.source!=='community-atlas'){
   const factoryNeighbors=map.id===FACTORY_ID?[PROVING_ID,'world-item-factory']:map.id===PROVING_ID?[FACTORY_ID]:map.id===COMPOUND_ID?[PROVING_ID]:[];
   map.portalTargets=[...new Set([map.lot?.mapId,map.districtId,'public-commons',...factoryNeighbors,...(map.id==='traditional-forge'?['world-item-factory','hormuz-shipping']:map.id==='world-item-factory'?['traditional-forge']:[]),...(map.id==='forest-harvest'?['skyscraper-construction','world-item-factory']:['skyscraper-construction','world-item-factory'].includes(map.id)?['forest-harvest']:[]),...(map.id==='hormuz-shipping'?[SHIPPING_HARBOR_ID,'world-item-factory','traditional-forge','muzikaz-airport']:map.id==='muzikaz-airport'?['hormuz-shipping']:map.id==='world-item-factory'?['hormuz-shipping','muzikaz-missile-factory']:[])].filter(id=>id&&id!==map.id&&byId.has(id)))];
   map.travelPortals=map.portalTargets.map(id=>({mapId:id,name:byId.get(id).name,color:byId.get(id).districtColor}));
  }
 }
 const connectivity=buildWorldConnectivity(all,state),locations=new Map(connectivity.locations.map(place=>[place.mapId,place]));
 for(const map of all){const place=locations.get(map.id);map.regionId=place.regionId;map.regionName=place.regionName;map.travelModes=place.modes;}
 return {atlas:state,environments:all,connectivity};
}
