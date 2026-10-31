/** Traditional forge rules shared by the map, Builder and authoritative room. */
export const FORGE_ID='traditional-forge';
const station=(kind,name,modelId,x,description)=>({id:'forge-'+kind,kind,name,modelId,position:{x,y:0,z:-12},approach:{x,y:0,z:-7},interactionDistance:5,description});
export const FORGE_STATIONS=Object.freeze([
 station('sourcing','01 · Select metal & fuel','forge-stock-rack',-30,'Choose a recipe and purchase its measured metal and coal kit with MZK.'),
 station('heat','02 · Charcoal hearth','forge-hearth',-18,'Heat the billet to forging temperature before shaping it.'),
 station('hammer','03 · Anvil & shaping','forge-anvil',-6,'Strike the heated workpiece to draw, shape and consolidate the metal.'),
 station('quench','04 · Quench bath','forge-quench-tank',6,'Quench the shaped workpiece to harden it.'),
 station('temper','05 · Tempering oven','forge-tempering-oven',18,'Temper hardened metal to balance hardness and toughness.'),
 station('finish','06 · Grind, inspect & collect','forge-finishing-bench',30,'Finish and inspect the item, then collect it in your Backpack.')
]);
export const FORGE_CREW=Object.freeze([
 {id:'forge-master-smith-npc',modelId:'forge-master-smith',name:'Brann Emberhand',role:'Master smith',color:'#b76a3f',skin:'#a36c4e',home:{x:-11,y:0,z:3},task:'guiding hammer work and inspecting forged shapes',greeting:'Start at the metal rack, heat your billet, then bring it to the anvil. Quench, temper and finish in that order. Every finished piece goes into your Backpack.'},
 {id:'forge-metallurgist-npc',modelId:'forge-metallurgist',name:'Dr. Sera Vale',role:'Metallurgist',color:'#527e89',skin:'#c99170',home:{x:14,y:0,z:3},task:'checking heat treatment and the balance of hardness and toughness',greeting:'Quenching hardens the workpiece. Tempering follows to restore toughness. Watch the work order and finish each stage before moving on.'},
 {id:'forge-quartermaster-npc',modelId:'forge-quartermaster',name:'Kade Ironledger',role:'Quartermaster',color:'#7d8051',skin:'#785440',home:{x:-29,y:0,z:10},task:'counting metal, coal and workshop orders',greeting:'Choose your item at the stock rack. The MZK kit price covers counted metal and fuel. Tools, stations, crew and finished forge pieces also appear in the market and Builder.'}
]);
export const isForgeEnvironment=(environment={})=>environment?.id===FORGE_ID||environment?.game==='forge'||environment?.forge?.enabled===true||environment?.builderScene?.layout==='forge'||environment?.builderScene?.sourceLayout==='forge'||environment?.builderScene?.sourceForge?.enabled===true||environment?.builderScene?.layoutMeta?.forge?.enabled===true;
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const vector=(value,fallback=0)=>({x:finite(value?.x,fallback),y:finite(value?.y,fallback),z:finite(value?.z,fallback)});
const active=value=>value&&value.enabled!==false&&value.active!==false&&value.visible!==false&&!value.deleted&&!value.disabled;
function rotated(point,rotation){
 const x=rotation.x/2,y=rotation.y/2,z=rotation.z/2,c1=Math.cos(x),c2=Math.cos(y),c3=Math.cos(z),s1=Math.sin(x),s2=Math.sin(y),s3=Math.sin(z),qx=s1*c2*c3+c1*s2*s3,qy=c1*s2*c3-s1*c2*s3,qz=c1*c2*s3+s1*s2*c3,qw=c1*c2*c3-s1*s2*s3;
 const ix=qw*point.x+qy*point.z-qz*point.y,iy=qw*point.y+qz*point.x-qx*point.z,iz=qw*point.z+qx*point.y-qy*point.x,iw=-qx*point.x-qy*point.y-qz*point.z;
 return {x:ix*qw+iw*-qx+iy*-qz-iz*-qy,y:iy*qw+iw*-qy+iz*-qx-ix*-qz,z:iz*qw+iw*-qz+ix*-qy-iy*-qx};
}
/** Deleted or disabled stations stay deleted; saved positions own interaction pads. */
export function forgeStations(environment={}){
 if(!isForgeEnvironment(environment)||environment.forge?.enabled===false||environment.builderScene?.sourceForge?.enabled===false)return [];
 const scene=environment.builderScene||{},objects=scene.objects;
 if(!Array.isArray(objects))return FORGE_STATIONS.map(value=>({...value}));
 const seen=new Set();return objects.flatMap((object,index)=>{
  const functional=object.functionalSettings||{},kind=functional.forgeStation,canonical=FORGE_STATIONS.find(value=>value.kind===kind),id=String(object.id||'object-'+index);
  if(!canonical||seen.has(id)||!active(object)||!active(functional)||functional.forgeEnabled===false)return [];seen.add(id);
  const position=vector(object.position),rotation=vector(object.rotation),scale=typeof object.scale==='number'?{x:object.scale,y:object.scale,z:object.scale}:vector(object.scale,1),approach=vector(functional.forgeApproach||{x:0,y:0,z:5}),offset=rotated({x:approach.x*scale.x,y:approach.y*scale.y,z:approach.z*scale.z},rotation);
  return [{...canonical,id:object.id||canonical.id,objectId:object.id,position,approach:{x:position.x+offset.x,y:position.y+offset.y,z:position.z+offset.z},interactionDistance:Math.max(.5,Math.min(6,finite(functional.interactionDistance,canonical.interactionDistance))),name:object.name||canonical.name}];
 });
}
export function nearestForgeStation(environment,position,kind){
 if(!position||!['x','z'].every(axis=>Number.isFinite(Number(position[axis]))))return null;
 return forgeStations(environment).filter(station=>(!kind||station.kind===kind)&&Math.hypot(position.x-station.approach.x,(position.y||0)-station.approach.y,position.z-station.approach.z)<=station.interactionDistance).sort((a,b)=>Math.hypot(position.x-a.approach.x,position.z-a.approach.z)-Math.hypot(position.x-b.approach.x,position.z-b.approach.z))[0]||null;
}
export function forgeCrew(environment={}){
 if(!isForgeEnvironment(environment))return [];
 const objects=environment.builderScene?.objects;
 if(!Array.isArray(objects))return FORGE_CREW.map(person=>({...person}));
 return objects.flatMap(object=>{const settings=object.functionalSettings||{},source=FORGE_CREW.find(person=>person.id===settings.forgeCrewId||person.modelId===(object.asset?.buildAssetId||object.modelId));return source&&active(object)&&active(settings)&&settings.forgeCrewEnabled!==false?[{...source,...(typeof settings.forgeCrew==='object'?settings.forgeCrew:{}),id:object.id,home:vector(object.position),name:object.avatarSettings?.displayName||object.name||source.name,greeting:object.dialogueSettings?.text||source.greeting,color:object.avatarSettings?.outfitColor||source.color,skin:object.avatarSettings?.bodyColor||source.skin}]:[];});
}
