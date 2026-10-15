import { createGameMarketplace } from './in-game-market.js';
let marketplace;
document.addEventListener('click', event => {
  if (!event.target.closest('[data-library-market]')) return;
  if (!marketplace) {
    marketplace = createGameMarketplace();
    marketplace.dialog.id = 'library-market-popup';
    marketplace.dialog.querySelector('h2').id = 'library-market-title';
    marketplace.dialog.setAttribute('aria-labelledby', 'library-market-title');
  }
  marketplace.open('pack');
});
