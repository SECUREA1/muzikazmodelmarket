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
export function skiHeight(x,z){
 const t=clamp((300-z)/700,0,1),hill=180*(t*t*(3-2*t));
 const ridge=Math.max(0,Math.abs(x)-270)/250;
 const back=clamp((-z-410)/190,0,1),crest=120*Math.exp(-(((x+25)/205)**2))*Math.sin(Math.PI*back);
 const wild=Math.min(1,ridge*2)*(Math.sin(x*.027+z*.011)*Math.cos(z*.019)*12+Math.sin(x*.071+z*.03)*3);
 let h=hill+ridge*ridge*(30+hill*.35)+crest+wild;
 for(const ramp of skiRamps){const u=(z-(ramp.z-ramp.length/2))/ramp.length;if(Math.abs(x-ramp.x)<=ramp.width/2&&u>=0&&u<=1)h+=ramp.height*Math.sin(Math.PI*u)**2;}
 return h;
}
export function skiRunX(run,z){return run.x+Math.sin((300-z)/700*Math.PI*2)*run.sway;}
export function liftPosition(lift,progress){const t=clamp(progress,0,1),x=lift.from.x+(lift.to.x-lift.from.x)*t,z=lift.from.z+(lift.to.z-lift.from.z)*t;return {x,y:skiHeight(x,z)+5,z};}
export function startSkiLift(player,lift){player.skiLift={id:lift.id,progress:0};player.skiing=false;player.skiSpeed=0;player.velocityY=0;player.grounded=false;player.movementRevision=(player.movementRevision||0)+1;}
export function stepSkiLift(player,dt){const lift=skiLifts.find(l=>l.id===player.skiLift?.id);if(!lift)return false;player.skiLift.progress=clamp(player.skiLift.progress+dt/lift.duration,0,1);player.position=liftPosition(lift,player.skiLift.progress);player.locationName=lift.name+' · '+Math.round(player.skiLift.progress*100)+'%';if(player.skiLift.progress>=1){player.position={x:lift.to.x+9,y:skiHeight(lift.to.x+9,lift.to.z)+.02,z:lift.to.z};player.skiLift=null;player.floor=player.position.y;player.grounded=true;player.input={};player.movementRevision=(player.movementRevision||0)+1;}return true;}
export function skiMotion(player,input,dt){
 const p=player.position,yaw=player.yaw||0,forward=clamp(input.forward||0,-1,1),side=clamp(input.side||0,-1,1),dx=-Math.sin(yaw),dz=-Math.cos(yaw);
 const downhill=(skiHeight(p.x,p.z)-skiHeight(p.x+dx,p.z+dz))*9;
 const braking=forward<0||input.brake;
 player.skiSpeed=clamp((player.skiSpeed||0)+(braking?-14:downhill+forward*5-(player.skiSpeed||0)*.09)*dt,0,28);
 const speed=player.skiSpeed;
 return {x:clamp(p.x+(dx*speed+Math.cos(yaw)*side*5)*dt,-560,560),z:clamp(p.z+(dz*speed-Math.sin(yaw)*side*5)*dt,-560,560),speed};
}
