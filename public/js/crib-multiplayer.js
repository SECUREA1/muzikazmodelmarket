(() => {
  const root = document.querySelector('#crib-social');
  if (!root || localStorage.getItem('muzikazBottleMember') !== 'true') return;
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
  const emojiToggle = $('#crib-emoji-toggle'), micToggle = $('#crib-mic-toggle'), speakerToggle = $('#crib-speaker-toggle'), voiceStatus = $('#crib-voice-status');
  const headers = { 'Content-Type': 'application/json', 'X-MUZIKAZ-Session': sessionId, 'X-User-Id': email.toLowerCase(), 'X-User-Name': username };
  const peers = new Map(), remoteAudio = new Map();
  window.MUZIKAZ_HOUSE_TRACKING = { roomId:localStorage.getItem('muzikazMultiplayerWorld') || window.MUZIKAZ_HOUSE_TRACKING?.roomId || 'rad-tox', ...(window.MUZIKAZ_HOUSE_TRACKING || {}) };
  let joined = false, localStream = null, speakerOn = true, currentUsers = [];
  const payload = (response) => response?.data ?? response;
  async function jsonResponse(response) { const result = await response.json().catch(() => ({})); if (!response.ok || result.success === false) throw new Error(result.error || result.message || 'The crib server did not respond.'); return payload(result); }
  const text = (value) => document.createTextNode(String(value || ''));

  function renderPresence(data = {}) {
    const roomId = window.MUZIKAZ_HOUSE_TRACKING?.roomId || localStorage.getItem('muzikazMultiplayerWorld') || 'rad-tox';
    currentUsers = (Array.isArray(data.users) ? data.users : []).filter((user) => (user.roomId || 'rad-tox') === roomId);
    count.textContent = `${currentUsers.length} / ${data.capacity || 15}`;
    players.replaceChildren(...currentUsers.map((user) => { const chip = document.createElement('span'); chip.style.setProperty('--player-color', user.color || '#9cff00'); chip.dataset.sessionId = user.sessionId; chip.append(text(user.sessionId === sessionId ? `${user.username} (you)` : user.username)); return chip; }));
    const legacyCount = $('#house-presence-count'); if (legacyCount) legacyCount.textContent = `Live in ${window.MUZIKAZ_HOUSE_TRACKING?.roomId || 'this world'}: ${currentUsers.length} / ${data.capacity || 15}`;
    for (const [id, peer] of peers) if (!currentUsers.some((user) => user.sessionId === id)) { peer.close(); peers.delete(id); remoteAudio.get(id)?.remove(); remoteAudio.delete(id); }
    if (localStream) connectToRoom();
  }
  function addMessage(item) {
    if (!item?.id || [...messages.children].some((message) => message.dataset.messageId === String(item.id))) return;
    const li = document.createElement('li'); li.dataset.messageId = item.id; if (/^(🔥|👏|😂|💚|🎵|⚡)$/.test(item.message)) li.classList.add('is-reaction');
    const name = document.createElement('strong'); name.append(text(item.sessionId === sessionId ? 'You' : item.username));
    const body = document.createElement('span'); body.append(text(item.message)); li.append(name, body); messages.append(li);
    while (messages.children.length > 50) messages.firstElementChild.remove(); messages.scrollTop = messages.scrollHeight;
  }
  async function postMessage(message) { const response = await apiFetch('/api/houses/ioncore-house/chat', { method:'POST', headers, body:JSON.stringify({ message }) }); const data = await jsonResponse(response); window.MUZIKAZ_HOUSE_TRACKING = { ...(window.MUZIKAZ_HOUSE_TRACKING || {}), message }; window.dispatchEvent(new CustomEvent('muzikaz-house-chat', { detail:data })); addMessage(data); }
  async function heartbeat() {
    const avatar = window.MUZIKAZ_DESIGNATED_AVATAR || JSON.parse(localStorage.getItem('muzikazDesignatedAvatar') || 'null');
    if (!avatar) throw new Error('Choose your designated avatar before joining the Crib.');
    const response = await apiFetch('/api/houses/ioncore-house/presence', { method:'POST', headers, body:JSON.stringify({ username, roomId:window.MUZIKAZ_HOUSE_TRACKING?.roomId || 'rad-tox', color, avatarUrl: avatar.modelUrl, modelUrl: avatar.modelUrl, avatarName:avatar.displayName || avatar.name || 'Player avatar', position:window.MUZIKAZ_HOUSE_TRACKING?.position, rotation:window.MUZIKAZ_HOUSE_TRACKING?.rotation, movementState:window.MUZIKAZ_HOUSE_TRACKING?.movementState || 'idle', animationState:window.MUZIKAZ_HOUSE_TRACKING?.animationState || avatar.animation || 'auto', message:window.MUZIKAZ_HOUSE_TRACKING?.message }) });
    const data = await jsonResponse(response); joined = true; renderPresence(data); status.textContent = '';
  }

  async function signal(to, kind, signalPayload = null) { const response = await apiFetch('/api/houses/ioncore-house/voice/signal', { method:'POST', headers, body:JSON.stringify({ to, kind, payload:signalPayload }) }); await jsonResponse(response); }
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
  function connectToRoom() { if (!localStream) return; currentUsers.filter((user) => user.sessionId !== sessionId && sessionId < user.sessionId && !peers.has(user.sessionId)).forEach((user) => makeOffer(user.sessionId).catch(() => {})); }
  async function handleVoiceSignal(data) {
    if (!data?.from || data.to !== sessionId) return;
    if (data.kind === 'hangup') { peers.get(data.from)?.close(); peers.delete(data.from); return; }
    if (!localStream) return;
    const peer = createPeer(data.from);
    if (data.kind === 'offer') { await peer.setRemoteDescription(data.payload); const answer = await peer.createAnswer(); await peer.setLocalDescription(answer); await signal(data.from, 'answer', peer.localDescription); }
    else if (data.kind === 'answer') await peer.setRemoteDescription(data.payload);
    else if (data.kind === 'candidate') await peer.addIceCandidate(data.payload).catch(() => {});
  }
  async function enableMicrophone() {
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) throw new Error('Voice chat is not supported by this browser.');
    localStream = await navigator.mediaDevices.getUserMedia({ audio:{ echoCancellation:true, noiseSuppression:true, autoGainControl:true }, video:false });
    micToggle.classList.add('is-on'); micToggle.setAttribute('aria-pressed', 'true'); micToggle.querySelector('b').textContent = 'Mic on'; voiceStatus.textContent = 'Microphone live · connecting…'; connectToRoom();
  }
  function disableMicrophone() { localStream?.getTracks().forEach((track) => track.stop()); localStream = null; for (const [id, peer] of peers) { signal(id, 'hangup').catch(() => {}); peer.close(); } peers.clear(); micToggle.classList.remove('is-on'); micToggle.setAttribute('aria-pressed', 'false'); micToggle.querySelector('b').textContent = 'Mic off'; voiceStatus.textContent = 'Voice disconnected'; }

  toggle.addEventListener('click', () => { panel.hidden = !panel.hidden; toggle.setAttribute('aria-expanded', String(!panel.hidden)); if (!panel.hidden) input.focus(); });
  panel.querySelector('[data-close-chat]').addEventListener('click', () => { panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); toggle.focus(); });
  form.addEventListener('submit', async (event) => { event.preventDefault(); const message = input.value.trim(); if (!message) return; input.disabled = true; try { await postMessage(message); input.value = ''; status.textContent = ''; } catch (error) { status.textContent = error.message || 'Message could not be sent.'; } finally { input.disabled = false; input.focus(); } });
  emojiToggle.addEventListener('click', () => { const open = reactions.classList.toggle('open'); emojiToggle.setAttribute('aria-expanded', String(open)); });
  reactions.querySelectorAll('button').forEach((button) => button.addEventListener('click', async () => { try { await postMessage(button.textContent.trim()); reactions.classList.remove('open'); emojiToggle.setAttribute('aria-expanded', 'false'); } catch (error) { status.textContent = error.message; } }));
  micToggle.addEventListener('click', async () => { try { if (localStream) disableMicrophone(); else await enableMicrophone(); } catch (error) { disableMicrophone(); voiceStatus.textContent = error.name === 'NotAllowedError' ? 'Microphone permission denied' : error.message; } });
  speakerToggle.addEventListener('click', () => { speakerOn = !speakerOn; remoteAudio.forEach((audio) => { audio.muted = !speakerOn; if (speakerOn) audio.play().catch(() => {}); }); speakerToggle.classList.toggle('is-on', speakerOn); speakerToggle.setAttribute('aria-pressed', String(speakerOn)); speakerToggle.querySelector('b').textContent = speakerOn ? 'Speaker on' : 'Speaker off'; });
  async function loadChat() { const data = await jsonResponse(await apiFetch('/api/houses/ioncore-house/chat', { headers, cache:'no-store' })); (data.messages || []).forEach(addMessage); }
  loadChat().catch(() => {});
  let events;
  if ('EventSource' in window) { events = new EventSource(apiUrl(`/api/houses/ioncore-house/events?sessionId=${encodeURIComponent(sessionId)}`)); events.addEventListener('house-presence-updated', (event) => renderPresence(JSON.parse(event.data))); events.addEventListener('house-chat-message', (event) => addMessage(JSON.parse(event.data))); events.addEventListener('house-voice-signal', (event) => handleVoiceSignal(JSON.parse(event.data)).catch(() => { voiceStatus.textContent = 'Voice connection interrupted'; })); }
  const beginPresence = () => heartbeat().catch((error) => { status.textContent = error.message; toggle.disabled = true; });
  window.addEventListener('muzikaz:multiplayer-world-change', () => { peers.forEach((peer) => peer.close()); peers.clear(); heartbeat().catch((error) => { status.textContent = error.message; }); });
  if (window.MUZIKAZ_DESIGNATED_AVATAR || localStorage.getItem('muzikazDesignatedAvatar')) beginPresence(); else window.addEventListener('muzikaz-avatar-ready', beginPresence, { once:true });
  const timer = setInterval(() => { heartbeat().catch((error) => { status.textContent = error.message; }); loadChat().catch(() => {}); }, 5_000);
  window.addEventListener('pagehide', () => { clearInterval(timer); disableMicrophone(); events?.close(); if (joined) navigator.sendBeacon?.(apiUrl(`/api/houses/ioncore-house/presence/leave?sessionId=${encodeURIComponent(sessionId)}`)); });
})();
