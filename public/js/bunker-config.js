export const BUNKER_ID='underground-bunker';
export const BUNKER_LAYOUT='underground-bunker';
export const BUNKER_FLOOR_Y=-12;
export const BUNKER_BOUNDS=Object.freeze({width:56,depth:64,height:4,mapSize:160,floorY:BUNKER_FLOOR_Y,surfaceY:0});
export const BUNKER_SURFACE_ENTRY=Object.freeze({x:0,y:.02,z:70});
const point=(x,z)=>({x,y:BUNKER_FLOOR_Y+.02,z});
export function isBunkerEnvironment(environment){return Boolean(environment&&(environment.id===BUNKER_ID||environment.game==='bunker'||[environment.builderScene?.sourceLayout,environment.builderScene?.layout,environment.layout].includes(BUNKER_LAYOUT)));}

// Positions describe clear operator approaches, rather than the solid console
// or machine footprints. Both maps and the shared quest system use them.
export const BUNKER_LOCATIONS=Object.freeze([
 {id:'bunker-surface-arrival',name:'00 · Surface warning station',...BUNKER_SURFACE_ENTRY,width:16,depth:16,description:'Exposed surface arrival. Follow the enclosed descent to the underground blast shutter when the alarms sound.'},
 {id:'bunker-descent',name:'Protected access descent',x:0,y:-5.98,z:48,width:6,depth:32,description:'A continuously walkable access tunnel drops twelve metres from the surface to the bunker airlock.'},
 {id:'bunker-arrival',name:'01 · Underground airlock & decontamination',...point(0,27),width:7,depth:8,description:'Twelve metres below ground. Close the perimeter blast shutter, read the alert console and meet the response crew.'},
 {id:'bunker-workshop',name:'02 · Fabrication & salvage workshop',...point(-16,26),width:20,depth:16,description:'Inspect the fabrication workbench, salvage cache and machine tools. The factory gateway connects to the existing World Item Factory.'},
 {id:'bunker-infirmary',name:'03 · Infirmary & crew quarters',...point(16,26),width:20,depth:16,description:'Recover at the med station, meet Dr. Patch, and explore the crew bunks and survival stores.'},
 {id:'bunker-habitat',name:'04 · Hydroponics & life support',...point(-16,4),width:20,depth:16,description:'A maintained underground habitat with grow beds, ventilation and reserve supplies.'},
 {id:'bunker-operations',name:'05 · Hacker operations',...point(16,4),width:20,depth:16,description:'Meet Nyx and read the local operations terminal.'},
 {id:'bunker-power',name:'06 · Power & signal engineering',...point(-16,-18),width:20,depth:16,description:'Toggle the contained power core and signal relay, following Rook’s recovery operation.'},
 {id:'bunker-archive',name:'07 · Server archive vault',...point(16,-18),width:20,depth:16,description:'Walk the rack aisles and inspect the archive terminal with Echo. Ordered quest checkpoints record your progress.'},
 {id:'bunker-extraction',name:'08 · Extraction & uplink',...point(0,-25),width:7,depth:8,description:'Confirm the evacuation manifest at the extraction terminal. The Commons return gateway remains available.'}
]);

export const BUNKER_CREW=Object.freeze([
 {id:'bunker-nyx',modelId:'bunker-hacker',name:'Nyx Vale',role:'Operations coordinator',home:point(12,4),color:'#62edcc',skin:'#b98264',heading:Math.PI/2,task:'reviewing local system reports and coordinating bunker operations',greeting:'Welcome to Null Sector. Open Quests for power recovery, archive integrity or crew evacuation. You can take the operations in any order.'},
 {id:'bunker-rook',modelId:'bunker-engineer',name:'Rook Mercer',role:'Power & fabrication engineer',home:point(-12,-18),color:'#eab55e',skin:'#80543d',heading:-Math.PI/2,task:'checking the power core, relay and workshop readiness',greeting:'The core and relay have working switches. Read the operations briefing, inspect each system and follow the active quest markers. The workshop connects to World Item Factory.'},
 {id:'bunker-patch',modelId:'bunker-engineer',name:'Dr. Patch Okafor',role:'Medic & habitat keeper',home:point(12,26),color:'#e18db6',skin:'#76503d',heading:Math.PI/2,task:'checking medical supplies, crew rest and habitat systems',greeting:'Recover at the med station before the evacuation drill. The bunks, grow beds and supply stores keep this place alive. I also have the usual local favors.'},
 {id:'bunker-echo',modelId:'bunker-hacker',name:'Echo Sato',role:'Archive custodian',home:point(12,-18),color:'#9ea2fb',skin:'#d8b08e',heading:Math.PI/2,task:'checking the archive and preserving the crew’s records',greeting:'Our archive integrity operation checks the fabrication bench and server archive. Use each marked console in order; reading a remote marker does not complete it.'}
]);
