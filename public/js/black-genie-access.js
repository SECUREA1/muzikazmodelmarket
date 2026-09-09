/* MZK payment gate for the single-player House Explorer. */
(function () {
  'use strict';

  var authorized = false;

  function setMessage(message) {
    var status = document.getElementById('house-game-load-status');
    if (status) status.innerHTML = message;
  }

  function openGame(button) {
    authorized = true;
    button.disabled = false;
    try { button.click(); } finally { authorized = false; }
  }

  function enter(button) {
    var wallet = window.MZKWallet;
    if (!wallet) {
      setMessage('The MZK wallet could not load. Refresh before entering Single Player.');
      return;
    }
    var owner = wallet.walletId();
    if (!owner || owner.indexOf('guest-') === 0) {
      setMessage('Connect a wallet, then <a href="buy-mzk.html?amount=5&amp;return=model-explorer.html%23house-explorer">buy the $5 MZK entry with any payment method</a>. Your Black Genie Bottle and free Loadout are delivered after payment.');
      return;
    }
    var result = wallet.claimStarterLoadout();
    if (!result.ok) {
      setMessage('Single Player costs 500 MZK ($5). Your balance is ' + Number(result.balance || 0).toLocaleString() + ' MZK. <a href="buy-mzk.html?amount=5&amp;return=model-explorer.html%23house-explorer">Buy MZK</a> to unlock your free avatar, land item, and game Loadout.');
      return;
    }
    setMessage(result.firstEntry
      ? 'Payment accepted. Your avatar, land item, and Builder Loadout are in your Backpack. Opening Single Player…'
      : 'MZK access confirmed. Opening Single Player…');
    openGame(button);
  }

  document.addEventListener('click', function (event) {
    var button = event.target.closest && event.target.closest('[data-house-start]');
    if (!button || authorized) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    enter(button);
  }, true);
}());
