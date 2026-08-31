(function () {
  'use strict';
  const PRESALE_MINIMUM_USD = 40;
  const params = new URLSearchParams(window.location.search);
  const bottleBonus = params.get('offer') === 'bottle10';
  const BOTTLE_BONUS_MINIMUM_USD = 100;
  const BOTTLE_BONUS_RATE = 0.1;
  const form = document.querySelector('#mzk-swap-form'), usdInput = document.querySelector('#mzk-usd'), output = document.querySelector('#mzk-output'), buy = document.querySelector('#mzk-buy'), quoteCopy = document.querySelector('#mzk-quote'), status = document.querySelector('#mzk-status');
  const quickButtons = [...document.querySelectorAll('[data-usd]')];
  const returnForm = document.querySelector('#mzk-swap-back-form'), returnAmount = document.querySelector('#mzk-return-amount'), returnCurrency = document.querySelector('#mzk-return-currency'), returnAddress = document.querySelector('#mzk-return-address'), returnOutput = document.querySelector('#mzk-return-output'), returnButton = document.querySelector('#mzk-return-button'), returnStatus = document.querySelector('#mzk-return-status');
  const selectedCurrency = () => new FormData(form).get('currency');
  const baseTokens = () => Math.round(Number(usdInput.value || 0) * window.MZKWallet.MZK_PER_USD);
  const bonusTokens = () => bottleBonus && Number(usdInput.value) >= BOTTLE_BONUS_MINIMUM_USD ? Math.round(baseTokens() * BOTTLE_BONUS_RATE) : 0;
  const tokens = () => baseTokens() + bonusTokens();
  let quoteTimer;
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
  quickButtons.forEach((button) => button.addEventListener('click', () => { usdInput.value = button.dataset.usd; refresh(); }));
  usdInput.addEventListener('input', schedule); form.addEventListener('change', refresh);
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); const usd = Number(usdInput.value); const minimum = bottleBonus ? BOTTLE_BONUS_MINIMUM_USD : PRESALE_MINIMUM_USD; if (usd < minimum) return; buy.disabled = true;
    try {
      status.textContent = `Connect your ${selectedCurrency()} wallet and approve the swap…`;
      const payment = await window.MuzikazWalletPayments.pay(usd, selectedCurrency());
      const entry = window.MZKWallet.creditPurchase(usd, payment);
      const bonus = bonusTokens();
      if (bonus) window.MZKWallet.record({ id: `mzk:bottle-bonus:${payment.transactionHash}`, amount: bonus, kind: 'bonus', reason: `Bottle buyer 10% bonus on $${usd.toFixed(2)} MZK purchase`, transactionHash: payment.transactionHash });
      status.textContent = `${(entry.amount + bonus).toLocaleString()} MZK added${bonus ? `, including your ${bonus.toLocaleString()} MZK Bottle bonus` : ''}. Transaction ${payment.transactionHash.slice(0, 12)}…`;
      const destination = new URLSearchParams(location.search).get('return'); if (destination) setTimeout(() => { location.href = destination; }, 900);
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
  let returnQuote;
  async function refreshReturnQuote() {
    const mzk = Number(returnAmount.value); returnQuote = null;
    if (mzk < window.MZKWallet.MINIMUM_SWAP_BACK_MZK) { returnOutput.textContent = `Minimum ${window.MZKWallet.MINIMUM_SWAP_BACK_MZK.toLocaleString()} MZK`; returnButton.disabled = true; return; }
    if (mzk > window.MZKWallet.balance()) { returnOutput.textContent = 'Amount exceeds your MZK balance'; returnButton.disabled = true; return; }
    try {
      const usd = (mzk / window.MZKWallet.MZK_PER_USD) * window.MZKWallet.SWAP_BACK_RATE;
      returnQuote = await window.MuzikazWalletPayments.quote(usd, returnCurrency.value);
      returnOutput.textContent = `${returnQuote.amount} ${returnQuote.currency} ≈ $${usd.toFixed(2)}`; returnButton.disabled = false;
    } catch (error) { returnOutput.textContent = error.message; returnButton.disabled = true; }
  }
  let returnTimer;
  returnAmount.addEventListener('input', () => { clearTimeout(returnTimer); returnTimer = setTimeout(refreshReturnQuote, 250); });
  returnCurrency.addEventListener('change', refreshReturnQuote);
  returnForm.addEventListener('submit', async (event) => {
    event.preventDefault(); await refreshReturnQuote(); if (!returnQuote || returnButton.disabled) return;
    const mzk = Number(returnAmount.value); returnButton.disabled = true;
    try {
      returnStatus.textContent = 'Requesting the crypto payout. Your MZK has not been deducted…';
      const payout = await window.MuzikazWalletPayments.requestPayout({ mzk, currency: returnQuote.currency, quotedAmount: returnQuote.amount, destinationAddress: returnAddress.value.trim(), walletId: window.MZKWallet.walletId() });
      const completed = window.MZKWallet.completeSwapBack(mzk, payout);
      if (!completed.ok) throw new Error(completed.error === 'INSUFFICIENT_MZK' ? 'Your MZK balance changed before the swap could be recorded. Contact support with the payout transaction hash.' : 'The swap could not be recorded.');
      returnStatus.textContent = `Payout confirmed: ${payout.paidAmount} ${payout.currency}. ${mzk.toLocaleString()} MZK deducted. Transaction ${payout.transactionHash.slice(0, 12)}…`;
    } catch (error) { returnStatus.textContent = error.message || 'The swap was not completed. No MZK was deducted.'; }
    finally { refreshReturnQuote(); }
  });
  window.MZKWallet.mount('#mzk-balance', { compact: true }); refresh(); refreshReturnQuote();
}());
