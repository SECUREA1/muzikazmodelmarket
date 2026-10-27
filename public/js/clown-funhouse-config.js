// Shared map positions keep rendered scenery, local maps and server actions aligned.
export const FUNHOUSE_ID='muzikaz-clown-funhouse';
export const isFunhouseEnvironment=environment=>environment?.id===FUNHOUSE_ID||environment?.game==='funhouse'||environment?.builderScene?.layout==='clown-funhouse'||environment?.builderScene?.sourceLayout==='clown-funhouse';
const station=(id,kind,name,x,z,prompt)=>({id:'funhouse-'+id,kind,name,position:{x,y:.02,z},prompt:prompt||'Use '+name+' · E / Use'});
export const FUNHOUSE_STATIONS=Object.freeze([
 station('welcome','welcome','Midnight Laughs Welcome',0,40,'Explore the funhouse · E / Use'),
 station('water-gallery','water','Splash the Clowns',-30,12,'Play the water-gun gallery · E / Use'),
 station('clown-car','car','Impossible Clown Car',24,28,'Honk the clown car · E / Use'),
 station('spinner','spinner','Dizzy Hat Spinner',24,2,'Start the dizzy spinner · E / Use'),
 station('dressup','dressup','Clown Dressing Room',-28,34,'Try spinner hats & giant shoes · E / Use'),
 station('mirror-maze','mirrors','Crooked Mirror Maze',-8,-19,'Start the mirror maze · E / Use'),
 station('maze-finish','maze-finish','Mirror Maze Exit Bell',-18,-38,'Ring the maze exit bell · E / Use'),
 station('ball-pit','ballpit','Monster Ball Pit',10,-21,'Play in the monster ball pit · E / Use'),
 station('jack-box','jackbox','Jack in the Fright Box',14,-33,'Wind up the surprise box · E / Use')
]);

const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const vector=(value={},fallback=0)=>Array.isArray(value)?{x:finite(value[0],fallback),y:finite(value[1],fallback),z:finite(value[2],fallback)}:{x:finite(value?.x,fallback),y:finite(value?.y,fallback),z:finite(value?.z,fallback)};
const canonicalKind=kind=>FUNHOUSE_STATIONS.find(station=>station.kind===kind);
const enabled=value=>value?.active!==false&&value?.enabled!==false&&value?.visible!==false&&value?.disabled!==true&&value?.deleted!==true&&!(typeof value?.health==='number'&&value.health<=0)&&!['deleted','disabled','inactive'].includes(value?.status);
function rotateApproach(point,rotation){
 const x=rotation.x/2,y=rotation.y/2,z=rotation.z/2,c1=Math.cos(x),c2=Math.cos(y),c3=Math.cos(z),s1=Math.sin(x),s2=Math.sin(y),s3=Math.sin(z),qx=s1*c2*c3+c1*s2*s3,qy=c1*s2*c3-s1*c2*s3,qz=c1*c2*s3+s1*s2*c3,qw=c1*c2*c3-s1*s2*s3;
 const ix=qw*point.x+qy*point.z-qz*point.y,iy=qw*point.y+qz*point.x-qx*point.z,iz=qw*point.z+qx*point.y-qy*point.x,iw=-qx*point.x-qy*point.y-qz*point.z;
 return {x:ix*qw+iw*-qx+iy*-qz-iz*-qy,y:iy*qw+iw*-qy+iz*-qx-ix*-qz,z:iz*qw+iw*-qz+ix*-qy-iy*-qx};
}

function placedStation(object){
 const settings={...object.asset?.function_data,...object.asset?.configuration,...object.definition?.gameplay,...object.gameplay,...object.functionalSettings};
 const kind=settings.funhouseStation??settings.funhouseKind,canonical=canonicalKind(kind);
 if(!canonical||!enabled(object)||!enabled(settings)||object.holderId||settings.funhouseStation===false)return null;
 const objectId=String(object.id??object.objectId??object.definition?.objectId??'');if(!objectId||objectId.length>180||/[\x00-\x1f\x7f]/.test(objectId))return null;
 const position=vector(object.position||object.transform?.position||object.definition?.transform?.position),rotation=vector(object.rotation||object.transform?.rotation||object.definition?.transform?.rotation),rawScale=object.scale??object.transform?.scale??object.definition?.transform?.scale,scale=typeof rawScale==='number'?{x:rawScale,y:rawScale,z:rawScale}:vector(rawScale,1);
 const local=vector(settings.funhouseApproach),offset=rotateApproach({x:local.x*scale.x,y:local.y*scale.y,z:local.z*scale.z},rotation);
 const approach={x:position.x+offset.x,y:position.y+offset.y,z:position.z+offset.z};
 const station={...canonical,id:'funhouse-instance:'+objectId,objectId,canonicalStationId:canonical.id,source:'placed',kind:canonical.kind,name:String(object.name||object.asset?.name||object.definition?.name||canonical.name).slice(0,120),position:approach,equipmentPosition:position,equipmentModelId:object.asset?.buildAssetId||object.modelId||object.definition?.modelId,interactionDistance:Math.max(.5,Math.min(6.5,finite(settings.interactionDistance,6.5))),mazeGroup:String(settings.funhouseMazeGroup||'local-maze'),objectTransform:{position,rotation,scale}};
 station.stationRevision=JSON.stringify([station.id,station.kind,station.position,station.objectTransform]);
 return station;
}

