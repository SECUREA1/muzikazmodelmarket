export const HARBOR_BOATS=Object.freeze(['harbor-skiff','harbor-sailboat']);
export const isWatercraft=actor=>HARBOR_BOATS.includes(actor?.modelId||actor?.asset?.buildAssetId);
export function harborWaterAt(environment,point,margin=0){
 const harbor=environment?.builderScene?.layoutMeta?.harbor;if(!harbor)return false;
 const {x,z}=point,extent=harbor.extent||256;if(Math.abs(x)>extent-margin||Math.abs(z)>extent-margin)return false;
 const patches=[{x:0,z:0,width:256,depth:256},...(harbor.islands||[])];
 return !patches.some(p=>Math.abs(x-p.x)<=p.width/2+margin&&Math.abs(z-p.z)<=p.depth/2+margin);
}
export function watercraftFootprint(point,yaw=0){
 const sin=Math.sin(yaw),cos=Math.cos(yaw);
 return [[0,0],[-.9,-2],[.9,-2],[-.9,2],[.9,2]].map(([x,z])=>({x:point.x+x*cos+z*sin,z:point.z-x*sin+z*cos}));
}
