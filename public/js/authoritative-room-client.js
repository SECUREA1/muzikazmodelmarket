import {hydrateRoomSnapshot} from './room-snapshot.js';
import {RAD_TOX_SHOT_INTERVAL_MS} from './rad-tox-rules.js';
import {RANGED_WEAPONS} from './game-weapons.js';
import {UTILITY_TOOLS} from './game-utilities.js';
import {SharedGameInventory,signalInventoryChange} from './shared-game-inventory.js';

export function connectAuthoritativeRoom({roomId,input,render,onStatus,meetingId=null,arrival=null,residentWalkthrough=false,onError,deferRadTox=false,radToxEnabled,onShot=()=>{},inputInterval=50,renderInterval=0}) {
 const api = new SharedGameInventory(),lifecycle=new AbortController();
 let renderTimer=null,pendingRender=null,lastRenderAt=null,latestSnapshot=null;
 let stopped=false, busy=false, session=null, sessionRequest=null, joined=false, sequence=-1, failure=null, retryAt=0,fireBusy=false;
 let confirmedOnce=false;
 let connectionRevision=0,tickToken=null,pendingInput=null;const automaticInputs=new Set();
 let radToxStarted=false,radToxPreference=radToxEnabled;
 let fireRequest=null,queuedFire=null,aircraftFireRequests=0,constructionSequence=0,inputSequence=0,lastConfirmedInputSequence=0,inputEpoch=null,inputEpochSequence=-1,nextFireAt=new Map(),arrivalPending=arrival,meetingPending=meetingId;
 const waiters=new Set(),collected=new Set();
 function firstPickup(id){if(collected.has(id))return false;collected.add(id);if(collected.size>1024)collected.delete(collected.values().next().value);return true;}
 function settle(error) {
  for (const waiter of waiters) { clearTimeout(waiter.timer); error ? waiter.reject(error) : waiter.resolve(client); }
  waiters.clear();
 }
 function close(error) {
  stopped=true; client.ready=false; failure=error; invalidateInputs();clearInterval(timer);clearTimeout(renderTimer);renderTimer=null;pendingRender=null;lifecycle.abort();settle(error);
 }
 function invalidateInputs(){connectionRevision++;automaticInputs.clear();pendingInput=null;busy=false;tickToken=null;clearTimeout(renderTimer);renderTimer=null;pendingRender=null;}
 // Refresh only a rejected CSRF proof, and reuse the command request ID so an
 // ambiguous response cannot apply a gameplay action twice.
 function roomSession(){
  if(session)return Promise.resolve(session);
  // Share one proof refresh across overlapping inputs and cannon requests.
  if(!sessionRequest)sessionRequest=api.roomSession({signal:lifecycle.signal}).then(value=>{session=value;return value;}).finally(()=>{sessionRequest=null;});
  return sessionRequest;
 }
 async function post(path,body) {
  let proof=session||await roomSession();
  const request=()=>{if(stopped)throw failure || Error('Room closed.');return api.api(path,{method:'POST',signal:lifecycle.signal,timeout:body.action==='join'?25000:8000,...(body.controlResponse==='ack'?{priority:'high'}:{}),headers:{'X-CSRF-Token':proof.csrfToken},body:JSON.stringify(body)});};
  try { return await request(); }
  catch (error) {
   if (error.code!=='CSRF_INVALID') throw error;
   // A late rejection can reuse the newer proof already fetched by a peer.
   if(session===proof)session=null;
   proof=session||await roomSession();
   return request();
  }
 }

 function flushRender(){
  renderTimer=null;const next=pendingRender;pendingRender=null;if(stopped||!next)return;
  try{render(next.state,next.selfId,next.timing);lastRenderAt=performance.now();}
  catch(cause){const error=Object.assign(new Error('Unable to display this world: '+cause.message),{code:'GAME_RENDER_FAILED',cause});close(error);onStatus?.(error.message);onError?.(error);throw error;}
 }
 function present(state,selfId,timing={},immediate=false){
  if(stopped||state.sequence<=sequence)return;state=hydrateRoomSnapshot(state,latestSnapshot);latestSnapshot=state;sequence=state.sequence;pendingRender={state,selfId,timing};
  if(immediate||!renderInterval||lastRenderAt===null){clearTimeout(renderTimer);flushRender();}
  else if(renderTimer===null)renderTimer=setTimeout(()=>{try{flushRender();}catch{}},Math.max(0,renderInterval-(performance.now()-lastRenderAt)));
 }
 const client={
  ready:false, selfId:null,
  whenReady(timeoutMs=15000) {
   if (client.ready) return Promise.resolve(client);
   if (stopped) return Promise.reject(failure || Error('Room closed.'));
   return new Promise((resolve,reject)=>{
    const waiter={resolve,reject,timer:setTimeout(()=>{
     const error=Error('The game server did not accept the room connection. Select Try again.');
     if(confirmedOnce){waiters.delete(waiter);reject(error);onStatus?.(error.message);}else{close(error);onStatus?.(error.message);onError?.(error);}
    },timeoutMs)};
    waiters.add(waiter);
   });
  },
  async send(action,fields={},requestId=crypto.randomUUID()) {
   if(stopped)throw failure||Error('Room closed.');
   const aircraftShot=action==='fire'&&fields.aircraftShot===true;
   // A held cannon must not wait for the previous HTTP response. Keep a small
   // independent window and drop excess shots instead of building a backlog.
   if(aircraftShot&&aircraftFireRequests>=3)return null;
   if(action==='fire'&&!aircraftShot&&fireRequest){if(!radToxStarted)return fireRequest;if(!queuedFire)queuedFire=fireRequest.then(()=>client.send(action,fields,requestId)).finally(()=>{queuedFire=null;});return queuedFire;}
   const fireTool=String(fields.tool||'laser'),fireKey=aircraftShot?'aircraft-cannon':fireTool;if(action==='fire'&&performance.now()<(nextFireAt.get(fireKey)||0))return null;
   const sentAt=performance.now(),revision=connectionRevision,issuedEpoch=inputEpoch,issuedInputSequence=action==='input'?++inputSequence:null,fireInterval=aircraftShot?200:fireTool==='laser'?0:radToxStarted&&!UTILITY_TOOLS[fireTool]&&(RANGED_WEAPONS[fireTool]||['bat','taser','toxin','flamethrower'].includes(fireTool))?RAD_TOX_SHOT_INTERVAL_MS:(RANGED_WEAPONS[fireTool]?.interval||UTILITY_TOOLS[fireTool]?.cooldown||(fireTool==='dynamite'?1.2:.25))*1000;
   if(action==='fire'){nextFireAt.set(fireKey,sentAt+fireInterval);onShot({requestId,tool:fireTool,direction:fields.direction,...(aircraftShot?{aircraftShot:true,origin:fields.origin}:{})});}
   const perform=async()=>{
    const state=await post('/api/rooms/'+encodeURIComponent(roomId)+'/gameplay',{...fields,...(['input','construction-controls'].includes(action)?{snapshotMode:'compact',sceneVersion:latestSnapshot?.sceneVersion,actorSetRevision:latestSnapshot?.actorSetRevision,earthworksRevision:latestSnapshot?.construction?.earthworks?.revision,...(action==='construction-controls'&&fields.operation==='control'?{controlSequence:++constructionSequence,controlEpoch:issuedEpoch,controlResponse:'ack'}:{})}:{}),...(action==='input'?{inputSequence:issuedInputSequence,...(issuedEpoch?{inputEpoch:issuedEpoch}:{})}:{}),action,requestId});
    if(stopped)return;
    // A response from before a failed connection/rejoin cannot revive it or
    // replace a newer input epoch, even if that old response arrives last.
    if(revision!==connectionRevision)return state;
    const selfId=state?.selfId||client.selfId;
    const controlAck=action==='construction-controls'&&fields.operation==='control'&&state?.constructionControlAck===true;
    if(!selfId||(!controlAck&&!state?.players?.[selfId]))throw Error('The server has not confirmed your player in this room.');
    const currentInput=action!=='input'||issuedEpoch===inputEpoch,currentEpoch=state.inputEpoch??state.result?.inputEpoch;
    // An input may overtake the response that boarded, exited or teleported us.
    // Track the epoch independently of rendered snapshots, and recover from a
    // lost action response using the server's current epoch on every reply.
    if(action==='join'||currentEpoch&&state.sequence>inputEpochSequence){
     inputEpochSequence=state.sequence;
     if(action==='join'||currentEpoch!==inputEpoch){inputEpoch=currentEpoch||null;inputSequence=0;lastConfirmedInputSequence=0;pendingInput=null;}
    }
    if(!currentInput)return state;
    if(controlAck)return state;
    if(action==='start-rad-tox'&&state.radTox){radToxStarted=true;radToxPreference=true;}
    if(action==='rad-tox-toggle')radToxPreference=fields.enabled===true;
    client.selfId=selfId;
    if(action==='join'){confirmedOnce=true;sequence=-1;pendingRender=null;clearTimeout(renderTimer);renderTimer=null;}
    if(action==='input'&&issuedEpoch===inputEpoch)lastConfirmedInputSequence=Math.max(lastConfirmedInputSequence,issuedInputSequence);
    if(state.result?.loot&&firstPickup(state.result.loot.id)){signalInventoryChange();window.dispatchEvent(new CustomEvent('muzikaz:pickup-confirmed',{detail:state.result.loot}));if(state.result.loot.currency==='MZK')window.MZKWallet?.refreshShared?.().catch(()=>{});onStatus?.(state.result.message);}
    if(state.result?.pickup&&firstPickup(state.result.pickup.id)){window.dispatchEvent(new CustomEvent('muzikaz:pickup-confirmed',{detail:state.result.pickup}));}
    present(state,selfId,{sentAt,receivedAt:performance.now()},action!=='input');
    if(action==='fire'&&state.result?.origin&&state.result?.direction){const event=state.events?.find(event=>event.id===requestId&&event.actorId===selfId)||{...state.result,id:requestId,actorId:selfId,action:'fire',at:state.result.firedAt??state.serverTime};window.dispatchEvent(new CustomEvent('muzikaz:shot-confirmed',{detail:{roomId,event,serverTime:state.serverTime}}));}
    if(['respawn','next-rad-tox'].includes(action))nextFireAt.clear();client.ready=true;settle();return state;
   };
   if(aircraftShot)aircraftFireRequests++;
   const pending=perform();if(action==='fire'&&!aircraftShot)fireRequest=pending;
   try{return await pending;}catch(error){if(action==='fire'&&error.status===429)nextFireAt.set(fireKey,Math.max(nextFireAt.get(fireKey)||0,performance.now()+fireInterval));throw error;}finally{if(aircraftShot)aircraftFireRequests--;if(fireRequest===pending)fireRequest=null;}
  },
  async object(command) {
   if (!client.ready) throw Error('Waiting for the server. Placement preview has not been saved.');
   await post('/api/rooms/'+encodeURIComponent(roomId)+'/objects',command);
   const state=await api.api('/api/rooms/'+encodeURIComponent(roomId)+'/gameplay',{signal:lifecycle.signal});
   present(state,client.selfId,{},true);
   return state;
  },
  // Keep two slots available for press/release beside a delayed heartbeat.
  // Further edges retain only the newest state rather than an event backlog.
  requestInput(immediate=true) { if(!immediate||!client.ready||stopped)return;pendingInput={controls:{...(document.hidden?{}:input())},revision:connectionRevision};flushInput(); },
  stop() { close(Error('Room closed.')); }
 };
 function handleError(error) {
   if (stopped) return;
   // Failed joins and expired sessions must leave the loading state. A denied
   // tool action in an already joined room is not a connection failure.
   // Other panels may rotate the account's CSRF proof while both attempts are
   // in flight. An established room can refresh and retry after backoff;
   // missing/revoked authentication and failed initial joins remain terminal.
   if (error.code==='GAME_RENDER_FAILED' || error.code==='ROOM_SWITCHED' || error.status===401&&(error.code!=='CSRF_INVALID'||!joined) || (!joined && [400,403,404,409,422].includes(error.status))) {
    close(error); onStatus?.(error.message); onError?.(error);
   } else if (joined && error.code==='ROOM_JOIN_REQUIRED') {
    invalidateInputs();
    client.ready=false;joined=false;nextFireAt.clear();
    onStatus?.('Rejoining the shared room…');
   } else if (joined && [400,403,409,422,429].includes(error.status)) {
    onStatus?.(error.message);
   } else {
    invalidateInputs();
    // Established sessions retry until they recover or receive an auth failure.
    // The initial caller's readiness deadline still protects unconfirmed startup.
    client.ready=false; session=null; retryAt=Date.now()+1000;
    onStatus?.('Server connection required: '+error.message);
   }
 }
 function supersededTransient(error,epoch,confirmedInput){
  const transient=!error.status||error.status===408||error.status>=500&&error.status<600;
  return transient&&error.code!=='ROOM_SWITCHED'&&error.code!=='ROOM_JOIN_REQUIRED'&&(epoch!==inputEpoch||confirmedInput<lastConfirmedInputSequence);
 }
 function maybeFire(state){
  const controls=document.hidden?{}:input();
  if(stopped||!client.ready||!joined||fireBusy||!(state?.players?.[client.selfId]?.health>0)||state?.match?.state==='finished'||!controls.firing)return;
  const revision=connectionRevision,epoch=inputEpoch,confirmedInput=lastConfirmedInputSequence;fireBusy=true;
  // Weapon responses never occupy a movement slot.
  void client.send('fire',{tool:controls.tool,direction:controls.direction,color:controls.color,...(Number.isFinite(controls.eyeHeight)?{eyeHeight:controls.eyeHeight}:{})})
   .catch(error=>{if(revision===connectionRevision&&error.status!==429&&!supersededTransient(error,epoch,confirmedInput))handleError(error);}).finally(()=>{fireBusy=false;});
 }
 function sendAutomaticInput(controls){
  const token={revision:connectionRevision,epoch:inputEpoch,sequence:inputSequence+1};automaticInputs.add(token);
  return client.send('input',{input:controls}).then(state=>{if(token.revision===connectionRevision)maybeFire(state);return state;}).catch(error=>{
    if(token.revision!==connectionRevision)return;
    // Travel starts a new input sequence. A failed request from its previous
    // epoch is obsolete even if its old sequence exceeds today's confirmed one.
    if(supersededTransient(error,token.epoch,token.sequence))return;
    handleError(error);
   }).finally(()=>{automaticInputs.delete(token);flushInput();});
 }

 function flushInput(){
  if(stopped||!joined||!client.ready||Date.now()<retryAt||!pendingInput||automaticInputs.size>=3)return;
  const queued=pendingInput;pendingInput=null;if(queued.revision===connectionRevision)void sendAutomaticInput(queued.controls);
 }
 async function tick() {
  const activeInput=[...automaticInputs].some(token=>token.revision===connectionRevision);
  if (stopped || busy || Date.now()<retryAt||joined&&(activeInput||automaticInputs.size>=3)) return;
  const token={revision:connectionRevision};tickToken=token;busy=true;
  try {
   if (!joined) {
    const joinedState=await client.send('join',{...(residentWalkthrough?{residentWalkthrough:true}:{}),...(typeof radToxPreference==='boolean'?{radToxEnabled:radToxPreference}:{}),...(deferRadTox&&!radToxStarted?{deferRadTox:true}:{}),...(meetingPending?{meetingId:meetingPending}:{}),...(arrivalPending?{travelFrom:arrivalPending.from,travelToken:arrivalPending.token}:{})});
    if(token.revision!==connectionRevision)return;
    arrivalPending=null;meetingPending=null;
    if (stopped) return;
    joined=true;
    onStatus?.(joinedState?.result?.message || 'Connected. Gameplay is ready.');
   } else {
    const controls=document.hidden?{}:input();
    await sendAutomaticInput(controls);
   }
  } catch (error) { if(token.revision===connectionRevision)handleError(error);
  } finally { if(tickToken===token){tickToken=null;busy=false;}flushInput(); }
 }
 const timer=setInterval(tick,Math.max(50,Math.min(1000,Number(inputInterval)||50)));
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
