import {harborWaterAt,watercraftFootprint,watercraftOverlap,isWatercraft} from './harbor-water.js';
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const wrap=value=>Math.atan2(Math.sin(value),Math.cos(value));
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export function harborApproach(environment,id,boat=null){
 const harbor=environment?.builderScene?.layoutMeta?.harbor;if(!harbor)return null;
 if(id==='open-water')return {id,name:'Open-water passage',x:184,z:80};
 if(id==='marina'&&boat?.modelId==='harbor-yacht')return {id,name:'Superyacht Marina Approach',x:170,z:99,entry:{x:225,z:99}};
 if(id==='marina')return {id,name:'Neon Marina approach',x:153,z:64};
 const dock=(harbor.docks||[]).find(value=>value.id===id);if(dock){const yacht=boat?.modelId==='harbor-yacht';return {id,name:dock.name,...(yacht?dock.yachtApproach:dock.approach),entry:yacht?dock.yachtEntry:dock.entry};}
 const island=(harbor.islands||[]).find(value=>value.id===id);if(!island)return null;
 return {id,name:island.name+' approach',x:island.x-island.width/2-8,z:island.z-12};
}
function hullClear(environment,boat,point,yaw,actors,margin=.35){
 return watercraftFootprint(point,yaw,boat).every(vertex=>harborWaterAt(environment,vertex,margin))&&!Object.values(actors).some(other=>other.id!==boat.id&&other.active!==false&&isWatercraft(other)&&watercraftOverlap(point,yaw,other.position,other.rotation?.y||0,.18,boat,other));
}
function legClear(environment,boat,from,to,actors,blocked,margin){
 const span=distance(from,to),yaw=Math.atan2(from.x-to.x,from.z-to.z),steps=Math.max(1,Math.ceil(span/2));
 for(let index=0;index<=steps;index++){const ratio=index/steps,point={x:from.x+(to.x-from.x)*ratio,z:from.z+(to.z-from.z)*ratio};if(!harborWaterAt(environment,point,margin)||!hullClear(environment,boat,point,yaw,actors))return false;}
 return !blocked({...from,y:0},{...to,y:0},yaw);
}
// Plan once along the coastline; physical sweeps reject piers and placed pieces.
export function planBoatNavigation(boat,environment,{destinationId='open-water',actors={},blocked=()=>false,depart=false}={}){
 const goal=harborApproach(environment,destinationId,boat);if(!goal)return null;
 const harbor=environment.builderScene.layoutMeta.harbor,prefix=[],point={x:finite(boat.position?.x),z:finite(boat.position?.z)};
 const yacht=boat.modelId==='harbor-yacht',departureDock=(harbor.docks||[]).find(dock=>distance(point,yacht?dock.yachtApproach:dock.approach)<5);
 const berth=(environment.builderScene.objects||[]).filter(isWatercraft).map(value=>({value,span:distance(value.position,point)})).sort((a,b)=>a.span-b.span)[0];
 if(depart||berth?.span<3||departureDock){
  if(yacht&&point.x<151&&point.x>134&&point.z>80&&point.z<125){prefix.push({x:225,z:99,radius:4,gear:1,departureArc:true});}
  else if(yacht&&departureDock){const entry=departureDock.yachtEntry;prefix.push({...entry,radius:2,gear:-1},{x:entry.x+(departureDock.width>10?0:60),z:entry.z+(departureDock.width>10?-55:0),radius:4,gear:1});}
  else if(point.x>135&&point.x<151&&point.z>16&&point.z<49){
   const north=point.z<24,gear=-Math.sin(boat.rotation?.y||0)<-.7?-1:1;
   prefix.push({x:north?149:151,z:point.z,radius:.8,gear},{x:153,z:north?-14:68,radius:3.3,gear});
  }else{
   const island=(harbor.islands||[]).find(value=>Math.abs(point.z-(value.z-4))<9&&Math.abs(point.x-(value.x-value.width/2-3))<9);
   if(island)prefix.push({x:island.x-island.width/2-10,z:island.z-island.depth/2-14,radius:3.3,gear:1});
  }
 }
 const start=prefix.at(-1)||point,nodes=[start,goal.entry||goal],patches=[{x:0,z:0,width:256,depth:256},...(harbor.islands||[])];
 const cornerMargin=yacht?34:10;
 for(const dock of harbor.docks||[])for(const sx of [-1,1])for(const sz of [-1,1]){const vertex={x:dock.x+sx*(dock.width/2+cornerMargin),z:dock.z+sz*(dock.depth/2+cornerMargin)};if(harborWaterAt(environment,vertex,2.8))nodes.push(vertex);}
 for(const patch of patches)for(const sx of [-1,1])for(const sz of [-1,1]){const vertex={x:patch.x+sx*(patch.width/2+cornerMargin),z:patch.z+sz*(patch.depth/2+cornerMargin)};if(harborWaterAt(environment,vertex,2.8))nodes.push(vertex);}
 const costs=nodes.map(()=>Infinity),previous=nodes.map(()=>-1),done=new Set(),edges=new Map();costs[0]=0;
 for(let iteration=0;iteration<nodes.length;iteration++){
  let current=-1;for(let index=0;index<nodes.length;index++)if(!done.has(index)&&(current<0||costs[index]<costs[current]))current=index;
  if(current<0||!Number.isFinite(costs[current]))break;if(current===1)break;done.add(current);
  for(let next=0;next<nodes.length;next++){
   if(done.has(next)||next===current)continue;
   const key=[Math.min(current,next),Math.max(current,next)].join(':'),margin=current<2||next<2?.35:9.5;
   if(!edges.has(key))edges.set(key,legClear(environment,boat,nodes[current],nodes[next],actors,blocked,margin));
   if(!edges.get(key))continue;const cost=costs[current]+distance(nodes[current],nodes[next]);if(cost<costs[next]){costs[next]=cost;previous[next]=current;}
  }
 }
 if(!Number.isFinite(costs[1]))return null;
 const route=[];for(let index=1;index>0;index=previous[index]){if(index<0)return null;route.unshift({x:nodes[index].x,z:nodes[index].z,radius:3.3,gear:1});}
 if(goal.entry){if(!legClear(environment,boat,goal.entry,goal,actors,blocked,.35))return null;route.push({x:goal.x,z:goal.z,radius:2.3,gear:1});}
 const points=[...prefix,...route];if(points.length)points[points.length-1].radius=2.3;
 return {points,destinationId:goal.id,name:goal.name};
}
export function navigationControls(boat,input,environment,actors,blocked){
 const state=boat.boating,route=state.assistRoute||[];let index=Math.max(0,state.routeIndex||0),point=route[index];
 if(!point)return null;
 while(index<route.length-1&&distance(boat.position,point)<(point.radius||3.3)){point=route[++index];}
 state.routeIndex=index;state.routeLength=route.length;state.remainingDistance=distance(boat.position,point);for(let next=index+1;next<route.length;next++)state.remainingDistance+=distance(route[next-1],route[next]);
 const last=index===route.length-1,span=distance(boat.position,point),speed=Math.abs(state.speed||0),gear=point.gear||1;
 const target=Math.atan2(boat.position.x-point.x,boat.position.z-point.z)+(gear<0?Math.PI:0),error=wrap(target-(boat.rotation?.y||0));
 state.assistStage=index<2&&state.assist==='launch'?'departure':'passage';
 const common={...input,forward:0,side:0,rudder:0,anchor:false,brake:false};
 if((state.speed||0)*gear<-.15)return {...common,throttle:0,brake:true};
 if(last&&span<2.3){state.assistStage=speed<.15?'arrived':'arrival';return {...common,throttle:0,brake:true,anchor:speed<.15};}
 if(boat.modelId==='harbor-yacht'&&!point.departureArc&&Math.abs(error)>.12){state.assistStage='maneuvering';return {...common,throttle:0,brake:speed>.12,side:-clamp(error*2,-1,1),bowThruster:speed<=.12};}
 const desired=Math.min(last?3.4:2.5,Math.abs(error)>.5?1.8:4,last?Math.max(0,(span-1)*.6):10),drag=1.8*desired+.023*desired*desired,force=(boat.modelId||boat.asset?.buildAssetId)==='harbor-sailboat'?8:18;
 const throttle=gear*clamp((drag+(desired-speed)*3)/force,0,.5),rudder=-clamp(error*1.7,-1,1)*gear;
 // Follow a short turning arc; occupied traffic retains the route and waits.
 const forecast=Math.max(1.2,speed*speed/14+speed*.35),steps=Math.ceil(forecast/.5),step=forecast/steps;
 let position={...boat.position},yaw=boat.rotation?.y||0,clear=true;
 for(let n=0;n<steps;n++){
  const nextYaw=yaw-rudder*((boat.modelId||boat.asset?.buildAssetId)==='harbor-yacht'?.035:(boat.modelId||boat.asset?.buildAssetId)==='harbor-sailboat'?.16:.2)*step*gear,next={x:position.x-Math.sin(nextYaw)*step*gear,y:0,z:position.z-Math.cos(nextYaw)*step*gear};
  if(!hullClear(environment,boat,next,nextYaw,actors)||blocked(position,next,nextYaw)){clear=false;break;}position=next;yaw=nextYaw;
 }
 if(!clear){state.assistStage='waiting';state.navigationWarning='Passage occupied — holding position';return {...common,throttle:0,brake:true};}
 state.navigationWarning='';
 const windAngle=Math.abs(wrap((boat.rotation?.y||0)+(state.windDirection||35)*Math.PI/180));
 return {...common,throttle,side:rudder,sailTrim:clamp(windAngle/Math.PI,.12,.95)};
}
