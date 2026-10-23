import {FITNESS_ID,FITNESS_STATIONS,FITNESS_LOCATIONS,FITNESS_TRAINERS,FITNESS_RESIDENTS,isFitnessEnvironment} from './fitness-config.js';
import {FITNESS_ITEMS} from './fitness-equipment.js';

export const FITNESS_BUILDER_LAYOUT=Object.freeze({name:'Gold Fitness Centre',icon:'◈',description:'A complete gold fitness centre with individually editable gym equipment. Move, rotate, scale, recolour, duplicate or remove each item, then add upgrades from ITEMS → Fitness & gym.',color:0x1a252c,sky:0x101c23,mapSize:80,mapColor:'#d8ad45'});
const clone=value=>structuredClone(value);
const point=(x,z,y=0)=>({x,y,z});
const primary=(kind,approach)=>({fitnessStation:kind,fitnessStationId:'fitness-'+kind,fitnessApproach:{x:0,y:0,z:0,...approach}});
/** Each row is an independently selectable assembly, never a frozen map prop. */
export const FITNESS_EQUIPMENT_PLACEMENTS=Object.freeze([
 ['primary-boxing','fitness-boxing-ring',-22,-18,0,primary('boxing',{z:4})],
 ['bag-north','fitness-heavy-bag',-31,-27],['bag-middle','fitness-heavy-bag',-31,-18],['bag-south','fitness-heavy-bag',-30,-9.3],
 ['primary-bench-press','fitness-bench-press',18,-22,0,primary('bench-press',{z:4})],['member-bench','fitness-bench-press',12,-27,Math.PI/2],
 ['primary-deadlift','fitness-deadlift-platform',29,-11,0,primary('deadlift',{z:4})],['power-rack','fitness-power-rack',26,-28],
 ['dumbbell-rack','fitness-dumbbell-rack',22,-33],['plate-tree-a','fitness-plate-tree',34,-22],['plate-tree-b','fitness-plate-tree',34,-16],
 ['spare-barbell','fitness-barbell',10,-13],['spare-dumbbell-a','fitness-dumbbell',10,-14.5],['spare-dumbbell-b','fitness-dumbbell',11,-14.5],
 ['treadmill-a','fitness-treadmill',-31,5],['treadmill-b','fitness-treadmill',-26,5],
 ['primary-rowing','fitness-rower',-27,15,Math.PI/2,primary('rowing',{z:3})],['member-rower','fitness-rower',-26,20,Math.PI/2],
 ['studio-bike-a','fitness-bike',-32,25,Math.PI/2],['studio-bike-b','fitness-bike',-28,25,Math.PI/2],
 ['primary-jump-rope','fitness-jump-rope',-13.3,6,0,primary('jump-rope',{x:2.3})],['spare-jump-rope','fitness-jump-rope',-15,1],
 ['primary-agility','fitness-agility-ladder',16,7,0,primary('agility',{x:3})],
 ...Array.from({length:5},(_,index)=>['slalom-'+index,'fitness-cone',24+(index%2?1:-1),1+index*3.1]),
 ...[1,6,11].map((z,index)=>['hurdle-'+index,'fitness-hurdle',31,z]),
 ['primary-balance','fitness-balance-beam',25,25,0,primary('balance',{x:-4,z:-2})],
 ...Array.from({length:4},(_,index)=>['stability-pad-'+index,'fitness-balance-pad',15+index*1.6,29]),
 ...Array.from({length:3},(_,index)=>['recovery-mat-'+index,'fitness-recovery-mat',28+index*2.3,30]),
 ...Array.from({length:3},(_,index)=>['foam-roller-'+index,'fitness-foam-roller',28+index*2.3,31.6]),
 ...Array.from({length:9},(_,index)=>['locker-'+index,'fitness-locker',-32+index*1.7,33.6]),
 ['locker-bench-a','fitness-locker-bench',-28,29],['locker-bench-b','fitness-locker-bench',-20,29],
 ['hydration','fitness-water-station',-13,31],['reception','fitness-reception-counter',0,28],['reception-monitor','fitness-monitor',2,28,0,null,1.42],
 ['coach-maya-board','fitness-coach-board',-6,25.3],['coach-leon-board','fitness-coach-board',7,-10.7]
]);

