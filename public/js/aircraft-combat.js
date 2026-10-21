import * as THREE from '../vendor/three/three.module.min.js';
import {isAircraft} from './aircraft-flight.js';
export const AIRCRAFT_HEALTH=400;
export const AIRCRAFT_GUN_RANGE=300;
export function aircraftRayDistance(aircraft,origin,direction){
 const rotation=aircraft.rotation||{},scale=aircraft.scale||{x:1,y:1,z:1},inverse=new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation.x||0,rotation.y||0,rotation.z||0,'YXZ')).invert();
 const local=new THREE.Vector3(origin.x-aircraft.position.x,origin.y-aircraft.position.y,origin.z-aircraft.position.z).applyQuaternion(inverse),ray=new THREE.Vector3(...direction).applyQuaternion(inverse);
 const start=local.toArray(),aim=ray.toArray();
 const boxes=[[-.8,-.4,-3.8,.8,2.3,3.8],[-5.25,.1,-1.7,5.25,.9,.8],[-2.1,.5,2.5,2.1,1.4,4.1]];let nearest=null;
 for(const bounds of boxes){let near=0,far=Infinity;for(let axis=0;axis<3;axis++){const size=scale[['x','y','z'][axis]]||1,min=bounds[axis]*size,max=bounds[axis+3]*size;if(Math.abs(aim[axis])<1e-8){if(start[axis]<min||start[axis]>max){far=-1;break;}}else{let a=(min-start[axis])/aim[axis],b=(max-start[axis])/aim[axis];if(a>b)[a,b]=[b,a];near=Math.max(near,a);far=Math.min(far,b);}}if(far>=near&&far>0&&(nearest===null||near<nearest))nearest=near;}
 return nearest;
}
export function aircraftGunPose(aircraft){
 const rotation=aircraft.rotation||{},orientation=new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation.x||0,rotation.y||0,rotation.z||0,'YXZ'));
 const origin=new THREE.Vector3(0,1,-4.3).multiply(new THREE.Vector3(aircraft.scale?.x||1,aircraft.scale?.y||1,aircraft.scale?.z||1)).applyQuaternion(orientation).add(new THREE.Vector3(aircraft.position.x,aircraft.position.y,aircraft.position.z)),direction=new THREE.Vector3(0,0,-1).applyQuaternion(orientation);
 return {origin:{x:origin.x,y:origin.y,z:origin.z},direction:direction.toArray()};
}
export function aircraftAimTarget(actors,selfId,origin,direction){
 return Object.values(actors||{}).filter(a=>a.id!==selfId&&isAircraft(a)&&a.active!==false&&a.health>0).map(aircraft=>({aircraft,distance:aircraftRayDistance(aircraft,origin,direction)})).filter(target=>target.distance!==null&&target.distance<=AIRCRAFT_GUN_RANGE).sort((a,b)=>a.distance-b.distance)[0]||null;
}
