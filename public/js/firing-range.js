/** Renderer-independent range geometry, shared by the live room and its scenery. */
export const FIRING_RANGE_LANES=Object.freeze([-14,-7,0,7,14].map((x,index)=>Object.freeze({index,x,position:Object.freeze({x,y:0,z:13.8})})));
export const FIRING_RANGE_TARGETS=Object.freeze(FIRING_RANGE_LANES.flatMap(({index,x})=>[
 Object.freeze({id:'paper-'+index,lane:index,kind:'paper',position:Object.freeze({x,y:1.55,z:-13.72}),radius:.76,moving:false}),
 Object.freeze({id:'silhouette-'+index,lane:index,kind:'silhouette',position:Object.freeze({x,y:0,z:-15.45}),moving:true})
]));
export const FIRING_RANGE_DEFAULTS=Object.freeze({mode:'precision',durationSeconds:60,rounds:3,shotLimit:20,targetSpeed:1,weapon:'marksman',teamMode:false,countdownSeconds:3});
export const FIRING_RANGE_MODES=Object.freeze(['freeplay','precision','rapid','endurance','moving']);
export const FIRING_RANGE_WEAPONS=Object.freeze(['laser','pulse-rifle','rail-cannon','pulse-pistol','twin-blaster','heavy-bolt','scatter-shot','marksman','arc-carbine']);
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const vector=(value,fallback=0)=>({x:finite(value?.x,fallback),y:finite(value?.y,fallback),z:finite(value?.z,fallback)});
const rotate=(point,axis,angle)=>{const c=Math.cos(angle),s=Math.sin(angle),p={...point};if(axis==='x'){p.y=point.y*c-point.z*s;p.z=point.y*s+point.z*c;}if(axis==='y'){p.x=point.x*c+point.z*s;p.z=-point.x*s+point.z*c;}if(axis==='z'){p.x=point.x*c-point.y*s;p.y=point.x*s+point.y*c;}return p;};
export function rangeLocalToWorld(location,point){const t=location?.transform||{},scale=vector(t.scale,1),r=vector(t.rotation),o=vector(t.position);let p={x:point.x*scale.x,y:point.y*scale.y,z:point.z*scale.z};for(const axis of ['z','y','x'])p=rotate(p,axis,r[axis]);return {x:p.x+o.x,y:p.y+o.y,z:p.z+o.z};}
export function rangeWorldToLocal(location,point){const t=location?.transform||{},s=vector(t.scale,1),r=vector(t.rotation),o=vector(t.position);let p={x:point.x-o.x,y:point.y-o.y,z:point.z-o.z};for(const axis of ['x','y','z'])p=rotate(p,axis,-r[axis]);return {x:p.x/(s.x||1),y:p.y/(s.y||1),z:p.z/(s.z||1)};}
export function isDedicatedFiringRange(environment={}){return environment.id==='firing-range'||environment.id==='force-training-range'||(environment.builderScene?.layout||environment.layout)==='firing-range';}
export const isFiringRangeEnvironment=isDedicatedFiringRange;
export function firingRangeLocations(environment={}){
 const result=[],scene=environment.builderScene||environment.placementScene||{};
 if(isDedicatedFiringRange(environment)){const base=scene.baseTransform||{},angle=finite(base.rotation)*Math.PI/180,scale=finite(base.scale,1);result.push({id:'main',name:environment.name||'Live Firing Range',transform:{position:vector(base),rotation:{x:0,y:angle,z:0},scale:{x:scale,y:scale,z:scale}},lanes:FIRING_RANGE_LANES,targets:FIRING_RANGE_TARGETS});}
 for(const [index,object]of (scene.objects||[]).entries())if((object.asset?.buildAssetId||object.modelId)==='scene-firing-range')result.push({id:String(object.id||'object-'+index),name:object.name||object.metadata?.name||'Range '+(result.length+1),transform:{position:vector(object.position),rotation:vector(object.rotation),scale:vector(object.scale,1)},lanes:FIRING_RANGE_LANES,targets:FIRING_RANGE_TARGETS});
 return result;
}
export function firingRangeTargetOffset(target,serverTime,settings=FIRING_RANGE_DEFAULTS){const p={...target.position};if(target.moving&&['moving','rapid','endurance'].includes(settings.mode))p.x+=1.8*Math.sin(finite(serverTime)/1000*finite(settings.targetSpeed,1)+target.lane*.7);return p;}
export function firingRangeTargetPosition(location,target,serverTime,settings){return rangeLocalToWorld(location,firingRangeTargetOffset(target,serverTime,settings));}
export function firingRangeLocationAt(locations,position,padding=0){return (locations||[]).find(location=>{const p=rangeWorldToLocal(location,position);return Math.abs(p.x)<=19+padding&&p.z>=-19-padding&&p.z<=19+padding&&p.y>=-2&&p.y<=8;})||null;}
/** A ray intersects the visible paper disk or silhouette head/body, never a broad enemy sphere. */
export function intersectFiringRangeTarget(location,target,origin,direction,serverTime,settings){
 const start=rangeWorldToLocal(location,origin),next=rangeWorldToLocal(location,{x:origin.x+direction[0],y:origin.y+direction[1],z:origin.z+direction[2]}),ray={x:next.x-start.x,y:next.y-start.y,z:next.z-start.z},p=firingRangeTargetOffset(target,serverTime,settings);
 if(Math.abs(ray.z)<1e-8)return null;const along=(p.z-start.z)/ray.z;if(along<=0||along>100)return null;
 const x=start.x+ray.x*along-p.x,y=start.y+ray.y*along-p.y;
 if(target.kind==='paper'){const radius=Math.hypot(x,y);if(radius>target.radius)return null;return {distance:along,zone:radius<=.09?'bullseye':radius<=.56?'body':'outer',score:radius<=.09?100:radius<=.22?80:radius<=.38?60:radius<=.56?40:25};}
 const head=x*x+(y-2.18)**2<=.3**2,body=Math.abs(x)<=.45&&y>=.725&&y<=1.975,arms=Math.abs(x)<=.725&&y>=1.58&&y<=1.86;
 return head?{distance:along,zone:'bullseye',score:100}:body||arms?{distance:along,zone:'body',score:60}:null;
}
export function firingRangeLeaderboard(participants={}){return Object.values(participants).filter(p=>p.role==='player'||p.enrolled).map(p=>({...p,accuracy:p.shots?Math.round(p.hits/p.shots*100):0})).sort((a,b)=>b.score-a.score||b.bullseyes-a.bullseyes||(b.shots?b.hits/b.shots:0)-(a.shots?a.hits/a.shots:0)||a.name.localeCompare(b.name)).map((p,index)=>({...p,rank:index+1}));}
export function firingRangeRoundLeaderboard(participants={}){
 const entries=Object.entries(participants).filter(([,p])=>p.roundEnrolled!==false).map(([id,p])=>[id,{...p,totalScore:finite(p.score),score:finite(p.roundScore),hits:finite(p.roundHits),shots:finite(p.roundShots),bullseyes:finite(p.roundBullseyes)}]);
 return firingRangeLeaderboard(Object.fromEntries(entries));
}
export function firingRangeTeamScores(participants={}){
 const teams={red:0,blue:0};for(const p of Object.values(participants))if((p.role==='player'||p.enrolled)&&(p.team==='red'||p.team==='blue'))teams[p.team]+=finite(p.score);return teams;
}
