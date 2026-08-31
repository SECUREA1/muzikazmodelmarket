(function () {
  'use strict';
  const WARNING = 'SEND ONLY THE SELECTED ASSET USING THE SELECTED NETWORK. SENDING FUNDS USING AN INCOMPATIBLE NETWORK MAY RESULT IN PERMANENT LOSS.';
  class MuzikazPaymentCheckout extends HTMLElement {
    connectedCallback() { this.asset = this.getAttribute('payment-asset') || 'ETH'; this.render(); this.refresh(); }
    product() { return { productId: this.getAttribute('product-id') || 'muzikaz-order', productType: this.getAttribute('product-type') || 'GENERIC', quantity: Number(this.getAttribute('quantity')) || 1, assetNetwork: this.getAttribute('asset-network') || null, userId: this.getAttribute('user-id') || '', metadata: {} }; }
    price() { return Number(this.getAttribute('base-price')) || 0; }
    render() {
      const options = Object.values(window.MuzikazPaymentConfig.MUZIKAZ_PAYMENT_NETWORKS).map((n) => `<option value="${n.symbol}">${n.symbol} · ${n.network}</option>`).join('');
      this.innerHTML = `<section class="muzikaz-payment"><header><p>Secure multi-chain checkout</p><h2>${this.getAttribute('item-name') || 'MUZIKAZ purchase'}</h2></header><label>Payment currency / network<select data-payment-asset>${options}</select></label><dl><div><dt>Base price</dt><dd data-base-price></dd></div><div><dt>Selected blockchain</dt><dd data-network></dd></div><div><dt>Required crypto</dt><dd data-amount>Loading quote…</dd></div><div><dt>Official receiving address</dt><dd><code data-address></code><button type="button" data-copy>Copy address</button></dd></div></dl><canvas data-qr width="220" height="220" aria-label="Payment URI QR code"></canvas><p class="payment-network-warning">${WARNING}</p><div class="payment-actions"><a data-open-wallet class="btn" href="#">Open wallet / Pay</a></div><label>Transaction hash / ID<input data-transaction-hash autocomplete="off" placeholder="Paste after broadcasting payment"></label><button type="button" data-submit disabled>Submit transaction for verification</button><p data-status role="status">Choose the asset and confirm the network before sending.</p></section>`;
      this.querySelector('[data-payment-asset]').value = this.asset;
      this.querySelector('[data-payment-asset]').addEventListener('change', (event) => { this.asset = event.target.value; this.order = null; this.refresh(); });
      this.querySelector('[data-copy]').addEventListener('click', async () => { await navigator.clipboard.writeText(window.MuzikazPaymentConfig.MUZIKAZ_PAYMENT_NETWORKS[this.asset].address); this.status('Official address copied. Confirm the selected network before sending.'); });
      this.querySelector('[data-open-wallet]').addEventListener('click', (event) => this.openWallet(event));
      this.querySelector('[data-submit]').addEventListener('click', () => this.submit());
    }
    status(message) { this.querySelector('[data-status]').textContent = message; }
    async refresh() {
      const network = window.MuzikazPaymentConfig.MUZIKAZ_PAYMENT_NETWORKS[this.asset]; const price = this.price();
      this.querySelector('[data-base-price]').textContent = price > 0 ? `$${price.toFixed(2)} USD` : 'Set by order'; this.querySelector('[data-network]').textContent = network.network; this.querySelector('[data-address]').textContent = network.address;
      try { this.quote = await window.MuzikazWalletPayments.quote(price, this.asset); this.querySelector('[data-amount]').textContent = `${this.quote.amount} ${this.asset}`; this.querySelector('[data-open-wallet]').href = this.quote.uri; await this.drawQr(this.quote.uri); }
      catch (error) { this.querySelector('[data-amount]').textContent = error.message; }
    }
    async drawQr(value) { try { const QRCode = (await import('https://esm.sh/qrcode@1.5.4')).default; await QRCode.toCanvas(this.querySelector('[data-qr]'), value, { width: 220, margin: 1, color: { dark: '#050505', light: '#ffffff' } }); } catch { const canvas = this.querySelector('[data-qr]'); const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, 220, 220); context.fillStyle = '#111'; context.font = '14px sans-serif'; context.fillText('QR unavailable — copy address', 15, 110); } }
    async ensureOrder() { if (!this.quote) throw new Error('Wait for a valid live quote.'); if (!this.order) this.order = await window.MuzikazWalletPayments.createOrder(this.quote, this.product()); return this.order; }
    async openWallet(event) { event.preventDefault(); try { const order = await this.ensureOrder(); this.status(`Order ${order.orderId.slice(0, 8)} created. Approve the exact ${this.asset} amount on ${order.paymentNetwork}.`); const sent = await window.MuzikazWalletPayments.initiate(this.quote); this.querySelector('[data-transaction-hash]').value = sent.transactionHash; this.querySelector('[data-submit]').disabled = false; await this.submit(); } catch (error) { this.querySelector('[data-submit]').disabled = !this.order; this.status(error.message); } }
    async submit() { try { const order = await this.ensureOrder(); const hash = this.querySelector('[data-transaction-hash]').value.trim(); const result = await window.MuzikazWalletPayments.submitOrder(order.orderId, hash); this.status(`${result.paymentNetwork}: ${result.paymentStatus} · ${result.confirmations} confirmation(s). Fulfillment remains locked until PAID.`); this.dispatchEvent(new CustomEvent('muzikaz-payment-status', { bubbles: true, detail: result })); } catch (error) { this.status(error.message); } }
  }
  customElements.define('muzikaz-payment-checkout', MuzikazPaymentCheckout);
}());
