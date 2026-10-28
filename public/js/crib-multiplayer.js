(() => {
  const root = document.querySelector('#crib-social');
  if (!root) return;
  const api = window.MUZIKAZ_SHARED_AVATAR_API || '';
  const apiUrl = (path) => window.MUZIKAZ_API ? window.MUZIKAZ_API.url(path) : `${api}${path}`;
  const apiFetch = (path, options) => window.MUZIKAZ_API ? window.MUZIKAZ_API.fetch(path, options) : fetch(apiUrl(path), options);
  let sessionId = localStorage.getItem('muzikazHouseSessionId');
  if (!sessionId) { sessionId = crypto.randomUUID?.() || `subscriber-${Date.now()}`; localStorage.setItem('muzikazHouseSessionId', sessionId); }
  const email = localStorage.getItem('muzikazBottleMemberEmail') || 'Subscriber';
  const username = email.split('@')[0].slice(0, 28) || 'Subscriber';
  const color = `hsl(${[...sessionId].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360} 85% 65%)`;
  const $ = (selector) => document.querySelector(selector);
  const toggle = $('#crib-chat-toggle'), panel = $('#crib-chat-panel'), count = $('#crib-online-count');
  const players = $('#crib-player-list'), messages = $('#crib-chat-messages'), form = $('#crib-chat-form');
  const input = $('#crib-chat-input'), status = $('#crib-chat-status'), reactions = $('#crib-reactions');
  const emojiToggle = $('#crib-emoji-toggle'), micToggle = $('#crib-mic-toggle'), speakerToggle = $('#crib-speaker-toggle'), ttsToggle = $('#crib-tts-toggle'), voiceStatus = $('#crib-voice-status');
  const roomName = $('#crib-room-name'), roomCount = $('#crib-room-count'), unreadCount = $('#crib-unread-count');
  const requiredElements = [toggle, panel, count, players, messages, form, input, status, reactions, emojiToggle, micToggle, speakerToggle, ttsToggle, voiceStatus, roomName, roomCount, unreadCount];
  if (requiredElements.some((element) => !element)) {
    console.warn('[MUZIKAZ Chat] Chat markup is incomplete; multiplayer chat was not started.');
    return;
  }
  toggle.disabled=false;toggle.removeAttribute('aria-disabled');toggle.removeAttribute('tabindex');delete toggle.dataset.avatarDisabled;
  const aiConversations=document.createElement('button');aiConversations.type='button';aiConversations.id='crib-ai-conversations';aiConversations.className='crib-chat-ai-entry';aiConversations.textContent='Talk to AI';aiConversations.title='Open nearby AI residents and conversations';(micToggle.parentElement||panel).append(aiConversations);
  aiConversations.addEventListener('click',()=>{
    if(!window.MuzikazHouseExplorer?.snapshot){
      voiceStatus.textContent='Begin Game to meet AI residents.';
      status.textContent='Begin Game to meet AI residents.';
      const start=document.querySelector('[data-house-start]')||document.querySelector('#house-game-start');start?.focus?.({preventScroll:true});start?.scrollIntoView?.({block:'center',behavior:'smooth'});return;
    }
    setPanel(false);window.dispatchEvent(new CustomEvent('muzikaz:open-ai-conversations',{detail:{source:'room-chat'}}));
  });
  const panelParent=root.parentNode,panelNext=root.nextSibling;
  const headers = { 'Content-Type': 'application/json', 'X-MUZIKAZ-Session': sessionId, 'X-User-Id': email.toLowerCase(), 'X-User-Name': username };
  const peers = new Map(), remoteAudio = new Map(), pendingCandidates = new Map();
  let pollingVoice = false, audioContext=null, recognition=null, recognitionTimer=0, captionTimer=0, caption='', captionAt=0,voiceGeneration=0;
  const meters=new Map();
  function emitLevel(id,level){window.dispatchEvent(new CustomEvent('muzikaz:voice-level',{detail:{sessionId:id,level}}));}
  function syncRemoteAudio(){
    for(const [id,audio]of remoteAudio){
      const meter=meters.get(id),spatial=Boolean(meter?.gain&&audioContext?.state==='running'),audible=speakerAudible();
      // Mute the native path before opening the spatial gain. Keep that gain
      // at zero during fallback so an audio-thread resume cannot briefly play
      // both paths while the main thread is busy loading the world.
      audio.muted=!audible||spatial;
      if(meter?.gain){if(spatial&&audible)meter.gain.gain.setTargetAtTime(meter.outputGain??1,audioContext.currentTime,.02);else meter.gain.gain.setValueAtTime(0,audioContext.currentTime);}
    }
  }
  async function prepareAudio(){
    const Context=window.AudioContext||window.webkitAudioContext;
    if(Context){
      if(!audioContext||audioContext.state==='closed'){audioContext=new Context();audioContext.addEventListener?.('statechange',syncRemoteAudio);}
      if(audioContext.state==='suspended'||audioContext.state==='interrupted')await audioContext.resume();
      syncRemoteAudio();
    }
  }
  function stopMeter(id){const meter=meters.get(id);if(meter){meter.source.disconnect();meter.analyser.disconnect();meter.panner?.disconnect();meter.gain?.disconnect();meters.delete(id);}emitLevel(id,0);}
  function meterStream(id,stream){
    stopMeter(id);if(!audioContext||!stream)return;
    const source=audioContext.createMediaStreamSource(stream),analyser=audioContext.createAnalyser();analyser.fftSize=256;source.connect(analyser);
    const meter={source,analyser,data:new Uint8Array(256)};
    if(id!==sessionId&&audioContext.createStereoPanner){meter.panner=audioContext.createStereoPanner();meter.gain=audioContext.createGain();meter.gain.gain.value=0;meter.outputGain=1;analyser.connect(meter.panner);meter.panner.connect(meter.gain);meter.gain.connect(audioContext.destination);}
    meters.set(id,meter);
    if(id!==sessionId)syncRemoteAudio();
  }
  const meterTimer=setInterval(()=>{for(const [id,meter]of meters){if(meter.panner){const user=currentUsers.find(user=>user.sessionId===id),listener=window.MUZIKAZ_HOUSE_TRACKING||{},position=window.MUZIKAZ_ROOM_AUDIO_POSES?.[id]||user?.position,dx=(position?.x||0)-(listener.position?.x||0),dz=(position?.z||0)-(listener.position?.z||0),yaw=listener.rotation?.y||0,pan=(dx*Math.cos(yaw)-dz*Math.sin(yaw))/Math.max(1,Math.hypot(dx,dz));const spatial=window.MUZIKAZ_AUDIO_PREFERENCES?.spatialAudio!==false,distance=position&&listener.position?Math.hypot(dx,(position.y||0)-(listener.position.y||0),dz):0;meter.outputGain=spatial?Math.max(0,1-distance/40)**2:1;meter.panner.pan.setTargetAtTime(spatial?pan*.65:0,audioContext.currentTime,.08);}meter.analyser.getByteTimeDomainData(meter.data);let energy=0;for(const sample of meter.data)energy+=((sample-128)/128)**2;const level=Math.min(1,Math.sqrt(energy/meter.data.length)*6);emitLevel(id,level);if(id===sessionId){micToggle.style.setProperty('--voice-level',level);micToggle.classList.toggle('is-speaking',level>.06);}}syncRemoteAudio();},80);
  function stopCaptions(){clearTimeout(recognitionTimer);clearTimeout(captionTimer);const old=recognition;recognition=null;if(old){old.onend=null;old.abort();}caption='';captionAt=0;}
  function startCaptions(){
    const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!Recognition){voiceStatus.textContent='Mic live · live captions unavailable in this browser';return;}
    recognition=new Recognition();recognition.continuous=true;recognition.interimResults=true;recognition.lang=document.documentElement.lang||navigator.language||'en';
    let lastPublish=0;
    recognition.onresult=event=>{
      if(!localStream)return;
      caption=Array.from(event.results).slice(event.resultIndex).map(result=>result[0].transcript).join(' ').trim().slice(-140);captionAt=Date.now();
      clearTimeout(captionTimer);captionTimer=setTimeout(()=>{caption='';captionAt=0;heartbeat().catch(()=>{});},6000);
      if(Date.now()-lastPublish>700||event.results[event.results.length-1].isFinal){lastPublish=Date.now();heartbeat().catch(()=>{});}
    };
    recognition.onerror=event=>{if(['not-allowed','service-not-allowed','audio-capture'].includes(event.error)){recognition.onend=null;voiceStatus.textContent='Mic live · speech captions unavailable';}};
    recognition.onend=()=>{if(localStream&&recognition)recognitionTimer=setTimeout(()=>{try{recognition?.start();}catch{}},500);};
    try{recognition.start();}catch{voiceStatus.textContent='Mic live · speech captions unavailable';}
  }
  function closePeers(){for(const [id,peer]of peers){signal(id,'hangup').catch(()=>{});peer.close();stopMeter(id);}peers.clear();pendingCandidates.clear();remoteAudio.forEach(audio=>audio.remove());remoteAudio.clear();}
  window.MUZIKAZ_HOUSE_TRACKING = { roomId:localStorage.getItem('muzikazMultiplayerWorld') || window.MUZIKAZ_HOUSE_TRACKING?.roomId || 'rad-tox', ...(window.MUZIKAZ_HOUSE_TRACKING || {}) };
  let joined = false, localStream = null, speakerOn = true, currentUsers = [], unread = 0, loadingChat = null, sendingMessage = false, presenceRequest=null;
  let readyRoomId=null,roomGeneration=0,roomRequests=null,events=null,eventsRoomId=null,openingEvents=null;
  let speechTools=null,activeChatSpeech=null,activeChatMessageId=null,finishChatSpeech=null,chatSpeechGeneration=0,chatSpeechDisposed=false;
  const speechBase=document.currentScript?.src||location.href;
  const speechToolsReady=Promise.all([import(new URL('./game-speech-owner.js',speechBase).href),import(new URL('./neural-character-speech.js',speechBase).href),import(new URL('./character-voice-profile.js',speechBase).href)]).then(([owners,voices,profiles])=>speechTools={...owners,...profiles,speech:voices.gameSpeech(),Utterance:voices.GameSpeechUtterance}).catch(()=>null);
  let pendingAutomaticMessage=null,automaticMessageTimer=null,automaticFlushScheduled=false,roomAudioActivated=false;
  const automaticMessageLifetime=15000;
  function clearAutomaticMessage(){clearTimeout(automaticMessageTimer);automaticMessageTimer=null;pendingAutomaticMessage=null;}
  function cancelChatSpeech(){clearAutomaticMessage();chatSpeechGeneration++;if(activeChatSpeech)speechTools?.cancelGameSpeech(speechTools.speech,activeChatSpeech);finishChatSpeech?.();}
  const speakerAudible=()=>speakerOn&&!window.MUZIKAZ_AUDIO_PREFERENCES?.masterMuted;
  window.addEventListener('muzikaz:audio-preferences',()=>{
    syncRemoteAudio();
    if(window.MUZIKAZ_AUDIO_PREFERENCES?.masterMuted||window.MUZIKAZ_AUDIO_PREFERENCES?.dialogueMuted)cancelChatSpeech();
  });
  // Older releases wrote their default "false" on every load, so that key
  // cannot distinguish an opt-out from a visitor who never touched the switch.
  // New voices play automatically; only an explicit choice in this version
  // persists an opt-out, alongside the independent Audio settings mutes.
  const automaticSpeechPreference='muzikazChatTextToSpeech.v2';
  let textToSpeechOn = localStorage.getItem(automaticSpeechPreference) !== 'false';
  let gameScrollY = 0;
  const payload = (response) => response?.data ?? response;
  async function jsonResponse(response) { const result = window.MUZIKAZ_API?.readJson ? await window.MUZIKAZ_API.readJson(response,{label:'The multiplayer service'}) : await response.json(); if (!response.ok || result.success === false) throw Object.assign(new Error(result.error || result.message || 'The crib server did not respond.'),{status:response.status,code:result.code}); return payload(result); }
  const text = (value) => document.createTextNode(String(value || ''));
  const activeRoom = () => window.MUZIKAZ_HOUSE_TRACKING?.roomId || localStorage.getItem('muzikazMultiplayerWorld') || 'rad-tox';
  const inActiveRoom = (item) => !item?.roomId || item.roomId === activeRoom();
  function roomReady(roomId=readyRoomId,generation=roomGeneration) {
    if(!roomId||roomId!==readyRoomId||roomId!==activeRoom()||generation!==roomGeneration)return false;
    const snapshot=window.MuzikazHouseExplorer?.snapshot?.();
    return !snapshot||(snapshot.roomId===roomId&&snapshot.serverHostedRoom===true&&snapshot.serverReady===true);
  }
  async function roomFetch(path,options={}) {
    const roomId=readyRoomId,generation=roomGeneration,signal=roomRequests?.signal;
    await window.MUZIKAZ_API?.ready;
    if(!roomReady(roomId,generation))throw new DOMException('The multiplayer room changed.','AbortError');
    return apiFetch(path,{...options,signal});
  }
  function stopRoom() {
    readyRoomId=null;roomGeneration++;joined=false;
    roomRequests?.abort();roomRequests=null;presenceRequest=null;loadingChat=null;
    events?.close();events=null;eventsRoomId=null;openingEvents=null;
    cancelChatSpeech();disableMicrophone();closePeers();
    currentUsers=[];messages.replaceChildren();players.replaceChildren();count.textContent='0 / 15';roomCount.textContent='0 online';
    unread=0;unreadCount.hidden=true;
  }

  function setTextToSpeech(on, announce = false) {
    textToSpeechOn = Boolean(on && (window.AudioContext||window.webkitAudioContext));
    if(announce){localStorage.setItem(automaticSpeechPreference,String(textToSpeechOn));localStorage.setItem('muzikazChatTextToSpeech',String(textToSpeechOn));}
    ttsToggle.classList.toggle('is-on', textToSpeechOn);
    ttsToggle.setAttribute('aria-pressed', String(textToSpeechOn));
    ttsToggle.querySelector('b').textContent = textToSpeechOn ? 'Read text on' : 'Read text off';
    if (announce) voiceStatus.textContent = textToSpeechOn ? chatAudioBlocked()||'New room messages will be read aloud. Use Read aloud on an earlier message.' : 'Automatic reading off. Use Read aloud on a message to hear it.';
  }
  function readButton(item,on){const button=[...messages.querySelectorAll('[data-chat-read]')].find(node=>node.dataset.chatRead===String(item.id));if(button){button.textContent=on?'Stop reading':'Read aloud';button.setAttribute('aria-pressed',String(on));}}
  function chatAudioBlocked(){
    if(window.MUZIKAZ_AUDIO_PREFERENCES?.masterMuted||window.MUZIKAZ_AUDIO_PREFERENCES?.dialogueMuted)return 'Unmute all audio and NPC conversations in Audio settings to hear chat.';
    if(!speakerOn)return 'Tap Speaker on to hear this message.';
    return '';
  }
  function resumeChatAudio(){
    if(!speechTools)return;
    try{Promise.resolve(speechTools.speech.resume()).then(enabled=>{if(enabled===false&&!chatSpeechDisposed)voiceStatus.textContent='Tap Read aloud again to enable voice playback.';},()=>{if(!chatSpeechDisposed)voiceStatus.textContent='Tap Read aloud again to enable voice playback.';});}catch{voiceStatus.textContent='Tap Read aloud again to enable voice playback.';}
  }
  function queueAutomaticMessage(item,receivedAt){
    clearAutomaticMessage();
    if(Date.now()-receivedAt>=automaticMessageLifetime)return;
    pendingAutomaticMessage={item,receivedAt,roomId:activeRoom()};
    automaticMessageTimer=setTimeout(clearAutomaticMessage,automaticMessageLifetime-(Date.now()-receivedAt));
  }
  function flushAutomaticMessage(){
    if(!pendingAutomaticMessage||automaticFlushScheduled||chatSpeechDisposed)return;
    automaticFlushScheduled=true;
    // The adapter emits its state before the previous speaker releases speech
    // ownership. Defer until that turn completes; never interrupt an NPC reply.
    Promise.resolve().then(()=>{
      automaticFlushScheduled=false;const pending=pendingAutomaticMessage;if(!pending)return;
      if(chatSpeechDisposed||!textToSpeechOn||chatAudioBlocked()||pending.roomId!==activeRoom()||Date.now()-pending.receivedAt>=automaticMessageLifetime){clearAutomaticMessage();return;}
      if(speechTools?.isGameSpeechActive(speechTools.speech)||speechTools?.speech.speaking||speechTools?.speech.pending)return;
      clearAutomaticMessage();void speakMessage(pending.item,{receivedAt:pending.receivedAt});
    });
  }
  async function speakMessage(item,{manual=false,receivedAt=Date.now()}={}) {
    const roomId=activeRoom(),blocked=chatAudioBlocked();
    if (chatSpeechDisposed || blocked || (!manual&&(!textToSpeechOn||item?.sessionId===sessionId)) || !item?.message || (item.roomId && item.roomId !== roomId) || /^(🔥|👏|😂|💚|🎵|⚡)$/.test(item.message)){if(manual&&blocked)voiceStatus.textContent=blocked;return;}
    // Explicit reading starts output in the button gesture. It does not enable
    // automatic reading or replay the rest of the room's message history.
    if(manual){resumeChatAudio();cancelChatSpeech();}
    const generation=chatSpeechGeneration;
    const tools=await speechToolsReady;
    if(chatSpeechDisposed||generation!==chatSpeechGeneration||(!manual&&!textToSpeechOn)||chatAudioBlocked()||roomId!==activeRoom())return;
    if(!tools){voiceStatus.textContent='Voice playback could not load. Reload this page to retry.';return;}
    if(!manual){
      if(Date.now()-receivedAt>=automaticMessageLifetime||!roomAudioActivated&&tools.speech.state?.unlocked===false)return;
      if(tools.isGameSpeechActive(tools.speech)||tools.speech.speaking||tools.speech.pending){queueAutomaticMessage(item,receivedAt);return;}
    }
    const settings=window.MUZIKAZ_AUDIO_PREFERENCES||{},available=tools.speech.getVoices(),character={id:item.sessionId||item.username||'room-player',role:'player'},selection={gender:settings.speechVoiceGender||'auto',selectedVoiceURI:settings.speechVoiceURI,language:'en-US'};
    const generated=()=>tools.chooseCharacterVoice(available.filter(voice=>voice.generated),character,{...selection,selectedVoiceURI:''});
    const installed=()=>tools.chooseCharacterVoice(available.filter(voice=>!voice.generated&&voice.localService),character,{...selection,selectedVoiceURI:''});
    const selected=tools.chooseCharacterVoice(available,character,selection)||generated();
    if(!selected){voiceStatus.textContent='Choose a generated male or female voice in Audio settings, then tap Read aloud.';return;}
    const name=item.sessionId===sessionId?'You':item.username||'Player',line=tools.prepareSpeechText(`${name} says: ${item.message}`);
    const owner=Symbol('room-message'),finish=()=>{clearTimeout(watchdog);tools.releaseGameSpeech(tools.speech,owner);if(activeChatSpeech===owner){readButton(item,false);activeChatSpeech=null;activeChatMessageId=null;finishChatSpeech=null;}};
    let watchdog=null,attempt=0;activeChatSpeech=owner;finishChatSpeech=finish;
    activeChatMessageId=String(item.id);readButton(item,true);tools.claimGameSpeech(tools.speech,owner,finish);
    const failed=()=>{voiceStatus.textContent=tools.speech.lastError?.message||'This message could not be read. Tap Read aloud to retry.';finish();};
    const deadline=milliseconds=>{clearTimeout(watchdog);watchdog=setTimeout(()=>{tools.cancelGameSpeech(tools.speech,owner);voiceStatus.textContent='Voice playback took too long. Tap Read aloud to retry.';finish();},milliseconds);};
    function play(voice,retried=false){
      const attemptId=++attempt,playing=()=>activeChatSpeech===owner&&attemptId===attempt;
      const utterance=new tools.Utterance(line);utterance.voice=voice;utterance.lang=voice.lang||'en-US';utterance.rate=1;utterance.pitch=1;utterance.volume=.85;let started=false;
      utterance.onstart=()=>{if(!playing())return;started=true;voiceStatus.textContent=`Reading ${name==='You'?'your':name+"'s"} message.`;deadline(tools.speechTimeout(line));};
      utterance.onboundary=boundary=>{if(playing()&&Number.isFinite(boundary?.audioDuration))deadline(Math.max(8000,boundary.audioDuration*1000+(boundary.remainingSegments>0?65000:5000)));};
      utterance.onend=()=>{if(!playing())return;voiceStatus.textContent='Message finished.';finish();};
      utterance.onerror=error=>{
        if(!playing())return;
        const recoverable=['network','voice-unavailable','language-unavailable','synthesis-unavailable','synthesis-failed','not-allowed'].includes(error?.error);
        const fallback=!retried&&!started&&recoverable?(voice.generated?installed():generated()):null;
        if(fallback){play(fallback,true);return;}failed();
      };
      deadline(65000);try{tools.speech.speak(utterance);}catch{failed();}
    }
    play(selected);
  }

  function renderPresence(data = {}) {
    const roomId = window.MUZIKAZ_HOUSE_TRACKING?.roomId || localStorage.getItem('muzikazMultiplayerWorld') || 'rad-tox';
    currentUsers = (Array.isArray(data.users) ? data.users : []).filter((user) => (user.roomId || 'rad-tox') === roomId);
    count.textContent = `${currentUsers.length} / ${data.capacity || 15}`;
    roomName.textContent = roomId.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
    roomCount.textContent = `${currentUsers.length} online`;
    players.replaceChildren(...currentUsers.map((user) => { const chip = document.createElement('span'); chip.style.setProperty('--player-color', user.color || '#9cff00'); chip.dataset.sessionId = user.sessionId; chip.append(text(user.sessionId === sessionId ? `${user.username} (you)` : user.username)); return chip; }));
    const legacyCount = $('#house-presence-count'); if (legacyCount) legacyCount.textContent = `Live in ${window.MUZIKAZ_HOUSE_TRACKING?.roomId || 'this world'}: ${currentUsers.length} / ${data.capacity || 15}`;
    window.dispatchEvent(new CustomEvent('muzikaz:voice-presence',{detail:{users:currentUsers,sessionId}}));
    for (const [id, peer] of peers) if (!currentUsers.some((user) => user.sessionId === id && (localStream || user.voiceEnabled))) { peer.close(); peers.delete(id); stopMeter(id); remoteAudio.get(id)?.remove(); remoteAudio.delete(id); }
    if (localStream) connectToRoom();
  }
  function addMessage(item, notify = true) {
    if (!item?.id || !inActiveRoom(item) || [...messages.children].some((message) => message.dataset.messageId === String(item.id))) return;
    const pinnedToBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 48;
    messages.querySelector('.crib-chat-empty')?.remove();
    const li = document.createElement('li'); li.dataset.messageId = item.id; if (/^(🔥|👏|😂|💚|🎵|⚡)$/.test(item.message)) li.classList.add('is-reaction');
    if (item.sessionId === sessionId) li.classList.add('is-mine');
    const name = document.createElement('strong'); name.append(text(item.sessionId === sessionId ? 'You' : item.username));
    const time = document.createElement('time'); time.dateTime = item.createdAt || ''; time.textContent = item.createdAt ? new Date(item.createdAt).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' }) : 'now';
    const body = document.createElement('span'); body.append(text(item.message)); li.append(name, time, body);
    if(!/^(🔥|👏|😂|💚|🎵|⚡)$/.test(item.message)){
      const read=document.createElement('button');read.type='button';read.className='crib-chat-read';read.dataset.chatRead=String(item.id);read.textContent='Read aloud';read.setAttribute('aria-label',`Read message from ${item.sessionId===sessionId?'you':item.username||'player'} aloud`);read.setAttribute('aria-pressed','false');read.disabled=!speechTools;
      read.addEventListener('click',()=>{if(activeChatSpeech&&activeChatMessageId===String(item.id)){cancelChatSpeech();voiceStatus.textContent='Message reading stopped.';}else void speakMessage(item,{manual:true});});li.append(read);
    }
    messages.append(li);
    while (messages.children.length > 50) messages.firstElementChild.remove();
    if (pinnedToBottom || item.sessionId === sessionId) messages.scrollTop = messages.scrollHeight;
    if (notify && panel.hidden && item.sessionId !== sessionId) { unread += 1; unreadCount.textContent = unread > 9 ? '9+' : String(unread); unreadCount.hidden = false; }
    if (notify) speakMessage(item);
  }
  async function postMessage(message) {
    if (sendingMessage) return;
    if(!roomReady())throw new Error('Join a multiplayer room to chat.');
    sendingMessage = true;
    try {
      const roomId=readyRoomId,generation=roomGeneration;await heartbeat();
      if(!roomReady(roomId,generation))throw new Error('The room changed. Send your message again in the current room.');
      const response = await roomFetch('/api/houses/ioncore-house/chat', { method:'POST', headers, body:JSON.stringify({ message:message.slice(0, 140) }) });
      const data = await jsonResponse(response);
      if(!roomReady(roomId,generation))return;
      window.MUZIKAZ_HOUSE_TRACKING = { ...(window.MUZIKAZ_HOUSE_TRACKING || {}), message:data.message };
      window.dispatchEvent(new CustomEvent('muzikaz-house-chat', { detail:data }));
      addMessage(data);
      return data;
    } finally { sendingMessage = false; }
  }
  async function heartbeat() {
    const roomId=readyRoomId,generation=roomGeneration;
    if(!roomReady(roomId,generation))return;
    if(presenceRequest?.roomId===roomId){const pending=presenceRequest;await pending.promise;if(pending.voiceEnabled!==Boolean(localStream)||pending.captionAt!==captionAt){if(presenceRequest===pending)presenceRequest=null;return heartbeat();}return;}
    const promise=(async()=>{
      let avatar=window.MUZIKAZ_DESIGNATED_AVATAR;
      if(!avatar)try{avatar=JSON.parse(localStorage.getItem('muzikazDesignatedAvatar')||'null');}catch{localStorage.removeItem('muzikazDesignatedAvatar');}
      // The server confirms account, room membership and character. Text chat
      // must not depend on a cached browser avatar or microphone permission.
      const response=await roomFetch('/api/houses/ioncore-house/presence',{method:'POST',headers,body:JSON.stringify({username,voiceEnabled:Boolean(localStream),voiceCaption:caption,voiceCaptionAt:captionAt,roomId,color,avatarUrl:avatar?.modelUrl,modelUrl:avatar?.modelUrl,avatarName:avatar?.displayName||avatar?.name,position:window.MUZIKAZ_HOUSE_TRACKING?.position,rotation:window.MUZIKAZ_HOUSE_TRACKING?.rotation,movementState:window.MUZIKAZ_HOUSE_TRACKING?.movementState||'idle',animationState:window.MUZIKAZ_HOUSE_TRACKING?.animationState||'auto'})});
      const data=await jsonResponse(response);
      if(roomReady(roomId,generation)){joined=true;renderPresence(data);status.textContent='';}
    })();
    presenceRequest={roomId,promise,voiceEnabled:Boolean(localStream),captionAt};
    try{await promise;}finally{if(presenceRequest?.promise===promise)presenceRequest=null;}
  }


  async function signal(to, kind, signalPayload = null) { if(!joined||!roomReady())return;const roomId=readyRoomId,generation=roomGeneration;if(!headers['X-CSRF-Token']&&!window.MuzikazAccountSession?.csrfToken){const member=await jsonResponse(await roomFetch('/api/market/session',{headers}));headers['X-CSRF-Token']=member.csrfToken;}if(!roomReady(roomId,generation))return;headers['X-CSRF-Token'] = window.MuzikazAccountSession?.csrfToken || headers['X-CSRF-Token'] || ''; const response = await roomFetch('/api/houses/ioncore-house/voice/signal', { method:'POST', headers, body:JSON.stringify({ to, kind, payload:signalPayload }) }); await jsonResponse(response); }
  function createPeer(remoteId) {
    if (peers.has(remoteId)) return peers.get(remoteId);
    const peer = new RTCPeerConnection({ iceServers:[{ urls:'stun:stun.l.google.com:19302' }, { urls:'stun:stun1.l.google.com:19302' }] });
    if(localStream)localStream.getTracks().forEach((track) => peer.addTrack(track, localStream));else peer.addTransceiver('audio',{direction:'recvonly'});
    peer.onicecandidate = (event) => { if (event.candidate) signal(remoteId, 'candidate', event.candidate).catch(() => {}); };
    peer.ontrack = (event) => { let audio = remoteAudio.get(remoteId); if (!audio) { audio = document.createElement('audio'); audio.autoplay = true; audio.playsInline = true; audio.hidden = true; root.append(audio); remoteAudio.set(remoteId, audio); } audio.srcObject = event.streams[0] || new MediaStream([event.track]); audio.volume=1;meterStream(remoteId,audio.srcObject);syncRemoteAudio(); audio.play().catch(() => { voiceStatus.textContent = 'Tap the game or a voice control to hear room audio'; }); };
    peer.onconnectionstatechange = () => { if (peer.connectionState === 'connected') voiceStatus.textContent = `Voice live · ${peers.size} connection${peers.size === 1 ? '' : 's'}`; if (['failed','closed'].includes(peer.connectionState)&&peers.get(remoteId)===peer) { peer.close(); peers.delete(remoteId);stopMeter(remoteId);remoteAudio.get(remoteId)?.remove();remoteAudio.delete(remoteId); } };
    peers.set(remoteId, peer); return peer;
  }
  async function makeOffer(remoteId) { const peer = createPeer(remoteId); const offer = await peer.createOffer(); await peer.setLocalDescription(offer); await signal(remoteId, 'offer', peer.localDescription); }
  function connectToRoom() { if (!localStream||!joined||!roomReady()) return; currentUsers.filter((user) => user.sessionId !== sessionId && (sessionId < user.sessionId || !user.voiceEnabled) && !peers.has(user.sessionId)).forEach((user) => makeOffer(user.sessionId).catch(() => {peers.get(user.sessionId)?.close();peers.delete(user.sessionId);})); }
  async function handleVoiceSignal(data) {
    if (!roomReady() || !data?.from || data.to !== sessionId || data.roomId !== activeRoom()) return;
    if (data.kind === 'hangup') { peers.get(data.from)?.close(); peers.delete(data.from); remoteAudio.get(data.from)?.remove(); remoteAudio.delete(data.from); pendingCandidates.delete(data.from);stopMeter(data.from); return; }
    if(!currentUsers.some(user=>user.sessionId===data.from&&(localStream||user.voiceEnabled)))return;
    const peer = createPeer(data.from);
    if (data.kind === 'offer') { await peer.setRemoteDescription(data.payload); const answer = await peer.createAnswer(); await peer.setLocalDescription(answer); await signal(data.from, 'answer', peer.localDescription); }
    else if (data.kind === 'answer') await peer.setRemoteDescription(data.payload);
    else if (data.kind === 'candidate') { if(peer.remoteDescription) await peer.addIceCandidate(data.payload); else { const queue=pendingCandidates.get(data.from)||[]; queue.push(data.payload); pendingCandidates.set(data.from,queue.slice(-100)); } }
    if(peer.remoteDescription){const queue=pendingCandidates.get(data.from)||[];pendingCandidates.delete(data.from);for(const candidate of queue)await peer.addIceCandidate(candidate);}
  }
  async function enableMicrophone() {
    if(!roomReady())throw new Error('Join a multiplayer room to use voice chat.');
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) throw new Error(window.isSecureContext===false?'Microphone access requires HTTPS. Open the secure site and try again.':'Voice chat is not supported by this browser.');
    const generation=++voiceGeneration,room=activeRoom();
    // Capture must begin inside the user's click. A blocked or interrupted
    // output context must never hold the microphone permission request hostage.
    prepareAudio().catch(()=>{});
    voiceStatus.textContent='Waiting for microphone permission…';
    const stream = await navigator.mediaDevices.getUserMedia({ audio:{ echoCancellation:true, noiseSuppression:true, autoGainControl:true }, video:false });
    if(generation!==voiceGeneration||room!==activeRoom()||!roomReady()){stream.getTracks().forEach(track=>track.stop());return;}closePeers();localStream=stream;
    micToggle.classList.add('is-on'); micToggle.setAttribute('aria-pressed', 'true'); micToggle.querySelector('b').textContent = 'Mic on'; voiceStatus.textContent = 'Microphone live · joining this space…'; stream.getAudioTracks().forEach(track=>track.addEventListener('ended',()=>{if(localStream===stream)disableMicrophone();})); const member=await jsonResponse(await roomFetch('/api/market/session',{headers}));
    if(generation!==voiceGeneration||localStream!==stream||!roomReady())return;
    headers['X-CSRF-Token']=member.csrfToken;meterStream(sessionId,stream);await heartbeat();connectToRoom();if(generation===voiceGeneration&&localStream===stream&&roomReady())startCaptions();
  }
  function disableMicrophone() { voiceGeneration++;stopCaptions();localStream?.getTracks().forEach(track=>track.stop());localStream=null;stopMeter(sessionId);for(const [id,peer]of peers){if(currentUsers.some(user=>user.sessionId===id&&user.voiceEnabled)){for(const sender of peer.getSenders())if(sender.track?.kind==='audio')sender.replaceTrack(null).catch(()=>{});}else{signal(id,'hangup').catch(()=>{});peer.close();peers.delete(id);stopMeter(id);remoteAudio.get(id)?.remove();remoteAudio.delete(id);}}if(joined)heartbeat().catch(()=>{});micToggle.classList.remove('is-on','is-speaking');micToggle.style.removeProperty('--voice-level');micToggle.setAttribute('aria-pressed','false');micToggle.querySelector('b').textContent='Mic off';voiceStatus.textContent='Mic off · listening to this room'; }


  function syncChatViewport() {
    const viewport = window.visualViewport;
    const viewportTop = viewport?.offsetTop || 0;
    const viewportHeight = viewport?.height || window.innerHeight;
    document.documentElement.style.setProperty('--crib-visual-top', `${Math.round(viewportTop)}px`);
    document.documentElement.style.setProperty('--crib-visual-height', `${Math.round(viewportHeight)}px`);
    if (document.documentElement.classList.contains('crib-chat-selected')) window.scrollTo(0, gameScrollY);
  }
  function setPanel(open) {
    if(open&&document.fullscreenElement&&!document.fullscreenElement.contains(root))document.fullscreenElement.append(root);
    if(!open&&root.parentNode!==panelParent)panelParent.insertBefore(root,panelNext?.parentNode===panelParent?panelNext:null);
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    document.documentElement.classList.toggle('crib-chat-selected', open);
    if (open) {
      document.exitPointerLock?.();
      window.dispatchEvent(new CustomEvent('muzikaz:chat-panel',{detail:{open:true}}));
      gameScrollY = window.scrollY;
      const shell = document.querySelector('.house-explorer-shell');
      if (shell) shell.style.setProperty('--crib-locked-game-height', `${Math.round(shell.getBoundingClientRect().height)}px`);
      unread = 0; unreadCount.hidden = true; messages.scrollTop = messages.scrollHeight;
      syncChatViewport();
      input.focus({ preventScroll:true });
      window.scrollTo(0, gameScrollY);
      if(roomReady())heartbeat().then(loadChat).catch(error=>{status.textContent=error.message;});
      else status.textContent='Join a multiplayer room to chat.';
    } else {
      document.documentElement.classList.remove('crib-chat-composing');
      if(!document.querySelector('dialog[open]:not([data-gameplay-blocking="false"])'))document.documentElement.classList.remove('game-menu-open');
      window.dispatchEvent(new CustomEvent('muzikaz:chat-panel',{detail:{open:false}}));
      document.querySelector('.house-explorer-shell')?.style.removeProperty('--crib-locked-game-height');
      document.documentElement.style.removeProperty('--crib-visual-top');
      document.documentElement.style.removeProperty('--crib-visual-height');
    }
  }
  window.visualViewport?.addEventListener('resize', syncChatViewport);
  window.visualViewport?.addEventListener('scroll', syncChatViewport);
  input.addEventListener('focus', () => { document.documentElement.classList.add('crib-chat-composing'); syncChatViewport(); });
  input.addEventListener('blur', () => document.documentElement.classList.remove('crib-chat-composing'));
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();setPanel(false);toggle.focus();}event.stopPropagation();});
  panel.addEventListener('keyup',event=>event.stopPropagation());
  toggle.addEventListener('click', () => setPanel(panel.hidden));
  panel.querySelector('[data-close-chat]').addEventListener('click', () => { setPanel(false); toggle.focus(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !panel.hidden) { setPanel(false); toggle.focus(); } });
  form.addEventListener('submit', async (event) => { event.preventDefault(); const message = input.value.trim(); if (!message) return; const submit = form.querySelector('[type="submit"]'); input.disabled = true; submit.disabled = true; status.textContent = 'Sending…'; try { await postMessage(message); input.value = ''; status.textContent = ''; } catch (error) { status.textContent = error.message || 'Message could not be sent.'; } finally { input.disabled = false; submit.disabled = false; input.focus(); } });
  emojiToggle.addEventListener('click', () => { const open = reactions.classList.toggle('open'); emojiToggle.setAttribute('aria-expanded', String(open)); });
  reactions.querySelectorAll('button').forEach((button) => button.addEventListener('click', async () => { if (sendingMessage) return; try { await postMessage(button.textContent.trim()); reactions.classList.remove('open'); emojiToggle.setAttribute('aria-expanded', 'false'); } catch (error) { status.textContent = error.message || 'Reaction could not be sent.'; } }));
  const roomAudioGestures=['pointerdown','pointerup','touchend','click','keydown'];
  const resumeRoomAudio=event=>{
    const gesture=roomAudioGestures.includes(event?.type);
    if(!gesture&&!roomAudioActivated&&speechTools?.speech.state?.unlocked!==true)return;
    if(gesture)roomAudioActivated=true;
    Promise.resolve(speechTools?.speech.resume()).catch(()=>{});
    // Native media remains a usable output while Web Audio is interrupted.
    for(const audio of remoteAudio.values())if(speakerAudible())audio.play().catch(()=>{});
    prepareAudio().then(()=>{for(const [id,audio]of remoteAudio)if(audio.srcObject&&!meters.has(id))meterStream(id,audio.srcObject);flushAutomaticMessage();}).catch(()=>{});
  };
  for(const gesture of roomAudioGestures)document.addEventListener(gesture,resumeRoomAudio,{capture:true,passive:true});
  const resumeVisibleRoomAudio=()=>{if(!document.hidden)resumeRoomAudio();};
  document.addEventListener('muzikaz:gameplay-ready',resumeRoomAudio);
  document.addEventListener('visibilitychange',resumeVisibleRoomAudio);
  window.addEventListener('focus',resumeVisibleRoomAudio);window.addEventListener('pageshow',resumeVisibleRoomAudio);
  micToggle.addEventListener('click', async () => { if(micToggle.disabled)return; micToggle.disabled=true; try { if (localStream) disableMicrophone(); else await enableMicrophone(); } catch (error) { disableMicrophone(); const errors={NotAllowedError:'Allow microphone access in your browser, then tap Mic off to retry.',NotFoundError:'No microphone found. Connect a microphone and tap Mic off to retry.',NotReadableError:'The microphone is busy or unavailable. Close other recording apps and tap Mic off to retry.'};voiceStatus.textContent=errors[error.name]||error.message; } finally { micToggle.disabled=false; } });
  speakerToggle.addEventListener('click', () => { prepareAudio().then(()=>{for(const [id,audio]of remoteAudio)if(audio.srcObject)meterStream(id,audio.srcObject);}).catch(()=>{});speakerOn = !speakerOn;syncRemoteAudio();if(speakerOn)remoteAudio.forEach(audio=>audio.play().catch(()=>{}));else cancelChatSpeech(); speakerToggle.classList.toggle('is-on', speakerOn); speakerToggle.setAttribute('aria-pressed', String(speakerOn)); speakerToggle.querySelector('b').textContent = speakerOn ? 'Speaker on' : 'Speaker off'; });
  ttsToggle.disabled=true;ttsToggle.title='Preparing voice playback…';
  speechToolsReady.then(tools=>{if(chatSpeechDisposed)return;const supported=!!tools&&!!(window.AudioContext||window.webkitAudioContext);ttsToggle.disabled=!supported;ttsToggle.title=supported?'Read new room messages aloud':'Voice playback is unavailable. Reload this page to retry.';tools?.speech.addEventListener?.('statechange',flushAutomaticMessage);if(roomAudioActivated)resumeRoomAudio();for(const button of messages.querySelectorAll('[data-chat-read]')){button.disabled=!supported;button.title=supported?'Read this message aloud':'Voice playback is unavailable. Reload this page to retry.';}});
  setTextToSpeech(textToSpeechOn);
  ttsToggle.addEventListener('click', () => { if (!ttsToggle.disabled) { resumeChatAudio();cancelChatSpeech(); setTextToSpeech(!textToSpeechOn, true); } });
  async function loadChat() {
    const roomId=readyRoomId,generation=roomGeneration;
    if(!roomReady(roomId,generation))return;
    if (loadingChat?.roomId === roomId) return loadingChat.promise;
    const request = (async () => {
      const data = await jsonResponse(await roomFetch(`/api/houses/ioncore-house/chat?roomId=${encodeURIComponent(roomId)}`, { headers, cache:'no-store' }));
      if(!roomReady(roomId,generation))return;
      (Array.isArray(data.messages) ? data.messages : []).forEach((message) => addMessage(message, false));
    })();
    loadingChat = { roomId, promise:request };
    try { await request; } finally { if (loadingChat?.promise === request) loadingChat = null; }
  }
  const eventData = (event) => { try { return JSON.parse(event.data); } catch { return null; } };
  async function openEvents() {
    const roomId=readyRoomId,generation=roomGeneration;
    if(!joined||!roomReady(roomId,generation)||!('EventSource' in window)||eventsRoomId===roomId)return;
    if(openingEvents?.roomId===roomId)return openingEvents.promise;
    const promise=(async()=>{
      // API discovery can move the transport to a separate host. Resolve the
      // stream URL only after that host and authoritative membership are ready.
      await window.MUZIKAZ_API?.ready;
      if(!joined||!roomReady(roomId,generation))return;
      const stream=new EventSource(apiUrl(`/api/houses/ioncore-house/events?sessionId=${encodeURIComponent(sessionId)}&roomId=${encodeURIComponent(roomId)}`),{withCredentials:true});
      events=stream;eventsRoomId=roomId;
      stream.addEventListener('house-presence-updated',event=>{const data=eventData(event);if(data&&roomReady(roomId,generation))renderPresence(data);});
      stream.addEventListener('house-chat-message',event=>{if(roomReady(roomId,generation))addMessage(eventData(event));});
      for(const name of ['world-atlas-updated','custom-map-live','member-plot-updated'])stream.addEventListener(name,event=>{if(roomReady(roomId,generation))window.dispatchEvent(new CustomEvent('muzikaz:world-directory-updated',{detail:eventData(event)}));});
    })();
    openingEvents={roomId,promise};
    try{await promise;}finally{if(openingEvents?.promise===promise)openingEvents=null;}
  }
  const voiceTimer=setInterval(async()=>{
    if(!joined||!roomReady()||pollingVoice)return;
    const roomId=readyRoomId,generation=roomGeneration;
    pollingVoice=true;
    try{const data=await jsonResponse(await roomFetch('/api/houses/ioncore-house/voice/signal',{headers,cache:'no-store'}));if(roomReady(roomId,generation))for(const item of data.signals||[])await handleVoiceSignal(item);}
    catch(error){if(roomReady(roomId,generation))voiceStatus.textContent=error.message||'Voice connection interrupted';}
    finally{pollingVoice=false;}
  },1000);
  const beginPresence = async(event) => {
    const roomId=event?.detail?.roomId||activeRoom();
    if(roomId!==activeRoom())return;
    const snapshot=window.MuzikazHouseExplorer?.snapshot?.();
    if(snapshot&&(snapshot.roomId!==roomId||snapshot.serverHostedRoom!==true||snapshot.serverReady!==true))return;
    if(readyRoomId!==roomId){stopRoom();readyRoomId=roomId;roomRequests=new AbortController();}
    const generation=roomGeneration;
    try{await heartbeat();if(roomReady(roomId,generation))await Promise.all([loadChat(),openEvents()]);}
    catch(error){if(roomReady(roomId,generation)){joined=false;status.textContent=error.message;}}
  };
  window.addEventListener('muzikaz:multiplayer-room-ready',beginPresence);
  window.addEventListener('muzikaz:multiplayer-world-change', () => {stopRoom();status.textContent='Join a multiplayer room to chat.';});
  const initialRoom=window.MuzikazHouseExplorer?.snapshot?.();
  if(initialRoom?.serverHostedRoom&&initialRoom.serverReady)beginPresence({detail:{roomId:initialRoom.roomId}});
  const timer = setInterval(() => {if(!readyRoomId)return;if(!roomReady()){stopRoom();return;}beginPresence();}, 5_000);
  window.addEventListener('pagehide', event => { cancelChatSpeech();if(event.persisted)return;chatSpeechDisposed=true;for(const gesture of roomAudioGestures)document.removeEventListener(gesture,resumeRoomAudio,true);document.removeEventListener('muzikaz:gameplay-ready',resumeRoomAudio);document.removeEventListener('visibilitychange',resumeVisibleRoomAudio);window.removeEventListener('focus',resumeVisibleRoomAudio);window.removeEventListener('pageshow',resumeVisibleRoomAudio);speechTools?.speech.removeEventListener?.('statechange',flushAutomaticMessage);clearInterval(timer); clearInterval(voiceTimer); clearInterval(meterTimer);const wasJoined=joined;stopRoom();audioContext?.close().catch(()=>{});if(wasJoined)navigator.sendBeacon?.(apiUrl(`/api/houses/ioncore-house/presence/leave?sessionId=${encodeURIComponent(sessionId)}`)); });
})();
