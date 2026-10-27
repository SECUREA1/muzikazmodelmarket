/** Accelerated, fictional arcade effects. These values are not blood alcohol levels. */
export const ISLAND_BUZZ_SECONDS = 120;
export const ISLAND_MAX_ACTIVE_DRINKS = 6;
export const EXPERIENCE_IDS = Object.freeze([
  'tiki-bar', 'sunset-bar', 'cabanas', 'beach-ball',
  'paddle-boat', 'pontoon', 'snorkel', 'lookout'
]);

const ABSORPTION_SECONDS = 10;
const DRINK_COOLDOWN = 2.5;
const DRINKS = Object.freeze({beer: .33, cocktail: .5, water: 0, mocktail: 0});
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smooth = value => {const t = clamp(value, 0, 1); return t * t * (3 - 2 * t);};

export function createIslandSession(now = 0) {
  return {
    status: 'ready', duration: null, elapsed: 0, remaining: null,
    startedAt: null, createdAt: now, activeDrinks: [], buzzRemaining: 0,
    nextSoberIn: 0, nextExpiryIn: 0, stomach: 0, intoxication: 0,
    alcohol: 0, drinks: 0, refreshments: 0, cooldown: 0, visits: [], score: 0
  };
}

export function startIslandSession(session, now = 0) {
  if (session.status !== 'ready') return session;
  session.status = 'running';
  session.startedAt = Number.isFinite(now) ? now : 0;
  return session;
}

/** Each drink owns its own 120-second clock. It absorbs smoothly over ten
 * seconds, then fades smoothly until its exact expiry. A new drink does not
 * extend an older drink's life. Sampling the profiles at elapsed time makes
 * absorption, stacking and expiry independent of the browser's frame rate.
 */
function digest(session) {
  let stomach = 0, intensity = 0, latestExpiry = 0, earliestExpiry = Infinity;
  session.activeDrinks = session.activeDrinks.filter(drink => {
    drink.age = Math.max(0, session.elapsed - drink.consumedAt);
    drink.remaining = Math.max(0, ISLAND_BUZZ_SECONDS - drink.age);
    if (drink.remaining <= 1e-8) return false;
    const absorbed = smooth(drink.age / ABSORPTION_SECONDS);
    const fade = 1 - smooth((drink.age - ABSORPTION_SECONDS) / (ISLAND_BUZZ_SECONDS - ABSORPTION_SECONDS));
    drink.stomach = drink.dose * (1 - absorbed);
    drink.effect = drink.dose * absorbed * fade;
    stomach += drink.stomach;
    intensity += drink.effect;
    latestExpiry = Math.max(latestExpiry, drink.remaining);
    earliestExpiry = Math.min(earliestExpiry, drink.remaining);
    return true;
  });
  session.stomach = stomach;
  session.intoxication = clamp(intensity, 0, 1);
  session.buzzRemaining = latestExpiry;
  session.nextSoberIn = latestExpiry;
  session.nextExpiryIn = Number.isFinite(earliestExpiry) ? earliestExpiry : 0;
}

export function finishIslandSession(session) {
  if (session.status !== 'running') return session;
  session.status = 'finished';
  session.activeDrinks = [];
  session.buzzRemaining = session.nextSoberIn = session.nextExpiryIn = 0;
  session.stomach = session.intoxication = session.cooldown = 0;
  return session;
}

export function stepIslandSession(session, dt) {
  if (session.status !== 'running' || !Number.isFinite(dt) || dt <= 0) return session;
  session.elapsed += dt;
  session.cooldown = Math.max(0, session.cooldown - dt);
  digest(session);
  return session;
}

export function consumeIslandDrink(session, kind) {
  if (session.status !== 'running') return {ok: false, reason: 'Your island visit is not running.'};
  if (!Object.hasOwn(DRINKS, kind)) return {ok: false, reason: 'Choose an available drink.'};
  if (session.cooldown > 1e-9) return {ok: false, reason: 'Enjoy your current drink first.'};
  const dose = DRINKS[kind];
  if (dose > 0 && session.activeDrinks.length >= ISLAND_MAX_ACTIVE_DRINKS) return {ok: false, reason: 'Take a break while an earlier drink wears off.'};
  session.alcohol += dose;
  session.cooldown = DRINK_COOLDOWN;
  if (dose > 0) {
    session.drinks++;
    session.activeDrinks.push({
      id: session.drinks, kind, dose, consumedAt: session.elapsed,
      age: 0, remaining: ISLAND_BUZZ_SECONDS, stomach: dose, effect: 0
    });
    digest(session);
  } else session.refreshments++;
  return {ok: true, kind, dose};
}

export function visitIslandExperience(session, id) {
  if (session.status !== 'running') return {ok: false, reason: 'Your island visit is not running.', score: session.score};
  if (!EXPERIENCE_IDS.includes(id)) return {ok: false, reason: 'Unknown island experience.', score: session.score};
  if (session.visits.includes(id)) return {ok: true, alreadyVisited: true, score: session.score};
  session.visits.push(id);
  session.score += 100;
  return {ok: true, alreadyVisited: false, score: session.score};
}

export function islandEffects(session) {
  const rawStrength = session.status === 'running' ? clamp(Number(session.intoxication) || 0, 0, 1) : 0;
  const strength = smooth(rawStrength);
  return {
    rawStrength, strength,
    sway: strength * strength * .045,
    blur: strength * 2.2,
    doubleVision: Math.max(0, (strength - .22) / .78),
    label: strength < .08 ? 'Clear' : strength < .32 ? 'Light buzz' : strength < .65 ? 'Tipsy' : 'Beer goggles'
  };
}
