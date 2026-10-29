/** Shared path and character data; all dialogue and motion use the room clock. */
export const FOREST_SNAKE_ID='forest-mossback';
export const FOREST_SNAKE_MODEL_ID='timberland-snake';
export const FOREST_SNAKE_NAME='Mossback';
export const FOREST_SNAKE_SPEED=1.65;
export const FOREST_SNAKE_HEARING_DISTANCE=24;
export const FOREST_SNAKE_TALK_DISTANCE=8;
export const FOREST_SNAKE_SPEECH_MS=11_000;
export const FOREST_SNAKE_REMARK_INTERVAL_MS=25_000;
export const FOREST_SNAKE_REMARKS=Object.freeze([
 'The moon forgot its shoes again. I found a silver footprint in the moss.',
 'The mushrooms are counting backwards. They become terribly shy at seven.',
 'I met a Tuesday hiding inside a hollow log. It asked me not to tell Wednesday.',
 'Every tree keeps a tiny thunderstorm behind its oldest ring.',
 'The wind borrowed my shadow. I hope it brings it back before supper.',
 'That stump remembers being a lighthouse. I believe it, mostly.',
 'Somewhere beneath this hill, a very small door is dreaming of a very large key.',
 'The river told me a secret, but it was in the shape of a spoon.',
 'I have thirteen pockets. None of them are attached to me.',
 'A beetle sold me directions to yesterday. The return journey was rather muddy.',
 'Do you suppose clouds feel ticklish when the treetops wave?',
 'If the stones start humming, hum politely back. They have rehearsed all winter.'
]);
// The patrol stays on the open camp spine and stand lanes, clear of mill bays.
export const FOREST_SNAKE_ROUTE=Object.freeze([
 {x:-2,z:64},{x:-5,z:36},{x:-8,z:2},{x:-4,z:-58},{x:15,z:-86},
 {x:52,z:-60},{x:16,z:-42},{x:3,z:0},{x:4,z:38},{x:18,z:61}
].map(point=>Object.freeze(point)));
const route=FOREST_SNAKE_ROUTE;
function curve(segment,t){
 const n=route.length,a=route[(segment+n-1)%n],b=route[segment%n],c=route[(segment+1)%n],d=route[(segment+2)%n],t2=t*t,t3=t2*t;
 const value=axis=>.5*((2*b[axis])+(-a[axis]+c[axis])*t+(2*a[axis]-5*b[axis]+4*c[axis]-d[axis])*t2+(-a[axis]+3*b[axis]-3*c[axis]+d[axis])*t3);
 return {x:value('x'),z:value('z')};
}
const samples=[{...curve(0,0),length:0}];
for(let segment=0;segment<route.length;segment++)for(let step=1;step<=64;step++){
 const point=curve(segment,step/64),previous=samples[samples.length-1];
 samples.push({...point,length:previous.length+Math.hypot(point.x-previous.x,point.z-previous.z)});
}
export const FOREST_SNAKE_PATH_LENGTH=samples[samples.length-1].length;
export const FOREST_SNAKE_LOOP_MS=FOREST_SNAKE_PATH_LENGTH/FOREST_SNAKE_SPEED*1000;
function atDistance(distance){
 const length=FOREST_SNAKE_PATH_LENGTH,target=((distance%length)+length)%length;
 let low=0,high=samples.length-1;
 while(low+1<high){const middle=(low+high)>>>1;if(samples[middle].length<=target)low=middle;else high=middle;}
 const a=samples[low],b=samples[high],fraction=(target-a.length)/(b.length-a.length||1);
 return {x:a.x+(b.x-a.x)*fraction,z:a.z+(b.z-a.z)*fraction};
}
/** The root travels at walking pace. The separate native rig supplies body sway. */
export function forestSnakePose(now,epoch=0,origin={x:0,y:0,z:0}){
 const elapsed=Math.max(0,Number.isFinite(now-epoch)?now-epoch:0)/1000,distance=elapsed*FOREST_SNAKE_SPEED,position=atDistance(distance),ahead=atDistance(distance+.12),behind=atDistance(distance-.12),dx=ahead.x-behind.x,dz=ahead.z-behind.z;
 return {position:{x:position.x+(origin.x||0),y:origin.y||0,z:position.z+(origin.z||0)},rotation:{x:0,y:Math.atan2(-dx,-dz),z:0},distance,phase:(elapsed*1.5)%(Math.PI*2)};
}
