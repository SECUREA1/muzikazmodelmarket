import { swapBackQuote } from './mzk-swap-quote.mjs';

const SUPPORTED_CURRENCIES = new Set(['ETH', 'POL', 'BNB', 'SOL', 'ADA', 'BTC', 'DOGE']);

export class CryptoPayoutService {
  constructor({ url = process.env.MUZIKAZ_PAYOUT_URL, token = process.env.MUZIKAZ_PAYOUT_TOKEN, fetchImpl = globalThis.fetch } = {}) {
    this.url = String(url || '').trim();
    this.token = String(token || '').trim();
    this.fetch = fetchImpl;
  }

  async request(input = {}) {
    if (!this.url || !this.token) {
      const error = new Error('Crypto payouts are not configured. No MZK was deducted.');
      error.statusCode = 503;
      throw error;
    }
    const currency = String(input.currency || '').toUpperCase();
    if (!SUPPORTED_CURRENCIES.has(currency)) throw new Error('Choose a supported payout currency.');
    const quote = swapBackQuote(input.mzk);
    const destinationAddress = String(input.destinationAddress || '').trim();
    if (!destinationAddress) throw new Error('A destination wallet address is required.');
    const response = await this.fetch(this.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ currency, payoutUsd: quote.payoutUsd, storeUsd: quote.storeUsd, lockedLiquidityUsd: quote.lockedLiquidityUsd, liquidityLockRequired: true, mzk: quote.mzk, destinationAddress, walletId: String(input.walletId || '') })
    });
    let result;
    try { result = await response.json(); } catch { result = {}; }
    if (!response.ok) throw new Error(result.message || 'The payout provider rejected the request. No MZK was deducted.');
    const transactionHash = String(result.transactionHash || result.data?.transactionHash || '').trim();
    const paidAmount = Number(result.amount ?? result.paidAmount ?? result.data?.amount);
    const confirmedPayoutUsd = Number(result.payoutUsd ?? result.usdAmount ?? result.data?.payoutUsd);
    const liquidityLocked = (result.liquidityLocked ?? result.data?.liquidityLocked) === true;
    if (!transactionHash || !Number.isFinite(paidAmount) || paidAmount <= 0 || confirmedPayoutUsd !== quote.payoutUsd || !liquidityLocked) {
      throw new Error('The payout provider did not return valid payment proof. No MZK was deducted.');
    }
    return { ...quote, currency, paidAmount, destinationAddress, transactionHash, liquidityLocked };
  }
}

export const cryptoPayoutService = new CryptoPayoutService();
