// Match recorded welcomes and live replies without changing native pitch or
// adding effects. Measure active speech in 20 ms windows so long pauses do not
// make a quiet clip excessively loud. Leave headroom for consonant transients.
export function speechClarityGain(buffer){
 if(!buffer?.getChannelData||!buffer.numberOfChannels||!buffer.sampleRate)return 1;
 const windowSize=Math.max(1,Math.round(buffer.sampleRate*.02));
 let peak=0,energy=0,count=0;
 for(let channel=0;channel<buffer.numberOfChannels;channel++){
  const samples=buffer.getChannelData(channel);
  for(let start=0;start<samples.length;start+=windowSize){
   const end=Math.min(samples.length,start+windowSize);let sum=0;
   for(let i=start;i<end;i++){
    const value=samples[i];if(!Number.isFinite(value))return 1;
    peak=Math.max(peak,Math.abs(value));sum+=value*value;
   }
   if(sum/(end-start)>.0001){energy+=sum;count+=end-start;}
  }
 }
 if(!count||peak<.001)return 1;
 // -20 dBFS active RMS; at most 12 dB of boost, peak below -1 dBFS.
 return Math.min(4,.1/Math.sqrt(energy/count),.89/peak);
}
