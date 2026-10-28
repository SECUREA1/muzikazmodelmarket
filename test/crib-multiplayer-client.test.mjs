import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../public/js/crib-multiplayer.js',import.meta.url),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const settle=()=>new Promise(resolve=>setImmediate(resolve));

function harness({discovery=false,microphone=false,pendingAudio=false,capture}={}) {
  class Target {
    listeners=new Map();
    addEventListener(name,handler){const list=this.listeners.get(name)||[];list.push(handler);this.listeners.set(name,list);}
    removeEventListener(name,handler){this.listeners.set(name,(this.listeners.get(name)||[]).filter(item=>item!==handler));}
    fire(name,event={}){return Promise.all((this.listeners.get(name)||[]).map(handler=>handler({type:name,preventDefault(){},stopPropagation(){},...event})));}
    dispatchEvent(event){this.fire(event.type,event).catch(error=>{throw error;});return true;}
  }
  class Node extends Target {
    children=[];dataset={};hidden=false;disabled=false;value='';textContent='';scrollHeight=0;scrollTop=0;clientHeight=0;
    style={setProperty(){},removeProperty(){}};
    classList={values:new Set(),add(...names){names.forEach(name=>this.values.add(name));},remove(...names){names.forEach(name=>this.values.delete(name));},contains(name){return this.values.has(name);},toggle(name,on){const enabled=on??!this.values.has(name);enabled?this.values.add(name):this.values.delete(name);return enabled;}};
    setAttribute(name,value){this[name]=value;}
    removeAttribute(name){delete this[name];}
    querySelector(selector){if(selector==='b')return this.label??=new Node();if(selector==='[data-close-chat]')return this.close??=new Node();if(selector==='[type="submit"]')return this.submit??=new Node();return null;}
    querySelectorAll(){return [];}
    replaceChildren(...nodes){this.children=nodes;}
    append(...nodes){this.children.push(...nodes);}
    play(){this.playCalls=(this.playCalls||0)+1;return Promise.resolve();}
    focus(){}
    remove(){}
  }
  const ids=['crib-social','crib-chat-toggle','crib-chat-panel','crib-online-count','crib-player-list','crib-chat-messages','crib-chat-form','crib-chat-input','crib-chat-status','crib-reactions','crib-emoji-toggle','crib-mic-toggle','crib-speaker-toggle','crib-tts-toggle','crib-voice-status','crib-room-name','crib-room-count','crib-unread-count'];
  const nodes=new Map(ids.map(id=>[id,new Node()]));nodes.get('crib-chat-panel').hidden=true;
  const document=new Target();document.querySelector=selector=>nodes.get(selector.slice(1))||null;document.createElement=()=>new Node();document.createTextNode=value=>({textContent:value});document.documentElement=new Node();document.currentScript={src:'https://frontend.example/public/js/crib-multiplayer.js'};
  nodes.get('crib-social').parentNode={insertBefore(){}};
  const values=new Map([['muzikazHouseSessionId','client-session'],['muzikazBottleMemberEmail','member@example.test'],['muzikazDesignatedAvatar','{"modelUrl":"/models/avatar.glb"}']]);
  const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
  const snapshot={roomId:'world-a',serverHostedRoom:false,serverReady:false,gameplayStarted:false,worldLoading:false};
  const window=new Target();window.MUZIKAZ_HOUSE_TRACKING={roomId:'world-a'};window.MUZIKAZ_DESIGNATED_AVATAR={modelUrl:'/models/avatar.glb'};window.MuzikazHouseExplorer={snapshot:()=>snapshot};window.scrollTo=()=>{};
  const requests=[],streams=[],intervals=new Map(),discovered=deferred();let nextTimer=0,base='https://frontend.example',fetcher;
  const response=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});
  fetcher=async(path,options)=>{
    if(path.endsWith('/presence'))return response({users:[{sessionId:'client-session',roomId:snapshot.roomId,username:'Member'}],capacity:15});
    if(path.includes('/chat?'))return response({messages:[]});
    if(path.endsWith('/chat'))return response({id:'sent-message',sessionId:'client-session',roomId:snapshot.roomId,username:'Member',message:JSON.parse(options.body).message});
    return response({signals:[],csrfToken:'session-csrf'});
  };
  window.MUZIKAZ_API={ready:discovery?discovered.promise:Promise.resolve(),url:path=>base+path,fetch:async(path,options)=>{requests.push({path,options,body:options.body?JSON.parse(options.body):null});return fetcher(path,options);}};
  class EventSource extends Target {constructor(url,options){super();this.url=url;this.options=options;this.closed=false;streams.push(this);}close(){this.closed=true;}}
  window.EventSource=EventSource;
  const navigator={language:'en',sendBeacon:()=>true};
  const captured=[],audioContexts=[],voicePeers=[],gainTransitions=[];
  if(microphone){
    class AudioContext extends Target {
      state='suspended';resumeCalls=0;currentTime=0;gains=[];
      constructor(){super();audioContexts.push(this);}
      resume(){this.resumeCalls++;if(pendingAudio)return new Promise(()=>{});this.state='running';return Promise.resolve();}
      createMediaStreamSource(){return {connect(){},disconnect(){}};}
      createAnalyser(){return {connect(){},disconnect(){},getByteTimeDomainData(){}};}
      createStereoPanner(){return {connect(){},disconnect(){},pan:{setTargetAtTime(){}}};}
      createGain(){const gain={value:1,setValueAtTime(value){this.value=value;gainTransitions.push({value,nativeMuted:nodes.get('crib-social').children.filter(item=>item.srcObject).every(item=>item.muted)});},setTargetAtTime(value){this.setValueAtTime(value);}};this.gains.push(gain);return {connect(){},disconnect(){},gain};}
      close(){return Promise.resolve();}
    }
    window.AudioContext=AudioContext;window.RTCPeerConnection=class{
      constructor(){voicePeers.push(this);}
      addTransceiver(){}
      async setRemoteDescription(description){this.remoteDescription=description;}
      async createAnswer(){return {type:'answer',sdp:'fixture'};}
      async setLocalDescription(description){this.localDescription=description;}
      close(){}
    };
    navigator.mediaDevices={getUserMedia:constraints=>{captured.push(constraints);return capture?capture():Promise.resolve(microphoneStream());}};
  }
  const context=vm.createContext({window,document,navigator,RTCPeerConnection:window.RTCPeerConnection,location:{href:'https://frontend.example/model-explorer.html'},localStorage:storage,crypto:{randomUUID:()=> 'client-session'},URL,Map,Set,Date,JSON,Promise,Error,DOMException,AbortController,console,EventSource,CustomEvent:class{constructor(type,init={}){this.type=type;this.detail=init.detail;}},setInterval:(callback,ms)=>{const id=++nextTimer;intervals.set(id,{callback,ms});return id;},clearInterval:id=>intervals.delete(id),setTimeout,clearTimeout});
  vm.runInContext(source,context,{importModuleDynamically:()=>Promise.reject(new Error('Speech modules are not required by this social transport test.'))});
  function microphoneStream(){const track=new Target();track.kind='audio';track.stopped=false;track.stop=()=>{track.stopped=true;};const stream={getTracks:()=>[track],getAudioTracks:()=>[track]};captured.stream=stream;captured.track=track;return stream;}
  return {window,document,snapshot,nodes,requests,streams,response,captured,audioContexts,voicePeers,gainTransitions,microphoneStream,
    setFetcher:handler=>{fetcher=handler;},discover:()=>{base='https://api.example';discovered.resolve();},
    ready:roomId=>window.fire('muzikaz:multiplayer-room-ready',{detail:{roomId}}),
    change:roomId=>{snapshot.roomId=roomId;snapshot.serverReady=false;window.MUZIKAZ_HOUSE_TRACKING.roomId=roomId;return window.fire('muzikaz:multiplayer-world-change',{detail:{roomId}});},
    tick:async ms=>{for(const {callback,ms:delay}of intervals.values())if(delay===ms)await callback();await settle();}
  };
}

