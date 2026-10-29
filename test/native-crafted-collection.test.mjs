import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createBuilderModel,updateBuilderModels} from '../public/js/builder-models-3d.js';
import {cloneBuilderRuntime} from '../public/js/builder-runtime-clone.js';
import {nativeBuilderItem} from '../public/js/native-builder-items.js';
import {IN_GAME_BUILDING_ITEMS} from '../public/js/in-game-building-catalog.js';
import {GAME_ECONOMY} from '../game-economy.mjs';
import {EQUIPMENT_PROP_MODEL_INFO} from '../public/js/equipment-prop-models.js';
import {CRAFTED_LANDSCAPE_MODEL_INFO} from '../public/js/crafted-landscape-models.js';
import {CRAFTED_CHARACTER_MODEL_INFO} from '../public/js/crafted-character-models.js';
import {CRAFTED_BUILDING_MODEL_INFO} from '../public/js/crafted-building-models.js';
import {CRAFTED_FURNITURE_MODEL_INFO} from '../public/js/crafted-furniture-models.js';

const collections=[
 [EQUIPMENT_PROP_MODEL_INFO,'equipmentPropModel'],
 [CRAFTED_LANDSCAPE_MODEL_INFO,'craftedLandscapeModel'],
 [CRAFTED_CHARACTER_MODEL_INFO,'craftedCharacterModel'],
 [CRAFTED_BUILDING_MODEL_INFO,'craftedBuildingModel'],
 [CRAFTED_FURNITURE_MODEL_INFO,'craftedFurnitureModel']
];
const info=Object.assign({},...collections.map(([metadata])=>metadata));
const ids=Object.keys(info);

// Existing purchase identities and prices are independent of a model's new
// geometry. A visual upgrade must not mint a replacement ownership record.
const legacySku={
 'canopy-tree':'backpack:backpack-canopy-tree',pond:'backpack:backpack-reflecting-pond',
 'lamp-post':'backpack:backpack-lamp-post',sofa:'backpack:backpack-cloud-sofa',
 'spiral-stairs':'backpack:backpack-spiral-stairs'
};
const legacyPrice={
 'giant-mushrooms':500,'room-divider':500,'path-tile':25,'lamp-post':25,
 planter:25,'pillow-ring':25,sofa:75,armchair:25,'coffee-table':25,
 bookshelf:75,'floor-lamp':25
};
const legacyBehavior={
 'plasma-sword':'pickup','battle-axe':'pickup','arc-bow':'pickup','crystal-staff':'pickup',
 'iron-anvil':'interact','street-sign':'talk',windmill:'interact',
 'forest-ranger':'quest','desert-merchant':'talk','clockwork-knight':'patrol',
 'spectral-ghost':'quest','emerald-slime':'hostile','moss-golem':'patrol',
 'cave-spider':'hostile','sky-ray':'patrol','friendly-ghost':'quest',
 'timber-cabin':'door','stone-tower':'door','market-stall':'talk','sci-fi-bunker':'door',
 'pillow-ring':'seat',sofa:'seat',armchair:'seat',campfire:'talk','green-bubbles':'heal'
};

function transform(node){return [...node.position,...node.quaternion,...node.scale];}
function pose(root){
 const values=[];
 root.traverse(node=>{
  const current=transform(node);
  for(const material of [].concat(node.material||[])){
   current.push(material.opacity,material.emissiveIntensity);
   if(material.color)current.push(...material.color);
   if(material.emissive)current.push(...material.emissive);
   for(const uniform of Object.values(material.uniforms||{}))if(typeof uniform.value==='number')current.push(uniform.value);
  }
  values.push(current);
 });
 return values;
}
function dispose(...roots){
 const resources=new Set();
 for(const root of roots)root?.traverse(node=>{
  if(node.geometry)resources.add(node.geometry);
  for(const material of [].concat(node.material||[])){
   resources.add(material);
   for(const value of Object.values(material))if(value?.isTexture)resources.add(value);
  }
 });
 for(const resource of resources)resource.dispose();
}

test('crafted collection replaces native scenery, equipment, actors and furniture with grounded finite models',()=>{
 assert.equal(collections.flatMap(([metadata])=>Object.keys(metadata)).length,ids.length,'each model has one authored factory');
 for(const [metadata,flag]of collections)for(const id of Object.keys(metadata)){
  const root=createBuilderModel(id);
  assert.ok(root,id+' constructs through the placement factory');
  try{
   assert.equal(root.userData.modelId,id);
   assert.equal(root.userData[flag],true,id+' uses its authored collection');
   let meshes=0,triangles=0,lights=0;
   root.traverse(node=>{
    if(node.isLight)lights++;
    assert.ok(transform(node).every(Number.isFinite),id+' has finite local transforms');
    if(!node.isMesh)return;
    meshes++;
    const positions=node.geometry?.getAttribute('position');
    assert.ok(positions?.count,id+' has drawable geometry');
    for(const coordinate of positions.array)assert.ok(Number.isFinite(coordinate),id+' has finite vertices');
    triangles+=(node.geometry.index?.count||positions.count)/3*(node.isInstancedMesh?node.count:1);
   });
   assert.ok(meshes>1&&meshes<=220,id+' has a practical mesh budget');
   assert.ok(triangles<=80000,id+' has a practical triangle budget');
   assert.equal(lights,0,id+' uses the shared world lights');
   const bounds=new THREE.Box3().setFromObject(root,true),size=bounds.getSize(new THREE.Vector3());
   assert.ok(!bounds.isEmpty()&&[...bounds.min,...bounds.max].every(Number.isFinite),id+' has finite placement bounds');
   assert.ok(Math.abs(bounds.min.y)<=.02,id+' rests at the placement origin');
   assert.ok([...size].every(value=>value>0&&value<30),id+' remains at useful metre scale');
   assert.ok(info[id][2].length===3&&info[id][2].every(value=>Number.isFinite(value)&&value>0),id+' declares valid dimensions');
  }finally{dispose(root);}
 }
});

