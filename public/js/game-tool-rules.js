import { RANGED_WEAPONS } from './game-weapons.js';
import { UTILITY_TOOLS } from './game-utilities.js';
import { FISHING_GEAR } from './fishing-config.js';

export const FISHING_TOOL_IDS=Object.freeze(FISHING_GEAR.map(item=>item.id));
export const isFishingTool=id=>FISHING_TOOL_IDS.includes(id);
export const TOOL_IDS=Object.freeze([...Object.keys(RANGED_WEAPONS),...Object.keys(UTILITY_TOOLS),...FISHING_TOOL_IDS,'flamethrower','bat','taser','toxin','dynamite','spray','brick','jetpack']);
export function validTool(id){return TOOL_IDS.includes(id==='scatter-blaster'?'flamethrower':id);}
export function canActivateTool(state,rangeActive,menuOpen){return !menuOpen&&(state==='active'||rangeActive);}
