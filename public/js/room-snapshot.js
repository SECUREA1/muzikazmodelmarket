const boot=globalThis.crypto?.randomUUID?.()||String(Date.now())+Math.random();
const actorSets=new Map();let actorSetSequence=0;
const baselineStates=new WeakMap();
const metadataKey='@actorMetadata';
const earthworksKey='@earthworks';
const decorActorsKey='@decorActors';
const componentNames=new Set(['objects','streets','devices','construction','freightHubs','freightDeliveries','residentLife','casinoLife','prison','forestHarvest','forestSnake','island','fitness','fishing','shipping','factory','testing','logistics','questTeams','liveDispatch','questOffers','questResults','transportRadio','skiCompetition','building','firingRange','basketball','match','radTox']);
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const json=value=>JSON.stringify(value);
const sceneKey=state=>json(state.sceneVersion??null);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const missingBaseline=()=>Object.assign(new Error('World snapshot baseline is unavailable. Refreshing the shared world.'),{code:'SNAPSHOT_BASELINE_MISSING',status:409});

function actorMetadata(actors={}){
 const entries=[];
 for(const [id,actor]of Object.entries(actors||{})){
  if(!object(actor))continue;
  const fields={};for(const key of ['definition','asset'])if(own(actor,key)&&actor[key]!==undefined)fields[key]=actor[key];
  if(Object.keys(fields).length)entries.push([id,fields]);
 }
 return Object.fromEntries(entries);
}
function decorActorRecords(actors,environment){
 const authored=new Map((environment.builderScene?.objects||environment.placementScene?.objects||[]).map(item=>[item.id,item.functionalSettings||item.gameplay||{behavior:item.behavior||'decor'}]));
 return Object.fromEntries(Object.entries(actors||{}).filter(([id,actor])=>{
  if(!object(actor)||actor.resident||actor.trafficAI||actor.constructionManaged||actor.basketballManaged||actor.rangeManaged||actor.radTox)return false;
  return (actor.definition?.gameplay||authored.get(id))?.behavior==='decor';
 }));
}
function constructionWithoutEarthworks(value){if(!object(value))return value;const result={...value};delete result.earthworks;return result;}
function componentValue(state,key,parts){
 if(key===decorActorsKey)return Object.fromEntries((parts.get(decorActorsKey)?.actorIds||[]).filter(id=>own(state.actors||{},id)).map(id=>[id,state.actors[id]]));
 if(key===metadataKey)return actorMetadata(state.actors);
 if(key===earthworksKey)return state.construction?.earthworks;
 return key==='construction'&&parts.has(earthworksKey)?constructionWithoutEarthworks(state.construction):state[key];
}
const componentField=key=>key===metadataKey?'snapshotActorMetadata':key===earthworksKey?'snapshotEarthworks':key===decorActorsKey?'snapshotDecorActors':key;
const knownComponent=key=>key===metadataKey||key===earthworksKey||key===decorActorsKey||componentNames.has(key);
function membershipRevision(ids,environment,state){
 const key=ids.join('\0'),scope=String(environment.roomId||environment.id||'')||'anonymous:'+key,now=Date.now();
 let entry=actorSets.get(scope);
 if(!entry||entry.key!==key||entry.scene!==sceneKey(state))entry={key,scene:sceneKey(state),revision:boot+':'+ ++actorSetSequence};
 entry.at=now;actorSets.delete(scope);actorSets.set(scope,entry);
 while(actorSets.size>2048||actorSets.size&&now-actorSets.values().next().value.at>60000)actorSets.delete(actorSets.keys().next().value);
 return entry.revision;
}

