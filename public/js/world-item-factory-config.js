export const WORLD_ITEM_FACTORY_ID='world-item-factory';
export const WORLD_ITEM_FACTORY_STATIONS=Object.freeze([
 {id:'factory-intake',stageId:'sourcing',name:'01 · Blueprint & component intake',modelId:'factory-procurement-terminal',position:{x:-36,y:0,z:-20},approach:{x:-36,y:0,z:-13}},
 {id:'factory-production',stageId:'assembly',name:'02 · Item assembly cell',modelId:'factory-assembly-jig',position:{x:-12,y:0,z:-20},approach:{x:-12,y:0,z:-13}},
 {id:'factory-inspection',stageId:'quality',name:'03 · Quality & configuration checks',modelId:'factory-calibration-rig',position:{x:12,y:0,z:-20},approach:{x:12,y:0,z:-13}},
 {id:'factory-packing',stageId:'packing',name:'04 · Sealed packing & dispatch',modelId:'factory-dispatch-terminal',position:{x:36,y:0,z:-20},approach:{x:36,y:0,z:-13}}
]);
export function nearestWorldFactoryStation(environment,position){
 if(!environment?.worldSupply?.enabled||!position)return null;
 return (environment.worldSupply.stations||[]).filter(station=>Math.hypot(position.x-station.approach.x,position.z-station.approach.z)<=7).sort((a,b)=>Math.hypot(position.x-a.approach.x,position.z-a.approach.z)-Math.hypot(position.x-b.approach.x,position.z-b.approach.z))[0]||null;
}

export function isWorldItemFactoryEnvironment(environment={}){return environment?.id===WORLD_ITEM_FACTORY_ID||environment?.builderScene?.layout==='world-item-factory'||environment?.builderScene?.sourceLayout==='world-item-factory';}
