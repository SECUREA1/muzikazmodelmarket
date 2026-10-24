// A release is a state change, never a synthetic click or another held action.
export function createHeldGameInput({keys,mobile,axes,resetters=new Set(),onInput=()=>{},enqueue=queueMicrotask}){
 let inputQueued=false;
 return {
  press(event){
   const key=event.key.toLowerCase();
   // The browser can keep repeating a key whose physical release was lost.
   // Only a fresh press may arm it again after a panel or reset cleared it.
   if(event.repeat&&!keys.has(key))return false;
   keys.add(key);return true;
  },
  release(){
   keys.clear();mobile.clear();
   for(const axis of Object.keys(axes))axes[axis]=0;
   for(const reset of resetters)reset();
   // Vehicle/panel listeners finish synchronously before the room samples input.
   if(!inputQueued){inputQueued=true;enqueue(()=>{inputQueued=false;onInput();});}
  }
 };
}
