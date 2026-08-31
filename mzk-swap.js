(function () {
  'use strict';
  const PRESALE_MINIMUM_USD = 40;
  const params = new URLSearchParams(window.location.search);
  const bottleBonus = params.get('offer') === 'bottle10';
  const BOTTLE_BONUS_MINIMUM_USD = 100;
  const BOTTLE_BONUS_RATE = 0.1;
  const form = document.querySelector('#mzk-swap-form'), usdInput = document.querySelector('#mzk-usd'), output = document.querySelector('#mzk-output'), buy = document.querySelector('#mzk-buy'), quoteCopy = document.querySelector('#mzk-quote'), status = document.querySelector('#mzk-status'), walletSelect = document.querySelector('#mzk-payment-wallet'), verification = document.querySelector('#mzk-payment-verification'), transactionInput = document.querySelector('#mzk-transaction-id'), verifyButton = document.querySelector('#mzk-verify-payment'), orderReference = document.querySelector('#mzk-order-reference');
  const PENDING_KEY = 'muzikazPendingMzkPaymentV1';
  const quickButtons = [...document.querySelectorAll('[data-usd]')];
  const selectedCurrency = () => new FormData(form).get('currency');
  const selectedWallet = () => walletSelect.value;
  function renderWallets() {
    const wallets = window.MuzikazWalletPayments.compatibleWallets(selectedCurrency());
    walletSelect.innerHTML = wallets.map(({ id, name }) => `<option value="${id}">${name}</option>`).join('');
  }
  const baseTokens = () => Math.round(Number(usdInput.value || 0) * window.MZKWallet.MZK_PER_USD);
  const bonusTokens = () => bottleBonus && Number(usdInput.value) >= BOTTLE_BONUS_MINIMUM_USD ? Math.round(baseTokens() * BOTTLE_BONUS_RATE) : 0;
  const tokens = () => baseTokens() + bonusTokens();
  let quoteTimer;
  async function refresh() {
    const usd = Number(usdInput.value), amount = tokens();
    output.textContent = `${amount.toLocaleString()} MZK`;
    buy.querySelector('span').textContent = `Pay & receive ${amount.toLocaleString()} MZK`;
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
  const readPending = () => { try { return JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null'); } catch (_) { return null; } };
  function showPending(pending) {
    verification.hidden = !pending;
    if (!pending) return;
    orderReference.textContent = `${pending.currency} order ${pending.orderId.slice(0, 8)}… · ${pending.amount} ${pending.currency}`;
  }
  function creditVerified(pending, payment) {
    const entry = window.MZKWallet.creditPurchase(pending.usd, { ...payment, currency: pending.currency });
    const bonus = pending.bonus || 0;
    if (bonus) window.MZKWallet.record({ id: `mzk:bottle-bonus:${payment.transactionHash}`, amount: bonus, kind: 'bonus', reason: `Bottle buyer 10% bonus on $${pending.usd.toFixed(2)} MZK purchase`, transactionHash: payment.transactionHash });
    sessionStorage.removeItem(PENDING_KEY); showPending(null);
    status.textContent = `${(entry.amount + bonus).toLocaleString()} MZK added to your wallet and Backpack. Transaction ${payment.transactionHash.slice(0, 12)}…`;
  }
  quickButtons.forEach((button) => button.addEventListener('click', () => { usdInput.value = button.dataset.usd; refresh(); }));
  usdInput.addEventListener('input', schedule); form.addEventListener('change', (event) => { if (event.target.name === 'currency') renderWallets(); refresh(); });
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); const usd = Number(usdInput.value); const minimum = bottleBonus ? BOTTLE_BONUS_MINIMUM_USD : PRESALE_MINIMUM_USD; if (usd < minimum) return; buy.disabled = true;
    try {
      status.textContent = `Opening ${walletSelect.selectedOptions[0].textContent}. Approve the exact transfer to submit it…`;
      const quote = await window.MuzikazWalletPayments.quote(usd, selectedCurrency());
      const order = await window.MuzikazWalletPayments.createOrder(quote, { productId: 'mzk-land-presale', productType: 'MZK_PURCHASE', quantity: tokens() });
      const pending = { orderId: order.orderId, usd, tokens: tokens(), bonus: bonusTokens(), currency: quote.currency, amount: quote.amount };
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending)); showPending(pending);
      const sent = await window.MuzikazWalletPayments.initiate(quote, selectedWallet());
      if (sent.transactionHash) { transactionInput.value = sent.transactionHash; verifyButton.click(); }
      else status.textContent = `${sent.walletName} opened in a new window. Approve the payment, then paste its transaction ID to verify and receive MZK.`;
    } catch (error) { status.textContent = error.message || 'The swap was not completed. No MZK was added.'; }
    finally { buy.disabled = false; refresh(); }
  });
  verifyButton.addEventListener('click', async () => {
    const pending = readPending(), transactionHash = transactionInput.value.trim();
    if (!pending) return showPending(null);
    if (!transactionHash) { status.textContent = 'Paste the transaction hash or ID shown by your wallet.'; transactionInput.focus(); return; }
    verifyButton.disabled = true; status.textContent = `Verifying ${pending.currency} payment independently on-chain…`;
    try {
      const payment = await window.MuzikazWalletPayments.submitOrder(pending.orderId, transactionHash);
      if (!['PAID', 'FULFILLED'].includes(payment.paymentStatus)) throw new Error(`Payment status: ${payment.paymentStatus}. MZK remains locked until the required on-chain confirmations arrive; use Verify again shortly.`);
      creditVerified(pending, { ...payment, transactionHash });
      const destination = new URLSearchParams(location.search).get('return'); if (destination) setTimeout(() => { location.href = destination; }, 900);
    } catch (error) { status.textContent = error.message || 'Payment could not be verified. No MZK was added.'; }
    finally { verifyButton.disabled = false; }
  });
  if (bottleBonus) {
    document.body.classList.add('bottle-bonus-active');
    usdInput.min = String(BOTTLE_BONUS_MINIMUM_USD);
    usdInput.value = String(Math.max(BOTTLE_BONUS_MINIMUM_USD, Number(params.get('amount')) || BOTTLE_BONUS_MINIMUM_USD));
    document.querySelector('.mzk-form-heading .kicker').textContent = 'Bottle buyer allocation';
    document.querySelector('.mzk-form-heading h2').textContent = 'Claim 10% more MZK';
  }
  window.MZKWallet.mount('#mzk-balance', { compact: true }); renderWallets(); showPending(readPending()); refresh();
}());
