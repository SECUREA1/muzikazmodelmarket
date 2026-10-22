import * as THREE from './public/vendor/three/three.module.min.js';
import {createYachtBilliards,shootYachtBilliards,stepYachtBilliards,YACHT_TABLE} from './public/js/yacht-billiards.js';
import {hasWalkableInterior} from './public/js/harbor-water.js';
const fail=message=>{throw Object.assign(Error(message),{statusCode:409});};
export function yachtTableWorldPoint(boat){
 return new THREE.Vector3(YACHT_TABLE.x,YACHT_TABLE.y,YACHT_TABLE.z).multiply(new THREE.Vector3(boat.scale?.x||1,boat.scale?.y||1,boat.scale?.z||1)).applyEuler(new THREE.Euler(boat.rotation?.x||0,boat.rotation?.y||0,boat.rotation?.z||0,'YXZ')).add(new THREE.Vector3(boat.position.x,boat.position.y,boat.position.z));
}
export function yachtGameCommand(sim,player,command){
 const boat=sim.actors[command.entityId];if(!hasWalkableInterior(boat)||boat.active===false)fail('This yacht is unavailable.');
 const table=yachtTableWorldPoint(boat);
 if(player.vehicleId||Math.hypot(player.position.x-table.x,player.position.y-table.y,player.position.z-table.z)>4||player.position.y<boat.position.y+1.8)fail('Walk to the billiards table inside the yacht.');
 if(Math.abs(boat.boating?.speed||0)>.1)fail('Anchor the yacht before playing billiards.');
 const state=boat.yachtBilliards ||=createYachtBilliards();if(command.revision!==state.revision)fail('The table changed. Try again with the current table.');
 if(state.moving)fail('Wait for the balls to stop.');
 if(command.operation==='rack')boat.yachtBilliards=createYachtBilliards(state.revision+1);
 else if(command.operation==='shoot'){try{shootYachtBilliards(state,command.angle,command.power);}catch(error){fail(error.message);}}
 else fail('Choose a shot or rack a new game.');
 return {message:command.operation==='rack'?'Billiards table racked.':'Shot taken — watch the table.'};
}
export function stepYachtGames(actors,dt){for(const boat of Object.values(actors))if(hasWalkableInterior(boat)&&boat.active!==false)stepYachtBilliards(boat.yachtBilliards,dt);}
