import {pingPongCommand,stepPingPong,cancelPingPong,pingPongView} from './public/js/ping-pong-rules.js';
export {pingPongCommand,stepPingPong,cancelPingPong,pingPongView};

export function pingPongCollisionContext(collision,environment,sim,objects={}){
 return {
  visible:(from,to)=>{const dx=to.x-from.x,dy=to.y-from.y,dz=to.z-from.z,span=Math.hypot(dx,dy,dz);return span<.005||!collision.blocksShot(environment,from,[dx/span,dy/span,dz/span],span,sim.actors,objects);},
  groundAt:point=>{const floor=collision.groundAt(environment,point,{maxRise:.7,actors:sim.actors,objects,earthworks:sim.construction?.earthworks});return floor&&collision.hasBodyClearance(environment,floor,.38,{actors:sim.actors,objects,earthworks:sim.construction?.earthworks})?floor:null;}
 };
}
