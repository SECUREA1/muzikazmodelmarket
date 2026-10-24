import {harborWaterAt} from './harbor-water.js';

const cache=new WeakMap();
const finite=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
const rectRange=(patch,margin)=>{
 const x=finite(patch.x,0),z=finite(patch.z,0),width=Math.max(0,finite(patch.width,0))/2+margin,depth=Math.max(0,finite(patch.depth,0))/2+margin;
 return [Math.hypot(Math.max(0,Math.abs(x)-width),Math.max(0,Math.abs(z)-depth)),Math.hypot(Math.abs(x)+width,Math.abs(z)+depth)];
};

/** Whole, origin-centred water circuits shared by dispatch and ambient crews.
 * Island changes can invalidate every historical extent factor. Search the
 * actual radial gaps between land instead of inventing a route through it. */
export function harborQuestRadii(environment,{count=2,margin=12,preferredFactors=[.66,.84]}={}){
 const harbor=environment?.builderScene?.layoutMeta?.harbor;if(!harbor)return [];
 count=Math.max(0,Math.min(8,Math.floor(finite(count,2))));margin=Math.max(0,finite(margin,12));
 const signature=JSON.stringify(harbor),key=JSON.stringify([count,margin,preferredFactors]);let entry=cache.get(environment);
 if(!entry||entry.signature!==signature){entry={signature,variants:new Map()};cache.set(environment,entry);}if(entry.variants.has(key))return [...entry.variants.get(key)];
 const extent=finite(harbor.extent,256),limit=extent-margin,ranges=[{x:0,z:0,width:256,depth:256},...(harbor.islands||[])].map(patch=>rectRange(patch,margin)).sort((a,b)=>a[0]-b[0]);
 const radii=[];
 const safe=radius=>{
  if(!Number.isFinite(radius)||radius<=0||radius>=limit)return false;
  // A circle that misses each expanded land rectangle cannot clip a narrow
  // island between samples. The water check also honors authored lake rules.
  if(ranges.some(([min,max])=>radius>=min&&radius<=max))return false;
  const samples=Math.max(128,Math.ceil(2*Math.PI*radius/2));
  for(let index=0;index<samples;index++){const angle=index*2*Math.PI/samples;if(!harborWaterAt(environment,{x:radius*Math.cos(angle),z:radius*Math.sin(angle)},margin))return false;}
  return true;
 };
 const add=radius=>{if(radii.length<count&&radii.every(previous=>Math.abs(previous-radius)>=12)&&safe(radius))radii.push(radius);};
 for(const factor of preferredFactors)add(extent*finite(factor,0));
 const gaps=[];let edge=0;
 for(const [min,max]of ranges){if(min>edge)gaps.push([edge,Math.min(min,limit)]);edge=Math.max(edge,max);if(edge>=limit)break;}
 if(edge<limit)gaps.push([edge,limit]);
 for(const [min,max]of gaps){if(max-min<2)continue;for(const fraction of count===1?[.5]:[.4,.8,.2,.6])add(min+(max-min)*fraction);}
 entry.variants.set(key,[...radii]);return radii;
}
