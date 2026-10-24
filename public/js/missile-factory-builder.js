import {FACTORY_ID,FACTORY_STATIONS,FACTORY_RECIPES,FACTORY_CREW,FACTORY_LOCATIONS,isFactoryEnvironment,factoryStations,factoryCrew} from './missile-factory-config.js';
import {FACTORY_ITEMS,factoryItemSettings} from './missile-factory-items.js';

const clone=value=>structuredClone(value);
const vector=(x,z,y=0)=>({x,y,z});
export const FACTORY_BUILDER_LAYOUT=Object.freeze({name:'Missile & Rocket Factory',icon:'🏭',description:'A complete editable factory with six production stations, animated equipment, four AI crew members and working construction vehicles. Move, rotate, resize or remove each item, then test your own MZK production and freight route.',color:0x293c44,sky:0x132b35,mapSize:160,mapColor:'#ef8b45'});
export const FACTORY_BUILDER_CONSTRUCTION=Object.freeze({enabled:true,tower:{x:-65,z:-38,width:6,depth:6,baseY:0,floorHeight:4,maxFloors:3},supply:{x:-65,y:.8,z:10},excavation:{x:65,z:10,width:16,depth:16,radius:8,maxDepth:4},stockpile:{x:65,z:58,width:16,depth:16},yard:{minX:-76,maxX:76,minZ:-70,maxZ:70},earthworks:{cellSize:2,patches:[]},crew:{autoStart:false,muster:{x:-64,y:0,z:45},jobBoard:{x:-64,y:0,z:40},staging:{x:-62,y:0,z:52},loading:{x:65,y:0,z:20},dump:{x:65,y:0,z:58},grade:{x:65,y:0,z:58}}});
const equipment={procurement:'factory-procurement-terminal',fabrication:'factory-fabricator',assembly:'factory-assembly-jig',calibration:'factory-calibration-rig',loading:'factory-loading-bay',dispatch:'factory-dispatch-terminal'};
const settings=source=>({...clone(source||{}),enabled:true,currency:'MZK',editableEquipment:true,editableStations:true,editableCrew:true,width:110,depth:110,stations:clone(source?.stations||FACTORY_STATIONS),recipes:clone(source?.recipes||FACTORY_RECIPES),crew:clone(source?.crew||FACTORY_CREW)});
const isFactoryObject=object=>Boolean(typeof object.functionalSettings?.factoryStation==='string'&&object.functionalSettings.factoryStation)||Boolean(object.functionalSettings?.factoryCrewId)||object.functionalSettings?.factoryStation!==false&&Boolean(FACTORY_ITEMS[object.asset?.buildAssetId||object.modelId]?.kind);

function item(id,modelId,position,extra={}){
 const definition=FACTORY_ITEMS[modelId];return {id,modelId,name:definition?.name||modelId,asset:{buildAssetId:modelId},objectType:definition?.kind?'interactive':'props',position,rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},groundOffset:position.y||0,materialSettings:{accent:'#ef8b45',useAccent:false},animationState:{enabled:true,speed:1,loop:true,autoplay:true},functionalSettings:factoryItemSettings(modelId)||{behavior:'decor',active:true,destructible:false,damage:0},metadata:{factoryEquipment:true,upgradeable:true},...extra};
}

/** All production assemblies and people are independent editor selections. */
export function factoryBuilderObjects(){
 const objects=FACTORY_STATIONS.map(station=>item(station.id,equipment[station.kind],station.kind==='loading'?vector(station.position.x,station.position.z):vector(station.equipmentPosition.x,station.equipmentPosition.z),{name:station.name}));
 for(const x of [-16,16])objects.push(item('factory-conveyor-'+x,'factory-conveyor',vector(x,-5),{rotation:{x:0,y:Math.PI/2,z:0}}));
 objects.push(item('factory-training-display','factory-training-missile',vector(-10,-20),{rotation:{x:0,y:Math.PI/2,z:0}}));
 objects.push(item('factory-cargo-display','factory-cargo-rocket',vector(3,-34),{rotation:{x:0,y:Math.PI/2,z:0}}));
 for(const [id,modelId,name,x,z,yaw]of [['factory-freight-truck','site-dumptruck','HT-40 Factory Freight Truck',40,38,Math.PI],['factory-yard-crane','tower-crane','Atlas Factory Tower Crane',-64,-5,0],['factory-yard-excavator','site-excavator','EX-300 Materials Excavator',63,25,0],['factory-yard-dozer','site-bulldozer','D9 Yard Bulldozer',63,47,Math.PI/2]])objects.push(item(id,modelId,vector(x,z),{name,objectType:'vehicle',rotation:{x:0,y:yaw,z:0},functionalSettings:{behavior:'vehicle',active:true,interactionKey:'e',interactionDistance:6,prompt:'Operate '+name+' · E / Use',destructible:false,health:1000,damage:0}}));
 for(const crew of FACTORY_CREW)objects.push(item(crew.id,'world-resident',vector(crew.home.x,crew.home.z),{name:crew.name,objectType:'npc',avatarSettings:{displayName:crew.name,bodyColor:crew.skin,outfitColor:crew.color},functionalSettings:{behavior:'talk',active:true,factoryCrewId:crew.id,factoryCrew:clone(crew),interactionKey:'e',interactionDistance:4,prompt:'Factory crew / jobs · '+crew.name,destructible:false,damage:0},dialogueSettings:{text:crew.greeting},metadata:{factoryCrew:true,upgradeable:true}}));
 return objects;
}