/** Use the same placed transforms for the Builder, visible controls and server.
 * Fixed stations belong only to the permanent unedited map; deleted or moved
 * equipment in a copied map never leaves a hidden attraction behind. */
export function funhouseStations(environment={}, {actors}={}){
 environment||={};
 const scene=environment.builderScene||environment.placementScene||{},objects=Array.isArray(scene.objects)?scene.objects:[];
 if(environment.funhouse?.enabled===false||scene.sourceFunhouse?.enabled===false||scene.layoutMeta?.funhouse?.enabled===false)return [];
 const editable=scene.layoutMeta?.funhouse?.editableItems===true||scene.sourceFunhouse?.editableItems===true;
 const fixed=environment.id===FUNHOUSE_ID&&!editable?FUNHOUSE_STATIONS.map(station=>({...station,canonicalStationId:station.id,interactionDistance:6.5,mazeGroup:'native-maze'})):[];
 const runtime=actors&&typeof actors==='object'?actors:null,seen=new Set(),placed=[];
 for(const authored of objects){
  const id=String(authored.id??authored.objectId??'');if(seen.has(id))continue;seen.add(id);
  const actor=runtime?.[id],object=actor?{...authored,...actor,name:actor.name||actor.asset?.name||authored.name,asset:{...authored.asset,...actor.asset},functionalSettings:{...authored.functionalSettings,...actor.definition?.gameplay,...actor.functionalSettings}}:authored;
  const station=placedStation(object);if(station)placed.push(station);
 }
 for(const actor of Object.values(runtime||{})){const id=String(actor?.id??actor?.objectId??'');if(!id||seen.has(id))continue;const station=placedStation(actor);if(station)placed.push(station);}
 return [...fixed,...placed];
}
export const FUNHOUSE_LOCATIONS=Object.freeze([
 {id:'funhouse-house',name:'Horror Funhouse',x:0,z:-28,width:48,depth:32,description:'An enormous grinning clown doorway leads to crooked mirrors, a ball pit and a jack-in-the-box.'},
 {id:'funhouse-maze',name:'Crooked Mirror Maze',x:-14,z:-29,width:20,depth:28,description:'Follow the alternating passages and ring the exit bell.'},
 {id:'funhouse-gallery',name:'Water-Gun Gallery',x:-30,z:6,width:20,depth:16,description:'Splash the clown targets in a timed water-gun round.'},
 {id:'funhouse-car',name:'Clown Car Court',x:28,z:25,width:16,depth:14,description:'Honk a tiny carnival car and watch its ridiculous clown surprise show.'},
 {id:'funhouse-spinner',name:'Dizzy Hat Spinner',x:28,z:-4,width:18,depth:18,description:'A spinning carnival platform under a giant propeller hat.'},
 {id:'funhouse-dressup',name:'Clown Dressing Room',x:-28,z:30,width:20,depth:12,description:'Try a spinning propeller hat and enormous clown shoes.'},
 {id:'funhouse-midway',name:'Midnight Midway',x:0,z:22,width:24,depth:40,description:'Striped tents, balloons, carnival lights and clown hosts.'}
]);
// Axis-aligned physical walls. Renderers must use these dimensions verbatim.
export const FUNHOUSE_WALLS=Object.freeze([
 {id:'house-back',x:0,z:-44,width:48,depth:.5,height:7},
 {id:'house-west',x:-24,z:-28,width:.5,depth:32,height:7},
 {id:'house-east',x:24,z:-28,width:.5,depth:32,height:7},
 {id:'house-front-west',x:-14.5,z:-12,width:19,depth:.5,height:7},
 {id:'house-front-east',x:14.5,z:-12,width:19,depth:.5,height:7},
 {id:'maze-east',x:-3,z:-32,width:.35,depth:24,height:3.2,mirror:true},
 {id:'maze-turn-one',x:-15,z:-24,width:18,depth:.35,height:3.2,mirror:true},
 {id:'maze-turn-two',x:-12,z:-33,width:18,depth:.35,height:3.2,mirror:true}
]);
