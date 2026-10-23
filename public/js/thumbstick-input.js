// Both sticks use their visible center and the same circular, linear response.
export function thumbstickAxes(rect,clientX,clientY){
 const radius=Number(rect.width)*.29;
 if(!(radius>0)||!Number.isFinite(clientX)||!Number.isFinite(clientY))return {x:0,y:0,offsetX:0,offsetY:0};
 const dx=clientX-(rect.left+rect.width/2),dy=clientY-(rect.top+rect.height/2),length=Math.hypot(dx,dy),scale=length>radius?radius/length:1;
 return {x:dx*scale/radius,y:dy*scale/radius,offsetX:dx*scale,offsetY:dy*scale};
}
export function mountThumbstick({stick,knob,onChange,onTap,canUse=()=>true,capture=(element,id)=>element.setPointerCapture?.(id),windowTarget=globalThis.window,documentTarget=stick.ownerDocument}){
 let pointerId=null,startX=0,startY=0,moved=false,rect=null;
 const change=event=>{const axes=thumbstickAxes(rect,event.clientX,event.clientY);knob.style.transform=`translate(${axes.offsetX}px, ${axes.offsetY}px)`;onChange(axes);moved ||=Math.hypot(event.clientX-startX,event.clientY-startY)>8;};
 const reset=()=>{const id=pointerId;pointerId=null;onChange({x:0,y:0,offsetX:0,offsetY:0},true);knob.style.transform='translate(0, 0)';stick.classList.remove('is-active');try{if(id!==null&&stick.hasPointerCapture?.(id))stick.releasePointerCapture(id);}catch{}};
 const down=event=>{if(pointerId!==null&&event.isPrimary===true&&event.pointerId!==pointerId)reset();if(pointerId!==null||!canUse()||event.button!==undefined&&event.button!==0)return;event.preventDefault();pointerId=event.pointerId;startX=event.clientX;startY=event.clientY;moved=false;rect=stick.getBoundingClientRect();try{capture(stick,pointerId);}catch{}stick.classList.add('is-active');change(event);};
 const move=event=>{if(event.pointerId!==pointerId)return;event.preventDefault();if(!canUse()){reset();return;}change(event);};
 const up=event=>{if(event.pointerId!==pointerId)return;event.preventDefault?.();const tapped=event.type==='pointerup'&&!moved&&canUse()&&(!event.target||typeof event.target.nodeType==='number'&&stick.contains?.(event.target));reset();if(tapped)onTap?.();};
 // The finger may end over a panel that stops bubbling, or after capture fails.
 const release=event=>up(event);
 const visibility=()=>{if(documentTarget.hidden)reset();};
 stick.addEventListener('pointerdown',down);stick.addEventListener('pointermove',move);for(const type of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(type,up);windowTarget?.addEventListener('blur',reset);
 for(const type of ['pointerup','pointercancel'])windowTarget?.addEventListener(type,release,true);documentTarget?.addEventListener('visibilitychange',visibility);
 return {reset,dispose(){reset();stick.removeEventListener('pointerdown',down);stick.removeEventListener('pointermove',move);for(const type of ['pointerup','pointercancel','lostpointercapture'])stick.removeEventListener(type,up);windowTarget?.removeEventListener('blur',reset);for(const type of ['pointerup','pointercancel'])windowTarget?.removeEventListener(type,release,true);documentTarget?.removeEventListener('visibilitychange',visibility);}};
}
