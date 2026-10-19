// Keep the main game destinations together on the first six-sector map pie.
// The remaining public and player-created worlds still follow live activity.
export const PRIORITY_WORLD_IDS = Object.freeze([
  'muzikaz-full-house',
  'basketball-arena',
  'hockey-arena',
  'firing-range',
  'force-training-range',
  'neon-junction'
]);

const priority = new Map(PRIORITY_WORLD_IDS.map((id, index) => [id, index]));
const rank = world => priority.get(world.env.id) ?? PRIORITY_WORLD_IDS.length;
const players = world => Math.max(0, Number(world.count) || 0);

export function sortWorlds(worlds) {
  return [...worlds].sort((a, b) => rank(a) - rank(b)
    || players(b) - players(a)
    || Number(b.env.permanent === true) - Number(a.env.permanent === true));
}
