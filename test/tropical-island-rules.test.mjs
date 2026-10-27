import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ISLAND_BUZZ_SECONDS, ISLAND_MAX_ACTIVE_DRINKS, EXPERIENCE_IDS,
  createIslandSession, startIslandSession, stepIslandSession, finishIslandSession,
  consumeIslandDrink, visitIslandExperience, islandEffects
} from '../public/js/tropical-island-rules.js';

const running = () => startIslandSession(createIslandSession());
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≈ ${expected}`);

test('island exploration is unlimited and ends only through an explicit finish', () => {
  const s = createIslandSession(10);
  assert.equal(s.status, 'ready');
  assert.equal(s.remaining, null);
  assert.equal(s.duration, null);
  stepIslandSession(s, 1000);
  assert.equal(s.elapsed, 0);
  assert.equal(consumeIslandDrink(s, 'beer').ok, false);
  startIslandSession(s, 12);
  assert.equal(s.startedAt, 12);
  stepIslandSession(s, 120);
  assert.equal(s.status, 'running');
  stepIslandSession(s, 10000);
  assert.equal(s.status, 'running');
  assert.equal(s.elapsed, 10120);
  assert.equal(visitIslandExperience(s, 'cabanas').ok, true);
  finishIslandSession(s);
  assert.equal(s.status, 'finished');
  assert.equal(consumeIslandDrink(s, 'beer').ok, false);
  assert.equal(visitIslandExperience(s, 'cabanas').ok, false);
  stepIslandSession(s, 10);
  assert.equal(s.elapsed, 10120);
});

test('one beer absorbs gradually, then fully clears by its own 120-second expiry', () => {
  const s = running();
  assert.equal(consumeIslandDrink(s, 'beer').ok, true);
  assert.equal(s.intoxication, 0, 'a drink does not instantly apply its effect');
  assert.equal(s.stomach, .33);
  assert.equal(s.buzzRemaining, ISLAND_BUZZ_SECONDS);
  stepIslandSession(s, 5);
  assert.ok(s.intoxication > 0 && s.intoxication < .33);
  assert.ok(s.stomach > 0 && s.stomach < .33);
  const rising = s.intoxication;
  stepIslandSession(s, 5);
  assert.ok(s.intoxication > rising);
  assert.equal(s.stomach, 0);
  const peak = s.intoxication;
  stepIslandSession(s, 80);
  assert.ok(s.intoxication > 0 && s.intoxication < peak);
  stepIslandSession(s, 29.9);
  assert.ok(s.intoxication > 0);
  stepIslandSession(s, .1);
  assert.equal(s.intoxication, 0);
  assert.equal(s.stomach, 0);
  assert.equal(s.buzzRemaining, 0);
  assert.deepEqual(s.activeDrinks, []);
  assert.equal(islandEffects(s).strength, 0);
  assert.equal(s.status, 'running', 'sobering never ends the island visit');
});

test('stacked beers have independent clocks and expire without resetting older doses', () => {
  const single = running(), stacked = running();
  consumeIslandDrink(single, 'beer');
  consumeIslandDrink(stacked, 'beer');
  stepIslandSession(single, 60);
  stepIslandSession(stacked, 60);
  const firstId = stacked.activeDrinks[0].id;
  assert.equal(consumeIslandDrink(stacked, 'beer').ok, true);
  assert.equal(stacked.activeDrinks[0].remaining, 60);
  assert.equal(stacked.activeDrinks[1].remaining, 120);
  assert.equal(stacked.buzzRemaining, 120);
  assert.equal(stacked.nextExpiryIn, 60);
  stepIslandSession(single, 10);
  stepIslandSession(stacked, 10);
  assert.ok(stacked.intoxication > single.intoxication);
  stepIslandSession(stacked, 50);
  assert.equal(stacked.activeDrinks.length, 1);
  assert.notEqual(stacked.activeDrinks[0].id, firstId);
  assert.equal(stacked.activeDrinks[0].age, 60);
  assert.equal(stacked.buzzRemaining, 60);
  assert.equal(stacked.nextSoberIn, 60);
  assert.ok(stacked.intoxication > 0, 'the newer beer remains active');
  stepIslandSession(stacked, 60);
  assert.equal(stacked.intoxication, 0);
  assert.deepEqual(stacked.activeDrinks, []);
});

test('digestion gives the same result at low and high frame rates', () => {
  const slow = running(), fast = running();
  consumeIslandDrink(slow, 'cocktail');
  consumeIslandDrink(fast, 'cocktail');
  stepIslandSession(slow, 90);
  for (let i = 0; i < 5400; i++) stepIslandSession(fast, 1 / 60);
  close(slow.stomach, fast.stomach);
  close(slow.intoxication, fast.intoxication);
  close(slow.buzzRemaining, fast.buzzRemaining);
  stepIslandSession(slow, 30);
  for (let i = 0; i < 1800; i++) stepIslandSession(fast, 1 / 60);
  assert.equal(slow.intoxication, 0);
  assert.equal(fast.intoxication, 0);
  assert.deepEqual(fast.activeDrinks, []);
});

test('active intake is bounded and can resume after an individual drink expires', () => {
  const s = running();
  for (let i = 0; i < ISLAND_MAX_ACTIVE_DRINKS; i++) {
    assert.equal(consumeIslandDrink(s, 'cocktail').ok, true);
    stepIslandSession(s, 2.5);
    assert.ok(s.intoxication >= 0 && s.intoxication <= 1);
  }
  assert.equal(s.activeDrinks.length, 6);
  assert.equal(consumeIslandDrink(s, 'cocktail').ok, false);
  assert.equal(consumeIslandDrink(s, 'water').ok, true, 'refreshments remain available at the alcohol limit');
  stepIslandSession(s, 105);
  assert.equal(s.elapsed, 120);
  assert.equal(s.activeDrinks.length, 5);
  assert.equal(consumeIslandDrink(s, 'beer').ok, true);
  assert.equal(s.activeDrinks.length, 6);
  stepIslandSession(s, 120);
  assert.equal(s.intoxication, 0, 'saturated effects still expire after the last drink');
  assert.equal(s.buzzRemaining, 0);
  assert.equal(s.status, 'running');
});

test('water and mocktails neither add intoxication nor instantly sober or extend buzz', () => {
  const s = running(), control = running();
  consumeIslandDrink(s, 'cocktail');
  consumeIslandDrink(control, 'cocktail');
  stepIslandSession(s, 10);
  stepIslandSession(control, 10);
  const before = s.intoxication, expiry = s.buzzRemaining;
  assert.equal(consumeIslandDrink(s, 'water').ok, true);
  assert.equal(s.intoxication, before);
  assert.equal(s.buzzRemaining, expiry);
  stepIslandSession(s, 2.5);
  stepIslandSession(control, 2.5);
  assert.equal(consumeIslandDrink(s, 'mocktail').ok, true);
  stepIslandSession(s, 10);
  stepIslandSession(control, 10);
  close(s.intoxication, control.intoxication);
  close(s.stomach, control.stomach);
  close(s.buzzRemaining, control.buzzRemaining);
  assert.equal(s.drinks, 1);
  assert.equal(s.refreshments, 2);
  assert.equal(s.score, 0);
});

test('stamp points reward eight unique experiences independently of alcohol and visit length', () => {
  const s = running();
  stepIslandSession(s, 1800);
  assert.equal(visitIslandExperience(s, 'unknown').ok, false);
  for (const id of EXPERIENCE_IDS) {
    assert.equal(visitIslandExperience(s, id).alreadyVisited, false);
    assert.equal(visitIslandExperience(s, id).alreadyVisited, true);
  }
  assert.equal(s.visits.length, 8);
  assert.equal(s.score, 800);
  consumeIslandDrink(s, 'cocktail');
  assert.equal(s.score, 800);
});

test('cooldown, invalid inputs, manual finish, and replay keep a clean state', () => {
  const s = running();
  const snapshot = structuredClone(s);
  for (const dt of [NaN, Infinity, -10, 0]) stepIslandSession(s, dt);
  assert.deepEqual(s, snapshot);
  assert.equal(consumeIslandDrink(s, 'unknown').ok, false);
  assert.equal(consumeIslandDrink(s, '__proto__').ok, false);
  consumeIslandDrink(s, 'beer');
  assert.equal(consumeIslandDrink(s, 'beer').ok, false);
  stepIslandSession(s, 2.5);
  assert.equal(consumeIslandDrink(s, 'beer').ok, true);
  finishIslandSession(s);
  assert.equal(s.intoxication, 0);
  assert.equal(s.stomach, 0);
  assert.equal(s.buzzRemaining, 0);
  assert.equal(s.nextSoberIn, 0);
  assert.deepEqual(s.activeDrinks, []);
  assert.equal(islandEffects(s).strength, 0);
  const reset = startIslandSession(createIslandSession());
  assert.deepEqual(reset, snapshot, 'a replay starts with empty effects, visits, and drinks');
});

test('goggle intensity increases smoothly with stacked intake and is zero when finished', () => {
  const s = running(), samples = [];
  for (const raw of [0, .1, .25, .5, .75, 1]) {
    s.intoxication = raw;
    samples.push(islandEffects(s));
  }
  assert.equal(samples[0].label, 'Clear');
  assert.equal(samples[3].label, 'Tipsy');
  assert.equal(samples[5].label, 'Beer goggles');
  for (const key of ['strength', 'sway', 'blur']) {
    for (let i = 1; i < samples.length; i++) assert.ok(samples[i][key] > samples[i - 1][key]);
  }
  assert.ok(samples[5].doubleVision > samples[3].doubleVision);
  finishIslandSession(s);
  assert.equal(islandEffects(s).label, 'Clear');
  assert.equal(islandEffects(s).strength, 0);
});
