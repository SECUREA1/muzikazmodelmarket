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
  const toggle = root.querySelector('#crib-chat-toggle');
  const panel = root.querySelector('#crib-chat-panel');
  const count = root.querySelector('#crib-online-count');
  const players = root.querySelector('#crib-player-list');
  const feed = root.querySelector('#crib-chat-messages');
  const history = root.querySelector('#crib-chat-history');
  const form = root.querySelector('#crib-chat-form');
  const input = root.querySelector('#crib-chat-input');
  const status = root.querySelector('#crib-chat-status');
  const seen = new Set();
  let joined = false, sending = false, userScrolled = false, lastSendAt = 0;
  const headers = { 'Content-Type': 'application/json', 'X-MUZIKAZ-Session': sessionId, 'X-User-Id': email.toLowerCase(), 'X-User-Name': username };
  const payload = (response) => response?.data ?? response;
  async function jsonResponse(response) { const result = await response.json().catch(() => ({})); if (!response.ok || result.success === false) throw new Error(result.error || result.message || 'The crib server did not respond.'); return payload(result); }
  const text = (value) => document.createTextNode(String(value || ''));
  function renderPresence(data = {}) {
    count.textContent = `${data.count || 0} / ${data.capacity || 15}`;
    const users = Array.isArray(data.users) ? data.users : [];
    players.replaceChildren(...users.map((user) => { const chip = document.createElement('button'); chip.type = 'button'; chip.style.setProperty('--player-color', user.color || '#9cff00'); chip.dataset.recipientId = user.userId || ''; chip.setAttribute('aria-label', `${user.username}, online`); const dot = document.createElement('i'); const avatar = document.createElement('span'); avatar.textContent = '👤'; avatar.setAttribute('aria-hidden', 'true'); chip.append(avatar, text(user.sessionId === sessionId ? `${user.username} (you) · online` : `${user.username} · online`), dot); return chip; }));
    const legacyCount = document.querySelector('#house-presence-count'); if (legacyCount) legacyCount.textContent = `Live in the house: ${data.count || 0} / ${data.capacity || 15}`;
  }
  function messageNode(item) {
    const li = document.createElement('li'); li.dataset.messageId = String(item.id); li.style.setProperty('--chat-color', item.color || '#9cff00');
    const time = document.createElement('time'); const date = new Date(item.createdAt || Date.now()); time.dateTime = date.toISOString(); time.append(text(date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })));
    const line = document.createElement('span'); const name = document.createElement('strong'); name.append(text(item.sessionId === sessionId ? 'You' : item.username)); line.append(name, text(`: ${item.message}`)); li.append(time, line); return li;
  }
  function addMessage(item) {
    if (!item?.id || seen.has(String(item.id))) return;
    const stickToBottom = !userScrolled || feed.scrollHeight - feed.scrollTop - feed.clientHeight < 24;
    seen.add(String(item.id)); feed.append(messageNode(item)); history.append(messageNode(item));
    while (feed.children.length > 50) feed.firstElementChild.remove();
    while (history.children.length > 100) history.firstElementChild.remove();
    if (stickToBottom) { feed.scrollTop = feed.scrollHeight; history.scrollTop = history.scrollHeight; }
    window.dispatchEvent(new CustomEvent('muzikaz-house-chat', { detail: item }));
  }
  feed.addEventListener('scroll', () => { userScrolled = feed.scrollHeight - feed.scrollTop - feed.clientHeight > 24; }, { passive: true });
  async function heartbeat() {
    const avatar = window.MUZIKAZ_DESIGNATED_AVATAR || JSON.parse(localStorage.getItem('muzikazDesignatedAvatar') || 'null'); if (!avatar) throw new Error('Choose your designated avatar before joining the Crib.');
    const response = await apiFetch('/api/houses/ioncore-house/presence', { method: 'POST', headers, body: JSON.stringify({ roomId: window.MUZIKAZ_HOUSE_TRACKING?.roomId || 'rad-tox', color, avatarUrl: avatar.modelUrl, modelUrl: avatar.modelUrl, position: window.MUZIKAZ_HOUSE_TRACKING?.position, rotation: window.MUZIKAZ_HOUSE_TRACKING?.rotation, message: window.MUZIKAZ_HOUSE_TRACKING?.message }) });
    const data = await jsonResponse(response); joined = true; renderPresence(data); status.textContent = '';
  }
  const typing = (active) => { root.classList.toggle('is-typing', active); window.dispatchEvent(new CustomEvent('muzikaz-chat-focus', { detail: { active } })); if (active && document.pointerLockElement) document.exitPointerLock?.(); };
  input.addEventListener('focus', () => typing(true)); input.addEventListener('blur', () => typing(false));
  input.addEventListener('keydown', (event) => event.stopPropagation()); input.addEventListener('keyup', (event) => event.stopPropagation());
  toggle.addEventListener('click', () => { panel.hidden = !panel.hidden; toggle.setAttribute('aria-expanded', String(!panel.hidden)); if (!panel.hidden) panel.querySelector('[data-close-chat]').focus(); });
  panel.querySelector('[data-close-chat]').addEventListener('click', () => { panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); toggle.focus(); });
  panel.addEventListener('keydown', (event) => { if (event.key === 'Escape') panel.querySelector('[data-close-chat]').click(); });
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); event.stopPropagation(); const message = input.value.trim(); const now = Date.now(); if (!message || sending || now - lastSendAt < 700) return;
    sending = true; lastSendAt = now; form.querySelector('button').disabled = true;
    try { const response = await apiFetch('/api/houses/ioncore-house/chat', { method: 'POST', headers, body: JSON.stringify({ message }) }); const data = await jsonResponse(response); input.value = ''; window.MUZIKAZ_HOUSE_TRACKING = { ...(window.MUZIKAZ_HOUSE_TRACKING || {}), message }; addMessage(data); status.textContent = ''; input.blur(); }
    catch (error) { status.textContent = error.message || 'Message could not be sent.'; }
    finally { sending = false; form.querySelector('button').disabled = false; }
  });
  async function loadChat() { const data = await jsonResponse(await apiFetch('/api/houses/ioncore-house/chat', { headers, cache: 'no-store' })); (data.messages || []).forEach(addMessage); }
  loadChat().catch(() => {});
  let events; if ('EventSource' in window) { events = new EventSource(apiUrl(`/api/houses/ioncore-house/events?sessionId=${encodeURIComponent(sessionId)}`)); events.addEventListener('house-presence-updated', (event) => renderPresence(JSON.parse(event.data))); events.addEventListener('house-chat-message', (event) => addMessage(JSON.parse(event.data))); }
  const beginPresence = () => heartbeat().catch((error) => { status.textContent = error.message; toggle.disabled = true; });
  if (window.MUZIKAZ_DESIGNATED_AVATAR || localStorage.getItem('muzikazDesignatedAvatar')) beginPresence(); else window.addEventListener('muzikaz-avatar-ready', beginPresence, { once: true });
  const timer = setInterval(() => { heartbeat().catch((error) => { status.textContent = error.message; }); loadChat().catch(() => {}); }, 5_000);
  window.addEventListener('pagehide', () => { clearInterval(timer); events?.close(); if (joined) navigator.sendBeacon?.(apiUrl(`/api/houses/ioncore-house/presence/leave?sessionId=${encodeURIComponent(sessionId)}`)); });
})();
