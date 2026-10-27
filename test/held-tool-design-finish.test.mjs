import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../public/vendor/three/three.module.min.js';
import {GAME_ECONOMY} from '../game-economy.mjs';
import {RANGED_WEAPONS,createRangedWeaponModel} from '../public/js/game-weapons.js';
import {UTILITY_TOOLS,createUtilityToolModel} from '../public/js/game-utilities.js';
import {HELD_TOOL_DESIGN_IDS,createHeldToolModel,finishHeldToolDesign} from '../public/js/held-tool-design-finish.js';
import {Flamethrower} from '../public/js/flamethrower.js';

function dispose(root){const resources=new Set();root.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of [].concat(node.material||[])){resources.add(material);for(const value of Object.values(material))if(value?.isTexture)resources.add(value);}});for(const resource of resources)resource.dispose();}
const pose=root=>[...root.position,...root.quaternion,...root.scale];

test('every native tool SKU has a textured physical design with bounded geometry and no added lights',()=>{
 const ids=GAME_ECONOMY.filter(item=>item.native&&!item.buildAssetId&&item.kind==='tool').map(item=>item.toolId);
 assert.deepEqual([...HELD_TOOL_DESIGN_IDS].sort(),ids.sort());
 for(const id of ids){const root=createHeldToolModel(T,id);try{
  assert.ok(root,id);assert.equal(root.userData.heldToolDesign.version,'crafted-native-v3');assert.equal(root.userData.heldToolDesign.id,id);
  let meshes=0,triangles=0,lights=0,textured=0;
  root.traverse(node=>{
   if(node.isLight)lights++;
   if(!node.isMesh)return;meshes++;
   const positions=node.geometry.getAttribute('position');assert.ok([...positions.array].every(Number.isFinite),id+' geometry is finite');
   triangles+=(node.geometry.index?.count||positions.count)/3*(node.isInstancedMesh?node.count:1);
   for(const material of [].concat(node.material))if(material.isMeshStandardMaterial&&material.map&&material.roughnessMap)textured++;
   if(node.userData.heldToolDetail){assert.equal(node.userData.collisionDisabled,true);assert.equal(node.userData.collider,false);}
  });
  assert.ok(meshes>1&&meshes<40,id+' remains a handheld item');assert.ok(triangles<20000,id+' stays within the handheld triangle budget');assert.equal(lights,0,id+' adds no lights');assert.ok(textured>0,id+' has actual authored surface maps');
  const bounds=new T.Box3().setFromObject(root,true);assert.ok(!bounds.isEmpty()&&[...bounds.min,...bounds.max].every(Number.isFinite));
  const count=meshes,transform=pose(root);finishHeldToolDesign(T,root,id);let after=0;root.traverse(n=>{if(n.isMesh)after++;});assert.equal(after,count,id+' finish is idempotent');assert.deepEqual(pose(root),transform);
 }finally{dispose(root);}}
});

test('weapon and utility factories keep their exact profiles, and the existing igniter keeps its camera pose',()=>{
 const weapons=JSON.stringify(RANGED_WEAPONS),utilities=JSON.stringify(UTILITY_TOOLS);
 for(const id of Object.keys(RANGED_WEAPONS)){const model=createRangedWeaponModel(T,id);assert.equal(model.userData.toolId,id);assert.ok(model.getObjectByName('HELD_TOOL_MUZZLE'));dispose(model);}
 for(const id of Object.keys(UTILITY_TOOLS)){const model=createUtilityToolModel(T,id);assert.equal(model.userData.toolId,id);dispose(model);}
 assert.equal(createRangedWeaponModel(T,'unknown'),null);assert.equal(createUtilityToolModel(T,'unknown'),null);assert.equal(createHeldToolModel(T,'unknown'),null);
 assert.equal(JSON.stringify(RANGED_WEAPONS),weapons);assert.equal(JSON.stringify(UTILITY_TOOLS),utilities);
 const system=new Flamethrower({THREE:T,scene:new T.Scene(),colliders:()=>[],damage:()=>{}}),igniter=system.createHeldModel();
 assert.deepEqual(igniter.position.toArray(),[.43,-.36,-.8]);assert.equal(igniter.userData.heldToolDesign.id,'flamethrower');igniter.traverse(node=>{if(node.isMesh){assert.equal(node.material.depthTest,false);assert.equal(node.renderOrder,20);}});dispose(igniter);system.dispose();
});

test('adding the crafted finish retains an existing tool muzzle, attachment and placement transform',()=>{
 const root=new T.Group(),caseMesh=new T.Mesh(new T.BoxGeometry(.24,.2,.5),new T.MeshStandardMaterial({color:0x345578,roughness:.6,metalness:.5})),grip=new T.Mesh(new T.CylinderGeometry(.04,.04,.28,12),new T.MeshStandardMaterial({color:0x172025,roughness:.9})),muzzle=new T.Object3D();
 muzzle.name='EXISTING_MUZZLE';muzzle.position.set(0,0,-.4);grip.position.y=-.2;root.add(caseMesh,grip,muzzle);root.userData.attachment={socket:'rightHand',offset:[.1,.2,0]};root.position.set(2,3,-4);root.rotation.y=.4;
 const transform=pose(root),muzzlePose=pose(muzzle),bounds=new T.Box3().setFromObject(root,true),attachment=structuredClone(root.userData.attachment);finishHeldToolDesign(T,root,'laser');
 assert.deepEqual(pose(root),transform);assert.deepEqual(pose(muzzle),muzzlePose);assert.deepEqual(root.userData.attachment,attachment);
 const finished=new T.Box3().setFromObject(root,true);for(const axis of ['x','y','z']){assert.ok(finished.min[axis]>=bounds.min[axis]-1e-6);assert.ok(finished.max[axis]<=bounds.max[axis]+1e-6);assert.ok(finished.max[axis]-finished.min[axis]>(bounds.max[axis]-bounds.min[axis])*.9,'chamfered corners retain the held footprint');}dispose(root);
});

test('the actual live held projection creates once, follows tool selection and hides previous tools',async()=>{
 const source=await readFile(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8'),start=source.indexOf('    syncAdditionalHeldModel(){'),end=source.indexOf('    updateVisualEffects(',start),method=source.slice(start,end);
 assert.ok(start>0&&end>start);
 const Projection=new Function('THREE','RANGED_WEAPONS','UTILITY_TOOLS','createRangedWeaponModel','createUtilityToolModel','createHeldToolModel','return class{'+method+'}')(T,RANGED_WEAPONS,UTILITY_TOOLS,createRangedWeaponModel,createUtilityToolModel,createHeldToolModel);
 const projection=new Projection();projection.camera=new T.Group();projection.toolSelected=true;projection.tool='pulse-rifle';projection.syncAdditionalHeldModel();
 const rifle=projection.additionalHeldModels.get('pulse-rifle');assert.ok(rifle?.visible);assert.equal(rifle.parent,projection.camera);const placement=pose(rifle);projection.syncAdditionalHeldModel();assert.equal(projection.additionalHeldModels.size,1);assert.deepEqual(pose(rifle),placement);
 projection.tool='scanner';projection.syncAdditionalHeldModel();const scanner=projection.additionalHeldModels.get('scanner');assert.ok(scanner.visible);assert.equal(rifle.visible,false);assert.equal(projection.additionalHeldModels.size,2);
 projection.tool='bat';projection.syncAdditionalHeldModel();assert.equal(scanner.visible,false);projection.tool='spray';projection.syncAdditionalHeldModel();assert.ok(projection.additionalHeldModels.get('spray').visible);
 for(const model of projection.additionalHeldModels.values())dispose(model);
});
