import {RANGED_WEAPONS} from './game-weapons.js';
import {UTILITY_TOOLS} from './game-utilities.js';
import {SharedGameInventory,signalInventoryChange} from './shared-game-inventory.js';

export function connectAuthoritativeRoom({roomId,input,render,onStatus,meetingId=null,arrival=null,onError,deferRadTox=false}) {
 const api = new SharedGameInventory();
 let stopped=false, busy=false, session=null, joined=false, sequence=-1, failure=null, retryAt=0, inputRequested=false,fireBusy=false;
 let radToxStarted=false;
 let fireRequest=null,inputSequence=0,inputEpoch=null,nextFireAt=new Map(),arrivalPending=arrival,meetingPending=meetingId;
 const waiters=new Set(),collected=new Set();
 function firstPickup(id){if(collected.has(id))return false;collected.add(id);if(collected.size>1024)collected.delete(collected.values().next().value);return true;}
 function settle(error) {
  for (const waiter of waiters) { clearTimeout(waiter.timer); error ? waiter.reject(error) : waiter.resolve(client); }
  waiters.clear();
 }
 function close(error) {
  stopped=true; client.ready=false; failure=error; clearInterval(timer); settle(error);
 }
 // Refresh only a rejected CSRF proof, and reuse the command request ID so an
 // ambiguous response cannot apply a gameplay action twice.
 async function post(path,body) {
  session ||= await api.roomSession();
  const request=()=>{if(stopped)throw failure || Error('Room closed.');return api.api(path,{method:'POST',headers:{'X-CSRF-Token':session.csrfToken},body:JSON.stringify(body)});};
  try { return await request(); }
  catch (error) {
   if (error.code!=='CSRF_INVALID') throw error;
   session=await api.roomSession();
   return request();
  }
 }
 const client={
  ready:false, selfId:null,
  whenReady(timeoutMs=15000) {
   if (client.ready) return Promise.resolve(client);
   if (stopped) return Promise.reject(failure || Error('Room closed.'));
   return new Promise((resolve,reject)=>{
    const waiter={resolve,reject,timer:setTimeout(()=>{
     const error=Error('The game server did not accept the room connection. Select Try again.');
     close(error); onStatus?.(error.message); onError?.(error);
    },timeoutMs)};
    waiters.add(waiter);
   });
  },
  async send(action,fields={},requestId=crypto.randomUUID()) {
   if(stopped)throw failure||Error('Room closed.');
   if(action==='fire'&&fireRequest)return fireRequest;
   const fireTool=String(fields.tool||'laser');if(action==='fire'&&performance.now()<(nextFireAt.get(fireTool)||0))return null;
   const sentAt=performance.now(),fireInterval=(RANGED_WEAPONS[fireTool]?.interval||UTILITY_TOOLS[fireTool]?.cooldown||(fireTool==='dynamite'?1.2:.25))*1000;
   if(action==='fire')nextFireAt.set(fireTool,sentAt+fireInterval);
   const perform=async()=>{
    const state=await post('/api/rooms/'+encodeURIComponent(roomId)+'/gameplay',{...fields,...(action==='input'?{inputSequence:++inputSequence,...(inputEpoch?{inputEpoch}:{})}:{}),action,requestId});
    if(stopped)return;
    const selfId=state?.selfId||client.selfId;
    if(!selfId||!state?.players?.[selfId])throw Error('The server has not confirmed your player in this room.');
    if(action==='start-rad-tox'&&state.radTox)radToxStarted=true;
    client.selfId=selfId;if(action==='join'){inputEpoch=state.result?.inputEpoch||null;inputSequence=0;}
    if(state.result?.loot&&firstPickup(state.result.loot.id)){signalInventoryChange();window.dispatchEvent(new CustomEvent('muzikaz:pickup-confirmed',{detail:state.result.loot}));if(state.result.loot.currency==='MZK')window.MZKWallet?.refreshShared?.().catch(()=>{});onStatus?.(state.result.message);}
    if(state.result?.pickup&&firstPickup(state.result.pickup.id)){window.dispatchEvent(new CustomEvent('muzikaz:pickup-confirmed',{detail:state.result.pickup}));}
    if(state.sequence>sequence){render(state,selfId,{sentAt,receivedAt:performance.now()});sequence=state.sequence;}
    if(action==='fire'&&state.result?.origin&&state.result?.direction){const event=state.events?.find(event=>event.id===requestId&&event.actorId===selfId)||{...state.result,id:requestId,actorId:selfId,action:'fire',at:state.result.firedAt??state.serverTime};window.dispatchEvent(new CustomEvent('muzikaz:shot-confirmed',{detail:{roomId,event,serverTime:state.serverTime}}));}
    if(['respawn','next-rad-tox'].includes(action))nextFireAt.clear();client.ready=true;settle();return state;
   };
   const pending=perform();if(action==='fire')fireRequest=pending;
   try{return await pending;}catch(error){if(action==='fire'&&error.status===429)nextFireAt.set(fireTool,Math.max(nextFireAt.get(fireTool)||0,performance.now()+fireInterval));throw error;}finally{if(fireRequest===pending)fireRequest=null;}
  },
  async object(command) {
   if (!client.ready) throw Error('Waiting for the server. Placement preview has not been saved.');
   await post('/api/rooms/'+encodeURIComponent(roomId)+'/objects',command);
   const state=await api.api('/api/rooms/'+encodeURIComponent(roomId)+'/gameplay');
   if (!stopped && state.sequence>sequence) { render(state,client.selfId); sequence=state.sequence; }
   return state;
  },
  // Intermediate drags are read by the 50ms heartbeat; edges flush immediately.
  requestInput(immediate=true) { if(!immediate||!client.ready||stopped)return; if(busy){inputRequested=true;return;}void tick(); },
  stop() { close(Error('Room closed.')); }
 };
 function handleError(error) {
   if (stopped) return;
   // Failed joins and expired sessions must leave the loading state. A denied
   // tool action in an already joined room is not a connection failure.
   if (error.code==='ROOM_SWITCHED' || error.status===401 || (!joined && [400,403,404,409,422].includes(error.status))) {
    close(error); onStatus?.(error.message); onError?.(error);
   } else if (joined && error.code==='ROOM_JOIN_REQUIRED') {
    client.ready=false;joined=false;nextFireAt.clear();
    onStatus?.('Rejoining the shared room…');
   } else if (joined && [400,403,409,422,429].includes(error.status)) {
    onStatus?.(error.message);
   } else {
    const wasReady=client.ready;
    client.ready=false; session=null; retryAt=Date.now()+1000;
    if(wasReady)client.whenReady().catch(()=>{});
    onStatus?.('Server connection required: '+error.message);
   }
 }
 async function tick() {
  if (stopped || busy || Date.now()<retryAt) return;
  busy=true;
  try {
   if (!joined) {
    const joinedState=await client.send('join',{...(deferRadTox&&!radToxStarted?{deferRadTox:true}:{}),...(meetingPending?{meetingId:meetingPending}:{}),...(arrivalPending?{travelFrom:arrivalPending.from,travelToken:arrivalPending.token}:{})});
    arrivalPending=null;meetingPending=null;
    if (stopped) return;
    joined=true;
    onStatus?.(joinedState?.result?.message || 'Connected. Gameplay is ready.');
   } else {
    const controls=document.hidden?{}:input();
    const state=await client.send('input',{input:controls});
    const firingControls=document.hidden?{}:input();
    if (!stopped && !fireBusy && state?.players?.[client.selfId]?.health>0 && state?.match?.state!=='finished' && firingControls.firing) {
     fireBusy=true;
     // A slow weapon response must not stall movement or room snapshots.
     void client.send('fire',{tool:firingControls.tool,direction:firingControls.direction,color:firingControls.color,...(Number.isFinite(firingControls.eyeHeight)?{eyeHeight:firingControls.eyeHeight}:{})})
      .catch(error=>{if(error.status!==429)handleError(error);}).finally(()=>{fireBusy=false;});
    }
   }
  } catch (error) { handleError(error);
  } finally { busy=false;if(inputRequested){inputRequested=false;if(!stopped&&client.ready)queueMicrotask(tick);} }
 }
 const timer=setInterval(tick,50);
 tick();
 return client;
}
export function projectSharedBuildings({THREE,system,records,create}){
 const active=new Set();
 const roots=new Map(system.bricks.filter(root=>root.userData.sharedId).map(root=>[root.userData.sharedId,root]));
 for(const record of Object.values(records||{})){
  if(record.deleted)continue;active.add(record.id);
  let root=roots.get(record.id);
  if(system.buildEditor.pending?.root===root&&root)continue;
  if(root&&Number.isFinite(record.revision)&&root.userData.sharedRevision===record.revision)continue;
  if(!root){root=create(record.materialId);root.userData={...root.userData,brick:true,hits:0,maxHits:5,locked:true,sharedId:record.id};system.brickGroup.add(root);system.bricks.push(root);}
  root.position.fromArray(record.position);root.rotation.set(...record.rotation);root.scale.fromArray(record.scale);root.userData.buildScale=root.scale.clone();root.userData.sharedRevision=record.revision;root.userData.sharedOwner=record.ownerId;
  let index=0;root.traverse(mesh=>{if(mesh.isMesh&&mesh.material?.color){const color=record.paint[index++];if(color!==undefined)mesh.material.color.setHex(color);}});
  if(!!root.userData.open!==record.open)system.toggleSharedDoor?.(root);
 }
 system.bricks=system.bricks.filter(root=>{if(root.userData.sharedId&&!active.has(root.userData.sharedId)&&system.buildEditor.pending?.root!==root){root.removeFromParent();return false;}return true;});
}
export function buildingCommand(root){const paint=[];root.traverse(mesh=>{if(mesh.isMesh&&mesh.material?.color)paint.push(mesh.material.color.getHex());});return {id:root.userData.sharedId||crypto.randomUUID(),revision:root.userData.sharedRevision||0,object:{materialId:root.userData.materialId,position:root.position.toArray(),rotation:[root.rotation.x,root.rotation.y,root.rotation.z],scale:root.scale.toArray(),paint,open:!!root.userData.open}};}
