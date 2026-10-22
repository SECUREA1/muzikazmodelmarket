export function roadFleetAnchors(environment={}){
 environment||={};
 const scene=environment.builderScene||{},roads=[...(environment.streets||[]),...(scene.streets||[])];
 for(const item of scene.objects||[])if(item.position&&/road|asphalt|street/.test(item.modelId||'')&&!/sign|light|lamp/.test(item.modelId||''))roads.push({from:item.position,to:{...item.position,z:item.position.z+8}});
 if(!roads.length&&['vendor-street','creator-studios','market-square','cargo-yard','desert-outpost'].includes(scene.layout||environment.layout))roads.push({from:{x:0,y:0,z:-14},to:{x:0,y:0,z:14},width:8});
 return roads.filter(r=>r.from&&r.to&&[r.from.x,r.from.z,r.to.x,r.to.z].every(Number.isFinite));
}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const cache=new WeakMap();
export function roadNetwork(environment){
 const roads=roadFleetAnchors(environment),signature=JSON.stringify(roads);if(cache.get(environment)?.signature===signature)return cache.get(environment).network;
 const nodes=[],lookup=new Map(),segments=roads.map((r,i)=>({...r,id:r.id||'Road '+(i+1),cuts:[0,1]}));
 for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){const a=segments[i],b=segments[j],dx=a.to.x-a.from.x,dz=a.to.z-a.from.z,ex=b.to.x-b.from.x,ez=b.to.z-b.from.z,det=dx*ez-dz*ex;if(Math.abs(det)<1e-6)continue;const x=b.from.x-a.from.x,z=b.from.z-a.from.z,t=(x*ez-z*ex)/det,u=(x*dz-z*dx)/det;if(t>=0&&t<=1&&u>=0&&u<=1){a.cuts.push(t);b.cuts.push(u);}}
 const node=(point,name)=>{const key=Math.round(point.x*10)+':'+Math.round(point.z*10);if(lookup.has(key))return lookup.get(key);const index=nodes.length;lookup.set(key,index);nodes.push({...point,name,links:[]});return index;};
 for(const road of segments){const cuts=[...new Set(road.cuts)].sort((a,b)=>a-b);let prior=null;for(let c=1;c<cuts.length;c++){const count=Math.max(1,Math.ceil(distance(road.from,road.to)*(cuts[c]-cuts[c-1])/12));for(let i=0;i<=count;i++){const t=cuts[c-1]+(cuts[c]-cuts[c-1])*i/count,index=node({x:road.from.x+(road.to.x-road.from.x)*t,y:(road.from.y||0)+((road.to.y||0)-(road.from.y||0))*t,z:road.from.z+(road.to.z-road.from.z)*t},road.name||road.id);if(prior!==null&&prior!==index){if(!nodes[prior].links.includes(index))nodes[prior].links.push(index);if(!nodes[index].links.includes(prior))nodes[index].links.push(prior);}prior=index;}}}
 const network={nodes,roads};cache.set(environment,{signature,network});return network;
}
export function nearestRoadNode(network,point){let index=-1,gap=Infinity;network.nodes.forEach((node,i)=>{const d=distance(node,point);if(d<gap){gap=d;index=i;}});return index;}
export function roadPath(network,from,to){const previous=new Map([[from,null]]),queue=[from];for(let i=0;i<queue.length;i++){const n=queue[i];if(n===to)break;for(const link of network.nodes[n]?.links||[])if(!previous.has(link)){previous.set(link,n);queue.push(link);}}if(!previous.has(to))return [];const path=[];for(let n=to;n!==null;n=previous.get(n))path.unshift({...network.nodes[n]});return path;}
export function roadRoute(environment,origin,seed=0){const network=roadNetwork(environment),from=nearestRoadNode(network,origin);if(from<0)return [];const destinations=network.nodes.map((p,i)=>({i,gap:distance(origin,p)})).filter(p=>p.gap>6&&roadPath(network,from,p.i).length).sort((a,b)=>b.gap-a.gap).slice(0,4);if(!destinations.length)return [];return roadPath(network,from,destinations[Math.abs(seed)%destinations.length].i);}
export function roadSpeedLimit(environment,point){let best=null,gap=Infinity;for(const road of roadFleetAnchors(environment)){const dx=road.to.x-road.from.x,dz=road.to.z-road.from.z,length=dx*dx+dz*dz,t=Math.max(0,Math.min(1,((point.x-road.from.x)*dx+(point.z-road.from.z)*dz)/(length||1))),d=Math.hypot(point.x-road.from.x-dx*t,point.z-road.from.z-dz*t);if(d<gap){gap=d;best=road;}}return Math.max(15,Math.min(90,Number(best?.speedLimitKph)||40));}
