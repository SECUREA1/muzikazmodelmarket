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
  const emojiToggle = $('#crib-emoji-toggle'), micToggle = $('#crib-mic-toggle'), speakerToggle = $('#crib-speaker-toggle'), speakerTest = $('#crib-speaker-test'), voiceStatus = $('#crib-voice-status');
  const audioSettingsToggle = $('#crib-audio-settings-toggle'), audioSettings = $('#crib-audio-settings');
  const micDevice = $('#crib-mic-device'), speakerDevice = $('#crib-speaker-device'), speakerVolume = $('#crib-speaker-volume'), volumeValue = $('#crib-volume-value');
  const headers = { 'Content-Type': 'application/json', 'X-MUZIKAZ-Session': sessionId, 'X-User-Id': email.toLowerCase(), 'X-User-Name': username };
  const peers = new Map(), remoteAudio = new Map(), pendingCandidates = new Map(), reconnectTimers = new Map();
  let joined = false, localStream = null, speakerOn = true, currentUsers = [];
  const payload = (response) => response?.data ?? response;
  async function jsonResponse(response) { const result = await response.json().catch(() => ({})); if (!response.ok || result.success === false) throw new Error(result.error || result.message || 'The crib server did not respond.'); return payload(result); }
  const text = (value) => document.createTextNode(String(value || ''));
  const rtcConfig = {
    iceServers: Array.isArray(window.MUZIKAZ_ICE_SERVERS) && window.MUZIKAZ_ICE_SERVERS.length
      ? window.MUZIKAZ_ICE_SERVERS
      : [{ urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302'] }],
    bundlePolicy:'max-bundle', iceCandidatePoolSize:4
  };

  function removePeer(remoteId) {
    clearTimeout(reconnectTimers.get(remoteId)); reconnectTimers.delete(remoteId);
    peers.get(remoteId)?.close(); peers.delete(remoteId); pendingCandidates.delete(remoteId);
    remoteAudio.get(remoteId)?.remove(); remoteAudio.delete(remoteId);
  }
  async function playRemoteAudio(audio) {
    audio.muted = !speakerOn; audio.volume = Number(speakerVolume.value);
    if (!speakerOn) return;
    try { await audio.play(); } catch { voiceStatus.textContent = 'Tap Speaker on to allow audio playback'; }
  }

  function renderPresence(data = {}) {
    count.textContent = `${data.count || 0} / ${data.capacity || 15}`;
    currentUsers = Array.isArray(data.users) ? data.users : [];
    players.replaceChildren(...currentUsers.map((user) => { const chip = document.createElement('span'); chip.style.setProperty('--player-color', user.color || '#9cff00'); chip.dataset.sessionId = user.sessionId; chip.append(text(user.sessionId === sessionId ? `${user.username} (you)` : user.username)); return chip; }));
    const legacyCount = $('#house-presence-count'); if (legacyCount) legacyCount.textContent = `Live in the house: ${data.count || 0} / ${data.capacity || 15}`;
    for (const id of peers.keys()) if (!currentUsers.some((user) => user.sessionId === id)) removePeer(id);
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
    const peer = new RTCPeerConnection(rtcConfig);
    localStream?.getTracks().forEach((track) => peer.addTrack(track, localStream));
    peer.onicecandidate = (event) => { if (event.candidate) signal(remoteId, 'candidate', event.candidate).catch(() => {}); };
    peer.ontrack = (event) => { let audio = remoteAudio.get(remoteId); if (!audio) { audio = document.createElement('audio'); audio.autoplay = true; audio.playsInline = true; audio.hidden = true; if (typeof audio.setSinkId === 'function' && speakerDevice.value) audio.setSinkId(speakerDevice.value).catch(() => {}); root.append(audio); remoteAudio.set(remoteId, audio); } audio.srcObject = event.streams[0] || new MediaStream([event.track]); playRemoteAudio(audio); };
    peer.onconnectionstatechange = () => {
      clearTimeout(reconnectTimers.get(remoteId));
      if (peer.connectionState === 'connected') voiceStatus.textContent = `Voice live · ${peers.size} connection${peers.size === 1 ? '' : 's'}`;
      if (peer.connectionState === 'disconnected') reconnectTimers.set(remoteId, setTimeout(() => { if (peer.connectionState === 'disconnected' && sessionId < remoteId) makeOffer(remoteId, true).catch(() => removePeer(remoteId)); }, 2500));
      if (peer.connectionState === 'failed') { if (sessionId < remoteId) makeOffer(remoteId, true).catch(() => removePeer(remoteId)); else voiceStatus.textContent = 'Voice reconnecting…'; }
      if (peer.connectionState === 'closed') removePeer(remoteId);
    };
    peers.set(remoteId, peer); return peer;
  }
  async function makeOffer(remoteId, iceRestart = false) { const peer = createPeer(remoteId); const offer = await peer.createOffer({ iceRestart }); await peer.setLocalDescription(offer); await signal(remoteId, 'offer', peer.localDescription); }
  function connectToRoom() { if (!localStream) return; currentUsers.filter((user) => user.sessionId !== sessionId && sessionId < user.sessionId && !peers.has(user.sessionId)).forEach((user) => makeOffer(user.sessionId).catch(() => {})); }
  async function handleVoiceSignal(data) {
    if (!data?.from || data.to !== sessionId) return;
    if (data.kind === 'hangup') { removePeer(data.from); return; }
    if (!localStream) return;
    const peer = createPeer(data.from);
    if (data.kind === 'offer') { await peer.setRemoteDescription(data.payload); await flushCandidates(data.from, peer); const answer = await peer.createAnswer(); await peer.setLocalDescription(answer); await signal(data.from, 'answer', peer.localDescription); }
    else if (data.kind === 'answer') { await peer.setRemoteDescription(data.payload); await flushCandidates(data.from, peer); }
    else if (data.kind === 'candidate') { if (peer.remoteDescription) await peer.addIceCandidate(data.payload); else pendingCandidates.set(data.from, [...(pendingCandidates.get(data.from) || []), data.payload]); }
  }
  async function flushCandidates(remoteId, peer) { const candidates = pendingCandidates.get(remoteId) || []; pendingCandidates.delete(remoteId); for (const candidate of candidates) await peer.addIceCandidate(candidate).catch(() => {}); }
  async function enableMicrophone() {
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) throw new Error('Voice chat is not supported by this browser.');
    if (!window.isSecureContext) throw new Error('Microphone access requires HTTPS.');
    const audio = { deviceId:micDevice.value ? { ideal:micDevice.value } : undefined, echoCancellation:$('#crib-echo-cancellation').checked, noiseSuppression:$('#crib-noise-suppression').checked, autoGainControl:$('#crib-auto-gain').checked };
    try { localStream = await navigator.mediaDevices.getUserMedia({ audio, video:false }); } catch (error) { if (error.name !== 'OverconstrainedError') throw error; localStream = await navigator.mediaDevices.getUserMedia({ audio:true, video:false }); }
    micToggle.classList.add('is-on'); micToggle.setAttribute('aria-pressed', 'true'); micToggle.querySelector('b').textContent = 'Mic on'; voiceStatus.textContent = 'Microphone live · connecting…'; connectToRoom();
    await refreshAudioDevices();
  }
  function disableMicrophone() { localStream?.getTracks().forEach((track) => track.stop()); localStream = null; for (const id of [...peers.keys()]) { signal(id, 'hangup').catch(() => {}); removePeer(id); } micToggle.classList.remove('is-on'); micToggle.setAttribute('aria-pressed', 'false'); micToggle.querySelector('b').textContent = 'Mic off'; voiceStatus.textContent = 'Voice disconnected'; }

  toggle.addEventListener('click', () => { panel.hidden = !panel.hidden; toggle.setAttribute('aria-expanded', String(!panel.hidden)); if (!panel.hidden) input.focus(); });
  panel.querySelector('[data-close-chat]').addEventListener('click', () => { panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); toggle.focus(); });
  form.addEventListener('submit', async (event) => { event.preventDefault(); const message = input.value.trim(); if (!message) return; input.disabled = true; try { await postMessage(message); input.value = ''; status.textContent = ''; } catch (error) { status.textContent = error.message || 'Message could not be sent.'; } finally { input.disabled = false; input.focus(); } });
  emojiToggle.addEventListener('click', () => { const open = reactions.classList.toggle('open'); emojiToggle.setAttribute('aria-expanded', String(open)); });
  reactions.querySelectorAll('button').forEach((button) => button.addEventListener('click', async () => { try { await postMessage(button.textContent.trim()); reactions.classList.remove('open'); emojiToggle.setAttribute('aria-expanded', 'false'); } catch (error) { status.textContent = error.message; } }));
  micToggle.addEventListener('click', async () => { try { if (localStream) disableMicrophone(); else await enableMicrophone(); } catch (error) { disableMicrophone(); voiceStatus.textContent = error.name === 'NotAllowedError' ? 'Microphone permission denied' : error.message; } });
  speakerToggle.addEventListener('click', () => { speakerOn = !speakerOn; remoteAudio.forEach((audio) => { audio.muted = !speakerOn; if (speakerOn) audio.play().catch(() => {}); }); speakerToggle.classList.toggle('is-on', speakerOn); speakerToggle.setAttribute('aria-pressed', String(speakerOn)); speakerToggle.querySelector('b').textContent = speakerOn ? 'Speaker on' : 'Speaker off'; });
  speakerTest.addEventListener('click', async () => { try { const AudioContext = window.AudioContext || window.webkitAudioContext; if (!AudioContext) throw new Error('Speaker test is not supported by this browser.'); const context = new AudioContext(); await context.resume(); const oscillator = context.createOscillator(), gain = context.createGain(); oscillator.frequency.value = 660; gain.gain.setValueAtTime(.12, context.currentTime); gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + .35); oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + .36); oscillator.onended = () => context.close(); speakerOn = true; speakerToggle.classList.add('is-on'); speakerToggle.setAttribute('aria-pressed', 'true'); speakerToggle.querySelector('b').textContent = 'Speaker on'; remoteAudio.forEach(playRemoteAudio); voiceStatus.textContent = 'Speaker connected · test tone played'; } catch (error) { voiceStatus.textContent = error.message; } });
  async function refreshAudioDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const fill = (select, kind, fallback) => { const selected = select.value; select.replaceChildren(new Option(fallback, ''), ...devices.filter((device) => device.kind === kind).map((device, index) => new Option(device.label || `${fallback} ${index + 1}`, device.deviceId))); select.value = [...select.options].some((option) => option.value === selected) ? selected : ''; };
    fill(micDevice, 'audioinput', 'Default microphone'); fill(speakerDevice, 'audiooutput', 'Default speaker');
    $('#crib-device-note').textContent = devices.some((device) => device.label) ? 'Changes apply to this voice-chat session.' : 'Device names appear after microphone permission is granted.';
  }
  audioSettingsToggle.addEventListener('click', () => { audioSettings.hidden = !audioSettings.hidden; audioSettingsToggle.setAttribute('aria-expanded', String(!audioSettings.hidden)); if (!audioSettings.hidden) refreshAudioDevices().catch(() => {}); });
  speakerVolume.addEventListener('input', () => { const volume = Number(speakerVolume.value); volumeValue.value = `${Math.round(volume * 100)}%`; remoteAudio.forEach((audio) => { audio.volume = volume; }); });
  speakerDevice.addEventListener('change', () => { remoteAudio.forEach((audio) => { if (typeof audio.setSinkId === 'function') audio.setSinkId(speakerDevice.value).catch(() => { voiceStatus.textContent = 'Speaker selection is not supported here'; }); }); });
  micDevice.addEventListener('change', async () => { if (!localStream) return; disableMicrophone(); try { await enableMicrophone(); } catch (error) { voiceStatus.textContent = error.message; } });
  navigator.mediaDevices?.addEventListener?.('devicechange', () => refreshAudioDevices().catch(() => {}));
  document.addEventListener('visibilitychange', () => { if (!document.hidden && speakerOn) remoteAudio.forEach(playRemoteAudio); });
  ['crib-echo-cancellation','crib-noise-suppression','crib-auto-gain'].forEach((id) => $(`#${id}`).addEventListener('change', async () => { if (!localStream) return; const track = localStream.getAudioTracks()[0]; await track?.applyConstraints({ echoCancellation:$('#crib-echo-cancellation').checked, noiseSuppression:$('#crib-noise-suppression').checked, autoGainControl:$('#crib-auto-gain').checked }).catch(() => { voiceStatus.textContent = 'Some audio processing is unavailable'; }); }));
  async function loadChat() { const data = await jsonResponse(await apiFetch('/api/houses/ioncore-house/chat', { headers, cache:'no-store' })); (data.messages || []).forEach(addMessage); }
  loadChat().catch(() => {});
  let events;
  if ('EventSource' in window) { events = new EventSource(apiUrl(`/api/houses/ioncore-house/events?sessionId=${encodeURIComponent(sessionId)}`)); events.addEventListener('house-presence-updated', (event) => renderPresence(JSON.parse(event.data))); events.addEventListener('house-chat-message', (event) => addMessage(JSON.parse(event.data))); events.addEventListener('house-voice-signal', (event) => handleVoiceSignal(JSON.parse(event.data)).catch(() => { voiceStatus.textContent = 'Voice connection interrupted'; })); }
  const beginPresence = () => heartbeat().catch((error) => { status.textContent = error.message; toggle.disabled = true; });
  if (window.MUZIKAZ_DESIGNATED_AVATAR || localStorage.getItem('muzikazDesignatedAvatar')) beginPresence(); else window.addEventListener('muzikaz-avatar-ready', beginPresence, { once:true });
  const timer = setInterval(() => { heartbeat().catch((error) => { status.textContent = error.message; }); loadChat().catch(() => {}); }, 5_000);
  window.addEventListener('pagehide', () => { clearInterval(timer); disableMicrophone(); events?.close(); if (joined) navigator.sendBeacon?.(apiUrl(`/api/houses/ioncore-house/presence/leave?sessionId=${encodeURIComponent(sessionId)}`)); });
})();
