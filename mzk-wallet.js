(function () {
  const LEDGER_KEY = 'muzikazMzkLedgerV1';
  const PROFILE_KEY = 'muzikazMzkWalletProfilesV1';
  const ACTIVE_KEY = 'muzikazMzkActiveWalletV1';
  const CONNECTED_KEY = 'muzikazConnectedEthereumWalletV1';
  const CONNECTED_CHAIN_KEY = 'muzikazConnectedEthereumChainV1';
  const MIGRATION_KEY = 'muzikazMzkWalletMigrationV1';
  const STARTING_MZK = 0;
  const MZK_PER_USD = 100;
  const MINIMUM_PURCHASE_USD = 5;
  const GAME_ENTRY_MZK = 500;
  const SINGLE_PLAYER_STARTING_MZK = 500;
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
  function purchaseTokens(usd, owner = walletId()) {
    usd = Number(usd);
    const firstPurchase = !history(owner).some((entry) => entry.kind === 'purchase');
    if (!firstPurchase) return Math.round(usd * MZK_PER_USD);
    const baseTokens = Math.round(usd * MZK_PER_USD);
    if (usd >= 200) return Math.max(baseTokens, 26000);
    if (usd >= 100) return Math.max(baseTokens, 13000);
    if (usd >= 30) return Math.max(baseTokens, 5000);
    return Math.max(baseTokens, 2000);
  }
  function grantPurchaseRewards(usd, owner) {
    const all = loadouts(), current = all[owner] || {};
    const rewards = ['Black Genie Bottle · SVG collectible'];
    if (usd >= 30) rewards.push('Violet Wish Bottle');
    if (usd >= 200) rewards.push('Golden Genie Bottle · SVG collectible', 'Custom In-Game Asset Order');
    all[owner] = { id: current.id || uid('loadout'), owner, avatar: current.avatar || randomItem(STARTER_AVATARS), land: current.land || randomItem(STARTER_LANDS), assets: [...new Set([...(current.assets || []), 'Builder Tool Kit', 'Starter Room Shell', 'Public Community Spot', ...rewards])], entryPaidMzk: current.entryPaidMzk || 0, paymentQualified: true, purchaseTierUsd: Math.max(Number(current.purchaseTierUsd) || 0, usd), claimedAt: current.claimedAt || new Date().toISOString() };
    localStorage.setItem(LOADOUT_KEY, JSON.stringify(all));
    window.dispatchEvent(new CustomEvent('mzk:starter-loadout-claimed', { detail: all[owner] }));
    return all[owner];
  }
  function creditPurchase(usd, payment = {}) { usd = Number(usd); if (!Number.isFinite(usd) || usd < MINIMUM_PURCHASE_USD) throw new Error(`Minimum MZK purchase is $${MINIMUM_PURCHASE_USD}.`); const owner = normalize(payment.owner || walletId()); if (!owner || owner.startsWith('guest-')) throw new Error('Connect a member wallet before purchasing MZK.'); const landTier = payment.purchaseType === 'LAND_TIER' && usd === 40; const amount = landTier ? 4000 : purchaseTokens(usd, owner); const transactionHash = String(payment.transactionHash || uid('purchase')); const entry = record({ id: `mzk:purchase:${transactionHash}`, owner, amount, kind: 'purchase', reason: landTier ? '4,000 MZK received for $40.00 one-time land tier' : `${amount.toLocaleString()} MZK received for $${usd.toFixed(2)}${amount > Math.round(usd * MZK_PER_USD) ? ' first-buy offer' : ''}`, usd, paymentCurrency: payment.currency || '', purchaseType: landTier ? 'LAND_TIER' : 'MZK_PURCHASE', transactionHash }); if (!landTier) grantPurchaseRewards(usd, owner); return entry; }
  function loadouts() { const value = parse(LOADOUT_KEY, {}); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  function starterLoadout(owner = walletId()) { return loadouts()[normalize(owner)] || null; }
  function claimSinglePlayerTokens(owner = walletId()) {
    owner = normalize(owner);
    if (!owner) return { ok: false, error: 'INVALID_WALLET', balance: 0 };
    // Version the demo grant so returning players whose original allowance was
    // already consumed receive the usable MZK allocation added for RAD-TOX.
    // The stable receipt remains idempotent, so reopening the demo cannot mint
    // the allocation repeatedly.
    const id = `mzk:single-player-starter:${owner}:demo-v2`;
    const existing = read().find((entry) => entry.id === id);
    const tx = existing || record({ id, owner, amount: SINGLE_PLAYER_STARTING_MZK, kind: 'game-starter', reason: 'RAD-TOX demo MZK for gameplay spends' });
    return { ok: true, firstGrant: !existing, amount: SINGLE_PLAYER_STARTING_MZK, balance: balance(owner), tx };
  }
  function distributeSinglePlayerTokens({ level, amount, distributionId } = {}, owner = walletId()) {
    owner = normalize(owner);
    level = Math.max(1, Math.trunc(Number(level) || 1));
    amount = Math.max(0, Math.trunc(Number(amount) || 0));
    distributionId = normalize(distributionId);
    if (!owner || !amount || !/^[a-z0-9][a-z0-9:_-]{2,80}$/.test(distributionId)) return { ok: false, error: 'INVALID_DISTRIBUTION', balance: balance(owner) };
    const id = `mzk:single-player-distribution:${owner}:${distributionId}`;
    const existing = read().find((entry) => entry.id === id);
    const tx = existing || record({ id, owner, amount, kind: 'game-reward', reason: `RAD-TOX level ${level} clear reward`, game: 'rad-tox', level, distributionId });
    return { ok: true, firstDistribution: !existing, amount: Number(tx.amount), balance: balance(owner), tx };
  }
  function provisionStandardLoadout(account = {}) {
    const owner = normalize(account.primaryEthereumWallet || localStorage.getItem('muzikazBottleMemberEmail'));
    if (!owner || owner.startsWith('guest-') || account.gameAccess !== true) return null;
    const all = loadouts();
    const previous = all[owner] || {};
    const serverAssets = [...(account.gameAssets || []), ...(account.landAssets || []), ...(account.bottleClaims || [])];
    const next = { ...previous, id: previous.id || `account-loadout-${account.accountId || owner}`, owner, avatar: (account.gameAssets || []).find((asset) => /avatar/i.test(String(asset))) || previous.avatar || 'Starter Avatar', land: (account.landAssets || [])[0] || previous.land || 'Unrevealed MUZIKAZ Land', assets: [...new Set([...(previous.assets || []), ...serverAssets])], bottleClaims: [...new Set([...(previous.bottleClaims || []), ...(account.bottleClaims || [])])], bottlePurchases: account.bottlePurchases || previous.bottlePurchases || [], entryPaidMzk: previous.entryPaidMzk || 0, accessType: account.loadoutStatus || previous.accessType || 'included', purchaseTierUsd: Math.max(Number(previous.purchaseTierUsd || 0), Number(account.purchaseTierUsd || 0)), claimedAt: previous.claimedAt || account.updatedAt || new Date().toISOString(), syncedAt: account.updatedAt || previous.syncedAt || new Date().toISOString() };
    if (JSON.stringify(previous) !== JSON.stringify(next)) {
      all[owner] = next;
      localStorage.setItem(LOADOUT_KEY, JSON.stringify(all));
      window.dispatchEvent(new CustomEvent('mzk:starter-loadout-claimed', { detail: all[owner] }));
    }
    const serverBalance = Math.max(0, Number(account.mzkBalance) || 0), localBalance = balance(owner);
    if (serverBalance > localBalance) record({ id: `mzk:account-starter:${account.accountId || owner}`, owner, amount: serverBalance - localBalance, kind: 'account-grant', reason: 'MZK Access standard Loadout balance' });
    localStorage.setItem('muzikazBottleMemberEmail', owner);
    return all[owner];
  }
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
  const injectedProviders = () => window.ethereum?.providers || (window.ethereum ? [window.ethereum] : []);
  const browserProvider = () => injectedProviders().find((provider) => provider.isMetaMask) || injectedProviders().find((provider) => provider.request) || null;
  function updateBrowserConnection(accounts, chainId = '') {
    const address = normalize(accounts?.[0]);
    if (validAddress(address)) {
      localStorage.setItem(CONNECTED_KEY, address);
      localStorage.setItem('voice3.wallet', address);
      if (chainId) localStorage.setItem(CONNECTED_CHAIN_KEY, normalize(chainId));
      ensureWallet(address);
    } else {
      localStorage.removeItem(CONNECTED_KEY);
      localStorage.removeItem(CONNECTED_CHAIN_KEY);
    }
    window.dispatchEvent(new CustomEvent('mzk:wallet-connection-changed', { detail: { address: validAddress(address) ? address : '', chainId: normalize(chainId || localStorage.getItem(CONNECTED_CHAIN_KEY)) } }));
    return validAddress(address) ? address : '';
  }
  async function connectBrowserWallet() {
    const provider = browserProvider();
    if (!provider?.request) throw new Error('Install or open an Ethereum wallet such as MetaMask to connect.');
    const [accounts, chainId] = await Promise.all([provider.request({ method: 'eth_requestAccounts' }), provider.request({ method: 'eth_chainId' }).catch(() => '')]);
    const address = updateBrowserConnection(accounts, chainId);
    if (!address) throw new Error('Your wallet did not return a valid Ethereum account.');
    return address;
  }
  function disconnectBrowserWallet() {
    updateBrowserConnection([]);
  }
  function setUsername(value) { const profile = activeProfile(); if (!profile) throw new Error('Connect a verified Bottle wallet first.'); const username = String(value || '').trim(); if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,23}$/.test(username)) throw new Error('Use 3–24 letters, numbers, dots, dashes, or underscores.'); const all = profiles(); all[profile.key] = { ...profile, username, updatedAt: new Date().toISOString() }; localStorage.setItem(PROFILE_KEY, JSON.stringify(all)); window.dispatchEvent(new CustomEvent('mzk:identity-changed', { detail: all[profile.key] })); return all[profile.key]; }
  function exportWallet() { const profile = activeProfile(); if (!profile) throw new Error('Connect a verified Bottle wallet first.'); return { format: 'muzikaz-wallet-v1', exportedAt: new Date().toISOString(), profile, ledger: history(profile.address), backpack: starterLoadout(profile.address) }; }
  function importWallet(data) { if (data?.format !== 'muzikaz-wallet-v1' || !data.profile) throw new Error('This is not a MUZIKAZ wallet JSON file.'); const verified = activeProfile(); if (!verified || verified.address !== normalize(data.profile.address) || verified.chainId !== normalize(data.profile.chainId) || verified.contract !== normalize(data.profile.contract)) throw new Error('Connect and verify the matching wallet and Bottle contract before restoring this JSON.'); let incoming = connectIdentity(data.profile); if (data.profile.username) incoming = setUsername(data.profile.username); const ledger = read(); for (const entry of Array.isArray(data.ledger) ? data.ledger : []) if (entry.walletId === incoming.address && !ledger.some((item) => item.id === entry.id)) ledger.push(entry); write(ledger); if (data.backpack && normalize(data.backpack.owner) === incoming.address) { const all = loadouts(), previous = all[incoming.address] || {}; all[incoming.address] = { ...data.backpack, ...previous, owner: incoming.address, assets: [...new Set([...(data.backpack.assets || []), ...(previous.assets || [])])], bottleClaims: [...new Set([...(data.backpack.bottleClaims || []), ...(previous.bottleClaims || [])])] }; localStorage.setItem(LOADOUT_KEY, JSON.stringify(all)); window.dispatchEvent(new CustomEvent('mzk:starter-loadout-claimed', { detail: all[incoming.address] })); } return incoming; }
  function downloadWallet() { const data = exportWallet(), blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `muzikaz-${data.profile.address.slice(0, 10)}.wallet.json`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 0); }
  if (!localStorage.getItem(MIGRATION_KEY)) { try { const old = JSON.parse(localStorage.getItem('muzikazBackpackBalances') || '{}'); Object.entries(old).forEach(([owner, amount]) => record({ id: `mzk:legacy-backpack:${normalize(owner)}`, owner, amount: Number(amount) || 0, kind: 'migration', reason: 'Legacy Backpack token balance migrated to MZK' })); } catch (_) { /* Ignore malformed legacy caches. */ } localStorage.setItem(MIGRATION_KEY, 'complete'); }
  function mount(target, options = {}) { const root = typeof target === 'string' ? document.querySelector(target) : target; if (!root) return; const draw = () => { ensureWallet(); const amount = `${balance().toLocaleString()} MZK`; root.textContent = options.compact ? amount : `🪙 ${amount} · one wallet for rewards, Token Mixer, Backpack & VibeVerse`; }; draw(); window.addEventListener('mzk:balance-changed', draw); window.addEventListener('storage', draw); }
  ensureWallet();
  for (const provider of injectedProviders()) {
    provider.on?.('accountsChanged', (accounts) => updateBrowserConnection(accounts));
    provider.on?.('chainChanged', (chainId) => updateBrowserConnection(connectedAddress() ? [connectedAddress()] : [], chainId));
    provider.on?.('disconnect', () => updateBrowserConnection([]));
  }
  window.MZKWallet = { symbol: 'MZK', MZK_PER_USD, MINIMUM_PURCHASE_USD, GAME_ENTRY_MZK, SINGLE_PLAYER_STARTING_MZK, purchaseTokens, walletId, balance, history, record, spend, transfer, creditPurchase, starterLoadout, claimSinglePlayerTokens, distributeSinglePlayerTokens, claimStarterLoadout, provisionStandardLoadout, ensureWallet, mount, profile: activeProfile, connectedAddress, connectedChainId: () => normalize(localStorage.getItem(CONNECTED_CHAIN_KEY)), connectBrowserWallet, disconnectBrowserWallet, connectIdentity, setUsername, exportWallet, importWallet, downloadWallet };
})();
