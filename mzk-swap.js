(function () {
  'use strict';
  const form = document.querySelector('#mzk-swap-form'), usdInput = document.querySelector('#mzk-usd'), output = document.querySelector('#mzk-output'), buy = document.querySelector('#mzk-buy'), quoteCopy = document.querySelector('#mzk-quote'), status = document.querySelector('#mzk-status');
  const selectedCurrency = () => new FormData(form).get('currency');
  const tokens = () => Math.round(Number(usdInput.value || 0) * window.MZKWallet.MZK_PER_USD);
  let quoteTimer;
  async function refresh() { const usd = Number(usdInput.value); const amount = tokens(); output.textContent = `You receive ${amount.toLocaleString()} MZK`; buy.textContent = `Swap for ${amount.toLocaleString()} MZK`; buy.disabled = usd < 5; if (usd < 5) { quoteCopy.textContent = 'Minimum purchase: $5 / 500 MZK.'; return; } try { const quote = await window.MuzikazWalletPayments.quote(usd, selectedCurrency()); quoteCopy.textContent = `${quote.amount} ${quote.currency} ≈ $${usd.toFixed(2)} · ${amount.toLocaleString()} MZK`; } catch (error) { quoteCopy.textContent = error.message; } }
  function schedule() { clearTimeout(quoteTimer); quoteTimer = setTimeout(refresh, 250); }
  document.querySelectorAll('[data-usd]').forEach((button) => button.addEventListener('click', () => { usdInput.value = button.dataset.usd; refresh(); }));
  usdInput.addEventListener('input', schedule); form.addEventListener('change', refresh);
  form.addEventListener('submit', async (event) => { event.preventDefault(); const usd = Number(usdInput.value); if (usd < 5) return; buy.disabled = true; try { status.textContent = `Connect your ${selectedCurrency()} wallet and approve the swap…`; const payment = await window.MuzikazWalletPayments.pay(usd, selectedCurrency()); const entry = window.MZKWallet.creditPurchase(usd, payment); status.textContent = `${entry.amount.toLocaleString()} MZK added. Transaction ${payment.transactionHash.slice(0, 12)}…`; const destination = new URLSearchParams(location.search).get('return'); if (destination) setTimeout(() => { location.href = destination; }, 900); } catch (error) { status.textContent = error.message || 'The swap was not completed. No MZK was added.'; } finally { buy.disabled = false; refresh(); } });
  window.MZKWallet.mount('#mzk-balance', { compact: true }); refresh();
}());
