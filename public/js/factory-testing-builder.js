import {editableFactoryLogisticsScene} from './factory-logistics-builder.js';
import {PROVING_ID,COMPOUND_ID,PROVING_STATIONS,COMPOUND_STATIONS,PROVING_TARGETS,isProvingEnvironment,isCompoundEnvironment,testingStations,testingTargets} from './factory-test-config.js';
import {FACTORY_TESTING_ITEMS,factoryTestingItemSettings} from './factory-testing-items.js';

const clone=value=>structuredClone(value);
const testingObject=object=>{const f=object?.functionalSettings||{},item=FACTORY_TESTING_ITEMS[object?.asset?.buildAssetId||object?.modelId];return typeof f.testingStation==='string'||typeof f.testingTarget==='string'||f.testingStation!==false&&Boolean(item?.role)||f.testingTarget!==false&&Boolean(item?.target);};
const kindOf=scene=>scene.sourceFactoryTesting?.kind||scene.layoutMeta?.factoryTesting?.kind||(['mountain-compound'].includes(scene.sourceLayout||scene.layout)||(scene.objects||[]).some(object=>['containment','deep-hatch','return'].includes(object.functionalSettings?.testingStation))?'compound':'proving');
const roleModels={setup:'testing-telemetry-terminal',pad:'testing-launch-pad',control:'testing-launch-console',hatch:'testing-blast-door',return:'testing-telemetry-terminal',containment:'testing-containment-core','deep-hatch':'testing-blast-door'};
export const FACTORY_TESTING_BUILDER_LAYOUTS=Object.freeze({
 'factory-proving-grounds':{name:'Factory Proving Grounds',icon:'🚀',description:'An editable test range with VR preparation, launch supervision and telemetry dashboards, a shared pad, practice target and cargo touchdown platform.',color:0x243e4a,sky:0x172c3d,mapSize:240,mapColor:'#53c8d5'},
 'mountain-compound':{name:'Mountain Containment Compound · Sandbox',icon:'🔒',description:'An editable mountain facility with a symbolic containment puzzle, access doors and return lift. This custom sandbox does not grant access to the permanent facility.',color:0x303746,sky:0x181d2b,mapSize:240,mapColor:'#ad91e4'}
});
function settings(source={},kind=source.kind||'proving'){
 // Layout settings describe the puzzle and geometry. Saved account clearance
 // always stays in the canonical server account, outside map templates.
 const {clearance,clearanceGranted,deepClearance,unlocked,progress,completedChallenges,...layout}=clone(source);
 return {...layout,enabled:true,kind,editableEquipment:true,editableStations:true,editableTargets:true};
}
function object(id,modelId,position,functional={},name){
 const item=FACTORY_TESTING_ITEMS[modelId],defaults=factoryTestingItemSettings(modelId);
 return {id,modelId,name:name||item.name,asset:{buildAssetId:modelId},objectType:'interactive',position:{...position},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},groundOffset:position.y||0,animationState:{enabled:true,speed:1,loop:true,autoplay:true},functionalSettings:{...defaults,...functional},metadata:{factoryTestingEquipment:true,upgradeable:true}};
}
export function testingBuilderObjects(kind='proving'){
 const stations=kind==='compound'?COMPOUND_STATIONS:PROVING_STATIONS;
 const objects=stations.map(station=>{
  const modelId=station.testingDashboard==='telemetry'?'testing-telemetry-terminal':roleModels[station.kind],defaults=factoryTestingItemSettings(modelId),approach=defaults.testingApproach||{x:0,y:0,z:0};
  return object(station.id,modelId,{x:station.position.x-approach.x,y:Math.max(0,(station.position.y||0)-(approach.y||0)-.02),z:station.position.z-approach.z},{testingStation:station.kind,testingStationId:station.id,...(station.testingDashboard?{testingDashboard:station.testingDashboard}:{})},station.name);
 });
 if(kind!=='compound')for(const target of PROVING_TARGETS)objects.push(object(target.id,target.kind==='cargo'?'testing-cargo-platform':'testing-range-target',{...target.position,y:0},{testingStation:false,testingTarget:target.kind,testingTargetId:target.id},target.name));
 return objects;
}
export function editableFactoryTestingScene(input){
 const scene=clone(input),source=scene.sourceFactoryTesting||scene.layoutMeta?.factoryTesting,base=scene.baseEnvironment;
 const native=['factory-proving-grounds','mountain-compound'].includes(scene.sourceLayout||scene.layout)||isProvingEnvironment(base)||isCompoundEnvironment(base);
 const declared=(scene.objects||[]).some(testingObject);
 if(!native&&!source?.enabled&&!declared)return scene;
 const kind=kindOf(scene),converted=source?.editableEquipment===true;
 scene.sourceFactoryTesting=settings(source,kind);scene.layoutMeta={...scene.layoutMeta,factoryTesting:clone(scene.sourceFactoryTesting)};
 scene.gameplay={...scene.gameplay,multiplayer:true,friendlyFire:false,radTox:false,factoryTesting:{enabled:true,kind}};
 if(native){
  scene.sourceLayout=kind==='compound'?'mountain-compound':'factory-proving-grounds';scene.sourceGame=kind==='compound'?'mountain-compound':'factory-proving';
  scene.sourceSpawn||=kind==='compound'?{x:0,y:.02,z:35,rotationY:0}:{x:-42,y:.02,z:48,rotationY:0};
  if(scene.baseEnvironment){const base=scene.baseEnvironment;base.factoryTesting=clone(scene.sourceFactoryTesting);base.builderScene={...base.builderScene,sourceFactoryTesting:clone(scene.sourceFactoryTesting),layoutMeta:{...base.builderScene?.layoutMeta,factoryTesting:clone(scene.sourceFactoryTesting)}};}
  if(!converted&&!(scene.objects||[]).some(object=>FACTORY_TESTING_ITEMS[object.asset?.buildAssetId||object.modelId]))scene.objects=[...(scene.objects||[]),...testingBuilderObjects(kind)];
 }
 scene.layoutMeta=testingBuilderLayoutMeta(scene,scene.layoutMeta);return editableFactoryLogisticsScene(scene);
}
export function createFactoryTestingBuilderScene({kind='proving',id='custom-'+(kind==='compound'?'mountain-compound':'factory-proving-grounds'),name}={}){
 const layout=kind==='compound'?'mountain-compound':'factory-proving-grounds',definition=FACTORY_TESTING_BUILDER_LAYOUTS[layout];
 return editableFactoryTestingScene({version:3,id,name:name||definition.name+' · Custom',layout,sourceLayout:layout,sourceEnvironmentId:kind==='compound'?COMPOUND_ID:PROVING_ID,sourceGame:kind==='compound'?'mountain-compound':'factory-proving',mapSize:definition.mapSize,weather:'clear',layoutMeta:{color:definition.color,factoryTesting:{enabled:true,kind}},objects:[]});
}
export function testingBuilderLayoutMeta(scene,layout={}){
 const source=scene.sourceFactoryTesting||scene.layoutMeta?.factoryTesting;
 if(!source?.enabled&&!(scene.objects||[]).some(testingObject))return clone(layout);
 scene.sourceFactoryTesting=settings(source,kindOf(scene));
 const environment={id:scene.id,factoryTesting:scene.sourceFactoryTesting,builderScene:scene},stations=testingStations(environment),targets=testingTargets(environment);
 const canonicalIds=new Set([...PROVING_STATIONS,...COMPOUND_STATIONS,...PROVING_TARGETS].map(value=>value.id));
 const previous=scene.layoutMeta?.locations||[],locations=previous.filter(place=>!canonicalIds.has(place.id)&&!place.testingStationId&&!place.testingTargetId&&!/^testing-(?:instance|target):/.test(place.id));
 for(const station of stations)locations.push({id:station.id,testingStationId:station.id,name:station.name,x:station.position.x,y:station.position.y,z:station.position.z,width:12,depth:10,description:'Interactive '+station.kind+' station.'});
 for(const target of targets)locations.push({id:target.id,testingTargetId:target.id,name:target.name,x:target.position.x,y:target.position.y,z:target.position.z,width:target.radius*2,depth:target.radius*2,description:'Marked '+target.kind+' test destination.'});
 return {...clone(layout),factoryTesting:clone(scene.sourceFactoryTesting),locations};
}
