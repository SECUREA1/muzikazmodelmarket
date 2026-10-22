/** Shared mechanical frames used by meshes, cameras and authoritative colliders.
 * Matrix arrays use the same column-major convention as THREE.Matrix4.
 */
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const clamp=(value,min,max,fallback=min)=>Math.max(min,Math.min(max,finite(value,fallback)));
export const CONSTRUCTION_GEOMETRY=Object.freeze({craneHeight:78,trolleyY:77.82,boomLength:3.8,stickLength:2.8,truckHinge:[0,1.5,3.7],truckArticulation:[0,0,-.6],bladeBase:.38});
const identity=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
export function constructionMatrix(position=[0,0,0],rotation=[0,0,0],scale=[1,1,1]){
 const [a,b,c,d,e,f]=[Math.cos(rotation[0]),Math.sin(rotation[0]),Math.cos(rotation[1]),Math.sin(rotation[1]),Math.cos(rotation[2]),Math.sin(rotation[2])],ae=a*e,af=a*f,be=b*e,bf=b*f;
 return [c*e*scale[0],(af+be*d)*scale[0],(bf-ae*d)*scale[0],0,-c*f*scale[1],(ae-bf*d)*scale[1],(be+af*d)*scale[1],0,d*scale[2],-b*c*scale[2],a*c*scale[2],0,...position,1];
}
export function constructionMultiply(a,b){const result=Array(16).fill(0);for(let col=0;col<4;col++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)result[col*4+row]+=a[k*4+row]*b[col*4+k];return result;}
export function constructionTransform(matrix,point){return {x:matrix[0]*point[0]+matrix[4]*point[1]+matrix[8]*point[2]+matrix[12],y:matrix[1]*point[0]+matrix[5]*point[1]+matrix[9]*point[2]+matrix[13],z:matrix[2]*point[0]+matrix[6]*point[1]+matrix[10]*point[2]+matrix[14]};}
const vec=value=>[finite(value?.x),finite(value?.y),finite(value?.z)];
export function constructionKinematics(actor={}){
 const id=actor.asset?.buildAssetId||actor.modelId,state=actor.construction||{},nodes={root:{position:[0,0,0],rotation:[0,0,0],matrix:identity()}},boxes=[];
 const frame=(name,parent,position,rotation=[0,0,0])=>{nodes[name]={parent,position,rotation,matrix:constructionMultiply(nodes[parent].matrix,constructionMatrix(position,rotation))};return name;};
 const box=(part,frame,size,position=[0,0,0],rotation=[0,0,0])=>boxes.push({part,frame,size,matrix:constructionMultiply(nodes[frame].matrix,constructionMatrix(position,rotation))});
 const local=(frame,position)=>{const point=constructionTransform(nodes[frame].matrix,position);return [point.x,point.y,point.z];};
 const segment=(part,a,b,radius)=>{
  const delta=b.map((value,index)=>value-a[index]),length=Math.hypot(...delta);if(length<.001)return;
  const y=delta.map(value=>value/length),hint=Math.abs(y[2])>.9?[1,0,0]:[0,0,1],cross=(u,v)=>[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],raw=cross(y,hint),span=Math.hypot(...raw),x=raw.map(value=>value/span),z=cross(x,y),center=a.map((value,index)=>(value+b[index])/2);
  boxes.push({part,frame:'root',size:[radius*2,length,radius*2],matrix:[...x,0,...y,0,...z,0,...center,1]});
 };
 if(id==='tower-crane'){
  frame('slew','root',[0,78,0],[0,finite(state.slew),0]);frame('trolley','slew',[0,-.18,clamp(state.trolley,4,42,21.47)]);
  frame('hook','trolley',[0,clamp(state.hoist,.8,74,.8)-77.82,0]);frame('cab','root',[3.4,.7,3.2]);
  box('crane-base','root',[6.4,.9,6.4],[0,.45,0]);box('crane-mast','root',[2.5,77,2.5],[0,39.5,0]);
  box('crane-jib','slew',[1.7,1.9,60],[0,.8,16]);box('crane-kingpost','slew',[.35,6,.35],[0,3,0]);box('crane-counterweights','slew',[2.3,1.9,4.5],[0,-.6,-11.3]);
  box('crane-service-cab','slew',[1.8,2,2.2],[1.7,-1.25,1.5]);box('crane-operator-station','cab',[2,2,2.1],[0,.85,0]);box('crane-trolley','trolley',[1.8,.55,1.2]);
  const rope=77.82-clamp(state.hoist,.8,74,.8);box('crane-hoist-rope','trolley',[.5,rope,.08],[0,-rope/2,0]);box('crane-hook','hook',[.9,1,.5],[0,-.1,0]);
 }else if(id==='site-dumptruck'){
  frame('front','root',CONSTRUCTION_GEOMETRY.truckArticulation,[0,-clamp(actor.driving?.steering,-1,1,0)*.35,0]);frame('cab','front',[-.48,1.35,-1.65]);frame('bed','root',CONSTRUCTION_GEOMETRY.truckHinge,[clamp(state.bed,0,.95,0),0,0]);frame('tailgate','bed',[0,1,.2],[-clamp(state.bed,0,.95,0),0,0]);
  box('truck-front-chassis','front',[2.8,1.1,3.4],[0,1.15,-1.7]);box('truck-rear-chassis','root',[2.65,.6,4.7],[0,1.05,1.8]);box('truck-cab','cab',[2,2.15,2.1],[0,.9,0]);box('truck-engine','front',[.8,1.2,2],[1,1.9,-1.65]);
  for(const x of [-1.42,1.42]){box('truck-front-wheel','front',[.6,1.5,1.5],[x,.74,-2.2]);for(const z of [1.5,3])box('truck-rear-wheel','root',[.6,1.5,1.5],[x,.74,z]);}
  box('truck-bed-floor','bed',[3.1,.25,5.2],[0,.1,-2.3]);for(const x of [-1.5,1.5])box('truck-bed-side','bed',[.3,1.2,5.2],[x,.6,-2.3]);box('truck-bed-headboard','bed',[3,.95,.2],[0,.55,-4.9]);box('truck-tailgate','tailgate',[2.9,.9,.13],[0,-.45,0]);
  for(const x of [-.7,.7])segment('truck-body-hoist',[x,1.1,-.5],local('bed',[x,.2,-2.5]),.16);
 }else if(id==='site-bulldozer'){
  frame('cab','root',[0,1.25,.55]);frame('blade','root',[0,.38+clamp(state.blade,0,1.2,1),-3]);
  box('dozer-chassis','root',[2.3,1.45,3.7],[0,1.2,0]);box('dozer-cab','cab',[1.9,1.8,2],[0,.75,0]);for(const x of [-1.209,1.209])box('dozer-track','root',[.82,1.1,4.7],[x,.52,0]);box('dozer-blade','blade',[4.35,1.2,.9],[0,.2,-.12]);
  for(const x of [-1.25,1.25]){segment('dozer-push-arm',[x,.8,1],local('blade',[x,.07,.2]),.16);segment('dozer-lift-ram',[x,1.5,-1.1],local('blade',[x,.27,.2]),.14);}
 }else if(id==='site-excavator'){
  frame('swing','root',[0,1.5,0],[0,finite(state.swing??state.slew),0]);frame('cab','swing',[-.78,.4,-.2]);frame('boom','swing',[.7,.5,-1],[clamp(state.boom,.3,1.3,.7)-1.6,0,0]);
  frame('stick','boom',[0,3.8,0],[clamp(state.stick,-1.5,-.2,-.8)-.5,0,0]);frame('bucket','stick',[0,2.8,0],[clamp(state.bucket,-1.2,1.2,0),0,0]);
  box('excavator-undercarriage','root',[2.7,.7,3.5],[0,1.05,0]);for(const x of [-1.248,1.248])box('excavator-track','root',[.82,1.1,4.5],[x,.52,0]);
  box('excavator-house','swing',[2.8,1.45,3.7],[0,.6,.3]);box('excavator-cab','cab',[1.4,1.9,2],[0,.8,0]);box('excavator-boom','boom',[.7,3.8,.65],[0,1.9,0]);box('excavator-stick','stick',[.6,2.8,.6],[0,1.4,0]);box('excavator-bucket','bucket',[1.3,1,1.8],[0,.05,-.35]);
  segment('excavator-boom-ram',local('swing',[.7,.5,-.2]),local('boom',[0,2.8,.22]),.14);segment('excavator-stick-ram',local('boom',[0,1.6,.25]),local('stick',[0,1.4,.18]),.14);segment('excavator-bucket-ram',local('stick',[0,1.45,.24]),local('bucket',[0,.3,.3]),.14);
 }
 const world=constructionMatrix(vec(actor.position),vec(actor.rotation),[finite(actor.scale?.x,1),finite(actor.scale?.y,1),finite(actor.scale?.z,1)]);
 return {id,nodes,boxes,world};
}
export function constructionCollisionBoxes(actor){const pose=constructionKinematics(actor);return pose.boxes.map(box=>{const matrix=constructionMultiply(pose.world,box.matrix);return {part:box.part,objectId:actor.id,matrix,center:constructionTransform(matrix,[0,0,0]),size:{x:box.size[0],y:box.size[1],z:box.size[2]}};});}
export function constructionJointPose(actor){const pose=constructionKinematics(actor),point=(name,position)=>pose.nodes[name]?constructionTransform(constructionMultiply(pose.world,pose.nodes[name].matrix),position):null;return {bucketTip:point('bucket',[0,-.16,-.95]),bucketPivot:point('bucket',[0,0,0]),boomPivot:point('boom',[0,0,0]),stickPivot:point('stick',[0,0,0]),bladeEdge:point('blade',[0,-.37,-.12]),bedFront:point('bed',[0,.1,-4.9]),hook:point('hook',[0,0,0])};}
export function constructionOperatorPose(actor){const pose=constructionKinematics(actor),cab=pose.nodes.cab;if(!cab)return null;const matrix=constructionMultiply(pose.world,cab.matrix);return {position:constructionTransform(matrix,[0,1.37,.25]),seat:constructionTransform(matrix,[0,.54,.25]),yaw:Math.atan2(matrix[8],matrix[10])};}
