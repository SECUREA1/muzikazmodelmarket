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
  const panelParent=root.parentNode,panelNext=root.nextSibling;
  const headers = { 'Content-Type': 'application/json', 'X-MUZIKAZ-Session': sessionId, 'X-User-Id': email.toLowerCase(), 'X-User-Name': username };
  const peers = new Map(), remoteAudio = new Map(), pendingCandidates = new Map();
  let pollingVoice = false;
  window.MUZIKAZ_HOUSE_TRACKING = { roomId:localStorage.getItem('muzikazMultiplayerWorld') || window.MUZIKAZ_HOUSE_TRACKING?.roomId || 'rad-tox', ...(window.MUZIKAZ_HOUSE_TRACKING || {}) };
  let joined = false, localStream = null, speakerOn = true, currentUsers = [], unread = 0, loadingChat = null, sendingMessage = false, presenceRequest=null;
  let textToSpeechOn = localStorage.getItem('muzikazChatTextToSpeech') === 'true';
  let gameScrollY = 0;
  const payload = (response) => response?.data ?? response;
  async function jsonResponse(response) { const result = await response.json().catch(() => ({})); if (!response.ok || result.success === false) throw new Error(result.error || result.message || 'The crib server did not respond.'); return payload(result); }
  const text = (value) => document.createTextNode(String(value || ''));
  const activeRoom = () => window.MUZIKAZ_HOUSE_TRACKING?.roomId || localStorage.getItem('muzikazMultiplayerWorld') || 'rad-tox';
  const inActiveRoom = (item) => !item?.roomId || item.roomId === activeRoom();

  function setTextToSpeech(on, announce = false) {
    textToSpeechOn = Boolean(on && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window);
    localStorage.setItem('muzikazChatTextToSpeech', String(textToSpeechOn));
    ttsToggle.classList.toggle('is-on', textToSpeechOn);
    ttsToggle.setAttribute('aria-pressed', String(textToSpeechOn));
    ttsToggle.querySelector('b').textContent = textToSpeechOn ? 'Read text on' : 'Read text off';
    if (announce) voiceStatus.textContent = textToSpeechOn ? 'Room messages will be read aloud' : 'Text to speech off';
  }
  function speakMessage(item) {
    const activeRoom = window.MUZIKAZ_HOUSE_TRACKING?.roomId || localStorage.getItem('muzikazMultiplayerWorld') || 'rad-tox';
    if (!textToSpeechOn || !item?.message || (item.roomId && item.roomId !== activeRoom) || /^(🔥|👏|😂|💚|🎵|⚡)$/.test(item.message)) return;
    const utterance = new SpeechSynthesisUtterance(`${item.sessionId === sessionId ? 'You' : item.username || 'Player'} says: ${item.message}`);
    utterance.lang = document.documentElement.lang || navigator.language || 'en';
    utterance.rate = 1; utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
  }

  function renderPresence(data = {}) {
    const roomId = window.MUZIKAZ_HOUSE_TRACKING?.roomId || localStorage.getItem('muzikazMultiplayerWorld') || 'rad-tox';
    currentUsers = (Array.isArray(data.users) ? data.users : []).filter((user) => (user.roomId || 'rad-tox') === roomId);
    count.textContent = `${currentUsers.length} / ${data.capacity || 15}`;
    roomName.textContent = roomId.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
    roomCount.textContent = `${currentUsers.length} online`;
    players.replaceChildren(...currentUsers.map((user) => { const chip = document.createElement('span'); chip.style.setProperty('--player-color', user.color || '#9cff00'); chip.dataset.sessionId = user.sessionId; chip.append(text(user.sessionId === sessionId ? `${user.username} (you)` : user.username)); return chip; }));
    const legacyCount = $('#house-presence-count'); if (legacyCount) legacyCount.textContent = `Live in ${window.MUZIKAZ_HOUSE_TRACKING?.roomId || 'this world'}: ${currentUsers.length} / ${data.capacity || 15}`;
    for (const [id, peer] of peers) if (!currentUsers.some((user) => user.sessionId === id && user.voiceEnabled)) { peer.close(); peers.delete(id); remoteAudio.get(id)?.remove(); remoteAudio.delete(id); }
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
    const body = document.createElement('span'); body.append(text(item.message)); li.append(name, time, body); messages.append(li);
    while (messages.children.length > 50) messages.firstElementChild.remove();
    if (pinnedToBottom || item.sessionId === sessionId) messages.scrollTop = messages.scrollHeight;
    if (notify && panel.hidden && item.sessionId !== sessionId) { unread += 1; unreadCount.textContent = unread > 9 ? '9+' : String(unread); unreadCount.hidden = false; }
    if (notify) speakMessage(item);
  }
  async function postMessage(message) {
    if (sendingMessage) return;
    sendingMessage = true;
    try {
      const roomId=activeRoom();await heartbeat();
      if(roomId!==activeRoom())throw new Error('The room changed. Send your message again in the current room.');
      const response = await apiFetch('/api/houses/ioncore-house/chat', { method:'POST', headers, body:JSON.stringify({ message:message.slice(0, 140) }) });
      const data = await jsonResponse(response);
      window.MUZIKAZ_HOUSE_TRACKING = { ...(window.MUZIKAZ_HOUSE_TRACKING || {}), message:data.message };
      window.dispatchEvent(new CustomEvent('muzikaz-house-chat', { detail:data }));
      addMessage(data);
      return data;
    } finally { sendingMessage = false; }
  }
  async function heartbeat() {
    const roomId=activeRoom();
    if(presenceRequest?.roomId===roomId)return presenceRequest.promise;
    const promise=(async()=>{
      let avatar=window.MUZIKAZ_DESIGNATED_AVATAR;
      if(!avatar)try{avatar=JSON.parse(localStorage.getItem('muzikazDesignatedAvatar')||'null');}catch{localStorage.removeItem('muzikazDesignatedAvatar');}
      // The server confirms account, room membership and character. Text chat
      // must not depend on a cached browser avatar or microphone permission.
      const response=await apiFetch('/api/houses/ioncore-house/presence',{method:'POST',headers,body:JSON.stringify({username,voiceEnabled:Boolean(localStream),roomId,color,avatarUrl:avatar?.modelUrl,modelUrl:avatar?.modelUrl,avatarName:avatar?.displayName||avatar?.name,position:window.MUZIKAZ_HOUSE_TRACKING?.position,rotation:window.MUZIKAZ_HOUSE_TRACKING?.rotation,movementState:window.MUZIKAZ_HOUSE_TRACKING?.movementState||'idle',animationState:window.MUZIKAZ_HOUSE_TRACKING?.animationState||'auto'})});
      const data=await jsonResponse(response);
      if(roomId===activeRoom()){joined=true;renderPresence(data);status.textContent='';}
    })();
    presenceRequest={roomId,promise};
    try{await promise;}finally{if(presenceRequest?.promise===promise)presenceRequest=null;}
  }


  async function signal(to, kind, signalPayload = null) { headers['X-CSRF-Token'] = window.MuzikazAccountSession?.csrfToken || headers['X-CSRF-Token'] || ''; const response = await apiFetch('/api/houses/ioncore-house/voice/signal', { method:'POST', headers, body:JSON.stringify({ to, kind, payload:signalPayload }) }); await jsonResponse(response); }
  function createPeer(remoteId) {
    if (peers.has(remoteId)) return peers.get(remoteId);
    const peer = new RTCPeerConnection({ iceServers:[{ urls:'stun:stun.l.google.com:19302' }, { urls:'stun:stun1.l.google.com:19302' }] });
    localStream?.getTracks().forEach((track) => peer.addTrack(track, localStream));
    peer.onicecandidate = (event) => { if (event.candidate) signal(remoteId, 'candidate', event.candidate).catch(() => {}); };
    peer.ontrack = (event) => { let audio = remoteAudio.get(remoteId); if (!audio) { audio = document.createElement('audio'); audio.autoplay = true; audio.playsInline = true; audio.hidden = true; root.append(audio); remoteAudio.set(remoteId, audio); } audio.srcObject = event.streams[0]; audio.muted = !speakerOn; audio.play().catch(() => { voiceStatus.textContent = 'Tap Speaker on to hear voice'; }); };
    peer.onconnectionstatechange = () => { if (peer.connectionState === 'connected') voiceStatus.textContent = `Voice live · ${peers.size} connection${peers.size === 1 ? '' : 's'}`; if (['failed','closed'].includes(peer.connectionState)) { peer.close(); peers.delete(remoteId); } };
    peers.set(remoteId, peer); return peer;
  }
  async function makeOffer(remoteId) { const peer = createPeer(remoteId); const offer = await peer.createOffer(); await peer.setLocalDescription(offer); await signal(remoteId, 'offer', peer.localDescription); }
  function connectToRoom() { if (!localStream) return; currentUsers.filter((user) => user.voiceEnabled && user.sessionId !== sessionId && sessionId < user.sessionId && !peers.has(user.sessionId)).forEach((user) => makeOffer(user.sessionId).catch(() => {peers.get(user.sessionId)?.close();peers.delete(user.sessionId);})); }
  async function handleVoiceSignal(data) {
    if (!data?.from || data.to !== sessionId || data.roomId !== activeRoom()) return;
    if (data.kind === 'hangup') { peers.get(data.from)?.close(); peers.delete(data.from); remoteAudio.get(data.from)?.remove(); remoteAudio.delete(data.from); pendingCandidates.delete(data.from); return; }
    if (!localStream) return;
    const peer = createPeer(data.from);
    if (data.kind === 'offer') { await peer.setRemoteDescription(data.payload); const answer = await peer.createAnswer(); await peer.setLocalDescription(answer); await signal(data.from, 'answer', peer.localDescription); }
    else if (data.kind === 'answer') await peer.setRemoteDescription(data.payload);
    else if (data.kind === 'candidate') { if(peer.remoteDescription) await peer.addIceCandidate(data.payload); else { const queue=pendingCandidates.get(data.from)||[]; queue.push(data.payload); pendingCandidates.set(data.from,queue.slice(-100)); } }
    if(peer.remoteDescription){const queue=pendingCandidates.get(data.from)||[];pendingCandidates.delete(data.from);for(const candidate of queue)await peer.addIceCandidate(candidate);}
  }
  async function enableMicrophone() {
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) throw new Error('Voice chat is not supported by this browser.');
    localStream = await navigator.mediaDevices.getUserMedia({ audio:{ echoCancellation:true, noiseSuppression:true, autoGainControl:true }, video:false });
    micToggle.classList.add('is-on'); micToggle.setAttribute('aria-pressed', 'true'); micToggle.querySelector('b').textContent = 'Mic on'; voiceStatus.textContent = 'Microphone live · joining this space…'; localStream.getAudioTracks().forEach(track=>track.addEventListener('ended',()=>{if(localStream)disableMicrophone();})); const member=await jsonResponse(await apiFetch('/api/market/session',{headers})); headers['X-CSRF-Token']=member.csrfToken; await heartbeat(); connectToRoom();
  }
  function disableMicrophone() { localStream?.getTracks().forEach((track) => track.stop()); localStream = null; for (const [id, peer] of peers) { signal(id, 'hangup').catch(() => {}); peer.close(); } peers.clear(); pendingCandidates.clear(); remoteAudio.forEach(audio=>audio.remove()); remoteAudio.clear(); if(joined)heartbeat().catch(()=>{}); micToggle.classList.remove('is-on'); micToggle.setAttribute('aria-pressed', 'false'); micToggle.querySelector('b').textContent = 'Mic off'; voiceStatus.textContent = 'Voice disconnected'; }

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
      heartbeat().then(loadChat).catch(error=>{status.textContent=error.message;});
    } else {
      document.documentElement.classList.remove('crib-chat-composing');
      if(!document.querySelector('dialog[open]'))document.documentElement.classList.remove('game-menu-open');
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
  micToggle.addEventListener('click', async () => { if(micToggle.disabled)return; micToggle.disabled=true; try { if (localStream) disableMicrophone(); else await enableMicrophone(); } catch (error) { disableMicrophone(); voiceStatus.textContent = error.name === 'NotAllowedError' ? 'Allow microphone access in your browser, then tap Mic off to retry.' : error.message; } finally { micToggle.disabled=false; } });
  speakerToggle.addEventListener('click', () => { speakerOn = !speakerOn; remoteAudio.forEach((audio) => { audio.muted = !speakerOn; if (speakerOn) audio.play().catch(() => {}); }); speakerToggle.classList.toggle('is-on', speakerOn); speakerToggle.setAttribute('aria-pressed', String(speakerOn)); speakerToggle.querySelector('b').textContent = speakerOn ? 'Speaker on' : 'Speaker off'; });
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) { ttsToggle.disabled = true; ttsToggle.title = 'Text to speech is not supported by this browser'; }
  setTextToSpeech(textToSpeechOn);
  ttsToggle.addEventListener('click', () => { if (!ttsToggle.disabled) { window.speechSynthesis.cancel(); setTextToSpeech(!textToSpeechOn, true); } });
  async function loadChat() {
    const roomId = activeRoom();
    if (loadingChat?.roomId === roomId) return loadingChat.promise;
    const request = (async () => {
      const data = await jsonResponse(await apiFetch(`/api/houses/ioncore-house/chat?roomId=${encodeURIComponent(roomId)}`, { headers, cache:'no-store' }));
      (Array.isArray(data.messages) ? data.messages : []).forEach((message) => addMessage(message, false));
    })();
    loadingChat = { roomId, promise:request };
    try { await request; } finally { if (loadingChat?.promise === request) loadingChat = null; }
  }
  loadChat().catch(() => {});
  let events;
  const eventData = (event) => { try { return JSON.parse(event.data); } catch { return null; } };
  if ('EventSource' in window) { events = new EventSource(apiUrl(`/api/houses/ioncore-house/events?sessionId=${encodeURIComponent(sessionId)}`)); events.addEventListener('house-presence-updated', (event) => { const data = eventData(event); if (data) renderPresence(data); }); events.addEventListener('house-chat-message', (event) => addMessage(eventData(event)));  }
  const voiceTimer=setInterval(async()=>{
    if(!localStream||!joined||pollingVoice)return;
    pollingVoice=true;
    try{const data=await jsonResponse(await apiFetch('/api/houses/ioncore-house/voice/signal',{headers,cache:'no-store'}));for(const item of data.signals||[])await handleVoiceSignal(item);}
    catch(error){voiceStatus.textContent=error.message||'Voice connection interrupted';}
    finally{pollingVoice=false;}
  },1000);
  const beginPresence = () => heartbeat().catch((error) => { joined=false;status.textContent = error.message; });
  window.addEventListener('muzikaz:multiplayer-room-ready',beginPresence);
  window.addEventListener('muzikaz:multiplayer-world-change', () => { disableMicrophone(); messages.replaceChildren(); unread = 0; unreadCount.hidden = true; Promise.all([heartbeat(), loadChat()]).catch((error) => { status.textContent = error.message; }); });
  if (window.MUZIKAZ_DESIGNATED_AVATAR || localStorage.getItem('muzikazDesignatedAvatar')) beginPresence(); else window.addEventListener('muzikaz-avatar-ready', beginPresence, { once:true });
  const timer = setInterval(() => { heartbeat().catch((error) => { status.textContent = error.message; }); loadChat().catch(() => {}); }, 5_000);
  window.addEventListener('pagehide', () => { clearInterval(timer); clearInterval(voiceTimer); const wasJoined=joined; joined=false; window.speechSynthesis?.cancel(); disableMicrophone(); events?.close(); if (wasJoined) navigator.sendBeacon?.(apiUrl(`/api/houses/ioncore-house/presence/leave?sessionId=${encodeURIComponent(sessionId)}`)); });
})();
