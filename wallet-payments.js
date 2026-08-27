(function () {
  'use strict';
  const RECIPIENTS = Object.freeze({ ADA: 'addr1q8sww2l7nuxl5qj2fuurle8y9ecz27cjzmwshx9s9esggdv4du3zqssvpcfmr6a737jf7jjp0n4ma7q84pffsjag67kqlj59xj', SOL: 'CB7HbgeM6TdYibnDpHeLCq6Qoxdaue7XtC6NGgqDQauH' });
  let cachedRates;
  async function rates() {
    if (cachedRates && Date.now() - cachedRates.savedAt < 60000) return cachedRates;
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=cardano,ethereum,solana&vs_currencies=usd', { cache: 'no-store' });
    if (!response.ok) throw new Error('Live ETH/ADA/SOL exchange rates are unavailable. No payment was requested.');
    const data = await response.json();
    if (!(data.cardano?.usd > 0) || !(data.ethereum?.usd > 0) || !(data.solana?.usd > 0)) throw new Error('The exchange-rate response was invalid. No payment was requested.');
    return (cachedRates = { ADA: data.cardano.usd, ETH: data.ethereum.usd, SOL: data.solana.usd, savedAt: Date.now() });
  }
  async function quote(usd, currency) {
    const code = String(currency).toUpperCase();
    const value = Number(usd);
    if (!(value > 0) || !['ADA', 'SOL'].includes(code)) throw new Error('Choose a valid order value and currency.');
    const liveRates = await rates();
    const decimals = code === 'ADA' ? 6 : 9;
    const amount = Math.ceil((value / liveRates[code]) * (10 ** decimals)) / (10 ** decimals);
    return { currency: code, usd: value, usdRate: liveRates[code], amount, recipient: RECIPIENTS[code], quotedAt: new Date().toISOString() };
  }
  async function paySolana(q) {
    const provider = window.phantom?.solana || (window.solana?.isPhantom ? window.solana : null);
    if (!provider?.connect || !provider?.signAndSendTransaction) throw new Error('Install or open Phantom, then try the SOL payment again.');
    const web3 = await import('https://esm.sh/@solana/web3.js@1.98.4');
    const connection = new web3.Connection(web3.clusterApiUrl('mainnet-beta'), 'confirmed');
    const connected = await provider.connect();
    const from = connected.publicKey || provider.publicKey;
    const transaction = new web3.Transaction().add(web3.SystemProgram.transfer({ fromPubkey: from, toPubkey: new web3.PublicKey(q.recipient), lamports: Math.ceil(q.amount * web3.LAMPORTS_PER_SOL) }));
    transaction.feePayer = from;
    transaction.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash;
    const result = await provider.signAndSendTransaction(transaction);
    const transactionHash = result.signature || result;
    await connection.confirmTransaction(transactionHash, 'confirmed');
    return { address: from.toString(), transactionHash };
  }
  async function payCardano(q) {
    if (!window.cardano?.lace?.enable) throw new Error('Install or open Lace, then try the ADA payment again.');
    const { BrowserWallet, Transaction } = await import('https://esm.sh/@meshsdk/core@1.9.0');
    const wallet = await BrowserWallet.enable('lace');
    const addresses = await wallet.getUsedAddresses();
    const unsignedTx = await new Transaction({ initiator: wallet }).sendLovelace(q.recipient, String(Math.ceil(q.amount * 1000000))).build();
    const signedTx = await wallet.signTx(unsignedTx, true);
    return { address: addresses[0] || 'Lace wallet', transactionHash: await wallet.submitTx(signedTx) };
  }
  async function pay(usd, currency) {
    const q = await quote(usd, currency);
    return { ...q, ...(currency === 'ADA' ? await payCardano(q) : await paySolana(q)) };
  }
  async function quoteEthValue(eth, currency) {
    const liveRates = await rates();
    return quote(Number(eth) * liveRates.ETH, currency);
  }
  window.MuzikazWalletPayments = { RECIPIENTS, quote, quoteEthValue, pay };
}());
