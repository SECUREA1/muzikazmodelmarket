import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('enemy attacks use game-loop-controlled animated SVG effects', async () => {
  const effect = await readFile(new URL('../public/js/effects/animated-svg-effect.js', import.meta.url), 'utf8');
  const enemy = await readFile(new URL('../public/js/enemies/neon-brain-bug.js', import.meta.url), 'utf8');

  assert.match(effect, /class AnimatedSvgEffect/, 'provides a reusable animated SVG effect');
  assert.match(effect, /data:image\/svg\+xml/, 'loads crisp SVG artwork as a Three.js texture');
  assert.match(effect, /update\(delta\)/, 'drives animation from the gameplay clock');
  assert.match(effect, /reducedMotion/, 'supports a restrained mobile/reduced-motion presentation');
  assert.match(enemy, /ATTACK_TELL_SVG/, 'brain bugs visibly telegraph an incoming attack');
  assert.match(enemy, /attackTell\.play\(\)/, 'the warning animation starts during attack wind-up');
  assert.match(enemy, /attackFlash\.play\(\)/, 'the impact animation starts as the projectile fires');
  assert.match(enemy, /attackTell\.dispose\(\).*attackFlash\.dispose\(\)/, 'effect resources are released with the enemy');
});