test('solo worlds and unjoined multiplayer do not send social API calls, even with an avatar',async()=>{
  const h=harness();await settle();
  await h.window.fire('muzikaz-avatar-ready');await h.tick(5000);await h.tick(1000);
  await h.nodes.get('crib-chat-toggle').fire('click');
  h.nodes.get('crib-chat-input').value='Hello';await h.nodes.get('crib-chat-form').fire('submit');
  assert.match(h.nodes.get('crib-chat-status').textContent,/Join a multiplayer room/);
  await h.nodes.get('crib-mic-toggle').fire('click');
  assert.match(h.nodes.get('crib-voice-status').textContent,/Join a multiplayer room/);
  h.snapshot.serverHostedRoom=true;await h.ready('world-a');await h.tick(5000);
  assert.equal(h.requests.length,0);assert.equal(h.streams.length,0);
});

test('chat can open AI conversations in solo play without joining a public room',async()=>{
  const h=harness();await settle();let request;
  h.window.addEventListener('muzikaz:open-ai-conversations',event=>{request=event.detail;});
  await h.nodes.get('crib-chat-toggle').fire('click');assert.equal(h.nodes.get('crib-chat-panel').hidden,false);
  const entry=h.nodes.get('crib-chat-panel').children.find(node=>node.id==='crib-ai-conversations');assert.ok(entry);
  await entry.fire('click');assert.equal(h.nodes.get('crib-chat-panel').hidden,true);assert.equal(request.source,'room-chat');assert.equal(h.requests.length,0);
});

