import {worldPreviewData,safeWorldMedia} from './world-preview-data.js';
import {applyBuilderBaseTransform,builderBaseAlignment} from './environments/builder-base.js';

// Saved objects already use world coordinates. Keep them beside the map group
// so normalizing or aligning an authored base never transforms objects twice.
export async function populateWorldPreviewContent(content,THREE,world,{loadModel,createBuilderLand,createBuilderModel,createGeneratedAsset}){
 const data=worldPreviewData(world),source=data.base||world,base=new THREE.Group();base.name='WORLD_PREVIEW_BASE';content.add(base);
 if(data.models.length){for(const url of data.models)base.add(await loadModel(url));}
 else if(data.procedural)base.add(createBuilderLand(source));
 else throw Error('No 3D scene available');
 base.scale.setScalar((Number(source.scale)||1)*(Number(source.spaceScale)||1));
 base.rotation.set(Number(source.rotation?.x)||0,Number(source.rotation?.y)||0,Number(source.rotation?.z)||0);
 const size=new THREE.Box3().setFromObject(base).getSize(new THREE.Vector3()),footprint=Math.max(size.x,size.z),playableSize=Number(source.playableSize);
 if(!data.basketball&&playableSize>0&&footprint>0)base.scale.multiplyScalar(THREE.MathUtils.clamp(playableSize/footprint,.01,100));
 if(data.base)applyBuilderBaseTransform(base,builderBaseAlignment(world));
 const scene=world.builderScene||world.placementScene;
 const definitions=new Map([...(scene?.catalogModels||[]),...(scene?.placedModels||[])].map(model=>[model.id,model]));
 const overlays=new THREE.Group();overlays.name='WORLD_PREVIEW_OBJECTS';content.add(overlays);
 for(const [index,item]of data.objects.slice(0,100).entries()){
  const definition=definitions.get(item.modelId),id=item.asset?.buildAssetId||definition?.buildAssetId||item.modelId;
  let object=typeof id==='string'?createBuilderModel(id):null;
  if(!object&&definition?.generated)object=createGeneratedAsset(definition);
  if(!object){const url=safeWorldMedia(item.asset?.modelUrl||definition?.modelUrl);if(url){const model=await loadModel(url),bounds=new THREE.Box3().setFromObject(model),height=bounds.getSize(new THREE.Vector3()).y;if(Number(definition?.targetHeight)>0&&height>0)model.scale.multiplyScalar(Number(definition.targetHeight)/height);model.position.y-=new THREE.Box3().setFromObject(model).min.y;object=new THREE.Group();object.add(model);}}
  if(!object)continue;
  const authored=item.position&&typeof item.position==='object',scale=Math.max(.04,Math.min(20,Number(authored?item.scale?.x:item.scale)||1));
  object.name=`Builder_${item.modelId}_${index}`;
  object.position.set(authored?Number(item.position.x)||0:(Number(item.x)-50)*.4,Number(item.position?.y)||0,authored?Number(item.position.z)||0:(Number(item.y)-50)*.4);
  object.rotation.set(authored?Number(item.rotation?.x)||0:0,authored?Number(item.rotation?.y)||0:THREE.MathUtils.degToRad(Number(item.rotation)||0),authored?Number(item.rotation?.z)||0:0);
  object.scale.multiply(new THREE.Vector3(scale,Math.max(.04,Math.min(20,Number(item.scale?.y)||scale)),Math.max(.04,Math.min(20,Number(item.scale?.z)||scale))));
  overlays.add(object);
 }
 return {base,overlays,data};
}
