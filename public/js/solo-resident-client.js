import {SharedGameInventory} from './shared-game-inventory.js';

export function connectSoloResidents({worldId,getPose,render,onStatus=()=>{},inventory=new SharedGameInventory(),interval=250,deferStart=false}){
 const lifecycle=new AbortController();let stopped=false,busy=false,proof=null,proofRequest=null,timer=null,idleHandle=null,joined=false,retryAt=0,sequence=-1,incarnation=null,requestSequence=0,lastIncarnationRequest=0;
 const path='/api/rooms/'+encodeURIComponent(worldId)+'/residents';
 const client={ready:false,selfId:null,stop(){if(stopped)return;stopped=true;client.ready=false;clearTimeout(timer);if(idleHandle!==null)globalThis.cancelIdleCallback?.(idleHandle);lifecycle.abort();if(proof&&incarnation)void inventory.api(path,{method:'POST',keepalive:true,timeout:1000,headers:{'X-CSRF-Token':proof.csrfToken},body:JSON.stringify({action:'leave',sessionId:incarnation})}).catch(()=>{});},send};
 async function session(){
  if(proof)return proof;
  if(!proofRequest)proofRequest=(async()=>{
   try{return await inventory.roomSession({signal:lifecycle.signal});}
   catch(error){if(error.status!==401)throw error;await inventory.api('/api/access/guest',{method:'POST',body:'{}',signal:lifecycle.signal});return inventory.roomSession({signal:lifecycle.signal});}
  })().then(value=>(proof=value)).finally(()=>{proofRequest=null;});
  return proofRequest;
 }
 async function send(action,fields={}){
  if(stopped)throw Error('Solo world closed.');
  const issuedRequest=++requestSequence;
  let authentication=await session();
  const request=()=>inventory.api(path,{method:'POST',signal:lifecycle.signal,headers:{'X-CSRF-Token':authentication.csrfToken},body:JSON.stringify({...fields,...getPose(),action})});
  let snapshot;
  try{snapshot=await request();}catch(error){if(error.status!==401&&error.code!=='CSRF_INVALID')throw error;proof=null;authentication=await session();snapshot=await request();}
  if(stopped)return snapshot;
  if(snapshot.sessionId!==incarnation){
   if(issuedRequest<lastIncarnationRequest)return snapshot;
   incarnation=snapshot.sessionId;lastIncarnationRequest=issuedRequest;sequence=-1;
  }
  client.ready=true;client.selfId=snapshot.selfId;joined=true;
  if(snapshot.sequence>sequence){sequence=snapshot.sequence;render(snapshot,snapshot.selfId);}
  return snapshot;
 }
 async function poll(){
  if(stopped)return;
  if(!busy&&Date.now()>=retryAt){busy=true;try{await send(joined?'input':'join');}catch(error){if(!stopped){client.ready=false;retryAt=Date.now()+5000;onStatus(error);}}finally{busy=false;}}
  if(!stopped)timer=setTimeout(poll,interval);
 }
 // Build the social cast after the initial graphics/audio controls have had
 // an idle turn. Solo movement and the introductory voice never wait for it.
 if(deferStart&&globalThis.requestIdleCallback)idleHandle=globalThis.requestIdleCallback(()=>{idleHandle=null;void poll();},{timeout:1500});
 else if(deferStart)timer=setTimeout(poll,250);
 else void poll();return client;
}
