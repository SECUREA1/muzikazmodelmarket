import {Object3D,Material,StaticDrawUsage} from '../vendor/three/three.module.min.js';
import {cloneBuilderRuntime} from './builder-runtime-clone.js';

const sceneIds=new Set(['grand-floor','open-studio','connected-suite','garden-courtyard','estate-house','estate-yard','drive-in-garage','open-office']);
const dynamicFlags=['proceduralLand','nativeWorldDesign','layoutScene','generated','generatedAsset','savedCustomModel','customModel','imported','nativeAvatar','residentModel','craftedCharacterModel','funhouseModel','factoryModel','factoryLogisticsModel','testingModel','arcadePart','constructionModel','constructionParts','roadVehicle','aircraftModel','watercraft','boatModel','cargoTrailer','portalModel','roadDash'];
const mediaFlags=['mediaScreen','mediaSurface','mediaFace','video','videoFeed','screenSource','screenCanvas'];
const nodeCallbacks=['onBeforeRender','onAfterRender','onBeforeShadow','onAfterShadow'];
const isPlain=value=>[Object.prototype,Array.prototype,null].includes(Object.getPrototypeOf(value));
const sharedTexture=texture=>texture.userData?.nativeSurfaceShared||texture.userData?.sportsSurfaceShared;
const hasOptions=options=>options!==undefined&&(options===null||typeof options!=='object'||Object.getPrototypeOf(options)!==Object.prototype||Reflect.ownKeys(options).length>0);
const unsafeId=id=>typeof id!=='string'||!id||sceneIds.has(id)||/^(?:scene-|layout:|custom[:_-]|generated[:_-]|uploaded?[:_-]|repository:|factory-|testing-|funhouse-|arcade-part-|fitness-|hockey-)/.test(id)||/avatar|resident|ranger|merchant|knight|guardian|slime|dragon|(?:^|-)wolf|rad-tox|hero-spawn/.test(id);

function resources(root){
 const geometries=new Set(),materials=new Set();
 root.traverse(node=>{if(node.geometry)geometries.add(node.geometry);for(const material of [].concat(node.material||[]))materials.add(material);});
 return {geometries,materials};
}

// Runtime factories with closures, media or mutable geometry keep their normal
// construction path. Ordinary scenery animations use copied plain metadata and
// isolated materials, so a universal `animated` flag is not a cache exclusion.
export function nativeModelCacheEligibility(root,id){
 if(unsafeId(id))return {eligible:false,reason:'dynamic-or-nonnative-id'};
 if(!root?.isObject3D||root.userData?.nativeDesign?.id!==id)return {eligible:false,reason:'not-a-native-template'};
 const nodes=[];root.traverse(node=>nodes.push(node));const descendants=new Set(nodes);
 let reason=null;
 const fail=value=>{reason ||=value;};
 function inspect(value,ancestors=new Set()){
  if(typeof value==='function'||typeof value==='symbol'||typeof value==='bigint'){fail('nonserializable-user-data');return;}
  if(typeof value==='number'&&!Number.isFinite(value)){fail('nonserializable-user-data');return;}
  if(!value||typeof value!=='object')return;
  if(!isPlain(value)||value.isObject3D){fail('runtime-resource-in-user-data');return;}
  if(ancestors.has(value)){fail('cyclic-user-data');return;}
  if(Reflect.ownKeys(value).some(key=>typeof key==='symbol')){fail('nonserializable-user-data');return;}
  const next=new Set(ancestors);next.add(value);
  for(const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))){if(descriptor.get||descriptor.set){fail('user-data-accessor');continue;}inspect(descriptor.value,next);}
 }
 const materials=new Set();
 for(const node of nodes){
  if(reason)break;
  const dataDescriptors=Object.getOwnPropertyDescriptors(node.userData);
  if(Reflect.ownKeys(dataDescriptors).some(key=>typeof key==='symbol'||dataDescriptors[key].get||dataDescriptors[key].set)){fail('user-data-accessor');break;}
  if(node.isSkinnedMesh||node.isBone||node.isLight||node.isCamera||node.isAudio||node.animations?.length||node.skeleton){fail('animated-or-external-runtime');break;}
  if(dynamicFlags.some(key=>node.userData[key])||mediaFlags.some(key=>node.userData[key]!==undefined&&node.userData[key]!==false)||node.userData.worldPropDesign?.family==='character'){fail('dynamic-or-media-state');break;}
  if(nodeCallbacks.some(key=>node[key]!==Object3D.prototype[key])||Object.hasOwn(node,'clone')||Object.hasOwn(node,'copy')||node._listeners&&Object.keys(node._listeners).length){fail('instance-callback');break;}
  for(const [key,descriptor]of Object.entries(dataDescriptors)){
   if(key==='builderRoot'&&descriptor.value?.isObject3D&&descendants.has(descriptor.value))continue;
   inspect(descriptor.value);
  }
  const geometry=node.geometry;
  if(geometry&&(Object.keys(geometry.morphAttributes||{}).length||Object.values(geometry.attributes||{}).some(attribute=>attribute.usage!==StaticDrawUsage))){fail('mutable-geometry');break;}
  if(node.isInstancedMesh&&(node.instanceMatrix.usage!==StaticDrawUsage||node.instanceColor&&node.instanceColor.usage!==StaticDrawUsage)){fail('mutable-instance-data');break;}
  for(const material of [].concat(node.material||[])){
   if(materials.has(material))continue;materials.add(material);
   if(material.isShaderMaterial||material.isRawShaderMaterial||material.onBeforeCompile!==Material.prototype.onBeforeCompile||material.customProgramCacheKey!==Material.prototype.customProgramCacheKey||material._listeners&&Object.keys(material._listeners).length){fail('material-runtime');break;}
   inspect(material.userData);
   for(const texture of Object.values(material))if(texture?.isTexture&&(!sharedTexture(texture)||texture.isVideoTexture||texture.isCanvasTexture||texture.isRenderTargetTexture)){fail('mutable-or-owned-texture');break;}
  }
 }
 return {eligible:!reason,reason};
}

