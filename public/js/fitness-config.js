/** Shared world, activity and character coordinates. All distances are metres. */
export const FITNESS_ID='muzikaz-fitness-centre';
export const FITNESS_EXPANSION_VERSION=2;
export const FITNESS_BOUNDS=Object.freeze({minX:-40,maxX:80,minZ:-40,maxZ:40,width:120,depth:80,mapSize:160,centerX:20});
export const isFitnessEnvironment=environment=>environment?.id===FITNESS_ID||environment?.game==='fitness'||environment?.builderScene?.layout==='fitness-centre'||environment?.fitness?.enabled===true||environment?.builderScene?.sourceLayout==='fitness-centre'||environment?.builderScene?.sourceFitness?.enabled===true||environment?.builderScene?.layoutMeta?.fitness?.enabled===true;
const point=(x,z,y=.02)=>({x,y,z});
const station=(id,kind,name,x,z,extra={})=>({id:'fitness-'+id,kind,name,position:point(x,z),interactionDistance:4,prompt:'Train '+name+' · E / Use',trainer:['boxing','agility','jump-rope'].includes(kind)?'fitness-trainer-maya':'fitness-trainer-leon',...extra});
export const FITNESS_STATIONS=Object.freeze([
 station('boxing','boxing','Boxing · Combination Lab',-22,-14,{equipmentPosition:point(-22,-18),description:'Read the cues, throw the correct punches and build a clean combination.'}),
 station('bench-press','bench-press','Bench Press · Tempo Strength',18,-18,{equipmentPosition:point(18,-22),description:'Press on the target timing window. Control the bar through each repetition.'}),
 station('deadlift','deadlift','Deadlift · Power Platform',29,-7,{equipmentPosition:point(29,-11),description:'Match the lift cues and lock out with controlled timing.'}),
 station('agility','agility','Agility · Reaction Run',19,7,{equipmentPosition:point(21,8),description:'React to the changing direction cues with fast, accurate footwork.'}),
 station('jump-rope','jump-rope','Jump Rope · Rhythm Studio',-11,6,{equipmentPosition:point(-14,6),description:'Find the cadence and jump in time to keep your streak.'}),
 station('rowing','rowing','Rowing · Endurance Bay',-24,15,{equipmentPosition:point(-27,15),description:'Time your drive and recovery to complete smooth, powerful strokes.'}),
 station('balance','balance','Balance · Stability Course',21,23,{equipmentPosition:point(25,25),description:'Keep the marker centred with precise left and right corrections.'}),
 station('boxing-sparring','boxing-sparring','Championship Boxing · AI Sparring',-22,-12,{equipmentPosition:point(-22,-18),trainer:'fitness-trainer-maya',competition:true,description:'Choose a sparring partner, read their attacks and fight three scored rounds. Land jabs and crosses, guard punches and slip counters.'}),
 station('basketball','basketball','Basketball · Shootout',52,-17,{equipmentPosition:point(52,-29),competition:true,description:'Set your aim, square up and release four timed shots against an AI challenger. Clean preparation creates scoring chances.'}),
 station('table-tennis','table-tennis','Table Tennis · Rally Challenge',65,5,{equipmentPosition:point(65,2),competition:true,description:'Read the returning ball, choose a forehand, backhand or smash, and win points against a gym rival.'}),
 station('sprint','sprint','Sprint · Hurdle Race',51,23,{equipmentPosition:point(51,21),competition:true,description:'Drive left and right in rhythm and clear the hurdles to race an AI athlete over three splits.'})
]);

const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const vector=(value,fallback=0)=>({x:finite(value?.x??value?.[0],fallback),y:finite(value?.y??value?.[1],fallback),z:finite(value?.z??value?.[2],fallback)});
const activeStation=value=>value&&value.enabled!==false&&value.active!==false&&value.visible!==false&&value.disabled!==true&&value.deleted!==true&&!['deleted','disabled','inactive'].includes(value.status);
const canonicalKind=kind=>FITNESS_STATIONS.find(station=>station.kind===kind);
export const canonicalFitnessStation=kind=>canonicalKind(kind)||null;
const defaultApproach=kind=>kind==='rowing'?{x:0,y:0,z:3}:kind==='agility'?{x:3,y:0,z:0}:kind==='jump-rope'?{x:1,y:0,z:1}:kind==='balance'?{x:-4,y:0,z:-2}:{x:0,y:0,z:4};