export function fitnessBuilderObjects(){
 return FITNESS_EQUIPMENT_PLACEMENTS.map(([id,modelId,x,z,rotationY=0,station=null,y=0])=>{
  const item=FITNESS_ITEMS[modelId];if(!item)throw Error('Missing fitness item '+modelId);
  return {id:'gym-'+id,modelId,name:item.name,objectType:station?'interactive':'props',asset:{buildAssetId:modelId},position:point(x,z,y),rotation:{x:0,y:rotationY,z:0},scale:{x:1,y:1,z:1},groundOffset:y,materialSettings:{accent:'#d8ad45',useAccent:false},animationState:{enabled:true,speed:1,loop:true,autoplay:true},functionalSettings:{behavior:station?'interact':'decor',fitnessStation:false,active:true,destructible:false,interactionKey:'e',interactionDistance:4,damage:0,...(station?{...station,prompt:'Train '+FITNESS_STATIONS.find(value=>value.kind===station.fitnessStation)?.name}: {})},metadata:{fitnessEquipment:true,upgradeable:true}};
 });
}
const settings=source=>({...clone(source||{}),enabled:true,currency:'MZK',editableEquipment:true,editableStations:true,width:72,depth:72,stations:clone(source?.stations||FITNESS_STATIONS),trainers:clone(source?.trainers||FITNESS_TRAINERS)});
function markEditableBase(base){if(!base)return base;const value=clone(base);value.fitness=settings(value.fitness||value.builderScene?.layoutMeta?.fitness);value.builderScene||={};value.builderScene.sourceFitness=settings(value.builderScene.sourceFitness||value.fitness);value.builderScene.layoutMeta={...(value.builderScene.layoutMeta||{}),fitness:settings(value.builderScene.layoutMeta?.fitness)};return value;}

/** Upgrade legacy fixed-gym copies once. Later deletion and movement persist. */
export function editableFitnessScene(input){
 const scene=clone(input);const fitness=scene.sourceFitness||scene.layoutMeta?.fitness;
 if(!(scene.sourceLayout==='fitness-centre'||scene.layout==='fitness-centre'||fitness?.enabled||isFitnessEnvironment(scene.baseEnvironment)))return scene;
 const converted=fitness?.editableEquipment===true;
 scene.sourceGame='fitness';scene.sourceLayout='fitness-centre';scene.sourceFitness=settings(fitness);scene.sourceSpawn||={x:0,y:.02,z:32,rotationY:0};
 scene.layoutMeta={...scene.layoutMeta,color:0x1a252c,fitness:settings(fitness),locations:clone(scene.layoutMeta?.locations||FITNESS_LOCATIONS),residents:clone(scene.layoutMeta?.residents||FITNESS_RESIDENTS)};
 scene.gameplay={...scene.gameplay,multiplayer:true,friendlyFire:false,radTox:false,fitness:{enabled:true}};scene.baseEnvironment=markEditableBase(scene.baseEnvironment);
 if(!converted){const kept=(scene.objects||[]).filter(object=>!object.fitnessStation||FITNESS_ITEMS[object.asset?.buildAssetId||object.modelId]);const names=new Set(kept.map(object=>object.id));scene.objects=[...kept,...fitnessBuilderObjects().filter(object=>!names.has(object.id))];}
 return scene;
}

export function createFitnessBuilderScene({id='custom-fitness-centre',name='Gold Fitness Centre · Custom'}={}){
 return editableFitnessScene({version:3,id,name,layout:'fitness-centre',mapSize:80,weather:'clear',sourceEnvironmentId:FITNESS_ID,sourceLayout:'fitness-centre',sourceGame:'fitness',sourceSpawn:{x:0,y:.02,z:32,rotationY:0},layoutMeta:{color:0x1a252c,fitness:{enabled:true}},objects:[]});
}

/** Retain the gym's training metadata when Builder refreshes layout labels. */
export function fitnessBuilderLayoutMeta(scene,layout={}){
 if(scene.sourceGame!=='fitness'&&scene.sourceLayout!=='fitness-centre'&&scene.layout!=='fitness-centre')return clone(layout);
 return {...clone(layout),fitness:settings(scene.sourceFitness||scene.layoutMeta?.fitness),locations:clone(scene.layoutMeta?.locations||FITNESS_LOCATIONS),residents:clone(scene.layoutMeta?.residents||FITNESS_RESIDENTS)};
}
