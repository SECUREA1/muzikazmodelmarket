import {PRISON_WALLS,PRISON_CELLS} from './prison-config.js';

// Ground navigation shares the authored collision rectangles. The static raster
// is retained across NPC requests; dynamic locks are overlaid per security state.
const MIN=-118,MAX=118,SIDE=MAX-MIN+1,COUNT=SIDE*SIDE,BIN=8;
const DIAGONAL=Math.SQRT2;
const DIRECTIONS=[[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,DIAGONAL],[-1,1,DIAGONAL],[1,-1,DIAGONAL],[-1,-1,DIAGONAL]];
const staticCaches=new Map();
const valid=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&p.x>=MIN&&p.x<=MAX&&p.z>=MIN&&p.z<=MAX;
const idAt=(x,z)=>(z-MIN)*SIDE+x-MIN;
const xAt=id=>id%SIDE+MIN;
const zAt=id=>Math.floor(id/SIDE)+MIN;
const box=(wall,radius)=>({minX:wall.x-wall.width/2-radius,maxX:wall.x+wall.width/2+radius,minZ:wall.z-wall.depth/2-radius,maxZ:wall.z+wall.depth/2+radius});
const contains=(r,p)=>p.x>=r.minX&&p.x<=r.maxX&&p.z>=r.minZ&&p.z<=r.maxZ;
function segmentHits(from,to,r){
 let enter=0,exit=1;
 for(const [axis,low,high]of [['x',r.minX,r.maxX],['z',r.minZ,r.maxZ]]){
  const delta=to[axis]-from[axis];
  if(Math.abs(delta)<1e-10){if(from[axis]<low||from[axis]>high)return false;continue;}
  let a=(low-from[axis])/delta,b=(high-from[axis])/delta;if(a>b)[a,b]=[b,a];
  enter=Math.max(enter,a);exit=Math.min(exit,b);if(enter>exit)return false;
 }
 return true;
}
function mark(grid,r){
 for(let z=Math.max(MIN,Math.ceil(r.minZ));z<=Math.min(MAX,Math.floor(r.maxZ));z++){
  const first=idAt(Math.max(MIN,Math.ceil(r.minX)),z),last=idAt(Math.min(MAX,Math.floor(r.maxX)),z);
  if(first<=last)grid.fill(1,first,last+1);
 }
}
function staticNavigation(radius){
 if(staticCaches.has(radius))return staticCaches.get(radius);
 const blocked=new Uint8Array(COUNT),rectangles=PRISON_WALLS.filter(wall=>wall.y-wall.height/2<2).map(wall=>box(wall,radius)),bins=new Map();
 for(const rectangle of rectangles){
  mark(blocked,rectangle);
  for(let x=Math.floor(rectangle.minX/BIN);x<=Math.floor(rectangle.maxX/BIN);x++)for(let z=Math.floor(rectangle.minZ/BIN);z<=Math.floor(rectangle.maxZ/BIN);z++){
   const key=x+':'+z;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(rectangle);
  }
 }
 const data={blocked,rectangles,bins,edgeMasks:new Uint8Array(COUNT),edgeReady:new Uint8Array(COUNT),locks:new Map()};
 // Radius variants are rare; cap the cache for callers experimenting with size.
 if(staticCaches.size>=4)staticCaches.delete(staticCaches.keys().next().value);
 staticCaches.set(radius,data);return data;
}
function dynamicNavigation(state,radius,base){
 const locked=PRISON_CELLS.filter(cell=>state?.cells?.[cell.id]?.locked===true),gateClosed=state?.gateOpen!==true;
 const signature=locked.map(cell=>cell.id).join('|')+':'+gateClosed;
 if(base.locks.has(signature))return base.locks.get(signature);
 const rectangles=locked.map(cell=>box(cell.door,radius));
 if(gateClosed)rectangles.push(box({x:0,z:109,width:18,depth:.3},radius));
 const blocked=base.blocked.slice();for(const rectangle of rectangles)mark(blocked,rectangle);
 const data={blocked,rectangles};if(base.locks.size>=4)base.locks.delete(base.locks.keys().next().value);base.locks.set(signature,data);return data;
}
function staticSegmentClear(from,to,base){
 const tested=new Set();
 for(let x=Math.floor(Math.min(from.x,to.x)/BIN);x<=Math.floor(Math.max(from.x,to.x)/BIN);x++)for(let z=Math.floor(Math.min(from.z,to.z)/BIN);z<=Math.floor(Math.max(from.z,to.z)/BIN);z++){
  for(const rectangle of base.bins.get(x+':'+z)||[]){if(tested.has(rectangle))continue;tested.add(rectangle);if(segmentHits(from,to,rectangle))return false;}
 }
 return true;
}
function segmentClear(from,to,base,dynamic){return staticSegmentClear(from,to,base)&&!dynamic.rectangles.some(rectangle=>segmentHits(from,to,rectangle));}
function nearestNode(position,base,dynamic){
 if(base.rectangles.some(rectangle=>contains(rectangle,position))||dynamic.rectangles.some(rectangle=>contains(rectangle,position)))return -1;
 const candidates=[],cx=Math.round(position.x),cz=Math.round(position.z);
 for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){
  const x=cx+dx,z=cz+dz;if(x<MIN||x>MAX||z<MIN||z>MAX)continue;
  const id=idAt(x,z);if(!dynamic.blocked[id])candidates.push({id,x,z,gap:Math.hypot(x-position.x,z-position.z)});
 }
 candidates.sort((a,b)=>a.gap-b.gap);
 return candidates.find(candidate=>segmentClear(position,candidate,base,dynamic))?.id??-1;
}
function staticEdges(id,base){
 if(base.edgeReady[id])return base.edgeMasks[id];
 const x=xAt(id),z=zAt(id),from={x,z};let mask=0;
 for(let direction=0;direction<DIRECTIONS.length;direction++){
  const [dx,dz]=DIRECTIONS[direction],nx=x+dx,nz=z+dz;if(nx<MIN||nx>MAX||nz<MIN||nz>MAX)continue;
  if(base.blocked[idAt(nx,nz)])continue;
  if(dx&&dz&&(base.blocked[idAt(x+dx,z)]||base.blocked[idAt(x,z+dz)]))continue;
  if(staticSegmentClear(from,{x:nx,z:nz},base))mask|=1<<direction;
 }
 base.edgeReady[id]=1;base.edgeMasks[id]=mask;return mask;
}
class MinHeap{
 constructor(){this.values=[];}
 push(id,priority){const value={id,priority},rows=this.values;let at=rows.length;rows.push(value);while(at>0){const parent=(at-1)>>1;if(rows[parent].priority<=priority)break;rows[at]=rows[parent];at=parent;}rows[at]=value;}
 pop(){const rows=this.values,first=rows[0],last=rows.pop();if(rows.length){let at=0;while(at*2+1<rows.length){let child=at*2+1;if(child+1<rows.length&&rows[child+1].priority<rows[child].priority)child++;if(rows[child].priority>=last.priority)break;rows[at]=rows[child];at=child;}rows[at]=last;}return first;}
 get length(){return this.values.length;}
}
const heuristic=(x,z,tx,tz)=>{const dx=Math.abs(tx-x),dz=Math.abs(tz-z);return Math.max(dx,dz)+(DIAGONAL-1)*Math.min(dx,dz);};

