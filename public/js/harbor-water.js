import {constructionInteractionPoint} from './construction-access.js';
import {SHIPPING_VESSELS,shippingVesselType} from './shipping-vessel-specs.js';
import {isTropicalIslandEnvironment,isIslandWalkable,islandShoreRadius,ISLAND_DOCKS} from './tropical-island-config.js';
export const RESORT_BOATS=Object.freeze(['resort-paddle-boat','resort-pontoon']);
export const HARBOR_BOATS=Object.freeze(['harbor-skiff','harbor-sailboat','harbor-yacht','harbor-patrol','harbor-fishing-boat',...RESORT_BOATS,...Object.keys(SHIPPING_VESSELS)]);
// Boat services share the normal harbor protocol without turning the resort's
// organic walking floor into a rectangular harbor or spawning harbor traffic.
export function harborForEnvironment(environment){
 if(!isTropicalIslandEnvironment(environment))return environment?.builderScene?.layoutMeta?.harbor||null;
 return {name:'Palm Coast Marina',extent:96,mainIsland:false,openWater:{x:62,z:0},islands:[],lakes:[],docks:[
  {id:'paddle-pier',name:'Paddle Pier',x:43,z:10,width:3.4,depth:12,approach:{x:53,z:10},entry:{x:60,z:10}},
  {id:'pontoon-club',name:'Pontoon Club',x:43,z:20,width:3.4,depth:11,approach:{x:57,z:20},entry:{x:63,z:20}}
 ],navigationNodes:Array.from({length:24},(_,index)=>{const a=index*Math.PI/12;return {x:61*Math.cos(a),z:49*Math.sin(a)};})};
}
export const harborLandPatches=harbor=>[...(harbor?.mainIsland===false?[]:[{x:0,z:0,width:256,depth:256}]),...(harbor?.islands||[])];
export const hasWalkableInterior=actor=>(actor?.modelId||actor?.asset?.buildAssetId)==='harbor-yacht';
export const isWatercraft=actor=>HARBOR_BOATS.includes(actor?.modelId||actor?.asset?.buildAssetId);
export function harborWaterAt(environment,point,margin=0){
 if(isTropicalIslandEnvironment(environment)){
  const x=Number(point?.x),z=Number(point?.z),padding=Math.max(0,Number(margin)||0);
  if(!Number.isFinite(x)||!Number.isFinite(z)||Math.hypot(x,z)>96-padding)return false;
  if(isIslandWalkable(x,z))return false;
  if(ISLAND_DOCKS.some(d=>x>=d.minX-padding&&x<=d.maxX+padding&&z>=d.minZ-padding&&z<=d.maxZ+padding))return false;
  const angle=Math.atan2(z/34,x/45),shore=islandShoreRadius(angle);
  return Math.hypot(x/(45+padding),z/(34+padding))>shore;
 }
 const harbor=environment?.builderScene?.layoutMeta?.harbor;if(!harbor)return false;
 const {x,z}=point,extent=harbor.extent||256;if(Math.abs(x)>extent-margin||Math.abs(z)>extent-margin)return false;
 const patches=harborLandPatches(harbor);
 return (harbor.lakes||[]).some(p=>Math.abs(x-p.x)<p.width/2-margin&&Math.abs(z-p.z)<p.depth/2-margin)||!patches.some(p=>Math.abs(x-p.x)<=p.width/2+margin&&Math.abs(z-p.z)<=p.depth/2+margin);
}
export const watercraftSize=actor=>shippingVesselType(actor)?[shippingVesselType(actor).beam/2,shippingVesselType(actor).length/2]:(actor?.modelId||actor?.asset?.buildAssetId)==='resort-pontoon'?[1.85,3.25]:(actor?.modelId||actor?.asset?.buildAssetId)==='resort-paddle-boat'?[.95,1.7]:(actor?.modelId||actor?.asset?.buildAssetId)==='harbor-yacht'?[6,21]:(actor?.modelId||actor?.asset?.buildAssetId)==='harbor-patrol'?[1.5,3.9]:(actor?.modelId||actor?.asset?.buildAssetId)==='harbor-fishing-boat'?[1.35,3.15]:[1,2.4];
export function watercraftFootprint(point,yaw=0,actor=null){
 const sin=Math.sin(yaw),cos=Math.cos(yaw),[w,l]=shippingVesselType(actor)||['harbor-yacht','harbor-fishing-boat',...RESORT_BOATS].includes(actor?.modelId||actor?.asset?.buildAssetId)?watercraftSize(actor):(actor?.modelId||actor?.asset?.buildAssetId)==='harbor-patrol'?[1.35,3.7]:[.9,2];
 const points=[[0,0],[-w,-l],[w,-l],[-w,l],[w,l]];if(w>1)points.push([-w,0],[w,0],[0,-l],[0,l]);
 // A long freighter can straddle a narrow point of land between its corners.
 // Probe both rails every four metres as well as the bow and stern.
 if(shippingVesselType(actor))for(let z=-l+4;z<l;z+=4)points.push([-w,z],[0,z],[w,z]);
 return points.map(([x,z])=>({x:point.x+x*cos+z*sin,z:point.z-x*sin+z*cos}));
}
// Separating-axis test for complete oriented hulls, including occupied boats.
export function watercraftOverlap(a,yawA,b,yawB,padding=.12,actorA=null,actorB=null){
 const axes=yaw=>[{x:Math.cos(yaw),z:-Math.sin(yaw)},{x:Math.sin(yaw),z:Math.cos(yaw)}],first=axes(yawA),second=axes(yawB),delta={x:b.x-a.x,z:b.z-a.z},dot=(u,v)=>u.x*v.x+u.z*v.z;
 const [aw,al]=watercraftSize(actorA),[bw,bl]=watercraftSize(actorB);
 return [...first,...second].every(axis=>Math.abs(dot(delta,axis))<Math.abs(dot(first[0],axis))*(aw+padding)+Math.abs(dot(first[1],axis))*(al+padding)+Math.abs(dot(second[0],axis))*(bw+padding)+Math.abs(dot(second[1],axis))*(bl+padding));
}
// On deck, E belongs at the actual helm. The berth remains boardable from its pier.
export function watercraftInteractionPoint(actor,feet){
 const position=constructionInteractionPoint(actor,feet);if(position!==actor?.position)return position;if(!position||!hasWalkableInterior(actor)||!feet)return position;
 const yaw=actor.rotation?.y||0,dx=feet.x-position.x,dz=feet.z-position.z,x=dx*Math.cos(yaw)-dz*Math.sin(yaw),z=dx*Math.sin(yaw)+dz*Math.cos(yaw);
 if(feet.y>=position.y+1.8&&Math.abs(x)<=5.2&&z>=-16&&z<=18)return {x:position.x-Math.sin(yaw)*9,y:position.y+5.025,z:position.z-Math.cos(yaw)*9};
 return position;
}
export function watercraftInteractionReach(actor,feet,reach=5){
 return hasWalkableInterior(actor)?watercraftInteractionPoint(actor,feet)!==actor.position?3:Math.min(24,reach):shippingVesselType(actor)?Math.min(16,reach):Math.min(5,reach);
}
