/* Wallet login gate for the single-player House Explorer. */
(function () {
  'use strict';

  var authorized = false;
  var busy = false;

  function walletProvider() {
    var providers = (window.ethereum && window.ethereum.providers) || (window.ethereum ? [window.ethereum] : []);
    return providers.find(function (provider) { return provider.isMetaMask; }) || providers[0] || null;
  }

  function setMessage(message) {
    var status = document.getElementById('house-game-load-status');
    if (status) status.textContent = message;
  }

  async function connectedAddress(provider) {
    var accounts = await provider.request({ method: 'eth_requestAccounts' });
    var address = String(accounts && accounts[0] || '');
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return '';
    return address;
  }

  function openGame(button) {
    authorized = true;
    setMessage('Wallet connected. Opening Single Player…');
    button.disabled = false;
    try {
      button.click();
    } finally {
      authorized = false;
    }
  }

  async function enter(button) {
    if (busy) return;
    var provider = walletProvider();
    if (!provider) {
      setMessage('Connect a browser wallet to enter Single Player.');
      return;
    }

    busy = true;
    button.disabled = true;
    setMessage('Connecting your wallet…');
    try {
      if (await connectedAddress(provider)) openGame(button);
      else setMessage('Connect a wallet account to enter Single Player.');
    } catch (_) {
      // Wallet rejection and provider/RPC failures are login outcomes, not NFT
      // validation errors. Keep the launcher available for another attempt.
      setMessage('Wallet connection was not completed. Select Begin Game to try again.');
    } finally {
      busy = false;
      if (!authorized) button.disabled = false;
    }
  }

  document.addEventListener('click', function (event) {
    var button = event.target.closest && event.target.closest('[data-house-start]');
    if (!button || authorized) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    enter(button);
  }, true);
}());
