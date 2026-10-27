import {FACTORY_LOGISTICS_STATIONS,logisticsStations} from './factory-logistics-config.js';
import {FACTORY_LOGISTICS_ITEMS,factoryLogisticsItemSettings} from './factory-logistics-items.js';

const clone=value=>structuredClone(value);
const mapFor=scene=>scene.sourceEnvironmentId||scene.baseEnvironment?.id||({'missile-factory':'muzikaz-missile-factory','factory-proving-grounds':'muzikaz-factory-proving-grounds','mountain-compound':'muzikaz-mountain-compound'})[scene.sourceLayout||scene.layout]||scene.id;
const nativeMapIds=new Set(['muzikaz-missile-factory','muzikaz-factory-proving-grounds','muzikaz-mountain-compound']);
const tagged=object=>Boolean(object?.functionalSettings?.logisticsStation)||Boolean(FACTORY_LOGISTICS_ITEMS[object?.asset?.buildAssetId||object?.modelId]?.role&&object?.functionalSettings?.logisticsStation!==false);
function item(id,modelId,name,x,z,{y=0,rotationY=0,functional={}}={}){
 return {id,modelId,name,asset:{buildAssetId:modelId},objectType:FACTORY_LOGISTICS_ITEMS[modelId]?.role?'interactive':'props',placementAnchor:'collider-base',position:{x,y,z},rotation:{x:0,y:rotationY,z:0},scale:{x:1,y:1,z:1},groundOffset:y,materialSettings:{accent:'#efad72',useAccent:false},animationState:{enabled:true,speed:1,loop:true,autoplay:true},functionalSettings:{...factoryLogisticsItemSettings(modelId),...functional},metadata:{factoryLogisticsEquipment:true,upgradeable:true}};
}

/** Reusable station objects preserve the same transforms in native and copied maps. */
export function factoryLogisticsObjects(mapId){
 const objects=FACTORY_LOGISTICS_STATIONS.filter(station=>station.mapId===mapId).map(station=>{
  const exportDesk=station.id==='factory-export',modelId=station.kind==='certify'?'factory-certification-kiosk':'factory-export-terminal';
  return item(station.id,modelId,station.name,station.position.x-(exportDesk?3.5:0),station.position.z-(exportDesk?0:3.5),{rotationY:exportDesk?Math.PI/2:0,functional:{logisticsStation:station.kind,logisticsStationId:station.id,logisticsApproach:{x:0,y:.02,z:3.5},interactionDistance:station.interactionDistance,prompt:station.name+' · E / Use'}});
 });
 const freight=mapId==='muzikaz-missile-factory'?[[-43,43,.73],[-43,55,.73]]:mapId==='muzikaz-factory-proving-grounds'?[[-70,17,0],[-70,22,0],[-48,1,0]]:mapId==='muzikaz-mountain-compound'?[[31,24,0],[31,36,0]]:[];
 for(const [index,[x,z,y]]of freight.entries())objects.push(item('logistics-freight-'+mapId+'-'+index,'factory-freight-crate','Atlas sealed freight crate',x,z,{y}));
 if(mapId==='muzikaz-missile-factory')objects.push(item('factory-shipping-gateway','factory-export-terminal','Atlas gateway · Hormuz Shipping Academy',-18,58,{functional:{behavior:'interact',logisticsStation:false,action:'teleport',interactionDistance:6,prompt:'Travel to Atlas Shipping · E / Use',portal:{enabled:true,destinationType:'map',targetMapId:'hormuz-shipping'}}}));
 return objects;
}

/** A copied terminal grants no account certificates, manifests or clearance. */
export function editableFactoryLogisticsScene(input){
 const scene=clone(input),source=scene.sourceFactoryLogistics||scene.layoutMeta?.factoryLogistics,mapId=mapFor(scene),native=nativeMapIds.has(mapId);
 if(!native&&!source?.enabled&&!(scene.objects||[]).some(tagged))return scene;
 const {certificates,manifests,progress,clearance,...layout}=source||{};
 scene.sourceFactoryLogistics={...clone(layout),enabled:true,editableStations:true,editableEquipment:true};
 scene.gameplay={...scene.gameplay,factoryLogistics:{enabled:true}};
 if(native&&!source?.editableEquipment){const objects=scene.objects||[],ids=new Set(objects.map(object=>object.id));scene.objects=[...objects,...factoryLogisticsObjects(mapId).filter(object=>!ids.has(object.id))];}
 scene.layoutMeta=factoryLogisticsBuilderLayoutMeta(scene,scene.layoutMeta||{});
 if(scene.baseEnvironment){scene.baseEnvironment.factoryLogistics=clone(scene.sourceFactoryLogistics);scene.baseEnvironment.builderScene={...scene.baseEnvironment.builderScene,sourceFactoryLogistics:clone(scene.sourceFactoryLogistics),layoutMeta:{...scene.baseEnvironment.builderScene?.layoutMeta,factoryLogistics:clone(scene.sourceFactoryLogistics)}};}
 return scene;
}

export function factoryLogisticsBuilderLayoutMeta(scene,layout={}){
 const source=scene.sourceFactoryLogistics||scene.layoutMeta?.factoryLogistics;
 if(!source?.enabled&&!(scene.objects||[]).some(tagged))return clone(layout);
 scene.sourceFactoryLogistics={...clone(source||{}),enabled:true,editableStations:true,editableEquipment:true};
 const stations=logisticsStations({id:scene.id,factoryLogistics:scene.sourceFactoryLogistics,builderScene:scene}),canonical=new Set(FACTORY_LOGISTICS_STATIONS.map(station=>station.id));
 const previous=scene.layoutMeta?.locations||[],locations=previous.filter(place=>!place.logisticsStationId&&!canonical.has(place.id)&&!String(place.id).startsWith('logistics-instance:'));
 locations.push(...stations.map(station=>({id:station.id,logisticsStationId:station.id,name:station.name,x:station.position.x,y:station.position.y,z:station.position.z,width:14,depth:12,description:'MZK trade and freight station. Official transactions use the canonical shared destinations.'})));
 return {...clone(layout),factoryLogistics:clone(scene.sourceFactoryLogistics),locations};
}
