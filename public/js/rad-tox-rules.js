export const RAD_TOX_SHOT_INTERVAL_MS = 100;
export const RAD_TOX_WAVE_PAUSE_MS = 1000;
export const RAD_TOX_RESULTS_PAUSE_MS = 3000;

// Keep Commons ground and tools available without ambient toxic encounters.
export const isCleanCommonsEnvironment=environment=>environment?.id==='public-commons';
