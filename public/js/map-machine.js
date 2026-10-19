import {deviceDefinition} from './interactive-devices.js';
export const DEFAULT_MAP_MACHINE='tic-tac-toe-cabinet';
export function hasMapMachine(objects=[],models=[]){
 const definitions=new Map(models.map(model=>[model.id,model]));
 return objects.some(object=>{if(object.active===false||object.deleted)return false;const model=definitions.get(object.modelId)||{};return ['arcade','slots','poker','trivia'].includes(deviceDefinition(object.asset?.buildAssetId||model.buildAssetId||object.modelId,object.functionalSettings||object.gameplay||model.function_data||{})?.kind);});
}
// Prefer the space behind the entry so the automatic cabinet does not obstruct
// the initial forward path when spawned devices become physical solids.
export function machineCandidates(center){
 const result=[];for(const radius of [2,3,4.5,6,8,12,16])for(let i=0;i<12;i++){const angle=Math.PI/2+i*Math.PI/6;result.push({x:center.x+Math.cos(angle)*radius,y:center.y,z:center.z+Math.sin(angle)*radius});}return result;
}
export function defaultMachineObject(position,scale=1,id='world-default-arcade'){
 return {id,modelId:DEFAULT_MAP_MACHINE,name:'Commons Arcade · 30 games',position:{...position},rotation:{x:0,y:0,z:0},scale:{x:scale,y:scale,z:scale},functionalSettings:{behavior:'interact',device:'commons-arcade',interactionKey:'e',interactionDistance:4,prompt:'Open arcade · 30 games'}};
}
