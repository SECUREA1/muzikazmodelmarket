// Portable social progress is restored only from server-owned room records.
// Backpack / Builder save payloads are deliberately not a source of authority.
const VERSION=1,CONTACT_LIMIT=64,LOCAL_CONTACT_LIMIT=32,CASINO_CONTACT_LIMIT=24;
const object=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const number=(value,max=1e9)=>Math.min(max,Math.max(0,Number.isFinite(Number(value))?Number(value):0));
const timestamp=value=>number(value,Number.MAX_SAFE_INTEGER);
const text=(value,max=180)=>typeof value==='string'?value.slice(0,max):'';
const entries=value=>Object.entries(object(value));
const safeKey=value=>typeof value==='string'&&value.length>0&&value.length<=320&&!['__proto__','prototype','constructor'].includes(value);
const clone=value=>structuredClone(value);

function preferences(value){
 const source=object(value),result={};
 for(const key of ['interest','pace'])if(text(source[key],100))result[key]=text(source[key],100);
 return result;
}
function memory(value){
 const source=object(value),saved={visits:Math.floor(number(source.visits)),affinity:Math.max(-20,Math.min(100,Number(source.affinity)||0)),preferences:{},topic:text(source.topic,60)||'greeting',lastAt:number(source.lastAt,Number.MAX_SAFE_INTEGER)};
 for(const key of ['activity','game','pace'])if(text(source.preferences?.[key],100))saved.preferences[key]=text(source.preferences[key],100);
 if(text(source.lastPlayerMessage))saved.lastPlayerMessage=text(source.lastPlayerMessage);
 saved.turns=(Array.isArray(source.turns)?source.turns:[]).slice(-6).map(turn=>({text:text(turn?.text),intent:text(turn?.intent,60),at:number(turn?.at,Number.MAX_SAFE_INTEGER)}));
 return saved;
}
function memories(value,mapId,limit=CONTACT_LIMIT){
 const result=[];
 for(const [rawKey,record]of entries(value)){
  const key=rawKey.includes('|')?rawKey:mapId+'|'+rawKey;
  if(safeKey(key))result.push([key,memory(record)]);
 }
 return Object.fromEntries(result.sort((a,b)=>b[1].lastAt-a[1].lastAt||a[0].localeCompare(b[0])).slice(0,limit));
}
function casinoMemories(value){
 return Object.fromEntries(entries(value).filter(([key])=>safeKey(key)).map(([key,value])=>[key,memory(value)]).sort((a,b)=>b[1].lastAt-a[1].lastAt||a[0].localeCompare(b[0])).slice(0,CASINO_CONTACT_LIMIT));
}
function mergeMemories(...sources){
 const merged=Object.create(null);
 for(const source of sources)for(const [key,value]of entries(source))if(safeKey(key)&&(!merged[key]||timestamp(value.lastAt)>=timestamp(merged[key].lastAt)))merged[key]=memory(value);
 return Object.fromEntries(Object.entries(merged).sort((a,b)=>b[1].lastAt-a[1].lastAt||a[0].localeCompare(b[0])).slice(0,CONTACT_LIMIT));
}
function progress(value){
 const source=object(value),skills=Object.fromEntries(entries(source.skills).filter(([key])=>/^[a-z][a-zA-Z0-9-]{0,39}$/.test(key)).slice(0,32).map(([key,value])=>[key,number(value)]));
 const earned=Array.isArray(source.cosmetics)?source.cosmetics:Array.isArray(source.badges)?source.badges:[];
 const cosmetics=[...new Set(earned.filter(value=>typeof value==='string').map(value=>text(value,100)))].slice(-64);
 const completedKeys=[...new Set((Array.isArray(source.completedKeys)?source.completedKeys:[]).filter(safeKey))].slice(-128);
 return {reputation:number(source.reputation),skills,cosmetics,completedTasks:Math.floor(number(source.completedTasks??source.completedFavors)),completedKeys};
}
function legacyProgress(players){
 // Older saves had independent room-local counters, with no receipt identities
 // proving whether copied values represented separate rewards. Keep their
 // greatest earned values once; future writes use the canonical revision.
 const result=progress({});
 for(const player of players){
  const value=progress(player.residentProgress);
  result.reputation=Math.max(result.reputation,value.reputation);result.completedTasks=Math.max(result.completedTasks,value.completedTasks);
  for(const [key,xp]of Object.entries(value.skills))result.skills[key]=Math.max(result.skills[key]||0,xp);
  result.cosmetics=[...new Set([...result.cosmetics,...value.cosmetics])].slice(-64);
  result.completedKeys=[...new Set([...result.completedKeys,...value.completedKeys])].slice(-128);
 }
 return result;
}
function validBundle(value,actorId){return value?.version===VERSION&&value.actorId===actorId&&Number.isSafeInteger(value.revision)&&value.revision>=0;}
function localMemories(contacts,mapId){
 const prefix=mapId+'|',all=entries(contacts).sort((a,b)=>b[1].lastAt-a[1].lastAt||a[0].localeCompare(b[0]));
 return Object.fromEntries([...all.filter(([key])=>key.startsWith(prefix)),...all.filter(([key])=>!key.startsWith(prefix))].slice(0,LOCAL_CONTACT_LIMIT));
}

