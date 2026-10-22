import {AIRCRAFT_TYPES} from './aircraft-types.js';
import {RESORT_PRODUCTS,resortProductSettings} from './resort-products.js';
import {CAMP_ITEMS} from './summer-camp.js';
export const mapSourceLayout=map=>map.builderScene?.sourceLayout||map.builderScene?.layout||map.layout||(map.game==='hockey'?'hockey-arena':map.game==='arcade'?'arcade-park':map.basketball?'basketball-stadium':'grand-floor');
// Copy an authorized map into a new draft. Preserve authored IDs and references;
// never edit the source room or silently discard objects with unknown models.
export function editableMapScene(map,{id='custom-'+map.id,layout='repository-'+map.id}={}){
 const source=map.builderScene||map.placementScene||{},scene=structuredClone(source);
 return {...scene,id,name:map.name+' · Custom',layout,sourceLayout:mapSourceLayout(map),sourceEnvironmentId:map.id,sourceGame:map.game||source.sourceGame||null,sourceBasketball:map.basketball||source.sourceBasketball||false,sourceHockey:structuredClone(map.hockey||source.sourceHockey||null),sourceArcade:structuredClone(map.arcade||source.sourceArcade||null),sourceAirport:structuredClone(map.airport||source.sourceAirport||null),sourceSpawn:structuredClone(map.spawn||source.sourceSpawn||null),mapSize:Math.max(40,Math.min(2000,Number(source.mapSize)||160)),baseEnvironment:structuredClone(map),baseTransform:{},objects:structuredClone(source.objects||[]),gameplay:{...source.gameplay,...(map.hockey?{hockey:structuredClone(map.hockey)}:{}),...(map.arcade?{arcade:structuredClone(map.arcade)}:{}),multiplayer:true}};
}
export function editableMapChoices(...sources){const found=new Map();for(const source of sources){const rows=Array.isArray(source)?source:Array.isArray(source?.data)?source.data:Array.isArray(source?.environments)?source.environments:[];for(const map of rows)if(map?.id&&map.playable!==false&&map.visibility!=='private')found.set(map.id,map);}return [...found.values()];}
export function nativeItemGameplay(id){
 if(AIRCRAFT_TYPES[id]){const spec=AIRCRAFT_TYPES[id];return {type:'vehicle',category:'vehicles',behavior:'vehicle',action:'fly',vehicleSettings:{mode:'fly',seat:spec.seat,cockpit:spec.eye,speed:spec.maxSpeed,turnSpeed:1},function_data:{behavior:'vehicle',interactionDistance:5,prompt:'Enter '+spec.name}};}
 if(['harbor-yacht','harbor-skiff','harbor-sailboat'].includes(id))return {image:'/public/images/boats/'+id+'.svg',type:'vehicle',category:'vehicles',behavior:'vehicle',action:'boat',function_data:{behavior:'vehicle',interactionDistance:id==='harbor-yacht'?24:5,prompt:'Board '+(id==='harbor-yacht'?'superyacht':'boat')},vehicleSettings:{mode:'boat',speed:id==='harbor-yacht'?9:11,turnSpeed:id==='harbor-yacht'?.3:.8}};
 if(RESORT_PRODUCTS[id])return {behavior:RESORT_PRODUCTS[id].behavior,function_data:resortProductSettings(RESORT_PRODUCTS[id])};
 if(CAMP_ITEMS[id])return {...CAMP_ITEMS[id]};
 return {};
}