/** Match the XYZ Euler rotation used by Builder equipment, without a renderer dependency. */
function rotateApproach(point,rotation){
 const x=rotation.x/2,y=rotation.y/2,z=rotation.z/2,c1=Math.cos(x),c2=Math.cos(y),c3=Math.cos(z),s1=Math.sin(x),s2=Math.sin(y),s3=Math.sin(z);
 const qx=s1*c2*c3+c1*s2*s3,qy=c1*s2*c3-s1*c2*s3,qz=c1*c2*s3+s1*s2*c3,qw=c1*c2*c3-s1*s2*s3;
 const ix=qw*point.x+qy*point.z-qz*point.y,iy=qw*point.y+qz*point.x-qx*point.z,iz=qw*point.z+qx*point.y-qy*point.x,iw=-qx*point.x-qy*point.y-qz*point.z;
 return {x:ix*qw+iw*-qx+iy*-qz-iz*-qy,y:iy*qw+iw*-qy+iz*-qx-ix*-qz,z:iz*qw+iw*-qz+ix*-qy-iy*-qx};
}
function stationRecord(canonical,extra={}){
 const station={...canonical,...extra,kind:canonical.kind,canonicalStationId:canonical.id};
 station.stationRevision=JSON.stringify([station.id,station.kind,station.objectId||null,station.position,station.equipmentPosition,station.interactionDistance,station.objectTransform||null,station.equipmentModelId||null]);
 return station;
}
function placedFitnessStations(objects){
 const used=new Set();return objects.flatMap((object,index)=>{
  const functional={...object?.gameplay,...object?.functionalSettings},kind=typeof functional.fitnessStation==='string'?functional.fitnessStation:functional.fitnessStation===true?functional.fitnessKind||object.kind:null,canonical=canonicalKind(kind);
  if(!canonical||!activeStation(object)||!activeStation(functional)||!activeStation(object.gameplay||{})||functional.fitnessEnabled===false||functional.fitnessStation===false)return [];
  const objectId=String(object.id??object.objectId??'object-'+index);if(!objectId||objectId.length>180||/[\x00-\x1f\x7f]/.test(objectId)||used.has(objectId))return [];used.add(objectId);
  const source=object.transform||object,position=vector(object.position||source.position),rotation=vector(object.rotation||source.rotation),rawScale=object.scale??source.scale,uniform=typeof rawScale==='number'?rawScale:undefined;
  const scale=Object.fromEntries(['x','y','z'].map(axis=>[axis,Math.max(.04,Math.min(20,finite(uniform??rawScale?.[axis],1)||1))]));
  const approach=vector(functional.fitnessApproach??defaultApproach(kind)),offset=rotateApproach({x:approach.x*scale.x,y:approach.y*scale.y,z:approach.z*scale.z},rotation);
  return [stationRecord(canonical,{id:'fitness-instance:'+objectId,objectId,sourceStationId:typeof functional.fitnessStationId==='string'?functional.fitnessStationId:canonical.id,name:typeof object.name==='string'&&object.name.trim()?object.name.trim().slice(0,120):canonical.name,position:{x:position.x+offset.x,y:position.y+offset.y,z:position.z+offset.z},equipmentPosition:position,interactionDistance:Math.max(.5,Math.min(6,finite(functional.interactionDistance,canonical.interactionDistance))),objectTransform:{position,rotation,scale},equipmentModelId:object.asset?.buildAssetId||object.modelId||null})];
 });
}
function runtimeFitnessObjects(actors,authoredObjects){
 const authoredIds=new Set(authoredObjects.map(object=>String(object?.id??object?.objectId??'')));
 return Object.values(actors||{}).filter(actor=>actor?.spawned&&(actor.health===undefined||actor.health>0)&&!actor.holderId&&!authoredIds.has(String(actor.id??actor.definition?.objectId??''))).map(actor=>({...actor,id:actor.id||actor.definition?.objectId,name:actor.name||actor.asset?.name||actor.definition?.name,position:actor.position||actor.definition?.transform?.position,rotation:actor.rotation||actor.definition?.transform?.rotation,scale:actor.scale||actor.definition?.transform?.scale,modelId:actor.asset?.buildAssetId||actor.definition?.modelId,functionalSettings:{...actor.asset?.configuration,...actor.asset?.function_data,...actor.asset?.functionalSettings,...actor.definition?.gameplay,...actor.functionalSettings}}));
}