/** Exact content revisions; cache eviction causes retransmission, never reuse. */
export function createRoomSnapshotEncoder({maxWorlds=2048,maxBytes=128*1024*1024,maxWorldBytes=2*1024*1024,idleMs=60000,now=Date.now}={}){
 if(!Number.isSafeInteger(maxWorlds)||maxWorlds<1||!Number.isFinite(maxBytes)||maxBytes<0||!Number.isFinite(maxWorldBytes)||maxWorldBytes<1||!Number.isFinite(idleMs)||idleMs<0)throw new RangeError('Invalid snapshot cache limits.');
 const worlds=new Map(),instance=globalThis.crypto?.randomUUID?.()||boot+':'+Math.random();let sequence=0,bytes=0;
 const evict=key=>{const entry=worlds.get(key);if(entry){bytes-=entry.bytes;worlds.delete(key);}};
 return function encode(state,request={},environment={}){
  if(request.snapshotProtocol!==2||request.snapshotMode!=='compact'||!['input','construction-controls'].includes(request.action)||state.sceneVersion&&request.sceneVersion!==state.sceneVersion)return state;
  const currentTime=now(),scope=String(environment.roomId||environment.id||state.roomId||'anonymous'),scene=sceneKey(state);
  let world=worlds.get(scope);
  if(world&&world.scene!==scene){evict(scope);world=null;}
  if(!world)world={scene,components:new Map(),bytes:0,at:currentTime};
  worlds.delete(scope);world.at=currentTime;worlds.set(scope,world);
  const acknowledgements=object(request.snapshotAcknowledgements)?request.snapshotAcknowledgements:{};
  const revisions={},unchanged=[],result={...state},retained=new Set();
  function component(key,value,field,encoded=json(value)){
   if(encoded===undefined||encoded.length*2>maxWorldBytes)return false;
   let prior=world.components.get(key);
   if(!prior||prior.encoded!==encoded){
    const size=encoded.length*2;
    if(prior){world.bytes-=prior.size;bytes-=prior.size;}
    prior={encoded,size,revision:instance+':'+ ++sequence};world.components.set(key,prior);world.bytes+=size;bytes+=size;
   }
   retained.add(key);revisions[key]=prior.revision;
   if(acknowledgements[key]===prior.revision){unchanged.push(key);delete result[field];}
   else result[field]=value;
   return true;
  }
  const metadata=actorMetadata(state.actors);
  if(Object.keys(metadata).length&&component(metadataKey,metadata,'snapshotActorMetadata')){
   result.actors=Object.fromEntries(Object.entries(result.actors||{}).map(([id,actor])=>{
    if(!object(actor))return [id,actor];
    const dynamic={...actor};delete dynamic.definition;delete dynamic.asset;return [id,dynamic];
   }));
  }
  if(state.construction?.earthworks!==undefined&&component(earthworksKey,state.construction.earthworks,'snapshotEarthworks'))result.construction=constructionWithoutEarthworks(state.construction);
  for(const key of componentNames){
   if(!own(state,key)||state[key]===undefined)continue;
   const value=key==='construction'?result.construction:state[key],encoded=json(value);
   if(encoded!==undefined&&encoded.length>=128)component(key,value,key,encoded);
  }
  // Full decor records repeat their metadata. Admit this optional component
  // only after the base components, so it cannot evict otherwise reusable
  // metadata or make a world exceed the global cache budget by itself.
  // Unadmitted records retain the older protocol2 inline actor format.
  if(request.snapshotDecorActors===true){
   const decor=decorActorRecords(state.actors,environment),encoded=json(decor);
   const baseBytes=[...retained].reduce((sum,key)=>sum+world.components.get(key).size,0);
   if(Object.keys(decor).length&&baseBytes+encoded.length*2<=Math.min(maxWorldBytes,maxBytes)&&component(decorActorsKey,decor,'snapshotDecorActors',encoded))result.actors=Object.fromEntries(Object.entries(result.actors||{}).filter(([id])=>!own(decor,id)));
  }
  for(const [key,entry]of world.components)if(!retained.has(key)){world.components.delete(key);world.bytes-=entry.size;bytes-=entry.size;}
  while(world.bytes>maxWorldBytes&&world.components.size){const [key,entry]=world.components.entries().next().value;world.components.delete(key);world.bytes-=entry.size;bytes-=entry.size;}
  while(worlds.size>maxWorlds||bytes>maxBytes||worlds.size&&currentTime-worlds.values().next().value.at>idleMs)evict(worlds.keys().next().value);
  return {...result,snapshotProtocol:2,snapshotRevisions:revisions,...(unchanged.length?{snapshotUnchanged:unchanged}:{})};
 };
}
const encodeProtocol2=createRoomSnapshotEncoder();

// Older clients keep the original compact protocol. Actions and scene changes
// always supply a full recovery baseline unless explicitly negotiated below.
export function compactRoomSnapshot(state,request={},environment={}){
 if(request.action==='construction-controls'&&request.operation==='control'&&request.controlResponse==='ack'){
  const self=state.players?.[state.selfId],actor=state.actors?.[self?.vehicleId];
  return {constructionControlAck:true,authoritative:true,selfId:state.selfId,sequence:state.sequence,serverTime:state.serverTime,inputEpoch:state.inputEpoch??state.result?.inputEpoch,entityId:actor?.id,axes:actor?.construction?.axes||{},result:state.result};
 }
 if(request.snapshotMode!=='compact'||!['input','construction-controls'].includes(request.action))return state;
 if(state.sceneVersion&&request.sceneVersion!==state.sceneVersion)return state;
 if(request.snapshotProtocol===2)return encodeProtocol2(state,request,environment);
 const authored=new Map((environment.builderScene?.objects||environment.placementScene?.objects||[]).map(item=>[item.id,item.functionalSettings||item.gameplay||{behavior:item.behavior||'decor'}]));
 const actors=Object.fromEntries(Object.entries(state.actors||{}).filter(([id,a])=>{const config=a.definition?.gameplay||authored.get(id);return !config||config.behavior!=='decor'||a.constructionManaged||a.resident||a.trafficAI||a.active===false||a.open===true||a.switched===true||a.bunkerAlertState||config.action&&config.action!=='none'||a.holderId||a.health!=null&&a.health!==(config.health??100);}));
 const actorIds=Object.keys(state.actors||{}),revision=membershipRevision(actorIds,environment,state);
 const result={...state,actors,actorsPartial:true,actorSetRevision:revision,...(request.actorSetRevision===revision?{}:{actorIds})};
 if(state.construction?.earthworks&&request.earthworksRevision===state.construction.earthworks.revision)result.construction={...state.construction,earthworks:null,earthworksUnchanged:true};
 return result;
}

