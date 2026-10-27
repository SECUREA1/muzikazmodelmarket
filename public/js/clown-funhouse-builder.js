import {FUNHOUSE_ID,FUNHOUSE_STATIONS,FUNHOUSE_LOCATIONS,funhouseStations,isFunhouseEnvironment} from './clown-funhouse-config.js';
import {FUNHOUSE_ITEMS,funhouseItemSettings} from './clown-funhouse-items.js';

const clone=value=>structuredClone(value);
export const FUNHOUSE_BUILDER_LAYOUT=Object.freeze({name:'Midnight Laughs Funhouse',icon:'♧',description:'The complete clown carnival as separately editable attractions, characters, costumes and scenery. Move, rotate, resize or remove an assembly and add more from Items → Clown funhouse.',color:0x24152e,sky:0x100c21,mapSize:120,mapColor:'#e56ca8'});
const row=(id,modelId,x,z,extra={})=>({id:'carnival-'+id,modelId,position:{x,y:0,z},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},...extra});
const primary=(kind,x,z)=>({stationKind:kind,stationPosition:{x,y:.02,z}});
// Assembly identities and quantities are shared by the public bill of materials
// and the editable template. Internal bulbs and fasteners stay in their model.
export const FUNHOUSE_COMPONENT_PLACEMENTS=Object.freeze([
 row('foundation','funhouse-midway-floor',0,0),
 row('house','funhouse-horror-house',0,-28,primary('mirrors',-8,-19)),
 row('maze-east','funhouse-mirror-wall',-3,-32,{rotation:{x:0,y:Math.PI/2,z:0},scale:{x:24/18,y:1,z:1}}),
 row('maze-turn-one','funhouse-mirror-wall',-15,-24),row('maze-turn-two','funhouse-mirror-wall',-12,-33),
 row('maze-bell','funhouse-maze-bell',-18,-41.8,primary('maze-finish',-18,-38)),
 row('gallery','funhouse-water-gallery',-30,3,primary('water',-30,12)),
 row('car','funhouse-clown-car',28,25,{...primary('car',24,28),position:{x:28,y:.39,z:25}}),
 row('spinner','funhouse-dizzy-spinner',28,-4,primary('spinner',24,2)),
 row('dressing-room','funhouse-dressing-room',-28,29,primary('dressup',-28,34)),
 row('ball-pit','funhouse-ball-pit',14,-23.5,{...primary('ballpit',10,-21),position:{x:14,y:-.06,z:-23.5}}),
 row('jack-main','funhouse-jack-box',16,-38,primary('jackbox',14,-33)),
 row('jack-side','funhouse-jack-box',20,-29),
 row('popcorn','funhouse-popcorn-stall',-45,29),row('tickets','funhouse-ticket-booth',45,39),row('candy','funhouse-candy-stall',45,14),
 ...[[-48,9],[47,-9],[-44,-12],[42,-33]].map(([x,z],index)=>row('tent-'+index,'funhouse-circus-tent',x,z)),
 ...[-1,1].flatMap(side=>Array.from({length:29},(_,index)=>row('fence-side-'+side+'-'+index,'funhouse-fence',side*56,-56+index*4,{rotation:{x:0,y:Math.PI/2,z:0}}))),
 ...[-56,56].flatMap(z=>Array.from({length:29},(_,index)=>-56+index*4).filter(x=>z<0||Math.abs(x)>=9).map(x=>row('fence-end-'+z+'-'+x,'funhouse-fence',x,z))),
 ...[[-9,46],[9,46],[-39,19],[38,33],[-10,-8],[10,-8],[-37,40],[35,8]].map(([x,z],index)=>row('balloons-'+index,'funhouse-balloon-bunch',x,z)),
 ...[[39,7.5],[20,8],[-6,8.2]].map(([z,y],index)=>row('bunting-'+index,'funhouse-bunting',0,z,{position:{x:0,y:y-1.9,z},scale:{x:76/12,y:1,z:1}})),
 ...[[-9,23],[9,23],[-40,40],[39,40],[-9,4],[9,4],[-31,-8],[32,-17]].map(([x,z],index)=>row('lamp-'+index,'funhouse-lamp',x,z)),
 row('welcome','funhouse-welcome-board',-8,40,primary('welcome',0,40)),
 row('greeter','funhouse-greeter-avatar',7,37,{position:{x:7,y:.0276,z:37},scale:{x:2.03614,y:2.03614,z:2.03614}}),
 row('juggler','funhouse-juggler-avatar',13,19,{position:{x:13,y:.0252,z:19},scale:{x:1.85908,y:1.85908,z:1.85908}}),
 row('ringmaster','funhouse-ringmaster-avatar',-18.4,30.4,{includedIn:'funhouse-dressing-room',parentObjectId:'carnival-dressing-room'}),
 row('driver','funhouse-driver-avatar',-10,7,{position:{x:-10,y:.0252,z:7},scale:{x:1.85908,y:1.85908,z:1.85908}}),
 row('scare-clown','funhouse-scare-clown-avatar',19,-17,{position:{x:19,y:.0252,z:-17},scale:{x:1.85908,y:1.85908,z:1.85908}}),
 // Nested pieces have their own market identities, but the complete assembly
 // already renders them. A copy must never place these pieces twice.
 ...[-5,0,5].map((x,index)=>row('water-blaster-'+index,'funhouse-water-gun',-30+x,7.5,{includedIn:'funhouse-water-gallery',parentObjectId:'carnival-gallery'})),
 ...Array.from({length:6},(_,index)=>row('target-'+index,'funhouse-clown-target',-37.5+index*3,3,{includedIn:'funhouse-water-gallery',parentObjectId:'carnival-gallery'})),
 ...Array.from({length:3},(_,index)=>row('hat-'+index,'funhouse-propeller-hat',-35.1+index*1.65,29,{includedIn:'funhouse-dressing-room',parentObjectId:'carnival-dressing-room'})),
 row('shoe-display','funhouse-clown-shoes',-22.55,29.1,{includedIn:'funhouse-dressing-room',parentObjectId:'carnival-dressing-room'}),
 ...Array.from({length:5},(_,index)=>row('surprise-passenger-'+index,'funhouse-driver-avatar',25.2+index*1.4,21.2,{includedIn:'funhouse-clown-car',parentObjectId:'carnival-car'})),
 ...[[16,-38],[20,-29]].map(([x,z],index)=>row('fright-box-clown-'+index,'funhouse-scare-clown-avatar',x,z,{includedIn:'funhouse-jack-box',parentObjectId:index?'carnival-jack-side':'carnival-jack-main'}))
]);

