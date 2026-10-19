import {RANGED_WEAPONS} from './game-weapons.js';
import {FIRING_RANGE_ROOM_WALLS} from './firing-range-model.js';

export const RANGE_COURSES=Object.freeze({
 freeplay:Object.freeze({seconds:null,shots:null}),
 precision:Object.freeze({seconds:45,shots:12}),
 rapid:Object.freeze({seconds:30,shots:20}),
 endurance:Object.freeze({seconds:90,shots:40}),
});
export const RANGE_WEAPONS=Object.freeze({...RANGED_WEAPONS,flamethrower:Object.freeze({range:12,interval:.08,score:1})});
export const isRangeMap=(environment={})=>(environment.builderScene?.layout||environment.layout)==='firing-range'||environment.game==='firing-range'||environment.id==='firing-range';
export const rangeSettings=({course,weapon}={})=>({course:Object.hasOwn(RANGE_COURSES,course)?course:'freeplay',weapon:Object.hasOwn(RANGE_WEAPONS,weapon)?weapon:'laser'});

const groundHeight=(x,z)=>.28*Math.sin(x*.31)*Math.cos(z*.27)*.18;
const box=(size,x,y,z,extra={})=>({min:{x:x-size[0]/2,y:y+groundHeight(x,z)-size[1]/2,z:z-size[2]/2},max:{x:x+size[0]/2,y:y+groundHeight(x,z)+size[1]/2,z:z+size[2]/2},...extra});
// Scoring plates and rear silhouettes match the procedural range. Shared
// courses keep the rear targets at home positions for synchronized scoring.
export const RANGE_TARGETS=Object.freeze([-14,-7,0,7,14].flatMap((x,lane)=>[
 box([1.55,1.55,.08],x,1.55,-13.7,{lane,zone:'outer',points:25}),
 box([1.05,1.05,.1],x,1.55,-13.62,{lane,zone:'body',points:60}),
 box([.48,.48,.12],x,1.55,-13.54,{lane,zone:'bullseye',points:100}),
 box([.85,1.25,.16],x,1.35,-15.45,{lane,zone:'body',points:60}),
 box([1.4,.28,.16],x,1.72,-15.45,{lane,zone:'body',points:60}),
]));
const obstacles=[box([39,3.5,.5],0,1.75,-19),...[-19,19].map(x=>box([.5,3.5,38],x,1.75,0)),...FIRING_RANGE_ROOM_WALLS.map(({size,x,y,z})=>box(size,x,y,z))];
for(let z=-14;z<=10;z+=6)obstacles.push(box([38,.28,1.1],0,3.3,z));
for(const x of [-14,-7,0,7,14]){if(x<14)obstacles.push(box([.18,2.35,15],x+3.5,1.175,5));obstacles.push(box([4.6,.85,1.05],x,.425,12.5));}
export function rangeRayDistance(origin,direction,target){
 let near=0,far=Infinity;
 for(const axis of ['x','y','z']){const o=origin[axis],d=direction[axis];if(Math.abs(d)<1e-9){if(o<target.min[axis]||o>target.max[axis])return null;continue;}const a=(target.min[axis]-o)/d,b=(target.max[axis]-o)/d;near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));if(far<near)return null;}
 return near;
}
export function scoreRangeRay(origin,direction,weapon='laser'){
 const miss={hit:false,zone:null,lane:null,points:0},profile=RANGE_WEAPONS[weapon];
 if(!profile||![origin,direction].every(vector=>vector&&['x','y','z'].every(axis=>Number.isFinite(vector[axis]))))return miss;
 if(Math.abs(origin.x)>18.75||origin.y<.1||origin.y>3.5||origin.z< -18.75||origin.z>27.2)return miss;
 const length=Math.hypot(direction.x,direction.y,direction.z);if(length<1e-6)return miss;
 const aim=Object.fromEntries(['x','y','z'].map(axis=>[axis,direction[axis]/length]));
 let nearest=profile.range,hit=null;
 for(const target of RANGE_TARGETS){const distance=rangeRayDistance(origin,aim,target);if(distance!==null&&distance<=nearest){nearest=distance;hit=target;}}
 if(!hit||obstacles.some(obstacle=>{const distance=rangeRayDistance(origin,aim,obstacle);return distance!==null&&distance<nearest;}))return miss;
 return {hit:true,zone:hit.zone,lane:hit.lane,points:Math.round(hit.points*profile.score)};
}
