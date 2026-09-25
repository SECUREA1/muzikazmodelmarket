import test from 'node:test';
import assert from 'node:assert/strict';
import { categorizeAsset } from '../public/js/asset-taxonomy.js';

test('catalog props retain an accurate authored category', () => {
  assert.deepEqual(categorizeAsset({ assetType: 'prop', category: 'props' }), { type: 'props', category: 'props' });
  assert.deepEqual(categorizeAsset({ type: 'props', builderCategory: 'weapons', name: 'Plasma Sword' }), { type: 'props', category: 'weapons' });
  assert.deepEqual(categorizeAsset({ type: 'props', builderCategory: 'interactive', name: 'Portal Door' }), { type: 'interactive', category: 'interactive' });
});

test('specific repository categories are not collapsed into props', () => {
  assert.deepEqual(categorizeAsset({ assetType: 'environment', category: 'environment' }), { type: 'terrain', category: 'terrain' });
  assert.deepEqual(categorizeAsset({ assetType: 'creature', category: 'pets' }), { type: 'enemy', category: 'creatures' });
  assert.deepEqual(categorizeAsset({ assetType: 'avatar', category: 'Playable Avatars' }), { type: 'avatar', category: 'characters' });
});

test('unknown assets safely fall back to props', () => {
  assert.deepEqual(categorizeAsset({ name: 'Unlabelled model' }), { type: 'props', category: 'props' });
});
