// Smooth presentation between server updates without changing authoritative gameplay.
export function createGameSnapshotMotion({duration=100,snapDistance=12}={}){
 let target=null,from=null,started=0;
 const point=(a,b,t)=>{
  if(!a||!b||typeof b!=='object')return b;
  const distance=Math.hypot(...['x','y','z'].map(key=>Number.isFinite(b[key])&&Number.isFinite(a[key])?b[key]-a[key]:0));
  if(distance>snapDistance)return b;
  const result={...b};
  for(const key of ['x','y','z','height','yaw'])if(Number.isFinite(a[key])&&Number.isFinite(b[key])){
   let difference=b[key]-a[key];if(key==='yaw')difference=Math.atan2(Math.sin(difference),Math.cos(difference));
   result[key]=a[key]+difference*t;
  }
  return result;
 };
 const blend=(a,b,t)=>{
  if(!a||!b||a.phase!==b.phase)return b;
  const result={...b};
  for(const key of ['players','referees','balls','targets'])if(Array.isArray(b[key]))result[key]=b[key].map((item,index)=>point(item.id===undefined?a[key]?.[index]:a[key]?.find(previous=>previous.id===item.id),item,t));
  for(const key of ['puck','ball','shot','pointer','opponent'])if(b[key]&&typeof b[key]==='object')result[key]=point(a[key],b[key],t);
  if(b.basketball)result.basketball=blend(a.basketball,b.basketball,t);
  return result;
 };
 return {
  push(next,now){from=this.sample(now);target=next;started=now;},
  sample(now){return blend(from,target,Math.max(0,Math.min(1,(now-started)/duration)));},
  reset(){target=from=null;started=0;}
 };
}
