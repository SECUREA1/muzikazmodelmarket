import {editableFactoryTestingScene} from './factory-testing-builder.js';
import {FACTORY_TESTING_ITEMS,factoryTestingItemSettings} from './factory-testing-items.js';
import {editableFunhouseScene} from './clown-funhouse-builder.js';
import {editableFactoryScene} from './missile-factory-builder.js';
import {FACTORY_ITEMS,factoryItemSettings} from './missile-factory-items.js';
import {FITNESS_ITEMS,fitnessItemSettings} from './fitness-equipment.js';
import {editableFitnessScene} from './fitness-builder.js';
import {AIRCRAFT_TYPES} from './aircraft-types.js';
import {RESORT_PRODUCTS,resortProductSettings} from './resort-products.js';
import {CAMP_ITEMS} from './summer-camp.js';
import {SHIPPING_VESSELS} from './shipping-vessel-specs.js';
import {FUNHOUSE_ITEMS,funhouseNativeItem} from './clown-funhouse-items.js';
export const mapSourceLayout=map=>map.builderScene?.sourceLayout||map.builderScene?.layout||map.layout||(map.game==='hockey'?'hockey-arena':map.game==='arcade'?'arcade-park':map.basketball?'basketball-stadium':'grand-floor');
// Copy an authorized map into a new draft. Preserve authored IDs and references;
// never edit the source room or silently discard objects with unknown models.
export function editableMapScene(map,{id='custom-'+map.id,layout='repository-'+map.id}={}){
 const source=map.builderScene||map.placementScene||{},scene=structuredClone(source);
 return editableFactoryTestingScene(editableFunhouseScene(editableFactoryScene(editableFitnessScene({...scene,id,name:map.name+' · Custom',layout,sourceLayout:mapSourceLayout(map),sourceEnvironmentId:map.id,sourceGame:map.game||source.sourceGame||null,sourceBasketball:map.basketball||source.sourceBasketball||false,sourceHockey:structuredClone(map.hockey||source.sourceHockey||null),sourceArcade:structuredClone(map.arcade||source.sourceArcade||null),sourceAirport:structuredClone(map.airport||source.sourceAirport||null),sourceConstruction:structuredClone(map.construction||source.sourceConstruction||source.layoutMeta?.construction||null),sourceFitness:structuredClone(map.fitness||source.sourceFitness||source.layoutMeta?.fitness||null),sourceFactory:structuredClone(map.factory||source.sourceFactory||source.layoutMeta?.factory||null),sourceFactoryTesting:structuredClone(map.factoryTesting||source.sourceFactoryTesting||source.layoutMeta?.factoryTesting||null),sourceSpawn:structuredClone(map.spawn||source.sourceSpawn||null),mapSize:Math.max(40,Math.min(2000,Number(source.mapSize)||160)),baseEnvironment:structuredClone(map),baseTransform:{},objects:structuredClone(source.objects||[]),gameplay:{...source.gameplay,...(map.hockey?{hockey:structuredClone(map.hockey)}:{}),...(map.arcade?{arcade:structuredClone(map.arcade)}:{}),multiplayer:true}}))));
}
export function editableMapChoices(...sources){const found=new Map();for(const source of sources){const rows=Array.isArray(source)?source:Array.isArray(source?.data)?source.data:Array.isArray(source?.environments)?source.environments:[];for(const map of rows)if(map?.id&&map.playable!==false&&map.visibility!=='private')found.set(map.id,map);}return [...found.values()];}
export function nativeItemGameplay(id){
 if(FACTORY_TESTING_ITEMS[id]){const item=FACTORY_TESTING_ITEMS[id];return {type:'props',category:'factory-testing',image:item.thumbnailUrl,behavior:factoryTestingItemSettings(id).behavior,priceMzk:item.priceMzk,function_data:factoryTestingItemSettings(id)};}
 if(FUNHOUSE_ITEMS[id])return funhouseNativeItem(id);
 if(SHIPPING_VESSELS[id]){const spec=SHIPPING_VESSELS[id];return {image:'/public/images/shipping/'+id+'.svg',type:'vehicle',category:'vehicles',behavior:'vehicle',action:'boat',vehicleSettings:{mode:'boat',seat:[...spec.seat],speed:spec.speed,turnSpeed:spec.turnRate},function_data:{behavior:'vehicle',health:900,destructible:true,interactionDistance:16,prompt:'Board '+spec.name}};}
 if(FACTORY_ITEMS[id]){const item=FACTORY_ITEMS[id];return {type:'props',category:'factory',image:item.thumbnailUrl,behavior:item.kind?'interact':'decor',priceMzk:item.priceMzk,function_data:factoryItemSettings(id)};}
 if(FITNESS_ITEMS[id]){const item=FITNESS_ITEMS[id];return {type:'props',category:'fitness',image:item.thumbnailUrl,behavior:item.kind?'interact':'decor',priceMzk:item.priceMzk,function_data:{...fitnessItemSettings(id),active:true,damage:0}};}

 if(AIRCRAFT_TYPES[id]){const spec=AIRCRAFT_TYPES[id];return {type:'vehicle',category:'vehicles',behavior:'vehicle',action:'fly',vehicleSettings:{mode:'fly',seat:spec.seat,cockpit:spec.eye,speed:spec.maxSpeed,turnSpeed:1},function_data:{behavior:'vehicle',interactionDistance:5,prompt:'Enter '+spec.name}};}
 if(['harbor-yacht','harbor-skiff','harbor-sailboat','harbor-patrol','harbor-fishing-boat'].includes(id))return {image:'/public/images/boats/'+id+'.svg',type:'vehicle',category:'vehicles',behavior:'vehicle',action:'boat',function_data:{behavior:'vehicle',...(id==='harbor-patrol'?{health:650,destructible:true}:id==='harbor-fishing-boat'?{health:300,destructible:true}:{}),interactionDistance:id==='harbor-yacht'?24:5,prompt:'Board '+(id==='harbor-yacht'?'superyacht':id==='harbor-fishing-boat'?'fishing boat':'boat')},vehicleSettings:{mode:'boat',speed:id==='harbor-yacht'?9:id==='harbor-patrol'?12:id==='harbor-fishing-boat'?8:11,turnSpeed:id==='harbor-yacht'?.3:.8}};
 if(RESORT_PRODUCTS[id])return {behavior:RESORT_PRODUCTS[id].behavior,function_data:resortProductSettings(RESORT_PRODUCTS[id])};
 if(CAMP_ITEMS[id])return {...CAMP_ITEMS[id]};
 return {};
}
