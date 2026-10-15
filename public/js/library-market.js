import { createGameMarketplace } from './in-game-market.js';
let marketplace;
document.addEventListener('click', event => {
  const button=event.target.closest('[data-library-market]');
  if (!button) return;
  button.closest('dialog')?.close();
  if (!marketplace) {
    marketplace = createGameMarketplace();
    marketplace.dialog.id = 'library-market-popup';
    marketplace.dialog.querySelector('h2').id = 'library-market-title';
    marketplace.dialog.setAttribute('aria-labelledby', 'library-market-title');
  }
  marketplace.open(button.dataset.marketTab||'upgrades',{search:button.dataset.marketSearch||''});
});
