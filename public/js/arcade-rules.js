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
/** Named assemblies are shared by the park settings and the builder item palette. */
export const ARCADE_PARTS=Object.freeze([
 ...ARCADE_ATTRACTIONS.map(a=>({id:a.id,name:a.name,label:a.name,category:'Attractions',attraction:a.id,color:a.color,description:a.id==='train'?'Closed perimeter track, locomotive and three passenger carriages.':a.id==='coaster'?'Elevated closed track, supports, safety restraint and animated car.':'Complete interactive arcade station.'})),
 {id:'ground',name:'Park foundation',category:'Park scenery',color:'#253e36',description:'Two tier park foundation.'},
 {id:'paths',name:'Walkway network',category:'Park scenery',color:'#a1a487',description:'Crossing paths and perimeter walkways.'},
 {id:'trees',name:'Tree planting',category:'Park scenery',color:'#637955',description:'Named tree instances around the courts.'},
 {id:'lamps',name:'Park lighting',category:'Park scenery',color:'#8e9e81',description:'Eight named lamps with glowing globes.'},
 {id:'fountain',name:'Central fountain',category:'Park scenery',color:'#86c5bd',description:'Raised central fountain and water.'},
 {id:'benches',name:'Park seating',category:'Park scenery',color:'#a98c63',description:'Seating beside the walkways.'},
 {id:'train-station',name:'Train station',category:'Park scenery',x:12,z:8,color:'#d0d786',description:'Covered passenger platform.'},
 {id:'signs',name:'Park entrance sign',category:'Park scenery',x:0,z:-17,color:'#dcfa70',description:'Neon Junction entrance sign.'},
 {id:'tree',name:'Individual tree',category:'Individual props',color:'#637955',placeableOnly:true,description:'One tree to place anywhere.'},
 {id:'lamp',name:'Individual lamp',category:'Individual props',color:'#8e9e81',placeableOnly:true,description:'One park lamp.'},
 {id:'bench',name:'Individual bench',category:'Individual props',color:'#a98c63',placeableOnly:true,description:'One park bench.'},
 {id:'path',name:'Path tile',category:'Individual props',color:'#a1a487',placeableOnly:true,description:'One modular walkway tile.'},
 {id:'sign',name:'Arcade sign',category:'Individual props',color:'#dcfa70',placeableOnly:true,description:'One park direction sign.'},
 {id:'train-carriage',name:'Train passenger carriage',category:'Individual props',color:'#c9db86',placeableOnly:true,description:'Passenger carriage prop; use Park express for the running ride.'},
 {id:'coaster-car',name:'Coaster car',category:'Individual props',color:'#eab579',placeableOnly:true,description:'Restrained coaster car prop; use Skyline coaster for the running ride.'},
 {id:'basketball-hoop',name:'Basketball hoop',category:'Equipment props',color:'#ed7457',placeableOnly:true,description:'Backboard, ring, net and upright prop; play through the complete Basketball station.'},
 {id:'basketball-ball',name:'Basketball ball',category:'Equipment props',color:'#e9a05e',placeableOnly:true,description:'Seamed basketball equipment prop.'},
 {id:'hockey-goal',name:'Hockey goal',category:'Equipment props',color:'#e8909e',placeableOnly:true,description:'Framed hockey goal with a visible net; play through the complete Ice hockey station.'},
 {id:'hockey-puck',name:'Hockey puck',category:'Equipment props',color:'#17272b',placeableOnly:true,description:'Low profile ice hockey puck equipment prop.'},
 {id:'air-hockey-mallet',name:'Air hockey mallet',category:'Equipment props',color:'#eb8c9e',placeableOnly:true,description:'Table mallet with grip and round striking base.'},
 {id:'billiard-cue',name:'Billiard cue',category:'Equipment props',color:'#c4a66f',placeableOnly:true,description:'Wooden cue with ferrule and dark tip.'},
 {id:'billiard-balls',name:'Billiard ball set',category:'Equipment props',color:'#f1d86c',placeableOnly:true,description:'Six colored balls and one white cue ball.'},
 {id:'arcade-target',name:'Arcade target',category:'Equipment props',color:'#ecb3b7',placeableOnly:true,description:'Standing bullseye target equipment prop.'},
 {id:'train-engine',name:'Train locomotive',category:'Equipment props',color:'#e3a36c',placeableOnly:true,description:'Locomotive equipment prop; use Park express for the running ride.'},
 {id:'rail-segment',name:'Straight rail segment',category:'Equipment props',color:'#899a8b',placeableOnly:true,description:'A short pair of rails with sleepers; the running train follows its complete route.'},
 {id:'coaster-support',name:'Coaster support',category:'Equipment props',color:'#536b62',placeableOnly:true,description:'Upright support with foundation and track crossbeam.'},
 {id:'safety-bar',name:'Coaster safety restraint',category:'Equipment props',color:'#253e36',placeableOnly:true,description:'Passenger safety bar equipment prop.'}
].map(p=>Object.freeze({label:p.name,...p})));
const bounded=(value,min,max,fallback)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Number(value))):fallback;
const color=(value,fallback)=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value.toLowerCase():fallback;
const partTransform=(raw={},fallback={})=>{raw=raw&&typeof raw==='object'?raw:{};return {enabled:raw.enabled!==false,x:bounded(raw.x,-50,50,fallback.x||0),z:bounded(raw.z,-50,50,fallback.z||0),rotation:bounded(raw.rotation,-180,180,0),scale:bounded(raw.scale,.5,1.75,1),color:color(raw.color,fallback.color||'#dcfa70')};};
export function arcadeSettings(value={}){
 const c=value&&typeof value==='object'?value:{},parts=Object.fromEntries(ARCADE_PARTS.filter(p=>!p.placeableOnly).map(p=>[p.id,partTransform(c.parts?.[p.id],p)]));
 const placements=Object.fromEntries(ARCADE_ATTRACTIONS.slice(0,5).map(a=>{const p=c.placements?.[a.id]||{},part=c.parts?.[a.id]||{};return [a.id,{x:bounded(p.x??part.x,-18,18,a.x),z:bounded(p.z??part.z,-11,11,a.z),rotation:bounded(p.rotation??part.rotation,-180,180,0),scale:bounded(p.scale??part.scale,.5,1.75,1),color:color(p.color??part.color,a.color)}];}));
 for(const a of ARCADE_ATTRACTIONS.slice(0,5))Object.assign(parts[a.id],placements[a.id]);
 const enabled=Array.isArray(c.enabled)?[...new Set(c.enabled.filter(id=>ARCADE_ATTRACTIONS.some(a=>a.id===id)))]:ARCADE_ATTRACTIONS.map(a=>a.id);
 return {basketballMode:c.basketballMode==='shooting'?'shooting':'full',teamSize:Math.round(bounded(c.teamSize,1,5,3)),periodSeconds:bounded(c.periodSeconds,15,600,60),aiFill:c.aiFill!==false,roundSeconds:bounded(c.roundSeconds,15,180,45),trainLapSeconds:bounded(c.trainLapSeconds,20,120,55),coasterLapSeconds:bounded(c.coasterLapSeconds,15,90,32),coasterPeak:bounded(c.coasterPeak,6,22,13),trainRadiusX:bounded(c.trainRadiusX,18,32,24),trainRadiusZ:bounded(c.trainRadiusZ,12,23,16),coasterWidth:bounded(c.coasterWidth,30,58,39),coasterDepth:bounded(c.coasterDepth,20,40,27),difficulty:c.difficulty==='normal'?'normal':'easy',enabled:enabled.filter(id=>parts[id].enabled),placements,parts};
}
export const isArcadeMap=(map={})=>map.game==='arcade'||(map.builderScene?.layout||map.layout)==='arcade-park';
export function arcadeAttractions(config={}){const c=arcadeSettings(config);return ARCADE_ATTRACTIONS.map(a=>({...a,...c.placements[a.id],enabled:c.enabled.includes(a.id)}));}
export function createArcadeSession(config={}){return {config:arcadeSettings(config),mode:'explore',attraction:null,ride:null,visited:[],points:0,lastRide:null};}
export function enterArcadeAttraction(s,id){
 if(s.mode!=='explore'||!s.config.enabled.includes(id))return false;const index=ARCADE_ATTRACTIONS.findIndex(a=>a.id===id);if(index<0)return false;
 s.attraction=id;if(!s.visited.includes(id))s.visited.push(id);
 if(index>=5){s.mode='ride';s.ride={type:id,elapsed:0,progress:0,duration:id==='train'?s.config.trainLapSeconds:s.config.coasterLapSeconds,locked:true};}else{s.mode='game';s.ride=null;}return true;
}
export function exitArcadeAttraction(s,reason='exit'){if(s.ride)s.lastRide={type:s.ride.type,reason,completed:reason==='complete'};s.mode='explore';s.attraction=null;s.ride=null;}
export function stepArcadeRide(s,delta,{hidden=false}={}){if(!s.ride||hidden)return false;const dt=bounded(delta,0,.1,0);s.ride.elapsed+=dt;s.ride.progress=Math.min(1,s.ride.elapsed/s.ride.duration);if(s.ride.progress>=1-1e-9){exitArcadeAttraction(s,'complete');return true;}return false;}
export function arcadeRidePose(type,phase){const n=Number(phase),p=((Number.isFinite(n)?n:0)%1+1)%1;return {phase:type==='train'?(p-.017+1)%1:p,eyeHeight:type==='train'?1.3:1.2,lookAhead:type==='train'?.025:.018};}
export function localArcadePoints(value){return bounded(value,0,99999999,0)|0;}
