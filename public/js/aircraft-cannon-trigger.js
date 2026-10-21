// Local firing cadence is independent of HTTP completion. Only a bounded number
// of requests and the newest waiting intent can exist; release cancels backlog.
export function createAircraftCannonTrigger({fire,onVisual=()=>{},canFire=()=>true,onError=()=>{},now=()=>performance.now(),setTimer=setTimeout,clearTimer=clearTimeout,interval=200,maxInFlight=3}={}){
 let holding=false,heldOptions={},disposed=false,timer=null,drainTimer=null,inFlight=0,pending=null,nextShotAt=-Infinity,nextSendAt=-Infinity,generation=0;
 function dispatch(options,epoch){if(disposed||epoch!==generation||!canFire(options))return;inFlight++;nextSendAt=now()+interval;let request;try{request=fire(options);}catch(error){request=Promise.reject(error);}Promise.resolve(request).catch(error=>{if(epoch===generation&&!disposed)onError(error);}).finally(()=>{inFlight--;drain();});}
 function drain(){clearTimer(drainTimer);drainTimer=null;if(!pending||inFlight>=maxInFlight||disposed)return;const wait=nextSendAt-now();if(wait>0){drainTimer=setTimer(drain,wait);return;}const queued=pending;pending=null;dispatch(queued.options,queued.generation);}
 function once(options={}){if(disposed||!canFire(options)||now()+.01<nextShotAt)return false;const at=now();nextShotAt=at+interval;onVisual({at,...options});if(inFlight<maxInFlight&&at>=nextSendAt)dispatch(options,generation);else{pending={options,generation};drain();}return true;}
 function tick(){timer=null;if(!holding||!canFire(heldOptions)){stop();return;}once(heldOptions);timer=setTimer(tick,Math.max(1,nextShotAt-now()));}
 function stop(){holding=false;generation++;pending=null;clearTimer(timer);clearTimer(drainTimer);timer=drainTimer=null;}
 return {fireOnce:once,start(options={}){if(disposed||holding||!canFire(options))return false;heldOptions={...options};holding=true;tick();return true;},stop,dispose(){stop();disposed=true;},get holding(){return holding;},get inFlight(){return inFlight;}};
}
