// Pointer dragging works on touchscreens as well as with a mouse. Keep the
// gesture on an explicit handle so browsing/selecting a card stays predictable.
export function installBuilderCatalogDrag({canvas,onStart,onMove=()=>{},onDrop,onCancel=()=>{}}){
 let gesture=null,ghost=null;
 const cleanup=()=>{ghost?.remove();ghost=null;gesture=null;document.body.classList.remove('builder-catalog-dragging');};
 const moveGhost=event=>{if(ghost){ghost.style.left=`${event.clientX}px`;ghost.style.top=`${event.clientY}px`;}};
 const down=event=>{
  const handle=event.target.closest('[data-builder-drag]');
  if(!handle||event.button!==0||gesture||event.isPrimary===false)return;
  event.preventDefault();event.stopPropagation();
  gesture={id:event.pointerId,model:handle.dataset.builderDrag,name:handle.dataset.dragName||'Item',x:event.clientX,y:event.clientY,active:false};
 };
 const move=event=>{
  if(!gesture||gesture.id!==event.pointerId)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(!gesture.active&&Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>=8){
   gesture.active=true;document.body.classList.add('builder-catalog-dragging');onStart(gesture.model);
   ghost=document.createElement('div');ghost.className='builder-drag-ghost';ghost.textContent=`${gesture.name} · release on the map`;
   ghost.setAttribute('aria-hidden','true');document.body.append(ghost);
  }
  if(gesture.active){moveGhost(event);onMove(event);}
 };
 const up=event=>{
  if(!gesture||gesture.id!==event.pointerId)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(!gesture.active)onStart(gesture.model);
  else{const target=document.elementFromPoint(event.clientX,event.clientY);if(target===canvas)onDrop(event);}
  // A release outside the canvas keeps the item selected for a later floor tap.
  cleanup();
 };
 const cancel=event=>{if(!gesture||(event.pointerId!=null&&event.pointerId!==gesture.id))return;if(gesture.active)onCancel();cleanup();};
 const key=event=>{if(event.key==='Escape')cancel(event);};
 const click=event=>{const handle=event.target.closest('[data-builder-drag]');if(!handle)return;event.preventDefault();event.stopImmediatePropagation();if(event.detail===0)onStart(handle.dataset.builderDrag);};
 document.addEventListener('pointerdown',down,true);document.addEventListener('pointermove',move,{capture:true,passive:false});document.addEventListener('pointerup',up,true);document.addEventListener('pointercancel',cancel,true);document.addEventListener('click',click,true);document.addEventListener('keydown',key,true);window.addEventListener('blur',cancel);
 return()=>{cleanup();document.removeEventListener('pointerdown',down,true);document.removeEventListener('pointermove',move,true);document.removeEventListener('pointerup',up,true);document.removeEventListener('pointercancel',cancel,true);document.removeEventListener('click',click,true);document.removeEventListener('keydown',key,true);window.removeEventListener('blur',cancel);};
}
