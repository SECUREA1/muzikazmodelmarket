(() => {
  const root = document.querySelector('#crib-social');
  if (!root || localStorage.getItem('muzikazBottleMember') !== 'true') return;
  const api = window.MUZIKAZ_SHARED_AVATAR_API || '';
  const apiUrl = (path) => window.MUZIKAZ_API ? window.MUZIKAZ_API.url(path) : `${api}${path}`;
  const apiFetch = (path, options) => window.MUZIKAZ_API ? window.MUZIKAZ_API.fetch(path, options) : fetch(apiUrl(path), options);
  const sessionKey = 'muzikazHouseSessionId';
  let sessionId = localStorage.getItem(sessionKey);
  if (!sessionId) { sessionId = crypto.randomUUID?.() || `subscriber-${Date.now()}`; localStorage.setItem(sessionKey, sessionId); }
  const email = localStorage.getItem('muzikazBottleMemberEmail') || 'Subscriber';
  const username = email.split('@')[0].slice(0, 28) || 'Subscriber';
  const color = `hsl(${[...sessionId].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360} 85% 65%)`;
  const $ = (selector) => document.querySelector(selector);
  const toggle = $('#crib-chat-toggle'), profileToggle = $('#crib-profile-toggle');
  const panel = $('#crib-chat-panel'), userPanel = $('#crib-user-panel');
  const count = $('#crib-online-count'), players = $('#crib-player-list'), userList = $('#crib-user-list'), userDetail = $('#crib-user-detail');
  const messages = $('#crib-chat-messages'), form = $('#crib-chat-form'), input = $('#crib-chat-input');
  const messageBar = $('#crib-message-bar'), messageInput = $('#crib-message-input'), status = $('#crib-chat-status');
  const announcer = $('#crib-message-announcer'), unreadBadge = $('#crib-user-unread');
  const inputs = [input, messageInput], forms = [form, messageBar];
  const seen = new Set();
  let joined = false, sending = false, connected = navigator.onLine, currentUsers = [], unread = 0;
  const headers = { 'Content-Type': 'application/json', 'X-MUZIKAZ-Session': sessionId, 'X-User-Id': email.toLowerCase(), 'X-User-Name': username };
  const payload = (response) => response?.data ?? response;
  const safeSession = { get(key, fallback = '') { try { return sessionStorage.getItem(key) ?? fallback; } catch (_) { return fallback; } }, set(key, value) { try { sessionStorage.setItem(key, value); } catch (_) {} } };
  async function jsonResponse(response) { const result = await response.json().catch(() => ({})); if (!response.ok || result.success === false) throw new Error(result.error || result.message || 'The crib server did not respond.'); return payload(result); }
  const text = (value) => document.createTextNode(String(value || ''));
  const avatar = () => window.MUZIKAZ_DESIGNATED_AVATAR || JSON.parse(localStorage.getItem('muzikazDesignatedAvatar') || 'null');
  function setConnected(value, notice = '') { connected = value; inputs.forEach((node) => { node.disabled = !value || sending; }); forms.forEach((node) => node.querySelector('button').disabled = !value || sending); root.classList.toggle('is-disconnected', !value); if (notice) status.textContent = notice; }
  function saveDraft(value) { safeSession.set('muzikazCribChatDraft', value); inputs.forEach((node) => { if (node !== document.activeElement) node.value = value; }); }
  function setPanel(open) { panel.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); safeSession.set('muzikazCribChatOpen', String(open)); if (open) { unread = 0; unreadBadge.hidden = true; window.setTimeout(() => input.focus({ preventScroll: true }), 0); } }
  function setUsersPanel(open) { userPanel.hidden = !open; profileToggle.setAttribute('aria-expanded', String(open)); safeSession.set('muzikazCribUsersOpen', String(open)); }
  function openUser(user) { safeSession.set('muzikazCribSelectedUser', user.sessionId); userDetail.hidden = false; userDetail.replaceChildren(); const image = document.createElement('img'); image.src = user.avatarUrl || 'logo_symbol_crop_2x_transparent.png'; image.alt = ''; const copy = document.createElement('div'); const title = document.createElement('strong'); title.append(text(user.sessionId === sessionId ? `${user.username} (you)` : user.username)); const handle = document.createElement('small'); handle.append(text(`@${user.username} · Online`)); const model = document.createElement('span'); model.append(text(user.avatarName || (user.avatarUrl || '').split('/').pop() || 'Selected GLB avatar')); const recent = document.createElement('p'); const own = [...messages.children].filter((item) => item.dataset.sessionId === user.sessionId).slice(-3).map((item) => item.dataset.plainMessage); recent.append(text(own.length ? `Recent: ${own.join(' · ')}` : 'No recent room messages.')); copy.append(title, handle, model, recent); userDetail.append(image, copy); }
  function renderPresence(data = {}) {
    currentUsers = Array.isArray(data.users) ? data.users : [];
    count.textContent = `${data.count || 0} / ${data.capacity || 15}`;
    players.replaceChildren(...currentUsers.map((user) => { const chip = document.createElement('button'); chip.type = 'button'; chip.style.setProperty('--player-color', user.color || '#9cff00'); chip.append(text(user.sessionId === sessionId ? `${user.username} (you)` : user.username)); chip.addEventListener('click', () => { openUser(user); setUsersPanel(true); }); return chip; }));
    userList.replaceChildren(...currentUsers.map((user) => { const li = document.createElement('li'), button = document.createElement('button'), image = document.createElement('img'), copy = document.createElement('span'), name = document.createElement('strong'), meta = document.createElement('small'); button.type = 'button'; image.src = user.avatarUrl || 'logo_symbol_crop_2x_transparent.png'; image.alt = ''; name.append(text(user.sessionId === sessionId ? `${user.username} (you)` : user.username)); meta.append(text(`@${user.username} · Online · ${user.avatarName || (user.avatarUrl || '').split('/').pop() || 'GLB avatar'}`)); copy.append(name, meta); button.append(image, copy); button.addEventListener('click', () => openUser(user)); li.append(button); return li; }));
    const selected = safeSession.get('muzikazCribSelectedUser'); if (selected) { const user = currentUsers.find((item) => item.sessionId === selected); if (user) openUser(user); else userDetail.hidden = true; }
    const legacyCount = $('#house-presence-count'); if (legacyCount) legacyCount.textContent = `Live in the house: ${data.count || 0} / ${data.capacity || 15}`;
  }
  function addMessage(item) {
    if (!item?.id || seen.has(String(item.id))) return; seen.add(String(item.id));
    const nearBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 45;
    const li = document.createElement('li'); li.dataset.messageId = item.id; li.dataset.sessionId = item.sessionId || item.senderId || ''; li.dataset.plainMessage = item.message || '';
    const user = currentUsers.find((entry) => entry.sessionId === li.dataset.sessionId); const image = document.createElement('img'); image.src = user?.avatarUrl || 'logo_symbol_crop_2x_transparent.png'; image.alt = '';
    const content = document.createElement('div'), line = document.createElement('span'), name = document.createElement('strong'), time = document.createElement('time'), body = document.createElement('p');
    name.append(text(li.dataset.sessionId === sessionId ? 'You' : item.displayName || item.username)); const date = new Date(item.timestamp || item.createdAt || Date.now()); time.dateTime = date.toISOString(); time.append(text(date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))); body.append(text(item.message)); line.append(name, time); content.append(line, body); li.append(image, content); messages.append(li);
    while (messages.children.length > 100) messages.firstElementChild.remove(); if (nearBottom) messages.scrollTop = messages.scrollHeight;
    if (li.dataset.sessionId !== sessionId && panel.hidden) { unread += 1; unreadBadge.textContent = String(unread); unreadBadge.hidden = false; }
    window.dispatchEvent(new CustomEvent('muzikaz-house-chat', { detail: item }));
  }
  async function heartbeat() { const selectedAvatar = avatar(); if (!selectedAvatar) throw new Error('Choose your designated avatar before joining the Crib.'); const response = await apiFetch('/api/houses/ioncore-house/presence', { method: 'POST', headers, body: JSON.stringify({ username, roomId: window.MUZIKAZ_HOUSE_TRACKING?.roomId || 'rad-tox', color, avatarUrl: selectedAvatar.modelUrl, modelUrl: selectedAvatar.modelUrl, avatarName: selectedAvatar.displayName || selectedAvatar.name || 'Player avatar', position: window.MUZIKAZ_HOUSE_TRACKING?.position, rotation: window.MUZIKAZ_HOUSE_TRACKING?.rotation, movementState: window.MUZIKAZ_HOUSE_TRACKING?.movementState || 'idle', animationState: window.MUZIKAZ_HOUSE_TRACKING?.animationState || selectedAvatar.animation || 'auto', message: Number(window.MUZIKAZ_HOUSE_TRACKING?.messageExpiresAt) > Date.now() ? window.MUZIKAZ_HOUSE_TRACKING.message : '' }) }); const data = await jsonResponse(response); joined = true; renderPresence(data); setConnected(true); status.textContent = ''; }
  async function sendMessage(source) { const message = source.value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, 140); if (!message || sending || !connected) return; sending = true; setConnected(true); try { const response = await apiFetch('/api/houses/ioncore-house/chat', { method: 'POST', headers, body: JSON.stringify({ message, recipientId: null }) }); const data = await jsonResponse(response); inputs.forEach((node) => { node.value = ''; }); saveDraft(''); window.MUZIKAZ_HOUSE_TRACKING = { ...(window.MUZIKAZ_HOUSE_TRACKING || {}), message, messageExpiresAt: Date.now() + 7000 }; addMessage(data); status.textContent = ''; announcer.textContent = 'Message sent'; } catch (error) { saveDraft(message); status.textContent = error.message || 'Message could not be sent.'; announcer.textContent = 'Message not sent'; } finally { sending = false; setConnected(navigator.onLine); if (source === input && !panel.hidden) source.focus({ preventScroll: true }); } }
  forms.forEach((chatForm, index) => chatForm.addEventListener('submit', (event) => { event.preventDefault(); sendMessage(inputs[index]); }));
  inputs.forEach((node) => { node.value = safeSession.get('muzikazCribChatDraft'); node.addEventListener('input', () => saveDraft(node.value.slice(0, 140))); node.addEventListener('keydown', (event) => event.stopPropagation()); node.addEventListener('keyup', (event) => event.stopPropagation()); });
  toggle.addEventListener('click', () => setPanel(panel.hidden)); profileToggle.addEventListener('click', () => setUsersPanel(userPanel.hidden));
  panel.querySelector('[data-close-chat]').addEventListener('click', () => { setPanel(false); toggle.focus(); }); userPanel.querySelector('[data-close-users]').addEventListener('click', () => { setUsersPanel(false); profileToggle.focus(); });
  async function loadChat() { const response = await apiFetch('/api/houses/ioncore-house/chat', { headers, cache: 'no-store' }); const data = await jsonResponse(response); (data.messages || []).forEach(addMessage); }
  setPanel(safeSession.get('muzikazCribChatOpen', 'false') === 'true'); setUsersPanel(safeSession.get('muzikazCribUsersOpen', 'false') === 'true'); setConnected(navigator.onLine, navigator.onLine ? '' : 'Chat is offline. Reconnecting…');
  window.addEventListener('online', () => { setConnected(true, 'Reconnecting…'); heartbeat().then(loadChat).catch(() => setConnected(false, 'Chat is reconnecting…')); }); window.addEventListener('offline', () => setConnected(false, 'Chat is offline. Your draft is safe.'));
  if (window.visualViewport) { const resize = () => document.documentElement.style.setProperty('--crib-keyboard-offset', `${Math.max(0, window.innerHeight - visualViewport.height - visualViewport.offsetTop)}px`); visualViewport.addEventListener('resize', resize); visualViewport.addEventListener('scroll', resize); resize(); }
  loadChat().catch(() => {}); let events;
  if ('EventSource' in window) { events = new EventSource(apiUrl(`/api/houses/ioncore-house/events?sessionId=${encodeURIComponent(sessionId)}`)); events.addEventListener('house-presence-updated', (event) => renderPresence(JSON.parse(event.data))); events.addEventListener('house-chat-message', (event) => addMessage(JSON.parse(event.data))); events.addEventListener('open', () => setConnected(true)); events.addEventListener('error', () => setConnected(false, 'Chat is reconnecting…')); }
  const beginPresence = () => heartbeat().catch((error) => { setConnected(false, error.message); }); if (avatar()) beginPresence(); else window.addEventListener('muzikaz-avatar-ready', beginPresence, { once: true });
  const timer = setInterval(() => { heartbeat().catch(() => setConnected(false, 'Chat is reconnecting…')); if (!events || events.readyState === 2) loadChat().catch(() => {}); }, 5_000);
  window.addEventListener('pagehide', () => { clearInterval(timer); events?.close(); if (joined) navigator.sendBeacon?.(apiUrl(`/api/houses/ioncore-house/presence/leave?sessionId=${encodeURIComponent(sessionId)}`)); });
})();
