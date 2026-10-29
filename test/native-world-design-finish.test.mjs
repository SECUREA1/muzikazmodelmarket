import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../public/vendor/three/three.module.min.js';
import {createBuilderLand} from '../public/js/environments/builder-land.js';
import {finishNativeWorldDesign,isNativeProceduralWorld,NATIVE_TEMPLATE_LAYOUT_IDS} from '../public/js/environments/native-world-design-finish.js';
import {NATIVE_DESIGN_VERSION} from '../public/js/native-design-profile.js';

function dispose(root){
 const resources=new Set();root.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of [].concat(node.material||[])){resources.add(material);for(const value of Object.values(material))if(value?.isTexture&&!value.userData.sportsSurfaceShared)resources.add(value);}});for(const value of resources)value.dispose();
}
test('every Backpack native layout alias uses the same crafted surface finish in its world constructor',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../public/models/backpack-assets.json',import.meta.url),'utf8'));
 const aliases=manifest.assets.filter(item=>item.builderLayoutId&&!item.buildAssetId),layouts=new Set(aliases.map(item=>item.builderLayoutId));
 assert.deepEqual([...layouts].sort(),[...NATIVE_TEMPLATE_LAYOUT_IDS].sort(),'the coverage list exactly matches current published Backpack map aliases');
 for(const layout of layouts){
  const root=createBuilderLand({id:'native-design-'+layout,source:'repository',builderScene:{layout,mapSize:40,objects:[]}});
  try{
   assert.equal(root.userData.nativeWorldDesign?.version,NATIVE_DESIGN_VERSION,layout);
   assert.ok(root.userData.nativeWorldDesign.materialCount>0,layout+' finishes actual native world materials');
   assert.ok(root.userData.nativeWorldDesign.texturedMaterialCount>0,layout+' receives authored surface maps');
   let finished=0;root.traverse(node=>{if(!node.isMesh)return;for(const material of [].concat(node.material||[]))if(material.userData.nativeSurfaceVersion===NATIVE_DESIGN_VERSION&&material.map)finished++;});
   assert.ok(finished>0,layout+' draws textured crafted materials');
  }finally{dispose(root);}
 }
});
test('native world finishing preserves geometry, placement, live material references, graphics and collision',()=>{
 const root=new T.Group(),surface=new T.MeshStandardMaterial({color:0x68513e,roughness:.8}),panel=new T.Mesh(new T.BoxGeometry(2,3,.2),surface);
 panel.name='TIMBER_WALL';panel.position.set(2,1.5,-4);root.add(panel);
 const graphic=new T.DataTexture(new Uint8Array([255,64,32,255]),1,1),screenMaterial=new T.MeshStandardMaterial({color:0xffffff,map:graphic}),screen=new T.Mesh(new T.PlaneGeometry(1,.6),screenMaterial);screen.userData.mediaScreen=true;screen.name='LIVE_VIDEO_SCREEN';root.add(screen);
 const sharedScreen=new T.Mesh(new T.PlaneGeometry(.5,.3),surface);sharedScreen.userData.mediaScreen=true;sharedScreen.name='LIVE_SHARED_MEDIA_SCREEN';root.add(sharedScreen);
 const collider=new T.Mesh(new T.BoxGeometry(2,3,.2),new T.MeshBasicMaterial());collider.userData.collisionOnly=true;collider.visible=false;root.add(collider);
 const identities=new Map();root.traverse(node=>identities.set(node,{geometry:node.geometry,transform:[...node.position,...node.quaternion,...node.scale],visible:node.visible}));
 const bounds=new T.Box3().setFromObject(root,true),updateEffects=()=>{surface.emissiveIntensity=.61;};root.userData.updateIslandEffects=updateEffects;
 finishNativeWorldDesign(T,root,{id:'native-room',builderScene:{layout:'loft'}});
 assert.equal(root.userData.updateIslandEffects,updateEffects);assert.equal(panel.material,surface,'live factory material reference is retained');
 assert.equal(screen.material,screenMaterial);assert.equal(screenMaterial.map,graphic);assert.equal(Boolean(sharedScreen.material.map),false,'a protected shared media material is not textured through another mesh');
 root.traverse(node=>{const before=identities.get(node);assert.ok(before,'surface finishing adds no geometry or lights');assert.equal(node.geometry,before.geometry);assert.deepEqual([...node.position,...node.quaternion,...node.scale],before.transform);assert.equal(node.visible,before.visible);});
 assert.deepEqual(new T.Box3().setFromObject(root,true),bounds);
 const finish=root.userData.nativeWorldDesign;finishNativeWorldDesign(T,root,{id:'native-room',builderScene:{layout:'loft'}});assert.equal(root.userData.nativeWorldDesign,finish,'repeated finishing is idempotent');
 updateEffects();assert.equal(panel.material.emissiveIntensity,.61);dispose(root);
});
test('imported, uploaded, private and member maps retain their own authored surface pipeline',()=>{
 const exceptions=[
  {id:'native-shape-private',visibility:'private',builderScene:{layout:'loft'}},
  {id:'member-plot',memberPlot:true,builderScene:{layout:'grand-floor'}},
  {id:'uploaded',source:'uploaded',builderScene:{layout:'loft'}},
  {id:'custom',source:'custom',builderScene:{layout:'loft'}},
  {id:'glb',source:'repository',modelUrl:'/public/models/map.glb',builderScene:{layout:'loft'}},
  {id:'base',builderScene:{layout:'loft',baseEnvironment:{modelUrls:['/uploads/map.glb']}}}
 ];
 for(const environment of exceptions){
  assert.equal(isNativeProceduralWorld(environment),false,environment.id);
  const root=new T.Group(),material=new T.MeshStandardMaterial({color:0x447799}),mesh=new T.Mesh(new T.BoxGeometry(),material);root.add(mesh);
  finishNativeWorldDesign(T,root,environment);assert.equal(mesh.material,material);assert.equal(material.map,null);assert.equal(root.userData.nativeWorldDesign,undefined);dispose(root);
 }
});
