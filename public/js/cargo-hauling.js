import {ROAD_VEHICLES,roadVehicleId} from './road-vehicles.js';
import {roadNetwork,roadPath} from './road-network.js';
export const TRAILER_ID='utility-cargo-trailer';
export const isCargoTrailer=actor=>roadVehicleId(actor)===TRAILER_ID;
export const isPickup=actor=>roadVehicleId(actor)==='frontier-pickup';
export const ROAD_ASSETS={...ROAD_VEHICLES,[TRAILER_ID]:{name:'Frontier Tandem Cargo Trailer',width:2.1,length:4.8}};
export const cargoCapacity=actor=>isPickup(actor)?4:isCargoTrailer(actor)?8:0;
const hubCache=new WeakMap();
export function freightHubs(environment){
 if(!environment||typeof environment!=='object')return [];
 const network=roadNetwork(environment);const cached=hubCache.get(environment);if(cached?.network===network)return cached.hubs;if(network.nodes.length<2)return [];
 const connected=network.nodes.filter((_,i)=>roadPath(network,0,i).length),end=connected.at(-1);if(!end||Math.hypot(end.x-connected[0].x,end.z-connected[0].z)<12)return [];
 const chosen=[connected[Math.min(1,connected.length-1)],connected[Math.floor(connected.length/2)],connected[Math.max(0,connected.length-2)]],names=environment?.airport?.enabled?['Airport freight depot','Terminal supply bay','Air cargo shipping']:environment?.builderScene?.layoutMeta?.harbor?['Harbor freight depot','Dockside loading bay','Quayside shipping']:['Freight depot','Community supply bay','Shipping yard'];
 const hubs=chosen.map((node,i)=>{const index=network.nodes.indexOf(node),next=network.nodes[node.links[0]],dx=(next?.x??node.x)-node.x,dz=(next?.z??node.z+1)-node.z,len=Math.hypot(dx,dz)||1;return {id:'freight-hub-'+i,name:names[i],x:node.x-dz/len*5.5,y:node.y||0,z:node.z+dx/len*5.5,roadIndex:index,kind:'freight',icon:'▤',description:'Park within 9 m · load, stack and secure crates · shipping dispatch'};});for(const item of environment.builderScene?.objects||[])if((item.asset?.buildAssetId||item.modelId)==='freight-loading-bay'&&item.position)hubs.push({id:item.id,name:item.name||'Custom freight bay',...item.position,kind:'freight',icon:'▤',description:'Custom loading and shipping station'});hubCache.set(environment,{network,hubs});return hubs;
}
export function trailerPose(truck,trailer,dt){
 const yaw=truck.rotation?.y||0,hitch={x:truck.position.x+Math.sin(yaw)*2.85,z:truck.position.z+Math.cos(yaw)*2.85},dx=hitch.x-trailer.position.x,dz=hitch.z-trailer.position.z;
 let heading=trailer.rotation?.y||yaw;if(Math.hypot(dx,dz)>.01){const desired=Math.atan2(-dx,-dz),error=Math.atan2(Math.sin(desired-heading),Math.cos(desired-heading));heading+=Math.max(-2*dt,Math.min(2*dt,error));}
 return {position:{x:hitch.x+Math.sin(heading)*2.6,y:truck.position.y,z:hitch.z+Math.cos(heading)*2.6},rotation:{x:0,y:heading,z:0}};
}

export function trailerOverlap(trailer,position,radius=.8){const yaw=trailer.rotation?.y||0,dx=position.x-trailer.position.x,dz=position.z-trailer.position.z;return Math.abs(Math.cos(yaw)*dx-Math.sin(yaw)*dz)<1.05+radius&&Math.abs(Math.sin(yaw)*dx+Math.cos(yaw)*dz)<2.4+radius;}
