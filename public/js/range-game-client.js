import {SharedGameInventory} from './shared-game-inventory.js';

/** A waiting course room; joining never starts the shared clock. */
export function createRangeGameClient({roomId,onSnapshot=()=>{},onError=()=>{},api=new SharedGameInventory()}={}){
 let session,sequence=-1,joined=false,closed=false,polling=false,shooting=false,snapshot;
 async function command(action,fields={}){
  if(closed)return null;
  session ||= await api.roomSession();
  const body=JSON.stringify({action,...fields,requestId:crypto.randomUUID()});
  const request=()=>api.api('/api/rooms/'+encodeURIComponent(roomId)+'/range',{method:'POST',headers:{'X-CSRF-Token':session.csrfToken},body});
  let value;
  try{value=await request();}catch(error){if(error.code!=='CSRF_INVALID')throw error;session=await api.roomSession();value=await request();}
  if(closed)return null;
  if(action==='join')joined=true;
  if(action==='leave')joined=false;
  if(value.sequence>sequence){sequence=value.sequence;snapshot=value;onSnapshot(value);}
  return value;
 }
 const timer=setInterval(async()=>{if(!joined||closed||polling)return;polling=true;try{await command('watch');}catch(error){onError(error);}finally{polling=false;}},500);
 return {command,get snapshot(){return snapshot;},get joined(){return joined;},
  async shoot(origin,direction){if(shooting||!joined||closed)return null;shooting=true;try{return await command('shot',{origin,direction});}finally{shooting=false;}},
  dispose(){if(closed)return;if(joined)void command('leave').catch(()=>{});closed=true;joined=false;clearInterval(timer);}
 };
}
