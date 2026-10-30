import {DOOMSDAY_AIRCRAFT_IDS} from './doomsday-config.js';
import {aircraftType} from './aircraft-types.js';

const emergency=actor=>actor&&DOOMSDAY_AIRCRAFT_IDS.some(id=>id===actor.modelId||id===actor.asset?.buildAssetId)&&!actor.trafficAI;
const alive=actor=>actor?.active!==false&&Number(actor?.health??100)>0;
const point=value=>value&&['x','y','z'].every(axis=>Number.isFinite(value[axis]));
const airborne=actor=>actor.flight?.airborne===true;
const activePhases=new Set(['warning','detonation','fallout','recovery']);
const initial=eventId=>({eventId,stage:'board',status:'available',vehicleId:null,boardedAt:null,departedAt:null,completedAt:null});
// Optional personal onboarding: this never changes the shared response quests,
// moves a player, boards a craft, starts an engine or acquires a runway lease.
export function stepEmergencyEvacuations(sim,environment,now){
 const event=sim.doomsday;if(!event?.id)return;
 const running=activePhases.has(event.phase),aircraft=Object.values(sim.actors||{}).filter(actor=>emergency(actor)&&alive(actor));
 for(const [id,player]of Object.entries(sim.players||{})){
  if(player.basketballAI||player.replacedByRoom||player.health<=0||now-player.lastSeen>15000)continue;
  let progress=player.emergencyEvacuation;
  if(!running){if(progress?.eventId===event.id&&progress.status!=='complete')progress.status='ended';continue;}
  if(!aircraft.length)continue;
  if(progress?.eventId!==event.id)progress=player.emergencyEvacuation=initial(event.id);
  if(progress.status==='complete')continue;
  const own=sim.actors[player.vehicleId],valid=emergency(own)&&alive(own)&&own.holderId===(player.actorId||id)&&point(own.position);
  if(!valid){if(progress.stage!=='board')player.emergencyEvacuation=initial(event.id);continue;}
  // Boarding an already airborne craft cannot satisfy a ground-to-air flight.
  if(progress.vehicleId!==own.id){
   if(airborne(own)||Number(own.flight?.altitude)>1)continue;
   progress=player.emergencyEvacuation={...initial(event.id),stage:'preflight',status:'active',vehicleId:own.id,boardedAt:now};
  }
  const flight=own.flight||{};
  progress.stage=airborne(own)||flight.assist==='emergency-departure'&&flight.assistStage!=='preflight'?'depart':'preflight';
  progress.mode=flight.assist==='emergency-departure'?'assisted':'manual';
  if(airborne(own))progress.departedAt??=now;
  const ground=own.position.y-Math.max(0,Number(flight.altitude)||0),target=Math.min(24,Math.max(.2,(Number(environment.airport?.ceiling)||80)-ground-2));
  const safe=airborne(own)&&Number(flight.altitude)>=target-.35&&!flight.stall&&Number(flight.airspeed??flight.speed)>=(Number(flight.stallSpeed)||6)+2;
  if(safe){progress.stage='complete';progress.status='complete';progress.completedAt=now;}
 }
}
export function emergencyEvacuationView(snapshot,selfId,environment){
 if(!snapshot||!selfId)return null;
 const player=snapshot.players?.[selfId];if(!player)return null;
 const aircraft=Object.values(snapshot.actors||{}).filter(actor=>emergency(actor)&&alive(actor)).map(actor=>({id:actor.id,name:aircraftType(actor)?.name||'Emergency aircraft',own:actor.holderId===selfId,available:!actor.holderId||actor.holderId===selfId}));
 return {progress:player.emergencyEvacuation||null,aircraft,canAssist:!!environment?.airport?.enabled};
}
