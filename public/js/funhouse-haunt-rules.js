import {funhouseAdventureAvailable} from './funhouse-adventure-rules.js';

export const FUNHOUSE_HAUNT_RULES=Object.freeze({durationMs:180000,wardPoints:35,maximumBonus:60});
export const FUNHOUSE_HAUNT_START=Object.freeze({id:'funhouse-haunt',name:'Night Watch',position:Object.freeze({x:0,y:.02,z:-15.5}),interactionDistance:5});
const ward=(id,name,x,z,hint,discovery)=>Object.freeze({id,name,position:Object.freeze({x,y:.02,z}),interactionDistance:3.2,hint,discovery});
export const FUNHOUSE_HAUNT_WARDS=Object.freeze([
 ward('nursery-lantern','Nursery Lantern',20,-16,'Enter the house and search the monster nursery on your right.','The nursery lantern is sealed. A toy whispers: “The clockwork clown has stolen the next flame.”'),
 ward('clockwork-lantern','Clockwork Lantern',6,-40,'Find the lantern beside the clockwork puppet theatre at the back of the house.','The clockwork lantern is sealed. The puppet bows toward the far mirror passage.'),
 ward('mirror-lantern','Mirror Lantern',-18,-38,'Follow the crooked mirror passages to the lantern beside the exit bell.','The mirror lantern is sealed. Your reflection points toward the portraits near the maze entrance.'),
 ward('portrait-lantern','Portrait Lantern',-20,-17,'Return through the mirror passages to the watching portraits near the maze entrance.','The portrait lantern is sealed. Four lights hold back the midnight shadows!')
]);

/** The authored lanterns exist only in the complete permanent destination. */
export const funhouseHauntAvailable=environment=>funhouseAdventureAvailable(environment);
export function funhouseHauntNextWard(haunt){
 return haunt?.status==='active'&&Number.isInteger(haunt.wardIndex)?FUNHOUSE_HAUNT_WARDS[haunt.wardIndex]||null:null;
}
export function funhouseHauntNear(position,target){
 return Boolean(position&&target&&Number.isFinite(position.x)&&Number.isFinite(position.z)&&Number.isFinite(position.y??0)&&Math.hypot(position.x-target.position.x,(position.y??0)-target.position.y,position.z-target.position.z)<=target.interactionDistance);
}