test('Talk to AI explains Begin Game before the deferred game has loaded',async()=>{
  const h=harness();await settle();delete h.window.MuzikazHouseExplorer;let dispatched=false;
  h.window.addEventListener('muzikaz:open-ai-conversations',()=>{dispatched=true;});
  await h.nodes.get('crib-chat-toggle').fire('click');
  await h.nodes.get('crib-chat-panel').children.find(node=>node.id==='crib-ai-conversations').fire('click');
  assert.equal(dispatched,false);assert.equal(h.nodes.get('crib-chat-panel').hidden,false);assert.match(h.nodes.get('crib-voice-status').textContent,/Begin Game/);assert.equal(h.requests.length,0);
});

test('authoritative room readiness waits for API discovery and retains presence, history, chat and credentialed events',async()=>{
  const h=harness({discovery:true});h.snapshot.serverHostedRoom=true;h.snapshot.serverReady=true;h.snapshot.worldLoading=true;
  const ready=h.ready('world-a');await settle();
  assert.equal(h.requests.length,0);assert.equal(h.streams.length,0);
  h.discover();await ready;
  assert.equal(h.snapshot.gameplayStarted,false,'room-ready can precede the gameplay UI state');
  assert.equal(h.requests.filter(request=>request.path.endsWith('/presence')).length,1);
  assert.equal(h.requests[0].body.roomId,'world-a');
  assert.ok(h.requests.some(request=>request.path.includes('/chat?roomId=world-a')));
  assert.equal(h.streams.length,1);assert.match(h.streams[0].url,/^https:\/\/api\.example\/api\/houses\/ioncore-house\/events\?/);
  assert.equal(h.streams[0].options.withCredentials,true);
  h.nodes.get('crib-chat-input').value='Room message';await h.nodes.get('crib-chat-form').fire('submit');
  assert.ok(h.requests.some(request=>request.path.endsWith('/chat')&&request.body.message==='Room message'));
  await h.tick(1000);assert.ok(h.requests.some(request=>request.path.endsWith('/voice/signal')));
  assert.equal(h.nodes.get('crib-chat-messages').children.length,1);
});

test('changing worlds closes the old stream and prevents social calls until the replacement room joins',async()=>{
  const h=harness();h.snapshot.serverHostedRoom=true;h.snapshot.serverReady=true;await h.ready('world-a');
  const firstStream=h.streams[0],firstRequest=h.requests[0];
  await h.change('world-b');const requestCount=h.requests.length;
  assert.equal(firstStream.closed,true);assert.equal(firstRequest.options.signal.aborted,true);
  await h.ready('world-a');await h.ready('world-b');await h.tick(5000);await h.tick(1000);
  await firstStream.fire('house-chat-message',{data:JSON.stringify({id:'stale',roomId:'world-b',message:'Old stream'})});
  assert.equal(h.requests.length,requestCount);assert.equal(h.nodes.get('crib-chat-messages').children.length,0);
  h.snapshot.serverReady=true;await h.ready('world-b');
  assert.equal(h.streams.length,2);assert.match(h.streams[1].url,/roomId=world-b/);
  assert.equal(h.requests.filter(request=>request.path.endsWith('/presence')).at(-1).body.roomId,'world-b');
  await h.window.fire('pagehide',{persisted:false});assert.equal(h.streams[1].closed,true);
});

test('a room change during discovery cannot start the abandoned room or stream',async()=>{
  const h=harness({discovery:true});h.snapshot.serverHostedRoom=true;h.snapshot.serverReady=true;
  const ready=h.ready('world-a');await settle();await h.change('world-b');h.discover();await ready;
  assert.equal(h.requests.length,0);assert.equal(h.streams.length,0);
  h.snapshot.serverReady=true;await h.ready('world-b');
  assert.equal(h.requests[0].body.roomId,'world-b');assert.equal(h.streams.length,1);
});

test('server room-membership errors remain visible and do not open a social stream',async()=>{
  const h=harness();h.snapshot.serverHostedRoom=true;h.snapshot.serverReady=true;
  h.setFetcher(async()=>h.response({code:'ROOM_REQUIRED',error:'Join the authoritative room before sending presence.'},409));
  await h.ready('world-a');
  assert.match(h.nodes.get('crib-chat-status').textContent,/Join the authoritative room/);
  assert.equal(h.streams.length,0);assert.equal(h.requests.length,1);
});

