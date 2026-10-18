import {mkdir,writeFile,readFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
const formats={'video/mp4':'mp4','video/webm':'webm','audio/mpeg':'mp3','audio/wav':'wav','audio/ogg':'ogg','video/ogg':'ogg','image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
export class DeviceMediaUploads{
 constructor(directory,index){this.directory=directory;this.index=index;this.queue=Promise.resolve();}
 async records(){try{return JSON.parse(await readFile(this.index,'utf8'));}catch(error){if(error.code==='ENOENT')return [];throw error;}}
 upload(req,identity,roomId){const run=this.queue.then(async()=>{
  const mime=String(req.headers['content-type']||'').split(';')[0],extension=formats[mime];if(!extension)throw Object.assign(Error('Choose MP4, WebM, MP3, WAV, OGG, PNG, JPEG or WebP.'),{statusCode:415});
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>64*1024*1024)throw Object.assign(Error('Media upload must be 64 MB or smaller.'),{statusCode:413});chunks.push(chunk);}const bytes=Buffer.concat(chunks);
  const valid=extension==='mp4'?bytes.toString('ascii',4,8)==='ftyp':extension==='webm'?bytes.subarray(0,4).toString('hex')==='1a45dfa3':extension==='ogg'?bytes.toString('ascii',0,4)==='OggS':extension==='mp3'?bytes.toString('ascii',0,3)==='ID3'||bytes[0]===255&&(bytes[1]&224)===224:extension==='wav'?bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WAVE':extension==='png'?bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a':extension==='jpg'?bytes[0]===255&&bytes[1]===216:bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
  if(!size||!valid)throw Object.assign(Error('The uploaded content does not match its media type.'),{statusCode:400});
  await mkdir(this.directory,{recursive:true});const filename=randomUUID()+'.'+extension,url='/uploads/media/'+filename,record={id:filename,url,mime,size,ownerId:identity.accountId,roomId,createdAt:new Date().toISOString()},records=await this.records();records.push(record);await writeFile(join(this.directory,filename),bytes,{mode:0o600});const temp=this.index+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(records),{mode:0o600});await rename(temp,this.index);return record;
 });this.queue=run.catch(()=>{});return run;}
}
