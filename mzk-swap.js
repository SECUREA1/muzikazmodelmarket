(function () {
  'use strict';
  const PRESALE_MINIMUM_USD = 40;
  const params = new URLSearchParams(window.location.search);
  const bottleBonus = params.get('offer') === 'bottle10';
  const BOTTLE_BONUS_MINIMUM_USD = 100;
  const BOTTLE_BONUS_RATE = 0.1;
  const form = document.querySelector('#mzk-swap-form'), usdInput = document.querySelector('#mzk-usd'), output = document.querySelector('#mzk-output'), buy = document.querySelector('#mzk-buy'), quoteCopy = document.querySelector('#mzk-quote'), status = document.querySelector('#mzk-status');
  const manualConfirm = document.querySelector('#mzk-manual-confirm'), transactionHash = document.querySelector('#mzk-transaction-hash'), submitTransaction = document.querySelector('#mzk-submit-transaction');
  const quickButtons = [...document.querySelectorAll('[data-usd]')];
  const selectedCurrency = () => new FormData(form).get('currency');
  const baseTokens = () => Math.round(Number(usdInput.value || 0) * window.MZKWallet.MZK_PER_USD);
  const bonusTokens = () => bottleBonus && Number(usdInput.value) >= BOTTLE_BONUS_MINIMUM_USD ? Math.round(baseTokens() * BOTTLE_BONUS_RATE) : 0;
  const tokens = () => baseTokens() + bonusTokens();
  let quoteTimer, pendingPayment;
  function resetPendingPayment() { pendingPayment = null; manualConfirm.hidden = true; transactionHash.value = ''; }
  function creditVerifiedPayment(payment) {
    const entry = window.MZKWallet.creditPurchase(pendingPayment.usd, payment);
    const bonus = bonusTokens();
    if (bonus) window.MZKWallet.record({ id: `mzk:bottle-bonus:${payment.transactionHash}`, amount: bonus, kind: 'bonus', reason: `Bottle buyer 10% bonus on $${pendingPayment.usd.toFixed(2)} MZK purchase`, transactionHash: payment.transactionHash });
    status.textContent = `${(entry.amount + bonus).toLocaleString()} MZK added${bonus ? `, including your ${bonus.toLocaleString()} MZK Bottle bonus` : ''}. On-chain payment verified.`;
    resetPendingPayment();
    const destination = params.get('return'); if (destination) setTimeout(() => { location.href = destination; }, 900);
  }
  async function verifyTransaction(hash) {
    const value = String(hash || '').trim(); if (!pendingPayment?.order?.orderId || !value) throw new Error('Paste the transaction hash / ID from your wallet first.');
    const verified = await window.MuzikazWalletPayments.submitOrder(pendingPayment.order.orderId, value);
    if (!['PAID', 'FULFILLED'].includes(verified.paymentStatus)) throw new Error(`${verified.paymentNetwork}: ${verified.paymentStatus}. MZK remains locked until the payment is confirmed.`);
    creditVerifiedPayment({ ...pendingPayment.quote, ...verified, transactionHash: value });
  }
  async function refresh() {
    const usd = Number(usdInput.value), amount = tokens();
    output.textContent = `${amount.toLocaleString()} MZK`;
    buy.querySelector('span').textContent = `Acquire ${amount.toLocaleString()} MZK`;
    const minimum = bottleBonus ? BOTTLE_BONUS_MINIMUM_USD : PRESALE_MINIMUM_USD;
    buy.disabled = usd < minimum;
    quickButtons.forEach((button) => button.classList.toggle('is-active', Number(button.dataset.usd) === usd));
    if (bottleBonus && usd < BOTTLE_BONUS_MINIMUM_USD) { quoteCopy.textContent = 'Bottle bonus unlocks at $100. Raise the allocation to receive 10% more MZK.'; return; }
    if (usd < PRESALE_MINIMUM_USD) { quoteCopy.textContent = 'Land presale minimum: $40 / 4,000 MZK.'; return; }
    try {
      const quote = await window.MuzikazWalletPayments.quote(usd, selectedCurrency());
      quoteCopy.textContent = `${quote.amount} ${quote.currency} ≈ $${usd.toFixed(2)} · ${amount.toLocaleString()} MZK${bonusTokens() ? ` (includes ${bonusTokens().toLocaleString()} bonus)` : ''}`;
    } catch (error) { quoteCopy.textContent = error.message; }
  }
  function schedule() { clearTimeout(quoteTimer); quoteTimer = setTimeout(refresh, 250); }
  quickButtons.forEach((button) => button.addEventListener('click', () => { resetPendingPayment(); usdInput.value = button.dataset.usd; refresh(); }));
  usdInput.addEventListener('input', () => { resetPendingPayment(); schedule(); }); form.addEventListener('change', () => { resetPendingPayment(); refresh(); });
  submitTransaction.addEventListener('click', async () => { submitTransaction.disabled = true; try { status.textContent = 'Verifying the on-chain payment…'; await verifyTransaction(transactionHash.value); } catch (error) { status.textContent = error.message; } finally { submitTransaction.disabled = false; } });
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); const usd = Number(usdInput.value); const minimum = bottleBonus ? BOTTLE_BONUS_MINIMUM_USD : PRESALE_MINIMUM_USD; if (usd < minimum) return; buy.disabled = true;
    try {
      status.textContent = `Preparing your ${selectedCurrency()} wallet payment…`;
      const quote = await window.MuzikazWalletPayments.quote(usd, selectedCurrency());
      const order = await window.MuzikazWalletPayments.createOrder(quote, { productType: 'MZK', productId: `mzk-${tokens()}`, quantity: tokens(), metadata: { creditedMzk: tokens() } });
      pendingPayment = { usd, quote, order };
      const sent = await window.MuzikazWalletPayments.initiate(quote);
      if (sent.opened) { manualConfirm.hidden = false; status.textContent = `${sent.walletName} opened with the exact ${quote.amount} ${quote.currency} request. Complete it, then paste the transaction hash / ID below.`; transactionHash.focus(); }
      else await verifyTransaction(sent.transactionHash);
    } catch (error) { status.textContent = error.message || 'The swap was not completed. No MZK was added.'; }
    finally { buy.disabled = false; refresh(); }
  });
  if (bottleBonus) {
    document.body.classList.add('bottle-bonus-active');
    usdInput.min = String(BOTTLE_BONUS_MINIMUM_USD);
    usdInput.value = String(Math.max(BOTTLE_BONUS_MINIMUM_USD, Number(params.get('amount')) || BOTTLE_BONUS_MINIMUM_USD));
    document.querySelector('.mzk-form-heading .kicker').textContent = 'Bottle buyer allocation';
    document.querySelector('.mzk-form-heading h2').textContent = 'Claim 10% more MZK';
  }
  window.MZKWallet.mount('#mzk-balance', { compact: true }); refresh();
}());
