import {isWatercraft} from './public/js/harbor-water.js';
import {boatWaterwayClear} from './public/js/vehicle-actions.js';
import {harborRadio} from './server-harbor-operations.mjs';
import {clearBoatAssist as clearAssist} from './public/js/boat-assist.js';
export {boatAssistedInput} from './public/js/boat-assist.js';

const fail=message=>{throw Object.assign(Error(message),{statusCode:409});};
export function startBoatAssist(sim,player,environment,operation,now){
 const boat=sim.actors[player.vehicleId];
 if(!isWatercraft(boat)||boat.active===false)fail('Enter a boat before using helm assistance.');
 if(!['launch','cruise','slow','moor','continue','cancel'].includes(operation))fail('Choose departure, cruise, slow, moor, or manual helm.');
 if(operation==='cancel'){clearAssist(boat);return 'Manual helm active. Your controls override assistance.';}
 if(operation==='continue')return boat.boating?.assist?'Helm assistance continues. Steer to take manual control.':'Choose Auto again for the next helm action.';
 if(operation==='moor'){const message=harborRadio(sim,player,environment,'moor');clearAssist(boat);return message;}
 if(!environment?.builderScene?.layoutMeta?.harbor)fail('This map has no navigable harbor.');
 if((operation==='launch'||operation==='cruise')&&!boatWaterwayClear(environment,boat,sim.actors))fail('Turn toward open water before departing.');
 boat.boating||={};
 Object.assign(boat.boating,{assist:operation,assistSince:now,assistOrigin:{...boat.position},anchor:false});
 player.input={};
 return operation==='slow'?'Helm: reducing power and slowing to a stop.':operation==='launch'?'Helm: anchor raised. Departing at a gentle pace. Steer to take control.':'Helm: steady cruise. Assistance slows for shore and other boats.';
}
