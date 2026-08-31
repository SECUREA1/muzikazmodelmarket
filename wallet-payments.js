(function () {
  'use strict';
  const configApi = window.MuzikazPaymentConfig;
  if (!configApi) throw new Error('Load payment-config.js before wallet-payments.js.');
  const { MUZIKAZ_PAYMENT_NETWORKS: NETWORKS, paymentUri } = configApi;
  const RECIPIENTS = Object.freeze(Object.fromEntries(Object.entries(NETWORKS).map(([symbol, config]) => [symbol, config.address])));
  const WALLETS = Object.freeze({
    automatic: Object.freeze({ id: 'automatic', name: 'Best available wallet', types: ['evm', 'solana', 'cardano', 'bitcoin', 'dogecoin'] }),
    metamask: Object.freeze({ id: 'metamask', name: 'MetaMask', types: ['evm'] }),
    phantom: Object.freeze({ id: 'phantom', name: 'Phantom', types: ['evm', 'solana'] }),
    lace: Object.freeze({ id: 'lace', name: 'Lace', types: ['cardano'] }),
    ledger: Object.freeze({ id: 'ledger', name: 'Ledger', types: ['evm', 'solana', 'cardano', 'bitcoin', 'dogecoin'], hardware: true }),
    trezor: Object.freeze({ id: 'trezor', name: 'Trezor', types: ['evm', 'cardano', 'bitcoin', 'dogecoin'], hardware: true })
  });
  const ICON_PATHS = Object.freeze({
    ETH: '<path d="M12 2 6.5 12 12 15l5.5-3L12 2Zm0 13v7l5.5-8.5L12 17l-5.5-3.5L12 22Z"/>', POL: '<path d="m8 9 3-2 3 2v3l-3 2-3-2V9Zm6 0 3-2 3 2v3l-3 2-3-2M8 12l-3 2-3-2V9l3-2 3 2"/>', BNB: '<path d="m12 3 3 3-3 3-3-3 3-3ZM6 9l3 3-3 3-3-3 3-3Zm12 0 3 3-3 3-3-3 3-3Zm-6 6 3 3-3 3-3-3 3-3Zm0-5 2 2-2 2-2-2 2-2Z"/>', SOL: '<path d="M5 5h15l-3 4H2l3-4Zm2 5h15l-3 4H4l3-4Zm-2 5h15l-3 4H2l3-4Z"/>', ADA: '<circle cx="12" cy="12" r="2"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="7" cy="7" r="1"/><circle cx="17" cy="17" r="1"/><circle cx="17" cy="7" r="1"/><circle cx="7" cy="17" r="1"/>', BTC: '<path d="M9 4v16m4-16v16M7 7h7.5a3 3 0 0 1 0 6H7h8a3 3 0 0 1 0 6H7"/>', DOGE: '<path d="M8 4v16m-3-8h11M8 5h4a7 7 0 0 1 0 14H8V5Z"/>',
    automatic: '<path d="M4 7h16v12H4zM4 10h16M16 15h2"/>', metamask: '<path d="m4 5 5 3 3-5 3 5 5-3-2 12-6 4-6-4L4 5Zm5 3 3 6 3-6"/>', phantom: '<path d="M5 18V9a7 7 0 0 1 14 0v7c0 2-2 3-4 1l-2-2-2 2c-2 2-3 2-6 1Zm4-8h.01M15 10h.01"/>', lace: '<path d="M4 12c3-6 5-6 8 0s5 6 8 0M4 16c3-6 5-6 8 0s5 6 8 0"/>', ledger: '<path d="M5 4h5v5H5zM14 4h5v5M5 14v5h5M19 14v5h-5v-5z"/>', trezor: '<path d="M7 9V7a5 5 0 0 1 10 0v2M5 9h14v11H5zM12 13v3"/>'
  });
  function icon(name) { return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name] || ICON_PATHS.automatic}</svg>`; }
  let cachedRates;
  async function rates() {
    if (cachedRates && Date.now() - cachedRates.savedAt < 60000) return cachedRates;
    const ids = [...new Set(Object.values(NETWORKS).map((network) => network.rateId))].join(',');
    const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Live exchange rates are unavailable. No payment was requested.');
    const data = await response.json(); const result = { savedAt: Date.now() };
    for (const network of Object.values(NETWORKS)) { const price = Number(data[network.rateId]?.usd); if (!(price > 0)) throw new Error(`The ${network.symbol} exchange rate is unavailable.`); result[network.symbol] = price; }
    return (cachedRates = result);
  }
  async function quote(usd, currency) {
    const code = String(currency).toUpperCase(); const network = NETWORKS[code]; const value = Number(usd);
    if (!(value > 0) || !network) throw new Error('Choose a valid order value and currency.');
    const liveRates = await rates(); const factor = 10 ** network.decimals;
    const amount = Math.ceil((value / liveRates[code]) * factor) / factor;
    return { currency: code, paymentAsset: code, paymentNetwork: network.network, usd: value, usdRate: liveRates[code], amount, expectedAmount: amount, recipient: network.address, destinationAddress: network.address, uri: paymentUri(code, amount), quotedAt: new Date().toISOString() };
  }
  async function api(path, options) { const response = await fetch(path, { headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(options?.headers || {}) }, ...options }); const result = await response.json(); if (!response.ok || !result.success) throw new Error(result.message || 'Payment service request failed.'); return result.data; }
  async function createOrder(q, product = {}) { return api('/api/payments/orders', { method: 'POST', body: JSON.stringify({ userId: product.userId || product.wallet, wallet: product.wallet, purchaseType: product.productType || product.purchaseType || 'GENERIC', itemId: product.productId || product.itemId || '', basePrice: q.usd, expectedAmount: q.amount, paymentAsset: q.currency, assetNetwork: product.assetNetwork, quantity: product.quantity, metadata: product.metadata }) }); }
  async function submitOrder(orderId, transactionHash, wallet = '') { return api(`/api/payments/orders/${encodeURIComponent(orderId)}/submit`, { method: 'POST', body: JSON.stringify({ transactionHash, wallet }) }); }
  function providers() { const injected = window.ethereum; return injected?.providers || (injected ? [injected] : []); }
  function evmProvider(walletId = 'automatic') { const available = providers(); if (walletId === 'phantom') return available.find((provider) => provider.isPhantom) || window.phantom?.ethereum || null; if (walletId === 'metamask') return available.find((provider) => provider.isMetaMask) || null; return available.find((provider) => provider.isMetaMask) || available.find((provider) => provider.request) || null; }
  function compatibleWallets(currency) { const network = NETWORKS[String(currency).toUpperCase()]; return network ? Object.values(WALLETS).filter((wallet) => wallet.types.includes(network.type)) : []; }
  function openWallet(q, walletName) {
    window.open(q.uri, '_blank', 'noopener,noreferrer');
    return { opened: true, walletName, uri: q.uri };
  }
  function ledgerCurrency(network) {
    return ({ ETH: 'ethereum', POL: 'polygon', BNB: 'bsc', SOL: 'solana', ADA: 'cardano', BTC: 'bitcoin', DOGE: 'dogecoin' })[network.symbol];
  }
  function openHardwareWallet(q, wallet) {
    const network = NETWORKS[q.currency];
    if (wallet.id === 'ledger') {
      const params = new URLSearchParams({ currency: ledgerCurrency(network), recipient: q.recipient, amount: String(q.amount) });
      const uri = `ledgerlive://send?${params}`;
      window.location.assign(uri);
      return { opened: true, walletName: wallet.name, uri, paymentUri: q.uri };
    }
    const uri = 'https://suite.trezor.io/web/';
    window.open(uri, '_blank', 'noopener,noreferrer');
    return { opened: true, walletName: wallet.name, uri, paymentUri: q.uri, requiresManualEntry: true };
  }
  function evmErrorCode(error) { return error?.code ?? error?.data?.originalError?.code; }
  function isUnavailableRpc(error, network) {
    if (!network.rpcUrls?.length) return false;
    const message = [error?.message, error?.data?.message, error?.data?.originalError?.message].filter(Boolean).join(' ');
    return /unauthorized|not authorized|401|rpc|network error|failed to fetch|disconnected/i.test(message);
  }
  async function addEvmNetwork(provider, network) {
    if (!network.rpcUrls?.length || !network.nativeCurrency) throw new Error(`${network.network} is not configured for automatic wallet setup.`);
    await provider.request({ method: 'wallet_addEthereumChain', params: [{
      chainId: network.chainId,
      chainName: network.network,
      nativeCurrency: network.nativeCurrency,
      rpcUrls: network.rpcUrls,
      blockExplorerUrls: network.blockExplorerUrls
    }] });
  }
  async function switchEvm(provider, network) {
    try {
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: network.chainId }] });
    } catch (error) {
      if (Number(evmErrorCode(error)) === 4902) {
        try {
          await addEvmNetwork(provider, network);
          await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: network.chainId }] });
          return;
        } catch (_) { /* Use the actionable error below. */ }
      }
      throw new Error(`Switch your wallet to ${network.network} before paying.`);
    }
  }
  async function requestEvm(provider, request, network) {
    try {
      return await provider.request(request);
    } catch (error) {
      if (!isUnavailableRpc(error, network)) throw error;
      try {
        await addEvmNetwork(provider, network);
        await switchEvm(provider, network);
        return await provider.request(request);
      } catch (_) {
        throw new Error(`Your wallet's ${network.network} RPC is unavailable. Set its RPC URL to ${network.rpcUrls[0]}, then try again.`);
      }
    }
  }
  async function sendEvm(q, walletId = 'automatic') { const provider = evmProvider(walletId); const selectedName = WALLETS[walletId]?.name || 'MetaMask'; if (!provider?.request) return openWallet(q, selectedName === 'Best available wallet' ? 'MetaMask' : selectedName); const network = NETWORKS[q.currency]; await switchEvm(provider, network); await requestEvm(provider, { method: 'eth_getBlockByNumber', params: ['latest', false] }, network); const [address] = await requestEvm(provider, { method: 'eth_requestAccounts' }, network); const value = BigInt(Math.ceil(q.amount * 1e9)) * 1000000000n; const transactionHash = await requestEvm(provider, { method: 'eth_sendTransaction', params: [{ from: address, to: q.recipient, value: `0x${value.toString(16)}` }] }, network); return { address, transactionHash, walletName: selectedName === 'Best available wallet' ? (provider.isPhantom ? 'Phantom' : 'MetaMask') : selectedName }; }
  async function sendSolana(q) { const provider = window.phantom?.solana || (window.solana?.isPhantom ? window.solana : null); if (!provider?.connect || !provider?.signAndSendTransaction) throw new Error('Install or open Phantom, then try again.'); const web3 = await import('https://esm.sh/@solana/web3.js@1.98.4'); const connection = new web3.Connection(web3.clusterApiUrl('mainnet-beta'), 'confirmed'); const connected = await provider.connect(); const from = connected.publicKey || provider.publicKey; const transaction = new web3.Transaction().add(web3.SystemProgram.transfer({ fromPubkey: from, toPubkey: new web3.PublicKey(q.recipient), lamports: Math.ceil(q.amount * web3.LAMPORTS_PER_SOL) })); transaction.feePayer = from; transaction.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash; const result = await provider.signAndSendTransaction(transaction); return { address: from.toString(), transactionHash: result.signature || result }; }
  async function initiate(q, walletId = 'automatic') { const network = NETWORKS[q.currency]; const wallet = WALLETS[walletId] || WALLETS.automatic; if (!wallet.types.includes(network.type)) throw new Error(`${wallet.name} does not support ${network.network}. Choose a compatible wallet.`); if (wallet.hardware) return openHardwareWallet(q, wallet); if (network.type === 'evm') return sendEvm(q, walletId); if (network.type === 'solana') return (window.phantom?.solana || window.solana?.isPhantom) ? sendSolana(q) : openWallet(q, 'Phantom'); if (network.type === 'cardano') return openWallet(q, wallet.id === 'automatic' ? 'Lace' : wallet.name); return openWallet(q, wallet.id === 'automatic' ? `${network.name} wallet` : wallet.name); }
  async function pay(usd, currency, product = {}, walletId = 'automatic') { const q = await quote(usd, currency); const order = await createOrder(q, product); const sent = await initiate(q, walletId); if (sent.opened) throw new Error(`${sent.walletName} opened. Approve the prepared payment in your wallet; the transaction will submit automatically when the wallet returns a receipt.`); const verified = await submitOrder(order.orderId, sent.transactionHash, sent.address); if (!['PAID', 'FULFILLED'].includes(verified.paymentStatus)) throw new Error(`Transaction submitted for ${verified.paymentNetwork}. Status: ${verified.paymentStatus}. Assets and MZK remain locked until independent verification.`); return { ...q, ...sent, orderId: order.orderId, paymentStatus: verified.paymentStatus }; }
  async function quoteEthValue(eth, currency) { const liveRates = await rates(); return quote(Number(eth) * liveRates.ETH, currency); }
  window.MuzikazWalletPayments = { NETWORKS, RECIPIENTS, WALLETS, compatibleWallets, icon, rates, quote, quoteEthValue, createOrder, submitOrder, initiate, pay, paymentUri };
}());
