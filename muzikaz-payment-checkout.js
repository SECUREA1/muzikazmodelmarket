(function () {
  'use strict';
  const WARNING = 'SEND ONLY THE SELECTED ASSET USING THE SELECTED NETWORK. SENDING FUNDS USING AN INCOMPATIBLE NETWORK MAY RESULT IN PERMANENT LOSS.';
  class MuzikazPaymentCheckout extends HTMLElement {
    connectedCallback() { this.asset = this.getAttribute('payment-asset') || 'ETH'; this.render(); this.refresh(); }
    product() { return { productId: this.getAttribute('product-id') || 'muzikaz-order', productType: this.getAttribute('product-type') || 'GENERIC', quantity: Number(this.getAttribute('quantity')) || 1, assetNetwork: this.getAttribute('asset-network') || null, userId: this.getAttribute('user-id') || '', metadata: {}, ...(this.checkoutProduct || {}) }; }
    price() { return Number(this.getAttribute('base-price')) || 0; }
    render() {
      const supported = ['ETH', 'POL', 'BNB', 'SOL', 'ADA'];
      this.innerHTML = `<section class="muzikaz-payment"><header><p>Secure multi-chain checkout</p><h2>${this.getAttribute('item-name') || 'MUZIKAZ purchase'}</h2></header><div class="payment-selectors"><fieldset class="payment-choice-group" data-payment-assets><legend>1. Payment currency</legend></fieldset><fieldset class="payment-choice-group" data-payment-wallets><legend>2. Wallet</legend></fieldset></div><dl><div><dt>Order total</dt><dd data-base-price></dd></div><div><dt>Wallet transfer</dt><dd data-amount>Loading live quote…</dd></div></dl><p class="payment-network-warning">${WARNING}</p><button type="button" data-pay>Pay &amp; submit transaction</button><p data-status role="status">Choose a currency and wallet, then approve the transfer. Purchased items are delivered after verification.</p></section>`;
      this.querySelector('[data-payment-assets]').innerHTML += supported.map((symbol) => this.choice('asset', symbol, window.MuzikazPaymentConfig.MUZIKAZ_PAYMENT_NETWORKS[symbol].network, symbol === this.asset)).join('');
      this.querySelector('[data-payment-assets]').addEventListener('change', (event) => { this.asset = event.target.value; this.order = null; this.renderWallets(); this.refresh(); });
      this.querySelector('[data-pay]').addEventListener('click', () => this.pay());
      this.renderWallets();
    }
    icon(name) { return window.MuzikazWalletPayments.icon?.(name) || '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v12H4zM4 10h16M16 15h2"/></svg>'; }
    choice(name, value, label, checked = false) { return `<label class="payment-choice"><input type="radio" name="payment-${name}" value="${value}" ${checked ? 'checked' : ''}><span>${this.icon(value)}<b>${value}</b><small>${label}</small></span></label>`; }
    renderWallets() { const group = this.querySelector('[data-payment-wallets]'); const wallets = window.MuzikazWalletPayments.compatibleWallets(this.asset); group.querySelectorAll('.payment-choice').forEach((choice) => choice.remove()); group.insertAdjacentHTML('beforeend', wallets.map((wallet, index) => this.choice('wallet', wallet.id, wallet.hardware ? `${wallet.name} · hardware` : wallet.name, index === 0)).join('')); }
    status(message) { this.querySelector('[data-status]').textContent = message; }
    async refresh() {
      const network = window.MuzikazPaymentConfig.MUZIKAZ_PAYMENT_NETWORKS[this.asset]; const price = this.price();
      this.querySelector('[data-base-price]').textContent = price > 0 ? `$${price.toFixed(2)} USD` : 'Set by order';
      this.order = null;
      try { this.quote = await window.MuzikazWalletPayments.quote(price, this.asset); this.querySelector('[data-amount]').textContent = `${this.quote.amount} ${this.asset} on ${network.network}`; }
      catch (error) { this.querySelector('[data-amount]').textContent = error.message; }
    }
    async ensureOrder() { if (!this.quote) throw new Error('Wait for a valid live quote.'); if (!this.order) this.order = await window.MuzikazWalletPayments.createOrder(this.quote, this.product()); return this.order; }
    async pay() { const button = this.querySelector('[data-pay]'); button.disabled = true; try { if (this.checkoutValidator && !this.checkoutValidator()) return; const order = await this.ensureOrder(); const wallet = this.querySelector('[name="payment-wallet"]:checked'); const walletId = wallet.value; this.status(`Opening ${wallet.closest('label').querySelector('small').textContent}. Approve the exact ${this.asset} transfer…`); this.sent = await window.MuzikazWalletPayments.initiate(this.quote, walletId); if (this.sent.opened) { this.status(`${this.sent.walletName} opened with the prepared payment. Approve it in the wallet.`); return; } const result = await window.MuzikazWalletPayments.submitOrder(order.orderId, this.sent.transactionHash, this.sent.address); const paid = ['PAID', 'FULFILLED'].includes(result.paymentStatus); this.status(`${result.paymentNetwork}: ${result.paymentStatus}. ${paid ? 'Payment verified and items delivered.' : 'Verification is in progress; delivery unlocks when paid.'}`); this.dispatchEvent(new CustomEvent('muzikaz-payment-status', { bubbles: true, detail: { ...result, ...this.quote, ...this.sent } })); } catch (error) { this.status(error.message); } finally { button.disabled = false; } }
  }
  customElements.define('muzikaz-payment-checkout', MuzikazPaymentCheckout);
}());
