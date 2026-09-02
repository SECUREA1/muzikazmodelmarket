(function () {
  const header = document.querySelector('.site-header');
  if (!header || header.classList.contains('global-site-header')) return;

  const current = location.pathname.split('/').pop() || 'index.html';
  const active = (href) => href.split('#')[0] === current ? ' active' : '';
  const icon = (path) => `<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;

  header.className = 'site-header global-site-header';
  header.innerHTML = `
    <a class="logo world-logo" href="index.html#home" aria-label="MUZIKAZ WORLD home"><img src="public/assets/muzikaz-world-logo.svg" alt="MUZIKAZ WORLD"></a>
    <nav class="nav global-nav" id="primary-navigation" aria-label="Primary navigation" aria-hidden="false">
      <a class="nav-link${active('index.html')}" href="index.html#models">${icon('M4 5h16v14H4zM8 9h8M8 13h5')}<span>Models</span></a>
      <a class="nav-link${active('model-explorer.html')}" href="model-explorer.html">${icon('M3 6l5-2 8 3 5-2v13l-5 2-8-3-5 2zM8 4v13M16 7v13')}<span>World Map</span></a>
      <a class="nav-link${active('model-market.html')}" href="model-market.html">${icon('M4 9h16l-1-5H5zM6 9v11h12V9M9 20v-6h6v6')}<span>Market</span></a>
      <a class="nav-link${active('crew-market.html')}" href="crew-market.html">${icon('M12 3a5 5 0 015 5c0 3-2 4-5 4S7 11 7 8a5 5 0 015-5zM4 21c.5-5 3-7 8-7s7.5 2 8 7')}<span>Characters &amp; Worlds</span></a>
      <a class="nav-link" href="index.html#merch">${icon('M8 4l4 2 4-2 5 3-3 5-2-1v9H8v-9l-2 1-3-5z')}<span>Merch</span></a>
      <a class="nav-link${active('avatar-whitepaper.html')}" href="avatar-whitepaper.html">${icon('M6 3h9l3 3v15H6zM14 3v4h4M9 11h6M9 15h6')}<span>Whitepaper</span></a>
    </nav>
    <div class="icons" aria-label="Account shortcuts">
      <a class="mobile-header-action" href="checkout.html" aria-label="Checkout">${icon('M3 4h2l2 11h10l3-8H6M9 20h.01M17 20h.01')}<span>Checkout</span></a>
      <a class="mobile-header-action" href="buy-mzk.html" aria-label="Buy MZK">${icon('M12 2v20M17 6.5c-1-1-2.5-1.5-5-1.5-3 0-5 1.2-5 3s2 3 5 3 5 1.2 5 3-2 3-5 3c-2.5 0-4-.5-5-1.5')}<span>Buy MZK</span></a>
      <a class="mobile-header-action" href="members.html#owned-collection" aria-label="View backpack">${icon('M8 8V6a4 4 0 018 0v2M6 8h12a2 2 0 012 2v10H4V10a2 2 0 012-2Z')}<span>Backpack</span></a>
      <button class="wallet-connect" id="wallet-connect" type="button" aria-describedby="wallet-connect-status" title="Connect wallet"><img src="muzikaz_bolt_logo_editable.svg" alt="" aria-hidden="true"><span>Connect wallet</span></button>
      <span class="sr-only" id="wallet-connect-status" role="status" aria-live="polite">Wallet not connected.</span>
    </div>
    <button class="menu-toggle" type="button" aria-controls="primary-navigation" aria-expanded="false" aria-label="Open menu">${icon('M4 6h16M4 12h16M4 18h16')}<span>Menu</span></button>`;

  const menu = header.querySelector('.menu-toggle');
  const nav = header.querySelector('.global-nav');
  menu.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('is-open');
    menu.setAttribute('aria-expanded', String(isOpen));
    menu.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
  });
  nav.addEventListener('click', () => {
    nav.classList.remove('is-open');
    menu.setAttribute('aria-expanded', 'false');
    menu.setAttribute('aria-label', 'Open menu');
  });

  const walletButton = header.querySelector('#wallet-connect');
  const walletLabel = walletButton.querySelector('span');
  const walletStatus = header.querySelector('#wallet-connect-status');
  const renderWallet = (message = '') => {
    const address = window.MZKWallet?.connectedAddress?.() || '';
    const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '';
    walletButton.classList.toggle('is-connected', Boolean(address));
    walletButton.setAttribute('aria-pressed', String(Boolean(address)));
    walletLabel.textContent = short || 'Connect wallet';
    walletStatus.textContent = message || (short ? `Ethereum wallet ${short} connected.` : 'Wallet not connected.');
  };
  walletButton.addEventListener('click', async () => {
    if (!window.MZKWallet) {
      renderWallet('Wallet service is still loading. Please try again.');
      return;
    }
    walletButton.disabled = true;
    try {
      if (window.MZKWallet.connectedAddress()) {
        window.MZKWallet.disconnectBrowserWallet();
        renderWallet('Wallet disconnected from this app.');
      } else {
        await window.MZKWallet.connectBrowserWallet();
        renderWallet();
      }
    } catch (error) {
      renderWallet(error?.message || 'Wallet connection was not completed.');
    } finally {
      walletButton.disabled = false;
    }
  });
  window.addEventListener('mzk:wallet-connection-changed', () => renderWallet());
  renderWallet();
})();
