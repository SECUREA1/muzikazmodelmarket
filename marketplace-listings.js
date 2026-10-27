(async function () {
  'use strict';
  const {marketItemPreview,hydrateMarketPreviews}=await import('./public/js/market-item-preview.js');
  const {organizeMarketWorkspace}=await import('./public/js/market-workspace.js');
  const shelves = [...document.querySelectorAll('[data-user-market-listings]')];
  if (!shelves.length) return;
  const statuses = [...document.querySelectorAll('[data-user-market-status]')];
  const escape = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  let sessionOwner='';const inventory=import('./public/js/shared-game-inventory.js').then(module=>new module.SharedGameInventory());
  const owner = () => sessionOwner||String(window.MZKWallet?.connectedAddress?.() || window.MZKWallet?.walletId?.() || '').trim().toLowerCase();
  const setStatus = (message) => statuses.forEach((status) => { status.textContent = message; });
  const api = async (path, options = {}) => {
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    if (owner()) headers['X-Wallet-Address'] = owner();
    // Use the shared API connection when the storefront is hosted separately
    // from the persistent marketplace service. The public listing request does
    // not require a wallet, so visitors can browse every seller before login.
    const request = window.MUZIKAZ_API?.fetch || window.fetch.bind(window);
    const response = await request(path, { ...options, headers, cache: 'no-store' });
    const result = await response.json();
    if (!response.ok || result.success === false) throw new Error(result.message || 'The user marketplace is unavailable.');
    return result.data;
  };
  const card = (listing) => `<article class="user-market-card">
    ${marketItemPreview(listing)}
    <div><span class="pill">${escape(listing.itemType)}</span>${listing.factoryModel&&listing.certified&&listing.certification?'<span class="pill">Range certified · '+escape(listing.certification.grade)+' · '+Number(listing.certification.score)+'/100</span>':''}<h4>${escape(listing.itemName)}</h4><small>Seller: ${escape(listing.sellerName)}</small>${listing.factoryModel?'<small>Reusable factory model · test, launch or dispatch after purchase.</small>':''}<strong>${Number(listing.priceMzk).toLocaleString()} MZK</strong></div>
    <button type="button" data-buy-user-listing="${escape(listing.itemId)}" data-seller-id="${escape(listing.sellerId)}" ${listing.sellerId === owner() ? 'disabled' : ''}>${listing.sellerId === owner() ? 'Your listing' : 'Buy with MZK'}</button>
  </article>`;
  async function load() {
    setStatus('Loading every active user listing…');
    const listings = await api('/api/market/listings');
    shelves.forEach((shelf) => { shelf.innerHTML = listings.length ? listings.map(card).join('') : '<p class="user-market-empty">No user items are listed yet. Active Backpack listings will appear here automatically.</p>'; });
    shelves.forEach(shelf=>{organizeMarketWorkspace(shelf,{rowSelector:'.user-market-card',records:listings,titleSelector:'h4'});hydrateMarketPreviews(shelf);});
    const sellers = new Set(listings.map((listing) => listing.sellerId)).size;
    setStatus(`${listings.length} active user listing${listings.length === 1 ? '' : 's'} shown from ${sellers} seller${sellers === 1 ? '' : 's'} in the shared MUZIKAZ market.`);
  }
  async function buy(button) {
    const session=await (await inventory).session();sessionOwner=session.owner_id;
    button.disabled = true; setStatus('Completing the atomic MZK marketplace transfer…');
    try {
      const trade = await api('/api/market/trades', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token':session.csrfToken }, body: JSON.stringify({ sellerId: button.dataset.sellerId, itemId: button.dataset.buyUserListing, requestId: `${owner()}:${Date.now()}:${button.dataset.buyUserListing}` }) });
      setStatus(`${trade.itemName} is now in your Backpack. ${Number(trade.priceMzk).toLocaleString()} MZK was transferred to the seller.`);
      await load(); window.dispatchEvent(new CustomEvent('muzikaz:market-listings-changed', { detail: trade }));
    } finally { button.disabled = false; }
  }
  shelves.forEach((shelf) => shelf.addEventListener('click', (event) => { const button = event.target.closest('[data-buy-user-listing]'); if (button) buy(button).catch((error) => setStatus(error.message)); }));
  window.addEventListener('mzk:wallet-connection-changed', () => load().catch((error) => setStatus(error.message)));
  window.addEventListener('muzikaz:market-listings-changed', () => load().catch((error) => setStatus(error.message)));
  load().catch((error) => setStatus(error.message));
}());
