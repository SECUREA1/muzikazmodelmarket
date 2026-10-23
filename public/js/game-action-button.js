// Mobile browsers can emit a compatibility click long after touch pointerup.
// Dispatch one action per tap even if that action has already changed the UI.
export function bindGameActionButton(button,activate){
 let touch=null,suppressTouchClick=false;
 const down=event=>{suppressTouchClick=false;if(event.pointerType==='touch')touch={id:event.pointerId,x:event.clientX,y:event.clientY};};
 const cancel=()=>{touch=null;};
 const up=event=>{if(event.pointerType!=='touch'||touch?.id!==event.pointerId)return;const start=touch;touch=null;suppressTouchClick=true;if(Math.hypot(event.clientX-start.x,event.clientY-start.y)>12)return;activate(event);};
 // Use the gesture boundary, not a timeout: a busy renderer can defer clicks
 // for seconds. A fresh pointerdown or a keyboard/assistive click still works.
 const click=event=>{if(suppressTouchClick&&(event.detail!==0||event.pointerType==='touch'||event.sourceCapabilities?.firesTouchEvents)){event.preventDefault();event.stopPropagation();return;}activate(event);};
 button.addEventListener('pointerdown',down);button.addEventListener('pointercancel',cancel);button.addEventListener('pointerup',up);button.addEventListener('click',click);
 return ()=>{button.removeEventListener('pointerdown',down);button.removeEventListener('pointercancel',cancel);button.removeEventListener('pointerup',up);button.removeEventListener('click',click);};
}
