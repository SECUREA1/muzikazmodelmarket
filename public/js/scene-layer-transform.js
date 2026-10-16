import {normalizedBaseTransform} from './environments/builder-base.js';
// Bake a layer adjustment into normal object transforms; gameplay needs no extra parent.
export function transformSceneLayer(objects,previous,next){
 const a=normalizedBaseTransform(previous),b=normalizedBaseTransform(next),oldAngle=a.rotation*Math.PI/180,newAngle=b.rotation*Math.PI/180,ratio=b.scale/a.scale;
 return objects.map(object=>{
  const p=object.position,x=(p.x-a.x)/a.scale,z=(p.z-a.z)/a.scale;
  const localX=x*Math.cos(oldAngle)-z*Math.sin(oldAngle),localZ=x*Math.sin(oldAngle)+z*Math.cos(oldAngle);
  return {...object,position:{x:(localX*Math.cos(newAngle)+localZ*Math.sin(newAngle))*b.scale+b.x,y:(p.y-a.y)*ratio+b.y,z:(-localX*Math.sin(newAngle)+localZ*Math.cos(newAngle))*b.scale+b.z},rotation:{...object.rotation,y:(object.rotation?.y||0)+newAngle-oldAngle},scale:Object.fromEntries(['x','y','z'].map(axis=>[axis,(object.scale?.[axis]||1)*ratio]))};
 });
}
