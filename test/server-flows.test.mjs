import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

async function freePort() { return new Promise((resolve) => { const server = createServer(); server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); }); }); }
async function waitFor(url, process) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (process.exitCode != null) throw new Error(`Server stopped with ${process.exitCode}`);
    try { const response = await fetch(url); if (response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Server did not become ready.');
}
async function json(url, options = {}) { const response = await fetch(url, options); return { response, body: await response.json() }; }

test('admin, new-user Loadout Pass, and aggregate marketplace work through the live server', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'muzikaz-server-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const port = await freePort(); const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.mjs'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(port), MUZIKAZ_DATA_DIR: directory, MUZIKAZ_USER_DATABASE_FILE: join(directory, 'users.json'), MUZIKAZ_ACCOUNTS_FILE: join(directory, 'accounts.json'), MUZIKAZ_PAYMENT_ORDERS_FILE: join(directory, 'payments.json'), MUZIKAZ_ADMIN_USERNAME: 'test-admin', MUZIKAZ_ADMIN_PASSWORD: 'test-password', MUZIKAZ_ADMIN_SESSION_SECRET: 'test-session-secret', MUZIKAZ_CORS_ORIGINS: 'https://admin.muzikaz.test' }, stdio: 'ignore' });
  t.after(() => { if (child.exitCode == null) child.kill('SIGTERM'); }); await waitFor(`${base}/api/health`, child);

  const health = await json(`${base}/api/health`, { headers: { Origin: 'https://admin.muzikaz.test' } });
  assert.equal(health.body.storage, 'ready');
  assert.equal(health.body.service, 'muzikaz-member-market');
  assert.equal(health.body.version, '1.0.0');
  assert.ok(health.body.commit);
  assert.ok(health.body.startedAt);
  assert.deepEqual(health.body.routes, { accountBootstrap: true, accessActivation: true, gameSession: true });
  assert.equal(health.body.persistentStorageConfigured, false);
  assert.equal(health.response.headers.get('access-control-allow-origin'), 'https://admin.muzikaz.test', 'approved static admin deployments can call the live API with credentials');
  assert.equal(health.response.headers.get('access-control-allow-credentials'), 'true');
  assert.ok(health.response.headers.get('x-request-id'));
  assert.equal((await json(`${base}/api/health`, { headers: { Origin: 'https://evil.example' } })).response.headers.get('access-control-allow-origin'), null, 'unknown origins are never reflected');

  const usernameLogin = await json(`${base}/api/access/free-play`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'InstantPlayer', password: 'loadout-now' }) });
  assert.equal(usernameLogin.response.status, 200, 'username and password immediately create a member session');
  assert.equal(usernameLogin.body.data.account.loadoutAccess, true);
  assert.equal(usernameLogin.body.data.backpack.status, 'ready', 'the complete Loadout is returned with the login response');
  assert.equal(usernameLogin.body.data.backpack.mzkBalance, 2000);
  assert.equal(usernameLogin.body.data.permissions.creatorTools, true);
  assert.equal(usernameLogin.body.data.permissions.marketplace, true);
  assert.equal(usernameLogin.body.data.permissions.games, true);

  const simpleLogin = await json(`${base}/api/access/username`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'BackpackPlayer' }) });
  assert.equal(simpleLogin.response.status, 200, 'a username alone opens a persistent member session');
  assert.equal(simpleLogin.body.data.account.username, 'BackpackPlayer');
  assert.equal(simpleLogin.body.data.backpack.mzkBalance, 2000);
  const restoredLogin = await json(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'backpackplayer' }) });
  assert.equal(restoredLogin.response.status, 200, 'the short login alias restores the same username profile');
  assert.equal(restoredLogin.body.data.account.accountId, simpleLogin.body.data.account.accountId);
  assert.equal(restoredLogin.body.data.account.backpackId, simpleLogin.body.data.account.backpackId);

  const login = await json(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'test-admin', password: 'test-password' }) });
  assert.equal(login.response.status, 200); assert.equal(login.body.data.persistent, true); assert.ok(login.body.data.token);
  const cookie = login.response.headers.get('set-cookie').split(';')[0];
  assert.equal((await json(`${base}/api/admin/session`, { headers: { Cookie: cookie } })).body.data.authenticated, true);
  const guestChat = await json(`${base}/api/houses/ioncore-house/chat?roomId=rad-tox`);
  assert.equal(guestChat.response.status, 200, 'guests can load the public multiplayer room without an account session');
  assert.deepEqual(guestChat.body.messages, []);
  const guestHeaders = { 'Content-Type': 'application/json', 'X-MUZIKAZ-Session': 'mobile-guest-1', 'X-User-Id': 'guest:mobile-guest-1', 'X-User-Name': 'Guest-obile1' };
  const guestPresence = await json(`${base}/api/houses/ioncore-house/presence`, { method: 'POST', headers: guestHeaders, body: JSON.stringify({ roomId: 'rad-tox' }) });
  assert.equal(guestPresence.response.status, 200, 'mobile guests can join presence with the starter avatar');
  assert.equal(guestPresence.body.users[0].avatarAssetId, 'starter-avatar');
  const guestMessage = await json(`${base}/api/houses/ioncore-house/chat`, { method: 'POST', headers: guestHeaders, body: JSON.stringify({ message: 'guest ready' }) });
  assert.equal(guestMessage.response.status, 201, 'a joined guest can send multiplayer chat');
  const adminData = await json(`${base}/api/admin/data`, { headers: { Cookie: cookie } });
  assert.equal(adminData.response.status, 200, 'persistent admin receives the full data center');
  for (const sheet of ['mzkTransactions', 'items', 'backpackItems', 'spaces']) assert.ok(Array.isArray(adminData.body.data[sheet]), `${sheet} is available as an administrator spreadsheet`);

  const pass = await json(`${base}/api/admin/loadout-codes`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresInDays: 7, waiveLoadout: true, violetBottle: true, starterLand: true, creatorVault: true }) });
  assert.equal(pass.response.status, 201); assert.equal(pass.body.data.label, 'MZK Loadout Pass');
  assert.equal(pass.body.data.activationPath, `/members.html#access-code=${pass.body.data.code}`, 'admin receives a directly shareable activation route');
  const wallet = '0x5555555555555555555555555555555555555555';
  const activation = await json(`${base}/api/access/activate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: pass.body.data.code, username: 'New User' }) });
  assert.equal(activation.response.status, 200); assert.equal(activation.body.data.account.loadoutStatus, 'included'); assert.equal(activation.body.data.account.creatorVaultAccess, true); assert.equal(activation.body.data.account.primaryEthereumWallet, null);
  assert.equal(activation.body.data.account.mzkBalance, 2000, 'admin Loadout codes include the full first-buy-equivalent MZK grant');
  const accountCookie = activation.response.headers.get('set-cookie').split(';')[0];
  const memberMultiplayer = await json(`${base}/api/houses/ioncore-house/chat`, { headers: { Cookie: accountCookie } });
  assert.equal(memberMultiplayer.response.status, 200, 'an authoritative member can read the same public multiplayer room');
  assert.equal(memberMultiplayer.body.messages.at(-1)?.message, 'guest ready', 'members and guests share the room history');
  const gameBackpack = await json(`${base}/api/backpack`, { headers: { Cookie: accountCookie } });
  assert.equal(gameBackpack.response.status, 200);
  assert.equal(gameBackpack.body.data.environments.length, 12, 'every labeled repository environment is loaded into the game Backpack');
  assert.equal(gameBackpack.body.data.avatars.filter((item) => item.source === 'repository').length, 30, 'every labeled avatar is available to the game');
  assert.equal(gameBackpack.body.data.props.length, 4, 'prop-folder models stay in the prop inventory');
  assert.equal(gameBackpack.body.data.vehicles.length, 1, 'vehicle-folder models stay in the vehicle inventory');
  const dax = gameBackpack.body.data.avatars.find((item) => item.id === 'repository-dax');
  assert.equal((await fetch(`${base}${dax.modelUrl}`)).status, 200, 'catalog model URLs resolve through the backend');
  const avatarSelection = await json(`${base}/api/avatar-selection`, { method: 'PUT', headers: { Cookie: accountCookie, 'X-CSRF-Token': activation.body.data.csrfToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ avatarId: dax.id }) });
  assert.equal(avatarSelection.response.status, 200, 'an included repository avatar can be equipped from the Backpack');
  assert.equal(avatarSelection.body.data.selectedAvatarId, dax.id);
  const cribPresence = await json(`${base}/api/houses/ioncore-house/presence`, { method: 'POST', headers: { Cookie: accountCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ roomId: 'rad-tox' }) });
  assert.equal(cribPresence.response.status, 200, 'a member with a designated avatar can join the shared room');
  const spokenChat = await json(`${base}/api/houses/ioncore-house/chat`, { method: 'POST', headers: { Cookie: accountCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Hello shared room' }) });
  assert.equal(spokenChat.response.status, 201, 'room text is sent through the shared server for text-to-speech clients');
  assert.equal(spokenChat.body.message, 'Hello shared room');
  assert.equal(spokenChat.body.roomId, 'rad-tox', 'the server identifies the room that should speak the message');
  const codeOnlyState = await json(`${base}/api/wallet/state`, { headers: { Cookie: accountCookie } });
  assert.equal(codeOnlyState.response.status, 200, 'an access-code session opens the new Backpack without an Ethereum address');
  assert.ok(codeOnlyState.body.data.items.some((item) => item.name === 'Starter Avatar'), 'the loadout is in durable game memory');
  assert.equal(codeOnlyState.body.data.tokens.MZK, 2000, 'the starter balance is available to multiplayer and market APIs');
  const walletLogin = await json(`${base}/api/access/wallet`, { method: 'POST', headers: { Cookie: accountCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ wallet }) });
  assert.equal(walletLogin.response.status, 200); assert.equal(walletLogin.body.data.account.primaryEthereumWallet, wallet);
  assert.equal(walletLogin.body.data.account.accountId, activation.body.data.account.accountId, 'wallet and code open one canonical account');
  assert.equal(walletLogin.body.data.account.backpackId, activation.body.data.account.backpackId, 'opening Ethereum attaches it to the code-created Backpack');
  assert.deepEqual(walletLogin.body.data.account.gameAssets, ['Starter Avatar', 'Unrevealed Loadout Avatar', 'Community Spot', 'Starter Room Shell', 'Builder Tool Kit', 'Creator Market Station', 'RAD-TOX Starter Gear']);

  const bypassDenied = await json(`${base}/api/access/admin-bypass`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'wrong' }) });
  assert.equal(bypassDenied.response.status, 401, 'an incorrect owner word cannot bypass the Bottle gate');
  const bypass = await json(`${base}/api/access/admin-bypass`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'test-password' }) });
  assert.equal(bypass.response.status, 200, 'the configured admin word opens an owner Loadout session');
  assert.equal(bypass.body.data.account.mzkBalance, 2000);
  assert.equal(bypass.body.data.account.gameAccess, true);
  const bypassCookie = bypass.response.headers.get('set-cookie').split(';')[0];
  const game = await json(`${base}/api/game/session`, { method: 'POST', headers: { Cookie: bypassCookie, 'X-CSRF-Token': bypass.body.data.csrfToken } });
  assert.equal(game.response.status, 201, 'the owner bypass proceeds through the authenticated game-session route');
  assert.match(game.response.headers.get('set-cookie'), /^mzk_game=/);
  const gameCookie = game.response.headers.get('set-cookie').split(';')[0];
  const gameplaySpend = await json(`${base}/api/game/spend`, { method: 'POST', headers: { Cookie: `${bypassCookie}; ${gameCookie}`, 'X-CSRF-Token': bypass.body.data.csrfToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ amountMzk: 50, requestId: 'owner-game-1', gameId: 'rad-tox', reason: 'match entry' }) });
  assert.equal(gameplaySpend.response.status, 201); assert.equal(gameplaySpend.body.data.balanceAfterMzk, 1950);
  const updatedAdminData = await json(`${base}/api/admin/data`, { headers: { Cookie: cookie } });
  assert.equal(updatedAdminData.body.data.summary.gameplaySpentMzk, 50, 'admin pages receive the live gameplay-spend total');
  assert.equal(updatedAdminData.body.data.gameplaySpending[0].walletId, `account:${bypass.body.data.account.accountId}`);

  const forgedState = await json(`${base}/api/wallet/state`, { method: 'PUT', headers: { Cookie: accountCookie, 'X-CSRF-Token': activation.body.data.csrfToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ tokens: { MZK: 999999 }, items: [{ id: 'forged-pack', name: 'Forged Pack' }] }) });
  assert.equal(forgedState.response.status, 405, 'clients cannot mint MZK or Backpack inventory through a generic state write');
  assert.equal(forgedState.body.code, 'AUTHORITATIVE_STATE_REQUIRED');
  await json(`${base}/api/profile/memory`, { method: 'PATCH', headers: { Cookie: accountCookie, 'X-CSRF-Token': activation.body.data.csrfToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ memory: { games: { radTox: { level: 3 } } } }) });
  const profile = await json(`${base}/api/profile`, { headers: { Cookie: accountCookie } });
  assert.equal(profile.body.data.tokens.MZK, 2000, 'the market balance remains server-authoritative after a forged write');
  assert.equal(profile.body.data.memory.games.radTox.level, 3, 'game memory restores from the authenticated profile API');
  assert.ok(profile.body.data.connectedWallets.some((entry) => entry.address === wallet), 'the profile includes its bound blockchain wallet');
  const listedItem = codeOnlyState.body.data.items.find((item) => item.name === 'Starter Avatar');
  await json(`${base}/api/market/listings`, { method: 'PUT', headers: { Cookie: accountCookie, 'X-CSRF-Token': activation.body.data.csrfToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId: listedItem.id, priceMzk: 75 }) });
  const listings = await json(`${base}/api/market/listings`); assert.equal(listings.response.status, 200); assert.deepEqual(listings.body.data.map((item) => item.itemName), ['Starter Avatar']);
});

test('member entry opens the entire area locally with email and password', async () => {
  const [source, page] = await Promise.all([
    readFile(new URL('../script.js', import.meta.url), 'utf8'),
    readFile(new URL('../members.html', import.meta.url), 'utf8')
  ]);
  const login = source.slice(source.indexOf('function initBottleLogin'), source.indexOf('marketQualityToggle?.addEventListener'));
  assert.match(page, /name="email"[^>]*type="email"[^>]*autocomplete="email"/);
  assert.match(page, /name="password"[^>]*autocomplete="current-password"/);
  assert.match(page, /public\/js\/avatar-selection\.js/);
  assert.match(login, /localStorage\.setItem\('muzikazBottleMember', 'true'\)/);
  assert.match(login, /lockedContent\.dataset\.locked = 'false'/);
  assert.match(login, /muzikaz:member-authenticated/);
  assert.doesNotMatch(login, /\/api\//, 'member login must open without waiting for an API request');
});

test('the VibeVerse multiplayer client uses the simple login without a Loadout gate', async () => {
  const [source, page, server] = await Promise.all([
    readFile(new URL('../public/js/crib-multiplayer.js', import.meta.url), 'utf8'),
    readFile(new URL('../model-explorer.html', import.meta.url), 'utf8'),
    readFile(new URL('../server.mjs', import.meta.url), 'utf8')
  ]);
  assert.doesNotMatch(source, /apiFetch\('\/api\/account\/bootstrap'/);
  assert.match(source, /localStorage\.getItem\('muzikazBottleMember'\)/);
  assert.match(source, /'X-User-Name': username/);
  assert.match(source, /document\.body\.style\.position = 'fixed'/, 'opening chat must lock the game page against scrolling');
  assert.match(source, /await postMessage\(message\); sent = true;[\s\S]*setPanel\(false\)/, 'a successfully sent message must close chat');
  assert.doesNotMatch(page, /data-multiplayer-control disabled/);
  assert.doesNotMatch(page, /id="multiplayer-paywall"/);
  const routes = server.slice(server.indexOf("'/api/houses/ioncore-house/events'"), server.indexOf("url.pathname.startsWith('/api/')"));
  assert.doesNotMatch(routes, /multiplayerContext/, 'multiplayer routes must not require an account entitlement');
});
