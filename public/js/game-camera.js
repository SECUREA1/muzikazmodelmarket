// The view belongs to this player, so it follows map travel without changing a room.
export const GAME_CAMERA_MODES = Object.freeze(['first-person', 'top-down', 'broadcast']);
export const GAME_CAMERA_STORAGE_KEY = 'muzikazGameCameraMode';

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
  return GAME_CAMERA_MODES[(GAME_CAMERA_MODES.indexOf(normalizeGameCameraMode(mode)) + 1) % GAME_CAMERA_MODES.length];
}

export function isGameCameraToggleKey(event) {
  if (!event || event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || String(event.key).toLowerCase() !== 'v') return false;
  const target = event.target;
  return !target?.isContentEditable && !target?.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"]');
}
