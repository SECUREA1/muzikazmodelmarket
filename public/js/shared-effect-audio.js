// Sound is presentation of a confirmed event, attenuated for this listener.
export function spatialEffectGain(source,listener,range=40){
 if(!source||!listener||!Number.isFinite(range)||range<=0)return 0;
 const distance=Math.hypot(source.x-listener.x,source.y-listener.y,source.z-listener.z);
 return Number.isFinite(distance)?Math.max(0,1-distance/range)**2:0;
}