function editableBase(base,source){if(!base)return base;const value=clone(base),factory=settings(source||value.factory||value.builderScene?.layoutMeta?.factory);value.factory=factory;value.builderScene={...value.builderScene,sourceFactory:clone(factory),layoutMeta:{...value.builderScene?.layoutMeta,factory:clone(factory)}};return value;}

/** Migration happens once; deleting equipment or crew never repopulates them. */
export function editableFactoryScene(input){
 const scene=clone(input),source=scene.sourceFactory||scene.layoutMeta?.factory,layout=scene.sourceLayout||scene.layout;
 if(!(source?.enabled||layout==='missile-factory'||isFactoryEnvironment(scene.baseEnvironment)||(scene.objects||[]).some(isFactoryObject)))return scene;
 const converted=source?.editableEquipment===true,native=layout==='missile-factory'||scene.baseEnvironment?.id===FACTORY_ID||(scene.baseEnvironment?.builderScene?.sourceLayout||scene.baseEnvironment?.builderScene?.layout||scene.baseEnvironment?.layout)==='missile-factory';
 scene.sourceFactory=settings(source);scene.layoutMeta={...scene.layoutMeta,factory:clone(scene.sourceFactory)};
 scene.gameplay={...scene.gameplay,factory:{enabled:true},radTox:false};
 if(native){scene.sourceGame='missile-factory';scene.sourceLayout='missile-factory';scene.sourceSpawn||={x:0,y:.02,z:56,rotationY:0};scene.sourceConstruction=clone(scene.sourceConstruction||scene.layoutMeta.construction||FACTORY_BUILDER_CONSTRUCTION);scene.layoutMeta.construction=clone(scene.sourceConstruction);scene.baseEnvironment=editableBase(scene.baseEnvironment,scene.sourceFactory);}
 if(native&&!converted){const supplied=factoryBuilderObjects(),defaults=new Map(supplied.map(object=>[object.id,object]));scene.objects=(scene.objects||[]).map(object=>{const template=defaults.get(object.id);if(!template)return object;return {...template,...object,functionalSettings:{...template.functionalSettings,...object.functionalSettings,...(template.functionalSettings.factoryStation?{factoryStation:template.functionalSettings.factoryStation,factoryApproach:clone(object.functionalSettings?.factoryApproach||template.functionalSettings.factoryApproach)}:{})}};});const ids=new Set(scene.objects.map(object=>object.id));scene.objects.push(...supplied.filter(object=>!ids.has(object.id)));}
 scene.layoutMeta=factoryBuilderLayoutMeta(scene,scene.layoutMeta);return scene;
}

export function createFactoryBuilderScene({id='custom-missile-factory',name='Missile & Rocket Factory · Custom'}={}){
 return editableFactoryScene({version:3,id,name,layout:'missile-factory',mapSize:160,weather:'clear',sourceEnvironmentId:FACTORY_ID,sourceLayout:'missile-factory',sourceGame:'missile-factory',sourceSpawn:{x:0,y:.02,z:56,rotationY:0},sourceConstruction:clone(FACTORY_BUILDER_CONSTRUCTION),layoutMeta:{color:0x293c44,factory:{enabled:true},construction:clone(FACTORY_BUILDER_CONSTRUCTION),locations:clone(FACTORY_LOCATIONS)},gameplay:{multiplayer:true,friendlyFire:false,radTox:false,factory:{enabled:true}},objects:[]});
}

/** The saved local map follows each moved, rotated and removed station. */
export function factoryBuilderLayoutMeta(scene,layout={}){
 const source=scene.sourceFactory||scene.layoutMeta?.factory;
 if(!(source?.enabled||scene.sourceLayout==='missile-factory'||scene.layout==='missile-factory'||(scene.objects||[]).some(isFactoryObject)))return clone(layout);
 scene.sourceFactory=settings(source);const environment={id:scene.id,factory:scene.sourceFactory,builderScene:scene},stations=factoryStations(environment),crew=factoryCrew(environment),old=scene.layoutMeta?.locations||[];
 const stationIds=new Set(FACTORY_STATIONS.map(station=>station.id));
 const locations=old.filter(place=>!stationIds.has(place.id)&&!place.factoryStationId&&!String(place.id).startsWith('factory-instance:'));
 locations.push(...stations.map(station=>({id:station.id,factoryStationId:station.id,name:station.name,x:station.position.x,y:station.position.y,z:station.position.z,width:station.kind==='loading'?16:14,depth:12,description:station.description})));
 return {...clone(layout),factory:clone(scene.sourceFactory),...(scene.sourceConstruction?{construction:clone(scene.sourceConstruction)}:{}),locations:clone(locations),residents:clone(crew)};
}
