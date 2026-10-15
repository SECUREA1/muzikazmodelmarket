import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const script = await readFile(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8');

test('Flame Thrower sprays toward the aim instead of spawning on the player', () => {
  assert.match(script, /toolButton\('flame','Flame Thrower'/);
  assert.match(script, /start=origin\.clone\(\)\.addScaledVector\(direction,\.8\)/, 'flames begin safely ahead of the user');
  assert.match(script, /flameRange: 18/);
  assert.match(script, /setFromCamera\(this\.pointer,this\.camera\);return this\.fireFlame/, 'pointer and touch shots follow the selected aim');
  assert.match(script, /if\(this\.tool==='flame'\)return this\.fireFlame\(origin,direction\)/, 'XR flames follow the controller aim');
});

test('aimed flames fade and can burn gameplay items', () => {
  assert.match(script, /flame\.material\.opacity=Math\.max\(0,1-data\.age\/data\.lifetime\)/);
  assert.match(script, /igniteAt\(data\.destination\)/);
  assert.match(script, /\.\.\.this\.bubbles,\.\.\.this\.bricks,\.\.\.this\.lootBlocks,\.\.\.this\.avatarTargets\(\)/);
  assert.match(script, /burningUntil=performance\.now\(\)\+TOXIC_BUBBLE_CONFIG\.flamePatchLifetime/);
  assert.match(script, /this\.damageTarget\(target,TOXIC_BUBBLE_CONFIG\.flameDamage\)/);
  assert.match(script, /this\.flamePatches\.splice/);
});
