import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('RAD-TOX dynamite equips, tosses, lands, and releases animated gas', async () => {
  const script = await readFile('public/js/house-explorer-glb.js', 'utf8');

  assert.match(script, /this\.camera\.add\([^)]*this\.dynamiteModel/, 'the equipped dynamite is attached to the first-person camera');
  assert.match(script, /this\.dynamiteModel\.visible=this\.tool==='dynamite'/, 'selecting dynamite reveals it in hand');
  assert.match(script, /if\(this\.tool==='dynamite'\)return this\.throwDynamite\(\)/, 'the pointer trigger tosses the selected dynamite');
  assert.match(script, /if\(this\.tool==='dynamite'\)return this\.throwDynamite\(origin,direction\)/, 'an XR trigger tosses the selected dynamite');
  assert.match(script, /dynamiteModel\.position\.set/, 'the held dynamite has a first-person hand pose');
  assert.match(script, /stick\.userData\.landed=true/, 'the tossed stick settles after bouncing on the floor');
  assert.match(script, /createDynamiteGas\(position,radius\)/, 'the animated explosion emits a green gas cloud');
  assert.match(script, /toxicGas:true/, 'gas particles use their rising, expanding animation path');
  assert.match(script, /dynamiteModel\.visible=false/, 'throwing releases the held first-person stick');
  assert.match(script, /−\$\{TOXIC_BUBBLE_CONFIG\.dynamiteCost\} MZK/, 'the HUD visually confirms the token spend');
  assert.match(script, /window\.MZKWallet\?\.balance/, 'the HUD reads the active MZK balance, including guest tokens');
  assert.match(script, /playerHit=this\.getPlayerPosition\(\)\.distanceTo\(position\)<=radius/, 'the blast can hurt the throwing player');
  assert.match(script, /avatarHealth=Math\.max/, 'the blast damages avatars inside its radius');
});
