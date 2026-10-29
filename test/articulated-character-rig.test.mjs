import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/vendor/three/three.module.min.js';
import {articulateLimb,finalizeArticulatedCharacter,updateArticulatedCharacter,createArticulatedPlayer} from '../public/js/articulated-character-rig.js';
import {cloneBuilderRuntime} from '../public/js/builder-runtime-clone.js';
import {createWorldResident,updateWorldResident} from '../public/js/world-resident-model.js';
import {createCraftedCharacterModel,updateCraftedCharacterModel} from '../public/js/crafted-character-models.js';

const vector=node=>node.getWorldPosition(new T.Vector3());
const near=(actual,expected,tolerance=1e-6)=>assert.ok(actual.distanceTo(expected)<tolerance,`${actual.toArray()} != ${expected.toArray()}`);
const resources=(t,root)=>{t.after(()=>{const values=new Set();root.traverse(node=>{if(node.geometry)values.add(node.geometry);if(node.skeleton)values.add(node.skeleton);for(const material of [].concat(node.material||[]))values.add(material);});for(const value of values)value.dispose();});return root;};
const joints=root=>{const list=[];root.traverse(node=>{if(node.userData.articulatedLimb)list.push(node);});return list;};
const pose=root=>{const values=[];root.traverse(node=>{if(node.userData.articulatedLimb||/_(BEND|END)$/.test(node.name))values.push(...node.rotation.toArray().slice(0,3));});return values;};
const bytes=geometry=>[...Object.values(geometry.attributes),geometry.index].reduce((sum,attribute)=>sum+(attribute?.array.byteLength||0),0);

test('continuous sleeves retain one mesh and real bend rings, with stable attachment rest positions',t=>{
 const root=resources(t,new T.Group()),arm=new T.Group();arm.position.set(.3,1.3,0);root.add(arm);
 const sleeve=new T.Mesh(new T.CapsuleGeometry(.07,.35,4,10),new T.MeshStandardMaterial()),hand=new T.Mesh(new T.BoxGeometry(.1,.1,.1),sleeve.material);sleeve.name='SLEEVE';sleeve.position.y=-.22;hand.position.set(.02,-.47,0);arm.add(sleeve,hand);root.updateMatrixWorld(true);const rest=vector(hand),before=bytes(sleeve.geometry);
 const rig=articulateLimb(T,arm,{mesh:sleeve,bend:[0,-.23,0],end:[0,-.46,0],attachments:[hand],kind:'arm',prefix:'TEST'});root.updateMatrixWorld(true);near(vector(hand),rest);assert.equal(rig.mesh.name,'SLEEVE');assert.ok(rig.mesh.isSkinnedMesh);assert.equal(arm.children.filter(node=>node.isMesh).length,1);assert.ok(bytes(rig.mesh.geometry)+256<before,'geometry savings cover the bone palette');
 const weights=rig.mesh.geometry.attributes.skinWeight;for(let i=0;i<weights.count;i++)assert.ok(Math.abs(weights.getX(i)+weights.getY(i)-1)<1e-9);
 updateArticulatedCharacter(root,0,{gesture:'talk',upperBody:false});root.updateMatrixWorld(true);assert.ok(rig.bend.rotation.x>0);assert.ok(vector(hand).z<rest.z,'front -Z forearm folds toward the face');
});

test('knees bend backward and ankles level the foot for both authored facing directions',t=>{
 for(const forward of [-1,1]){
  const root=resources(t,new T.Group()),leg=new T.Group();root.add(leg);const shoe=new T.Mesh(new T.BoxGeometry(.15,.1,.25),new T.MeshStandardMaterial());shoe.position.y=-.6;leg.add(shoe);
  const rig=articulateLimb(T,leg,{bend:[0,-.3,0],end:[0,-.6,0],attachments:[shoe],kind:'leg',side:-1,forward,prefix:'LEG'});updateArticulatedCharacter(root,Math.PI/12,{moving:true});
  assert.equal(Math.sign(rig.bend.rotation.x),forward);assert.ok(Math.abs(leg.rotation.x+rig.bend.rotation.x+rig.end.rotation.x)<.11);assert.ok(Math.abs(rig.bend.rotation.x)<=.68);
 }
});

