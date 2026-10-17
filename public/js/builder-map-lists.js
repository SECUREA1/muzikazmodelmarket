// Inlays are regular, playable scene objects. The main world remains a separate
// environment, so changing a room/module never replaces its surrounding map.
import {isLayoutSceneObject} from './builder-layout-scenes.js';
export const INLAY_MAPS=Object.freeze([
 {id:'grand-floor',name:'Foundation tile',group:'Floors & rooms',size:'8 × 8 m'},
 {id:'open-studio',name:'Open studio',group:'Floors & rooms',size:'6 × 5 m'},
 {id:'connected-suite',name:'Connected suite',group:'Floors & rooms',size:'6 × 5 m'},
 {id:'garden-courtyard',name:'Garden courtyard',group:'Floors & rooms',size:'6 × 5 m'},
 {id:'estate-house',name:'Estate house',group:'House & yard compounds',size:'20 × 16 m'},
 {id:'estate-yard',name:'Estate yard',group:'House & yard compounds',size:'24 × 22 m'},
 {id:'drive-in-garage',name:'Drive-in garage',group:'House & yard compounds',size:'14 × 12 m'},
 {id:'open-office',name:'Open office',group:'House & yard compounds',size:'20 × 16 m'}
].map(Object.freeze));
const compact=new Set(INLAY_MAPS.filter(item=>item.group==='Floors & rooms').map(item=>item.id));
export function inlayMapId(object={}){return object.asset?.buildAssetId||object.modelId||'';}
export function isInlayMapObject(object={}){return INLAY_MAPS.some(item=>item.id===inlayMapId(object))&&(object.builderLayer==='inlay'||compact.has(inlayMapId(object)));}
export function retainedInlayMaps(scene={}){return structuredClone((scene.objects||[]).filter(object=>isInlayMapObject(object)||isLayoutSceneObject(object)));}
