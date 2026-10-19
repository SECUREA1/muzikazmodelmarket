// The view belongs to this player, so it follows map travel without changing a room.
export const GAME_CAMERA_MODES = Object.freeze(['first-person', 'top-down', 'broadcast']);
export const GAME_CAMERA_STORAGE_KEY = 'muzikazGameCameraMode';
export const GAME_CAMERA_SCALES_KEY = 'muzikazGameCameraScales';

export function normalizeGameCameraMode(mode, fallback = 'first-person') {
  return GAME_CAMERA_MODES.includes(mode) ? mode : GAME_CAMERA_MODES.includes(fallback) ? fallback : 'first-person';
}

export function readGameCameraMode(fallback = 'first-person') {
  try { return normalizeGameCameraMode(globalThis.localStorage?.getItem(GAME_CAMERA_STORAGE_KEY), fallback); }
  catch { return normalizeGameCameraMode(fallback); }
}

export function writeGameCameraMode(mode) {
  const value = normalizeGameCameraMode(mode);
  try { globalThis.localStorage?.setItem(GAME_CAMERA_STORAGE_KEY, value); } catch { /* Storage may be unavailable in a private browser. */ }
  return value;
}

export function nextGameCameraMode(mode) {
  return normalizeGameCameraMode(mode) === 'first-person' ? 'top-down' : 'first-person';
}

export function normalizeGameCameraScale(value) {
  const number = value === '' || value == null ? 1 : Number(value);
  return Number.isFinite(number) ? Math.max(.6, Math.min(1.6, number)) : 1;
}

export function readGameCameraScales() {
  let stored;
  try { stored = JSON.parse(globalThis.localStorage?.getItem(GAME_CAMERA_SCALES_KEY) || '{}'); } catch { /* Use default zoom when storage is unavailable. */ }
  return Object.fromEntries(GAME_CAMERA_MODES.map(mode => [mode, normalizeGameCameraScale(stored?.[mode])]));
}

export function writeGameCameraScale(mode, value) {
  const scale = normalizeGameCameraScale(value);
  if (!GAME_CAMERA_MODES.includes(mode)) return scale;
  try { globalThis.localStorage?.setItem(GAME_CAMERA_SCALES_KEY, JSON.stringify({...readGameCameraScales(), [mode]: scale})); } catch { /* Zoom still works without browser storage. */ }
  return scale;
}

/** Zoom changes only the lens, without changing player position or world geometry. */
export function scaleGameCameraFov(fov, value) {
  const base = Number.isFinite(Number(fov)) ? Math.max(.5, Math.min(120, Number(fov))) : 75;
  const scale = normalizeGameCameraScale(value);
  return scale === 1 ? base : Math.max(.5, Math.min(120, 2 * Math.atan(Math.tan(base * Math.PI / 360) / scale) * 180 / Math.PI));
}

export function isGameCameraToggleKey(event) {
  if (!event || event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || String(event.key).toLowerCase() !== 'v') return false;
  const target = event.target;
  return !target?.isContentEditable && !target?.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"]');
}
