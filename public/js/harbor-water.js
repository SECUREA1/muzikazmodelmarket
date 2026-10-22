export const HARBOR_BOATS=Object.freeze(['harbor-skiff','harbor-sailboat','harbor-yacht']);
export const hasWalkableInterior=actor=>(actor?.modelId||actor?.asset?.buildAssetId)==='harbor-yacht';
export const isWatercraft=actor=>HARBOR_BOATS.includes(actor?.modelId||actor?.asset?.buildAssetId);
export function harborWaterAt(environment,point,margin=0){
 const harbor=environment?.builderScene?.layoutMeta?.harbor;if(!harbor)return false;
 const {x,z}=point,extent=harbor.extent||256;if(Math.abs(x)>extent-margin||Math.abs(z)>extent-margin)return false;
 const patches=[{x:0,z:0,width:256,depth:256},...(harbor.islands||[])];
 return !patches.some(p=>Math.abs(x-p.x)<=p.width/2+margin&&Math.abs(z-p.z)<=p.depth/2+margin);
}
export const watercraftSize=actor=>(actor?.modelId||actor?.asset?.buildAssetId)==='harbor-yacht'?[6,21]:[1,2.4];
export function watercraftFootprint(point,yaw=0,actor=null){
 const sin=Math.sin(yaw),cos=Math.cos(yaw),[w,l]=(actor?.modelId||actor?.asset?.buildAssetId)==='harbor-yacht'?watercraftSize(actor):[.9,2];
 const points=[[0,0],[-w,-l],[w,-l],[-w,l],[w,l]];if(w>1)points.push([-w,0],[w,0],[0,-l],[0,l]);
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
 const position=actor?.position;if(!position||!hasWalkableInterior(actor)||!feet)return position;
 const yaw=actor.rotation?.y||0,dx=feet.x-position.x,dz=feet.z-position.z,x=dx*Math.cos(yaw)-dz*Math.sin(yaw),z=dx*Math.sin(yaw)+dz*Math.cos(yaw);
 if(feet.y>=position.y+1.8&&Math.abs(x)<=5.2&&z>=-16&&z<=18)return {x:position.x-Math.sin(yaw)*9,y:position.y+5.025,z:position.z-Math.cos(yaw)*9};
 return position;
}
export function watercraftInteractionReach(actor,feet,reach=5){
 return hasWalkableInterior(actor)?watercraftInteractionPoint(actor,feet)!==actor.position?3:Math.min(24,reach):Math.min(5,reach);
}
