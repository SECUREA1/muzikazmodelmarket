import {FORGE_ID,FORGE_STATIONS,FORGE_CREW,isForgeEnvironment,forgeStations,forgeCrew,forgeObjectPoint} from './forge-config.js?v=forge-atelier-20261031';
import {FORGE_ITEMS,forgeItemSettings} from './forge-items.js?v=forge-atelier-20261031';
const clone=value=>structuredClone(value);
export const FORGE_BUILDER_LAYOUT=Object.freeze({name:'Emberfall · Traditional Forge',icon:'⚒',description:'A complete editable smithy with six defined work bays, a product gallery, live MZK market, receipt-backed dispatch yard, marked courier lanes and three AI specialists.',color:0x53453a,sky:0x251c19,mapSize:128,mapColor:'#ef9a49'});
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
  // Low, flush guides keep the working approach open while making each cell legible.
  for(const side of [-1,1])box('forge-bay-border-'+station.kind+'-'+side,station.name+' · inset bay edge',station.position.x+side*5.05,.002,-11,.06,.008,11,'#bd8d49');
  box('forge-bay-header-'+station.kind,station.name+' · suspended workstation header',station.position.x,4.7,-17,8.4,.3,.18,'#b28b55');
 }
 box('forge-main-aisle','Wide sandstone workshop aisle',0,-.06,5,83,.06,17,'#8c7960');
 box('forge-arrival-path','Forge arrival avenue',0,-.06,25.75,14,.06,23.5,'#88775e');
 box('forge-rear-chimney','Hearth extraction chimney',-18,6,-18,2,7,2,'#4b3c34');
 // North-side service shelves and the inspection side keep tools off the operator aisle.
 for(const x of [-30,-6,18])box('forge-work-bay-sill-'+x,'Raised stone service sill',x,0,-20,8.8,.23,.7,'#6f6253');
 for(const x of [-24,-12,0,12,24])box('forge-clerestory-fin-'+x,'High copper clerestory fin',x,8.25,-3,.12,.9,36,'#9b7850');
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
 // The same physical market device and product shelves used by public shops
 // open live offers; browsing these displays never grants a free product.
 const products=Object.entries(FORGE_ITEMS).filter(([,item])=>item.kind==='product').map(([id])=>id);
 objects.push(placed('forge-market-kiosk','market-atm','Emberfall MZK Forge Market',29,27,{functionalSettings:{behavior:'interact',device:'market-atm',interactionDistance:5,storeProductIds:products,prompt:'Shop forge equipment & metalwork · E / Use',destructible:false,damage:0}}));
 for(const [index,productId]of ['forge-damascus-blade','forge-aegis-shield','forge-lantern','forge-bronze-bell'].entries()){
  if(!FORGE_ITEMS[productId])continue;
  objects.push(placed('forge-shop-plinth-'+index,'material:display-plinth','Forge Market · '+FORGE_ITEMS[productId].name,18+index*4,21,{functionalSettings:{behavior:'decor',storeProductIds:[productId],destructible:false,damage:0}}));
 }
 sign('forge-shop-board','FORGE MARKET · Inspect, buy & trade',21,29,'Inspect a displayed item for its live MZK offer or use the Market terminal to browse equipment, metalwork and member trades. Purchased items share the same Backpack and Builder identity as forged pieces. Stock and delivery availability come from the world supply system.');
 // Dispatch has empty physical staging pads. Sealed crates are added by the
 // receipt-backed activity projection only when real warehouse units exist.
 box('forge-dispatch-apron','Freight yard · level sandstone apron',-35,-.06,26.5,27,.06,22,'#756b5d');
 box('forge-dispatch-west-wall','Freight shed · dressed stone west wall',-48,0,28,.45,3.4,25,'#5d554a');
 for(const x of [-47,-24])for(const z of [16,38])box('forge-dispatch-post-'+x+'-'+z,'Freight shed · braced canopy post',x,0,z,.45,6.3,.45,'#514739');
 box('forge-dispatch-canopy','Freight shed · copper dispatch canopy',-35,6.3,27,25,.2,24,'#8b7051');
 for(const z of [16,38])box('forge-dispatch-roof-beam-'+z,'Freight shed · high roof beam',-35,6,z,25,.3,.4,'#453d32');
 box('forge-courier-lane','Dispatch · clear courier lane',-36.3,-.03,28,2.8,.04,26,'#a79b82');
 for(const x of [-37.8,-34.8])box('forge-courier-edge-'+x,'Dispatch · flush brass lane edge',x,.003,28,.08,.008,26,'#d4ab62');
 for(const z of [18,24,30,36])box('forge-courier-chevron-'+z,'Dispatch · inset route chevron',-36.3,.014,z,1.8,.008,.14,'#d4ab62');
 for(const [index,z]of [21,28,35].entries()){
  box('forge-cargo-pallet-'+index,'Counted freight staging pad '+(index+1),-41,0,z,4.8,.3,4.8,'#66513d');
  for(const side of [-1,1])box('forge-cargo-strap-'+index+'-'+side,'Staging pad · brass index strip',-41+side*1.8,.3,z,.08,.008,4.4,'#bd9255');
 }
 objects.push(placed('forge-dispatch-desk','factory-export-terminal','Emberfall · Sealed freight & route desk',-31,21,{functionalSettings:{behavior:'interact',active:true,forgeDispatch:true,forgeDispatchSection:'dispatch',forgeDispatchApproach:{x:0,y:0,z:4},factoryStation:false,logisticsStation:false,interactionDistance:6,destructible:false,damage:0,prompt:'Inspect sealed lots & shipping routes · E / Use'}}));
 objects.push(placed('forge-dispatch-inspection','forge-finishing-bench','Freight inspection · Maker marks & seals',-25,34,{functionalSettings:{behavior:'talk',forgeStation:false,forgeInspection:true,interactionDistance:5,destructible:false,damage:0,prompt:'Inspect freight ownership & seals · E / Use'},dialogueSettings:{text:'A sealed freight unit consumes its exact hand-forged Backpack copy. Its maker receipt follows the counted warehouse lot. Shipping reservations move existing units; destination stock increases only after the verified route and final delivery are complete. Inspect the route desk before booking dispatch.'}}));
 objects.push(placed('forge-trade-policy-board','street-sign','MZK · Ownership, freight & delivery rules',-18,22,{functionalSettings:{behavior:'interact',active:true,forgePolicy:true,forgePolicyApproach:{x:0,y:0,z:4},interactionDistance:6,destructible:false,damage:0,prompt:'MZK ownership, freight & delivery rules · E / Use'}}));
 sign('forge-freight-board','DISPATCH · From maker to destination',-45,40,'The staging pads start empty. Only verified warehouse stock appears as sealed crates. Use the route desk to seal a creation from Backpack, inspect its counted lot and dispatch it through an available shipping route. The gold lane stays clear for couriers and operators.');
 box('forge-market-walk','Market · sandstone product gallery walk',25,-.04,27,23,.05,15,'#96846b');
 box('forge-route-promenade','Forge · connected shop and gateway promenade',0,-.05,40,97,.05,5,'#8e826d');

 for(const x of [-40,40])for(const z of [24,42])objects.push(placed('forge-yard-light-'+x+'-'+z,'lamp-post','Smithy yard lantern',x,z));
 for(const [id,name,x,target]of [['forge-commons-gate','World Commons',-23,'public-commons'],['forge-factory-gate','World Item Factory',23,'world-item-factory'],['forge-shipping-gate','Playable shipping routes',46,'hormuz-shipping']])objects.push(placed(id,'archway',name+' gateway',x,43,{functionalSettings:{behavior:'interact',action:'teleport',interactionDistance:6,prompt:name+' · E / Use',portal:{enabled:true,destinationType:'map',targetMapId:target},destructible:false,damage:0}}));
 return objects;
}
export function forgeBuilderLayoutMeta(scene,base={}){
 if(!isForgeEnvironment({builderScene:scene})&&!scene.sourceForge?.enabled)return {...base};
 const forge=settings(scene.sourceForge||scene.layoutMeta?.forge),environment={forge,builderScene:scene},old=scene.layoutMeta?.locations||[],retained=old.filter(place=>!place.forgeStationId&&!FORGE_STATIONS.some(station=>station.id===place.id));
 const available=object=>object&&object.enabled!==false&&object.active!==false&&object.visible!==false&&!object.deleted&&!object.disabled&&object.functionalSettings?.active!==false&&object.functionalSettings?.enabled!==false&&!object.functionalSettings?.disabled;
 const activeObject=id=>(scene.objects||[]).find(object=>object.id===id&&available(object));
 const service=flag=>(scene.objects||[]).find(object=>available(object)&&object.functionalSettings?.[flag]);
 const desk=service('forgeDispatch'),policy=service('forgePolicy');
 const yard=desk?{id:'forge-dispatch-yard',sourceMapId:'factory',dispatchObjectId:desk.id,dispatchPosition:forgeObjectPoint(desk),workshopAisleZ:0,dispatchApproach:forgeObjectPoint(desk,desk.functionalSettings?.forgeDispatchApproach||{x:0,y:0,z:4}),courierWaypoints:[18,24,30,36].flatMap(z=>{const marker=activeObject('forge-courier-chevron-'+z);return marker?[forgeObjectPoint(marker)]:[];}),cargoSlots:[0,1,2].flatMap(index=>{const object=activeObject('forge-cargo-pallet-'+index);return object?[{id:object.id,objectId:object.id,position:forgeObjectPoint(object,{x:0,y:1.2,z:0}),capacity:1}]:[];})}:null;
 const workspaces=forgeStations(environment).map(station=>{
  const dx=station.approach.x-station.position.x,dz=station.approach.z-station.position.z,span=Math.hypot(dx,dz)||1;
  const position={x:station.approach.x+dz/span*3.4+dx/span*2.8,y:station.approach.y,z:station.approach.z-dx/span*3.4+dz/span*2.8};
  return {id:'forge-workspace-'+station.id,kind:station.kind,stationId:station.id,position,approach:{...station.approach}};
 });
 const dynamicIds=new Set(['forge-dispatch-yard','forge-policies']);
 const locations=retained.filter(place=>!dynamicIds.has(place.id));
 if(yard)locations.push({id:'forge-dispatch-yard',name:'Sealed freight · Dispatch & shipping routes',...yard.dispatchApproach,width:19,depth:14,description:'Seal exact Backpack creations into counted warehouse units, inspect real stock and choose a verified shipping route.'});
 if(policy)locations.push({id:'forge-policies',name:'MZK ownership · Trading & freight policies',...forgeObjectPoint(policy,policy.functionalSettings?.forgePolicyApproach||{x:0,y:0,z:4}),width:8,depth:8,description:'Review MZK kit prices, Backpack ownership, resale receipts, sealing and delivery policies.'});
 return {...base,...scene.layoutMeta,color:0x53453a,forge,forgeYard:yard,forgeCrewWorkspaces:workspaces,locations:[...forgeStations(environment).map(station=>({id:station.id,forgeStationId:station.id,name:station.name,x:station.approach.x,y:station.approach.y,z:station.approach.z,width:9,depth:8,description:station.description})),...locations],residents:forgeCrew(environment)};
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
 return editableForgeScene({version:3,id,name,layout:'forge',sourceLayout:'forge',sourceGame:'forge',sourceEnvironmentId:FORGE_ID,mapSize:128,weather:'clear',sourceSpawn:{x:0,y:.02,z:37,rotationY:0},sourceForge:settings(),objects:forgeBuilderObjects(),layoutMeta:{color:0x53453a,locations:[{id:'forge-arrival',name:'Forge arrival & work orders',x:0,y:.02,z:37,width:38,depth:14,description:'Read the work orders, meet the smithy crew and visit the neighboring World Item Factory.'},{id:'forge-crew-court',name:'Smiths’ courtyard',x:0,z:7,width:68,depth:14,description:'Meet the master smith, metallurgist and quartermaster for local objectives and forging advice.'},{id:'forge-market',name:'Emberfall MZK Market & product gallery',x:27,y:.02,z:30,width:20,depth:14,description:'Inspect real forge products, compare live MZK offers and shop through the shared Market terminal.'}]},gameplay:{multiplayer:true,friendlyFire:false,radTox:false,forge:{enabled:true}}});
}
