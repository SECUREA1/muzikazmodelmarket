import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AccessCodeStore } from '../access-code-store.mjs';

test('issues one durable code per wallet and authenticates it', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'muzikaz-access-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'access-codes.json');
  const store = new AccessCodeStore(file);
  const wallet = '0x1111111111111111111111111111111111111111';
  const issued = await store.issue(wallet);
  assert.match(issued.code, /^MZK-[A-F0-9]{4}(?:-[A-F0-9]{4}){3}$/);
  assert.equal((await store.issue(wallet)).alreadyIssued, true);
  assert.equal((await new AccessCodeStore(file).authenticate(issued.code.toLowerCase())).walletId, wallet);
  assert.doesNotMatch(await readFile(file, 'utf8'), new RegExp(issued.code.replaceAll('-', '')));
});

test('rejects invalid access codes', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'muzikaz-access-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new AccessCodeStore(join(directory, 'access-codes.json'));
  await assert.rejects(store.authenticate('MZK-NOT-A-CODE'), /valid MUZIKAZ access code/);
});
