import {isBasketballEnvironment} from './public/js/basketball-rules.js';
import {isDedicatedFiringRange,firingRangeLocations,rangeLocalToWorld,rangeWorldToLocal} from './public/js/firing-range.js';
// Runtime travel fixtures never modify the member's authored layout.
export function worldTravelObjects(environment,collision){
 if(!environment.travelPortals?.length)return [];
 const rangeLocation=isDedicatedFiringRange(environment)?firingRangeLocations(environment).find(location=>location.id==='main'):null;
 const center=collision.safeSpawn(environment,rangeLocation?rangeLocalToWorld(rangeLocation,{x:0,y:0,z:16.2}):environment.spawn||{x:0,y:0,z:2}),occupied=[],authoredIds=new Set((environment.builderScene?.objects||environment.placementScene?.objects||[]).map(object=>object.id));
 return environment.travelPortals.map((portal,index)=>{
  const basketball=isBasketballEnvironment(environment),firingRange=isDedicatedFiringRange(environment),candidate=firingRange?rangeLocalToWorld(rangeLocation,{x:(index%2?-1:1)*17,y:0,z:17.2-Math.floor(index/2)*1.8}):basketball?{x:(index%2?-1:1)*10.8,y:center.y,z:8-Math.floor(index/2)*4}:{x:center.x+(index? -3:3),y:center.y,z:center.z+2};
  const candidates=[candidate];for(const radius of [3,5,2,7,9])for(let step=0;step<24;step++){const angle=step*Math.PI/12+index*Math.PI;candidates.push({x:center.x+Math.cos(angle)*radius,y:center.y,z:center.z+Math.sin(angle)*radius});}
  let position;
  for(const point of candidates){
   let floor;try{floor=environment.builderScene||environment.proceduralLand?collision.meetingPosition(environment,point):collision.groundAt(environment,point);}catch{continue;}
   if(basketball&&floor&&Math.abs(floor.x)<9&&Math.abs(floor.z)<16)continue;
   if(firingRange&&floor&&rangeWorldToLocal(rangeLocation,floor).z<14)continue;
   if(!floor||occupied.some(other=>Math.hypot(other.x-floor.x,other.z-floor.z)<2.2))continue;
   const origin={...center,y:center.y+.9},delta=[floor.x-center.x,floor.y-center.y,floor.z-center.z],length=Math.hypot(...delta);
   if(length<1||collision.blocksShot(environment,origin,delta.map(n=>n/length),length))continue;
   position=floor;break;
  }
  position ||= environment.builderScene||environment.proceduralLand?collision.meetingPosition(environment,candidate):collision.encounterSpawn(environment,candidate,center,occupied);
  occupied.push(position);
  let id='world-return-'+index;while(authoredIds.has(id))id+='-shared';
  return {id,modelId:'archway',name:'Return to '+portal.name,position,rotation:{x:0,y:0,z:0},scale:{x:.65,y:.65,z:.65},functionalSettings:{behavior:'interact',action:'teleport',interactionDistance:firingRange?2.5:5,prompt:'Return to '+portal.name,portal:{enabled:true,destinationType:'map',targetMapId:portal.mapId,ownerName:'Shared public world',color:portal.color||'#9cffcf'}}};
 });
}
export function portalArrivalPosition(environment,manifest,from,collision,actors,objects){
 if(isDedicatedFiringRange(environment)){const location=firingRangeLocations(environment).find(location=>location.id==='main');return collision.safeSpawn(environment,rangeLocalToWorld(location,{x:0,y:0,z:16.2}));}
 if(isBasketballEnvironment(environment))return collision.safeSpawn(environment,environment.spawn||{x:8.8,y:0,z:0});
 const reciprocal=manifest.objects.filter(object=>object.gameplay.portal?.targetMapId===from).sort((a,b)=>Number(b.objectId.startsWith('world-return-'))-Number(a.objectId.startsWith('world-return-')))[0];
 const center=collision.safeSpawn(environment,manifest.spawn?.position||environment.spawn||{x:0,y:0,z:2});
 if(!reciprocal)return center;
 const portal=reciprocal.transform.position,yaw=reciprocal.transform.rotation.y||0;
 const candidate={x:portal.x-Math.sin(yaw)*4,y:portal.y,z:portal.z-Math.cos(yaw)*4};
 return environment.builderScene||environment.proceduralLand?collision.meetingPosition(environment,candidate,actors,objects):collision.encounterSpawn(environment,candidate,center,[]);
}
