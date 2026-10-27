/** Authored resort coordinates shared by scenery, collision, actors and quests.
 * Renderer-free: native clients and the authoritative room import this file.
 */
export const TROPICAL_ISLAND_ID='tropical-island';
export const ISLAND_ID=TROPICAL_ISLAND_ID;
export const isTropicalIslandEnvironment=(environment={})=>Boolean(environment&&(environment.id===TROPICAL_ISLAND_ID||environment.mapId===TROPICAL_ISLAND_ID||environment.game==='tropical-island'||(environment.builderScene?.sourceLayout||environment.builderScene?.layout||environment.layout)==='tropical-island'));
export const ISLAND_SPAWN=Object.freeze({x:0,y:.38,z:24,rotationY:0});
const experience=(id,type,x,z,radius,label,description)=>Object.freeze({id,type,x,y:.36,z,radius,label,name:label,position:Object.freeze({x,y:.36,z}),description});
export const ISLAND_EXPERIENCES=Object.freeze([
 experience('tiki-bar','bar',-15,9,4.3,'Tiki Tide Bar','Meet the beach host and choose an optional island beer, cocktail or alcohol-free refreshment. Each alcoholic drink wears off independently after two minutes.'),
 experience('sunset-bar','bar',23,-8,4.3,'Sunset Sips','A beach bar with ocean views, friendly resort hosts and optional refreshments.'),
 experience('cabanas','relax',-25,7,4.5,'Cabana Cove','Relax in a shaded beach cabana beside the palm-lined resort paths.'),
 experience('beach-ball','ball',9,21,4,'Beach Ball Rally','Meet other visitors and kick the colorful beach balls across the sand.'),
 experience('paddle-boat','boat',43,10,4.5,'Paddle Pier','Board a small paddle boat at the pier and explore the lagoon with the shared helm controls.'),
 experience('pontoon','boat',43,20,4.5,'Pontoon Club','Board a pontoon for a coastal cruise, take the helm or use the shared boat navigation controls.'),
 experience('snorkel','snorkel',-22,-23,4,'Reef Explorer','Visit the snorkeling stand and discover the nearby coral garden.'),
 experience('lookout','lookout',1,-25,4,'Horizon Point','Take in the island panorama from the northern lookout deck.')
]);
export const ISLAND_ACTIVITIES=ISLAND_EXPERIENCES;
export const ISLAND_DOCKS=Object.freeze([
 Object.freeze({minX:34.5,maxX:46.5,minZ:8.3,maxZ:11.7,height:.77}),
 Object.freeze({minX:35.5,maxX:46.5,minZ:18.3,maxZ:21.7,height:.77})
]);
export const ISLAND_SOLIDS=Object.freeze([
 Object.freeze({id:'tiki-counter',minX:-18.9,maxX:-11.1,minZ:4.1,maxZ:5.7,minY:.36,maxY:2.2}),
 Object.freeze({id:'sunset-counter',minX:19.1,maxX:26.9,minZ:-13.4,maxZ:-11.8,minY:.36,maxY:2.2}),
 Object.freeze({id:'coral-cove-lodge',minX:-6.5,maxX:6.5,minZ:-11.5,maxZ:-5.5,minY:.36,maxY:4}),
 ...Array.from({length:3},(_,index)=>Object.freeze({id:'garden-bungalow-'+index,minX:-13.6+index*11,maxX:-8.4+index*11,minZ:-20.4,maxZ:-16.2,minY:.36,maxY:3}))
]);
export const ISLAND_BALLS=Object.freeze([
 Object.freeze({id:'island-beach-ball-1',x:9,z:21,radius:.5}),
 Object.freeze({id:'island-beach-ball-2',x:16,z:14,radius:.37}),
 Object.freeze({id:'island-beach-ball-3',x:-21,z:19,radius:.4})
]);
export function islandShoreRadius(angle){return 1+.045*Math.sin(angle*5+.4)+.035*Math.cos(angle*3-.8);}
export function isIslandLand(x,z){return Number.isFinite(x)&&Number.isFinite(z)&&Math.hypot(x/45,z/34)<=islandShoreRadius(Math.atan2(z/34,x/45));}
export function islandDockAt(x,z){return ISLAND_DOCKS.find(dock=>x>=dock.minX&&x<=dock.maxX&&z>=dock.minZ&&z<=dock.maxZ)||null;}
export function isIslandWalkable(x,z){return isIslandLand(x,z)||!!islandDockAt(x,z);}
export function islandGroundHeight(x,z){return islandDockAt(x,z)?.height??.36;}
