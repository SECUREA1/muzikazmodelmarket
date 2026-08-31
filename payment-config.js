(function (root, factory) {
  const config = factory();
  if (typeof module === 'object' && module.exports) module.exports = config;
  root.MuzikazPaymentConfig = config;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const EVM_ADDRESS = '0xe4949a8Bb40A96A30bEaEa4C5f6ac06e9a446d16';
  const MUZIKAZ_PAYMENT_NETWORKS = Object.freeze({
    ETH: Object.freeze({ symbol: 'ETH', name: 'Ethereum', network: 'Ethereum Mainnet', address: EVM_ADDRESS, type: 'evm', chainId: '0x1', decimals: 18, rateId: 'ethereum', uri: 'ethereum', nativeCurrency: Object.freeze({ name: 'Ether', symbol: 'ETH', decimals: 18 }), rpcUrls: Object.freeze(['https://ethereum-rpc.publicnode.com']), blockExplorerUrls: Object.freeze(['https://etherscan.io']) }),
    POL: Object.freeze({ symbol: 'POL', name: 'Polygon', network: 'Polygon Mainnet', address: EVM_ADDRESS, type: 'evm', chainId: '0x89', decimals: 18, rateId: 'polygon-ecosystem-token', uri: 'ethereum', nativeCurrency: Object.freeze({ name: 'POL', symbol: 'POL', decimals: 18 }), rpcUrls: Object.freeze(['https://polygon.drpc.org']), blockExplorerUrls: Object.freeze(['https://polygonscan.com']) }),
    BNB: Object.freeze({ symbol: 'BNB', name: 'BNB Smart Chain', network: 'BNB Smart Chain', address: EVM_ADDRESS, type: 'evm', chainId: '0x38', decimals: 18, rateId: 'binancecoin', uri: 'ethereum', nativeCurrency: Object.freeze({ name: 'BNB', symbol: 'BNB', decimals: 18 }), rpcUrls: Object.freeze(['https://bsc-rpc.publicnode.com']), blockExplorerUrls: Object.freeze(['https://bscscan.com']) }),
    SOL: Object.freeze({ symbol: 'SOL', name: 'Solana', network: 'Solana Mainnet', address: 'CZbaAbfZ97N9cocF221S3pyVP1isA59XTdciYspN27dA', type: 'solana', decimals: 9, rateId: 'solana', uri: 'solana', rpcUrls: Object.freeze(['https://api.mainnet-beta.solana.com']), blockExplorerUrls: Object.freeze(['https://explorer.solana.com']) }),
    ADA: Object.freeze({ symbol: 'ADA', name: 'Cardano', network: 'Cardano Mainnet', address: 'addr1qx0ltv489yhkkd7uthdaka88sd373hxlhzg2glfupewesd9xj50w8ales2f8h0cpw7949l8xpvsnyvah348glfeyk26qjqmxp6', type: 'cardano', decimals: 6, rateId: 'cardano', uri: 'web+cardano' }),
    BTC: Object.freeze({ symbol: 'BTC', name: 'Bitcoin', network: 'Bitcoin Mainnet', address: '3Ga2sP3ghtMpXxo3mZfE2fJ1EXEMB7GvEJ', type: 'bitcoin', decimals: 8, rateId: 'bitcoin', uri: 'bitcoin' }),
    DOGE: Object.freeze({ symbol: 'DOGE', name: 'Dogecoin', network: 'Dogecoin Mainnet', address: 'DToEWmramFNbQ7Jut1NKKCHLpJSFPiJ4hv', type: 'dogecoin', decimals: 8, rateId: 'dogecoin', uri: 'dogecoin' })
  });
  const PAYMENT_STATUSES = Object.freeze(['CREATED', 'AWAITING_PAYMENT', 'TRANSACTION_SUBMITTED', 'CONFIRMING', 'PAID', 'FULFILLED', 'EXPIRED', 'FAILED']);
  function paymentUri(symbol, amount) {
    const config = MUZIKAZ_PAYMENT_NETWORKS[String(symbol).toUpperCase()];
    if (!config) throw new Error('Unsupported Muzikaz payment asset.');
    const value = Number(amount);
    const query = Number.isFinite(value) && value > 0 ? `?amount=${encodeURIComponent(value)}` : '';
    if (config.type === 'evm') return `ethereum:${config.address}@${BigInt(config.chainId).toString()}${value > 0 ? `?value=${BigInt(Math.ceil(value * 1e9)) * 1000000000n}` : ''}`;
    if (config.type === 'solana') return `solana:${config.address}${query}`;
    return `${config.uri}:${config.address}${query}`;
  }
  return Object.freeze({ MUZIKAZ_PAYMENT_NETWORKS, PAYMENT_STATUSES, paymentUri });
}));
