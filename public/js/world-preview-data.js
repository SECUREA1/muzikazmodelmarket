import {isBasketballEnvironment} from './basketball-rules.js';
export const previewWorldId=world=>world.id||world.mapId||world.environmentId||'';
export function safeWorldMedia(value){if(typeof value!=='string'||!value.trim())return '';try{const url=new URL(value,'https://preview.invalid/');return ['http:','https:'].includes(url.protocol)?value.trim():'';}catch{return '';}}
export function worldPreviewData(world={}){
 const scene=world.builderScene||world.placementScene;
 const models=(Array.isArray(world.modelUrls)&&world.modelUrls.length?world.modelUrls:[world.modelUrl]).map(safeWorldMedia).filter(Boolean);
 return {id:previewWorldId(world),name:world.name||'World destination',image:safeWorldMedia(world.thumbnailUrl||world.thumbnail||world.previewImage),model:!world.builderScene&&!world.proceduralLand?models[0]||'':'',objects:Array.isArray(scene?.objects)?scene.objects:[],streets:Array.isArray(world.streets)?world.streets:Array.isArray(scene?.streets)?scene.streets:[],mapSize:Number(scene?.mapSize)||80,procedural:!!(world.builderScene||world.proceduralLand),basketball:isBasketballEnvironment({...world,id:previewWorldId(world)}),color:world.districtColor||'#a4e6c0'};
}
