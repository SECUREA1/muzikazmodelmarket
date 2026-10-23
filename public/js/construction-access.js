import {constructionMachineKind} from './construction-state.js';
// Ground-level boarding points beside the actual cab. The crane's remote
// operator cab is offset from its mast; the excavator cab follows its swing.
export function constructionAccessPoint(actor){
 const kind=constructionMachineKind(actor);if(!kind)return null;
 const [x,z]=kind==='crane'?[5.6,4.8]:kind==='excavator'?[-2.9,0]:kind==='truck'?[-2.8,-2]:[-3.5,.8],yaw=(actor.rotation?.y||0)+(kind==='excavator'?(actor.construction?.swing||0):0),p=actor.position;
 return {x:p.x+Math.cos(yaw)*x+Math.sin(yaw)*z,y:p.y,z:p.z-Math.sin(yaw)*x+Math.cos(yaw)*z};
}
export function constructionInteractionPoint(actor,feet){
 const entry=constructionAccessPoint(actor);if(!entry||!feet)return actor?.position;
 const gap=p=>Math.hypot(p.x-feet.x,p.y-feet.y,p.z-feet.z);
 return gap(entry)<gap(actor.position)?entry:actor.position;
}
