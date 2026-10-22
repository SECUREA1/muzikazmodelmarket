// Keep tap targets alive through mobile browsers' delayed click dispatch.
export function holdLiveMapUpdates(root,refresh){
 const pointers=new Set();let pending=false,frame=null,timer=null;
 const flush=()=>{frame=null;timer=null;if(pointers.size||!pending)return;pending=false;refresh();};
 const down=event=>{clearTimeout(timer);timer=null;if(frame!==null)cancelAnimationFrame(frame);frame=null;pointers.add(event.pointerId);};
 const release=event=>{pointers.delete(event.pointerId);if(!pointers.size){clearTimeout(timer);timer=setTimeout(flush,350);}};
 const clicked=()=>{if(pointers.size)return;clearTimeout(timer);timer=null;if(pending&&frame===null)frame=requestAnimationFrame(flush);};
 const reset=()=>{pointers.clear();clicked();};
 root.addEventListener('pointerdown',down,true);root.addEventListener('click',clicked,true);window.addEventListener('pointerup',release);window.addEventListener('pointercancel',release);window.addEventListener('blur',reset);
 return {update(){pending=true;if(!pointers.size&&timer===null)flush();},dispose(){clearTimeout(timer);if(frame!==null)cancelAnimationFrame(frame);root.removeEventListener('pointerdown',down,true);root.removeEventListener('click',clicked,true);window.removeEventListener('pointerup',release);window.removeEventListener('pointercancel',release);window.removeEventListener('blur',reset);}};
}
