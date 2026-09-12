/* Prepares the free single-player House Explorer demo. */
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
    if (!wallet) return setMessage('The MZK wallet could not load. Refresh before entering Single Player.');
    var grant = wallet.claimSinglePlayerTokens();
    if (!grant.ok) return setMessage('Single Player could not be prepared. Refresh and try again.');
    setMessage(grant.firstGrant
      ? '500 MZK added for in-game display and play. Opening Single Player…'
      : `${Number(grant.balance || 0).toLocaleString()} MZK ready for in-game display and play. Opening Single Player…`);
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
