import {FORGE_ID,FORGE_STATIONS,FORGE_CREW,isForgeEnvironment,forgeStations,forgeCrew} from './forge-config.js';
import {forgeItemSettings} from './forge-items.js';
const clone=value=>structuredClone(value);
export const FORGE_BUILDER_LAYOUT=Object.freeze({name:'Emberfall · Traditional Forge',icon:'⚒',description:'A complete editable smithy with charcoal hearth, anvil, quenching, tempering, finishing, market items and three AI specialists.',color:0x53453a,sky:0x251c19,mapSize:128,mapColor:'#ef9a49'});
const settings=source=>({...clone(source||{}),enabled:true,currency:'MZK',editableStations:true,editableCrew:true,stations:clone(FORGE_STATIONS),crew:clone(FORGE_CREW)});
const placed=(id,modelId,name,x,z,extra={})=>({id,modelId,asset:{buildAssetId:modelId},name,position:{x,y:0,z},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},placementAnchor:'collider-base',functionalSettings:forgeItemSettings(modelId)||{behavior:'decor',active:true,destructible:false,damage:0},...extra});
export function forgeBuilderObjects(){
 const objects=FORGE_STATIONS.map(station=>placed(station.id,station.modelId,station.name,station.position.x,station.position.z,{functionalSettings:{...forgeItemSettings(station.modelId),behavior:'interact',forgeStation:station.kind,forgeStationId:station.id,forgeApproach:{x:0,y:0,z:5},interactionDistance:station.interactionDistance,prompt:station.name+' · E / Use',destructible:false,damage:0}}));
 const box=(id,name,x,y,z,w,h,d,color)=>objects.push(placed(id,'material:cube',name,x,z,{position:{x,y,z},scale:{x:w/1.2,y:h/1.2,z:d/1.2},materialSettings:{accent:color,useAccent:true}}));
 // The high, open-sided roof keeps every work bay visible and walkable.
 box('forge-back-wall','Soot-dark brick north wall',0,0,-23,88,6,.8,'#47372f');
 for(const x of [-43,43])for(const z of [-22,15])box('forge-post-'+x+'-'+z,'Riveted timber roof support',x,0,z,.7,8,.7,'#3d3028');
 for(const z of [-22,15])box('forge-roof-beam-'+z,'Exposed smithy roof beam',0,7.5,z,87,.55,.6,'#362923');
 for(const x of [-32,-16,0,16,32])box('forge-truss-'+x,'Open clerestory roof truss',x,8,-3,.4,.35,38,'#3d3028');
 for(const x of [-34,34])box('forge-roof-wing-'+x,'Copper standing-seam canopy',x,8.5,-3,19,.2,39,'#5b4c3e');
 for(const station of FORGE_STATIONS){
  box('forge-bay-pad-'+station.kind,station.name+' · stone work pad',station.position.x,-.08,-11,10,.08,11,'#62574c');
  box('forge-bay-marker-'+station.kind,'Brass bay threshold',station.position.x,.003,-5.3,8,.01,.1,'#bd8d49');
 }
 box('forge-main-aisle','Wide sandstone workshop aisle',0,-.06,5,83,.06,17,'#8c7960');
 box('forge-arrival-path','Forge arrival avenue',0,-.06,29,14,.06,30,'#88775e');
 box('forge-rear-chimney','Hearth extraction chimney',-18,6,-18,2,7,2,'#4b3c34');
 for(const [id,model,name,x,z] of [
  ['forge-bellows-display','forge-bellows','Leather bellows · hearth air supply',-22,-13],
  ['forge-coal-supply','forge-coal-bin','Counted coal reserve',-35,-18],
  ['forge-grinding-display','forge-grinding-wheel','Water-cooled finishing wheel',37,-13],
  ['forge-hammer-display','forge-hammer','Smith’s hammer',-8,-15],
  ['forge-tongs-display','forge-tongs','Long-reach smithing tongs',-16,-16]
 ])objects.push(placed(id,model,name,x,z));
 for(const person of FORGE_CREW)objects.push(placed(person.id,person.modelId,person.name,person.home.x,person.home.z,{objectType:'npc',avatarSettings:{displayName:person.name,bodyColor:person.skin,outfitColor:person.color},functionalSettings:{behavior:'talk',active:true,forgeCrewId:person.id,forgeCrew:clone(person),forgeCrewEnabled:true,interactionDistance:4,prompt:'Talk / daily objectives · '+person.name,destructible:false,damage:0},dialogueSettings:{text:person.greeting}}));
 const sign=(id,name,x,z,text)=>objects.push(placed(id,'street-sign',name,x,z,{functionalSettings:{behavior:'talk',interactionDistance:4,prompt:'Read '+name,destructible:false,damage:0},dialogueSettings:{text}}));
 sign('forge-welcome-board','EMBERFALL · Forge work orders',-10,35,'Traditional forging: buy a measured material kit at the stock rack, heat, hammer, quench, temper, then finish. Walk to each named station and use Forge controls. Completed creations are saved in your Backpack. Meet Brann, Sera and Kade for guidance, objectives and conversation.');
 sign('forge-market-board','MZK Market · Tools, metal & finished items',10,35,'Forge stations, tools, materials, crew and finished pieces share the game item catalogue. Use Trading Market to buy with MZK, then open Backpack to equip or place compatible items in a world or your Builder map.');
 sign('forge-metallurgy-board','The art of heat treatment',24,10,'Heat makes the billet workable. Hammering shapes the hot metal. Quenching and tempering follow the work order’s heat-treatment stage. Inspect the final piece at the finishing bench.');
 for(const x of [-40,40])for(const z of [24,42])objects.push(placed('forge-yard-light-'+x+'-'+z,'lamp-post','Smithy yard lantern',x,z));
 for(const [id,name,x,target]of [['forge-commons-gate','World Commons',-23,'public-commons'],['forge-factory-gate','World Item Factory',23,'world-item-factory']])objects.push(placed(id,'archway',name+' gateway',x,43,{functionalSettings:{behavior:'interact',action:'teleport',interactionDistance:6,prompt:name+' · E / Use',portal:{enabled:true,destinationType:'map',targetMapId:target},destructible:false,damage:0}}));
 return objects;
}
export function forgeBuilderLayoutMeta(scene,base={}){
 if(!isForgeEnvironment({builderScene:scene})&&!scene.sourceForge?.enabled)return {...base};
 const forge=settings(scene.sourceForge||scene.layoutMeta?.forge),environment={forge,builderScene:scene},old=scene.layoutMeta?.locations||[],retained=old.filter(place=>!place.forgeStationId&&!FORGE_STATIONS.some(station=>station.id===place.id));
 return {...base,...scene.layoutMeta,color:0x53453a,forge,locations:[...forgeStations(environment).map(station=>({id:station.id,forgeStationId:station.id,name:station.name,x:station.approach.x,y:station.approach.y,z:station.approach.z,width:9,depth:8,description:station.description})),...retained],residents:forgeCrew(environment)};
}
export function editableForgeScene(input){
 const scene=clone(input);if(!isForgeEnvironment({builderScene:scene})&&!isForgeEnvironment(scene.baseEnvironment))return scene;
 scene.sourceForge=settings(scene.sourceForge||scene.layoutMeta?.forge||scene.baseEnvironment?.forge);scene.sourceGame='forge';scene.sourceLayout='forge';scene.sourceEnvironmentId||=FORGE_ID;scene.sourceSpawn||={x:0,y:.02,z:37,rotationY:0};
 scene.gameplay={...scene.gameplay,multiplayer:scene.gameplay?.multiplayer!==false,friendlyFire:false,radTox:false,forge:{enabled:true}};
 // Migration only annotates existing objects. Intentional deletions stay deleted.
 scene.objects=Array.isArray(scene.objects)?scene.objects:[];
 if(scene.baseEnvironment){scene.baseEnvironment={...scene.baseEnvironment,forge:clone(scene.sourceForge),builderScene:{...scene.baseEnvironment.builderScene,layout:'forge',objects:[],layoutMeta:{...scene.baseEnvironment.builderScene?.layoutMeta,forge:clone(scene.sourceForge)}}};}
 scene.layoutMeta=forgeBuilderLayoutMeta(scene,scene.layoutMeta||{});return scene;
}
export function createForgeBuilderScene({id='custom-forge',name='Emberfall · Custom Forge'}={}){
 return editableForgeScene({version:3,id,name,layout:'forge',sourceLayout:'forge',sourceGame:'forge',sourceEnvironmentId:FORGE_ID,mapSize:128,weather:'clear',sourceSpawn:{x:0,y:.02,z:37,rotationY:0},sourceForge:settings(),objects:forgeBuilderObjects(),layoutMeta:{color:0x53453a,locations:[{id:'forge-arrival',name:'Forge arrival & work orders',x:0,y:.02,z:37,width:38,depth:14,description:'Read the work orders, meet the smithy crew and visit the neighboring World Item Factory.'},{id:'forge-crew-court',name:'Smiths’ courtyard',x:0,z:7,width:68,depth:14,description:'Meet the master smith, metallurgist and quartermaster for local objectives and forging advice.'}]},gameplay:{multiplayer:true,friendlyFire:false,radTox:false,forge:{enabled:true}}});
}