/** Returns metre-spaced ground points including both endpoints, or null when
 * the destination cannot be reached without crossing walls or locked bars.
 * Keep the returned route and advance its index as the character walks it. */
export function findPrisonPath(from,to,state,{radius=.38}={}){
 if(!valid(from)||!valid(to))return null;
 radius=Math.round(Math.max(.1,Math.min(1.5,Number(radius)||.38))*100)/100;
 const base=staticNavigation(radius),dynamic=dynamicNavigation(state,radius,base),start=nearestNode(from,base,dynamic),goal=nearestNode(to,base,dynamic);
 if(start<0||goal<0)return null;
 const scores=new Float64Array(COUNT);scores.fill(Infinity);scores[start]=0;
 const previous=new Int32Array(COUNT);previous.fill(-1);const closed=new Uint8Array(COUNT),heap=new MinHeap(),tx=xAt(goal),tz=zAt(goal);
 heap.push(start,heuristic(xAt(start),zAt(start),tx,tz));let processed=0;
 while(heap.length&&processed<60000){
  const {id}=heap.pop();if(closed[id])continue;closed[id]=1;processed++;
  if(id===goal){
   const reversed=[];for(let step=goal;step>=0;step=previous[step])reversed.push({x:xAt(step),y:Number(from.y)||0,z:zAt(step)});
   const route=[{x:from.x,y:Number(from.y)||0,z:from.z}];
   for(const position of reversed.reverse())if(Math.hypot(position.x-route.at(-1).x,position.z-route.at(-1).z)>.01)route.push(position);
   if(Math.hypot(to.x-route.at(-1).x,to.z-route.at(-1).z)>.01)route.push({x:to.x,y:Number(to.y)||0,z:to.z});
   return route;
  }
  const x=xAt(id),z=zAt(id),mask=staticEdges(id,base);
  for(let direction=0;direction<DIRECTIONS.length;direction++){
   if(!(mask&(1<<direction)))continue;
   const [dx,dz,cost]=DIRECTIONS[direction],nx=x+dx,nz=z+dz,next=idAt(nx,nz);if(closed[next]||dynamic.blocked[next])continue;
   if(dx&&dz&&(dynamic.blocked[idAt(x+dx,z)]||dynamic.blocked[idAt(x,z+dz)]))continue;
   if(dynamic.rectangles.some(rectangle=>segmentHits({x,z},{x:nx,z:nz},rectangle)))continue;
   const score=scores[id]+cost;if(score>=scores[next])continue;scores[next]=score;previous[next]=id;heap.push(next,score+heuristic(nx,nz,tx,tz));
  }
 }
 return null;
}
/** Convenience for occasional steering. Continuous movement should cache a
 * route from findPrisonPath rather than perform a new search every frame. */
export function prisonWaypoint(from,to,state,options){
 const route=findPrisonPath(from,to,state,options);
 return route?.find(position=>Math.hypot(position.x-from.x,position.z-from.z)>.6)||route?.at(-1)||null;
}
