import * as THREE from '../vendor/three/three.module.min.js';
import {placementHitNormal} from './placed-item-collision.js';

// Pointer events cover mouse, pen and touch without relying on a mobile
// browser synthesizing dblclick after preventDefault or pointer capture.
export function bindGroundDoubleTap(surface,{enabled=()=>true,onDoubleTap,allowNonPrimary=false,captureTarget=surface,now=event=>Number.isFinite(event?.timeStamp)?event.timeStamp:performance.now(),interval=400,slop=12,maxHold=350}={}){
 let pointer=null,previous=null,lastPointerAt=-Infinity;const capture={capture:true};
 const reset=()=>{pointer=null;previous=null;};
 const down=event=>{
  if(captureTarget!==surface&&event.target!==surface){reset();return;}
  lastPointerAt=now(event);
  if(!allowNonPrimary&&event.isPrimary===false||event.button!==0||!enabled(event)){reset();return;}
  if(pointer){
   if(!allowNonPrimary||pointer.id===event.pointerId){reset();return;}
   // A reset must remain available while an earlier canvas drag is still held.
   pointer=null;previous=null;
  }
  pointer={id:event.pointerId,type:event.pointerType||'mouse',x:event.clientX,y:event.clientY,at:now(event),moved:false};
 };
 const move=event=>{if(pointer?.id===event.pointerId&&Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y)>slop)pointer.moved=true;};
 const up=event=>{
  if(captureTarget!==surface&&event.target!==surface){reset();return;}
  if(pointer?.id!==event.pointerId)return;
  const tap=pointer;pointer=null;const at=now(event);lastPointerAt=at;
  if(tap.moved||at-tap.at>maxHold||Math.hypot(event.clientX-tap.x,event.clientY-tap.y)>slop||!enabled(event)){previous=null;return;}
  if(previous&&tap.type===previous.type&&at-previous.at<=interval&&Math.hypot(event.clientX-previous.x,event.clientY-previous.y)<=slop){
   previous=null;event.preventDefault();onDoubleTap(event);return;
  }
  previous={type:tap.type,x:event.clientX,y:event.clientY,at};
 };
 const cancel=event=>{if(pointer?.id===event.pointerId)reset();};
 // Some embedded browsers and assistive pointing devices send only a native
 // dblclick. Accept that event, while pointer-backed double clicks remain a
 // single action and a completed drag cannot become travel via compatibility.
 const doubleClick=event=>{
  const at=now(event);
  if(event.button!==0||at-lastPointerAt<=interval||!enabled(event))return;
  reset();lastPointerAt=at;event.preventDefault();onDoubleTap(event);
 };
 const outside=event=>{if(event.target!==surface)reset();};
 const host=surface.ownerDocument?.defaultView;
 captureTarget.addEventListener('pointerdown',down,capture);captureTarget.addEventListener('pointermove',move,capture);captureTarget.addEventListener('pointerup',up,capture);
 captureTarget.addEventListener('pointercancel',cancel,capture);captureTarget.addEventListener('lostpointercapture',cancel,capture);
 surface.addEventListener('dblclick',doubleClick,capture);
 host?.addEventListener('pointerdown',outside,capture);host?.addEventListener('blur',reset);
 return ()=>{
  reset();captureTarget.removeEventListener('pointerdown',down,capture);captureTarget.removeEventListener('pointermove',move,capture);captureTarget.removeEventListener('pointerup',up,capture);
  captureTarget.removeEventListener('pointercancel',cancel,capture);captureTarget.removeEventListener('lostpointercapture',cancel,capture);
  surface.removeEventListener('dblclick',doubleClick,capture);
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
