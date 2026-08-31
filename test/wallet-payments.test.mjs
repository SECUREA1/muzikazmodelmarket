import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const configSource = await readFile('payment-config.js', 'utf8');
const paymentsSource = await readFile('wallet-payments.js', 'utf8');

function loadPayments(extraWindow = {}) {
  const window = { opened: [], focusedPopups: 0, location: { assigned: [], assign(uri) { this.assigned.push(uri); } }, open(uri, target, features) { this.opened.push({ uri, target, features }); return { focus: () => { this.focusedPopups += 1; } }; }, ...extraWindow };
  const context = vm.createContext({ window, globalThis: window, fetch: async () => { throw new Error('Unexpected fetch'); }, URL, URLSearchParams, Date, BigInt });
  vm.runInContext(configSource, context);
  vm.runInContext(paymentsSource, context);
  return window;
}

test('opens the correct wallet payment URI when chain providers are unavailable', async () => {
  const window = loadPayments();
  for (const [currency, walletName] of [['ETH', 'MetaMask'], ['SOL', 'Phantom'], ['ADA', 'Lace'], ['BTC', 'Bitcoin wallet'], ['DOGE', 'Dogecoin wallet']]) {
    const network = window.MuzikazPaymentConfig.MUZIKAZ_PAYMENT_NETWORKS[currency];
    const quote = { currency, amount: 1, recipient: network.address, uri: window.MuzikazPaymentConfig.paymentUri(currency, 1) };
    const result = await window.MuzikazWalletPayments.initiate(quote);
    assert.equal(result.opened, true);
    assert.equal(result.walletName, walletName);
    assert.deepEqual(window.opened.at(-1), { uri: quote.uri, target: '_blank', features: 'noopener,noreferrer' });
  }
});

test('connects Lace through CIP-30 before opening its prepared ADA payment', async () => {
  const calls = [];
  const window = loadPayments({ cardano: { lace: { async enable() { calls.push('enable'); return { async getNetworkId() { calls.push('network'); return 1; }, async getUsedAddresses() { calls.push('addresses'); return ['lace-address-cbor']; } }; } } } });
  const network = window.MuzikazPaymentConfig.MUZIKAZ_PAYMENT_NETWORKS.ADA;
  const result = await window.MuzikazWalletPayments.initiate({ currency: 'ADA', amount: 12.5, recipient: network.address, uri: window.MuzikazPaymentConfig.paymentUri('ADA', 12.5) }, 'lace');
  assert.equal(result.opened, true);
  assert.equal(result.connected, true);
  assert.equal(result.address, 'lace-address-cbor');
  assert.deepEqual(calls, ['enable', 'network', 'addresses']);
  assert.match(result.uri, /^web\+cardano:/);
  assert.equal(window.focusedPopups, 1);
});

test('asks Lace users to switch to Cardano Mainnet before payment', async () => {
  const window = loadPayments({ cardano: { lace: { async enable() { return { async getNetworkId() { return 0; } }; } } } });
  const network = window.MuzikazPaymentConfig.MUZIKAZ_PAYMENT_NETWORKS.ADA;
  await assert.rejects(
    window.MuzikazWalletPayments.initiate({ currency: 'ADA', amount: 1, recipient: network.address, uri: 'web+cardano:test' }, 'lace'),
    /Switch Lace to Cardano Mainnet/
  );
  assert.equal(window.opened.length, 0);
});

test('opens Ledger Live with a prepared send instead of a generic wallet handler', async () => {
  const window = loadPayments();
  const network = window.MuzikazPaymentConfig.MUZIKAZ_PAYMENT_NETWORKS.BTC;
  const quote = { currency: 'BTC', amount: 0.001, recipient: network.address, uri: window.MuzikazPaymentConfig.paymentUri('BTC', 0.001) };
  const result = await window.MuzikazWalletPayments.initiate(quote, 'ledger');
  assert.equal(result.walletName, 'Ledger');
  assert.match(result.uri, /^ledgerlive:\/\/send\?currency=bitcoin&recipient=/);
  assert.equal(window.location.assigned[0], result.uri);
  assert.equal(window.opened.length, 0);
});

