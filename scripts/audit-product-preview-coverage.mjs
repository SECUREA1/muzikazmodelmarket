import {readFile,open,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {GAME_ECONOMY} from '../game-economy.mjs';
import {NATIVE_BUILDER_ITEMS} from '../public/js/native-builder-items.js';
import {previewDescriptor,previewModelSource,loadPreviewModel,disposePreviewModel} from '../public/js/market-item-preview.js';

const repoRoot=new URL('../',import.meta.url);
const proceduralSources=new Set(['native','material','tool','layout','generated','drawing','card']);
const rendererKey=(item,source)=>JSON.stringify([source,item.materialId,item.buildAssetId,item.toolId,item.builderLayoutId||item.layoutId,item.generator,item.strokes,item.configuration,...(source==='card'?[item.id,item.name,item.category,item.entries,item.previewNote]:[])]);

export async function auditProductPreviewCoverage(){
 const failures=[],sources={},offers=[],nativeDesigns=new Set(),rendered=new Map(),authoredFiles=new Set(),imageFiles=new Set(),initialCatalog=JSON.stringify(GAME_ECONOMY);
 const fail=(id,code,message)=>failures.push({id,code,message});
 async function construct(id,descriptor,source){
  const key=rendererKey(descriptor,source);if(rendered.has(key))return;
  let root;try{
   ({root}=await loadPreviewModel(descriptor));if(!root?.isObject3D)throw Error('The renderer did not return an Object3D.');
   let meshes=0,triangles=0,invalid=false;root.traverse(node=>{if(![...node.position,...node.quaternion,...node.scale].every(Number.isFinite))invalid=true;if(!node.isMesh)return;meshes++;const p=node.geometry?.attributes.position;triangles+=(node.geometry.index?.count||p?.count||0)/3*(node.isInstancedMesh?node.count:1);if(!p||!Array.from(p.array).every(Number.isFinite))invalid=true;});
   if(!meshes||invalid)throw Error('The renderer has empty or nonfinite geometry.');
   if(root.userData.previewPresentation!==(source==='card'?'product-card':'actual-model'))throw Error('The preview does not identify its actual model or semantic card presentation.');
   if(source==='card'&&root.userData.productCard?.name!==descriptor.name)throw Error('The product card text belongs to another item.');
   rendered.set(key,{source,meshes,triangles});
  }catch(error){fail(id,'PREVIEW_RENDER_FAILED',error.message);}finally{disposePreviewModel(root);}
 }
 for(const offer of GAME_ECONOMY){
  const descriptor=previewDescriptor(offer),source=previewModelSource(descriptor);sources[source||'missing']=(sources[source||'missing']||0)+1;
  if(!source)fail(offer.sku,'MISSING_SOURCE','The offer has neither a model route nor an explicit product card.');
  if(JSON.stringify(previewDescriptor(descriptor))!==JSON.stringify(descriptor))fail(offer.sku,'NON_IDEMPOTENT_DESCRIPTOR','Normalizing a prepared descriptor loses its visual identity.');
  if(offer.native)nativeDesigns.add(rendererKey(descriptor,source));
  if(proceduralSources.has(source))await construct(offer.sku,descriptor,source);
  if(source==='glb'){
   try{
    const url=new URL(descriptor.model.replace(/^\//,''),repoRoot);if(url.protocol!=='file:'||!url.pathname.startsWith(repoRoot.pathname))throw Error('The repository offer does not resolve to a local authored file.');
    if(!authoredFiles.has(url.href)){
     const info=await stat(url),file=await open(url,'r'),header=Buffer.alloc(12);try{await file.read(header,0,12,0);}finally{await file.close();}
     if(url.pathname.endsWith('.glb')&&(header.toString('ascii',0,4)!=='glTF'||header.readUInt32LE(4)!==2||header.readUInt32LE(8)!==info.size))throw Error('The authored GLB header is invalid or incomplete.');
     authoredFiles.add(url.href);
    }
   }catch(error){fail(offer.sku,'AUTHORED_FILE_UNAVAILABLE',error.message);}
  }
  if(source==='image'){
   try{const url=new URL(descriptor.artwork.replace(/^\//,''),repoRoot);if(url.protocol!=='file:'||!url.pathname.startsWith(repoRoot.pathname))throw Error('The artwork offer does not resolve to a local file.');const info=await stat(url);if(!info.isFile()||!info.size)throw Error('The artwork file is empty or unavailable.');imageFiles.add(url.href);}catch(error){fail(offer.sku,'ARTWORK_FILE_UNAVAILABLE',error.message);}
  }
  offers.push({sku:offer.sku,source,buildAssetId:descriptor.buildAssetId||null,materialId:descriptor.materialId||null,toolId:descriptor.toolId||null,layoutId:descriptor.builderLayoutId||descriptor.layoutId||null});
 }
 for(const id of Object.keys(NATIVE_BUILDER_ITEMS)){
  const descriptor=previewDescriptor({name:NATIVE_BUILDER_ITEMS[id].name,buildAssetId:id}),source=previewModelSource(descriptor);
  await construct(id,descriptor,source);
 }
 const registry=JSON.parse(await readFile(new URL('../public/models/game-asset-registry.json',import.meta.url),'utf8')),generated=registry.assets.filter(asset=>asset.generated&&asset.generator);
 for(const asset of generated){const descriptor=previewDescriptor(asset),source=previewModelSource(descriptor);if(source!=='generated')fail(asset.assetId,'GENERATED_SOURCE_MISSING','The generated registry asset lost its recipe.');else await construct(asset.assetId,descriptor,source);}
 if(JSON.stringify(GAME_ECONOMY)!==initialCatalog)fail('catalog','CATALOG_MUTATED','Rendering a preview changed product identity, prices or gameplay metadata.');
 return {validation:{procedural:'Model factories constructed and checked for finite visible geometry.',authored:'GLB file containers checked; browser rendering sampled separately.',artwork:'Source files checked; browser rendering sampled separately.'},counts:{offers:GAME_ECONOMY.length,uniqueSkus:new Set(GAME_ECONOMY.map(offer=>offer.sku)).size,nativeDefinitions:Object.keys(NATIVE_BUILDER_ITEMS).length,nativeOffers:GAME_ECONOMY.filter(offer=>offer.native).length,uniqueNativeDesigns:nativeDesigns.size,constructedDesigns:rendered.size,authoredFiles:authoredFiles.size,imageFiles:imageFiles.size,generatedRegistryAssets:generated.length,sources},failures,offers};
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){const report=await auditProductPreviewCoverage();console.log(JSON.stringify(report,null,2));if(report.failures.length)process.exitCode=1;}
