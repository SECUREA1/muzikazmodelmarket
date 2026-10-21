import {isAircraft} from './aircraft-flight.js';
export const AIRCRAFT_HEALTH=400;
export const AIRCRAFT_GUN_RANGE=300;
export function aircraftRayDistance(aircraft,origin,direction){
 const yaw=aircraft.rotation?.y||0,c=Math.cos(yaw),s=Math.sin(yaw),scale=aircraft.scale||{x:1,y:1,z:1};
 const vector=(x,z)=>[c*x-s*z,s*x+c*z];const local=vector(origin.x-aircraft.position.x,origin.z-aircraft.position.z),ray=vector(direction[0],direction[2]);
 const start=[local[0],origin.y-aircraft.position.y,local[1]],aim=[ray[0],direction[1],ray[1]];
 const boxes=[[-.8,-.4,-3.8,.8,2.3,3.8],[-5.25,.1,-1.7,5.25,.9,.8],[-2.1,.5,2.5,2.1,1.4,4.1]];let nearest=null;
 for(const bounds of boxes){let near=0,far=Infinity;for(let axis=0;axis<3;axis++){const size=scale[['x','y','z'][axis]]||1,min=bounds[axis]*size,max=bounds[axis+3]*size;if(Math.abs(aim[axis])<1e-8){if(start[axis]<min||start[axis]>max){far=-1;break;}}else{let a=(min-start[axis])/aim[axis],b=(max-start[axis])/aim[axis];if(a>b)[a,b]=[b,a];near=Math.max(near,a);far=Math.min(far,b);}}if(far>=near&&far>0&&(nearest===null||near<nearest))nearest=near;}
 return nearest;
}
export function aircraftAimTarget(actors,selfId,origin,direction){
 return Object.values(actors||{}).filter(a=>a.id!==selfId&&isAircraft(a)&&a.active!==false&&a.health>0).map(aircraft=>({aircraft,distance:aircraftRayDistance(aircraft,origin,direction)})).filter(target=>target.distance!==null&&target.distance<=AIRCRAFT_GUN_RANGE).sort((a,b)=>a.distance-b.distance)[0]||null;
}
