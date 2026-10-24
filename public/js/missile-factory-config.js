/** Fictional game production recipes; shared by the server, map and controls. */
export const FACTORY_ID='muzikaz-missile-factory';
export const FACTORY_STATION_MODELS=Object.freeze({'factory-procurement-terminal':'procurement','factory-fabricator':'fabrication','factory-assembly-jig':'assembly','factory-calibration-rig':'calibration','factory-loading-bay':'loading','factory-dispatch-terminal':'dispatch'});
const nativeFactory=environment=>environment?.id===FACTORY_ID||environment?.game==='missile-factory'||environment?.factory?.enabled===true||environment?.builderScene?.layout==='missile-factory'||environment?.builderScene?.sourceLayout==='missile-factory'||environment?.builderScene?.sourceFactory?.enabled===true||environment?.builderScene?.layoutMeta?.factory?.enabled===true;
export const isFactoryEnvironment=environment=>nativeFactory(environment)||environment?.builderScene?.objects?.some(object=>stationKind({...object?.gameplay,...object?.functionalSettings},object));
const point=(x,z)=>({x,y:.02,z});
const station=(id,name,x,z,description)=>({id:'factory-'+id,name,kind:id,position:point(x,z),equipmentPosition:point(x,z-3.5),interactionDistance:6,description,prompt:'Open '+name+' · E / Use'});
export const FACTORY_STATIONS=Object.freeze([
 station('procurement','Procurement & jobs',-32,28,'Spend MZK on a production order. Meet the crew and choose a factory job.'),
 station('fabrication','Component fabrication',-30,0,'Operate the press and machining cell to create your game components.'),
 station('assembly','Rocket assembly',0,0,'Join the crafted components in the interactive assembly cradle.'),
 station('calibration','Quality & systems test',27,0,'Run the fictional systems check before releasing the finished model.'),
 station('loading','Freight loading bay',40,-20,'Drive the factory dump truck here to load your finished model.'),
 station('dispatch','Dispatch & collection',30,28,'Deliver the loaded truck, then exit and collect your model in Backpack.')
]);
export const FACTORY_RECIPES=Object.freeze([
 {id:'training-missile',name:'Aster Training Missile',costMzk:180,buildAssetId:'factory-training-missile',description:'Create a reusable inert training model with an articulated display stand.',steps:[{stationId:'factory-fabrication',name:'Fabricate model components',durationMs:7000},{stationId:'factory-assembly',name:'Assemble training model',durationMs:9000},{stationId:'factory-calibration',name:'Run training systems check',durationMs:6000}]},
 {id:'cargo-rocket',name:'Orbit Cargo Rocket',costMzk:320,buildAssetId:'factory-cargo-rocket',description:'Build a detailed cargo rocket collectible with a service cradle and animated display.',steps:[{stationId:'factory-fabrication',name:'Fabricate cargo modules',durationMs:9000},{stationId:'factory-assembly',name:'Assemble cargo rocket',durationMs:12000},{stationId:'factory-calibration',name:'Run cargo systems check',durationMs:8000}]}
]);
export const FACTORY_CREW=Object.freeze([
 {id:'factory-foreman-mara',name:'Mara Voss',role:'Production foreman',home:point(-26,29),position:point(-26,29),color:'#e9b04b',skin:'#ad7659',activity:'working',greeting:'Take a production order, operate the three cells, then drive the truck from loading to dispatch. Your finished model goes to Backpack.'},
 {id:'factory-machinist-dex',name:'Dex Okafor',role:'Fabrication machinist',home:point(-25,-5),position:point(-25,-5),color:'#5ca9b3',skin:'#805238',activity:'working',greeting:'I can assist your next cycle. You still choose each station and supervise the work.'},
 {id:'factory-tech-iona',name:'Iona Park',role:'Systems test technician',home:point(24,-5),position:point(24,-5),color:'#a98bd3',skin:'#d8aa85',activity:'working',greeting:'Every model passes our game systems check before freight loading.'},
 {id:'factory-logistics-sol',name:'Sol Reyes',role:'Freight dispatcher',home:point(22,34),position:point(22,34),color:'#85b26b',skin:'#bc8c68',activity:'walking',greeting:'Load at the north freight bay, follow the marked haul lane, and deliver here in the same truck.'}
]);
export const FACTORY_LOCATIONS=Object.freeze([
 ...FACTORY_STATIONS.map(value=>({id:value.id,name:value.name,x:value.position.x,z:value.position.z,width:value.kind==='loading'?16:14,depth:12,description:value.description})),
 {id:'factory-haul-lane',name:'Freight haul lane',x:44,z:8,width:16,depth:64,description:'Keep the truck route clear between loading and dispatch.'}
]);

