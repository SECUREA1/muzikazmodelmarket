// Camera video is opt-in and peer-to-peer; it is never written to server storage.
export function mountLiveCameraScreens({THREE,getRoots,getPosition,screenFor,announce}){
 const peers=new Map(),views=new Map(),watching=new Map();let local=null,deviceId=null,polling=false,closed=false,generation=0;
 const room=()=>window.MUZIKAZ_HOUSE_TRACKING?.roomId||localStorage.getItem('muzikazMultiplayerWorld');
 let currentRoom=room(),csrf='';
 const api=window.MUZIKAZ_API,fetchApi=(path,options)=>api?api.fetch(path,options):fetch(path,options);
 async function request(body){
  if(!csrf){const response=await fetchApi('/api/market/session',{cache:'no-store'}),data=await response.json();if(!response.ok)throw Error(data.error||'Join the game to use a camera.');csrf=data.csrfToken;}
  const response=await fetchApi('/api/houses/ioncore-house/camera/signal',{method:body?'POST':'GET',cache:'no-store',headers:{'Content-Type':'application/json','X-MUZIKAZ-Session':localStorage.getItem('muzikazHouseSessionId')||'','X-CSRF-Token':csrf},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Camera connection failed.');return data;
 }
 const self=()=>localStorage.getItem('muzikazHouseSessionId');
 const rootFor=id=>getRoots().find(root=>root.userData.builderObjectId===id);
 function clearView(source){const view=views.get(source);if(!view)return;view.video.pause();view.video.srcObject=null;view.texture.dispose();view.surface?.removeFromParent();view.surface?.geometry.dispose();view.surface?.material.dispose();views.delete(source);}
 function closePeer(id){const entry=peers.get(id);peers.delete(id);entry?.peer.close();if(entry){watching.delete(entry.source);if(entry.source!==self())clearView(entry.source);}}
 function show(source,id,stream){const root=rootFor(id);if(!root)return;clearView(source);const video=document.createElement('video');video.autoplay=true;video.playsInline=true;video.muted=true;video.srcObject=stream;const texture=new THREE.VideoTexture(video);texture.colorSpace=THREE.SRGBColorSpace;const surface=screenFor(root,texture);if(surface)surface.position.z=-.045;views.set(source,{root,video,texture,surface,deviceId:id});video.play().catch(()=>announce('Tap the screen’s Watch live camera button to start video.'));}
 function peerFor(remote,source,id){
  const key=source+':'+remote;if(peers.has(key))return peers.get(key);
  const peer=new RTCPeerConnection({iceServers:window.MUZIKAZ_RTC_ICE_SERVERS||[{urls:'stun:stun.l.google.com:19302'}]}),entry={peer,source,deviceId:id,candidates:[]};peers.set(key,entry);
  if(local&&source===self())local.getTracks().forEach(track=>peer.addTrack(track,local));
  peer.onicecandidate=event=>{if(event.candidate)request({operation:'candidate',source,to:remote,payload:event.candidate}).catch(()=>{});};
  peer.ontrack=event=>show(source,id,event.streams[0]||new MediaStream([event.track]));
  peer.onconnectionstatechange=()=>{if(['failed','closed'].includes(peer.connectionState)&&peers.get(key)===entry)closePeer(key);};return entry;
 }
 async function signal(item){
  if(item.operation==='watch'){
   if(!local||item.source!==self()||peers.has(item.source+':'+item.from))return;
   const {peer}=peerFor(item.from,item.source,item.deviceId);await peer.setLocalDescription(await peer.createOffer());await request({operation:'offer',source:item.source,to:item.from,payload:peer.localDescription});return;
  }
  const entry=peerFor(item.from,item.source,item.deviceId),peer=entry.peer;
  if(item.operation==='offer'){await peer.setRemoteDescription(item.payload);await peer.setLocalDescription(await peer.createAnswer());await request({operation:'answer',source:item.source,to:item.from,payload:peer.localDescription});}
  else if(item.operation==='answer')await peer.setRemoteDescription(item.payload);
  else if(item.operation==='candidate'){if(peer.remoteDescription)await peer.addIceCandidate(item.payload);else entry.candidates.push(item.payload);}
  if(peer.remoteDescription)for(const candidate of entry.candidates.splice(0))await peer.addIceCandidate(candidate);
 }
 async function poll(){
  if(local&&!rootFor(deviceId)){stop();announce('Camera stopped because its screen was removed.');}
  if(polling||closed||!room()||!getRoots().some(root=>{let found=false;root.traverse(node=>{if(node.userData.mediaScreen)found=true;});return found;}))return;polling=true;const pollGeneration=generation;
  try{
   if(room()!==currentRoom){reset();currentRoom=room();return;}
   if(local)await request({operation:'heartbeat'});
   const result=await request(),near=new Set();if(pollGeneration!==generation||room()!==currentRoom)return;
   for(const feed of result.feeds||[]){const root=rootFor(feed.deviceId);if(!root)continue;const position=root.getWorldPosition(new THREE.Vector3());if(position.distanceTo(getPosition())>60)continue;near.add(feed.source);if(feed.source===self())continue;
    if(!peers.has(feed.source+':'+feed.source)&&Date.now()-(watching.get(feed.source)||0)>5000){watching.set(feed.source,Date.now());await request({operation:'watch',source:feed.source,to:feed.source});}
   }
   for(const [id,entry]of peers)if(!near.has(entry.source))closePeer(id);
   for(const source of views.keys())if(!near.has(source))clearView(source);
   for(const item of result.signals||[])if(near.has(item.source))try{await signal(item);}catch{closePeer(item.source+':'+item.from);}
  }catch(error){if(local){stop();announce(error.message);}}
  finally{polling=false;}
 }
 function reset(){generation++;local?.getTracks().forEach(track=>track.stop());local=null;deviceId=null;for(const id of peers.keys())closePeer(id);for(const source of views.keys())clearView(source);watching.clear();}
 function stop(){const active=Boolean(local);reset();return active?request({operation:'stop'}).catch(()=>{}):Promise.resolve();}
 async function start(id){
  if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection)throw Error('Live camera requires a supported browser over HTTPS.');
  await stop();const token=generation,startedRoom=room();const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{width:{ideal:640},height:{ideal:360},frameRate:{ideal:15,max:24}}});
  if(token!==generation||startedRoom!==room()){stream.getTracks().forEach(track=>track.stop());return;}
  try{await request({operation:'start',deviceId:id});if(token!==generation||startedRoom!==room()){stream.getTracks().forEach(track=>track.stop());request({operation:'stop'}).catch(()=>{});return;}local=stream;deviceId=id;currentRoom=startedRoom;show(self(),id,stream);stream.getTracks().forEach(track=>track.addEventListener('ended',()=>{if(local===stream)stop();}));announce('Camera live on this screen. Use Stop camera to end sharing. Room microphone controls audio.');await poll();}catch(error){stream.getTracks().forEach(track=>track.stop());throw error;}
 }
 const stopButton=document.createElement('button');stopButton.type='button';stopButton.className='shared-media-enable';stopButton.style.bottom='64px';stopButton.textContent='Stop live camera';stopButton.hidden=true;document.body.append(stopButton);stopButton.addEventListener('click',stop);
 const timer=setInterval(()=>{stopButton.hidden=!local;poll();},1500);
 const leave=()=>stop();window.addEventListener('pagehide',leave);window.addEventListener('muzikaz:multiplayer-world-change',leave);
 return {start,stop,watch:()=>{for(const view of views.values())view.video.play().catch(()=>{});return poll();},isLive:id=>[...views.values()].some(view=>view.deviceId===id),reset:stop,dispose(){closed=true;stop();clearInterval(timer);stopButton.remove();window.removeEventListener('pagehide',leave);window.removeEventListener('muzikaz:multiplayer-world-change',leave);}};
}
