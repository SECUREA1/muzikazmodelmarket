import {readPrisonActionPacket} from './public/js/prison-protocol.js';
import {PRISON_CELLS,isPrisonEnvironment} from './public/js/prison-config.js';
import {prisonInitialState,prisonAction,stepPrisonSimulation,prisonView} from './public/js/prison-game.js';

const fail=(message,statusCode=409)=>{throw Object.assign(Error(message),{statusCode});};

/** Door actors reference the matching authored bars. Native collision ignores
 * their triangles only when the server marks the actor open. They do not add
 * independently placed models or trust client-supplied door transforms. */
export function syncPrisonDoors(sim,now=0){
 for(const cell of PRISON_CELLS){
  const id='prison-door-'+cell.id;
  sim.actors[id]={id,prisonDoor:true,prisonCellId:cell.id,active:true,open:sim.prison?.cells?.[cell.id]?.locked!==true,position:{...cell.doorPosition},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1}};
 }
 sim.actors['prison-gate-service']={id:'prison-gate-service',prisonDoor:true,active:true,open:Boolean(sim.prison?.gateOpen&&sim.prison?.gateOpenUntil>now),position:{x:0,y:3.5,z:109},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1}};
}

export function ensurePrison(sim,environment,now){
 if(!isPrisonEnvironment(environment))return null;
 sim.prison ||= prisonInitialState(now);
 sim.prisonLastAt ??= now;
 sim.actors ||= {};
 sim.radTox=null;sim.match=null;sim.projectiles={};
 for(const [id,actor] of Object.entries(sim.actors))if(actor.radTox||actor.loot||actor.runtimeMachine||actor.roadFleet||actor.trafficAI||actor.resident||actor.residentFurnishing){delete sim.actors[id];if(sim.devices)delete sim.devices[id];}
 for(const player of Object.values(sim.players||{})){player.radToxEnabled=false;player.radToxReady=true;}
 syncPrisonDoors(sim,now);
 return sim.prison;
}

function relocate(player,position){
 if(!player||!position||!['x','y','z'].every(axis=>Number.isFinite(position[axis])))return;
 player.position={...position};player.floor=position.y;player.velocityY=0;player.grounded=true;player.input={};
 player.heldId=null;player.seatedId=null;player.vehicleId=null;
 player.movementRevision=(player.movementRevision||0)+1;
}

export function stepPrison(sim,environment,now,{collision,objects={}}={}){
 const state=ensurePrison(sim,environment,now);if(!state)return;
 const players=Object.fromEntries(Object.entries(sim.players||{}).filter(([,player])=>!player.replacedByRoom&&now-player.lastSeen<15000));
 const dt=Math.max(0,Math.min(1,(now-sim.prisonLastAt)/1000));sim.prisonLastAt=now;
 if(Object.keys(players).length){
  const moves=stepPrisonSimulation(state,dt,{now,players,...(collision?{resolveMovement:(from,next)=>{const resolved=collision.resolve(environment,from,next,sim.actors,objects);return {x:resolved.x,y:resolved.floorY??resolved.y,z:resolved.z};},visible:(from,to)=>{const x=to.x-from.x,z=to.z-from.z,span=Math.hypot(x,z);return span<.05||!collision.blocksShot(environment,{x:from.x,y:(from.y||0)+1.2,z:from.z},[x/span,0,z/span],span,sim.actors);}}:{})})||[];
  for(const move of moves)relocate(sim.players[move.playerId],move.position);
 }
 syncPrisonDoors(sim,now);
}

export function prisonCommand(sim,player,environment,command,now,options={}){
 if(!isPrisonEnvironment(environment))fail('Visit Ironwood Prison to play the prison challenges.');
 if(command.action!=='prison-action')fail('Choose a supported prison activity.',422);
 if(!Number.isFinite(now))fail('The prison clock is unavailable.');
 if(player.health<=0||player.vehicleId||player.seatedId||player.grounded===false)fail('Stand on the prison floor before using an activity.');
 stepPrison(sim,environment,now,options);
 const playerId=player.actorId;
 if(!playerId)fail('Join the prison before acting.');
 // Only the operation, canonical station and mini-game input cross the trust
 // boundary. Position, inventory, tokens, clocks and outcomes stay server-owned.
 const fields=readPrisonActionPacket(command);
 const result=prisonAction(sim.prison,'prison-action',fields,{playerId,position:player.position,now});
 if(!result?.ok)fail(result?.message||'That prison activity is unavailable.');
 if(result.relocate)relocate(player,result.relocate);
 syncPrisonDoors(sim,now);
 return {message:result.message,prison:prisonView(sim.prison,playerId)};
}

export function prisonSnapshot(sim){return sim?.prison?prisonView(sim.prison):null;}