/** Join-time migration and restoration. Run inside SharedRoomStore's serialized
 * join transaction, after the authenticated account's player record exists. */
export function restoreResidentContinuity(player,allRooms,actorId,mapId,now){
 const records=[];
 for(const [roomId,room]of entries(allRooms)){
  const saved=room?.simulation?.players?.[actorId];if(saved)records.push({mapId:roomId,player:saved});
 }
 if(!records.some(record=>record.player===player))records.push({mapId,player});
 const bundles=records.map(record=>record.player.residentContinuity).filter(value=>validBundle(value,actorId)).sort((a,b)=>b.revision-a.revision||timestamp(b.updatedAt)-timestamp(a.updatedAt));
 const latest=bundles[0];
 let contacts={},casinoContacts={};
 // Include legacy contact records as well as retained partitions. Contact
 // timestamps prevent an old room copy from replacing a more recent exchange.
 for(const record of records){contacts=mergeMemories(contacts,memories(record.player.residentSocial,record.mapId));casinoContacts=mergeMemories(casinoContacts,casinoMemories(record.player.casinoSocial));}
 for(const bundle of [...bundles].reverse()){contacts=mergeMemories(contacts,memories(bundle.contacts,mapId));casinoContacts=mergeMemories(casinoContacts,casinoMemories(bundle.casinoContacts));}
 const inherited=latest?preferences(latest.preferences):Object.assign({},...records.sort((a,b)=>timestamp(a.player.lastSeen)-timestamp(b.player.lastSeen)).map(record=>preferences(record.player.residentPreferences)));
 if(!inherited.interest){const recent=entries(contacts).find(([,value])=>value.preferences.activity)||entries(casinoContacts).find(([,value])=>value.preferences.game);if(recent)inherited.interest=recent[1].preferences.activity||recent[1].preferences.game;}
 const bundle={version:VERSION,actorId,revision:latest?.revision||0,updatedAt:timestamp(latest?.updatedAt||now),contacts,casinoContacts:casinoMemories(casinoContacts),preferences:inherited,progress:latest?progress(latest.progress):legacyProgress(records.map(record=>record.player))};
 player.residentContinuity=clone(bundle);player.residentSocial=localMemories(contacts,mapId);player.residentPreferences=clone(inherited);player.residentProgress=clone(bundle.progress);
 if(mapId==='muzikaz-casino')player.casinoSocial=clone(bundle.casinoContacts);
 return clone(bundle);
}

/** Checkpoint after a successful conversation, favor, or join. Room commands
 * already serialize this write and persist it with the rest of the save. */
export function saveResidentContinuity(player,mapId,now,actorId=player.actorId){
 if(!actorId)return null;
 const previous=validBundle(player.residentContinuity,actorId)?player.residentContinuity:null;
 const contacts=mergeMemories(previous?.contacts,memories(player.residentSocial,mapId));
 const casinoContacts=casinoMemories(mergeMemories(previous?.casinoContacts,mapId==='muzikaz-casino'?casinoMemories(player.casinoSocial):{}));
 const inherited=preferences(player.residentPreferences);
 if(mapId==='muzikaz-casino'){
  const stated=entries(casinoContacts).find(([,value])=>value.topic==='preference'&&value.preferences.game&&value.lastAt>=timestamp(previous?.updatedAt));
  if(stated)inherited.interest=stated[1].preferences.game;
 }
 if(!inherited.interest){const recent=entries(casinoContacts).find(([,value])=>value.preferences.game);if(recent)inherited.interest=recent[1].preferences.game;}
 const bundle={version:VERSION,actorId,revision:(previous?.revision||0)+1,updatedAt:number(now,Number.MAX_SAFE_INTEGER),contacts,casinoContacts,preferences:inherited,progress:progress(player.residentProgress)};
 player.residentContinuity=clone(bundle);player.residentPreferences=clone(inherited);
 return clone(bundle);
}
