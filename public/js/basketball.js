const nativeIds=actor=>[actor?.asset?.buildAssetId,actor?.definition?.asset?.buildAssetId,actor?.buildAssetId,actor?.modelId,actor?.id];
export const isBasketball=actor=>nativeIds(actor).some(id=>id==='basketball'||id==='catalog-basketball');
export function basketballJerseyTeam(actor){
  const ids=nativeIds(actor);
  for(const team of ['home','away'])if(ids.some(id=>id===`basketball-jersey-${team}`||id===`catalog-basketball-jersey-${team}`))return team;
  return ['home','away'].includes(actor?.asset?.basketballTeam)?actor.asset.basketballTeam:null;
}
export const BASKETBALL_LAUNCH_DEFAULTS=Object.freeze({power:.7,angle:55,mode:'assisted'});
const launchError=message=>{throw Object.assign(new Error(message),{statusCode:422});};
export function basketballLaunchOptions(options={}){
  if(!options||typeof options!=='object'||Array.isArray(options))launchError('Choose valid basketball launch controls.');
  const value={...BASKETBALL_LAUNCH_DEFAULTS,...options};
  if(!Number.isFinite(value.power)||value.power<0||value.power>1)launchError('Basketball power must be between 0 and 100 percent.');
  if(!Number.isFinite(value.angle)||value.angle<20||value.angle>80)launchError('Basketball launch angle must be between 20 and 80 degrees.');
  if(!['assisted','manual'].includes(value.mode))launchError('Choose assisted or manual basketball aim mode.');
  return value;
}
function flatDirection(direction={x:0,z:-1}){
  if(Array.isArray(direction)&&(direction.length!==3||!direction.every(Number.isFinite))||!Array.isArray(direction)&&direction?.y!==undefined&&!Number.isFinite(direction.y))launchError('Choose a valid basketball aim direction.');
  const x=Array.isArray(direction)?direction[0]:direction?.x,z=Array.isArray(direction)?direction[2]:direction?.z;
  if(!Number.isFinite(x)||!Number.isFinite(z))launchError('Choose a valid basketball aim direction.');
  const length=Math.hypot(x,z);return length>.001?{x:x/length,z:z/length}:{x:0,z:-1};
}
/** Ball-bottom origin and target; 70% assisted power calibrates the chosen arc. */
export function basketballShotSolution(origin,target,direction={x:0,z:-1},options={}){
  const controls=basketballLaunchOptions(options);
  if(!origin||!['x','y','z'].every(axis=>Number.isFinite(origin[axis])))launchError('Choose a valid basketball release position.');
  const angle=controls.angle*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
  let aim=flatDirection(direction),speed=4+14*controls.power,calibratedSpeed=speed,flightTime=null,reachable=true;
  if(controls.mode==='assisted'){
    if(!target||!['x','y','z'].every(axis=>Number.isFinite(target[axis])))launchError('A basketball hoop is required for assisted aim.');
    const dx=target.x-origin.x,dz=target.z-origin.z,range=Math.hypot(dx,dz),height=target.y-origin.y,denominator=2*cos*cos*(range*Math.tan(angle)-height);
    if(range>.05&&denominator>.001){
      aim={x:dx/range,z:dz/range};calibratedSpeed=Math.sqrt(9.8*range*range/denominator);
      reachable=Number.isFinite(calibratedSpeed)&&calibratedSpeed<=32&&Math.tan(angle)>2*height/range;
      if(calibratedSpeed<=32){speed=calibratedSpeed*(.5+.5*controls.power/.7);flightTime=range/(speed*cos);}
    }else reachable=false;
  }
  const velocity={x:aim.x*speed*cos,y:speed*sin,z:aim.z*speed*cos};
  return {position:{...origin},velocity,flightTime,calibratedSpeed,speed,reachable,...controls};
}
/** Samples the same gravity and bounce integrator used by the server. */
export function predictBasketballTrajectory(solution,{duration=3,step=1/30,floor=0}={}){
  if(!solution?.position||!solution?.velocity)return [];
  const ball={modelId:'basketball',position:{...solution.position},ballVelocity:{...solution.velocity}};
  const seconds=Math.max(0,Math.min(6,Number(duration)||0)),dt=Math.max(1/120,Math.min(.1,Number(step)||1/30)),points=[{...ball.position,t:0}];
  for(let elapsed=0;elapsed<seconds-1e-8;){const span=Math.min(dt,seconds-elapsed);stepBasketball(ball,span,floor);elapsed+=span;points.push({...ball.position,t:elapsed});if(!ball.ballVelocity)break;}
  return points;
}
export function tossBasketball(actor, position, direction, options) {
  if (!isBasketball(actor)) return false;
  if(options!==undefined){
    const controls=basketballLaunchOptions(options);
    const solution=basketballShotSolution({x:position.x,y:position.y+1.2,z:position.z},null,direction,{...controls,mode:'manual'});
    actor.position=solution.position;actor.ballVelocity=solution.velocity;actor.ballLaunch={power:solution.power,angle:solution.angle,mode:'manual'};
  }else{
    const aim=Array.isArray(direction)?{x:direction[0],y:direction[1],z:direction[2]}:direction;
    const length = Math.hypot(aim?.x, aim?.y, aim?.z);
    if (!Number.isFinite(length) || length < .01) return false;
    actor.position = {x:position.x, y:position.y + 1.2, z:position.z};
    actor.ballVelocity = {x:aim.x/length*7, y:aim.y/length*7+4, z:aim.z/length*7};
  }
  actor.ballFloor = position.y;actor.holderId = null;delete actor.ballCatchSegment;
  return true;
}
/** A short server sweep allows a fast incoming pass to be caught despite latency. */
export function basketballCatchPosition(ball,feet,{now=Date.now(),radius=3}={}){
 if(!isBasketball(ball)||ball.active===false||ball.holderId)return null;
 const chest={x:feet.x,y:feet.y+1,z:feet.z},distance=point=>Math.hypot(point.x-chest.x,point.y+.12-chest.y,point.z-chest.z);
 let position={...ball.position},span=distance(position),rewound=false;
 const trace=ball.ballCatchSegment;
 if(span>radius&&trace&&now>=trace.at&&now-trace.at<=180){
  const delta={x:trace.to.x-trace.from.x,y:trace.to.y-trace.from.y,z:trace.to.z-trace.from.z},length=delta.x*delta.x+delta.y*delta.y+delta.z*delta.z;
  if(length>0&&length<64){const t=Math.max(0,Math.min(1,((chest.x-trace.from.x)*delta.x+(chest.y-.12-trace.from.y)*delta.y+(chest.z-trace.from.z)*delta.z)/length));
   const point={x:trace.from.x+delta.x*t,y:trace.from.y+delta.y*t,z:trace.from.z+delta.z*t},reach=distance(point);if(reach<span){position=point;span=reach;rewound=true;}
  }
 }
 return span<=radius?{position,distance:span,rewound}:null;
}
export function stepBasketball(actor, delta, floor = actor.ballFloor ?? 0, onStep) {
  if (!isBasketball(actor) || actor.holderId || !actor.ballVelocity) return;
  // Analytic gravity inside small sweeps keeps assisted arcs and rim crossings
  // accurate at every rendering rate. A callback can stop after a scored goal.
  for(let remaining=Math.min(.25,Math.max(0,delta));remaining>0;){
    const velocity=actor.ballVelocity;if(!velocity||actor.holderId)break;
    const dt=Math.min(remaining,1/60);remaining-=dt;
    const previous={...actor.position};
    actor.position.x+=velocity.x*dt;actor.position.y+=velocity.y*dt-4.9*dt*dt;actor.position.z+=velocity.z*dt;velocity.y-=9.8*dt;
    if(onStep?.(previous,actor.position)===false)break;
    if(actor.position.y<floor){actor.position.y=floor;velocity.y=Math.abs(velocity.y)*.72;velocity.x*=.82;velocity.z*=.82;if(velocity.y<.3){delete actor.ballVelocity;break;}}
  }
}
