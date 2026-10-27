// Browser caches are optional display/game preferences, never ownership records.
// A stale, truncated, or wrongly shaped value must not prevent the engine loading.
function readStoredValue(key) {
  try {
    return JSON.parse(globalThis.localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

export function readStoredGameArray(key) {
  const value = readStoredValue(key);
  return Array.isArray(value) ? value : [];
}

export function readStoredGameObject(key, fallback = {}) {
  const value = readStoredValue(key);
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}
