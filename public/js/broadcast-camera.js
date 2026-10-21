// Fit the authored play area at a consistent elevated, level sideline angle.
const finite=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
export function broadcastCameraPose({target=[0,0,0],width=24,depth=24,height=3,aspect=1.6,yaw=0,zoom=1,fov=55}={}){
 target=target.map(value=>finite(value,0));aspect=Math.max(.3,Math.min(4,finite(aspect,1.6)));yaw=finite(yaw,0);zoom=Math.max(.35,Math.min(4,finite(zoom,1)));
 width=Math.max(.1,finite(width,24));depth=Math.max(.1,finite(depth,24));height=Math.max(0,finite(height,3));
 const angle=55*Math.PI/180,sin=Math.sin(angle),cos=Math.cos(angle),sy=Math.sin(yaw),cy=Math.cos(yaw),tan=Math.tan(fov*Math.PI/360);
 let distance=1;
 for(const x of [-width/2,width/2])for(const y of [-height/2,height/2])for(const z of [-depth/2,depth/2]){
  const right=x*cy-z*sy,along=x*sy+z*cy,up=y*cos-along*sin,toward=y*sin+along*cos;
  distance=Math.max(distance,Math.abs(right)/(tan*aspect)+toward,Math.abs(up)/tan+toward);
 }
 distance*=1.1*zoom;
 return {position:[target[0]+sy*cos*distance,target[1]+sin*distance,target[2]+cy*cos*distance],target,up:[0,1,0],fov};
}
