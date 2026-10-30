import {cancelExpandedQuest} from './server-expanded-quests.mjs';
import {isAircraft} from './public/js/aircraft-flight.js';
import {cancelEmergencyDeparture} from './public/js/emergency-aircraft-departure.js';
import {isWatercraft} from './public/js/harbor-water.js';
import {isConstructionMachine} from './public/js/construction-state.js';
import {stopBoat} from './server-harbor-operations.mjs';
import {SPAWN_PROTECTION_MS} from './rpg-match.mjs';

// Explicit map travel releases the previous activity in the same transaction.
// Occupied target craft and destination collision are still checked by the caller.
export function releaseForMapTravel(sim,player,manifest,now){
 if(player.health<=0){player.health=100;player.ammo=120;player.fuel=100;player.toolReady={};player.toolUses={};player.shieldUntil=0;player.spawnProtectedUntil=now+SPAWN_PROTECTION_MS;}
 if(player.vehicleMission?.status==='active'){
  if(player.vehicleMission.questId)cancelExpandedQuest(sim,player,now);
  else{player.vehicleMission.status='cancelled';player.vehicleMission.message='Map travel ended this assignment.';}
 }
 for(const key of ['seatedId','vehicleId']){
  const actor=sim.actors[player[key]];
  if(actor?.holderId===player.actorId){
   cancelEmergencyDeparture(actor,null,{airport:sim.airport,holderId:player.actorId},{reason:'Map travel ended this departure.',now});
   actor.holderId=null;
   if(isWatercraft(actor))stopBoat(actor);
   if(actor.driving)Object.assign(actor.driving,{speed:0,throttle:0,throttleCommand:0,parked:true,brake:1});
   if(isConstructionMachine(actor)){actor.construction.axes={};actor.construction.assist=null;actor.construction.working=false;delete actor.construction.workCycle;}
   if(isAircraft(actor)){
    // Return an abandoned airborne public aircraft to its authored stand.
    const home=manifest.objects.find(object=>object.objectId===actor.id)?.transform||actor.definition?.transform||actor.mapParkingOrigin;
    const returning=actor.flight?.airborne&&home;
    if(returning){actor.position={...home.position};actor.rotation={...home.rotation};}
    actor.flight={...actor.flight,assist:null,speed:0,airspeed:0,verticalSpeed:0,pitch:0,bank:0,throttle:0,throttleCommand:0,brake:1,...(home?{airborne:false,altitude:0,phase:'parked'}:{})};
    for(const key of ['navigationDestinationId','navigationName','navigationParkingPoint','navigationLeg','remainingDistance','assistSince','assistStage','assistParkingPoint','assistTargetAltitude','clearance'])delete actor.flight[key];
    if(returning){delete actor.flight.runwayId;delete actor.flight.arrivalDestinationId;}
   }
  }
  player[key]=null;
 }
 for(const lease of [sim.airport,...Object.values(sim.airport?.runwayClearances||{})])if(lease?.runwayHolder===player.actorId){lease.runwayHolder=null;lease.expires=0;}
 player.skiLift=null;player.skiing=false;player.skiSpeed=0;player.input={};
 if(['racing','countdown'].includes(player.skiRace?.status)){player.skiRace.status='cancelled';player.skiRace.message='Map travel resets a competitive run.';}
}
