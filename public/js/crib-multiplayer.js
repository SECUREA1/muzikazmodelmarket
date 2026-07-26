(() => {
  const root = document.querySelector('#crib-social');
  if (!root || localStorage.getItem('muzikazBottleMember') !== 'true') return;
  const api = window.MUZIKAZ_SHARED_AVATAR_API || '';
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
  const messages = document.querySelector('#crib-chat-messages');
  const form = document.querySelector('#crib-chat-form');
  const input = document.querySelector('#crib-chat-input');
  const status = document.querySelector('#crib-chat-status');
  let joined = false;

  const headers = { 'Content-Type': 'application/json', 'X-MUZIKAZ-Session': sessionId };
  const text = (value) => document.createTextNode(String(value || ''));
  function renderPresence(data = {}) {
    count.textContent = `${data.count || 0} / ${data.capacity || 15}`;
    const users = Array.isArray(data.users) ? data.users : [];
    players.replaceChildren(...users.map((user) => { const chip = document.createElement('span'); chip.style.setProperty('--player-color', user.color || '#9cff00'); chip.append(text(user.sessionId === sessionId ? `${user.username} (you)` : user.username)); return chip; }));
    const legacyCount = document.querySelector('#house-presence-count');
    if (legacyCount) legacyCount.textContent = `Live in the house: ${data.count || 0} / ${data.capacity || 15}`;
  }
  function addMessage(item) {
    if (!item?.id || messages.querySelector(`[data-message-id="${CSS.escape(item.id)}"]`)) return;
    const li = document.createElement('li'); li.dataset.messageId = item.id;
    const name = document.createElement('strong'); name.append(text(item.sessionId === sessionId ? 'You' : item.username));
    const body = document.createElement('span'); body.append(text(item.message)); li.append(name, body); messages.append(li);
    while (messages.children.length > 50) messages.firstElementChild.remove(); messages.scrollTop = messages.scrollHeight;
  }
  async function heartbeat() {
    const response = await fetch(`${api}/api/houses/ioncore-house/presence`, { method: 'POST', headers, body: JSON.stringify({ username, roomId: 'rad-tox', color }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Unable to join.'); joined = true; renderPresence(data);
  }
  toggle.addEventListener('click', () => { panel.hidden = !panel.hidden; toggle.setAttribute('aria-expanded', String(!panel.hidden)); if (!panel.hidden) input.focus(); });
  panel.querySelector('[data-close-chat]').addEventListener('click', () => { panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); toggle.focus(); });
  form.addEventListener('submit', async (event) => { event.preventDefault(); const message = input.value.trim(); if (!message) return; input.disabled = true; try { const response = await fetch(`${api}/api/houses/ioncore-house/chat`, { method: 'POST', headers, body: JSON.stringify({ message }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); input.value = ''; addMessage(data); status.textContent = ''; } catch (error) { status.textContent = error.message || 'Message could not be sent.'; } finally { input.disabled = false; input.focus(); } });
  fetch(`${api}/api/houses/ioncore-house/chat`, { headers }).then((response) => response.json()).then((data) => (data.messages || []).forEach(addMessage)).catch(() => {});
  const events = new EventSource(`${api}/api/houses/ioncore-house/events?sessionId=${encodeURIComponent(sessionId)}`);
  events.addEventListener('house-presence-updated', (event) => renderPresence(JSON.parse(event.data)));
  events.addEventListener('house-chat-message', (event) => addMessage(JSON.parse(event.data)));
  events.onerror = () => { status.textContent = 'Reconnecting to the crib…'; };
  heartbeat().catch((error) => { status.textContent = error.message; toggle.disabled = true; });
  const timer = setInterval(() => heartbeat().catch((error) => { status.textContent = error.message; }), 10_000);
  window.addEventListener('beforeunload', () => { clearInterval(timer); if (joined) navigator.sendBeacon?.(`${api}/api/houses/ioncore-house/presence/leave?sessionId=${encodeURIComponent(sessionId)}`); });
})();
