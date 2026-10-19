// Retain real elapsed movement on slow frames while bounding post-suspension work.
export const gameFrameDelta = elapsed => Math.max(0,Math.min(.25,Number.isFinite(elapsed)?elapsed:0));

export class GameFrameMeter {
  constructor(size=120){this.samples=new Float64Array(size);this.cpu=new Float64Array(size);this.cursor=0;this.count=0;}
  record(elapsed,cpuMs){if(!(elapsed>0)||!Number.isFinite(elapsed))return;const index=this.cursor++%this.samples.length;this.samples[index]=elapsed;this.cpu[index]=Math.max(0,cpuMs||0);this.count=Math.min(this.count+1,this.samples.length);}
  snapshot(){let seconds=0,cpu=0;for(let i=0;i<this.count;i++){seconds+=this.samples[i];cpu+=this.cpu[i];}return {fps:seconds?Math.round(this.count/seconds*10)/10:0,scriptMs:this.count?Math.round(cpu/this.count*100)/100:0,samples:this.count};}
}
