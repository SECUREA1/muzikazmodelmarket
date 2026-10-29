/** Public map gateways form a directed graph. A gateway changes rooms; it
 * never proves that a boat, plane, truck or its cargo completed a journey. */
export function planWorldJourney(connectivity,{fromMapId,stops=[],mode=null}={}){
 const locations=new Map((connectivity?.locations||[]).map(place=>[place.mapId||place.id,place])),requested=Array.isArray(stops)?stops.slice(0,16).map(stop=>typeof stop==='string'?stop:stop?.mapId):[],adjacent=new Map();
 for(const link of connectivity?.links||[]){
  const from=link.fromMapId||link.from,to=link.toMapId||link.to;
  if(link.mode!=='map-transfer'||!locations.has(from)||!locations.has(to))continue;
  if(!adjacent.has(from))adjacent.set(from,[]);adjacent.get(from).push(link);
 }
 const legs=[],steps=[],mapIds=locations.has(fromMapId)?[fromMapId]:[],unreachable=[];let current=fromMapId,halted=!locations.has(current);
 for(const target of requested){
  const leg={fromMapId:current,toMapId:target,maps:[],steps:[],reachable:false};legs.push(leg);
  if(halted||!locations.has(target)){unreachable.push(target||'');halted=true;continue;}
  const previous=new Map([[current,null]]),queue=[current];
  for(let index=0;index<queue.length&&!previous.has(target);index++)for(const link of adjacent.get(queue[index])||[]){const to=link.toMapId||link.to;if(previous.has(to))continue;previous.set(to,link);queue.push(to);}
  if(!previous.has(target)){unreachable.push(target);halted=true;continue;}
  let cursor=target;const path=[];
  while(cursor!==current){const link=previous.get(cursor);path.push(link);cursor=link.fromMapId||link.from;}
  path.reverse();leg.reachable=true;leg.steps=path;leg.maps=[current,...path.map(link=>link.toMapId||link.to)];steps.push(...path);mapIds.push(...leg.maps.slice(1));current=target;
 }
 return {reachable:!halted,fromMapId,stops:requested,legs,steps,mapIds,unreachable,preferredMode:['foot','road','boat','plane'].includes(mode)?mode:null};
}
