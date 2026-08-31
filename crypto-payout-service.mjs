import { MUZIKAZ_PAYMENT_NETWORKS } from './payment-order-store.mjs';

export class CryptoPayoutService {
  constructor({ endpoint = process.env.MUZIKAZ_PAYOUT_URL, token = process.env.MUZIKAZ_PAYOUT_TOKEN, fetchImpl = fetch } = {}) { this.endpoint = endpoint; this.token = token; this.fetch = fetchImpl; }
  async send(input = {}) {
    const currency = String(input.currency || '').toUpperCase(), usd = Number(input.usd), mzk = Math.floor(Number(input.mzk)), wallet = String(input.wallet || '').trim();
    if (!MUZIKAZ_PAYMENT_NETWORKS[currency]) throw new Error('Choose a supported payout currency.');
    if (!(usd > 0) || mzk < 100 || Math.abs(usd - mzk / 100 * .6) > .001) throw new Error('The swap-back quote must equal 60% of the MZK store value.');
    if (!wallet) throw new Error('Connect a receiving wallet before swapping back.');
    if (!this.endpoint || !this.token) throw new Error('Instant crypto payouts are not configured yet. Your MZK was not changed.');
    const response = await this.fetch(this.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` }, body: JSON.stringify({ currency, usd, mzk, wallet }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.transactionHash || !(Number(result.amount) > 0)) throw new Error(result.message || 'The payout provider did not confirm a crypto transaction. Your MZK was not changed.');
    return { currency, usd, mzk, wallet, amount: Number(result.amount), transactionHash: String(result.transactionHash) };
  }
}
