export const PET_COMPANION_DEFAULTS = Object.freeze({
  minPlayerDistance: 1.25,
  preferredPlayerDistance: 1.75,
  maxPlayerDistance: 3.4,
  lookRadius: 4.25,
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
