// Shared resort coordinates and snow surface: rendering, server physics and maps.
export const SKI_SIZE=1200;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const skiRuns=[
 {id:'pine-trail',name:'Pine Trail · Beginner',color:0x35c98a,x:-110,width:48,sway:28},
 {id:'glacier-run',name:'Glacier Run · Intermediate',color:0x439fff,x:0,width:55,sway:12},
 {id:'black-diamond',name:'Black Diamond · Expert',color:0x292947,x:110,width:40,sway:22},
 {id:'terrain-park',name:'Freestyle Terrain Park',color:0xffa547,x:195,width:36,sway:0}
];
export const skiLifts=[{id:'summit-express',name:'Summit Express Chairlift',from:{x:-185,z:305},to:{x:-185,z:-405},duration:70},{id:'park-lift',name:'Terrain Park Chairlift',from:{x:240,z:300},to:{x:240,z:-100},duration:45}];
export const skiRamps=[{x:195,z:150,length:32,height:3.5,width:14},{x:195,z:25,length:38,height:5,width:16},{x:195,z:-95,length:32,height:4,width:14}];
function naturalSkiHeight(x,z){
 const t=clamp((300-z)/700,0,1),hill=180*(t*t*(3-2*t));
 const ridge=Math.max(0,Math.abs(x)-270)/250;
 const back=clamp((-z-410)/190,0,1),crest=120*Math.exp(-(((x+25)/205)**2))*Math.sin(Math.PI*back);
 const wild=Math.min(1,ridge*2)*(Math.sin(x*.027+z*.011)*Math.cos(z*.019)*12+Math.sin(x*.071+z*.03)*3);
 let h=hill+ridge*ridge*(30+hill*.35)+crest+wild;
 return h;
}
export const skiGroundPads=[...skiLifts.flatMap(lift=>[lift.from,lift.to].map(p=>({...p,width:44,depth:36}))),{x:-245,z:-40,width:20,depth:16}];
export function skiHeight(x,z){
 let h=naturalSkiHeight(x,z);
 for(const pad of skiGroundPads){const edge=Math.max(Math.abs(x-pad.x)-pad.width/2,Math.abs(z-pad.z)-pad.depth/2),blend=clamp(1-edge/10,0,1);if(blend>0){const smooth=blend*blend*(3-2*blend);h=h*(1-smooth)+naturalSkiHeight(pad.x,pad.z)*smooth;}}
 for(const ramp of skiRamps){const u=(z-(ramp.z-ramp.length/2))/ramp.length,lateral=clamp((ramp.width/2+3-Math.abs(x-ramp.x))/3,0,1);if(lateral>0&&u>=0&&u<=1)h+=ramp.height*Math.sin(Math.PI*u)**2*lateral;}
 return h;
}
export function skiBoardingPoint(lift){return {x:lift.from.x+10,y:skiHeight(lift.from.x+10,lift.from.z+9),z:lift.from.z+9};}
export function nearestSkiLift(point,reach=20){return skiLifts.map(lift=>({lift,distance:Math.hypot(point.x-skiBoardingPoint(lift).x,point.z-skiBoardingPoint(lift).z),height:Math.abs(point.y-skiBoardingPoint(lift).y)})).filter(hit=>hit.distance<=reach&&hit.height<3).sort((a,b)=>a.distance-b.distance)[0]?.lift||null;}
export function skiExitPoint(lift){return {x:lift.to.x+13,y:skiHeight(lift.to.x+13,lift.to.z+8)+.08,z:lift.to.z+8};}
export function skiCourseStart(run){return {x:skiRunX(run,run.id==='terrain-park'?-120:-380),z:run.id==='terrain-park'?-120:-380};}
export function skiCourseGates(run){const start=run.id==='terrain-park'?-60:-300,count=run.id==='terrain-park'?5:8;return Array.from({length:count},(_,i)=>{const z=start+(280-start)*i/(count-1);return {x:skiRunX(run,z),z,width:run.width,y:skiHeight(skiRunX(run,z),z)};});}
export function skiRunX(run,z){return run.x+Math.sin((300-z)/700*Math.PI*2)*run.sway;}
export function liftPosition(lift,progress){const u=clamp(progress,0,1),t=u*u*(3-2*u),x=lift.from.x+(lift.to.x-lift.from.x)*t,z=lift.from.z+(lift.to.z-lift.from.z)*t;return {x,y:skiHeight(x,z)+1.1+3.9*Math.sin(Math.PI*u),z};}
export function startSkiLift(player,lift,now){player.skiLift={id:lift.id,progress:0,startedAt:Number.isFinite(now)?now:null,boardingFrom:{...player.position}};player.skiRace=null;player.skiing=false;player.skiSpeed=0;player.skiHeading=null;player.velocityY=0;player.grounded=false;player.input={};player.yaw=0;player.movementRevision=(player.movementRevision||0)+1;}
export function stepSkiLift(player,dt,now){const lift=skiLifts.find(l=>l.id===player.skiLift?.id);if(!lift)return false;const ride=player.skiLift;ride.progress=clamp(Number.isFinite(now)&&Number.isFinite(ride.startedAt)?(now-ride.startedAt)/(lift.duration*1000):ride.progress+dt/lift.duration,0,1);const pose=liftPosition(lift,ride.progress),blend=clamp(ride.progress/.045,0,1),ease=blend*blend*(3-2*blend),from=ride.boardingFrom||pose;player.position={x:from.x+(pose.x-from.x)*ease,y:from.y+(pose.y-from.y)*ease,z:from.z+(pose.z-from.z)*ease};if(ride.progress>.96){const exit=skiExitPoint(lift),t=(ride.progress-.96)/.04,e=t*t*(3-2*t);player.position={x:pose.x+(exit.x-pose.x)*e,y:pose.y+(exit.y-pose.y)*e,z:pose.z+(exit.z-pose.z)*e};}player.locationName=lift.name+' · '+Math.round(ride.progress*100)+'%';if(ride.progress>=1){player.position=skiExitPoint(lift);player.skiLift=null;player.floor=player.position.y;player.grounded=true;player.velocityY=0;player.skiing=true;player.skiSpeed=0;player.skiHeading=Math.PI;player.yaw=Math.PI;player.input={};player.movementRevision=(player.movementRevision||0)+1;}return true;}
const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
export function skiMotion(player,input,dt){
 const p=player.position,forward=clamp(input.forward||0,-1,1),side=clamp(input.side||0,-1,1),run=player.skiRace?.status==='racing'&&skiRuns.find(run=>run.id===player.skiRace.courseId);
 let target=(player.yaw||0)+side*.75;
 if(run&&player.skiAssist!==false){const ahead=Math.min(280,p.z+32),toward=clamp(skiRunX(run,ahead)-p.x,-22,22);target=Math.atan2(-toward,-32)+side*.65;}
 const heading=Number.isFinite(player.skiHeading)?player.skiHeading:target,turn=clamp(angleDelta(target,heading),-2.2*dt,2.2*dt);player.skiHeading=heading+turn;
 const dx=-Math.sin(player.skiHeading),dz=-Math.cos(player.skiHeading),downhill=(skiHeight(p.x,p.z)-skiHeight(p.x+dx,p.z+dz))*9,braking=forward<0||input.brake;
 player.skiSpeed=clamp((player.skiSpeed||0)+(braking?-16:downhill+forward*5-(player.skiSpeed||0)*.11)*dt,0,28);
 const speed=player.skiSpeed;return {x:clamp(p.x+dx*speed*dt,-560,560),z:clamp(p.z+dz*speed*dt,-560,560),speed};
}