/** Resolve the actual active equipment in a saved Builder map. The public gym
 * keeps its authored stations. Editable copies use their object list as the
 * source of truth, including an intentionally empty list after deletions. */
export function fitnessStations(environment,{actors}={}){
 if(!isFitnessEnvironment(environment))return [];
 const scene=environment.builderScene||{},settings=[scene.sourceFitness,scene.layoutMeta?.fitness,environment.fitness].filter(Boolean);
 if(environment.fitness?.enabled===false||scene.sourceFitness?.enabled===false)return [];
 const objects=Array.isArray(scene.objects)?scene.objects:[],declaresStations=objects.some(object=>object&&(Object.hasOwn(object.functionalSettings||{},'fitnessStation')||Object.hasOwn(object.gameplay||{},'fitnessStation'))),runtime=runtimeFitnessObjects(actors,objects);
 const editable=settings.some(setting=>setting.editableStations===true||setting.editableEquipment===true);
 if(environment.id===FITNESS_ID&&!editable)return [...FITNESS_STATIONS.map(station=>stationRecord(station)),...placedFitnessStations(runtime)];
 if(editable||declaresStations)return placedFitnessStations([...objects,...runtime]);
 const source=settings.find(setting=>Array.isArray(setting.stations));
 if(source)return [...source.stations.flatMap((value,index)=>{const canonical=canonicalKind(value?.kind)||FITNESS_STATIONS.find(station=>station.id===value?.canonicalStationId||station.id===value?.id);if(!canonical||!activeStation(value))return [];return [stationRecord(canonical,{...value,id:String(value.id||'fitness-source-'+index),position:vector(value.position||canonical.position),equipmentPosition:vector(value.equipmentPosition||value.position||canonical.equipmentPosition)})];}),...placedFitnessStations(runtime)];
 return [...FITNESS_STATIONS.map(station=>stationRecord(station)),...placedFitnessStations(runtime)];
}
export const FITNESS_LOCATIONS=Object.freeze([
 {id:'fitness-welcome',name:'Fitness Centre · Reception',x:0,z:29,width:20,depth:10,description:'Enter the open training floor, meet Coach Maya, and check the fitness activity directory.'},
 {id:'fitness-boxing',name:'Boxing · Combination Lab',x:-22,z:-18,width:18,depth:22,description:'A regulation-style training ring, striking bags and a boxing combination challenge.'},
 {id:'fitness-strength',name:'Strength · Bench & Deadlift',x:22,z:-18,width:26,depth:24,description:'Padded bench presses, loaded barbells, power racks, plate storage and two skill challenges.'},
 {id:'fitness-cardio',name:'Cardio · Rowing & Treadmills',x:-25,z:15,width:18,depth:22,description:'Rowing machines, treadmills and bikes beside the west windows.'},
 {id:'fitness-rhythm',name:'Rhythm · Jump Rope Studio',x:-12,z:5,width:12,depth:12,description:'A marked, open mat for rhythm training and jump-rope practice.'},
 {id:'fitness-agility',name:'Agility · Reaction Run',x:21,z:8,width:20,depth:18,description:'Ladders, cones, hurdles and a reaction training challenge.'},
 {id:'fitness-balance',name:'Recovery · Balance Course',x:23,z:25,width:22,depth:10,description:'Stability beams, balance pads and space for guided recovery.'},
 {id:'fitness-lockers',name:'Lockers & Hydration',x:-22,z:29,width:18,depth:10,description:'Locker storage, seating and a water station between sessions.'}
 ,{id:'fitness-shootout',name:'Competition Wing · Basketball',x:54,z:-19,width:32,depth:26,description:'A marked half court, basketball hoop, timed shootout and AI challengers.'}
 ,{id:'fitness-table-tennis',name:'Competition Wing · Table Tennis',x:65,z:3,width:20,depth:17,description:'Tournament table, rally challenge, practice partners and spectator seats.'}
 ,{id:'fitness-sprint',name:'Competition Wing · Sprint Track',x:53,z:24,width:32,depth:17,description:'Three marked racing lanes, hurdle gates and AI sprint rivals.'}
]);
/** Public profiles are copied into each match; clients can select only these IDs. */
export const FITNESS_OPPONENTS=Object.freeze([
 {id:'fitness-member-ava',name:'Ava Rivera',kind:'boxing-sparring',style:'Patient counterpuncher',rating:48,accuracy:.46,difficulty:'Rookie',color:'#e2677c'},
 {id:'fitness-rival-darius',name:'Darius Stone',kind:'boxing-sparring',style:'Pressure and sharp combinations',rating:72,accuracy:.66,difficulty:'Club',color:'#de654b'},
 {id:'fitness-rival-tessa',name:'Tessa Quinn',kind:'boxing-sparring',style:'Technical southpaw champion',rating:90,accuracy:.83,difficulty:'Elite',color:'#668ee1'},
 {id:'fitness-member-zoe',name:'Zoe Okafor',kind:'basketball',style:'Balanced set-shot specialist',rating:55,accuracy:.49,difficulty:'Rookie',color:'#f0b451'},
 {id:'fitness-member-malik',name:'Malik Davis',kind:'basketball',style:'Quick-release perimeter scorer',rating:84,accuracy:.78,difficulty:'Elite',color:'#7f9bdf'},
 {id:'fitness-member-amara',name:'Amara Singh',kind:'table-tennis',style:'Steady placement and long rallies',rating:56,accuracy:.5,difficulty:'Rookie',color:'#be8bdb'},
 {id:'fitness-member-finn',name:'Finn Larsen',kind:'table-tennis',style:'Attacking spin and fast returns',rating:85,accuracy:.8,difficulty:'Elite',color:'#69bdba'},
 {id:'fitness-member-jules',name:'Jules Mensah',kind:'sprint',style:'Smooth cadence and clean hurdles',rating:54,accuracy:.48,difficulty:'Rookie',color:'#cfb650'},
 {id:'fitness-member-victor',name:'Victor Santos',kind:'sprint',style:'Explosive starts and fast splits',rating:86,accuracy:.81,difficulty:'Elite',color:'#ed8759'}
].map(opponent=>Object.freeze(opponent)));
export const fitnessOpponents=kind=>FITNESS_OPPONENTS.filter(opponent=>opponent.kind===kind);
export const FITNESS_TRAINERS=Object.freeze([
 {id:'fitness-trainer-maya',name:'Maya Chen',role:'Boxing & movement trainer',home:point(-6,24),position:point(-6,24),color:'#ec7750',skin:'#d6a17d',specialties:['boxing','agility','jump-rope'],greeting:'Welcome to the Fitness Centre. Pick an activity, follow the cues, and build a clean streak. I coach boxing, agility and rhythm.'},
 {id:'fitness-trainer-leon',name:'Leon Brooks',role:'Strength & conditioning trainer',home:point(7,-5),position:point(7,-5),color:'#49b6af',skin:'#865b46',specialties:['bench-press','deadlift','rowing','balance'],greeting:'Control comes before speed. Try a bench press, deadlift or rowing set, then recover with the balance challenge.'}
]);
export const FITNESS_RESIDENTS=Object.freeze([
 ...FITNESS_TRAINERS.map(trainer=>({...trainer,duty:'trainer',activity:'coaching',heading:Math.PI})),
 {id:'fitness-member-ava',name:'Ava Rivera',role:'Boxing member',home:point(-30,-8),activity:'boxing',color:'#e2677c',skin:'#b88161',heading:Math.PI},
 {id:'fitness-member-noah',name:'Noah Patel',role:'Strength member',home:point(12,-27),activity:'bench-press',color:'#7797e0',skin:'#ae7955',heading:Math.PI/2},
 {id:'fitness-member-iman',name:'Iman Reed',role:'Cardio member',home:point(-31,5,.4),activity:'running',color:'#e0bb58',skin:'#78543e',heading:0},
 {id:'fitness-member-kai',name:'Kai Mori',role:'Rowing member',home:point(-26,20),activity:'rowing',color:'#66bea5',skin:'#d5ad87',heading:Math.PI/2},
 {id:'fitness-member-sofia',name:'Sofia Vega',role:'Movement member',home:point(27,5),activity:'stretching',color:'#af85ce',skin:'#c28e6b',heading:-Math.PI/2},
 {id:'fitness-member-ellis',name:'Ellis Cole',role:'Rhythm member',home:point(-15,1),activity:'jump-rope',color:'#5fb5c6',skin:'#d7b094',heading:0},
 {id:'fitness-referee-nia',name:'Nia Bennett',role:'Ring referee & competition official',duty:'referee',home:point(-26,-21,.18),activity:'refereeing',color:'#ecece0',skin:'#81563f',heading:Math.PI/2,watchKind:'boxing-sparring',personality:'Fair, observant and encouraging',backstory:'A club referee who keeps sparring controlled and explains each decision.',skills:{officiating:92,boxing:75},spectate:point(-29,-19)},
 {id:'fitness-rival-darius',name:'Darius Stone',role:'Club boxing rival',home:point(-22.9,-20,.18),activity:'sparring',color:'#de654b',skin:'#865940',heading:0,stationKind:'boxing-sparring',sparringSide:'red',partnerId:'fitness-rival-tessa',spectate:point(-29,-22),personality:'Competitive and direct',backstory:'A pressure boxer who trains combinations and respects a clean defensive round.',skills:{boxing:72,coordination:77}},
 {id:'fitness-rival-tessa',name:'Tessa Quinn',role:'Technical boxing champion',home:point(-21.1,-20,.18),activity:'sparring',color:'#668ee1',skin:'#d0a27e',heading:Math.PI,stationKind:'boxing-sparring',sparringSide:'blue',partnerId:'fitness-rival-darius',spectate:point(-15,-21),personality:'Calm, tactical and precise',backstory:'A southpaw club champion who uses footwork and timed counters.',skills:{boxing:90,agility:86}},
 {id:'fitness-member-zoe',name:'Zoe Okafor',role:'Basketball shootout challenger',home:point(49,-24),activity:'basketball',color:'#f0b451',skin:'#77503b',heading:Math.PI,stationKind:'basketball',spectate:point(42,-29),patrol:[point(49,-24),point(50,-21)],skills:{basketball:55,coordination:66}},
 {id:'fitness-member-malik',name:'Malik Davis',role:'Perimeter scoring rival',home:point(55,-24),activity:'basketball',color:'#7f9bdf',skin:'#9b6849',heading:Math.PI,stationKind:'basketball',spectate:point(43,-25),patrol:[point(55,-24),point(56,-21)],skills:{basketball:84,coordination:82}},
 {id:'fitness-member-amara',name:'Amara Singh',role:'Table tennis rally partner',home:point(63,2),activity:'table-tennis',color:'#be8bdb',skin:'#b67f59',heading:0,stationKind:'table-tennis',partnerId:'fitness-member-finn',spectate:point(73,-1),skills:{'table-tennis':56,agility:63}},
 {id:'fitness-member-finn',name:'Finn Larsen',role:'Table tennis attacking rival',home:point(67,2),activity:'table-tennis',color:'#69bdba',skin:'#d8b490',heading:Math.PI,stationKind:'table-tennis',partnerId:'fitness-member-amara',spectate:point(73,7),skills:{'table-tennis':85,agility:84}},
 {id:'fitness-member-jules',name:'Jules Mensah',role:'Sprint & hurdles challenger',home:point(47,32),activity:'sprint',color:'#cfb650',skin:'#80533d',heading:Math.PI/2,stationKind:'sprint',spectate:point(72,19),maxRoam:26,patrol:[point(47,32),point(47,8)],skills:{sprint:54,endurance:68}},
 {id:'fitness-member-victor',name:'Victor Santos',role:'Sprint pace rival',home:point(55,32),activity:'sprint',color:'#ed8759',skin:'#b88762',heading:Math.PI/2,stationKind:'sprint',spectate:point(72,29),maxRoam:26,patrol:[point(55,32),point(55,8)],skills:{sprint:86,endurance:84}},
 {id:'fitness-member-sam',name:'Sam Park',role:'Ringside analyst & gym regular',home:point(-13,-23),activity:'spectating',color:'#97a585',skin:'#c79977',heading:-Math.PI/2,watchKind:'boxing-sparring',patrol:[point(-13,-23),point(-13,-17)],spectate:point(-13,-23),personality:'Warm, curious and analytical',backstory:'A local sports enthusiast who enjoys reading the bout scorecard and cheering clean technique.',skills:{officiating:63,coordination:52}}
]);
