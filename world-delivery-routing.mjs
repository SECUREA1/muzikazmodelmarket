import {createHash} from 'node:crypto';
import {roadNetwork,roadSpeedLimit} from './public/js/road-network.js';
import {ENTERABLE_BUILDINGS} from './public/js/building-districts.js';

export const DEED_DELIVERY_RULES=Object.freeze({truckWidth:2.05,truckLength:5.5,truckHeight:2.4,truckSpeedMps:5,courierSpeedMps:1.4,unpackMs:2500,loadMs:2000,unloadMs:2000,handoverMs:1800,gridStep:3,maxSearchNodes:1400,maxGeometryChecks:15000,maxComputeMs:450,maxWaypoints:400});
const finite=point=>point&&['x','z'].every(axis=>Number.isFinite(Number(point[axis])));
const point=value=>Array.isArray(value)?{x:Number(value[0])||0,y:Number(value[1])||0,z:Number(value[2])||0}:{x:Number(value?.x)||0,y:Number(value?.y)||0,z:Number(value?.z)||0};
const gap=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const length=points=>points.slice(1).reduce((sum,p,index)=>sum+Math.hypot(p.x-points[index].x,p.y-points[index].y,p.z-points[index].z),0);
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,24);
const stable=value=>{if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));return value;};
function roadsFor(environment,room){
 const roads=new Map();
 for(const road of [...(room.simulation?.streets||[]),...(environment.streets||[]),...(environment.builderScene?.streets||[])])if(road?.from&&road?.to)roads.set(road.id||JSON.stringify([road.from,road.to]),road);
 return [...roads.values()];
}
function blockers(room){return Object.values(room.simulation?.actors||{}).filter(actor=>actor.active!==false&&!actor.trafficAI&&!actor.loot&&!actor.holderId&&actor.spawned).map(actor=>({id:actor.id,active:actor.active,modelId:actor.modelId,asset:actor.asset,position:actor.position,rotation:actor.rotation,scale:actor.scale,placementRevision:actor.placementRevision,open:actor.open})).sort((a,b)=>String(a.id).localeCompare(String(b.id)));}
export function deliveryMapRevision({deed={},environment={},room={},portId}={}){
 return digest(stable({deedId:deed.id,ownerId:deed.ownerId,status:deed.status,hostedSpace:deed.hostedSpace,lot:deed.lot,mapId:environment.id,contentUpdatedAt:environment.contentUpdatedAt||environment.updatedAt,delivery:environment.delivery,scene:environment.builderScene||environment.placementScene,spawn:environment.spawn,modelUrl:environment.modelUrl,modelUrls:environment.modelUrls,scale:environment.scale,rotation:environment.rotation,streets:roadsFor(environment,room),objects:room.objects||{},actors:blockers(room),earthworks:room.simulation?.construction?.earthworks,portId}));
}
function metadata(environment){const scene=environment.builderScene||environment.placementScene||{};return {...scene.layoutMeta?.delivery,...scene.delivery,...environment.delivery};}
function sceneObjects(environment,room){
 const scene=environment.builderScene||environment.placementScene||{},rows=new Map((scene.objects||[]).map(item=>[item.id,item]));
 for(const item of Object.values(room.simulation?.actors||{}))if(!item.trafficAI&&(item.spawned||rows.has(item.id)))rows.set(item.id,item);
 for(const item of Object.values(room.objects||{}))rows.set(item.id,item);
 return [...rows.values()].filter(item=>!item.deleted&&item.active!==false);
}
function transform(offset,item){
 const p=point(item.position||item.transform?.position),s=item.scale||item.transform?.scale,yaw=Number(Array.isArray(item.rotation)?item.rotation[1]:item.rotation?.y??item.transform?.rotation?.[1])||0;
 const sx=Number(Array.isArray(s)?s[0]:s?.x)||1,sz=Number(Array.isArray(s)?s[2]:s?.z)||1,x=offset.x*sx,z=offset.z*sz;
 return {x:p.x+x*Math.cos(yaw)+z*Math.sin(yaw),y:p.y+(offset.y||0),z:p.z-x*Math.sin(yaw)+z*Math.cos(yaw)};
}
function doorstep(deed,environment,room,bounds){
 const meta=metadata(environment),explicit=meta.dropoff?.position||meta.dropoff;
 if(finite(explicit))return {id:meta.dropoff.id||'deed-dropoff:'+deed.id,name:meta.dropoff.name||'Deed delivery drop-off',kind:meta.dropoff.kind||'doorstep',position:point(explicit),explicit:true};
 const spawn=point(environment.spawn),doors=[];
 for(const item of sceneObjects(environment,room)){
  const id=item.asset?.buildAssetId||item.buildAssetId||item.modelId||item.materialId||'',custom=item.deliveryDropoff||item.functionalSettings?.deliveryDropoff;
  if(custom&&finite(custom.position||custom))doors.push({id:item.id,name:item.name||'Configured entrance',position:point(custom.position||custom),score:-10000});
  const building=ENTERABLE_BUILDINGS[id];
  if(building)for(const direction of [-1,1]){const p=transform({x:0,y:.18,z:direction*(building.depth/2+.8)},item);doors.push({id:item.id,name:item.name||building.name,position:p,score:gap(p,spawn)});}
  else if(/(?:^|[-:])(?:doors?|doorway|entrance|entry)(?:[-:]|$)/i.test(id)&&!/(?:frame|sign|handle)/i.test(id))for(const direction of [-1,1]){const p=transform({x:0,y:0,z:direction*.9},item);doors.push({id:item.id,name:item.name||'Door',position:p,score:gap(p,spawn)});}
 }
 doors.sort((a,b)=>a.score-b.score||String(a.id).localeCompare(String(b.id)));
 if(doors.length)return {id:'deed-door:'+deed.id+':'+doors[0].id,name:doors[0].name+' · delivery drop-off',kind:'doorstep',position:doors[0].position,alternatives:doors.slice(1,8).map(door=>({id:'deed-door:'+deed.id+':'+door.id,name:door.name+' · delivery drop-off',position:door.position}))};
 // A deed can be undeveloped or host an authored indoor GLB with no door
 // metadata. Its marked entrance is distinct from an invented building door.
 const entrance=meta.entrance?.position||meta.entrance;
 const position=finite(entrance)?point(entrance):deed.lot?{x:0,y:0,z:Math.max(bounds.minZ+4,bounds.maxZ-4)}:finite(environment.spawn)?spawn:{x:0,y:0,z:Math.max(bounds.minZ+4,bounds.maxZ-4)};
 return {id:'deed-entrance:'+deed.id,name:deed.lot?'Deeded plot entrance · delivery drop-off':'Deed entrance · delivery drop-off',kind:'plot-entrance',position};
}
function localBounds(environment,collision){
 const size=Number(environment.builderScene?.mapSize||environment.placementScene?.mapSize),half=Number.isFinite(size)&&size>0?Math.min(10000,size/2):null;
 if(half)return {minX:-half,maxX:half,minZ:-half,maxZ:half};
 try{const bounds=collision.world?.(environment)?.bounds;if(bounds&&[bounds.min.x,bounds.max.x,bounds.min.z,bounds.max.z].every(Number.isFinite))return {minX:bounds.min.x,maxX:bounds.max.x,minZ:bounds.min.z,maxZ:bounds.max.z};}catch{}
 return {minX:-40,maxX:40,minZ:-40,maxZ:40};
}
function geometry(environment,room,collision,bounds){
 let checks=0;const deadline=performance.now()+DEED_DELIVERY_RULES.maxComputeMs,floorCache=new Map(),segmentCache=new Map(),coordinate=p=>[p.x,p.y,p.z].map(n=>Math.round(n*10000)).join(':');
 const placed={objects:room.objects||{},actors:Object.fromEntries(blockers(room).map(actor=>[actor.id,actor])),earthworks:room.simulation?.construction?.earthworks};
 const inside=p=>p.x>=bounds.minX&&p.x<=bounds.maxX&&p.z>=bounds.minZ&&p.z<=bounds.maxZ;
 const floor=(p,radius=.4,height=1.7)=>{
  if(!inside(p))return null;
  const key=coordinate(p)+':'+radius+':'+height;if(floorCache.has(key))return floorCache.get(key);
  if(++checks>DEED_DELIVERY_RULES.maxGeometryChecks||performance.now()>deadline)return null;
  let result;try{result=collision.groundAt(environment,p,placed);if(!result||!finite(result)||!Number.isFinite(result.y)||Math.abs(result.y-p.y)>.7||!collision.hasBodyClearance(environment,result,radius,placed)||height>1.7&&!collision.hasBodyClearance(environment,{...result,y:result.y+height-1.7},radius,placed)){floorCache.set(key,null);return null;}}catch{floorCache.set(key,null);return null;}
  const safe={x:result.x,y:result.y,z:result.z};floorCache.set(key,safe);return safe;
 };
 const pose=(p,truck,yaw=0)=>{
  const center=floor(p,truck?.25:.4,truck?DEED_DELIVERY_RULES.truckHeight:1.7);if(!center)return null;if(!truck)return center;
  for(const x of [-DEED_DELIVERY_RULES.truckWidth/2,0,DEED_DELIVERY_RULES.truckWidth/2])for(const z of [-DEED_DELIVERY_RULES.truckLength/2,DEED_DELIVERY_RULES.truckLength/2]){
   const sample={x:p.x+x*Math.cos(yaw)+z*Math.sin(yaw),y:center.y,z:p.z-x*Math.sin(yaw)+z*Math.cos(yaw)},support=floor(sample,.2,DEED_DELIVERY_RULES.truckHeight);
   if(!support||Math.abs(support.y-center.y)>.45)return null;
  }return center;
 };
 const segment=(a,b,truck)=>{
  const key=truck+':'+coordinate(a)+':'+coordinate(b);if(segmentCache.has(key))return segmentCache.get(key);
  const distance=gap(a,b),steps=Math.max(1,Math.ceil(distance/(truck?1:.65))),yaw=Math.atan2(b.x-a.x,b.z-a.z),path=[];let previous=a;
  for(let index=0;index<=steps;index++){const t=index/steps,p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t},support=pose(p,truck,yaw);if(!support||Math.abs(support.y-previous.y)>(truck?.6:.4)){segmentCache.set(key,null);return null;}previous=support;path.push(support);}segmentCache.set(key,path);segmentCache.set(truck+':'+coordinate(b)+':'+coordinate(a),[...path].reverse());return path;
 };
 return {floor,pose,segment,inside,get exhausted(){return checks>DEED_DELIVERY_RULES.maxGeometryChecks||performance.now()>deadline;}};
}
export function shortestDeliveryRoadPath(network,from,to,valid=()=>true){
 const cost=new Map([[from,0]]),prior=new Map(),open=new Set([from]);
 while(open.size){let current;for(const node of open)if(current===undefined||cost.get(node)<cost.get(current))current=node;open.delete(current);if(current===to)break;
  for(const next of network.nodes[current]?.links||[]){const a=network.nodes[current],b=network.nodes[next];if(!valid(a,b))continue;const nextCost=cost.get(current)+gap(a,b);if(nextCost<(cost.get(next)??Infinity)){cost.set(next,nextCost);prior.set(next,current);open.add(next);}}
 }
 if(!cost.has(to))return null;const path=[];for(let node=to;node!==undefined;node=prior.get(node))path.unshift(point(network.nodes[node]));return path;
}
function roadPath(environment,room,from,to,geo){
 const roads=roadsFor(environment,room),scene=environment.builderScene||{},authored=roadNetwork({...environment,streets:roads,builderScene:{...scene,streets:[]}});if(!authored.nodes.length)return null;
 const network={nodes:authored.nodes.map(node=>({...node,links:[...node.links]}))},nearest=p=>network.nodes.map((node,id)=>({id,d:gap(node,p)})).sort((a,b)=>a.d-b.d).slice(0,4),starts=nearest(from),ends=nearest(to),first=network.nodes.length,last=first+1;
 network.nodes.push({...from,links:[]},{...to,links:[]});
 for(const start of starts)if(start.d<=18&&geo.segment(from,network.nodes[start.id],true)){network.nodes[first].links.push(start.id);network.nodes[start.id].links.push(first);}
 for(const end of ends)if(end.d<=18&&geo.segment(network.nodes[end.id],to,true)){network.nodes[last].links.push(end.id);network.nodes[end.id].links.push(last);}
 return shortestDeliveryRoadPath(network,first,last,(a,b)=>!!geo.segment(point(a),point(b),true));
}
function gridPath(from,to,geo,truck,bounds){
 const direct=geo.segment(from,to,truck);if(direct)return [from,to];
 const step=DEED_DELIVERY_RULES.gridStep,key=(x,z)=>x+':'+z,coordinate=(x,z)=>({x:from.x+x*step,y:from.y,z:from.z+z*step}),start=key(0,0),open=new Map([[start,{x:0,z:0,g:0,f:gap(from,to)}]]),closed=new Set(),prior=new Map(),positions=new Map([[start,from]]);let visited=0,goal=null;
 while(open.size&&visited++<DEED_DELIVERY_RULES.maxSearchNodes){
  let currentKey,current;for(const [k,value] of open)if(!current||value.f<current.f){currentKey=k;current=value;}open.delete(currentKey);closed.add(currentKey);const currentPoint=positions.get(currentKey);
  if(gap(currentPoint,to)<step*1.6&&geo.segment(currentPoint,to,truck)){goal=currentKey;break;}
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
   const x=current.x+dx,z=current.z+dz,k=key(x,z);if(closed.has(k))continue;const target=coordinate(x,z);target.y=currentPoint.y;if(target.x<bounds.minX||target.x>bounds.maxX||target.z<bounds.minZ||target.z>bounds.maxZ)continue;
   const candidate=geo.pose(target,truck,Math.atan2(dx,dz));if(!candidate||!geo.segment(currentPoint,candidate,truck))continue;const g=current.g+gap(currentPoint,candidate);if(g>=(open.get(k)?.g??Infinity))continue;
   positions.set(k,candidate);prior.set(k,currentKey);open.set(k,{x,z,g,f:g+gap(candidate,to)});
  }
 }
 if(!goal)return null;const route=[to];for(let k=goal;k;k=prior.get(k))route.unshift(positions.get(k));return route;
}
function simplify(path,geo,truck){
 if(!path||path.length<=2)return path;const result=[path[0]];let current=0;
 while(current<path.length-1){let next=Math.min(path.length-1,current+12);while(next>current+1&&!geo.segment(path[current],path[next],truck))next--;result.push(path[next]);current=next;if(result.length>DEED_DELIVERY_RULES.maxWaypoints)return null;}return result;
}
function turnsClear(path,geo){
 for(let index=1;index<path.length-1;index++){
  const a=path[index-1],p=path[index],b=path[index+1],from=Math.atan2(p.x-a.x,p.z-a.z),to=Math.atan2(b.x-p.x,b.z-p.z),turn=Math.atan2(Math.sin(to-from),Math.cos(to-from)),steps=Math.max(1,Math.ceil(Math.abs(turn)/(Math.PI/12)));
  for(let step=0;step<=steps;step++)if(!geo.pose(p,true,from+turn*step/steps))return false;
 }return true;
}

