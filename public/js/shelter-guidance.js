import {isDoomsdayObjectiveNearby} from './doomsday-rules.js';
// Personal presence is independent of the room's first completed check-in.
export function shelterGuidance(state,position){
 const shelter=state?.objectives?.find(site=>site.id==='shelter');
 if(!state?.active||!shelter||!position||!['x','y','z'].every(axis=>Number.isFinite(position[axis])))return {visible:false};
 const inside=isDoomsdayObjectiveNearby(position,shelter),distance=Math.round(Math.hypot(position.x-shelter.position.x,position.z-shelter.position.z));
 const instructions={warning:'Enter the lit shelter entrance and stay under cover. Cole will confirm your arrival.',detonation:'Stay under cover while the distant blasts pass. Keep the radio on.',fallout:'Relief supplies are the next response step. Follow the supply beacon when you are ready.',recovery:'Restore the recovery relay to complete the response. The shelter remains available.',clearing:'Remain aware as warning lights fade. Normal conditions are returning.'};
 return {visible:true,inside,distance,label:inside?'At the shelter':distance+' m to shelter',message:instructions[state.phase]||'The shelter remains available.',name:shelter.name};
}