const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const bound=(value,min,max,fallback=0)=>Math.max(min,Math.min(max,finite(value,fallback)));
const vector=(value,fallback=0)=>({x:bound(value?.x??value?.[0],-100000,100000,fallback),y:bound(value?.y??value?.[1],-100000,100000,fallback),z:bound(value?.z??value?.[2],-100000,100000,fallback)});
const active=value=>value&&value.enabled!==false&&value.active!==false&&value.visible!==false&&value.disabled!==true&&value.deleted!==true&&!['deleted','disabled','inactive'].includes(value.status);
const objectId=(object,index=0)=>String(object.id??object.objectId??'object-'+index);
const validId=id=>id&&id.length<=180&&!/[\x00-\x1f\x7f]/.test(id);
export const canonicalFactoryStation=kind=>FACTORY_STATIONS.find(station=>station.kind===kind||station.id===kind)||null;
const settingsFor=environment=>[environment.builderScene?.sourceFactory,environment.builderScene?.layoutMeta?.factory,environment.factory].filter(Boolean);
const enabled=environment=>!settingsFor(environment).some(value=>value.enabled===false);
const stationKind=(functional,object)=>typeof functional.factoryStation==='string'?functional.factoryStation:functional.factoryStation===true?functional.factoryKind||functional.factoryStationId:functional.factoryStation===false?null:FACTORY_STATION_MODELS[object?.asset?.buildAssetId||object?.modelId]||null;
function rotate(point,rotation){
 const x=rotation.x/2,y=rotation.y/2,z=rotation.z/2,c1=Math.cos(x),c2=Math.cos(y),c3=Math.cos(z),s1=Math.sin(x),s2=Math.sin(y),s3=Math.sin(z);
 const qx=s1*c2*c3+c1*s2*s3,qy=c1*s2*c3-s1*c2*s3,qz=c1*c2*s3+s1*s2*c3,qw=c1*c2*c3-s1*s2*s3;
 const ix=qw*point.x+qy*point.z-qz*point.y,iy=qw*point.y+qz*point.x-qx*point.z,iz=qw*point.z+qx*point.y-qy*point.x,iw=-qx*point.x-qy*point.y-qz*point.z;
 return {x:ix*qw+iw*-qx+iy*-qz-iz*-qy,y:iy*qw+iw*-qy+iz*-qx-ix*-qz,z:iz*qw+iw*-qz+ix*-qy-iy*-qx};
}
function stationRecord(canonical,extra={}){
 const station={...canonical,...extra,kind:canonical.kind,canonicalStationId:canonical.id};
 station.stationRevision=JSON.stringify([station.id,station.kind,station.objectId||null,station.position,station.equipmentPosition,station.interactionDistance,station.vehicleInteractionDistance||9,station.objectTransform||null,station.equipmentModelId||null]);return station;
}
function placedStations(objects){
 const used=new Set();return objects.flatMap((object,index)=>{
  const functional={...object?.gameplay,...object?.functionalSettings},canonical=canonicalFactoryStation(stationKind(functional,object));
  if(!canonical||!active(object)||!active(functional)||!active(object.gameplay||{})||functional.factoryEnabled===false)return [];
  const id=objectId(object,index);if(!validId(id)||used.has(id))return [];used.add(id);
  const source=object.transform||object,position=vector(object.position||source.position),rotation=vector(object.rotation||source.rotation),raw=object.scale??source.scale,uniform=typeof raw==='number'?raw:undefined,scale=Object.fromEntries(['x','y','z'].map(axis=>[axis,bound(uniform??raw?.[axis],.04,20,1)]));
  const approach=vector(functional.factoryApproach??{x:0,y:0,z:canonical.kind==='loading'?0:3.5}),offset=rotate({x:bound(approach.x,-100,100)*scale.x,y:bound(approach.y,-100,100)*scale.y,z:bound(approach.z,-100,100)*scale.z},rotation);
  return [stationRecord(canonical,{id:'factory-instance:'+id,objectId:id,name:typeof object.name==='string'&&object.name.trim()?object.name.trim().slice(0,120):canonical.name,sourceStationId:canonical.id,position:{x:position.x+offset.x,y:position.y+offset.y,z:position.z+offset.z},equipmentPosition:position,interactionDistance:bound(functional.interactionDistance,.5,6,canonical.interactionDistance),vehicleInteractionDistance:bound(functional.vehicleInteractionDistance,1,12,9),objectTransform:{position,rotation,scale},equipmentModelId:object.asset?.buildAssetId||object.modelId||null})];
 });
}
function runtimeObjects(actors,authored){
 const ids=new Set(authored.map((object,index)=>objectId(object,index)));
 return Object.values(actors||{}).filter(actor=>actor?.spawned&&(actor.health===undefined||actor.health>0)&&!actor.holderId&&!ids.has(String(actor.id??actor.definition?.objectId??''))).map(actor=>({...actor,id:actor.id||actor.definition?.objectId,name:actor.name||actor.asset?.name||actor.definition?.name,position:actor.position||actor.definition?.transform?.position,rotation:actor.rotation||actor.definition?.transform?.rotation,scale:actor.scale||actor.definition?.transform?.scale,modelId:actor.asset?.buildAssetId||actor.definition?.modelId,functionalSettings:{...actor.asset?.configuration,...actor.asset?.function_data,...actor.asset?.functionalSettings,...actor.definition?.gameplay,...actor.functionalSettings}}));
}

