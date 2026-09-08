/* Black Genie Bottle ownership gate for the single-player House Explorer. */
(function () {
  'use strict';

  var CONTRACT = '0x9B32d046DA71698BCEEff7b829F9Ebe95974D631';
  var MAINNET = '0x1';
  var MINT_SELECTOR = '0x1249c58b'; // mint()
  var MOBILE_PASSCODE = 'boots';
  // Authorization is deliberately single-use. It exists only while this gate
  // redispatches the click that starts RAD-TOX, so a later play attempt always
  // gets a fresh on-chain ownership check.
  var authorized = false;
  var busy = false;

  function isMobileDevice() {
    return window.matchMedia('(max-width: 768px)').matches || navigator.maxTouchPoints > 0;
  }

  function installMobilePasscode() {
    var surface = document.querySelector('[data-house-start-surface] .game-overlay__content');
    if (!surface || surface.querySelector('.black-genie-passcode')) return;

    var form = document.createElement('form');
    form.className = 'black-genie-passcode';
    form.hidden = !isMobileDevice();
    form.innerHTML = '<label for="black-genie-passcode-input">Mobile pass code</label><div><input id="black-genie-passcode-input" name="passcode" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Enter pass code" aria-describedby="black-genie-passcode-help" required><button class="btn" type="submit">Unlock</button></div><small id="black-genie-passcode-help">On a mobile device, enter the Single Player pass code instead of connecting a wallet.</small>';
    surface.appendChild(form);

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      event.stopPropagation();
      var input = form.elements.passcode;
      var button = document.querySelector('[data-house-start]');
      if (!isMobileDevice() || !button) return;
      if (String(input.value || '').trim().toLowerCase() !== MOBILE_PASSCODE) {
        input.setAttribute('aria-invalid', 'true');
        setMessage('That pass code is not recognized. Try again or connect the Black Genie Bottle wallet.');
        input.focus();
        return;
      }
      input.removeAttribute('aria-invalid');
      input.value = '';
      setMessage('Mobile pass code accepted. Opening Single Player…');
      openGame(button);
    });
  }

  function metamask() {
    var providers = (window.ethereum && window.ethereum.providers) || (window.ethereum ? [window.ethereum] : []);
    return providers.find(function (provider) { return provider.isMetaMask; }) || null;
  }

  function overlay() {
    var element = document.getElementById('black-genie-mint');
    if (element) return element;
    element = document.createElement('section');
    element.id = 'black-genie-mint';
    element.className = 'black-genie-mint';
    element.hidden = true;
    element.setAttribute('role', 'dialog');
    element.setAttribute('aria-modal', 'true');
    element.setAttribute('aria-labelledby', 'black-genie-title');
    element.innerHTML = '<div class="black-genie-mint__card"><button class="black-genie-mint__close" type="button" aria-label="Close">×</button><span class="black-genie-mint__bottle" aria-hidden="true">🧞‍♂️</span><p class="kicker">Single Player Access Pass</p><h3 id="black-genie-title">Free Mint Black Genie Bottle</h3><p>The Black Genie Bottle NFT unlocks the Single Player 3D House Explorer. Mint one free on Ethereum mainnet, then the game will open automatically.</p><button class="btn black-genie-mint__action" type="button">Free Mint</button><small class="black-genie-mint__status" role="status">MetaMask confirmation and Ethereum network fees may be required.</small></div>';
    document.body.appendChild(element);
    element.querySelector('.black-genie-mint__close').addEventListener('click', function () { element.hidden = true; });
    element.querySelector('.black-genie-mint__action').addEventListener('click', mint);
    return element;
  }

  function setMessage(message) {
    var gameStatus = document.getElementById('house-game-load-status');
    var mintStatus = overlay().querySelector('.black-genie-mint__status');
    if (gameStatus) gameStatus.textContent = message;
    if (mintStatus) mintStatus.textContent = message;
  }

  async function account(provider) {
    var chain = String(await provider.request({ method: 'eth_chainId' })).toLowerCase();
    if (chain !== MAINNET) {
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: MAINNET }] });
    }

    // Ask for the account after the network switch. MetaMask connections are
    // chain-scoped, so an address read before switching can be stale even when
    // the correct mainnet account is visibly selected in the wallet.
    var accounts = await provider.request({ method: 'eth_requestAccounts' });
    var address = String(accounts && accounts[0] || '');
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) throw new Error('Connect a valid MetaMask account to continue.');

    // Do not query the NFT contract until the provider confirms that its switch
    // completed. This avoids interpreting a zero balance from the prior chain
    // as "No Black Genie Bottle was found."
    chain = String(await provider.request({ method: 'eth_chainId' })).toLowerCase();
    if (chain !== MAINNET) throw new Error('Switch MetaMask to Ethereum mainnet to check your Black Genie Bottle.');
    return address;
  }

  async function owns(provider, address) {
    if (!window.MuzikazContractOwnership || !window.MuzikazContractOwnership.verify) throw new Error('The NFT ownership checker did not load. Refresh and try again.');
    try {
      await window.MuzikazContractOwnership.verify({ wallet: provider, address: address, contracts: [CONTRACT], requiredContract: CONTRACT });
      return true;
    } catch (error) {
      if (/does not own/i.test(String(error && error.message))) return false;
      throw error;
    }
  }

  async function assertWalletStillSelected(provider, address) {
    var chain = String(await provider.request({ method: 'eth_chainId' })).toLowerCase();
    var accounts = await provider.request({ method: 'eth_accounts' });
    var selected = String(accounts && accounts[0] || '').toLowerCase();
    if (chain !== MAINNET) throw new Error('Switch MetaMask to Ethereum mainnet to enter Single Player.');
    if (selected !== address.toLowerCase()) throw new Error('Your selected MetaMask account changed. Select Begin Game to validate it.');
  }

  function openGame(button) {
    authorized = true;
    overlay().hidden = true;
    setMessage('Black Genie Bottle verified. Opening Single Player…');
    // enter() disables the control while the on-chain check is running. A
    // disabled HTML button ignores HTMLElement.click(), so re-enable it before
    // redispatching the authorized click to the existing game launcher.
    button.disabled = false;
    try {
      button.click();
    } finally {
      authorized = false;
    }
  }

  async function enter(button) {
    if (busy) return;
    var provider = metamask();
    if (!provider) { setMessage('Install or open MetaMask, then connect your wallet to enter Single Player.'); return; }
    busy = true;
    button.disabled = true;
    try {
      setMessage('Connect MetaMask to check your Black Genie Bottle on Ethereum mainnet…');
      var address = await account(provider);
      setMessage('Checking Black Genie Bottle ownership…');
      if (await owns(provider, address)) {
        await assertWalletStillSelected(provider, address);
        openGame(button);
      }
      else { overlay().hidden = false; setMessage('No Black Genie Bottle was found. Free mint one to unlock Single Player.'); }
    } catch (error) {
      setMessage(error && error.message || 'MetaMask could not verify access. Try again.');
    } finally {
      busy = false;
      if (!authorized) button.disabled = false;
    }
  }

  async function receipt(provider, hash) {
    for (var attempt = 0; attempt < 120; attempt += 1) {
      var result = await provider.request({ method: 'eth_getTransactionReceipt', params: [hash] });
      if (result) {
        if (BigInt(result.status || '0x0') !== 1n) throw new Error('The Black Genie Bottle mint transaction did not succeed.');
        return result;
      }
      await new Promise(function (resolve) { window.setTimeout(resolve, 3000); });
    }
    throw new Error('Mint confirmation is taking longer than expected. Try entering again after it confirms.');
  }

  async function mint() {
    if (busy) return;
    var provider = metamask();
    var button = document.querySelector('[data-house-start]');
    var mintButton = overlay().querySelector('.black-genie-mint__action');
    if (!provider || !button) { setMessage('Open MetaMask to mint the Black Genie Bottle.'); return; }
    busy = true;
    mintButton.disabled = true;
    try {
      var address = await account(provider);
      setMessage('Confirm the free Black Genie Bottle mint in MetaMask…');
      var hash = await provider.request({ method: 'eth_sendTransaction', params: [{ from: address, to: CONTRACT, data: MINT_SELECTOR, value: '0x0' }] });
      setMessage('Mint submitted. Waiting for Ethereum confirmation…');
      await receipt(provider, hash);
      setMessage('Mint confirmed. Verifying your new Black Genie Bottle…');
      if (!await owns(provider, address)) throw new Error('Mint confirmed, but ownership is not indexed yet. Select Begin Game to check again.');
      await assertWalletStillSelected(provider, address);
      openGame(button);
    } catch (error) {
      setMessage(error && error.message || 'The Black Genie Bottle could not be minted.');
    } finally {
      busy = false;
      mintButton.disabled = false;
    }
  }

  document.addEventListener('click', function (event) {
    var button = event.target.closest && event.target.closest('[data-house-start]');
    if (!button || authorized) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    enter(button);
  }, true);

  installMobilePasscode();
}());