test('four limb meshes share one palette and clones own their bones while sharing immutable geometry',t=>{
 const source=resources(t,createWorldResident());source.userData.residentState={name:'Clone fixture',moving:true};updateWorldResident(source,.1);const skeletons=new Set();source.traverse(node=>{if(node.skeleton)skeletons.add(node.skeleton);});assert.equal(skeletons.size,1);assert.equal([...skeletons][0].bones.length,8);
 const copy=resources(t,cloneBuilderRuntime(source));assert.notEqual(copy.userData.residentLimbs[1].arm,source.userData.residentLimbs[1].arm);assert.notEqual(copy.userData.residentLimbs[1].elbow,source.userData.residentLimbs[1].elbow);
 const originalSkins=[],copySkins=[];source.traverse(node=>{if(node.isSkinnedMesh)originalSkins.push(node);});copy.traverse(node=>{if(node.isSkinnedMesh)copySkins.push(node);});
 for(let i=0;i<originalSkins.length;i++){assert.equal(copySkins[i].geometry,originalSkins[i].geometry);assert.notEqual(copySkins[i].skeleton,originalSkins[i].skeleton);assert.notEqual(copySkins[i].skeleton.bones[0],originalSkins[i].skeleton.bones[0]);}
 const original=pose(source);updateWorldResident(copy,1.8);assert.deepEqual(pose(source),original);assert.notDeepEqual(pose(copy),original);finalizeArticulatedCharacter(copy);assert.equal(new Set(copySkins.map(mesh=>mesh.skeleton)).size,1);
});

test('resident and crafted character animation reuse joint caches without frame traversals',t=>{
 const cases=[['world-resident',()=>createWorldResident(),updateWorldResident],...['forest-ranger','desert-merchant','clockwork-knight','moss-golem'].map(id=>[id,()=>createCraftedCharacterModel(id),updateCraftedCharacterModel])];
 for(const [id,create,update]of cases){const root=resources(t,create());if(id==='world-resident')root.userData.residentState={moving:true,gesture:'talk'};update(root,.1,{moving:true});const parts=joints(root);assert.equal(parts.length,4,id);let traversals=0;const traverse=root.traverse;root.traverse=function(callback){traversals++;return traverse.call(this,callback);};for(let frame=0;frame<30;frame++)update(root,frame/30,{moving:true});root.traverse=traverse;assert.equal(traversals,0,id+' has no full scene scan in the frame loop');assert.ok(pose(root).every(Number.isFinite));}
});

test('global reduced motion freezes residents, themed residents and workout joints without mutating server state',t=>{
 for(const state of [{moving:true,gesture:'talk'},{fitness:true,activity:'boxing',index:2,workout:{phase:'set'}},{funhouseClown:true,funhouseClownModelId:'funhouse-greeter-avatar',moving:true}]){
  const root=resources(t,createWorldResident());root.userData.residentState=state;const saved=structuredClone(state);updateWorldResident(root,2,{reducedMotion:true});const before=pose(root);updateWorldResident(root,7,{reducedMotion:true});assert.deepEqual(pose(root),before);assert.deepEqual(state,saved);
 }
});

test('fallback avatars have a visible face and one compact drawable mesh with valid packed skinning',t=>{
 const root=resources(t,createArticulatedPlayer(T)),meshes=[];root.traverse(node=>{if(node.isMesh)meshes.push(node);});assert.equal(meshes.length,1);const mesh=meshes[0];assert.equal(mesh.geometry.index.count/3,222);assert.ok(bytes(mesh.geometry)+1024<6816,'geometry plus actual bone palette stays below the old remote capsule');assert.equal(mesh.material.vertexColors,true);assert.equal(mesh.material.map,null);assert.equal(mesh.geometry.attributes.skinWeight.normalized,true);assert.equal(joints(root).length,4);
 const indices=mesh.geometry.attributes.skinIndex;for(let i=0;i<indices.count;i++)assert.ok(indices.getX(i)<mesh.skeleton.bones.length);updateArticulatedCharacter(root,.2,{moving:true});const first=pose(root);updateArticulatedCharacter(root,.7,{moving:true});assert.notDeepEqual(pose(root),first);updateArticulatedCharacter(root,9,{moving:true,reducedMotion:true});const frozen=pose(root);updateArticulatedCharacter(root,20,{moving:true,reducedMotion:true});assert.deepEqual(pose(root),frozen);
});

test('fitness gloves and hand tools follow the wrist rather than the upper arm',t=>{
 const root=resources(t,createWorldResident());root.userData.residentState={fitness:true,activity:'boxing',workout:{phase:'set'}};updateWorldResident(root,.2);const equipment=root.userData.fitnessEquipment;
 assert.equal(equipment.gloves[0].parent,root.userData.residentLimbs[-1].wrist);assert.equal(equipment.weights[1].parent,root.userData.residentLimbs[1].wrist);assert.equal(equipment.paddle.parent,root.userData.residentLimbs[1].wrist);assert.ok(root.userData.residentLimbs[-1].elbow.rotation.x>0);
});
