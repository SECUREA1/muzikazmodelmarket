import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('contained wearable loot must be shot, collected, and pinned to its declared socket', async () => {
  const [game, manifestText] = await Promise.all([
    readFile(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/models/backpack-assets.json', import.meta.url), 'utf8')
  ]);
  const manifest = JSON.parse(manifestText);
  const armor = manifest.assets.find(asset => asset.id === 'volt-wolf-wearable');
  assert.equal(armor.attachment.socket, 'torso');
  assert.equal(armor.container.type, 'breakable-block');
  assert.equal(armor.container.requiresShot, true);
  assert.ok(armor.container.hits > 0);
  assert.match(game, /spawnAttachmentBlock\(asset\)/);
  assert.match(game, /damageLootBlock\(lootHit\.root\)/);
  assert.match(game, /muzikaz:attachment-loot-released/);
  assert.match(game, /pinAssetToPlayer\(root,asset\)/);
  assert.match(game, /root\.rotation\.set\(pin\.rotation\[0\],player\.yaw\+pin\.rotation\[1\],pin\.rotation\[2\]\)/);
});
