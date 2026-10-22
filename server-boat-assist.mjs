import {isWatercraft,watercraftOverlap,watercraftSize} from './public/js/harbor-water.js';
import {boatWaterwayClear} from './public/js/vehicle-actions.js';
import {planBoatNavigation} from './public/js/boat-navigation.js';
import {harborRadio} from './server-harbor-operations.mjs';
import {clearBoatAssist as clearAssist} from './public/js/boat-assist.js';
import * as THREE from './public/vendor/three/three.module.min.js';
export {boatAssistedInput} from './public/js/boat-assist.js';
export function boatMovementBlocked(environment,boat,actors,collision,objects={}){
 const placed=collision?.placedObjects?.(objects)?.floors||[];
 return (from,to,yaw)=>{
  if(Object.values(actors).some(other=>other.id!==boat.id&&other.active!==false&&isWatercraft(other)&&watercraftOverlap(to,yaw,other.position,other.rotation?.y||0,.12,boat,other)))return true;
  const dx=to.x-from.x,dz=to.z-from.z,span=Math.hypot(dx,dz);if(span<.001)return false;
  const direction=[dx/span,0,dz/span];
  const [beam,length]=(boat.modelId||boat.asset?.buildAssetId)==='harbor-yacht'||(boat.modelId||boat.asset?.buildAssetId)==='harbor-patrol'?watercraftSize(boat):[.85,2];
  return [-beam,0,beam].some(side=>{
   const origin={x:from.x+Math.cos(yaw)*side-Math.sin(yaw)*length,y:.18,z:from.z-Math.sin(yaw)*side-Math.cos(yaw)*length};
   if(collision?.blocksShot(environment,origin,direction,span+.12,Object.fromEntries(Object.entries(actors).filter(([id])=>id!==boat.id))))return true;
   return placed.length>0&&new THREE.Raycaster(new THREE.Vector3(origin.x,origin.y,origin.z),new THREE.Vector3(...direction),.001,span+.12).intersectObjects(placed,false).length>0;
  });
 };
}
const fail=message=>{throw Object.assign(Error(message),{statusCode:409});};
export function startBoatAssist(sim,player,environment,operation,now,{destinationId,collision,objects={}}={}){
 const boat=sim.actors[player.vehicleId];
 if(!isWatercraft(boat)||boat.active===false)fail('Enter a boat before using helm assistance.');
 if(!['launch','navigate','cruise','slow','moor','continue','cancel'].includes(operation))fail('Choose departure, a destination, cruise, slow, moor, or manual helm.');
 if(operation==='cancel'){clearAssist(boat);return 'Manual helm active. Your controls override assistance.';}
 if(operation==='continue')return boat.boating?.assist?'Helm assistance continues. Steer to take manual control.':'Choose Auto again for the next helm action.';
 if(operation==='moor'){const message=harborRadio(sim,player,environment,'moor');clearAssist(boat);return message;}
 if(!environment?.builderScene?.layoutMeta?.harbor)fail('This map has no navigable harbor.');
 const routed=operation==='navigate'||operation==='launch'&&(environment.builderScene.layoutMeta.harbor.islands||[]).length>0;
 let plan=null;
 if(routed){
  plan=planBoatNavigation(boat,environment,{destinationId:operation==='launch'?'open-water':destinationId,actors:sim.actors,blocked:boatMovementBlocked(environment,boat,sim.actors,collision,objects),depart:operation==='launch'});
  if(!plan)fail('No clear water passage is available. Wait for traffic or take the manual helm.');
 }else if((operation==='launch'||operation==='cruise')&&!boatWaterwayClear(environment,boat,sim.actors))fail('Turn toward open water before departing.');
 clearAssist(boat);boat.boating||={};
 Object.assign(boat.boating,{assist:operation,assistSince:now,assistOrigin:{...boat.position},anchor:false,...(plan?{assistRoute:plan.points,routeIndex:0,routeLength:plan.points.length,assistStage:'departure',navigationDestinationId:plan.destinationId,navigationName:plan.name,remainingDistance:0}:{})});
 player.input={};
 return plan?'Helm: following the marked water passage to '+plan.name+'. Steer or use power to take control.':operation==='slow'?'Helm: reducing power and slowing to a stop.':operation==='launch'?'Helm: anchor raised. Departing at a gentle pace. Steer to take control.':'Helm: steady cruise. Assistance slows for shore and other boats.';
}