/** Acknowledgements refer only to completely hydrated, private baselines. */
export function snapshotAcknowledgements(state){
 const baseline=state&&baselineStates.get(state);
 return baseline?Object.fromEntries([...baseline.components].map(([key,value])=>[key,value.revision])):{};
}
function trackFull(state,previous){
 if(baselineStates.has(state))return state;
 const prior=previous&&baselineStates.get(previous),components=new Map(),scene=sceneKey(state);
 if(prior?.scene===scene)for(const [key,entry]of prior.components){
  const value=componentValue(state,key,prior.components);
  if(json(value)===entry.encoded)components.set(key,entry);
 }
 baselineStates.set(state,{scene,components});return state;
}
function hydrateProtocol2(state,previous){
 const revisions=state.snapshotRevisions,unchanged=state.snapshotUnchanged||[];
 if(!object(revisions)||!Array.isArray(unchanged)||new Set(unchanged).size!==unchanged.length)throw missingBaseline();
 const components=new Map(),prior=previous&&baselineStates.get(previous),scene=sceneKey(state);
 const result={...state};delete result.snapshotProtocol;delete result.snapshotRevisions;delete result.snapshotUnchanged;delete result.snapshotActorMetadata;delete result.snapshotEarthworks;delete result.snapshotDecorActors;
 const reused=new Set(unchanged);let metadata=null,decor,earthworks,hasEarthworks=false;
 for(const key of [metadataKey,earthworksKey,decorActorsKey])if(own(state,componentField(key))&&!own(revisions,key))throw missingBaseline();
 for(const key of reused)if(!own(revisions,key)||!knownComponent(key))throw missingBaseline();
 for(const [key,revision]of Object.entries(revisions)){
  if(!knownComponent(key)||typeof revision!=='string'||revision.length>256)throw missingBaseline();
  const field=componentField(key);let value,encoded;
  if(reused.has(key)){
   const entry=prior?.scene===scene&&prior.components.get(key);
   if(own(state,field)||!entry||entry.revision!==revision)throw missingBaseline();
   encoded=entry.encoded;
   try{value=componentValue(previous,key,prior.components);if(json(value)!==encoded)value=JSON.parse(encoded);}
   catch{value=JSON.parse(encoded);}
  }else{
   if(!own(state,field))throw missingBaseline();value=state[field];encoded=json(value);
   if(encoded===undefined)throw missingBaseline();
  }
  components.set(key,{revision,encoded,...(key===decorActorsKey?{actorIds:Object.keys(value||{})}:{})});
  if(key===decorActorsKey)decor=value;else if(key===metadataKey)metadata=value;else if(key===earthworksKey){earthworks=value;hasEarthworks=true;}else result[key]=value;
 }
 if(decor!==undefined){
  if(!object(decor)||!object(state.actors)||Object.entries(decor).some(([id,actor])=>own(state.actors,id)||!object(actor)))throw missingBaseline();
  result.actors=Object.fromEntries([...Object.entries(decor),...Object.entries(state.actors)]);
 }
 if(metadata!==null){
  if(!object(metadata)||!object(result.actors))throw missingBaseline();
  for(const [id,fields]of Object.entries(metadata)){
   if(!own(result.actors,id)||!object(fields)||Object.keys(fields).some(key=>key!=='definition'&&key!=='asset'))throw missingBaseline();
   if(decor&&own(decor,id)&&Object.entries(fields).some(([key,value])=>!own(decor[id],key)||json(decor[id][key])!==json(value)))throw missingBaseline();
  }
  result.actors=Object.fromEntries(Object.entries(result.actors).map(([id,actor])=>[id,object(actor)?{...actor,...(own(metadata,id)?metadata[id]:{})}:actor]));
 }
 if(hasEarthworks){if(!object(result.construction))throw missingBaseline();result.construction={...result.construction,earthworks};}
 baselineStates.set(result,{scene,components});return result;
}
export function hydrateRoomSnapshot(state,previous){
 if(baselineStates.has(state))return state;
 if(state.snapshotProtocol===2)return hydrateProtocol2(state,previous);
 if(!state.actorsPartial&&!state.construction?.earthworksUnchanged)return trackFull(state,previous);
 let actors=state.actors;
 if(state.actorsPartial){const entries=[];for(const id of state.actorIds||Object.keys(previous?.actors||{})){if(own(state.actors||{},id))entries.push([id,state.actors[id]]);else if(own(previous?.actors||{},id))entries.push([id,previous.actors[id]]);}actors=Object.fromEntries(entries);}
 const construction=state.construction?.earthworksUnchanged?{...state.construction,earthworks:previous?.construction?.earthworks}:state.construction;
 return trackFull({...state,actors,construction},previous);
}
