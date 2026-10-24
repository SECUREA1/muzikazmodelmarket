export const RAD_TOX_SHOT_INTERVAL_MS = 100;
export const RAD_TOX_WAVE_PAUSE_MS = 1000;
export const RAD_TOX_RESULTS_PAUSE_MS = 3000;

import {isFitnessEnvironment} from './fitness-config.js';
import {isFactoryEnvironment} from './missile-factory-config.js';

// Keep Commons ground and tools available without ambient toxic encounters.
export const isCleanCommonsEnvironment=environment=>isFactoryEnvironment(environment)||isFitnessEnvironment(environment)||environment?.id==='public-commons'||environment?.id==='muzikaz-casino'||environment?.game==='casino'||environment?.builderScene?.layout==='casino'||environment?.game==='ski'||environment?.game==='construction'||!!environment?.construction||!!environment?.builderScene?.layoutMeta?.construction||environment?.landLots?.length>0||!!environment?.lot;

// Equipping a tool does not require opting into an ambient toxic encounter.
export const supportsWorldTools=environment=>Boolean(environment)&&environment.playable!==false;
