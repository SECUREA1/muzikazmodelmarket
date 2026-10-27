import {mkdtemp,readdir,readFile,rm,open} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,relative,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {GAME_ECONOMY} from '../game-economy.mjs';
import {NATIVE_BUILDER_ITEMS} from '../public/js/native-builder-items.js';
import {BUILDER_MODEL_INFO,createBuilderModel} from '../public/js/builder-models-3d.js';
import {nativeMarketCatalog} from '../native-market-catalog.mjs';
import {ensureWorldSupply,supplyItem} from '../world-supply.mjs';
import {WorldAtlas} from '../world-atlas.mjs';
import {airportWorld} from '../airport-world.mjs';
import {constructionWorld} from '../construction-world.mjs';
import {clownFunhouseWorld} from '../clown-funhouse-world.mjs';
import {casinoWorld} from '../casino-world.mjs';
import {pixelPeaksWorld} from '../pixel-peaks-world.mjs';
import {missileFactoryWorld} from '../missile-factory-world.mjs';
import {factoryProvingGroundsWorld,mountainCompoundWorld} from '../factory-testing-world.mjs';
import {fitnessWorld} from '../fitness-world.mjs';
import {shippingWorld} from '../shipping-world.mjs';
import {landFieldWorlds} from '../land-field-worlds.mjs';
import {PRISON_ID} from '../public/js/prison-config.js';
import {createPrisonLand} from '../public/js/prison-world.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const normalizedPath=value=>{try{return decodeURIComponent(String(value||'').split(/[?#]/)[0]).replace(/^\/+/, '');}catch{return String(value||'').replace(/^\/+/, '');}};
// These contain build output, credentials, installed dependencies, or private
// player uploads rather than the repository's authored game item source.
const excludedDirectories=new Set(['.git','node_modules','dist','data','uploads','work','backups']);
async function modelFiles(directory=root){
 const found=[];
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const path=join(directory,entry.name);
  if(entry.isDirectory()&&!excludedDirectories.has(entry.name))found.push(...await modelFiles(path));
  else if(entry.isFile()&&/\.(?:glb|gltf)$/i.test(entry.name))found.push(relative(root,path).replaceAll('\\','/'));
 }
 return found.sort();
}
export async function authoredPublicWorlds(){
 const manifest=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url),'utf8'));
 const runtime=[airportWorld(),constructionWorld(),clownFunhouseWorld(),casinoWorld(),pixelPeaksWorld(),missileFactoryWorld(),factoryProvingGroundsWorld(),mountainCompoundWorld(),fitnessWorld(),shippingWorld(),...landFieldWorlds()];
 const authored=[...new Map([...manifest,...runtime].filter(map=>map.visibility!=='private'&&map.playable!==false).map(map=>[map.id,{...map,source:map.source||'repository'}])).values()];
 const temporary=await mkdtemp(join(tmpdir(),'muzikaz-item-audit-'));
 try{
  // Build the real Commons/district directory in isolated temporary storage.
  // This covers their authored neighborhoods, furnishings and marina too.
  const atlas=await new WorldAtlas(join(temporary,'atlas.json')).synchronize(authored);
  return [...authored,...Object.values(atlas.cells).filter(cell=>cell.generated).map(cell=>cell.environment)];
 }finally{await rm(temporary,{recursive:true,force:true});}
}
export async function auditWorldItems(){
 const [worlds,files,registry]=await Promise.all([authoredPublicWorlds(),modelFiles(),readFile(new URL('../public/models/game-asset-registry.json',import.meta.url),'utf8').then(JSON.parse)]);
 const catalog=nativeMarketCatalog(GAME_ECONOMY,worlds),modelPaths=new Set(GAME_ECONOMY.map(item=>normalizedPath(item.modelUrl)).filter(Boolean));
 const registeredPaths=new Set(registry.assets.filter(item=>!item.generated).map(item=>normalizedPath(item.modelPath)).filter(Boolean));
 const invalidModelFiles=[];
 for(const path of files){
  const handle=await open(join(root,path),'r');
  try{
   if(/\.glb$/i.test(path)){const header=Buffer.alloc(12);await handle.read(header,0,12,0);const details=await handle.stat();if(header.toString('ascii',0,4)!=='glTF'||header.readUInt32LE(4)!==2||header.readUInt32LE(8)!==details.size)invalidModelFiles.push(path);}
   else {const gltf=JSON.parse(await handle.readFile('utf8'));if(!gltf.asset?.version)invalidModelFiles.push(path);}
  }catch{invalidModelFiles.push(path);}finally{await handle.close();}
 }
 const missingModelFiles=files.filter(path=>!modelPaths.has(path)),missingDiscoveryFiles=files.filter(path=>!registeredPaths.has(path));
 const missingNativeItems=Object.keys(NATIVE_BUILDER_ITEMS).filter(id=>!GAME_ECONOMY.some(item=>item.buildAssetId===id));
 const missingBuilderItems=Object.keys(BUILDER_MODEL_INFO).filter(id=>!NATIVE_BUILDER_ITEMS[id]);
 const unrenderableNativeItems=[];
 for(const item of Object.values(NATIVE_BUILDER_ITEMS)){
  if(item.modelUrl)continue;
  let model;
  try{model=createBuilderModel(item.id);if(!model)unrenderableNativeItems.push(item.id);}
  catch(error){unrenderableNativeItems.push(item.id+': '+error.message);}
  finally{model?.traverse(part=>{part.geometry?.dispose();for(const material of Array.isArray(part.material)?part.material:[part.material])material?.dispose();});}
 }
 const invalidWorldRenderers=[];
 const prison=worlds.find(world=>world.id===PRISON_ID);
 // Ironwood's complete manifest drives a monolithic renderer, rather than a
 // second world factory or editable native component inventory. Keep its
 // security fixtures/actors inside that renderer and audit its actual geometry.
 let prisonLand;
 try{prisonLand=prison&&createPrisonLand(prison);if(!prisonLand?.children.length||prisonLand.userData.prisonId!==PRISON_ID)invalidWorldRenderers.push(PRISON_ID);}
 catch(error){invalidWorldRenderers.push(PRISON_ID+': '+error.message);}
 finally{prisonLand?.traverse(part=>{part.geometry?.dispose();for(const material of Array.isArray(part.material)?part.material:[part.material])material?.dispose();});}
 const unresolvedWorldItems=catalog.maps.flatMap(map=>map.components.filter(component=>!component.sku).map(component=>({worldId:map.worldId,...component})));
 const snapshot={};ensureWorldSupply(snapshot);
 const missingSupplyItems=[];
 for(const item of GAME_ECONOMY.filter(item=>!item.earnedOnly&&item.kind!=='stock')){
  try{const definition=supplyItem(snapshot,item);if(snapshot.worldSupply.worldStock[definition.supplyId]!==1000)missingSupplyItems.push(item.sku);}
  catch{missingSupplyItems.push(item.sku);}
 }
 const earnedCollectibles=GAME_ECONOMY.filter(item=>item.earnedOnly&&item.kind!=='stock');
 const unexpectedEarnedSupplyItems=earnedCollectibles.filter(item=>Object.values(snapshot.worldSupply.catalog).some(definition=>definition.buildAssetId===item.buildAssetId)).map(item=>item.sku);
 const used=new Set(catalog.maps.flatMap(map=>map.components.map(component=>component.sku).filter(Boolean)));
 return {
  counts:{worlds:worlds.length,publicMapInstances:catalog.maps.reduce((sum,map)=>sum+map.itemCount,0),worldMarketItems:used.size,builderModels:Object.keys(BUILDER_MODEL_INFO).length,nativeDefinitions:Object.keys(NATIVE_BUILDER_ITEMS).length,marketItems:GAME_ECONOMY.length,authoredModelFiles:files.length,modelFilesOutsidePublic:files.filter(path=>!path.startsWith('public/')).length,finiteSupplyItems:Object.keys(snapshot.worldSupply.catalog).length,earnedCollectibles:earnedCollectibles.length,runtimeWorldRenderers:prisonLand?1:0},
  missingBuilderItems,missingNativeItems,missingModelFiles,missingDiscoveryFiles,invalidModelFiles,unrenderableNativeItems,invalidWorldRenderers,unresolvedWorldItems,missingSupplyItems,unexpectedEarnedSupplyItems,
  worlds:catalog.maps.map(map=>({id:map.worldId,name:map.name,instances:map.itemCount,marketItems:map.components.filter(component=>component.sku).length,glbInstances:map.components.filter(component=>component.modelUrl).reduce((sum,component)=>sum+component.count,0)}))
 };
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const report=await auditWorldItems();console.log(JSON.stringify(report,null,2));
 if(Object.entries(report).some(([key,value])=>key!=='worlds'&&Array.isArray(value)&&value.length))process.exitCode=1;
}
