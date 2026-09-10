import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('member game-space builder exposes category controls and settlement actions', async () => {
  const html = await readFile('members.html', 'utf8');
  const script = await readFile('script.js', 'utf8');
  for (const control of ['space-type-toggles', 'space-asset-select', 'space-add-asset', 'space-save-draft', 'space-export-map', 'space-publish-map']) {
    assert.match(html, new RegExp(`id="${control}"`));
  }
  for (const type of ['Map', 'Avatar', 'Ghost', 'Enemy', 'Reward', 'Weapon', 'Item']) {
    assert.match(script, new RegExp(`type: '${type}'`));
  }
  assert.match(script, /MZKWallet\?\.spend\?\./, 'adding an asset settles through the MZK wallet');
  assert.match(script, /coins -= 100/, 'publishing settles the disclosed Builder Coin price');
  assert.match(script, /muzikaz-game-space-v1/, 'exports use a versioned game manifest');
});
