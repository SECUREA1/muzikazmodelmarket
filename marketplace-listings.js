(function () {
  'use strict';
  const shelves = [...document.querySelectorAll('[data-user-market-listings]')];
  if (!shelves.length) return;
  const statuses = [...document.querySelectorAll('[data-user-market-status]')];
  const escape = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  const owner = () => String(window.MZKWallet?.connectedAddress?.() || window.MZKWallet?.walletId?.() || '').trim().toLowerCase();
  const setStatus = (message) => statuses.forEach((status) => { status.textContent = message; });
  const api = async (path, options = {}) => {
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    if (owner()) headers['X-Wallet-Address'] = owner();
    const response = await fetch(path, { ...options, headers, cache: 'no-store' });
    const result = await response.json();
    if (!response.ok || result.success === false) throw new Error(result.message || 'The user marketplace is unavailable.');
    return result.data;
  };
  const card = (listing) => `<article class="user-market-card">
    ${listing.thumbnailUrl ? `<img src="${escape(listing.thumbnailUrl)}" alt="${escape(listing.itemName)}">` : '<span class="user-market-card__icon" aria-hidden="true">ϟ</span>'}
    <div><span class="pill">${escape(listing.itemType)}</span><h4>${escape(listing.itemName)}</h4><small>Seller: ${escape(listing.sellerName)}</small><strong>${Number(listing.priceMzk).toLocaleString()} MZK</strong></div>
    <button type="button" data-buy-user-listing="${escape(listing.itemId)}" data-seller-id="${escape(listing.sellerId)}" ${listing.sellerId === owner() ? 'disabled' : ''}>${listing.sellerId === owner() ? 'Your listing' : 'Buy with MZK'}</button>
  </article>`;
  async function load() {
    setStatus('Loading every active user listing…');
    const listings = await api('/api/market/listings');
    shelves.forEach((shelf) => { shelf.innerHTML = listings.length ? listings.map(card).join('') : '<p class="user-market-empty">No user items are listed yet. Active Backpack listings will appear here automatically.</p>'; });
    setStatus(`${listings.length} active user listing${listings.length === 1 ? '' : 's'} shown from the shared MUZIKAZ market.`);
  }
  async function buy(button) {
    if (!owner() || owner().startsWith('guest-')) throw new Error('Connect your member wallet before buying a user listing.');
    button.disabled = true; setStatus('Completing the atomic MZK marketplace transfer…');
    try {
      const trade = await api('/api/market/trades', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sellerId: button.dataset.sellerId, itemId: button.dataset.buyUserListing, requestId: `${owner()}:${Date.now()}:${button.dataset.buyUserListing}` }) });
      setStatus(`${trade.itemName} is now in your Backpack. ${Number(trade.priceMzk).toLocaleString()} MZK was transferred to the seller.`);
      await load(); window.dispatchEvent(new CustomEvent('muzikaz:market-listings-changed', { detail: trade }));
    } finally { button.disabled = false; }
  }
  shelves.forEach((shelf) => shelf.addEventListener('click', (event) => { const button = event.target.closest('[data-buy-user-listing]'); if (button) buy(button).catch((error) => setStatus(error.message)); }));
  window.addEventListener('mzk:wallet-connection-changed', () => load().catch((error) => setStatus(error.message)));
  window.addEventListener('muzikaz:market-listings-changed', () => load().catch((error) => setStatus(error.message)));
  load().catch((error) => setStatus(error.message));
}());
