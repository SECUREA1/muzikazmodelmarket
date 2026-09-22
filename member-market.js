(function () {
  'use strict';
  const select = document.querySelector('#exchange-member-select');
  const packs = document.querySelector('#exchange-packs');
  const trades = document.querySelector('#exchange-trades');
  const messages = document.querySelector('#exchange-messages');
  const form = document.querySelector('#exchange-message-form');
  const status = document.querySelector('#exchange-status');
  if (!select || !packs || !window.MUZIKAZ_API) return;

  const escape = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  let member = null;
  const owner = () => String(member?.walletId || '').toLowerCase();
  const headers = (method = 'GET') => ({ Accept: 'application/json', 'Content-Type': 'application/json', ...(!/^(GET|HEAD)$/i.test(method) && member?.csrfToken ? { 'X-CSRF-Token': member.csrfToken } : {}) });
  const api = async (path, options = {}) => {
    const response = await window.MUZIKAZ_API.fetch(path, { ...options, headers: { ...headers(options.method), ...(options.headers || {}) } });
    const payload = await response.json();
    if (!response.ok || payload.success === false) throw new Error(payload.message || payload.error || 'The member market request failed.');
    return payload.data;
  };
  async function restoreMember() {
    const [bootstrap, profile] = await Promise.all([api('/api/account/bootstrap'), api('/api/profile')]);
    member = { ...profile, csrfToken: bootstrap.csrfToken };
    window.MuzikazAccountSession = { csrfToken: bootstrap.csrfToken, account: bootstrap.account, backpack: bootstrap.backpack, permissions: bootstrap.permissions, expiresAt: bootstrap.expiresAt };
    return member;
  }

  async function loadMembers(preferred) {
    const members = await api('/api/market/members');
    const peerMembers = members.sort((a, b) => a.walletId === owner() ? -1 : b.walletId === owner() ? 1 : a.displayName.localeCompare(b.displayName));
    select.innerHTML = peerMembers.map((member) => `<option value="${escape(member.walletId)}">${escape(member.displayName)}${member.walletId === owner() ? ' (you)' : ''} · ${member.itemCount} packs · ${member.listedCount} listed</option>`).join('') || '<option value="">No members yet</option>';
    if (preferred && peerMembers.some((member) => member.walletId === preferred)) select.value = preferred;
    await loadProfile(select.value);
    const profiles = await Promise.all(peerMembers.map((member) => api(`/api/market/members/${encodeURIComponent(member.walletId)}`)));
    const listed = profiles.flatMap((profile) => profile.items.filter((item) => item.listing?.active).map((item) => ({ profile, item })));
    const directory = document.createElement('section'); directory.className = 'market-directory-listings'; directory.setAttribute('aria-label', 'All member marketplace listings');
    directory.innerHTML = `<h4>All member listings</h4><div>${listed.map(({ profile, item }) => `<article><span class="pill">${escape(profile.displayName)}</span><h4>${escape(item.name || item.title || item.id)}</h4><strong>${Number(item.listing.priceMzk).toLocaleString()} MZK</strong>${profile.walletId === owner() ? '<small>Your listing</small>' : `<button type="button" data-directory-owner="${escape(profile.walletId)}" data-exchange-buy="${escape(item.id)}">Trade now</button>`}</article>`).join('') || '<p>No members have active listings yet.</p>'}</div>`;
    packs.append(directory);
  }

  async function loadProfile(peer) {
    if (!peer) { packs.innerHTML = '<p>No other members have joined the shared market yet.</p>'; return; }
    const [profile, activity] = await Promise.all([api(`/api/market/members/${encodeURIComponent(peer)}`), api(`/api/market/activity?peer=${encodeURIComponent(peer)}`)]);
    const mine = peer === owner();
    packs.innerHTML = profile.items.map((item) => mine
      ? `<article><span class="pill">Your pack</span><h4>${escape(item.name || item.title || item.id)}</h4><form data-exchange-list="${escape(item.id)}"><label>MZK price <input name="price" type="number" min="1" max="1000000" value="${Number(item.listing?.priceMzk || 25)}" required></label><button type="submit">${item.listing?.active ? 'Update listing' : 'List for trade'}</button></form></article>`
      : item.listing?.active
      ? `<article><span class="pill">Listed pack</span><h4>${escape(item.name || item.title || item.id)}</h4><strong>${Number(item.listing.priceMzk).toLocaleString()} MZK</strong><button type="button" data-exchange-buy="${escape(item.id)}">Trade now</button></article>`
      : `<article><span class="pill">Backpack pack</span><h4>${escape(item.name || item.title || item.id)}</h4><small>Not listed for trade</small></article>`).join('') || '<p>This member’s Backpack is empty.</p>';
    trades.innerHTML = activity.trades.slice().reverse().map((trade) => `<li><b>${escape(trade.itemName)}</b><span>${escape(trade.sellerId)} → ${escape(trade.buyerId)}</span><strong>${Number(trade.priceMzk).toLocaleString()} MZK</strong></li>`).join('') || '<li>No shared trades yet.</li>';
    messages.innerHTML = activity.messages.slice().reverse().map((message) => `<li><b>${message.from === owner() ? 'You' : escape(profile.displayName)}</b><span>${escape(message.text)}</span><time>${new Date(message.createdAt).toLocaleString()}</time></li>`).join('') || '<li>No messages yet.</li>';
    form.hidden = mine;
    status.textContent = `${mine ? 'Managing' : 'Viewing'} ${profile.displayName}'s ${profile.items.length} pack${profile.items.length === 1 ? '' : 's'}.`;
  }

  select.addEventListener('change', () => loadProfile(select.value).catch(showError));
  packs.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-exchange-buy]'); if (!button) return;
    if (button.dataset.directoryOwner) select.value = button.dataset.directoryOwner;
    button.disabled = true; status.textContent = 'Completing the atomic MZK transfer…';
    try {
      const trade = await api('/api/market/trades', { method: 'POST', body: JSON.stringify({ sellerId: select.value, itemId: button.dataset.exchangeBuy, requestId: `${owner()}:${Date.now()}:${button.dataset.exchangeBuy}` }) });
      status.textContent = `Trade complete: ${trade.itemName} moved to your Backpack for ${trade.priceMzk.toLocaleString()} MZK.`;
      await loadMembers(select.value);
    } catch (error) { showError(error); } finally { button.disabled = false; }
  });
  packs.addEventListener('submit', async (event) => {
    const listing = event.target.closest('[data-exchange-list]'); if (!listing) return;
    event.preventDefault();
    try { await api('/api/market/listings', { method: 'PUT', body: JSON.stringify({ itemId: listing.dataset.exchangeList, priceMzk: Number(listing.elements.price.value), active: true }) }); await loadMembers(owner()); status.textContent = 'Pack listing is live for every member.'; window.dispatchEvent(new CustomEvent('muzikaz:market-listings-changed')); } catch (error) { showError(error); }
  });
  form?.addEventListener('submit', async (event) => {
    event.preventDefault(); const input = form.elements.message;
    try { await api('/api/market/messages', { method: 'POST', body: JSON.stringify({ to: select.value, text: input.value }) }); input.value = ''; await loadProfile(select.value); status.textContent = 'Message delivered.'; } catch (error) { showError(error); }
  });
  function showError(error) { status.textContent = error.message || 'The member market is unavailable.'; }
  restoreMember().then(() => loadMembers(owner())).catch(showError);
  window.addEventListener('muzikaz:member-authenticated', () => restoreMember().then(() => loadMembers(owner())).catch(showError));
}());
