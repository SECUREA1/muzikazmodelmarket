export const PET_COMPANION_DEFAULTS = Object.freeze({
  // A normalized avatar is about two world units tall. Keep companions at
  // least three body lengths away and let them roam near six on average.
  minPlayerDistance: 6,
  preferredPlayerDistance: 9,
  maxPlayerDistance: 12,
  lookRadius: 14,
});

export function randomCompanionOffset(random = Math.random, settings = PET_COMPANION_DEFAULTS) {
  const angle = random() * Math.PI * 2;
  const distance = settings.minPlayerDistance
    + random() * (settings.maxPlayerDistance - settings.minPlayerDistance);
  return { x: Math.sin(angle) * distance, z: Math.cos(angle) * distance, distance };
}

export function companionDistanceState(distance, settings = PET_COMPANION_DEFAULTS) {
  if (distance < settings.minPlayerDistance) return 'too-close';
  if (distance > settings.maxPlayerDistance) return 'too-far';
  return 'comfortable';
}

export function nearestCompanionInterest(origin, candidates, radius = PET_COMPANION_DEFAULTS.lookRadius) {
  let nearest = null;
  let nearestDistanceSquared = radius * radius;
  for (const candidate of candidates) {
    if (!candidate || candidate === origin || candidate.visible === false) continue;
    const dx = Number(candidate.position?.x) - Number(origin.position?.x);
    const dz = Number(candidate.position?.z) - Number(origin.position?.z);
    const distanceSquared = dx * dx + dz * dz;
    if (Number.isFinite(distanceSquared) && distanceSquared < nearestDistanceSquared) {
      nearest = candidate;
      nearestDistanceSquared = distanceSquared;
    }
  }
  return nearest;
}
