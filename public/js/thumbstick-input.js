/** Circular stick response. A small optional dead zone is measured as a radius fraction. */
export function thumbstickAxes(rect,clientX,clientY,{origin='center',startX=0,startY=0,deadzone=0}={}){
 const radius=Math.min(Number(rect?.width),Number(rect?.height??rect?.width))*.29;
 if(!(radius>0)||!Number.isFinite(clientX)||!Number.isFinite(clientY))return {x:0,y:0,offsetX:0,offsetY:0};
 const centreX=origin==='touch'?startX:Number(rect.left)+Number(rect.width)/2;
 const centreY=origin==='touch'?startY:Number(rect.top)+Number(rect.height)/2;
 const dx=clientX-centreX,dy=clientY-centreY,length=Math.hypot(dx,dy);
 if(!Number.isFinite(length))return {x:0,y:0,offsetX:0,offsetY:0};
 const distance=Math.min(radius,length),scale=length?distance/length:0;
 const threshold=Math.max(0,Math.min(.9,Number(deadzone)||0))*radius;
 const strength=distance<=threshold?0:(distance-threshold)/(radius-threshold);
 return {x:length?dx/length*strength:0,y:length?dy/length*strength:0,offsetX:dx*scale,offsetY:dy*scale};
}

/** Pointer-owned, immediate input; taps are reserved for the neutral centre. */
export function mountThumbstick({stick,knob,onChange=()=>{},onTap,canUse=()=>true,capture=(element,id)=>element.setPointerCapture?.(id),windowTarget=globalThis.window,documentTarget=globalThis.document,origin='center',deadzone=0,tapSlop=3}){
 let pointerId=null,startX=0,startY=0,moved=false,rect=null;
 const axesFor=event=>thumbstickAxes(rect,event.clientX,event.clientY,{origin,startX,startY,deadzone});
 const markDrag=event=>{moved ||=Math.hypot(event.clientX-startX,event.clientY-startY)>tapSlop;};
 const change=event=>{const axes=axesFor(event);knob.style.transform=`translate(${axes.offsetX}px, ${axes.offsetY}px)`;onChange(axes);markDrag(event);};
 const reset=()=>{const id=pointerId;pointerId=null;onChange({x:0,y:0,offsetX:0,offsetY:0},true);knob.style.transform='translate(0, 0)';stick.classList.remove('is-active');try{if(id!==null&&stick.hasPointerCapture?.(id))stick.releasePointerCapture(id);}catch{}};
 const down=event=>{
  if(pointerId!==null||!canUse()||event.button!==undefined&&event.button!==0)return;
  event.preventDefault();pointerId=event.pointerId;startX=event.clientX;startY=event.clientY;rect=stick.getBoundingClientRect();
  const initial=axesFor(event);moved=origin==='center'&&Math.hypot(initial.offsetX,initial.offsetY)>tapSlop;
  try{capture(stick,pointerId);}catch{}
  stick.classList.add('is-active');change(event);
 };
 const move=event=>{if(event.pointerId!==pointerId)return;event.preventDefault();if(!canUse()){reset();return;}change(event);};
 const up=event=>{if(event.pointerId!==pointerId)return;event.preventDefault?.();markDrag(event);const tapped=event.type==='pointerup'&&!moved&&canUse();reset();if(tapped)onTap?.(event);};
 const visibility=()=>{if(documentTarget?.hidden)reset();};
 stick.addEventListener('pointerdown',down);stick.addEventListener('pointermove',move);for(const type of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(type,up);windowTarget?.addEventListener('blur',reset);documentTarget?.addEventListener('visibilitychange',visibility);
 return {reset,dispose(){reset();stick.removeEventListener('pointerdown',down);stick.removeEventListener('pointermove',move);for(const type of ['pointerup','pointercancel','lostpointercapture'])stick.removeEventListener(type,up);windowTarget?.removeEventListener('blur',reset);documentTarget?.removeEventListener('visibilitychange',visibility);}};
}
