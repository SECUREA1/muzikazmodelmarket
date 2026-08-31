(function () {
  'use strict';
  const WARNING = 'SEND ONLY THE SELECTED ASSET USING THE SELECTED NETWORK. SENDING FUNDS USING AN INCOMPATIBLE NETWORK MAY RESULT IN PERMANENT LOSS.';
  class MuzikazPaymentCheckout extends HTMLElement {
    connectedCallback() { this.asset = this.getAttribute('payment-asset') || 'ETH'; this.render(); this.refresh(); }
    product() { return { productId: this.getAttribute('product-id') || 'muzikaz-order', productType: this.getAttribute('product-type') || 'GENERIC', quantity: Number(this.getAttribute('quantity')) || 1, assetNetwork: this.getAttribute('asset-network') || null, userId: this.getAttribute('user-id') || '', metadata: {}, ...(this.checkoutProduct || {}) }; }
    price() { return Number(this.getAttribute('base-price')) || 0; }
    render() {
      const supported = ['ETH', 'POL', 'BNB', 'SOL', 'ADA'];
      this.innerHTML = `<section class="muzikaz-payment"><header><p>Secure multi-chain checkout</p><h2>${this.getAttribute('item-name') || 'MUZIKAZ purchase'}</h2></header><div class="payment-selectors"><fieldset class="payment-choice-group" data-payment-assets><legend>1. Select asset</legend></fieldset><fieldset class="payment-choice-group" data-payment-wallets><legend>2. Connect wallet</legend></fieldset></div><dl><div><dt>Order total</dt><dd data-base-price></dd></div><div><dt>Amount / network</dt><dd data-amount>Loading live quote…</dd></div><div><dt>Receiving address</dt><dd data-recipient></dd></div><div><dt>Network fee</dt><dd>Estimated by your wallet before approval</dd></div></dl><p class="payment-network-warning">${WARNING}</p><button type="button" data-pay>Pay / sign transaction</button><ol class="payment-progress" aria-label="Payment status"><li>Wallet</li><li>Signature</li><li>Submitted</li><li>Confirming</li><li>Verified</li><li>Complete</li></ol><p data-status role="status">Waiting for wallet. Choose an asset and wallet; no personal details are required.</p></section>`;
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
      this.querySelector('[data-base-price]').textContent = price > 0 ? `$${price.toFixed(2)} USD` : 'Set by order'; this.querySelector('[data-recipient]').textContent = network.address;
      this.order = null;
      try { this.quote = await window.MuzikazWalletPayments.quote(price, this.asset); this.querySelector('[data-amount]').textContent = `${this.quote.amount} ${this.asset} on ${network.network}`; }
      catch (error) { this.querySelector('[data-amount]').textContent = error.message; }
    }
    async ensureOrder() { if (!this.quote) throw new Error('Wait for a valid live quote.'); if (!this.order) this.order = await window.MuzikazWalletPayments.createOrder(this.quote, this.product()); return this.order; }
    async pay() { const button = this.querySelector('[data-pay]'); button.disabled = true; try { if (this.checkoutValidator && !this.checkoutValidator()) return; const order = await this.ensureOrder(); const wallet = this.querySelector('[name="payment-wallet"]:checked'); const walletId = wallet.value; this.status(`Signature requested. Approve the exact ${this.asset} transfer in ${wallet.closest('label').querySelector('small').textContent}…`); this.sent = await window.MuzikazWalletPayments.initiate(this.quote, walletId); if (this.sent.opened) { this.status(`${this.sent.walletName} opened with the prepared payment. Approve it in the wallet; no transaction hash form is required.`); return; } this.status(`Transaction submitted: ${this.sent.transactionHash}. Detecting confirmations…`); const result = await window.MuzikazWalletPayments.confirmOrder(order.orderId, this.sent.transactionHash, this.sent.address, (current) => this.status(`${current.paymentNetwork}: ${current.paymentStatus}. ${current.confirmations || 0} confirmation(s).`)); const paid = ['PAID', 'FULFILLED'].includes(result.paymentStatus); this.status(`${result.paymentNetwork}: ${result.paymentStatus}. ${paid ? 'Payment verified. Purchase complete and delivered.' : 'Payment is still confirming.'}`); this.dispatchEvent(new CustomEvent('muzikaz-payment-status', { bubbles: true, detail: { ...this.quote, ...this.sent, ...result } })); } catch (error) { this.status(`Failed: ${error.message} Retry when ready.`); } finally { button.disabled = false; } }
  }
  customElements.define('muzikaz-payment-checkout', MuzikazPaymentCheckout);
}());