/** A world-local cache; returned placements always own their nodes/materials. */
export function createNativeModelCache({create,clone=cloneBuilderRuntime,maxEntries=128}={}){
 if(typeof create!=='function'||typeof clone!=='function')throw new TypeError('Native model caching requires create and clone functions.');
 const templates=new Map(),bypass=new Map(),instanceNodes=new WeakSet(),instanceMaterials=new WeakSet();
 const counts={requests:0,factoryCalls:0,cacheHits:0,clonedInstances:0,bypassed:0};
 const make=(id,options)=>{counts.factoryCalls++;return create(id,options);};
 function instance(entry){
  const root=clone(entry.root);
  if(!root?.isObject3D||root===entry.root)throw new TypeError('A native cache clone must be a separate Object3D.');
  const nodes=[];root.traverse(node=>nodes.push(node));
  if(nodes.some(node=>entry.nodes.has(node)||instanceNodes.has(node)))throw new TypeError('Native cache placements cannot reuse template or instance nodes.');
  const localMaterials=new Map();
  const isolate=material=>{
   if(localMaterials.has(material))return localMaterials.get(material);
   const result=entry.materials.has(material)||instanceMaterials.has(material)?material.clone():material;localMaterials.set(material,result);instanceMaterials.add(result);return result;
  };
  for(const node of nodes){
   instanceNodes.add(node);if(node.geometry)entry.retainedGeometries.add(node.geometry);
   if(node.material)node.material=Array.isArray(node.material)?node.material.map(isolate):isolate(node.material);
  }
  counts.clonedInstances++;return root;
 }
 return {
  create(id,options){
   counts.requests++;
   if(hasOptions(options)||unsafeId(id)||bypass.has(id)){counts.bypassed++;return make(id,options);}
   const cached=templates.get(id);if(cached){counts.cacheHits++;return instance(cached);}
   const root=make(id,options);if(!root)return root;
   const eligibility=nativeModelCacheEligibility(root,id);
   if(!eligibility.eligible||templates.size>=maxEntries){bypass.set(id,eligibility.reason||'cache-capacity');counts.bypassed++;return root;}
   const owned=resources(root),nodes=new Set();root.traverse(node=>nodes.add(node));
   const entry={root,...owned,nodes,retainedGeometries:new Set()};
   // Store only after a valid first clone exists. A caller-provided clone error
   // never leaves a half-prepared template available to later placements.
   try{const result=instance(entry);templates.set(id,entry);return result;}catch(error){for(const material of entry.materials)material.dispose();for(const geometry of entry.geometries)if(!entry.retainedGeometries.has(geometry))geometry.dispose();throw error;}
  },
  clear(){
   const disposed=new Set();
   for(const entry of templates.values()){
    for(const material of entry.materials)if(!disposed.has(material)){disposed.add(material);material.dispose();}
    // Returned clones retain these geometries until the world unloads. Bulk
    // scene disposal owns them; disposing here would invalidate live instances.
    for(const geometry of entry.geometries)if(!entry.retainedGeometries.has(geometry)&&!disposed.has(geometry)){disposed.add(geometry);geometry.dispose();}
   }
   templates.clear();bypass.clear();
  },
  stats(){return {...counts,templates:templates.size,excluded:Object.fromEntries(bypass)};}
 };
}
