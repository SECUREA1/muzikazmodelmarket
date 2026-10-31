import {isForgeEnvironment} from './forge-config.js?v=forge-atelier-20261031';

/** Bounded polling of confirmed warehouse stock; presentation never changes it. */
export function createForgePresentationClient({request,getEnvironment,onData=()=>{},now=()=>Date.now(),intervalMs=10000}={}){
 let generation=0,activeId=null,pending=null,controller=null,nextAt=0,dirty=0,lastError='';
 function invalidate(){generation++;controller?.abort();controller=null;pending=null;nextAt=0;lastError='';dirty++;onData(null);}
 function reset(){invalidate();activeId=null;}
 function refresh({force=false}={}){
  const environment=getEnvironment?.();
  if(!isForgeEnvironment(environment)){if(activeId)reset();return Promise.resolve(null);}
  if(activeId!==environment.id){reset();activeId=environment.id;}
  if(pending)return pending;
  if(!force&&now()<nextAt)return Promise.resolve(null);
  const issued=generation,revision=dirty,id=activeId,abort=new AbortController();controller=abort;nextAt=now()+intervalMs;
  const run=Promise.resolve().then(()=>request('/api/forge/presentation?mapId='+encodeURIComponent(id),{signal:abort.signal})).then(data=>{
   if(issued!==generation||id!==getEnvironment?.()?.id||abort.signal.aborted)return null;
   lastError='';onData(data);return data;
  }).catch(error=>{if(issued===generation&&!abort.signal.aborted){lastError=error.message||'Dispatch stock unavailable.';nextAt=now()+Math.min(intervalMs,5000);}return null;}).finally(()=>{
   if(issued===generation){pending=null;controller=null;if(revision!==dirty)nextAt=0;}
  });
  pending=run;return run;
 }
 return {refresh,invalidate,reset,dispose:reset,snapshot:()=>({activeId,pending:!!pending,lastError})};
}