export function funhouseBuilderObjects({includeFoundation=false,includeContained=false}={}){
 return FUNHOUSE_COMPONENT_PLACEMENTS.filter(placement=>(includeFoundation||placement.modelId!=='funhouse-midway-floor')&&(includeContained||!placement.includedIn)).map(placement=>{
  const definition=FUNHOUSE_ITEMS[placement.modelId];if(!definition)throw Error('Missing funhouse item '+placement.modelId);
  const settings=funhouseItemSettings(placement.modelId),position=clone(placement.position),scale=clone(placement.scale),rotation=clone(placement.rotation);
  const canonical=FUNHOUSE_STATIONS.find(station=>station.kind===placement.stationKind);
  // Additional copies stay decorative until the builder explicitly enables a
  // station. The primary approach is authored in each assembly's local frame.
  const functionalSettings={...settings,funhouseStation:false,funhouseKind:false,active:true,damage:0,destructible:false};
  if(canonical){
   const offset={x:placement.stationPosition.x-position.x,y:placement.stationPosition.y-position.y,z:placement.stationPosition.z-position.z},angle=-rotation.y;
   Object.assign(functionalSettings,{behavior:'interact',funhouseStation:canonical.kind,funhouseKind:canonical.kind,funhouseStationId:canonical.id,funhouseApproach:{x:(offset.x*Math.cos(angle)+offset.z*Math.sin(angle))/scale.x,y:offset.y/scale.y,z:(-offset.x*Math.sin(angle)+offset.z*Math.cos(angle))/scale.z},funhouseMazeGroup:'midnight-maze',interactionKey:'e',interactionDistance:6.5,prompt:canonical.prompt});
  }
  return {id:placement.id,modelId:placement.modelId,name:definition.name,objectType:definition.type==='avatar'?'npc':canonical?'interactive':definition.type,asset:{buildAssetId:placement.modelId},position,rotation,scale,groundOffset:position.y,placementAnchor:'collider-base',materialSettings:{accent:'#e56ca8',useAccent:false},animationState:{enabled:true,speed:1,loop:true,autoplay:true},functionalSettings,...(definition.type==='avatar'?{avatarSettings:{displayName:definition.name,bodyColor:'#f4dfae',outfitColor:'#e56ca8'},dialogueSettings:{text:definition.dialogue}}:{}),metadata:{funhouseEquipment:true,upgradeable:true}};
 });
}

