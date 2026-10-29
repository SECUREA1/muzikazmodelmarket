import assert from 'node:assert/strict';
import test from 'node:test';
import {ensureWorldSupply, worldSupplyIsCurrent} from '../world-supply.mjs';

const fields = ['catalog','aliases','worldStock','factoryStock','maps','production','shipments','receipts'];
const copy = value => JSON.parse(JSON.stringify(value));

test('current supply detection is pure and default ensure performs no writes on a current frozen ledger', () => {
  const seeded = {};
  ensureWorldSupply(seeded);
  const data = copy(seeded);
  const item = Object.keys(data.worldSupply.worldStock)[0];
  data.worldSupply.worldStock[item] = 0;
  const before = copy(data);
  for (const field of fields) Object.freeze(data.worldSupply[field]);
  Object.freeze(data.worldSupply);
  assert.equal(worldSupplyIsCurrent(data), true);
  assert.deepEqual(data, before);
  assert.equal(ensureWorldSupply(data), data.worldSupply);
  assert.deepEqual(data, before);
});

test('current predicate exactly identifies default initialization or reconciliation writes on JSON ledger states', () => {
  const current = {};
  ensureWorldSupply(current);
  const cases = [{}, {worldSupply: null}, {worldSupply: false}, {worldSupply: {}}, copy(current)];
  const oldRevision = copy(current); oldRevision.worldSupply.catalogRevision = 'old-catalog'; cases.push(oldRevision);
  for (const field of fields) {
    for (const missing of [undefined, null, false, 0, '']) {
      const data = copy(current);
      if (missing === undefined) delete data.worldSupply[field];
      else data.worldSupply[field] = missing;
      cases.push(data);
    }
  }
  for (const data of cases) {
    const before = copy(data), predicted = worldSupplyIsCurrent(data);
    assert.deepEqual(data, before, 'the predicate must not mutate the supplied data');
    ensureWorldSupply(data);
    assert.equal(predicted, JSON.stringify(data) === JSON.stringify(before));
  }
});

test('being current does not suppress explicit item or map registration', () => {
  const data = {};
  ensureWorldSupply(data);
  assert.equal(worldSupplyIsCurrent(data), true);
  ensureWorldSupply(data, {maps: [{id: 'registered-map', name: 'Registered map'}],
    items: [{id: 'custom-prop', name: 'Custom prop', modelUrl: '/uploads/models/custom-prop.glb'}]});
  assert.equal(data.worldSupply.maps['registered-map'].name, 'Registered map');
  assert.ok(data.worldSupply.aliases['custom-prop']);
  assert.equal(worldSupplyIsCurrent(data), true);
});
