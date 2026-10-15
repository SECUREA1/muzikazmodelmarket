import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
const fail=(message,statusCode)=>{throw Object.assign(new Error(message),{statusCode});};
export class SharedRoomStore {
 constructor(file){this.file=file;this.queue=Promise.resolve();this.data=null;this.dirty=false;}
 async read(){if(!this.data){try{this.data=JSON.parse(await readFile(this.file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;this.data={};}}return structuredClone(this.data);}
 async save(data){await mkdir(dirname(this.file),{recursive:true});const temporary=this.file+'.'+randomUUID()+'.tmp';await writeFile(temporary,JSON.stringify(data));await rename(temporary,this.file);this.data=structuredClone(data);this.dirty=false;}
 update(id,change,{persist=true}={}){
  const operation=this.queue.then(async()=>{const data=await this.read(),room=data[id]||{revision:0,objects:{}};const result=await change(room,data);data[id]=room;if(persist)await this.save(data);else{this.data=structuredClone(data);this.dirty=true;}return result;});
  this.queue=operation.catch(()=>{});return operation;
 }
 flush(){const operation=this.queue.then(async()=>{if(this.dirty)await this.save(this.data);});this.queue=operation.catch(()=>{});return operation;}
 async get(id){const data=await this.read();return data[id]||{revision:0,objects:{}};}
 mutate(id,actor,command,validate=()=>{}){return this.update(id,async room=>{
  const key=String(command.id||'');if(!/^[\w-]{1,100}$/.test(key))fail('Invalid object id.',400);
  const prior=room.objects[key];if(command.revision!==(prior?.revision||0))fail('Object changed. Refresh and try again.',409);
  if(command.action==='delete'){
   if(!prior||prior.ownerId!==actor)fail('Only the placer can remove this object.',403);
   room.objects[key]={id:key,deleted:true,revision:room.revision+1,ownerId:actor};
  }else{
   if(prior&&prior.ownerId!==actor)fail('Only the placer can edit this object.',403);
   if(prior?.deleted)fail('Object was removed.',409);
   if(Object.keys(room.objects).length>=2000&&!prior)fail('Room building limit reached.',409);
   const value=command.object||{};
   for(const field of ['position','rotation','scale'])if(!Array.isArray(value[field])||value[field].length!==3||!value[field].every(n=>Number.isFinite(n)&&Math.abs(n)<=100000))fail('Invalid transform.',400);
   if(value.scale.some(n=>n<.05||n>20))fail('Invalid scale.',400);
   if(prior&&prior.materialId!==value.materialId)fail('Material identity cannot change.',400);
   await validate(value,prior);
   room.objects[key]={id:key,ownerId:actor,revision:room.revision+1,materialId:String(value.materialId),hits:prior?.hits||0,position:value.position,rotation:value.rotation,scale:value.scale,paint:Array.isArray(value.paint)?value.paint.slice(0,200).map(n=>Number(n)>>>0):[],open:value.open===true};
  }
  room.revision++;room.lastBuild={actorId:actor,action:command.action==='delete'?'removed a building piece':prior?'updated a building piece':'placed a building piece',at:Date.now()};return room;
 });}
}
