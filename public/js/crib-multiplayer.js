(() => {
  const root = document.querySelector('#crib-social');
  if (!root || localStorage.getItem('muzikazBottleMember') !== 'true') return;
  const apiClient = window.MUZIKAZ_API;
  if (!apiClient) throw new Error('The unified MUZIKAZ API client must load before multiplayer.');
  const apiUrl = apiClient.url;
  const apiFetch = apiClient.fetch;
  const sessionKey = 'muzikazHouseSessionId';
  let sessionId = localStorage.getItem(sessionKey);
  if (!sessionId) { sessionId = crypto.randomUUID?.() || `subscriber-${Date.now()}`; localStorage.setItem(sessionKey, sessionId); }
  const email = localStorage.getItem('muzikazBottleMemberEmail') || 'Subscriber';
  const username = email.split('@')[0].slice(0, 28) || 'Subscriber';
  const color = `hsl(${[...sessionId].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360} 85% 65%)`;
  const toggle = document.querySelector('#crib-chat-toggle');
  const panel = document.querySelector('#crib-chat-panel');
  const count = document.querySelector('#crib-online-count');
  const players = document.querySelector('#crib-player-list');
  const messageLists = [...document.querySelectorAll('#crib-chat-messages, #crib-dock-messages')];
  const forms = [...document.querySelectorAll('#crib-chat-form, #crib-dock-form')];
  const statuses = [...document.querySelectorAll('#crib-chat-status, #crib-dock-status')];
  const setStatus = (message = '') => statuses.forEach((node) => { node.textContent = message; });
  let joined = false;

  const headers = { 'Content-Type': 'application/json', 'X-MUZIKAZ-Session': sessionId, 'X-User-Id': email.toLowerCase(), 'X-User-Name': username };
  const payload = (response) => response?.data ?? response;
  async function jsonResponse(response) {
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.success === false) throw new Error(result.error || result.message || 'The crib server did not respond.');
    return payload(result);
  }
  const text = (value) => document.createTextNode(String(value || ''));
  function renderPresence(data = {}) {
    count.textContent = `${data.count || 0} / ${data.capacity || 15}`;
    const dockCount = document.querySelector('#crib-dock-online-count');
    if (dockCount) dockCount.textContent = `${data.count || 0} / ${data.capacity || 15} online`;
    const users = Array.isArray(data.users) ? data.users : [];
    players.replaceChildren(...users.map((user) => { const chip = document.createElement('span'); chip.style.setProperty('--player-color', user.color || '#9cff00'); chip.append(text(user.sessionId === sessionId ? `${user.username} (you)` : user.username)); return chip; }));
    const legacyCount = document.querySelector('#house-presence-count');
    if (legacyCount) legacyCount.textContent = `Live in the house: ${data.count || 0} / ${data.capacity || 15}`;
  }
  function addMessage(item) {
    if (!item?.id || messageLists.some((list) => [...list.children].some((message) => message.dataset.messageId === String(item.id)))) return;
    messageLists.forEach((messages) => {
      const li = document.createElement('li'); li.dataset.messageId = item.id;
      const name = document.createElement('strong'); name.append(text(item.sessionId === sessionId ? 'You' : item.username));
      const body = document.createElement('span'); body.append(text(item.message)); li.append(name, body); messages.append(li);
      while (messages.children.length > 50) messages.firstElementChild.remove(); messages.scrollTop = messages.scrollHeight;
    });
    window.dispatchEvent(new CustomEvent('muzikaz-house-chat', { detail: item }));
  }
  async function heartbeat() {
    const avatar = window.MUZIKAZ_DESIGNATED_AVATAR || JSON.parse(localStorage.getItem('muzikazDesignatedAvatar') || 'null');
    if (!avatar) throw new Error('Choose your designated avatar before joining the Crib.');
    const response = await apiFetch('/api/houses/ioncore-house/presence', { method: 'POST', headers, body: JSON.stringify({ username, roomId: window.MUZIKAZ_HOUSE_TRACKING?.roomId || 'rad-tox', color, avatarUrl: avatar.modelUrl, modelUrl: avatar.modelUrl, avatarName: avatar.displayName || avatar.name || 'Player avatar', position: window.MUZIKAZ_HOUSE_TRACKING?.position, rotation: window.MUZIKAZ_HOUSE_TRACKING?.rotation, movementState: window.MUZIKAZ_HOUSE_TRACKING?.movementState || 'idle', animationState: window.MUZIKAZ_HOUSE_TRACKING?.animationState || avatar.animation || 'auto', message: window.MUZIKAZ_HOUSE_TRACKING?.message }) });
    const data = await jsonResponse(response); joined = true; renderPresence(data); setStatus();
  }
  // The dock button is deliberately an opener only. Closing is an explicit
  // action inside the panel, so an accidental second tap cannot hide chat.
  toggle?.addEventListener('click', () => { panel.hidden = false; toggle.setAttribute('aria-expanded', 'true'); panel.querySelector('input')?.focus(); });
  panel.querySelector('[data-close-chat]').addEventListener('click', () => { panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); toggle.focus(); });
  forms.forEach((form) => form.addEventListener('submit', async (event) => { event.preventDefault(); const input = form.querySelector('input'); const message = input.value.trim(); if (!message) return; input.disabled = true; try { const response = await apiFetch('/api/houses/ioncore-house/chat', { method: 'POST', headers, body: JSON.stringify({ message }) }); const data = await jsonResponse(response); document.querySelectorAll('#crib-chat-input, #crib-dock-input').forEach((field) => { field.value = ''; }); window.MUZIKAZ_HOUSE_TRACKING = { ...(window.MUZIKAZ_HOUSE_TRACKING || {}), message }; addMessage(data); setStatus(); } catch (error) { setStatus(error.message || 'Message could not be sent.'); } finally { input.disabled = false; input.focus(); } }));
  async function loadChat() { const response = await apiFetch('/api/houses/ioncore-house/chat', { headers, cache: 'no-store' }); const data = await jsonResponse(response); (data.messages || []).forEach(addMessage); }
  loadChat().catch(() => {});
  let events;
  if ('EventSource' in window) {
    events = new EventSource(apiUrl(`/api/houses/ioncore-house/events?sessionId=${encodeURIComponent(sessionId)}`));
    events.addEventListener('house-presence-updated', (event) => renderPresence(JSON.parse(event.data)));
    events.addEventListener('house-chat-message', (event) => addMessage(JSON.parse(event.data)));
  }
  const beginPresence = () => heartbeat().catch((error) => { setStatus(error.message); toggle.disabled = true; });
  if (window.MUZIKAZ_DESIGNATED_AVATAR || localStorage.getItem('muzikazDesignatedAvatar')) beginPresence(); else window.addEventListener('muzikaz-avatar-ready', beginPresence, { once: true });
  const timer = setInterval(() => { heartbeat().catch((error) => { setStatus(error.message); }); loadChat().catch(() => {}); }, 5_000);
  window.addEventListener('pagehide', () => { clearInterval(timer); events?.close(); if (joined) navigator.sendBeacon?.(apiUrl(`/api/houses/ioncore-house/presence/leave?sessionId=${encodeURIComponent(sessionId)}`)); });
})();
