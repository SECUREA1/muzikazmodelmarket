/* Black Genie Bottle access gate for the main-page Single Player game. */
(function () {
  'use strict';
  var CONTRACT = '0x9B32d046DA71698BCEEff7b829F9Ebe95974D631';
  var MAINNET = '0x1';
  var TOKEN_ID = String(window.MUZIKAZ_BLACK_GENIE_TOKEN_ID || '0');
  var button = document.getElementById('bottle-access-button');
  var mintButton = document.getElementById('bottle-free-mint');
  var overlay = document.getElementById('house-game-start');
  var status = document.getElementById('house-game-load-status');
  if (!button || !mintButton || !overlay) return;

  var provider = null;
  var address = '';
  var verified = false;
  function setStatus(message, error) { status.textContent = message; overlay.classList.toggle('has-error', Boolean(error)); }
  function word(value) { return String(value).replace(/^0x/, '').padStart(64, '0'); }
  function providerForMetaMask() {
    var providers = window.ethereum && window.ethereum.providers;
    return (providers && providers.find(function (item) { return item.isMetaMask; })) || (window.ethereum && window.ethereum.isMetaMask ? window.ethereum : null);
  }
  async function ensureMainnet() {
    var chainId = await provider.request({ method: 'eth_chainId' });
    if (String(chainId).toLowerCase() === MAINNET) return;
    try { await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: MAINNET }] }); }
    catch (error) { throw new Error('Switch MetaMask to Ethereum mainnet to continue.'); }
  }
  async function ownsBottle() {
    try {
      await window.MuzikazContractOwnership.verify({ wallet: provider, address: address, contracts: [CONTRACT], requiredContract: CONTRACT, tokenIdsByContract: { [CONTRACT.toLowerCase()]: [TOKEN_ID] } });
      return true;
    } catch (error) { return false; }
  }
  function openSinglePlayer() {
    verified = true;
    button.dataset.mzkEntryPaid = 'true';
    button.textContent = 'Opening Single Player…';
    mintButton.hidden = true;
    setStatus('Black Genie Bottle verified. Opening your private Single Player house…');
    button.click();
  }
  async function connectAndVerify() {
    provider = providerForMetaMask();
    if (!provider) throw new Error('MetaMask is required. Install or open MetaMask, then try again.');
    var accounts = await provider.request({ method: 'eth_requestAccounts' });
    address = accounts && accounts[0];
    if (!/^0x[a-fA-F0-9]{40}$/.test(address || '')) throw new Error('MetaMask did not return a valid wallet address.');
    await ensureMainnet();
    setStatus('Checking this wallet for the Black Genie Bottle…');
    if (await ownsBottle()) return openSinglePlayer();
    button.textContent = 'Check wallet again';
    mintButton.hidden = false;
    setStatus('No Black Genie Bottle was found in this wallet. Mint one free, then Single Player will open automatically.');
  }
  function claimCalldata() {
    // claim(receiver, tokenId, 1, address(0), 0, {proof:[], limit:0, price:0, currency:address(0)}, "")
    var zeroAddress = word('0');
    var tuple = word('80') + word('0') + word('0') + zeroAddress + word('0');
    return '0x84bb1e42' + word(address) + word(BigInt(TOKEN_ID).toString(16)) + word('1') + zeroAddress + word('0') + word('e0') + word('180') + tuple + word('0');
  }
  async function mint() {
    mintButton.disabled = true;
    try {
      if (!provider || !address) await connectAndVerify();
      if (verified) return;
      await ensureMainnet();
      setStatus('Confirm the free Black Genie Bottle mint in MetaMask…');
      var hash = await provider.request({ method: 'eth_sendTransaction', params: [{ from: address, to: CONTRACT, data: claimCalldata(), value: '0x0' }] });
      setStatus('Mint submitted. Waiting for Ethereum confirmation…');
      var receipt = null;
      while (!receipt) { await new Promise(function (resolve) { setTimeout(resolve, 2500); }); receipt = await provider.request({ method: 'eth_getTransactionReceipt', params: [hash] }); }
      if (receipt.status && BigInt(receipt.status) !== 1n) throw new Error('The mint transaction was reverted.');
      for (var attempt = 0; attempt < 8; attempt += 1) {
        if (await ownsBottle()) return openSinglePlayer();
        await new Promise(function (resolve) { setTimeout(resolve, 1500); });
      }
      throw new Error('Mint confirmed, but ownership has not indexed yet. Select “Check wallet again” shortly.');
    } catch (error) { setStatus(error.message || 'The free mint could not be completed.', true); }
    finally { mintButton.disabled = false; }
  }

  button.addEventListener('click', function (event) {
    if (verified) return;
    event.preventDefault(); event.stopImmediatePropagation();
    button.disabled = true;
    connectAndVerify().catch(function (error) { setStatus(error.message, true); }).finally(function () { if (!verified) button.disabled = false; });
  }, true);
  mintButton.addEventListener('click', mint);
  window.addEventListener('load', function () {
    provider = providerForMetaMask();
    if (!provider) return;
    Promise.all([provider.request({ method: 'eth_accounts' }), provider.request({ method: 'eth_chainId' })]).then(function (result) {
      if (result[0] && result[0][0] && String(result[1]).toLowerCase() === MAINNET) { address = result[0][0]; return ownsBottle().then(function (owned) { if (owned) openSinglePlayer(); }); }
    }).catch(function () {});
  });
}());
