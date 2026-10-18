/** Shared configuration and ride state. Scores are local arcade points, not currency. */
export const ARCADE_ATTRACTIONS=Object.freeze([
 {id:'hockey',name:'Ice hockey',subtitle:'SLAPSHOT ARENA',icon:'⌁',color:'#8ee6ed',x:-13,z:-7},
 {id:'shooting',name:'Shooting arcade',subtitle:'TARGET PRACTICE',icon:'◎',color:'#ed9cbb',x:0,z:-10},
 {id:'basketball',name:'Basketball',subtitle:'NOTHING BUT NET',icon:'◉',color:'#efa963',x:13,z:-7},
 {id:'air-hockey',name:'Air hockey',subtitle:'PUCKS & REFLEXES',icon:'◌',color:'#8fc9fd',x:-12,z:7},
 {id:'billiards',name:'Billiards',subtitle:'THE CORNER POCKET',icon:'⠿',color:'#b6a0ed',x:0,z:9},
 {id:'train',name:'Park express',subtitle:'ALL ABOARD',icon:'▰',color:'#dcfa70',x:12,z:8},
 {id:'coaster',name:'Skyline coaster',subtitle:'HOLD ON TIGHT',icon:'〰',color:'#f6a2a2',x:20,z:0}
]);
const bounded=(value,min,max,fallback)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Number(value))):fallback;
export function arcadeSettings(value={}){
 const c=value&&typeof value==='object'?value:{};
 return {roundSeconds:bounded(c.roundSeconds,15,180,45),trainLapSeconds:bounded(c.trainLapSeconds,20,120,55),coasterLapSeconds:bounded(c.coasterLapSeconds,15,90,32),coasterPeak:bounded(c.coasterPeak,6,22,13),difficulty:c.difficulty==='normal'?'normal':'easy',enabled:Array.isArray(c.enabled)?[...new Set(c.enabled.filter(id=>ARCADE_ATTRACTIONS.some(a=>a.id===id)))]:ARCADE_ATTRACTIONS.map(a=>a.id),placements:Object.fromEntries(ARCADE_ATTRACTIONS.slice(0,5).map(a=>[a.id,{x:bounded(c.placements?.[a.id]?.x,-18,18,a.x),z:bounded(c.placements?.[a.id]?.z,-11,11,a.z)}]))};
}
export const isArcadeMap=(map={})=>map.game==='arcade'||(map.builderScene?.layout||map.layout)==='arcade-park';
export function arcadeAttractions(config={}){const c=arcadeSettings(config);return ARCADE_ATTRACTIONS.map(a=>({...a,...c.placements[a.id],enabled:c.enabled.includes(a.id)}));}
export function createArcadeSession(config={}){return {config:arcadeSettings(config),mode:'explore',attraction:null,ride:null,visited:[],points:0,lastRide:null};}
export function enterArcadeAttraction(s,id){
 if(s.mode==='ride'||!s.config.enabled.includes(id))return false;const index=ARCADE_ATTRACTIONS.findIndex(a=>a.id===id);if(index<0)return false;
 s.attraction=id;if(!s.visited.includes(id))s.visited.push(id);
 if(index>=5){s.mode='ride';s.ride={type:id,elapsed:0,progress:0,duration:id==='train'?s.config.trainLapSeconds:s.config.coasterLapSeconds,locked:true};}else{s.mode='game';s.ride=null;}return true;
}
export function exitArcadeAttraction(s,reason='exit'){if(s.ride)s.lastRide={type:s.ride.type,reason,completed:reason==='complete'};s.mode='explore';s.attraction=null;s.ride=null;}
export function stepArcadeRide(s,delta,{hidden=false}={}){if(!s.ride||hidden)return false;const dt=bounded(delta,0,.1,0);s.ride.elapsed+=dt;s.ride.progress=Math.min(1,s.ride.elapsed/s.ride.duration);if(s.ride.progress>=1-1e-9){exitArcadeAttraction(s,'complete');return true;}return false;}
export function arcadeRidePose(type,phase){const n=Number(phase),p=((Number.isFinite(n)?n:0)%1+1)%1;return {phase:type==='train'?(p-.017+1)%1:p,eyeHeight:type==='train'?1.3:1.2,lookAhead:type==='train'?.025:.018};}
export function localArcadePoints(value){return bounded(value,0,99999999,0)|0;}