export function funhouseNativeComponents(){
 const groups=new Map();for(const placement of FUNHOUSE_COMPONENT_PLACEMENTS){
  const group=groups.get(placement.modelId)||{modelId:placement.modelId,count:0,placedCount:0,includedIn:[]};group.count++;
  if(placement.includedIn){const owner=group.includedIn.find(value=>value.modelId===placement.includedIn);if(owner)owner.count++;else group.includedIn.push({modelId:placement.includedIn,count:1});}else group.placedCount++;
  groups.set(placement.modelId,group);
 }
 return [...groups.values()];
}

const settings=source=>({...clone(source||{}),enabled:true,editableItems:true});
function editableBase(base){if(!base)return base;const value=clone(base);value.funhouse=settings(value.funhouse);value.builderScene={...value.builderScene,sourceFunhouse:settings(value.builderScene?.sourceFunhouse||value.funhouse),layoutMeta:{...value.builderScene?.layoutMeta,funhouse:settings(value.builderScene?.layoutMeta?.funhouse)}};return value;}

/** Migrate a fixed carnival once. Later removals and transforms remain saved. */
export function editableFunhouseScene(input){
 const scene=clone(input),source=scene.sourceFunhouse||scene.layoutMeta?.funhouse;
 if(!(scene.sourceLayout==='clown-funhouse'||scene.layout==='clown-funhouse'||isFunhouseEnvironment(scene.baseEnvironment)||source?.enabled))return scene;
 const converted=source?.editableItems===true;
 scene.sourceGame='funhouse';scene.sourceLayout='clown-funhouse';scene.sourceFunhouse=settings(source);scene.sourceSpawn||={x:0,y:.02,z:48,rotationY:0};scene.mapSize=Number(scene.mapSize)||120;
 scene.layoutMeta={...scene.layoutMeta,color:0x24152e,sky:0x100c21,funhouse:settings(source),locations:clone(scene.layoutMeta?.locations||FUNHOUSE_LOCATIONS)};
 scene.gameplay={...scene.gameplay,multiplayer:true,friendlyFire:false,radTox:false,funhouse:{enabled:true}};scene.baseEnvironment=editableBase(scene.baseEnvironment);
 if(!converted){const kept=scene.objects||[],ids=new Set(kept.map(object=>object.id));scene.objects=[...kept,...funhouseBuilderObjects().filter(object=>!ids.has(object.id))];}
 delete scene.nativeComponents;
 return scene;
}
export function createFunhouseBuilderScene({id='custom-clown-funhouse',name='Midnight Laughs Funhouse · Custom'}={}){
 return editableFunhouseScene({version:3,id,name,layout:'clown-funhouse',mapSize:120,weather:'clear',sourceEnvironmentId:FUNHOUSE_ID,sourceLayout:'clown-funhouse',sourceGame:'funhouse',sourceSpawn:{x:0,y:.02,z:48,rotationY:0},layoutMeta:{color:0x24152e,funhouse:{enabled:true}},objects:[]});
}
export function funhouseBuilderLayoutMeta(scene,layout={}){
 if(scene.sourceGame!=='funhouse'&&scene.sourceLayout!=='clown-funhouse'&&scene.layout!=='clown-funhouse')return clone(layout);
 const stations=funhouseStations({id:scene.id,game:'funhouse',builderScene:scene}),locations=stations.map(station=>({id:station.id,name:station.name,x:station.position.x,y:station.position.y,z:station.position.z,width:8,depth:8,funhouseStationId:station.id,description:station.prompt}));
 return {...clone(layout),funhouse:settings(scene.sourceFunhouse||scene.layoutMeta?.funhouse),locations};
}
