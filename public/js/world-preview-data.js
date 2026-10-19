import {isBasketballEnvironment} from './basketball-rules.js';
import {isDedicatedFiringRange} from './firing-range.js';
import {builderBaseEnvironment} from './environments/builder-base.js';
export const previewWorldId=world=>world.id||world.mapId||world.environmentId||'';
export function safeWorldMedia(value){if(typeof value!=='string'||!value.trim())return '';try{const url=new URL(value,'https://preview.invalid/');return ['http:','https:'].includes(url.protocol)?value.trim():'';}catch{return '';}}
export function worldPreviewData(world={}){
 const scene=world.builderScene||world.placementScene;
 const savedBase=world.builderScene?.baseEnvironment;
 const base=builderBaseEnvironment(world)||(savedBase&&(savedBase.builderScene||savedBase.proceduralLand||savedBase.layout)?savedBase:null),source=base||world;
 const procedural=!(source.modelUrl||source.modelUrls?.length)&&!!(source.builderScene||source.proceduralLand||source.layout)||!base&&!!(world.builderScene||world.proceduralLand);
 const models=procedural?[]:[...new Set((Array.isArray(source.modelUrls)&&source.modelUrls.length?source.modelUrls:[source.modelUrl]).map(safeWorldMedia).filter(Boolean))];
 return {id:previewWorldId(world),name:world.name||'World destination',image:safeWorldMedia(world.thumbnailUrl||world.thumbnail||world.previewImage),model:models[0]||'',models,base,objects:Array.isArray(scene?.objects)?scene.objects:[],streets:Array.isArray(world.streets)?world.streets:Array.isArray(scene?.streets)?scene.streets:[],mapSize:Number(scene?.mapSize)||80,procedural,basketball:isBasketballEnvironment({...source,id:previewWorldId(source)}),firingRange:isDedicatedFiringRange({...source,id:previewWorldId(source)}),color:world.districtColor||'#a4e6c0'};
}
