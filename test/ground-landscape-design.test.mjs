import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/vendor/three/three.module.min.js';
import {GROUND_LANDSCAPE_VERSION,GROUND_LANDSCAPE_PROFILES,groundLandscapeTextures,groundLandscapeBudget,groundLandscapeProfile,createLandscapeGroundMaterial,setGroundLandscapeProjectionScale,finishGroundLandscape} from '../public/js/ground-landscape-design.js';
import {createLayoutMaterial,createLayoutTerrain} from '../public/js/environments/layout-terrain.js';
import {createBuilderLand} from '../public/js/environments/builder-land.js';
import {createSlimeFloor} from '../public/js/environments/slime-floor.js';

function snapshot(root){const nodes=new Map();root.traverse(node=>nodes.set(node,{geometry:node.geometry,material:node.material,attributes:new Map(Object.entries(node.geometry?.attributes||{}).map(([name,attribute])=>[name,{attribute,array:attribute.array.slice()}])),index:node.geometry?.index?.array.slice(),pose:[...node.position,...node.quaternion,...node.scale],userData:new Map(Object.entries(node.userData)),visible:node.visible,render:node.onBeforeRender,shadow:node.onBeforeShadow}));return nodes;}
function assertPhysical(root,before){
 let count=0;root.traverse(node=>{count++;const old=before.get(node);assert.ok(old,'landscape finishing adds no nodes or lights');assert.equal(node.geometry,old.geometry);assert.equal(node.material,old.material);assert.deepEqual([...node.position,...node.quaternion,...node.scale],old.pose);assert.equal(node.visible,old.visible);assert.equal(node.onBeforeRender,old.render);assert.equal(node.onBeforeShadow,old.shadow);for(const [name,{attribute,array}]of old.attributes){assert.equal(node.geometry.attributes[name],attribute);assert.deepEqual(attribute.array,array);}assert.deepEqual(node.geometry?.index?.array,old.index);for(const [key,value]of old.userData)assert.equal(node.userData[key],value);});assert.equal(count,before.size);
}
test('six bounded landscape profiles provide seamless shared mipmapped surface maps',()=>{
 assert.ok(Object.isFrozen(GROUND_LANDSCAPE_PROFILES));assert.equal(GROUND_LANDSCAPE_PROFILES.length,6);const maps=new Set();
 for(const profile of GROUND_LANDSCAPE_PROFILES){
  const textures=groundLandscapeTextures(T,profile);assert.equal(groundLandscapeTextures(T,profile),textures);assert.ok(Object.isFrozen(textures));
  for(const [key,texture]of Object.entries(textures)){
   maps.add(texture);const {width,height,data}=texture.image;assert.equal(width,128);assert.equal(height,128);assert.equal(data.byteLength,width*height*4);assert.ok(new Set(data).size>8,profile+' '+key+' has real surface variation');
   assert.equal(texture.userData.groundLandscapeShared,true);assert.equal(texture.userData.nativeSurfaceShared,undefined);assert.equal(texture.generateMipmaps,true);assert.equal(texture.minFilter,T.LinearMipmapLinearFilter);assert.equal(texture.wrapS,T.RepeatWrapping);assert.equal(texture.wrapT,T.RepeatWrapping);
   assert.deepEqual(texture.repeat.toArray(),[1,1]);assert.equal(texture.colorSpace,key==='map'?T.SRGBColorSpace:T.NoColorSpace);
   for(let i=0;i<width;i++)for(let c=0;c<4;c++){assert.equal(data[(i*width)*4+c],data[(i*width+width-1)*4+c],profile+' tiles horizontally');assert.equal(data[i*4+c],data[((height-1)*width+i)*4+c],profile+' tiles vertically');}
  }
 }
 assert.equal(maps.size,18);assert.deepEqual(groundLandscapeBudget(T),{profiles:6,textures:18,resolution:128,baseBytes:1179648,mipBytes:1572864,maxProfiles:6,maxTextures:18,metresPerTile:4});
 assert.throws(()=>groundLandscapeTextures(T,'unbounded-custom-profile'),RangeError);
});
test('world size and repeated material creation reuse the same maps without new texture versions',()=>{
 const initial=groundLandscapeBudget(T),materials=[40,80,160,1200,2000].map(size=>createLayoutMaterial('ancient-forest',size)),textures=groundLandscapeTextures(T,'grass'),versions=Object.values(textures).map(map=>map.version);
 for(const material of materials){assert.equal(material.map,textures.map);assert.equal(material.bumpMap,textures.bumpMap);assert.equal(material.roughnessMap,textures.roughnessMap);assert.equal(material.customProgramCacheKey(),GROUND_LANDSCAPE_VERSION+':uv-0.25');material.dispose();}
 for(let i=0;i<10;i++)createLandscapeGroundMaterial(T,{kind:'grass'}).dispose();assert.deepEqual(groundLandscapeBudget(T),initial);assert.deepEqual(Object.values(textures).map(map=>map.version),versions,'world visits never regenerate or reupload cached pixels');
});
test('world-space projection compiles once using existing standard-map varyings and preserves lighting shader code',()=>{
 const material=createLandscapeGroundMaterial(T,{kind:'grass'}),fragment='night lighting and shadow code stays intact',shader={vertexShader:'#include <uv_vertex>\n#include <begin_vertex>\n#include <project_vertex>',fragmentShader:fragment,uniforms:{}};
 material.onBeforeCompile(shader);assert.equal(shader.fragmentShader,fragment);assert.deepEqual(shader.uniforms,{});assert.match(shader.vertexShader,/modelMatrix\*landscapePosition/);for(const varying of ['vMapUv','vRoughnessMapUv','vBumpMapUv'])assert.match(shader.vertexShader,new RegExp(varying+'=landscapeUv'));assert.match(shader.vertexShader,/instanceMatrix\*landscapePosition/);assert.match(shader.vertexShader,/batchingMatrix\*landscapePosition/);assert.ok(shader.vertexShader.includes('#include <project_vertex>'));
});
test('tabletop presentation compensates texture scale once without new maps or physical changes',()=>{
 const root=new T.Group(),material=createLandscapeGroundMaterial(T,{kind:'sand',vertexColors:false}),mesh=new T.Mesh(new T.PlaneGeometry(40,40),material);root.add(mesh);const before=snapshot(root),map=material.map,textureVersion=map.version;
 setGroundLandscapeProjectionScale(root,.0125);assertPhysical(root,before);assert.equal(material.defines.GROUND_LANDSCAPE_UV_SCALE,20);assert.equal(material.map,map);assert.equal(map.version,textureVersion);
 const shader={vertexShader:'#include <begin_vertex>'};material.onBeforeCompile(shader);assert.match(shader.vertexShader,/\.xz\*20\.00000000;/,'integer-valued presentation scales compile as GLSL float literals');
 const materialVersion=material.version;setGroundLandscapeProjectionScale(root,.0125);assert.equal(material.version,materialVersion);setGroundLandscapeProjectionScale(root,1);assert.equal(material.defines.GROUND_LANDSCAPE_UV_SCALE,.25);assert.throws(()=>setGroundLandscapeProjectionScale(root,0),RangeError);
});
test('live RGB floor effects retain landscape projection and tabletop scale after standard-material cloning',()=>{
 const cacheKeys=new Set();
 for(const scale of [1,.0125]){
  const root=new T.Group(),source=createLandscapeGroundMaterial(T,{kind:'paving',vertexColors:false}),mesh=new T.Mesh(new T.PlaneGeometry(40,40),source);root.add(mesh);setGroundLandscapeProjectionScale(root,scale);
  const expected=1/(4*scale),key=source.customProgramCacheKey(),effect=createSlimeFloor([mesh]);
  cacheKeys.add(key);
  assert.notEqual(mesh.material,source);assert.equal(mesh.material.defines.GROUND_LANDSCAPE_UV_SCALE,undefined,'the real floor-effect clone resets custom defines');assert.equal(mesh.material.userData.groundLandscape.uvScale,expected);
  const shader={uniforms:{},vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};mesh.material.onBeforeCompile(shader,{});
  assert.ok(shader.vertexShader.includes('.xz*'+expected.toPrecision(10)+';'),'the retained hook emits its saved scale as a self-contained GLSL float');assert.ok(!shader.vertexShader.includes('GROUND_LANDSCAPE_UV_SCALE'),'the cloned shader has no undeclared scale macro');
  assert.ok(shader.fragmentShader.includes('slimeRing'),'the existing live coating remains composed');assert.ok(shader.vertexShader.includes('vSlimeWorldPosition'));assert.equal(mesh.material.customProgramCacheKey(),key+':rgb-slime-floor-v2');
  effect.update(5);assert.equal(shader.uniforms.slimeTime.value,5);effect.dispose();assert.equal(mesh.material,source);mesh.geometry.dispose();source.dispose();
 }
 assert.equal(cacheKeys.size,2,'different retained projection scales compile separate cached programs');
});
test('ground finishing retains every geometry attribute, collider, transform, material reference and gameplay callback',()=>{
 const root=new T.Group(),material=new T.MeshStandardMaterial({color:0x315b32,roughness:.94,emissive:0x112233,emissiveIntensity:.07}),ground=new T.Mesh(createLayoutTerrain('ancient-forest',40),material);ground.name='BUILDER_WALKABLE_FLOOR_ancient-forest';ground.rotation.x=-Math.PI/2;ground.userData={colliderShape:'mesh',walkableFloor:true};root.add(ground);root.position.set(3,0,7);root.scale.set(1.2,1,1.2);
 const callback=()=>17;root.userData.streetHeightAt=callback;root.userData.updateIslandEffects=callback;const before=snapshot(root),bounds=new T.Box3().setFromObject(root,true),color=material.color.clone(),emissive=material.emissive.clone();
 finishGroundLandscape(T,root,{source:'repository',builderScene:{layout:'ancient-forest'}});assertPhysical(root,before);assert.deepEqual(new T.Box3().setFromObject(root,true),bounds);assert.equal(root.userData.streetHeightAt,callback);assert.equal(root.userData.updateIslandEffects,callback);assert.deepEqual(material.color,color);assert.deepEqual(material.emissive,emissive);assert.equal(material.emissiveIntensity,.07);assert.equal(material.roughness,.94);
 assert.equal(material.map,groundLandscapeTextures(T,'grass').map);const marker=root.userData.groundLandscapeDesign,mapVersion=material.map.version;assert.equal(marker.materials,1);finishGroundLandscape(T,root,{builderScene:{layout:'ancient-forest'}});assert.equal(root.userData.groundLandscapeDesign,marker);assert.equal(material.map.version,mapVersion);
});
test('authored graphics, custom shaders, shared media and imported or specialized worlds retain their surfaces',()=>{
 const protectedWorlds=[{source:'uploaded'},{source:'custom'},{visibility:'private'},{memberPlot:true},{modelUrl:'/uploads/world.glb'},{builderScene:{layout:'ancient-forest',baseEnvironment:{modelUrls:['/uploads/base.glb']}}}];
 for(const settings of protectedWorlds){const root=new T.Group(),material=new T.MeshStandardMaterial(),mesh=new T.Mesh(new T.PlaneGeometry(),material);mesh.name='BUILDER_WALKABLE_FLOOR_ancient-forest';root.add(mesh);const before=snapshot(root);finishGroundLandscape(T,root,{builderScene:{layout:'ancient-forest'},...settings});assertPhysical(root,before);assert.equal(material.map,null);assert.equal(root.userData.groundLandscapeDesign,undefined);}
 for(const layout of ['loft','suite','ski-resort','mountain-compound','casino','hockey-arena','basketball-stadium','arcade-park','firing-range'])assert.equal(groundLandscapeProfile(layout),null,layout);
 const root=new T.Group(),graphic=new T.DataTexture(new Uint8Array([255,32,16,255]),1,1),art=new T.MeshStandardMaterial({map:graphic}),custom=new T.MeshStandardMaterial(),shared=new T.MeshStandardMaterial();custom.onBeforeCompile=()=>{};
 for(const [i,material]of [art,custom,shared].entries()){const mesh=new T.Mesh(new T.PlaneGeometry(5,5),material);mesh.name='BUILDER_WALKABLE_FLOOR_ancient-forest';mesh.position.x=i*6;root.add(mesh);}const screen=new T.Mesh(new T.PlaneGeometry(),shared);screen.name='LIVE_VIDEO_DISPLAY';screen.userData.mediaScreen=true;root.add(screen);const before=snapshot(root);finishGroundLandscape(T,root,{builderScene:{layout:'ancient-forest'}});assertPhysical(root,before);assert.equal(art.map,graphic);assert.equal(custom.map,null);assert.equal(shared.map,null);
});
test('native template ground uses richer surfaces through the normal constructor without extra geometry',()=>{
 const cases=[['ancient-forest','grass'],['sunrise-farm','soil'],['mountain-pass','gravel'],['dune-sea','sand'],['market-square','paving'],['cargo-yard','asphalt']];
 for(const [layout,kind]of cases){const root=createBuilderLand({id:'ground-quality-'+layout,source:'repository',builderScene:{layout,mapSize:40,objects:[]}}),ground=root.getObjectByName('BUILDER_WALKABLE_FLOOR_'+layout);assert.ok(ground,layout);assert.equal(ground.material.map,groundLandscapeTextures(T,kind).map);assert.equal(ground.material.userData.groundLandscape.profile,kind);assert.equal(root.userData.groundLandscapeDesign.addedMeshes,0);assert.equal(ground.userData.colliderShape,'mesh');}
});
