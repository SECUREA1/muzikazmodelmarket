import test from 'node:test';
import assert from 'node:assert/strict';
import { firingRangeClock, firingRangeAccuracy, FIRING_RANGE_SETUP_DEFAULTS } from '../public/js/firing-range-hud.js';
import { FIRING_RANGE_DEFAULTS } from '../public/js/firing-range.js';
import { normalizeFiringRangeScope, firingRangeScopeFov } from '../public/js/firing-range-scope.js';

test('range HUD uses the live server setup and clocks round up without going negative', () => {
  assert.equal(FIRING_RANGE_SETUP_DEFAULTS, FIRING_RANGE_DEFAULTS);
  assert.equal(firingRangeClock(45_001), '0:46');
  assert.equal(firingRangeClock(60_000), '1:00');
  assert.equal(firingRangeClock(-200), '0:00');
  assert.equal(firingRangeClock(NaN), '0:00');
});

test('range accuracy treats unattempted rounds separately and clamps impossible totals', () => {
  assert.equal(firingRangeAccuracy({ shots: 0, hits: 0 }), '—');
  assert.equal(firingRangeAccuracy({ shots: 12, hits: 9 }), '75%');
  assert.equal(firingRangeAccuracy({ shots: 2, hits: 10 }), '100%');
  assert.equal(firingRangeAccuracy({ shots: -1, hits: -1 }), '—');
});

test('adjustable scopes normalize zoom and reticles and never zoom while inactive', () => {
  assert.deepEqual(normalizeFiringRangeScope({ active: true, zoom: 9, reticle: 'ring' }), { active: true, zoom: 8, reticle: 'ring' });
  assert.deepEqual(normalizeFiringRangeScope({ active: 'yes', zoom: -3, reticle: '<script>' }), { active: false, zoom: 1, reticle: 'cross' });
  assert.equal(normalizeFiringRangeScope({ zoom: 2.24 }).zoom, 2);
  assert.equal(normalizeFiringRangeScope({ zoom: Infinity }).zoom, 2);
  assert.equal(firingRangeScopeFov(75, { active: false, zoom: 8 }), 75);
});

test('scope magnification preserves the actual view ratio across desktop and mobile base FOV', () => {
  for (const base of [55, 75, 100]) {
    for (const zoom of [1, 2, 4, 8]) {
      const scoped = firingRangeScopeFov(base, { active: true, zoom });
      const ratio = Math.tan(base * Math.PI / 360) / Math.tan(scoped * Math.PI / 360);
      assert.ok(Math.abs(ratio - zoom) < 1e-10);
    }
  }
  assert.ok(Number.isFinite(firingRangeScopeFov(NaN, { active: true, zoom: NaN })));
});
