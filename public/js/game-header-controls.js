// One inventory for game navigation and secondary controls. Runtime availability
// and action handlers stay with their original components; this data never
// creates a duplicate button or makes an unavailable map action selectable.
const controls=[
 ['camera','.game-camera-toggle','Camera view','view'],
 ['broadcast','.broadcast-controls','Broadcast camera controls','view'],
 ['viewport','.game-viewport-toggle','Expand or restore game view','view'],
 ['vr','.xr-enter-button','Enter VR','view'],
 ['flashlight','.game-flashlight-toggle','Flashlight','view'],
 ['live-map','.live-local-map','Live map','navigation'],
 ['district-map','.district-map-toggle','Map, locations and land','navigation'],
 ['quest-progress','.map-quest-prompts','Quest progress and local challenges','activities'],
 ['quests','.map-quest-launcher','Quests and challenges','activities'],
 ['residents','.world-resident-ui','Residents and conversations','social'],
 ['transport','.transport-activity','Transport and mission radio','activities'],
 ['sports-utilities','.sports-action-utilities','Sports view and utilities','activities'],
 ['airport-radio','.airport-ops-toggle','Airport tower radio','flight'],
 ['harbor-radio','.harbor-ops-toggle','Harbor navigation and radio','activities'],
 ['ski','.ski-resort-toggle','Ski races and lifts','activities'],
 ['forest','.forest-toggle','Forest operations','activities'],
 ['fitness','.fitness-toggle','Fitness activities','activities'],
 ['fishing','.fishing-toggle','Fishing and tackle','activities'],
 ['shipping','.shipping-toggle','Shipping operations','activities'],
 ['factory','.factory-toggle','Factory jobs and supplies','activities'],
 ['prison','.prison-toggle','Prison activities','activities'],
 ['factory-testing','.factory-testing-toggle','Launch and proving grounds','activities'],
 ['factory-logistics','.factory-logistics-toggle','Production and freight','activities'],
 ['funhouse-audio','.funhouse-audio-toggle','Funhouse sound settings','sound'],
 ['emergency-response','.doomsday-menu','Emergency response flow','emergency'],
 ['building-adjustment','.building-adjust-button','Position, rotate and scale building items','building'],
 ['range-operations','.range-ops-button','Firing range operations','activities'],
 ['owned-item-edit','.owned-placement-edit','Move or rotate owned item','building'],
 ['shared-media-audio','.shared-media-enable','Enable shared media audio','sound'],
 ['island-passport','.island-native-status','Resort passport and drink effects','activities'],
 // This existing group retains its World, Backpack, Tools, Chat, Settings,
 // controller, Build, island, and match buttons, including later additions.
 ['dock-actions','.game-dock-actions','World, player and game actions','navigation','dock'],
 // Nested controls keep their panel-owned visibility. They are catalogued so
 // coverage checks and menu navigation can find them without extracting them.
 ['latest-radio-announcement','[data-latest-announcement]','Show the latest radio announcement','sound','nested'],
 ['automatic-event-panel','input[aria-label="Auto-show event panel"]','Auto-show new event countdowns','emergency','nested'],
 ['radio-sound-panel','.emergency-radio-toggle','Radio & sound panel','sound'],
 ['nuclear-event-panel','.emergency-nuclear-toggle','Nuclear event panel','emergency'],
 ['emergency-response-link','.game-header-emergency-link','Open emergency response flow','emergency','nested'],
 ['active-quest','.map-quest-objective','Open active quest','activities','nested'],
 ['flight-instruments','button[aria-label="Flight instruments and controls"]','Flight instruments and controls','flight','nested'],
 ['site-settings','.game-settings-shortcut','Settings and Explorer options','settings','site']
];
export const GAME_HEADER_CONTROLS=Object.freeze(controls.map(([id,selector,label,category,source='stage'])=>Object.freeze({id,selector,label,category,source})));
export const GAME_HEADER_SELECTORS=GAME_HEADER_CONTROLS.filter(control=>control.source==='stage'||control.source==='dock').map(control=>control.selector).join(',');
export function gameHeaderControlFor(element){
 return element&&typeof element.matches==='function'?GAME_HEADER_CONTROLS.find(control=>element.matches(control.selector))||null:null;
}
