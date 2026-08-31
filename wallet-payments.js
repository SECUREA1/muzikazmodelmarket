(function () {
  'use strict';
  const configApi = window.MuzikazPaymentConfig;
  if (!configApi) throw new Error('Load payment-config.js before wallet-payments.js.');
  const { MUZIKAZ_PAYMENT_NETWORKS: NETWORKS, paymentUri } = configApi;
  const RECIPIENTS = Object.freeze(Object.fromEntries(Object.entries(NETWORKS).map(([symbol, config]) => [symbol, config.address])));
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
  async function submitOrder(orderId, transactionHash) { return api(`/api/payments/orders/${encodeURIComponent(orderId)}/submit`, { method: 'POST', body: JSON.stringify({ transactionHash }) }); }
  async function switchEvm(network) { try { await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: network.chainId }] }); } catch (error) { throw new Error(`Switch your wallet to ${network.network} before paying. ${error.message || ''}`.trim()); } }
  async function sendEvm(q) { if (!window.ethereum?.request) throw new Error('Install or open an EVM wallet, then try again.'); const network = NETWORKS[q.currency]; await switchEvm(network); const [address] = await window.ethereum.request({ method: 'eth_requestAccounts' }); const value = BigInt(Math.ceil(q.amount * 1e9)) * 1000000000n; const transactionHash = await window.ethereum.request({ method: 'eth_sendTransaction', params: [{ from: address, to: q.recipient, value: `0x${value.toString(16)}` }] }); return { address, transactionHash }; }
  async function sendSolana(q) { const provider = window.phantom?.solana || (window.solana?.isPhantom ? window.solana : null); if (!provider?.connect || !provider?.signAndSendTransaction) throw new Error('Install or open Phantom, then try again.'); const web3 = await import('https://esm.sh/@solana/web3.js@1.98.4'); const connection = new web3.Connection(web3.clusterApiUrl('mainnet-beta'), 'confirmed'); const connected = await provider.connect(); const from = connected.publicKey || provider.publicKey; const transaction = new web3.Transaction().add(web3.SystemProgram.transfer({ fromPubkey: from, toPubkey: new web3.PublicKey(q.recipient), lamports: Math.ceil(q.amount * web3.LAMPORTS_PER_SOL) })); transaction.feePayer = from; transaction.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash; const result = await provider.signAndSendTransaction(transaction); return { address: from.toString(), transactionHash: result.signature || result }; }
  async function sendCardano(q) { if (!window.cardano?.lace?.enable) throw new Error('Install or open Lace, then try again.'); const { BrowserWallet, Transaction } = await import('https://esm.sh/@meshsdk/core@1.9.0'); const wallet = await BrowserWallet.enable('lace'); const addresses = await wallet.getUsedAddresses(); const unsignedTx = await new Transaction({ initiator: wallet }).sendLovelace(q.recipient, String(Math.ceil(q.amount * 1e6))).build(); const signedTx = await wallet.signTx(unsignedTx, true); return { address: addresses[0] || 'Lace wallet', transactionHash: await wallet.submitTx(signedTx) }; }
  async function initiate(q) { const network = NETWORKS[q.currency]; if (network.type === 'evm') return sendEvm(q); if (network.type === 'solana') return sendSolana(q); if (network.type === 'cardano') return sendCardano(q); window.location.href = q.uri; throw new Error(`${network.name} wallet opened. Return here and submit the transaction ID; opening a wallet does not complete payment.`); }
  async function pay(usd, currency, product = {}) { const q = await quote(usd, currency); const order = await createOrder(q, product); const sent = await initiate(q); const verified = await submitOrder(order.orderId, sent.transactionHash); if (!['PAID', 'FULFILLED'].includes(verified.paymentStatus)) throw new Error(`Transaction submitted for ${verified.paymentNetwork}. Status: ${verified.paymentStatus}. Assets and MZK remain locked until independent verification.`); return { ...q, ...sent, orderId: order.orderId, paymentStatus: verified.paymentStatus }; }
  async function quoteEthValue(eth, currency) { const liveRates = await rates(); return quote(Number(eth) * liveRates.ETH, currency); }
  window.MuzikazWalletPayments = { NETWORKS, RECIPIENTS, rates, quote, quoteEthValue, createOrder, submitOrder, initiate, pay, paymentUri };
}());
