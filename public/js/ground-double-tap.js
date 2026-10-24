import * as THREE from '../vendor/three/three.module.min.js';
import {placementHitNormal} from './placed-item-collision.js';

// Pointer events cover mouse, pen and touch without relying on a mobile
// browser synthesizing dblclick after preventDefault or pointer capture.
export function bindGroundDoubleTap(surface,{enabled=()=>true,onDoubleTap,now=event=>Number.isFinite(event?.timeStamp)?event.timeStamp:performance.now(),interval=400,slop=12,maxHold=350}={}){
 let pointer=null,previous=null;const capture={capture:true};
 const reset=()=>{pointer=null;previous=null;};
 const down=event=>{
  if(event.isPrimary===false||event.button!==0||pointer||!enabled(event)){reset();return;}
  pointer={id:event.pointerId,type:event.pointerType||'mouse',x:event.clientX,y:event.clientY,at:now(event),moved:false};
 };
 const move=event=>{if(pointer?.id===event.pointerId&&Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y)>slop)pointer.moved=true;};
 const up=event=>{
  if(pointer?.id!==event.pointerId)return;
  const tap=pointer;pointer=null;const at=now(event);
  if(tap.moved||at-tap.at>maxHold||Math.hypot(event.clientX-tap.x,event.clientY-tap.y)>slop||!enabled(event)){previous=null;return;}
  if(previous&&tap.type===previous.type&&at-previous.at<=interval&&Math.hypot(event.clientX-previous.x,event.clientY-previous.y)<=slop){
   previous=null;event.preventDefault();onDoubleTap(event);return;
  }
  previous={type:tap.type,x:event.clientX,y:event.clientY,at};
 };
 const cancel=event=>{if(pointer?.id===event.pointerId)reset();};
 const outside=event=>{if(event.target!==surface)reset();};
 const host=surface.ownerDocument?.defaultView;
 surface.addEventListener('pointerdown',down,capture);surface.addEventListener('pointermove',move,capture);surface.addEventListener('pointerup',up,capture);
 surface.addEventListener('pointercancel',cancel,capture);surface.addEventListener('lostpointercapture',cancel,capture);
 host?.addEventListener('pointerdown',outside,capture);host?.addEventListener('blur',reset);
 return ()=>{
  reset();surface.removeEventListener('pointerdown',down,capture);surface.removeEventListener('pointermove',move,capture);surface.removeEventListener('pointerup',up,capture);
  surface.removeEventListener('pointercancel',cancel,capture);surface.removeEventListener('lostpointercapture',cancel,capture);
  host?.removeEventListener('pointerdown',outside,capture);host?.removeEventListener('blur',reset);
 };
}

export function groundPointFromPointer({ray,camera,rect,event,meshes,acceptHit=()=>true}){
 if(!rect.width||!rect.height)return null;
 const x=(event.clientX-rect.left)/rect.width,y=(event.clientY-rect.top)/rect.height;
 if(x<0||x>1||y<0||y>1)return null;
 ray.setFromCamera(new THREE.Vector2(x*2-1,1-y*2),camera);
 // Inspect the nearest physical surface. Searching for a later upward face
 // could select ground hidden behind a wall.
 const hit=ray.intersectObjects(meshes,false).find(acceptHit);
 return hit&&placementHitNormal(THREE,hit)?.y>.55?hit.point.clone():null;
}
