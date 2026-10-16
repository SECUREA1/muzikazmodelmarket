// Only a completed single-finger tap can place/select an item. Pan and pinch
// gestures remain available to OrbitControls and never edit the map.
export function installBuilderTouchGestures(canvas,onTap){
 const pointers=new Map();let multi=false;
 const down=e=>{if(e.pointerType!=='touch')return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,moved:false});if(pointers.size>1)multi=true;};
 const move=e=>{const start=pointers.get(e.pointerId);if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>10)start.moved=true;};
 const finish=(e,cancelled=false)=>{const start=pointers.get(e.pointerId);pointers.delete(e.pointerId);if(start&&!cancelled&&!multi&&!start.moved&&Math.hypot(e.clientX-start.x,e.clientY-start.y)<=10)onTap(e);if(!pointers.size)multi=false;};
 const up=e=>finish(e),cancel=e=>finish(e,true);
 canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',cancel);
 return ()=>{canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',cancel);pointers.clear();};
}
