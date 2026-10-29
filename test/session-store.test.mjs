import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DurableSessionStore } from '../session-store.mjs';
import {LEGACY_SESSION_HASH} from '../opaque-session-secrets.mjs';

const account = { accountId: 'account-1', primaryEthereumWallet: '0x1111111111111111111111111111111111111111' };

test('account sessions are hashed, durable across store instances, independently revoked, and expire', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'mzk-sessions-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'account-sessions.json'); let now = Date.now();
  const firstStore = new DurableSessionStore(file, { ttlSeconds: 60, clock: () => now, maxActivePerAccount: 3 });
  const first = await firstStore.createSession(account); const second = await firstStore.createSession(account);
  const disk = await readFile(file, 'utf8');
  assert.ok(!disk.includes(first.token)); assert.ok(!disk.includes(first.csrfToken), 'no bearer or CSRF plaintext is persisted');
  const restarted = new DurableSessionStore(file, { ttlSeconds: 60, clock: () => now, maxActivePerAccount: 3 });
  assert.equal((await restarted.authenticateSession(first.token)).accountId, account.accountId, 'bearer survives restart');
  assert.equal((await restarted.authenticateSession(second.token)).accountId, account.accountId, 'new devices do not revoke existing sessions');
  assert.equal(await restarted.validCsrf((await restarted.authenticateSession(first.token)), first.csrfToken), true);
  await restarted.revokeSession(second.token);
  assert.equal(await restarted.authenticateSession(second.token), null); assert.ok(await restarted.authenticateSession(first.token));
  now += 61_000; assert.equal(await restarted.authenticateSession(first.token), null, 'expired sessions are rejected');
});

test('game sessions retain parent account-session binding across restarts', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'mzk-games-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'game-sessions.json');
  const store = new DurableSessionStore(file, { ttlSeconds: 300, kind: 'game' });
  const created = await store.createSession(account, { accountSessionId: 'parent-1', avatarId: 'starter-avatar' });
  const restarted = new DurableSessionStore(file, { ttlSeconds: 300, kind: 'game' });
  assert.equal((await restarted.authenticateSession(created.token)).accountSessionId, 'parent-1');
  await restarted.revokeByParent('parent-1'); assert.equal(await restarted.authenticateSession(created.token), null);
});

test('concurrent panel proof reads preserve gameplay proof across sessions and restarts', async t=>{
 const directory=await mkdtemp(join(tmpdir(),'mzk-csrf-panels-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const file=join(directory,'accounts.json');let now=Date.now();
 const store=new DurableSessionStore(file,{ttlSeconds:60,clock:()=>now}),created=await store.createSession(account),other=await store.createSession(account);
 const restarted=new DurableSessionStore(file,{ttlSeconds:60,clock:()=>now});
 const proofs=await Promise.all(Array.from({length:24},()=>store.issueCsrf(created.token)));
 const session=await restarted.authenticateSession(created.token);
 assert.ok(await restarted.validCsrf(session,created.csrfToken),'wallet, map and inventory refreshes must not invalidate a live room');
 assert.ok(proofs.every(proof=>proof===created.csrfToken));
 assert.equal(await restarted.issueCsrf(created.token),created.csrfToken);
 assert.equal(await restarted.validCsrf(await restarted.authenticateSession(other.token),created.csrfToken),false,'a proof is bound to one exact session');
 assert.equal(await restarted.authenticateSession(created.csrfToken),null,'a CSRF proof cannot authenticate as a bearer');
 const disk=await readFile(file,'utf8');assert.ok(!disk.includes(created.token));assert.ok(!disk.includes(created.csrfToken));
 await restarted.revokeSession(created.token);
 assert.equal(await store.issueCsrf(created.token),'');assert.equal(await store.authenticateSession(created.token),null);
 now+=61000;assert.equal(await store.issueCsrf(other.token),'');
});

test('legacy random CSRF proofs migrate once and remain valid for existing in-flight requests',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'mzk-csrf-legacy-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const file=join(directory,'accounts.json'),store=new DurableSessionStore(file,{ttlSeconds:60,issuanceAlgorithm:LEGACY_SESSION_HASH}),created=await store.createSession(account);
 const legacyProofs=Array.from({length:3},()=>{
  const token=randomBytes(24).toString('base64url'),salt=randomBytes(16).toString('base64url');
  return {token,salt,hash:pbkdf2Sync(token,Buffer.from(salt,'base64url'),210000,32,'sha256').toString('base64url')};
 }),data=JSON.parse(await readFile(file,'utf8'));
 const record=data.sessions.find(session=>session.id===created.session.id);
 delete record.tokenHashAlgorithm;delete record.csrfTokenHashAlgorithm;
 record.csrfTokenHash=legacyProofs[0].hash;record.csrfTokenSalt=legacyProofs[0].salt;record.previousCsrfSecrets=legacyProofs.slice(1).map(({hash,salt})=>({hash,salt}));
 await writeFile(file,JSON.stringify(data));
 let writes=0;const write=store.write.bind(store);store.write=async value=>{writes++;return write(value);};
 const proof=await store.issueCsrf(created.token);
 for(let index=0;index<12;index++)assert.equal(await store.issueCsrf(created.token),proof);
 const session=await store.authenticateSession(created.token);
 for(const legacy of legacyProofs)assert.ok(await store.validCsrf(session,legacy.token),'every already-valid proof survives migration');assert.ok(await store.validCsrf(session,proof));
 assert.equal(writes,1,'panel polling must not keep rotating proofs or writing the session store');
});
