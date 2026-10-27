/** Fictional proving-ground challenges and a symbolic power-containment puzzle. */
export const PROVING_ID='muzikaz-factory-proving-grounds';
export const COMPOUND_ID='muzikaz-mountain-compound';
export const PROVING_COUNTDOWN_MS=4000;
export const PROVING_FLIGHT_MS=8000;
export const PROVING_IMPACT_MS=2000;
const point=(x,z,y=.02)=>({x,y,z});
const station=(id,kind,name,x,z)=>({id,kind,name,position:point(x,z),interactionDistance:kind==='pad'?8:6});
/** Raised, walkable control bays support the same authorized test actions. */
export const PROVING_DASHBOARD_STATIONS=Object.freeze([
 {...station('proving-vr-setup','setup','VR preparation deck',-52,65),position:point(-52,65,.56),testingDashboard:'setup',deck:{height:.54,width:22,depth:14}},
 {...station('proving-vr-launch','control','VR launch supervision desk',20,55),position:point(20,55,.74),testingDashboard:'launch',deck:{height:.72,width:22,depth:16}},
 {...station('proving-vr-telemetry','control','VR flight telemetry desk',35,-28),position:point(35,-28,.56),testingDashboard:'telemetry',deck:{height:.54,width:22,depth:14}}
]);
export const PROVING_STATIONS=Object.freeze([
 station('proving-setup','setup','Test preparation & telemetry',-42,35),station('proving-pad','pad','Shared launch pad',0,-10),station('proving-control','control','Arm & launch control',-24,18),station('proving-hatch','hatch','Mountain facility access hatch',50,25),...PROVING_DASHBOARD_STATIONS
]);
export const COMPOUND_STATIONS=Object.freeze([
 station('compound-return','return','Surface return lift',0,35),station('compound-containment','containment','Power containment puzzle',0,8),station('compound-deep-hatch','deep-hatch','Deep bunker access',0,-20)
]);
export const COMPOUND_GATE=Object.freeze({boundaryZ:-26,entry:point(0,35),deepEntry:point(0,-42),surfaceReturn:point(44,32)});
export const PROVING_PROFILES=Object.freeze([
 {id:'accuracy',name:'Training accuracy test',buildAssetId:'factory-training-missile',description:'A reusable training model follows a scripted course to a marked practice target.'},
 {id:'cargo',name:'Cargo landing test',buildAssetId:'factory-cargo-rocket',description:'A reusable cargo model follows a scripted course and touches down on a marked platform.'}
]);
export const PROVING_TARGETS=Object.freeze([
 {id:'target-alpha',kind:'accuracy',profileId:'accuracy',name:'Alpha practice target',position:point(0,-70),radius:8},
 {id:'cargo-zone',kind:'cargo',profileId:'cargo',name:'Cargo touchdown platform',position:point(35,-60),radius:10}
]);
export const CONTAINMENT_CHANNELS=Object.freeze([{id:'coolant',name:'Blue circuit'},{id:'shield',name:'Violet circuit'},{id:'power',name:'Gold circuit'}]);
const settings=environment=>environment?.builderScene?.sourceFactoryTesting||environment?.builderScene?.layoutMeta?.factoryTesting||environment?.factoryTesting||environment?.testing;
export const isProvingEnvironment=environment=>environment?.id===PROVING_ID||settings(environment)?.kind==='proving'||environment?.game==='factory-proving';
export const isCompoundEnvironment=environment=>environment?.id===COMPOUND_ID||settings(environment)?.kind==='compound'||environment?.game==='mountain-compound';
export const isFactoryTestingEnvironment=environment=>isProvingEnvironment(environment)||isCompoundEnvironment(environment)||Boolean(environment?.builderScene?.objects?.some(object=>object?.functionalSettings?.testingStation||object?.functionalSettings?.testingTarget||/^testing-/.test(object?.asset?.buildAssetId||object?.modelId||'')));
/** Present the server's distinct public-clearance and custom-puzzle rules. */
export const testingDeepAccess=(environment,state)=>environment?.id===COMPOUND_ID?state?.clearance?.deep===true:Boolean(environment?.id&&state?.containment?.status==='solved'&&state.containment.environmentId===environment.id);
const active=value=>value&&value.active!==false&&value.enabled!==false&&value.visible!==false&&!value.disabled&&!value.deleted&&!['deleted','disabled','inactive'].includes(value.status);
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const vector=(value,fallback=0)=>({x:finite(value?.x??value?.[0],fallback),y:finite(value?.y??value?.[1],fallback),z:finite(value?.z??value?.[2],fallback)});
const allStations=[...PROVING_STATIONS,...COMPOUND_STATIONS];
const modelRoles={'testing-launch-pad':'pad','testing-launch-console':'control','testing-telemetry-terminal':'setup','testing-blast-door':'hatch','testing-containment-core':'containment'};
const modelTargets={'testing-range-target':'accuracy','testing-cargo-platform':'cargo'};
function objectsFor(environment,actors){
 const authored=Array.isArray(environment?.builderScene?.objects)?environment.builderScene.objects:[],ids=new Set(authored.map(object=>String(object.id)));
 return [...authored,...Object.values(actors||{}).filter(actor=>actor.spawned&&!ids.has(String(actor.id))&&!actor.holderId).map(actor=>({...actor,functionalSettings:{...actor.asset?.function_data,...actor.asset?.configuration,...actor.definition?.gameplay,...actor.functionalSettings},modelId:actor.asset?.buildAssetId||actor.modelId}))];
}
function transformedApproach(object,approach={x:0,y:0,z:0}){
 const source=object.transform||object,p=vector(object.position||source.position),r=vector(object.rotation||source.rotation),raw=object.scale||source.scale||{},s=typeof raw==='number'?{x:raw,y:raw,z:raw}:raw,a=vector(approach),v={x:a.x*Math.max(.04,Math.min(20,finite(s.x,1))),y:a.y*Math.max(.04,Math.min(20,finite(s.y,1))),z:a.z*Math.max(.04,Math.min(20,finite(s.z,1)))};
 const cx=Math.cos(r.x/2),cy=Math.cos(r.y/2),cz=Math.cos(r.z/2),sx=Math.sin(r.x/2),sy=Math.sin(r.y/2),sz=Math.sin(r.z/2),qx=sx*cy*cz+cx*sy*sz,qy=cx*sy*cz-sx*cy*sz,qz=cx*cy*sz+sx*sy*cz,qw=cx*cy*cz-sx*sy*sz,ix=qw*v.x+qy*v.z-qz*v.y,iy=qw*v.y+qz*v.x-qx*v.z,iz=qw*v.z+qx*v.y-qy*v.x,iw=-qx*v.x-qy*v.y-qz*v.z;
 return {x:p.x+ix*qw+iw*-qx+iy*-qz-iz*-qy,y:p.y+iy*qw+iw*-qy+iz*-qx-ix*-qz,z:p.z+iz*qw+iw*-qz+ix*-qy-iy*-qx};
}
function placed(environment,actors,type){
 const used=new Set();return objectsFor(environment,actors).flatMap((object,index)=>{
  const f={...object.gameplay,...object.functionalSettings},raw=type==='station'?f.testingStation:f.testingTarget,kind=raw===false?null:typeof raw==='string'?raw:(type==='station'?modelRoles:modelTargets)[object.asset?.buildAssetId||object.modelId],canonical=(type==='station'?allStations:PROVING_TARGETS).find(value=>value.kind===kind),id=String(object.id||'object-'+index),actor=actors?.[id];
  if(!canonical||!active(object)||!active(f)||actor&&(!active(actor)||(actor.health!==undefined&&actor.health<=0)||actor.holderId)||used.has(id)||id.length>180||/[\x00-\x1f\x7f]/.test(id))return [];used.add(id);
  const record={...canonical,id:(type==='station'?'testing-instance:':'testing-target:')+id,objectId:id,canonicalId:canonical.id,name:typeof object.name==='string'&&object.name.trim()?object.name.trim().slice(0,120):canonical.name,position:transformedApproach(object,type==='station'?f.testingApproach:f.testingTargetApproach),interactionDistance:Math.max(.5,Math.min(8,finite(f.interactionDistance,canonical.interactionDistance||6))),...(['setup','launch','telemetry'].includes(f.testingDashboard)?{testingDashboard:f.testingDashboard,dashboard:f.testingDashboard}:{})};
  record.revision=JSON.stringify([record.id,record.kind,record.position,object.position,object.rotation,object.scale,record.interactionDistance]);return [record];
 });
}
export function testingStations(environment,{actors}={}){
 if(settings(environment)?.enabled===false)return [];
 const editable=settings(environment)?.editableStations||settings(environment)?.editableEquipment,objects=objectsFor(environment,actors),declared=objects.some(object=>Object.hasOwn(object.functionalSettings||{},'testingStation')||modelRoles[object.asset?.buildAssetId||object.modelId]);
 if(editable||declared)return placed(environment,actors,'station');
 if(Array.isArray(settings(environment)?.stations))return settings(environment).stations.filter(active).map(value=>({...value,position:vector(value.position),interactionDistance:Math.max(.5,Math.min(8,finite(value.interactionDistance,6)))}));
 return (isCompoundEnvironment(environment)?COMPOUND_STATIONS:isProvingEnvironment(environment)?PROVING_STATIONS:[]).map(value=>({...value,revision:JSON.stringify([value.id,value.position])}));
}
export function testingTargets(environment,{actors}={}){
 if(settings(environment)?.enabled===false)return [];
 const objects=objectsFor(environment,actors),editable=settings(environment)?.editableTargets||settings(environment)?.editableEquipment,declared=objects.some(object=>Object.hasOwn(object.functionalSettings||{},'testingTarget')||modelTargets[object.asset?.buildAssetId||object.modelId]);
 if(editable||declared)return placed(environment,actors,'target');
 if(Array.isArray(settings(environment)?.targets))return settings(environment).targets.filter(active).map(value=>({...value,position:vector(value.position)}));
 return isProvingEnvironment(environment)?PROVING_TARGETS.map(value=>({...value})):[];
}
/** The physical deep-bunker passage is an access boundary, including map
 * relocation and attempted teleports. The canonical server injects clearance. */
export function constrainCompoundPosition(player,from,to,environment){
 if(environment?.id!==COMPOUND_ID||player?.testing?.clearance?.deep||to.z>=COMPOUND_GATE.boundaryZ)return {...to};
 return {...to,z:COMPOUND_GATE.boundaryZ+.35,x:Math.max(-4,Math.min(4,finite(from?.x,to.x)))};
}
