(() => {
  const root = document.querySelector('#crib-social');
  if (!root) return;
  const api = window.MUZIKAZ_SHARED_AVATAR_API || '';
  const apiUrl = (path) => window.MUZIKAZ_API ? window.MUZIKAZ_API.url(path) : `${api}${path}`;
  const apiFetch = (path, options) => window.MUZIKAZ_API ? window.MUZIKAZ_API.fetch(path, options) : fetch(apiUrl(path), options);
  let sessionId = localStorage.getItem('muzikazHouseSessionId');
  if (!sessionId) { sessionId = crypto.randomUUID?.() || `subscriber-${Date.now()}`; localStorage.setItem('muzikazHouseSessionId', sessionId); }
  const memberEmail = localStorage.getItem('muzikazBottleMember') === 'true' ? localStorage.getItem('muzikazBottleMemberEmail') || '' : '';
  let guestName = localStorage.getItem('muzikazMultiplayerGuestName');
  if (!guestName) { guestName = `Guest-${sessionId.slice(-6)}`; localStorage.setItem('muzikazMultiplayerGuestName', guestName); }
  const email = memberEmail || `guest:${sessionId}`;
  const username = (memberEmail ? memberEmail.split('@')[0] : guestName).slice(0, 28) || 'Guest';
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
  const headers = { 'Content-Type': 'application/json', 'X-MUZIKAZ-Session': sessionId, 'X-User-Id': email.toLowerCase(), 'X-User-Name': username };
  const peers = new Map(), remoteAudio = new Map();
  window.MUZIKAZ_HOUSE_TRACKING = { roomId:localStorage.getItem('muzikazMultiplayerWorld') || window.MUZIKAZ_HOUSE_TRACKING?.roomId || 'rad-tox', ...(window.MUZIKAZ_HOUSE_TRACKING || {}) };
  let joined = false, localStream = null, speakerOn = true, currentUsers = [], unread = 0, loadingChat = null, sendingMessage = false;
  const savedTextToSpeech = localStorage.getItem('muzikazChatTextToSpeech');
  // Room messages are audible by default on every client. A listener can still
  // opt out with the Read messages control and that preference is remembered.
  let textToSpeechOn = savedTextToSpeech === null || savedTextToSpeech === 'true';
  let gameScrollY = 0;
  let pageLockStyles = null;
  let lockedShell = null;
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
    ttsToggle.querySelector('b').textContent = textToSpeechOn ? 'Read messages on' : 'Read messages off';
    if (announce) voiceStatus.textContent = textToSpeechOn ? 'Room messages will be read aloud for you' : 'Spoken messages off';
  }
  function speakMessage(item) {
    const activeRoom = window.MUZIKAZ_HOUSE_TRACKING?.roomId || localStorage.getItem('muzikazMultiplayerWorld') || 'rad-tox';
    if (!textToSpeechOn || !item?.message || (item.roomId && item.roomId !== activeRoom) || /^(🔥|👏|😂|💚|🎵|⚡)$/.test(item.message)) return;
    const utterance = new SpeechSynthesisUtterance(`${item.sessionId === sessionId ? 'You' : item.username || 'Player'} says: ${item.message}`);
    utterance.lang = document.documentElement.lang || navigator.language || 'en';
    utterance.rate = 1; utterance.volume = 1;
    // Mobile browsers can leave synthesis paused after the software keyboard or
    // another media session has been active. Resume it before queueing every
    // message; this is harmless on desktop and prevents a successful send from
    // appearing to have silently failed.
    window.speechSynthesis.resume();
    window.speechSynthesis.speak(utterance);
  }

  function unlockMessageAudio() {
    if (!textToSpeechOn || !('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return;
    // Run inside the Send gesture. In particular, iOS requires speech audio to
    // be activated before the asynchronous chat request completes.
    window.speechSynthesis.resume();
    if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
      const unlock = new SpeechSynthesisUtterance(' ');
      unlock.volume = 0;
      window.speechSynthesis.speak(unlock);
    }
  }

  function renderPresence(data = {}) {
    const roomId = window.MUZIKAZ_HOUSE_TRACKING?.roomId || localStorage.getItem('muzikazMultiplayerWorld') || 'rad-tox';
    currentUsers = (Array.isArray(data.users) ? data.users : []).filter((user) => (user.roomId || 'rad-tox') === roomId);
    count.textContent = `${currentUsers.length} / ${data.capacity || 15}`;
    roomName.textContent = roomId.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
    roomCount.textContent = `${currentUsers.length} online`;
    players.replaceChildren(...currentUsers.map((user) => { const chip = document.createElement('span'); chip.style.setProperty('--player-color', user.color || '#9cff00'); chip.dataset.sessionId = user.sessionId; chip.append(text(user.sessionId === sessionId ? `${user.username} (you)` : user.username)); return chip; }));
    const legacyCount = $('#house-presence-count'); if (legacyCount) legacyCount.textContent = `Live in ${window.MUZIKAZ_HOUSE_TRACKING?.roomId || 'this world'}: ${currentUsers.length} / ${data.capacity || 15}`;
    for (const [id, peer] of peers) if (!currentUsers.some((user) => user.sessionId === id)) { peer.close(); peers.delete(id); remoteAudio.get(id)?.remove(); remoteAudio.delete(id); }
    if (localStream) connectToRoom();
    updateSpatialAudio();
  }

  function updateSpatialAudio() {
    const listener = window.MUZIKAZ_HOUSE_TRACKING?.position;
    remoteAudio.forEach((audio, id) => {
      const user = currentUsers.find((candidate) => candidate.sessionId === id);
      const position = user?.position;
      if (!listener || !position) { audio.volume = 1; return; }
      const dx = (Number(position.x) || 0) - (Number(listener.x) || 0);
      const dz = (Number(position.z) || 0) - (Number(listener.z) || 0);
      const distance = Math.hypot(dx, dz);
      // Conversation remains audible throughout the room, while nearby players
      // sound naturally present instead of being abruptly gated by distance.
      audio.volume = Math.max(.35, Math.min(1, 1 / (1 + Math.max(0, distance - 2) * .055)));
    });
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
      const response = await apiFetch('/api/houses/ioncore-house/chat', { method:'POST', headers, body:JSON.stringify({ message:message.slice(0, 140) }) });
      const data = await jsonResponse(response);
      window.MUZIKAZ_HOUSE_TRACKING = { ...(window.MUZIKAZ_HOUSE_TRACKING || {}), message:data.message };
      window.dispatchEvent(new CustomEvent('muzikaz-house-chat', { detail:data }));
      addMessage(data);
      return data;
    } finally { sendingMessage = false; }
  }
  async function heartbeat() {
    let storedAvatar = null;
    try { storedAvatar = JSON.parse(localStorage.getItem('muzikazDesignatedAvatar') || 'null'); } catch { localStorage.removeItem('muzikazDesignatedAvatar'); }
    const avatar = window.MUZIKAZ_DESIGNATED_AVATAR || storedAvatar || { id:'starter-avatar', displayName:'Starter Avatar', modelUrl:'/public/models/avatars/DAX.glb', animation:'auto' };
    const response = await apiFetch('/api/houses/ioncore-house/presence', { method:'POST', headers, body:JSON.stringify({ username, roomId:window.MUZIKAZ_HOUSE_TRACKING?.roomId || 'rad-tox', color, avatarUrl: avatar.modelUrl, modelUrl: avatar.modelUrl, avatarName:avatar.displayName || avatar.name || 'Player avatar', position:window.MUZIKAZ_HOUSE_TRACKING?.position, rotation:window.MUZIKAZ_HOUSE_TRACKING?.rotation, movementState:window.MUZIKAZ_HOUSE_TRACKING?.movementState || 'idle', animationState:window.MUZIKAZ_HOUSE_TRACKING?.animationState || avatar.animation || 'auto', message:window.MUZIKAZ_HOUSE_TRACKING?.message, voiceEnabled:Boolean(localStream) }) });
    const data = await jsonResponse(response); joined = true; renderPresence(data); status.textContent = '';
  }

  async function signal(to, kind, signalPayload = null) { const response = await apiFetch('/api/houses/ioncore-house/voice/signal', { method:'POST', headers, body:JSON.stringify({ to, kind, payload:signalPayload }) }); await jsonResponse(response); }
  function createPeer(remoteId) {
    if (peers.has(remoteId)) return peers.get(remoteId);
    const peer = new RTCPeerConnection({ iceServers:[{ urls:'stun:stun.l.google.com:19302' }, { urls:'stun:stun1.l.google.com:19302' }] });
    localStream?.getTracks().forEach((track) => peer.addTrack(track, localStream));
    peer.onicecandidate = (event) => { if (event.candidate) signal(remoteId, 'candidate', event.candidate).catch(() => {}); };
    peer.ontrack = (event) => { let audio = remoteAudio.get(remoteId); if (!audio) { audio = document.createElement('audio'); audio.autoplay = true; audio.playsInline = true; audio.hidden = true; root.append(audio); remoteAudio.set(remoteId, audio); } audio.srcObject = event.streams[0]; audio.muted = !speakerOn; updateSpatialAudio(); audio.play().catch(() => { voiceStatus.textContent = 'Tap Speaker on to hear voice'; }); };
    peer.onconnectionstatechange = () => { if (peer.connectionState === 'connected') voiceStatus.textContent = `Voice live · ${peers.size} connection${peers.size === 1 ? '' : 's'}`; if (['failed','closed'].includes(peer.connectionState)) { peer.close(); peers.delete(remoteId); } };
    peers.set(remoteId, peer); return peer;
  }
  async function makeOffer(remoteId) { const peer = createPeer(remoteId); const offer = await peer.createOffer(); await peer.setLocalDescription(offer); await signal(remoteId, 'offer', peer.localDescription); }
  function connectToRoom() {
    if (!localStream) return;
    // A talker must offer audio to listeners as well as other talkers. When two
    // microphones are live, the stable session ordering prevents offer glare.
    currentUsers
      .filter((user) => user.sessionId !== sessionId && !peers.has(user.sessionId) && (!user.voiceEnabled || sessionId < user.sessionId))
      .forEach((user) => makeOffer(user.sessionId).catch(() => {}));
  }
  async function handleVoiceSignal(data) {
    if (!data?.from || data.to !== sessionId) return;
    if (data.kind === 'hangup') { peers.get(data.from)?.close(); peers.delete(data.from); return; }
    // Listening never requires microphone permission. A receive-only peer is
    // still created so every person in the room can hear an active talker.
    if (!localStream && data.kind !== 'offer' && !peers.has(data.from)) return;
    const peer = createPeer(data.from);
    if (data.kind === 'offer') { await peer.setRemoteDescription(data.payload); const answer = await peer.createAnswer(); await peer.setLocalDescription(answer); await signal(data.from, 'answer', peer.localDescription); }
    else if (data.kind === 'answer') await peer.setRemoteDescription(data.payload);
    else if (data.kind === 'candidate') await peer.addIceCandidate(data.payload).catch(() => {});
  }
  async function enableMicrophone() {
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) throw new Error('Voice chat is not supported by this browser.');
    localStream = await navigator.mediaDevices.getUserMedia({ audio:{ echoCancellation:true, noiseSuppression:true, autoGainControl:true }, video:false });
    micToggle.classList.add('is-on'); micToggle.setAttribute('aria-pressed', 'true'); micToggle.querySelector('b').textContent = 'Talk on'; voiceStatus.textContent = 'Microphone live · connecting…'; await heartbeat(); connectToRoom();
  }
  function disableMicrophone() { localStream?.getTracks().forEach((track) => track.stop()); localStream = null; for (const [id, peer] of peers) { signal(id, 'hangup').catch(() => {}); peer.close(); } peers.clear(); micToggle.classList.remove('is-on'); micToggle.setAttribute('aria-pressed', 'false'); micToggle.querySelector('b').textContent = 'Talk off'; voiceStatus.textContent = 'Listening to room'; if (joined) heartbeat().catch(() => {}); }

  function syncChatViewport() {
    const viewport = window.visualViewport;
    const viewportTop = viewport?.offsetTop || 0;
    const viewportHeight = viewport?.height || window.innerHeight;
    document.documentElement.style.setProperty('--crib-visual-top', `${Math.round(viewportTop)}px`);
    document.documentElement.style.setProperty('--crib-visual-height', `${Math.round(viewportHeight)}px`);
  }
  function lockGamePage() {
    if (pageLockStyles) return;
    gameScrollY = window.scrollY;
    pageLockStyles = { position:document.body.style.position, top:document.body.style.top, width:document.body.style.width, overflow:document.body.style.overflow };
    document.body.style.position = 'fixed';
    document.body.style.top = `-${gameScrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    lockedShell = document.querySelector('.house-explorer-shell');
    lockedShell?.setAttribute('data-chat-locked', 'true');
  }
  function unlockGamePage() {
    if (!pageLockStyles) return;
    const styles = pageLockStyles;
    pageLockStyles = null;
    Object.assign(document.body.style, styles);
    lockedShell?.removeAttribute('data-chat-locked');
    lockedShell = null;
    window.scrollTo({ top:gameScrollY, left:0, behavior:'instant' });
  }
  function setPanel(open) {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    document.documentElement.classList.toggle('crib-chat-selected', open);
    panel.setAttribute('aria-modal', String(open));
    if (open) {
      lockGamePage();
      const shell = document.querySelector('.house-explorer-shell');
      if (shell) shell.style.setProperty('--crib-locked-game-height', `${Math.round(shell.getBoundingClientRect().height)}px`);
      unread = 0; unreadCount.hidden = true; messages.scrollTop = messages.scrollHeight;
      syncChatViewport();
      input.focus({ preventScroll:true });
    } else {
      document.documentElement.classList.remove('crib-chat-composing');
      document.querySelector('.house-explorer-shell')?.style.removeProperty('--crib-locked-game-height');
      document.documentElement.style.removeProperty('--crib-visual-top');
      document.documentElement.style.removeProperty('--crib-visual-height');
      unlockGamePage();
    }
  }
  function closeChatAndResumeGame() {
    // Closing the chat only restores the already-running game surface; it must
    // never navigate, reload, or rebuild the current multiplayer world.
    setPanel(false);
    const gameCanvas = document.querySelector('#house-explorer-canvas');
    window.requestAnimationFrame(() => gameCanvas?.focus({ preventScroll:true }));
  }
  window.visualViewport?.addEventListener('resize', syncChatViewport);
  window.visualViewport?.addEventListener('scroll', syncChatViewport);
  input.addEventListener('focus', () => { document.documentElement.classList.add('crib-chat-composing'); syncChatViewport(); });
  input.addEventListener('blur', () => document.documentElement.classList.remove('crib-chat-composing'));
  toggle.addEventListener('click', () => setPanel(panel.hidden));
  panel.querySelector('[data-close-chat]').addEventListener('click', () => { setPanel(false); toggle.focus(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !panel.hidden) { setPanel(false); toggle.focus(); } });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message || sendingMessage) return;
    unlockMessageAudio();
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    status.textContent = 'Sending…';
    try {
      await postMessage(message);
      // Clear only the message that finished sending so a newer draft typed
      // while the request was in flight is never lost.
      if (input.value.trim() === message) input.value = '';
      status.textContent = '';
      closeChatAndResumeGame();
    } catch (error) {
      status.textContent = error.message || 'Message could not be sent.';
    } finally {
      submit.disabled = false;
      if (!panel.hidden) input.focus({ preventScroll:true });
    }
  });
  emojiToggle.addEventListener('click', () => { const open = reactions.classList.toggle('open'); emojiToggle.setAttribute('aria-expanded', String(open)); });
  reactions.querySelectorAll('button').forEach((button) => button.addEventListener('click', async () => { if (sendingMessage) return; try { unlockMessageAudio(); await postMessage(button.textContent.trim()); reactions.classList.remove('open'); emojiToggle.setAttribute('aria-expanded', 'false'); closeChatAndResumeGame(); } catch (error) { status.textContent = error.message || 'Reaction could not be sent.'; } }));
  micToggle.addEventListener('click', async () => { try { if (localStream) disableMicrophone(); else await enableMicrophone(); } catch (error) { disableMicrophone(); voiceStatus.textContent = error.name === 'NotAllowedError' ? 'Microphone permission denied' : error.message; } });
  speakerToggle.addEventListener('click', () => { speakerOn = !speakerOn; remoteAudio.forEach((audio) => { audio.muted = !speakerOn; if (speakerOn) audio.play().catch(() => {}); }); speakerToggle.classList.toggle('is-on', speakerOn); speakerToggle.setAttribute('aria-pressed', String(speakerOn)); speakerToggle.querySelector('b').textContent = speakerOn ? 'Speaker on' : 'Speaker off'; });
  const resumeLiveAudio = () => { if (!speakerOn) return; remoteAudio.forEach((audio) => { audio.muted = false; audio.play().catch(() => {}); }); };
  document.addEventListener('pointerdown', resumeLiveAudio, { passive:true });
  document.addEventListener('keydown', resumeLiveAudio);
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
  if ('EventSource' in window) { events = new EventSource(apiUrl(`/api/houses/ioncore-house/events?sessionId=${encodeURIComponent(sessionId)}`)); events.addEventListener('house-presence-updated', (event) => { const data = eventData(event); if (data) renderPresence(data); }); events.addEventListener('house-chat-message', (event) => addMessage(eventData(event))); events.addEventListener('house-voice-signal', (event) => { const data = eventData(event); if (data) handleVoiceSignal(data).catch(() => { voiceStatus.textContent = 'Voice connection interrupted'; }); }); }
  const beginPresence = () => heartbeat().catch((error) => { status.textContent = error.message; toggle.disabled = true; });
  window.addEventListener('muzikaz:multiplayer-world-change', () => { peers.forEach((peer) => peer.close()); peers.clear(); messages.replaceChildren(); unread = 0; unreadCount.hidden = true; Promise.all([heartbeat(), loadChat()]).catch((error) => { status.textContent = error.message; }); });
  // Presence is public: guests use the starter avatar while signed-in members
  // keep their selected Backpack avatar. Do not wait for the 3D engine to load.
  beginPresence();
  const timer = setInterval(() => { heartbeat().catch((error) => { status.textContent = error.message; }); loadChat().catch(() => {}); updateSpatialAudio(); }, 1_000);
  window.addEventListener('pagehide', () => { clearInterval(timer); unlockGamePage(); window.speechSynthesis?.cancel(); disableMicrophone(); events?.close(); if (joined) navigator.sendBeacon?.(apiUrl(`/api/houses/ioncore-house/presence/leave?sessionId=${encodeURIComponent(sessionId)}`)); });
})();