test('microphone capture and room presence work while output resume remains pending',async()=>{
  const h=harness({microphone:true,pendingAudio:true});h.snapshot.serverHostedRoom=true;h.snapshot.serverReady=true;await h.ready('world-a');
  const mic=h.nodes.get('crib-mic-toggle');const click=mic.fire('click');await settle();
  assert.equal(h.captured.length,1,'the microphone request starts without awaiting speaker activation');
  assert.equal(h.captured[0].video,false);assert.equal(h.captured[0].audio.echoCancellation,true);
  await click;
  assert.equal(mic['aria-pressed'],'true');assert.equal(h.captured.track.stopped,false);
  assert.ok(h.requests.some(request=>request.path.endsWith('/presence')&&request.body.voiceEnabled));
  assert.match(h.nodes.get('crib-voice-status').textContent,/Mic live/);
  await h.document.fire('pointerdown');await h.document.fire('pointerdown');
  assert.equal(h.audioContexts[0].resumeCalls,3,'a later user gesture retries a suspended output context');
  await mic.fire('click');assert.equal(h.captured.track.stopped,true);assert.equal(mic['aria-pressed'],'false');
});

test('a microphone granted after room travel stops instead of broadcasting into the next room',async()=>{
  const grant=deferred(),h=harness({microphone:true,capture:()=>grant.promise});h.snapshot.serverHostedRoom=true;h.snapshot.serverReady=true;await h.ready('world-a');
  const click=h.nodes.get('crib-mic-toggle').fire('click');await settle();assert.equal(h.captured.length,1);
  await h.change('world-b');const stream=h.microphoneStream();grant.resolve(stream);await click;
  assert.equal(h.captured.track.stopped,true);assert.equal(h.nodes.get('crib-mic-toggle')['aria-pressed'],'false');
  assert.ok(h.requests.every(request=>!request.body?.voiceEnabled),'late permission never publishes a live microphone');
});

test('microphone denial stays off and the same button can retry successfully',async()=>{
  let attempts=0;const h=harness({microphone:true,capture:()=>++attempts===1?Promise.reject(new DOMException('Denied','NotAllowedError')):Promise.resolve(h.microphoneStream())});
  h.snapshot.serverHostedRoom=true;h.snapshot.serverReady=true;await h.ready('world-a');const mic=h.nodes.get('crib-mic-toggle');
  await mic.fire('click');assert.equal(mic.disabled,false);assert.equal(mic['aria-pressed'],'false');assert.match(h.nodes.get('crib-voice-status').textContent,/Allow microphone access/);
  await mic.fire('click');assert.equal(mic['aria-pressed'],'true');assert.equal(h.captured.track.stopped,false);await mic.fire('click');
});

test('incoming room voice uses native playback until the spatial audio context resumes',async()=>{
  const h=harness({microphone:true,pendingAudio:true});h.snapshot.serverHostedRoom=true;h.snapshot.serverReady=true;
  h.setFetcher(async(path)=>h.response(path.endsWith('/presence')?{users:[{sessionId:'remote',roomId:'world-a',voiceEnabled:true}]}:path.endsWith('/voice/signal')?{signals:[{from:'remote',to:'client-session',roomId:'world-a',kind:'offer',payload:{type:'offer',sdp:'fixture'}}]}:{csrfToken:'fixture',messages:[]}));
  await h.ready('world-a');await h.document.fire('pointerdown');await h.tick(1000);
  const stream=h.microphoneStream();h.voicePeers[0].ontrack({streams:[stream]});
  const audio=h.nodes.get('crib-social').children.find(item=>item.srcObject===stream);
  assert.equal(h.audioContexts[0].state,'suspended');assert.equal(audio.muted,false,'a suspended panner must not silence native room audio');
  const gain=h.audioContexts[0].gains[0];assert.equal(gain.value,0,'spatial gain is closed throughout native fallback');
  h.audioContexts[0].state='running';assert.equal(gain.value,0,'the audio thread cannot double the voice before the statechange handler');await h.audioContexts[0].fire('statechange');
  assert.equal(audio.muted,true,'native playback mutes once spatial playback can actually run');
  assert.equal(gain.value,1);assert.ok(h.gainTransitions.filter(item=>item.value>0).every(item=>item.nativeMuted),'native playback is always muted before opening the spatial path');
  h.audioContexts[0].state='interrupted';await h.audioContexts[0].fire('statechange');assert.equal(audio.muted,false);assert.equal(gain.value,0);
  const plays=audio.playCalls;await h.document.fire('pointerdown');assert.equal(audio.playCalls,plays+1,'native output retries synchronously even while context resume hangs');
  h.audioContexts[0].state='running';await h.tick(80);assert.equal(audio.muted,true);assert.equal(gain.value,1,'a meter tick before statechange follows the same safe handover');
  h.window.MUZIKAZ_AUDIO_PREFERENCES={masterMuted:true};await h.window.fire('muzikaz:audio-preferences');
  assert.equal(audio.muted,true,'native fallback still respects master mute');assert.equal(gain.value,0);
});
