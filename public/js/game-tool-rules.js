import { RANGED_WEAPONS } from './game-weapons.js';
import { UTILITY_TOOLS } from './game-utilities.js';

export const TOOL_IDS=Object.freeze([...Object.keys(RANGED_WEAPONS),...Object.keys(UTILITY_TOOLS),'flamethrower','bat','taser','toxin','dynamite','spray','brick','jetpack']);
export function validTool(id){return TOOL_IDS.includes(id==='scatter-blaster'?'flamethrower':id);}
export function canActivateTool(state,rangeActive,menuOpen){return !menuOpen&&(state==='active'||rangeActive);}
