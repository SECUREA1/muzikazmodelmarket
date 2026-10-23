export const RAD_TOX_SHOT_INTERVAL_MS = 100;
export const RAD_TOX_WAVE_PAUSE_MS = 1000;
export const RAD_TOX_RESULTS_PAUSE_MS = 3000;

// Keep Commons ground and tools available without ambient toxic encounters.
export const isCleanCommonsEnvironment=environment=>environment?.id==='public-commons'||environment?.id==='muzikaz-casino'||environment?.game==='casino'||environment?.builderScene?.layout==='casino'||environment?.game==='ski'||environment?.game==='construction'||!!environment?.construction||!!environment?.builderScene?.layoutMeta?.construction||environment?.landLots?.length>0||!!environment?.lot;

// Tools remain playable in transport worlds while toxic encounters stay disabled.
export const supportsWorldTools=environment=>environment?.id!=='muzikaz-casino'&&environment?.game!=='casino'&&environment?.builderScene?.layout!=='casino'&&(isCleanCommonsEnvironment(environment)||!!environment?.airport?.enabled||!!environment?.builderScene?.layoutMeta?.harbor);
