const CATEGORY_RULES = [
  ['characters', /\b(avatar|avatars|character|characters|npc|npcs)\b/],
  ['creatures', /\b(enemy|enemies|creature|creatures|pet|pets|companion|companions)\b/],
  ['vehicles', /\b(vehicle|vehicles|aircraft|car|cars|quad|hoverboard|helicopter)\b/],
  ['wearables', /\b(wearable|wearables|armor|armour|hat|hats|helmet|helmets|clothing)\b/],
  ['terrain', /\b(terrain|land|lands|world|worlds|map|maps|environment|environments)\b/],
  ['plants', /\b(plant|plants|tree|trees|foliage|flora)\b/],
  ['buildings', /\b(building|buildings|structure|structures)\b/],
  ['weapons', /\b(weapon|weapons|sword|axe|bow|staff)\b/],
  ['interactive', /\b(interactive|interactable|switch|portal|pickup)\b/],
  ['props', /\b(prop|props|object|objects|item|items)\b/]
];

const TYPE_BY_CATEGORY = {
  characters: 'avatar', creatures: 'enemy', vehicles: 'vehicle', wearables: 'wearable',
  terrain: 'terrain', plants: 'landscape', buildings: 'landscape', weapons: 'props',
  interactive: 'interactive', props: 'props'
};

const normalizedWords = value => String(value || '').toLowerCase().replace(/[_/-]+/g, ' ');

/** Normalize repository metadata into the categories exposed by the item library. */
export function categorizeAsset(raw = {}) {
  // Builder category is the most specific author-supplied value. Registry
  // category follows it, while generic type fields are only fallbacks.
  const fields = [raw.builderCategory, raw.builder_category, raw.category, raw.assetType, raw.asset_type, raw.type];
  let category = '';
  for (const field of fields) {
    const text = normalizedWords(field);
    const match = CATEGORY_RULES.find(([, rule]) => rule.test(text));
    if (match) { category = match[0]; break; }
  }
  if (!category) {
    const fallback = normalizedWords(`${raw.name || raw.title || ''} ${raw.description || ''}`);
    category = CATEGORY_RULES.find(([, rule]) => rule.test(fallback))?.[0] || 'props';
  }
  return { category, type: TYPE_BY_CATEGORY[category] || 'props' };
}
