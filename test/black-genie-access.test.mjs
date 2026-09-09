import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the Single Player gate uses MZK and does not require a Genie Bottle', async () => {
  const source = await readFile(new URL('../public/js/black-genie-access.js', import.meta.url), 'utf8');
  assert.match(source, /claimStarterLoadout/);
  assert.match(source, /500 MZK \(\$5\)/);
  assert.match(source, /Black Genie Bottle and free Loadout are delivered after payment/);
  assert.doesNotMatch(source, /eth_getTransactionReceipt|eth_sendTransaction|CONTRACT/);
});
