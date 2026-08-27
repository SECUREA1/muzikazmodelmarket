(function () {
  const LEDGER_KEY = 'muzikazMzkLedgerV1';
  const PROFILE_KEY = 'muzikazMzkWalletProfilesV1';
  const ACTIVE_KEY = 'muzikazMzkActiveWalletV1';
  const CONNECTED_KEY = 'muzikazConnectedEthereumWalletV1';
  const MIGRATION_KEY = 'muzikazMzkWalletMigrationV1';
  const STARTING_MZK = 0;
  const MZK_PER_USD = 100;
  const MINIMUM_PURCHASE_USD = 5;
  const GAME_ENTRY_MZK = 3000;
  const LOADOUT_KEY = 'muzikazStarterLoadoutsV1';
  const STARTER_AVATARS = ['Sparky', 'Nexus', 'Fiona', 'Dax', 'Buzz', 'Luna', 'Muz Cat', 'Ion Wolf'];
  const STARTER_LANDS = ['Skyline Deck', 'Echo Gardens', 'Crew Plaza', 'Studio Ridge', 'Neon Docks'];
  const normalize = (value) => String(value || '').trim().toLowerCase();
  const uid = (prefix = 'mzk') => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const validAddress = (value) => /^0x[a-f0-9]{40}$/.test(normalize(value));
  const connectedAddress = () => { const address = normalize(localStorage.getItem(CONNECTED_KEY)); return validAddress(address) ? address : ''; };
  const parse = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch (_) { return fallback; } };
  const profiles = () => { const value = parse(PROFILE_KEY, {}); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; };
  const activeProfile = () => profiles()[normalize(localStorage.getItem(ACTIVE_KEY))] || null;
  const walletId = () => activeProfile()?.address || normalize(localStorage.getItem('muzikazBottleMemberEmail')) || normalize(localStorage.getItem('voice3.wallet')) || localStorage.getItem('voice3.guestId') || (() => { const id = uid('guest'); localStorage.setItem('voice3.guestId', id); return id; })();
  const read = () => { try { const value = JSON.parse(localStorage.getItem(LEDGER_KEY) || '[]'); return Array.isArray(value) ? value : []; } catch (_) { return []; } };
  const write = (ledger) => { localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger.slice(-5000))); window.dispatchEvent(new CustomEvent('mzk:balance-changed')); window.dispatchEvent(new CustomEvent('voice3:rewards-updated')); };
  const balance = (owner = walletId()) => read().filter((entry) => entry.walletId === normalize(owner)).reduce((total, entry) => total + Number(entry.amount || 0), 0);
  const history = (owner = walletId()) => read().filter((entry) => entry.walletId === normalize(owner));
  function record({ id = uid(), owner = walletId(), amount, kind, reason = 'MZK activity', ...meta }) { const ledger = read(); const existing = ledger.find((entry) => entry.id === id); if (existing) return existing; const entry = { id, walletId: normalize(owner), currency: 'MZK', kind: kind || (amount < 0 ? 'spend' : 'earn'), amount: Number(amount) || 0, reason, createdAt: new Date().toISOString(), ...meta }; ledger.push(entry); write(ledger); return entry; }
  function ensureWallet(owner = walletId()) { owner = normalize(owner); if (!owner || owner.startsWith('guest-') || history(owner).length) return balance(owner); record({ id: `mzk:welcome:${owner}`, owner, amount: STARTING_MZK, kind: 'welcome', reason: 'MUZIKAZ member wallet welcome balance' }); return balance(owner); }
  function creditPurchase(usd, payment = {}) { usd = Number(usd); if (!Number.isFinite(usd) || usd < MINIMUM_PURCHASE_USD) throw new Error(`Minimum MZK purchase is $${MINIMUM_PURCHASE_USD}.`); const amount = Math.round(usd * MZK_PER_USD); const transactionHash = String(payment.transactionHash || uid('purchase')); return record({ id: `mzk:purchase:${transactionHash}`, amount, kind: 'purchase', reason: `${amount.toLocaleString()} MZK purchased for $${usd.toFixed(2)}`, usd, paymentCurrency: payment.currency || '', transactionHash }); }
  function loadouts() { const value = parse(LOADOUT_KEY, {}); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  function starterLoadout(owner = walletId()) { return loadouts()[normalize(owner)] || null; }
  function randomItem(items) { const values = new Uint32Array(1); if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(values); else values[0] = Math.floor(Math.random() * 0xffffffff); return items[values[0] % items.length]; }
  function claimStarterLoadout() { const owner = normalize(walletId()), existing = starterLoadout(owner); if (existing) return { ok: true, firstEntry: false, balance: balance(owner), loadout: existing }; const payment = spend(GAME_ENTRY_MZK, 'First-time Builder Loadout package', uid('starter-loadout'), { package: 'builder-loadout-v1' }); if (!payment.ok) return payment; const loadout = { id: uid('loadout'), owner, avatar: randomItem(STARTER_AVATARS), land: randomItem(STARTER_LANDS), assets: ['Builder Tool Kit', 'Starter Room Shell', 'Public Community Spot'], entryPaidMzk: GAME_ENTRY_MZK, claimedAt: new Date().toISOString() }; const all = loadouts(); all[owner] = loadout; localStorage.setItem(LOADOUT_KEY, JSON.stringify(all)); window.dispatchEvent(new CustomEvent('mzk:starter-loadout-claimed', { detail: loadout })); return { ok: true, firstEntry: true, balance: balance(owner), loadout }; }
  function spend(amount, reason, id = uid('spend'), meta = {}) { amount = Math.abs(Number(amount) || 0); ensureWallet(); const existing = read().find((entry) => entry.id === id); if (existing) return { ok: true, duplicate: true, balance: balance(), tx: existing }; if (!amount || balance() < amount) return { ok: false, error: 'INSUFFICIENT_MZK', balance: balance() }; const tx = record({ id, amount: -amount, kind: 'spend', reason, ...meta }); return { ok: true, tx, balance: balance() }; }
  function transfer(from, to, amount, reason, id = uid('transfer'), meta = {}) { from = normalize(from); to = normalize(to); amount = Math.abs(Number(amount) || 0); ensureWallet(from); ensureWallet(to); if (!from || !to || from === to || !amount) return { ok: false, error: 'INVALID_TRANSFER', balance: balance(from) }; if (read().some((entry) => entry.id === `${id}:debit`)) return { ok: true, duplicate: true, balance: balance(from) }; if (balance(from) < amount) return { ok: false, error: 'INSUFFICIENT_MZK', balance: balance(from) }; record({ id: `${id}:debit`, owner: from, amount: -amount, kind: 'transfer', reason, counterparty: to, ...meta }); record({ id: `${id}:credit`, owner: to, amount, kind: 'transfer', reason, counterparty: from, ...meta }); return { ok: true, balance: balance(from) }; }
  function connectIdentity({ address, chainId, contract, tokenIds = [] }) {
    address = normalize(address); contract = normalize(contract); chainId = normalize(chainId);
    if (!validAddress(address) || !validAddress(contract) || !/^0x[a-f0-9]+$/.test(chainId)) throw new Error('A valid wallet, chain, and Bottle contract are required.');
    const key = `${chainId}:${contract}:${address}`, all = profiles(), previous = all[key] || {};
    all[key] = { ...previous, key, address, chainId, contract, tokenIds: [...new Set(tokenIds.map(String))], username: previous.username || '', verifiedAt: new Date().toISOString() };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(all)); localStorage.setItem(ACTIVE_KEY, key); localStorage.setItem('voice3.wallet', address); ensureWallet(address);
    window.dispatchEvent(new CustomEvent('mzk:identity-changed', { detail: all[key] })); return all[key];
  }
  async function connectBrowserWallet() {
    const provider = window.ethereum;
    if (!provider?.request) throw new Error('Install or open an Ethereum wallet such as MetaMask to connect.');
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    const address = normalize(accounts?.[0]);
    if (!validAddress(address)) throw new Error('Your wallet did not return a valid Ethereum account.');
    localStorage.setItem(CONNECTED_KEY, address);
    localStorage.setItem('voice3.wallet', address);
    ensureWallet(address);
    window.dispatchEvent(new CustomEvent('mzk:wallet-connection-changed', { detail: { address } }));
    return address;
  }
  function disconnectBrowserWallet() {
    localStorage.removeItem(CONNECTED_KEY);
    window.dispatchEvent(new CustomEvent('mzk:wallet-connection-changed', { detail: { address: '' } }));
  }
  function setUsername(value) { const profile = activeProfile(); if (!profile) throw new Error('Connect a verified Bottle wallet first.'); const username = String(value || '').trim(); if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,23}$/.test(username)) throw new Error('Use 3–24 letters, numbers, dots, dashes, or underscores.'); const all = profiles(); all[profile.key] = { ...profile, username, updatedAt: new Date().toISOString() }; localStorage.setItem(PROFILE_KEY, JSON.stringify(all)); window.dispatchEvent(new CustomEvent('mzk:identity-changed', { detail: all[profile.key] })); return all[profile.key]; }
  function exportWallet() { const profile = activeProfile(); if (!profile) throw new Error('Connect a verified Bottle wallet first.'); return { format: 'muzikaz-wallet-v1', exportedAt: new Date().toISOString(), profile, ledger: history(profile.address) }; }
  function importWallet(data) { if (data?.format !== 'muzikaz-wallet-v1' || !data.profile) throw new Error('This is not a MUZIKAZ wallet JSON file.'); const verified = activeProfile(); if (!verified || verified.address !== normalize(data.profile.address) || verified.chainId !== normalize(data.profile.chainId) || verified.contract !== normalize(data.profile.contract)) throw new Error('Connect and verify the matching wallet and Bottle contract before restoring this JSON.'); let incoming = connectIdentity(data.profile); if (data.profile.username) incoming = setUsername(data.profile.username); const ledger = read(); for (const entry of Array.isArray(data.ledger) ? data.ledger : []) if (entry.walletId === incoming.address && !ledger.some((item) => item.id === entry.id)) ledger.push(entry); write(ledger); return incoming; }
  function downloadWallet() { const data = exportWallet(), blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `muzikaz-${data.profile.address.slice(0, 10)}.wallet.json`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 0); }
  if (!localStorage.getItem(MIGRATION_KEY)) { try { const old = JSON.parse(localStorage.getItem('muzikazBackpackBalances') || '{}'); Object.entries(old).forEach(([owner, amount]) => record({ id: `mzk:legacy-backpack:${normalize(owner)}`, owner, amount: Number(amount) || 0, kind: 'migration', reason: 'Legacy Backpack token balance migrated to MZK' })); } catch (_) { /* Ignore malformed legacy caches. */ } localStorage.setItem(MIGRATION_KEY, 'complete'); }
  function mount(target, options = {}) { const root = typeof target === 'string' ? document.querySelector(target) : target; if (!root) return; const draw = () => { ensureWallet(); const amount = `${balance().toLocaleString()} MZK`; root.textContent = options.compact ? amount : `🪙 ${amount} · one wallet for rewards, Token Mixer, Backpack & VibeVerse`; }; draw(); window.addEventListener('mzk:balance-changed', draw); window.addEventListener('storage', draw); }
  ensureWallet();
  document.addEventListener('click', (event) => { const start = event.target.closest?.('[data-house-start]'); if (!start || start.dataset.mzkEntryPaid === 'true') return; ensureWallet(); const owned = starterLoadout(); if (!owned && balance() < GAME_ENTRY_MZK) { event.preventDefault(); event.stopImmediatePropagation(); const returnTo = `${location.pathname.split('/').pop() || 'index.html'}${location.hash}`; location.href = `buy-mzk.html?return=${encodeURIComponent(returnTo)}#swap`; return; } const claimed = claimStarterLoadout(); if (!claimed.ok) { event.preventDefault(); event.stopImmediatePropagation(); return; } start.dataset.mzkEntryPaid = 'true'; start.dataset.mzkLoadoutId = claimed.loadout.id; }, true);
  window.MZKWallet = { symbol: 'MZK', MZK_PER_USD, MINIMUM_PURCHASE_USD, GAME_ENTRY_MZK, walletId, balance, history, record, spend, transfer, creditPurchase, starterLoadout, claimStarterLoadout, ensureWallet, mount, profile: activeProfile, connectedAddress, connectBrowserWallet, disconnectBrowserWallet, connectIdentity, setUsername, exportWallet, importWallet, downloadWallet };
})();
