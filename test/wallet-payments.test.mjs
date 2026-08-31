import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const configSource = await readFile('payment-config.js', 'utf8');
const paymentsSource = await readFile('wallet-payments.js', 'utf8');

function loadPayments(extraWindow = {}) {
  const window = { location: { opened: '', assign(uri) { this.opened = uri; } }, ...extraWindow };
  const context = vm.createContext({ window, globalThis: window, fetch: async () => { throw new Error('Unexpected fetch'); }, URL, Date, BigInt });
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
    assert.equal(window.location.opened, quote.uri);
  }
});

test('prefers the injected MetaMask provider for EVM payment', async () => {
  const calls = [];
  const metamask = { isMetaMask: true, async request(request) { calls.push(request); if (request.method === 'eth_requestAccounts') return ['0xabc']; if (request.method === 'eth_sendTransaction') return '0xhash'; } };
  const window = loadPayments({ ethereum: { providers: [{ request() { throw new Error('Wrong provider'); } }, metamask] } });
  const network = window.MuzikazPaymentConfig.MUZIKAZ_PAYMENT_NETWORKS.ETH;
  const result = await window.MuzikazWalletPayments.initiate({ currency: 'ETH', amount: 1, recipient: network.address, uri: 'ethereum:test' });
  assert.equal(result.walletName, 'MetaMask');
  assert.equal(result.transactionHash, '0xhash');
  assert.deepEqual(calls.map(({ method }) => method), ['wallet_switchEthereumChain', 'eth_requestAccounts', 'eth_sendTransaction']);
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