/** Editable maps use only their active placed equipment. Empty or deleted
 * object lists cannot revive stations inherited from a public-map copy. */
export function factoryStations(environment,{actors}={}){
 if(!environment||!enabled(environment))return [];
 const settings=settingsFor(environment),objects=Array.isArray(environment.builderScene?.objects)?environment.builderScene.objects:[],runtime=runtimeObjects(actors,objects),editable=settings.some(value=>value.editableStations===true||value.editableEquipment===true),declared=objects.some(object=>stationKind({...object?.gameplay,...object?.functionalSettings},object)||Object.hasOwn(object?.functionalSettings||{},'factoryStation')||Object.hasOwn(object?.gameplay||{},'factoryStation'));
 if(environment.id===FACTORY_ID&&!editable)return [...FACTORY_STATIONS.map(value=>stationRecord(value)),...placedStations(runtime)];
 if(editable||declared)return placedStations([...objects,...runtime].filter(object=>{const actor=actors?.[objectId(object)];return !actor||active(actor)&&(actor.health===undefined||actor.health>0)&&!actor.holderId;}));
 const source=settings.find(value=>Array.isArray(value.stations));
 if(source)return [...source.stations.flatMap((value,index)=>{const canonical=canonicalFactoryStation(value?.kind||value?.canonicalStationId||value?.id);if(!canonical||!active(value))return [];const id=String(value.id||'factory-source-'+index);if(!validId(id))return [];return [stationRecord(canonical,{...value,id,position:vector(value.position||canonical.position),equipmentPosition:vector(value.equipmentPosition||value.position||canonical.equipmentPosition),interactionDistance:bound(value.interactionDistance,.5,6,canonical.interactionDistance),vehicleInteractionDistance:bound(value.vehicleInteractionDistance,1,12,9)})];}),...placedStations(runtime)];
 return nativeFactory(environment)?[...FACTORY_STATIONS.map(value=>stationRecord(value)),...placedStations(runtime)]:placedStations(runtime);
}

/** Canonical role drives work semantics; instance identity and transforms drive
 * proximity, shared reservations and interruption when equipment is edited. */
export function factoryRecipeSteps(recipe,stations){
 return recipe.steps.map(step=>{const role=canonicalFactoryStation(step.kind||step.canonicalStationId||step.stationId),station=stations.find(value=>value.kind===role?.kind);return {...step,kind:role?.kind,canonicalStationId:role?.id,stationId:station?.id||null,stationRevision:station?.stationRevision||null};});
}

export function factoryCrew(environment,{actors}={}){
 if(!environment||!enabled(environment))return [];
 const settings=settingsFor(environment),objects=Array.isArray(environment.builderScene?.objects)?environment.builderScene.objects:[],editable=settings.some(value=>value.editableCrew===true||value.editableEquipment===true),declared=objects.some(object=>Object.hasOwn(object?.functionalSettings||{},'factoryCrewId')||Object.hasOwn(object?.functionalSettings||{},'factoryCrew'));
 const live=source=>{const actor=actors?.[source.id];return {...source,canonicalCrewId:source.canonicalCrewId||source.id,position:vector(actor?.position||source.position||source.home),home:vector(source.home||source.position)};};
 if(editable||declared){const used=new Set();return objects.flatMap((object,index)=>{
  const functional={...object?.gameplay,...object?.functionalSettings},descriptor=functional.factoryCrew,canonical=FACTORY_CREW.find(person=>person.id===(functional.factoryCrewId||(typeof descriptor==='string'?descriptor:descriptor?.id))),id=objectId(object,index);
  if(!canonical||!active(object)||!active(functional)||functional.factoryCrew===false||functional.factoryCrewEnabled===false||!validId(id)||used.has(id))return [];used.add(id);
  const home=vector(object.position||object.transform?.position),profile=descriptor&&typeof descriptor==='object'?descriptor:{},avatar=object.avatarSettings||{},text=(value,fallback,max=120)=>typeof value==='string'&&value.trim()?value.trim().slice(0,max):fallback,color=(value,fallback)=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value:fallback;
  return [live({...canonical,id,canonicalCrewId:canonical.id,objectId:id,name:text(avatar.displayName||profile.name||object.name,canonical.name),role:text(profile.role,canonical.role),greeting:text(profile.greeting,canonical.greeting,1000),color:color(avatar.outfitColor||profile.color,canonical.color),skin:color(avatar.bodyColor||profile.skin,canonical.skin),home,position:home})];
 });}
 const source=settings.find(value=>Array.isArray(value.crew));return (source?.crew||(nativeFactory(environment)?FACTORY_CREW:[])).flatMap(person=>{const canonical=FACTORY_CREW.find(value=>value.id===(person.canonicalCrewId||person.id));return canonical&&active(person)?[live({...canonical,...person,canonicalCrewId:canonical.id})]:[];});
}
