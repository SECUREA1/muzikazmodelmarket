import {requireBuildingAllowed} from './public/js/room-building-policy.js';
import {RoomStoreJournal} from './room-store-journal.mjs';
import {resolve} from 'node:path';
import {AsyncLocalStorage} from 'node:async_hooks';
import {worldPopulation} from './public/js/world-population.js';
const fileQueues=new Map();
const roomOperation=new AsyncLocalStorage();
const ownRoom=(data,id)=>Object.hasOwn(data,id)&&data[id]||{revision:0,objects:{}};
const put=(data,id,value)=>Object.defineProperty(data,id,{value,enumerable:true,writable:true,configurable:true});
const fail=(message,statusCode)=>{throw Object.assign(new Error(message),{statusCode});};
// Local single-writer storage. Durable commands append room snapshots; the
// background flush can persist dirty rooms without rewriting inactive worlds.
// Default flush() produces the plain JSON checkpoint required by backups and
// master export. Back up/restore through that checkpoint, not a copied live log.
export class SharedRoomStore {
 constructor(file,options={}){this.file=file;this.queueKey=resolve(file);this.queue=Promise.resolve();this.data=null;this.dirty=false;this.dirtyRooms=new Set();this.journal=new RoomStoreJournal(file,options);this.loading=null;this.playerRooms=null;this.roomPlayers=null;this.indexedData=null;}
 resetPlayerIndex(){this.playerRooms=null;this.roomPlayers=null;this.indexedData=null;}
 indexRoom(id,room){
  if(!this.playerRooms)return;
  const previous=this.roomPlayers.get(id)||new Set(),current=new Set(Object.entries(room?.simulation?.players||{}).filter(([,player])=>player&&typeof player==='object').map(([playerId])=>playerId));
  for(const playerId of previous)if(!current.has(playerId)){const rooms=this.playerRooms.get(playerId);rooms?.delete(id);if(!rooms?.size)this.playerRooms.delete(playerId);}
  for(const playerId of current)if(!previous.has(playerId)){if(!this.playerRooms.has(playerId))this.playerRooms.set(playerId,new Set());this.playerRooms.get(playerId).add(id);}
  if(current.size)this.roomPlayers.set(id,current);else this.roomPlayers.delete(id);
 }
 ensurePlayerIndex(){
  if(this.playerRooms&&this.indexedData===this.data)return;
  this.playerRooms=new Map();this.roomPlayers=new Map();this.indexedData=this.data;
  // Include replaced historical records: join also migrates their resident
  // continuity and releases old activities. Cost is this player's saved worlds,
  // rather than every unrelated room in the fleet.
  for(const [id,room]of Object.entries(this.data))this.indexRoom(id,room);
 }
 async load(){
  if(this.data!==null)return;
  if(!this.loading)this.loading=this.journal.read().then(data=>{this.data=data;this.dirtyRooms.clear();this.dirty=false;this.resetPlayerIndex();});
  try{await this.loading;}finally{this.loading=null;}
 }
 read(){
  const read=async()=>{await this.load();return structuredClone(this.data);},context=roomOperation.getStore();
  return context?.active&&context.store===this?read():this.serialized(read);
 }
 serialized(change){
  const execute=async()=>{const context={store:this,active:true};try{return await roomOperation.run(context,change);}finally{context.active=false;}};
  const operation=(fileQueues.get(this.queueKey)||Promise.resolve()).then(execute),tail=operation.catch(()=>{});
  this.queue=tail;fileQueues.set(this.queueKey,tail);
  tail.then(()=>{if(fileQueues.get(this.queueKey)===tail)fileQueues.delete(this.queueKey);});return operation;
 }
 save(data){return this.serialized(async()=>{const owned=structuredClone(data);await this.journal.checkpoint(owned);this.data=owned;this.dirtyRooms.clear();this.dirty=false;this.resetPlayerIndex();});}
 async persist(changes){
  const rooms=Object.create(null);
  for(const id of new Set([...this.dirtyRooms,...changes.keys()]))rooms[id]=changes.has(id)?changes.get(id):Object.hasOwn(this.data,id)?this.data[id]:null;
  await this.journal.append(rooms,this.data);
 }
 publish(changes,persisted){
  if(this.playerRooms&&this.indexedData!==this.data)this.resetPlayerIndex();
  for(const [id,room]of changes){if(room===null)delete this.data[id];else Object.defineProperty(this.data,id,{value:room,enumerable:true,writable:true,configurable:true});this.indexRoom(id,room);if(!persisted)this.dirtyRooms.add(id);}
  if(persisted)this.dirtyRooms.clear();this.dirty=this.dirtyRooms.size>0;
 }
 update(id,change,{persist=true,roomOnly=false,playerScope=null}={}){
  return this.serialized(async()=>{
   await this.load();
   if(roomOnly){
    const room=structuredClone(ownRoom(this.data,id)),result=await change(room,undefined);
    const changes=new Map([[id,structuredClone(room)]]),detached=structuredClone(result);
    if(persist)await this.persist(changes);this.publish(changes,persist);return detached;
   }
   if(playerScope){
    if(typeof playerScope.playerId!=='string'||!playerScope.playerId||playerScope.roomIds!==undefined&&!Array.isArray(playerScope.roomIds))throw new TypeError('Invalid player room scope.');
    this.ensurePlayerIndex();
    const ids=new Set([id,...(this.playerRooms.get(playerScope.playerId)||[]),...(playerScope.roomIds||[])]);
    const data=Object.create(null);
    for(const key of ids)if(Object.hasOwn(this.data,key))Object.defineProperty(data,key,{value:structuredClone(this.data[key]),enumerable:true,writable:true,configurable:true});
    const room=ownRoom(data,id),result=await change(room,data);put(data,id,room);
    // Callbacks see a detached subset. Reject out-of-scope inserts rather than
    // silently creating or deleting unrelated rooms through a scoped join.
    for(const key of Object.keys(data))if(!ids.has(key))throw new TypeError('Player transaction changed a room outside its scope.');
    const changes=new Map();
    for(const key of ids)if(Object.hasOwn(data,key))changes.set(key,structuredClone(data[key]));else if(Object.hasOwn(this.data,key))changes.set(key,null);
    if(persist)await this.persist(changes);this.publish(changes,persist);return result;
   }
   // Explicitly unscoped callbacks retain the full-store transaction boundary.
   const data=structuredClone(this.data),room=ownRoom(data,id),result=await change(room,data);put(data,id,room);
   const owned=structuredClone(data),changes=new Map(Object.entries(owned));
   for(const key of Object.keys(this.data))if(!Object.hasOwn(owned,key))changes.set(key,null);
   if(persist)await this.persist(changes);this.publish(changes,persist);return result;
  });
 }
 updateMany(ids,change,{persist=false}={}){
  // Inactive worlds can contain thousands of saved objects. A simulation tick
  // owns only the requested rooms, so leave all other room records untouched.
  return this.serialized(async()=>{
   await this.load();
   const changes=new Map(),results=[];
   for(const id of new Set(ids)){
    const room=structuredClone(ownRoom(this.data,id));
    try{const result=await change(room,id);changes.set(id,structuredClone(room));results.push({id,result});}
    catch(error){results.push({id,error});}
   }
   if(persist)await this.persist(changes);this.publish(changes,persist);
   return results;
  });
 }
 flush({checkpoint=true}={}){return this.serialized(async()=>{
  await this.load();
  if(checkpoint){if(this.dirty||this.journal.bytes||this.journal.repair!==null){await this.journal.assertCurrent();await this.journal.assertJournalCurrent();await this.journal.checkpoint(this.data);this.dirtyRooms.clear();this.dirty=false;}}
  else{
   if(this.dirty){await this.persist(new Map());this.publish(new Map(),true);}
   if(this.journal.bytes>=this.journal.maxBytes){await this.journal.assertCurrent();await this.journal.assertJournalCurrent();await this.journal.checkpoint(this.data);}
  }
 });}
 get(id){
  const read=async()=>{await this.load();return structuredClone(ownRoom(this.data,id));},context=roomOperation.getStore();
  // Validators and destination resolution read committed state while their own
  // callback works on detached copies. They must not queue behind themselves.
  return context?.active&&context.store===this?read():this.serialized(read);
 }
 populationSnapshot(now=Date.now()){
  const read=async()=>{
   await this.load();const rooms=Object.create(null);
   for(const [id,room]of Object.entries(this.data)){
    const simulation=room?.simulation||{},players=Object.create(null);
    for(const [playerId,player]of Object.entries(simulation.players||{}))if(player&&typeof player==='object'){
     put(players,playerId,{id:playerId,username:player.username,basketballAI:Boolean(player.basketballAI),isAI:Boolean(player.isAI),replacedByRoom:player.replacedByRoom,lastSeen:player.lastSeen});
    }
    put(rooms,id,{simulation:{players},population:worldPopulation(simulation,now)});
   }
   return structuredClone(rooms);
  },context=roomOperation.getStore();
  return context?.active&&context.store===this?read():this.serialized(read);
 }
 mutate(id,actor,command,validate=()=>{}){return this.update(id,async room=>{
  const key=String(command.id||'');if(!/^[\w-]{1,100}$/.test(key))fail('Invalid object id.',400);
  const prior=Object.hasOwn(room.objects,key)?room.objects[key]:undefined;if(command.revision!==(prior?.revision||0))fail('Object changed. Refresh and try again.',409);
  if(command.action==='delete'){
   if(!prior||prior.ownerId!==actor)fail('Only the placer can remove this object.',403);
   put(room.objects,key,{id:key,deleted:true,revision:room.revision+1,ownerId:actor});
  }else{
   requireBuildingAllowed(room);
   if(prior&&prior.ownerId!==actor)fail('Only the placer can edit this object.',403);
   if(prior?.deleted)fail('Object was removed.',409);
   if(Object.keys(room.objects).length>=2000&&!prior)fail('Room building limit reached.',409);
   const value=command.object||{};
   for(const field of ['position','rotation','scale'])if(!Array.isArray(value[field])||value[field].length!==3||!value[field].every(n=>Number.isFinite(n)&&Math.abs(n)<=100000))fail('Invalid transform.',400);
   if(value.scale.some(n=>n<.05||n>20))fail('Invalid scale.',400);
   if(prior&&prior.materialId!==value.materialId)fail('Material identity cannot change.',400);
   await validate(value,prior);
   put(room.objects,key,{id:key,ownerId:actor,revision:room.revision+1,materialId:String(value.materialId),hits:prior?.hits||0,position:value.position,rotation:value.rotation,scale:value.scale,paint:Array.isArray(value.paint)?value.paint.slice(0,200).map(n=>Number(n)>>>0):[],open:value.open===true});
  }
  room.revision++;room.lastBuild={actorId:actor,action:command.action==='delete'?'removed a building piece':prior?'updated a building piece':'placed a building piece',at:Date.now()};return room;
 },{roomOnly:true});}
}
