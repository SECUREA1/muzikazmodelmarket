import {isWatercraft,harborWaterAt} from './public/js/harbor-water.js';
export function stopBoat(boat){if(!isWatercraft(boat))return;boat.rotation={...boat.rotation,x:0,z:0};boat.boating={...boat.boating,assist:null,speed:0,speedKnots:0,throttle:0,throttleCommand:0,rpm:0,anchor:true,phase:'anchored',warning:'',wakeStrength:0};}
export function harborRadio(sim,player,environment,operation){
 if(!environment.builderScene?.layoutMeta?.harbor)throw Object.assign(Error('This map has no harbor office.'),{statusCode:409});
 const boats=Object.values(sim.actors).filter(actor=>isWatercraft(actor)&&actor.active!==false),boat=sim.actors[player.vehicleId],points=(environment.builderScene.objects||[]).filter(isWatercraft);
 if(operation==='status')return 'Neon Harbor. '+boats.length+' boats live. Watch pier lights, keep clear of shore and reduce power before mooring. Open the passage planner for island distances and bearings.';
 if(!['service','moor'].includes(operation))throw Object.assign(Error('Choose a harbor radio operation.'),{statusCode:422});
 if(!isWatercraft(boat))throw Object.assign(Error('Board a boat before requesting harbor services.'),{statusCode:409});
 const nearest=points.filter(point=>(point.modelId==='harbor-yacht')===(boat.modelId==='harbor-yacht')).map(point=>({point,distance:Math.hypot(point.position.x-boat.position.x,point.position.z-boat.position.z)})).filter(row=>row.distance<=12).sort((a,b)=>a.distance-b.distance);
 if(!nearest.length)throw Object.assign(Error('Approach a marina or island landing before requesting this service.'),{statusCode:409});
 if(Math.abs(boat.boating?.speed||0)>(operation==='moor'?2:.5))throw Object.assign(Error(operation==='moor'?'Slow below 2 m/s to moor.':'Stop beside a landing before requesting service.'),{statusCode:409});
 if(operation==='service'){boat.health=boat.maxHealth||200;player.fuel=100;return 'Harbor crew. Hull repaired and fuel topped up. Check your anchor before departure.';}
 const berth=nearest.find(({point})=>!boats.some(other=>other.id!==boat.id&&Math.hypot(other.position.x-point.position.x,other.position.z-point.position.z)<3));
 if(!berth)throw Object.assign(Error('Nearby berths are occupied. Choose another landing.'),{statusCode:409});
 boat.position={...berth.point.position,y:0};boat.rotation={x:0,y:berth.point.rotation?.y||0,z:0};stopBoat(boat);player.position={...boat.position,y:.35};player.floor=.35;player.velocityY=0;player.yaw=boat.rotation.y;player.input={};player.movementRevision=(player.movementRevision||0)+1;return 'Moored safely. Engine neutral, anchor set. You can leave the boat or request service.';
}
export function boatExitPosition(environment,boat,collision,actors,objects){
 const yaw=boat.rotation?.y||0;
 if(boat.modelId==='harbor-yacht'){
  // Query the released vessel itself, never the swim floor beneath its hull.
  const released={...actors,[boat.id]:{...boat,holderId:null}};
  for(const [x,z] of [[0,12],[0,11],[1.1,11],[-1.1,11]]){
   const candidate={x:boat.position.x+x*Math.cos(yaw)+z*Math.sin(yaw),y:boat.position.y+2.1,z:boat.position.z-x*Math.sin(yaw)+z*Math.cos(yaw)};
   const floor=collision.groundAt(environment,candidate,{actors:released,objects,maxRise:.2});
   if(floor&&floor.y>=boat.position.y+1.9&&floor.y<boat.position.y+2.3)return floor;
  }
  throw Object.assign(Error('The aft deck is obstructed. Clear the deck before leaving the helm.'),{statusCode:409});
 }
 for(const distance of [1.8,2.8,4,6])for(const side of [-1,1]){const point={x:boat.position.x+Math.cos(yaw)*distance*side,y:.4,z:boat.position.z-Math.sin(yaw)*distance*side};const floor=collision.groundAt(environment,point,{entry:true,actors,objects});if(!floor||floor.y<-.05)continue;try{return collision.teleportPosition(environment,{...boat.position,y:.35},floor,actors,objects,{localMap:true});}catch{}}
 // Open-water exits remain possible once the boat is stopped; the swimmer uses
 // the harbor's authored shallow support plane rather than an invisible island.
 for(const side of [1,-1]){const point={x:boat.position.x+Math.cos(yaw)*1.8*side,y:.35,z:boat.position.z-Math.sin(yaw)*1.8*side};if(harborWaterAt(environment,point))return point;}
 return {...boat.position,y:.35};
}
