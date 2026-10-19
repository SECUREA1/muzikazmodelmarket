import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {Flamethrower} from '../public/js/flamethrower.js';

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
  const events = [], classSource = game.slice(game.indexOf('  class ToxicBubbleSystem {'), game.indexOf('  let viewActive'));
  const System = new Function('THREE', 'document', 'CustomEvent', classSource + ';return ToxicBubbleSystem;')(THREE, {dispatchEvent: event => events.push(event)}, class {constructor(type, options) {this.type = type; this.detail = options.detail;}});
  const scene = new THREE.Scene(), block = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()), system = Object.create(System.prototype);
  block.position.z = -2;
  block.userData = {lootBlock: true, hits: 0, maxHits: armor.container.hits, asset: armor};
  scene.add(block);
  Object.assign(system, {scene, tool: 'laser', lootBlocks: [block], bricks: [], bubbles: [], flameSystem: new Flamethrower({THREE, scene, colliders: () => [], damage() {}}), flameColliders: () => [{root: block}], registerLaserShot() {}, showWeaponShot() {}, createPopParticles() {}, tone() {}, setState() {}});
  for (let hit = 1; hit <= armor.container.hits; hit++) {
    system.fireLegacyLaser(new THREE.Vector3(), new THREE.Vector3(0, 0, -1));
    assert.equal(block.userData.hits, hit);
    assert.equal(events.length, hit === armor.container.hits ? 1 : 0, 'loot releases only after the required shot count');
  }
  assert.equal(block.parent, null);
  assert.deepEqual(system.lootBlocks, []);
  assert.equal(events[0].type, 'muzikaz:attachment-loot-released');
  assert.equal(events[0].detail.asset, armor);
  assert.match(game, /muzikaz:attachment-loot-released/);
  assert.match(game, /pinAssetToPlayer\(root,asset\)/);
  assert.match(game, /root\.rotation\.set\(pin\.rotation\[0\],player\.yaw\+pin\.rotation\[1\],pin\.rotation\[2\]\)/);
});