test('crafted item animations agree in previews and worlds, freeze, and retain saved transforms',()=>{
 for(const id of ids){
  const root=createBuilderModel(id),group=new THREE.Group();
  try{
   root.position.set(5,2,-4);root.rotation.set(.1,.65,0);root.scale.set(1.2,.9,1.1);
   const savedTransform=transform(root);
   root.userData.animationState={enabled:true,speed:.75};
   updateBuilderModels(root,1.25);const direct=pose(root);
   updateBuilderModels(root,1.25);
   assert.deepEqual(pose(root),direct,id+' does not accumulate repeated animation frames');
   group.add(root);updateBuilderModels(group,1.25);
   assert.deepEqual(pose(root),direct,id+' uses the same preview and world frame');
   updateBuilderModels(group,4.5);
   assert.deepEqual(transform(root),savedTransform,id+' keeps its authored position, orientation and scale');
   root.userData.animationState.enabled=false;const frozen=pose(root);
   updateBuilderModels(group,9);
   assert.deepEqual(pose(root),frozen,id+' disabling animation freezes the current frame');
   root.userData.animationState={enabled:true,speed:0};
   updateBuilderModels(group,1);const stopped=pose(root);updateBuilderModels(group,12);
   assert.deepEqual(pose(root),stopped,id+' zero animation speed is respected');
  }finally{dispose(root);}
 }
});

test('crafted copies own their materials and animate without changing their source',()=>{
 const representatives=['plasma-sword','giant-mushrooms','spectral-ghost','sci-fi-bunker','lamp-post'];
 for(const id of representatives){
  const source=createBuilderModel(id);let copy;
  try{
   updateBuilderModels(source,.5);copy=cloneBuilderRuntime(source);
   const sourceFrame=pose(source),sourceMeshes=[],copyMeshes=[];
   source.traverse(node=>{if(node.isMesh)sourceMeshes.push(node);});
   copy.traverse(node=>{if(node.isMesh)copyMeshes.push(node);});
   assert.equal(copyMeshes.length,sourceMeshes.length,id+' copies the full design');
   for(let i=0;i<copyMeshes.length;i++){
    const originals=[].concat(sourceMeshes[i].material),copies=[].concat(copyMeshes[i].material);
    for(let j=0;j<copies.length;j++)assert.notEqual(copies[j],originals[j],id+' has independent material state');
    assert.equal(copyMeshes[i].userData.builderRoot,copy,id+' rebinds the placement root');
   }
   copy.userData.animationState={enabled:true,speed:2};updateBuilderModels(copy,3);
   const material=[].concat(copyMeshes[0].material)[0];material.opacity=.37;if(material.emissive)material.emissive.setHex(0x113355);
   assert.deepEqual(pose(source),sourceFrame,id+' copied effects and material edits leave the source untouched');
  }finally{dispose(source,copy);}
 }
});

test('crafted designs retain gameplay, prices and ownership identities across the shared catalog',async()=>{
 for(const id of ids){
  const native=nativeBuilderItem(id),catalog=IN_GAME_BUILDING_ITEMS.find(item=>item.buildAssetId===id),offers=GAME_ECONOMY.filter(item=>item.buildAssetId===id);
  assert.ok(native&&catalog,id+' remains in the editor and in-game library');
  const expectedSkus=['backpack:builder-'+id,...(legacySku[id]?[legacySku[id]]:[])],behavior=legacyBehavior[id]||'decor';
  assert.deepEqual(offers.map(offer=>offer.sku).sort(),expectedSkus.sort(),id+' retains existing Backpack ownership aliases');
  assert.equal(native.behavior,behavior,id+' retains its gameplay role');
  for(const offer of offers){
   assert.equal(offer.priceMzk,legacyPrice[id]??100,offer.sku+' retains its published purchase price');
   assert.equal(offer.function_data.behavior,behavior,offer.sku+' delivers the same gameplay role');
   assert.deepEqual(offer.dimensions,native.dimensions,offer.sku+' shares its placement dimensions');
  }
  assert.equal(native.image,'public/images/native-upgrades/'+id+'.svg',id+' uses dedicated artwork');
  const svg=await readFile(new URL('../public/images/native-upgrades/'+id+'.svg',import.meta.url),'utf8');
  assert.match(svg,/<svg\b[^>]*viewBox=/,id+' has scalable artwork');
  assert.match(svg,/<title\b/,id+' artwork has an accessible title');
  assert.match(svg,/<desc\b/,id+' artwork has an accessible description');
  assert.doesNotMatch(svg,/<script\b|\sonload\s*=/i,id+' artwork is passive');
 }
});