test('opens Trezor Suite and returns the exact payment request for manual Send entry', async () => {
  const window = loadPayments();
  const network = window.MuzikazPaymentConfig.MUZIKAZ_PAYMENT_NETWORKS.DOGE;
  const quote = { currency: 'DOGE', amount: 25, recipient: network.address, uri: window.MuzikazPaymentConfig.paymentUri('DOGE', 25) };
  const result = await window.MuzikazWalletPayments.initiate(quote, 'trezor');
  assert.equal(result.walletName, 'Trezor');
  assert.equal(result.requiresManualEntry, true);
  assert.equal(result.paymentUri, quote.uri);
  assert.deepEqual(window.opened[0], { uri: 'https://suite.trezor.io/web/', target: '_blank', features: 'noopener,noreferrer' });
});

test('prefers the injected MetaMask provider for EVM payment', async () => {
  const calls = [];
  const metamask = { isMetaMask: true, async request(request) { calls.push(request); if (request.method === 'eth_requestAccounts') return ['0xabc']; if (request.method === 'eth_sendTransaction') return '0xhash'; } };
  const window = loadPayments({ ethereum: { providers: [{ request() { throw new Error('Wrong provider'); } }, metamask] } });
  const network = window.MuzikazPaymentConfig.MUZIKAZ_PAYMENT_NETWORKS.ETH;
  const result = await window.MuzikazWalletPayments.initiate({ currency: 'ETH', amount: 1, recipient: network.address, uri: 'ethereum:test' });
  assert.equal(result.walletName, 'MetaMask');
  assert.equal(result.transactionHash, '0xhash');
  assert.deepEqual(calls.map(({ method }) => method), ['wallet_switchEthereumChain', 'eth_getBlockByNumber', 'eth_requestAccounts', 'eth_sendTransaction']);
});

test('repairs an unauthorized Polygon RPC before requesting payment', async () => {
  const calls = []; let blockAttempts = 0;
  const metamask = { isMetaMask: true, async request(request) {
    calls.push(request);
    if (request.method === 'eth_getBlockByNumber' && blockAttempts++ === 0) throw new Error('RPC 0x89 Custom eth_getBlockByNumber: Unauthorized');
    if (request.method === 'eth_requestAccounts') return ['0xabc'];
    if (request.method === 'eth_sendTransaction') return '0xpolygonhash';
    return '0x1';
  } };
  const window = loadPayments({ ethereum: metamask });
  const network = window.MuzikazPaymentConfig.MUZIKAZ_PAYMENT_NETWORKS.POL;
  const result = await window.MuzikazWalletPayments.initiate({ currency: 'POL', amount: 1, recipient: network.address, uri: 'ethereum:test' }, 'metamask');
  assert.equal(result.transactionHash, '0xpolygonhash');
  const addRequest = calls.find(({ method }) => method === 'wallet_addEthereumChain');
  assert.equal(addRequest.params[0].chainId, '0x89');
  assert.deepEqual(Array.from(addRequest.params[0].rpcUrls), ['https://polygon.drpc.org']);
  assert.equal(calls.filter(({ method }) => method === 'eth_getBlockByNumber').length, 2);
});


test('only offers wallets compatible with each payment chain', () => {
  const window = loadPayments();
  const solana = Array.from(window.MuzikazWalletPayments.compatibleWallets('SOL'), ({ id }) => id);
  const cardano = Array.from(window.MuzikazWalletPayments.compatibleWallets('ADA'), ({ id }) => id);
  assert.deepEqual(solana, ['automatic', 'phantom', 'ledger']);
  assert.deepEqual(cardano, ['automatic', 'lace', 'ledger', 'trezor']);
  assert.equal(window.MuzikazWalletPayments.WALLETS.ledger.hardware, true);
  assert.equal(window.MuzikazWalletPayments.WALLETS.trezor.hardware, true);
});

test('rejects a wallet selected for an incompatible network', async () => {
  const window = loadPayments();
  const network = window.MuzikazPaymentConfig.MUZIKAZ_PAYMENT_NETWORKS.SOL;
  await assert.rejects(
    window.MuzikazWalletPayments.initiate({ currency: 'SOL', amount: 1, recipient: network.address, uri: 'solana:test' }, 'trezor'),
    /does not support Solana Mainnet/
  );
});
