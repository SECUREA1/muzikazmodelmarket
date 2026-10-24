/** Grounded park movement. All units are metres; camera height is eye level. */
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function createArcadeWalker({x = 0, z = 15, ground = .1, yaw = 0} = {}) {
  return {x: number(x), z: number(z, 15), ground: number(ground, .1), eyeHeight: 1.68,
    radius: .3, yaw: number(yaw), pitch: 0};
}

/** Dragging looks around without pointer lock, so keyboard and touch share controls. */
export function lookArcadeWalker(walker, dx, dy) {
  walker.yaw -= number(dx) * .004;
  walker.pitch = clamp(walker.pitch - number(dy) * .003, -.95, .95);
  return walker;
}

function blocked(x, z, radius, colliders) {
  return colliders.some(box => {
    const nearX = clamp(x, box.minX, box.maxX), nearZ = clamp(z, box.minZ, box.maxZ);
    return Math.hypot(x - nearX, z - nearZ) < radius;
  });
}

/** Relocation uses the same boundary and furniture clearance as walking,
 * without clamping a selected point to some other destination.
 */
export function relocateArcadeWalker(walker, point, {
  bounds = {minX: -26, maxX: 26, minZ: -18, maxZ: 18}, colliders = []
} = {}) {
  if (!point || ![point.x, point.y, point.z].every(Number.isFinite)) return false;
  const {x, y, z} = point, radius = walker.radius;
  if (x < bounds.minX + radius || x > bounds.maxX - radius ||
      z < bounds.minZ + radius || z > bounds.maxZ - radius || blocked(x, z, radius, colliders)) return false;
  walker.x = x; walker.z = z; walker.ground = y;
  return true;
}

/** Small swept steps prevent tunnelling through furniture on a slow device.
 * Separate axes allow the visitor to slide along a bench or table edge.
 */
export function stepArcadeWalker(walker, delta, {forward = 0, right = 0, sprint = false,
  bounds = {minX: -26, maxX: 26, minZ: -18, maxZ: 18}, colliders = []} = {}) {
  const dt = clamp(number(delta), 0, .25), length = Math.hypot(number(forward), number(right));
  if (!length || !dt) return walker;
  const f = number(forward) / Math.max(1, length), r = number(right) / Math.max(1, length);
  const distance = dt * (sprint ? 5 : 3.1), dx = (Math.sin(walker.yaw) * f + Math.cos(walker.yaw) * r) * distance;
  const dz = (-Math.cos(walker.yaw) * f + Math.sin(walker.yaw) * r) * distance;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .08));
  for (let step = 0; step < steps; step++) {
    const x = clamp(walker.x + dx / steps, bounds.minX + walker.radius, bounds.maxX - walker.radius);
    if (!blocked(x, walker.z, walker.radius, colliders)) walker.x = x;
    const z = clamp(walker.z + dz / steps, bounds.minZ + walker.radius, bounds.maxZ - walker.radius);
    if (!blocked(walker.x, z, walker.radius, colliders)) walker.z = z;
  }
  return walker;
}

export function nearestArcadeInteraction(walker, interactions, range = 4.1) {
  let nearest = null, distance = range;
  for (const interaction of interactions) {
    if (interaction.enabled === false) continue;
    const d = Math.hypot(walker.x - interaction.x, walker.z - interaction.z);
    if (d <= distance) { nearest = interaction; distance = d; }
  }
  return nearest ? {...nearest, distance} : null;
}
