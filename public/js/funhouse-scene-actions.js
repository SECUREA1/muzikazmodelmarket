import * as T from '../vendor/three/three.module.min.js';

const vector=value=>Array.isArray(value)?new T.Vector3(...value):new T.Vector3(Number(value?.x),Number(value?.y),Number(value?.z));
const finite=value=>value.toArray().every(Number.isFinite);
function visible(node){for(let current=node;current;current=current.parent)if(current.visible===false)return false;return true;}
function objectId(node){for(let current=node;current;current=current.parent)if(current.userData?.builderObjectId)return String(current.userData.builderObjectId);return null;}

/** Every hit volume belongs to visible scenery, including rotated/scaled copies.
 * Returning a canonical station plus its owning placed object lets both desktop
 * and headset input use the same geometry without trusting a screen coordinate. */
export function funhouseInteractionTargets(roots){
 const found=[],seen=new Set();
 for(const root of (Array.isArray(roots)?roots:[roots]).filter(Boolean))root.traverse(node=>{
  for(const target of node.userData?.funhouseInteractionTargets||[]){
   if(seen.has(target)||!target.root||target.enabled===false||!visible(target.root))continue;
   seen.add(target);target.root.updateWorldMatrix(true,false);
   const center=vector(target.offset||{x:0,y:0,z:0});target.root.localToWorld(center);
   const scale=target.root.getWorldScale(new T.Vector3()),owner=objectId(target.root);
   found.push({...target,objectId:owner,canonicalStationId:target.stationId,stationId:owner?'funhouse-instance:'+owner:target.stationId,position:center,radius:Math.max(.03,Number(target.radius)||.45)*Math.max(Math.abs(scale.x),Math.abs(scale.y),Math.abs(scale.z))});
  }
 });
 return found;
}

export function funhouseInteractionHit(ray,roots,{stationId,objectId:owner,kind,operation,maxDistance=20,occlusion=true}={}){
 const origin=vector(ray?.origin),direction=vector(ray?.direction);
 if(!finite(origin)||!finite(direction)||direction.lengthSq()<.001)return null;
 direction.normalize();const aim=new T.Ray(origin,direction),point=new T.Vector3();let closest=null;
 for(const target of funhouseInteractionTargets(roots)){
  if(kind&&target.kind!==kind||operation&&target.operation!==operation||owner&&target.objectId!==owner||stationId&&target.stationId!==stationId&&target.canonicalStationId!==stationId)continue;
  const hit=aim.intersectSphere(new T.Sphere(target.position,target.radius),point);if(!hit)continue;
  const distance=origin.distanceTo(hit);if(distance>Math.max(0,Number(maxDistance)||0)||closest&&distance>=closest.distance)continue;
  closest={...target,distance,point:hit.clone()};
 }
 if(closest&&occlusion){
  const blockers=[],seen=new Set();
  for(const root of (Array.isArray(roots)?roots:[roots]).filter(Boolean)){root.updateWorldMatrix(true,true);root.traverse(node=>{
   if(!node.isMesh||seen.has(node)||node.userData.collisionDisabled===true||!visible(node))return;
   const materials=[].concat(node.material||[]);if(!materials.some(material=>material?.visible!==false))return;
   for(let parent=node;parent;parent=parent.parent)if(parent===closest.root||parent.userData?.collisionDisabled===true)return;
   seen.add(node);blockers.push(node);
  });}
  const cast=new T.Raycaster(origin,direction,0,closest.distance+.001);
  if(cast.intersectObjects(blockers,false).some(hit=>hit.distance<closest.distance-.02))return null;
 }
 return closest;
}
