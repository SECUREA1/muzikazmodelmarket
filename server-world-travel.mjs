// Runtime travel fixtures never modify the member's authored layout.
export function worldTravelObjects(environment,collision){
 if(!environment.travelPortals?.length)return [];
 const center=collision.safeSpawn(environment,environment.spawn||{x:0,y:0,z:2}),occupied=[],authoredIds=new Set((environment.builderScene?.objects||environment.placementScene?.objects||[]).map(object=>object.id));
 return environment.travelPortals.map((portal,index)=>{
  const candidate={x:center.x+(index? -3:3),y:center.y,z:center.z+2};
  const candidates=[candidate];for(const radius of [3,5,2,7,9])for(let step=0;step<24;step++){const angle=step*Math.PI/12+index*Math.PI;candidates.push({x:center.x+Math.cos(angle)*radius,y:center.y,z:center.z+Math.sin(angle)*radius});}
  let position;
  for(const point of candidates){
   let floor;try{floor=environment.builderScene||environment.proceduralLand?collision.meetingPosition(environment,point):collision.groundAt(environment,point);}catch{continue;}
   if(!floor||occupied.some(other=>Math.hypot(other.x-floor.x,other.z-floor.z)<2.2))continue;
   const origin={...center,y:center.y+.9},delta=[floor.x-center.x,floor.y-center.y,floor.z-center.z],length=Math.hypot(...delta);
   if(length<1||collision.blocksShot(environment,origin,delta.map(n=>n/length),length))continue;
   position=floor;break;
  }
  position ||= environment.builderScene||environment.proceduralLand?collision.meetingPosition(environment,candidate):collision.encounterSpawn(environment,candidate,center,occupied);
  occupied.push(position);
  let id='world-return-'+index;while(authoredIds.has(id))id+='-shared';
  return {id,modelId:'archway',name:'Return to '+portal.name,position,rotation:{x:0,y:0,z:0},scale:{x:.65,y:.65,z:.65},functionalSettings:{behavior:'interact',action:'teleport',interactionDistance:5,prompt:'Return to '+portal.name,portal:{enabled:true,destinationType:'map',targetMapId:portal.mapId,ownerName:'Shared public world',color:portal.color||'#9cffcf'}}};
 });
}
export function portalArrivalPosition(environment,manifest,from,collision,actors,objects){
 const reciprocal=manifest.objects.filter(object=>object.gameplay.portal?.targetMapId===from).sort((a,b)=>Number(b.objectId.startsWith('world-return-'))-Number(a.objectId.startsWith('world-return-')))[0];
 const center=collision.safeSpawn(environment,manifest.spawn?.position||environment.spawn||{x:0,y:0,z:2});
 if(!reciprocal)return center;
 const portal=reciprocal.transform.position,yaw=reciprocal.transform.rotation.y||0;
 const candidate={x:portal.x-Math.sin(yaw)*4,y:portal.y,z:portal.z-Math.cos(yaw)*4};
 return environment.builderScene||environment.proceduralLand?collision.meetingPosition(environment,candidate,actors,objects):collision.encounterSpawn(environment,candidate,center,[]);
}
