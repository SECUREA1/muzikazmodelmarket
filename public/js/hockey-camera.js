/** Presentation math only: movement remains input to the shared hockey simulation. */
const number=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export const HOCKEY_PLAYER_VIEWS=Object.freeze(['chase','ice','top-down']);
export const HOCKEY_AIM_VIEWS=Object.freeze(['top-down','broadcast']);
export const hockeyViewForGameCamera=mode=>mode==='broadcast'?'broadcast':mode==='top-down'?'top-down':'ice';
export const hockeyGameCameraForView=view=>view==='ice'?'first-person':view==='top-down'||view==='broadcast'?view:null;
export function hockeyViewHeading(attack=1){return attack<0?-Math.PI/2:Math.PI/2;}
export function hockeySkateVector(right,forward,heading=Math.PI){
 right=clamp(number(right),-1,1);forward=clamp(number(forward),-1,1);heading=number(heading,Math.PI);
 const length=Math.max(1,Math.hypot(right,forward)),sin=Math.sin(heading),cos=Math.cos(heading);
 return {x:(-cos*right+sin*forward)/length,z:(sin*right+cos*forward)/length};
}
export function hockeyCameraPose(view,{player,puck,attack=1,heading=hockeyViewHeading(attack),pitch=.3,aspect=1.6}={}){
 const narrow=number(aspect,1.6)<1.2,staticViews={broadcast:[0,narrow?65:43,narrow?58:38],lower:[0,7,23],upper:[0,19,34],end:[39,9,0],free:[0,24,34]};
 if(view==='broadcast'){
  const ratio=clamp(number(aspect,1.6),.25,4),base=staticViews.broadcast,distance=Math.hypot(base[1],base[2]),up=base[1]/distance,forward=base[2]/distance,tangent=Math.tan(24*Math.PI/180);
  // Fit both ends and the boards with room around the rink. A fixed spectator
  // distance clips the goals on narrow mobile screens.
  const fitted=Math.max(distance,31.5/(tangent*ratio*.91)+14*forward+2*up,(14*up+2*forward)/(tangent*.91)+14*forward+2*up);
  return {position:[0,up*fitted,forward*fitted],target:[0,0,0],up:[0,1,0],fov:48,heading:Math.PI,immersive:false};
 }
 if(view==='top-down'){
  const x=number(player?.x,number(puck?.x)),z=number(player?.z,number(puck?.z)),angle=number(heading,hockeyViewHeading(attack));
  // Stay below the suspended scoreboard and lights; this is a vertical player-following
  // view, with the attacking net toward the top of the screen.
  return {position:[x,11,z],target:[x,0,z],up:[Math.sin(angle),0,Math.cos(angle)],fov:78,heading:angle,immersive:!!player};
 }
 if(!HOCKEY_PLAYER_VIEWS.includes(view)||!player){const position=staticViews[view]||staticViews.broadcast;return {position:[...position],target:[0,0,0],up:[0,1,0],fov:48,heading:Math.atan2(-position[0],-position[2]),immersive:false};}
 const x=number(player.x),z=number(player.z),angle=number(heading,hockeyViewHeading(attack)),fx=Math.sin(angle),fz=Math.cos(angle),first=view==='ice';
 // The chase camera sees over the skater's shoulder. The eye camera sits on the ice,
 // with a low sightline so the puck and stick remain in view without pointer lock.
 const distance=first?-.12:6.2,height=first?1.48:4.1,ahead=first?12:6.5;
 const px=first?x-fx*distance:clamp(x-fx*distance,-29.2,29.2),pz=first?z-fz*distance:clamp(z-fz*distance,-11.8,11.8),targetY=first?height-Math.tan(clamp(number(pitch,.3),-.15,.9))*ahead:.35;
 return {position:[px,height,pz],target:[x+fx*ahead,targetY,z+fz*ahead],up:[0,1,0],fov:first?76:64,heading:angle,immersive:true};
}
export function hockeyAimPoint(origin,direction,fallback={x:27,z:0}){
 const ox=number(origin?.x),oy=number(origin?.y),oz=number(origin?.z),dx=number(direction?.x),dy=number(direction?.y),dz=number(direction?.z);
 // Ignore sky/horizon rays rather than sending extreme aim coordinates to the server.
 if(dy>=-.002||oy<=0)return {x:number(fallback.x,27),z:number(fallback.z)};
 const t=clamp(-oy/dy,0,600);return {x:clamp(ox+dx*t,-45,45),z:clamp(oz+dz*t,-28,28)};
}
