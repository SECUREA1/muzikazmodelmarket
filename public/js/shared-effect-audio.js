// Sound is presentation of a confirmed event, attenuated for this listener.
export function spatialEffectGain(source,listener,range=40){
 if(!source||!listener||!Number.isFinite(range)||range<=0)return 0;
 const distance=Math.hypot(source.x-listener.x,source.y-listener.y,source.z-listener.z);
 return Number.isFinite(distance)?Math.max(0,1-distance/range)**2:0;
}

const validPoint=point=>point&&[point.x,point.y,point.z].every(Number.isFinite);
function setPoint(node,prefix,point,time){
 if(node[prefix+'X'])for(const axis of ['x','y','z'])node[prefix+axis.toUpperCase()].setValueAtTime(point[axis],time);
 else if(prefix==='position')node.setPosition?.(point.x,point.y,point.z);
}
// Keep Web Audio's listener in the same coordinates and facing as the game camera.
export function updateAudioListener(context,position,direction={x:0,y:0,z:-1},up={x:0,y:1,z:0}){
 if(!context?.listener||!validPoint(position))return;
 const listener=context.listener,time=context.currentTime;
 setPoint(listener,'position',position,time);
 if(!validPoint(direction)||!validPoint(up))return;
 if(listener.forwardX){setPoint(listener,'forward',direction,time);setPoint(listener,'up',up,time);}
 else listener.setOrientation?.(direction.x,direction.y,direction.z,up.x,up.y,up.z);
}
// Distance uses the same bounded falloff as confirmed shared-world effects.
// The HRTF panner adds direction; its native rolloff is disabled to avoid doubling it.
export function createSpatialEffectOutput(context,{range=40,destination=context.destination}={}){
 const input=context.createGain();let panner=null,disposed=false;
 try{panner=context.createPanner?.();if(panner){panner.panningModel='HRTF';panner.distanceModel='linear';panner.refDistance=1;panner.maxDistance=Math.max(1,range);panner.rolloffFactor=0;input.connect(panner);panner.connect(destination);}else input.connect(destination);}catch{panner?.disconnect();panner=null;input.connect(destination);}
 return {input,panner,update({source,listener,direction,up,spatial=true,volume=1}={}){
  if(disposed)return;
  updateAudioListener(context,listener,direction,up);
  const located=validPoint(source)&&validPoint(listener),attenuation=spatial&&located?spatialEffectGain(source,listener,range):1;
  input.gain.setValueAtTime(Math.max(0,Math.min(1,Number(volume)||0))*attenuation,context.currentTime);
  if(panner)setPoint(panner,'position',spatial&&located?source:validPoint(listener)?listener:{x:0,y:0,z:0},context.currentTime);
 },dispose(){if(disposed)return;disposed=true;input.disconnect();panner?.disconnect();}};
}