/** Resolve one local map leg only. Inter-map sea/portal transfers must remain
 * distinct legs; atlas world coordinates are never treated as a paved road. */
function calculateDeedDelivery({deed={},environment={},room={},portId,now=Date.now(),collision,origin,mode,phase}={},savedRevision){
 const revision=savedRevision||deliveryMapRevision({deed,environment,room,portId}),mapId=environment.id||'plot-'+deed.id,bounds=localBounds(environment,collision||{}),target=doorstep(deed,environment,room,bounds),meta=metadata(environment),explicitHub=meta.hub?.position||meta.hub;
 const {alternatives,...targetPublic}=target;
 const base={id:'deed-route:'+deed.id+':'+revision,deedId:deed.id,mapId,revision,status:'blocked',calculatedAt:now,dropoff:{...targetPublic,mapId},hub:null,truckWaypoints:[],courierWaypoints:[],distanceMeters:0,truckDistanceMeters:0,courierDistanceMeters:0,truckDurationMs:0,courierDurationMs:0,estimatedDurationMs:0,legs:[],...(deed.lot?{regionalHandoff:{mapId:deed.lot.mapId,position:point(deed.lot.entry||deed.lot.position),destinationMapId:mapId,mode:'inter-map-distribution'}}:{})};
 const blocked=(reason,retryable=false)=>({...base,reason,...(retryable?{retryable:true}:{})});
 if(!collision?.groundAt||!collision?.hasBodyClearance)return blocked('Current map geometry is unavailable for delivery route validation.',true);
 // Cold authored GLB parsing is owned by the shared collision loader. Start
 // the bounded planning budget only once that existing world is initialized.
 try{collision.world?.(environment);}catch{return blocked('Current map geometry could not be loaded for delivery validation.',true);}
 const geo=geometry(environment,room,collision,bounds);let drop=geo.floor(target.position);
 if(!drop&&alternatives)for(const alternative of alternatives){const floor=geo.floor(alternative.position);if(floor){drop=floor;Object.assign(base.dropoff,alternative);break;}}
 // GLB entry hints can be above/below the actual authored floor. Probe only a
 // marked fallback entrance, never move an explicit door to another location.
 if(!drop&&target.kind==='plot-entrance'&&!target.explicit){
  const positions=[target.position];
  for(const radius of [1.5,3,6,10,16,24,40])for(let index=0;index<12;index++){const angle=index*Math.PI/6;positions.push({x:target.position.x+Math.cos(angle)*radius,y:target.position.y,z:target.position.z+Math.sin(angle)*radius});}
  for(const p of positions){if(geo.exhausted)break;if(!geo.inside(p))continue;try{const entry=collision.groundAt(environment,p,{entry:true,objects:room.objects||{},actors:room.simulation?.actors||{}});if(entry)drop=geo.floor(entry);}catch{}if(drop)break;}
 }
 if(!drop)return blocked(geo.exhausted?'Delivery route validation reached its work limit. Recalculate the route.':'The deed delivery drop-off has no clear accessible ground. Move or clear the entrance.',geo.exhausted);base.dropoff.position=drop;
 if((mode||phase)==='courier'){
  const start=finite(origin)&&geo.pose(point(origin),false);if(!start)return blocked('The courier’s current position is no longer accessible.',geo.exhausted);
  const path=simplify(gridPath(start,drop,geo,false,bounds),geo,false);if(!path)return blocked(geo.exhausted?'Delivery route validation reached its work limit. Recalculate the route.':'No clear walking path reaches the deed door. Clear the entrance.',geo.exhausted);
  const distance=length(path),courierDurationMs=Math.ceil(distance/DEED_DELIVERY_RULES.courierSpeedMps*1000);return {...base,status:'ready',origin:{position:start,mode:'courier'},courierWaypoints:path,distanceMeters:distance,courierDistanceMeters:distance,courierDurationMs,estimatedDurationMs:courierDurationMs+DEED_DELIVERY_RULES.handoverMs,legs:[{id:'courier',mode:'walking',mapId,waypoints:path,distanceMeters:distance}]};
 }
 const candidates=[];
 if(finite(explicitHub))candidates.push(point(explicitHub));
 else{
  for(const object of sceneObjects(environment,room))if((object.asset?.buildAssetId||object.modelId)==='freight-loading-bay'&&finite(object.position))candidates.push(point(object.position));
  const network=roadNetwork({...environment,streets:roadsFor(environment,room),builderScene:{...(environment.builderScene||{}),streets:[]}});
  candidates.push(...network.nodes.filter(node=>gap(node,drop)>9).sort((a,b)=>gap(a,drop)-gap(b,drop)).slice(0,8).map(point));
  for(const [dx,dz] of [[0,1],[0,-1],[1,0],[-1,0]])for(const distance of [16,24,32])candidates.push({x:Math.max(bounds.minX+4,Math.min(bounds.maxX-4,drop.x+dx*distance)),y:drop.y,z:Math.max(bounds.minZ+4,Math.min(bounds.maxZ-4,drop.z+dz*distance))});
 }
 let hub=null;
 const courierAccess=({directOnly=false}={})=>{
  if(finite(origin)&&(mode||phase)!=='courier')return null;
  let spawn=target.kind==='plot-entrance'&&!target.explicit?drop:finite(environment.spawn)?point(environment.spawn):null;
  if(spawn&&target.kind==='plot-entrance'&&gap(spawn,drop)<.01)spawn=drop;
  else if(spawn)try{const floor=collision.groundAt(environment,spawn,{entry:true,objects:room.objects||{},actors:room.simulation?.actors||{}});if(floor&&Math.abs(floor.y-spawn.y)<=2)spawn=floor;}catch{}
  const positions=finite(explicitHub)?[point(explicitHub)]:spawn?[spawn]:[];
  for(const position of positions){const start=geo.pose(position,false);if(!start)continue;const path=directOnly?(geo.segment(start,drop,false)?[start,drop]:null):simplify(gridPath(start,drop,geo,false,bounds),geo,false);if(!path)continue;
   const distance=length(path),courierDurationMs=Math.ceil(distance/DEED_DELIVERY_RULES.courierSpeedMps*1000),gateway={id:'deed-gateway:'+deed.id,name:'Serviced freight gateway · courier access',mode:'freight-gateway',vehicleAccess:false,mapId,position:start};
   return {...base,status:'ready',accessMode:'courier-access',hub:gateway,origin:{position:start,mode:'courier'},courierWaypoints:path,distanceMeters:distance,courierDistanceMeters:distance,courierDurationMs,estimatedDurationMs:courierDurationMs+DEED_DELIVERY_RULES.unpackMs+DEED_DELIVERY_RULES.loadMs+DEED_DELIVERY_RULES.unloadMs+DEED_DELIVERY_RULES.handoverMs,legs:[{id:'freight-gateway',mode:'inter-map-distribution',mapId,position:start},{id:'courier',mode:'walking',mapId,waypoints:path,distanceMeters:distance}]};
  }return null;
 };
 // Keep an already-validated walking handoff before a truck search can spend
 // the budget. It is never usable to relocate an in-transit truck origin.
 const authoredGlb=!!(environment.modelUrl||environment.modelUrls?.length||environment.builderScene?.baseEnvironment?.modelUrl||environment.builderScene?.baseEnvironment?.modelUrls?.length),hasFreightBay=sceneObjects(environment,room).some(object=>(object.asset?.buildAssetId||object.modelId)==='freight-loading-bay'),indoorSport=environment.game==='hockey'||environment.hockey?.enabled===true||/hockey-arena/.test(environment.builderScene?.layout||''),preferCourier=indoorSport||authoredGlb&&!roadsFor(environment,room).length&&!hasFreightBay;
 // Native districts often have a spawn behind buildings while a clear truck
 // depot is beside the actual door. Save only a cheap direct foot fallback
 // before their truck search; do not consume its budget on a needless A* walk.
 const savedCourierAccess=!finite(explicitHub)&&!finite(origin)?courierAccess({directOnly:!preferCourier}):null;
 if(preferCourier&&savedCourierAccess)return savedCourierAccess;
 for(const candidate of candidates){if(geo.exhausted)break;const safe=geo.pose(candidate,true);if(safe&&gap(safe,drop)>7){hub=safe;break;}}
 if(!hub)return savedCourierAccess||courierAccess()||blocked(geo.exhausted?'Delivery route validation reached its work limit. Recalculate the route or add a clear freight entrance.':'No clear truck loading bay fits this map. Add a freight bay and a vehicle-width access route.',geo.exhausted);
 base.hub={id:meta.hub?.id||'deed-hub:'+deed.id,name:meta.hub?.name||'Local port distribution bay',vehicleAccess:true,mapId,position:hub};
 const start=finite(origin)?geo.pose(point(origin),true):hub;if(!start)return blocked('The delivery truck’s current position is blocked. Clear the vehicle access.',geo.exhausted);
 const stops=[];
 for(const radius of [4.5,6,8,11])for(let index=0;index<12;index++){const angle=index*Math.PI/6,candidate=geo.pose({x:drop.x+Math.cos(angle)*radius,y:drop.y,z:drop.z+Math.sin(angle)*radius},true,angle);if(candidate)stops.push(candidate);}
 let best=null;
 for(const stop of stops.sort((a,b)=>gap(start,a)+gap(a,drop)-gap(start,b)-gap(b,drop)).slice(0,18)){
  const foot=simplify(gridPath(stop,drop,geo,false,bounds),geo,false);if(!foot)continue;
  const road=roadPath(environment,room,start,stop,geo),truck=road||simplify(gridPath(start,stop,geo,true,bounds),geo,true);if(!truck||!turnsClear(truck,geo))continue;
  const truckDistance=length(truck),courierDistance=length(foot),cost=truckDistance+courierDistance*2;
  if(!best||cost<best.cost)best={truck,foot,truckDistance,courierDistance,cost,road:!!road};
  if(best)break;
 }
 if(!best)return savedCourierAccess||(!finite(explicitHub)&&courierAccess())||blocked(geo.exhausted?'Delivery route validation reached its work limit. Recalculate the route or add connected streets.':'No continuous clear truck-and-courier path reaches this deed. Clear the route or add connected streets.',geo.exhausted);
 const drivingMs=best.truck.slice(1).reduce((sum,p,index)=>{const a=best.truck[index],speed=Math.min(DEED_DELIVERY_RULES.truckSpeedMps,roadSpeedLimit(environment,a)/3.6);return sum+gap(a,p)/Math.max(1,speed)*1000;},0),distance=best.truckDistance+best.courierDistance;
 const truckDurationMs=Math.ceil(drivingMs),courierDurationMs=Math.ceil(best.courierDistance/DEED_DELIVERY_RULES.courierSpeedMps*1000);
 return {...base,status:'ready',accessMode:'truck-and-courier',origin:{position:start,mode:'truck'},truckWaypoints:best.truck,courierWaypoints:best.foot,distanceMeters:distance,truckDistanceMeters:best.truckDistance,courierDistanceMeters:best.courierDistance,truckDurationMs,courierDurationMs,estimatedDurationMs:truckDurationMs+courierDurationMs+DEED_DELIVERY_RULES.unpackMs+DEED_DELIVERY_RULES.loadMs+DEED_DELIVERY_RULES.unloadMs+DEED_DELIVERY_RULES.handoverMs,legs:[{id:'truck',mode:best.road?'road':'validated-service-access',mapId,waypoints:best.truck,distanceMeters:best.truckDistance},{id:'courier',mode:'walking',mapId,waypoints:best.foot,distanceMeters:best.courierDistance}]};
}

const planCaches=new WeakMap();
/** A bounded cache is keyed by complete map contents and projected origin,
 * not a time-to-live. Returned snapshots cannot mutate a cached route. */
export function planDeedDelivery(options={}){
 const revision=deliveryMapRevision(options),collision=options.collision;
 if(!collision||typeof collision!=='object')return calculateDeedDelivery(options,revision);
 let cache=planCaches.get(collision);if(!cache){cache=new Map();planCaches.set(collision,cache);}
 const key=revision+':'+JSON.stringify([options.origin||null,options.mode||options.phase||null]);
 if(!cache.has(key)){
  const calculated=calculateDeedDelivery(options,revision);
  if(calculated.retryable)return calculated;
  cache.set(key,calculated);
  while(cache.size>128)cache.delete(cache.keys().next().value);
 }
 return {...structuredClone(cache.get(key)),calculatedAt:options.now??Date.now()};
}
