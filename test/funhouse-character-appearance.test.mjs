import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {FUNHOUSE_CLOWN_AVATARS,funhouseCharacterAppearance} from '../public/js/funhouse-character-appearance.js';
import {syncServerAvatar,disposeProjection} from '../public/js/server-scene-projection.js';

test('funhouse player appearances are scoped to the map and never mutate a saved avatar',()=>{
 const peer={id:'account:brave-guest',username:'Guest',modelUrl:'/public/models/avatars/DAX.glb',avatarBuildAssetId:null,funhouse:{costume:{hat:true,shoes:true}}},saved=JSON.stringify(peer);
 for(const environment of [{id:'muzikaz-clown-funhouse'},{game:'funhouse'},{builderScene:{layout:'clown-funhouse'}},{builderScene:{layout:'my-copy',sourceLayout:'clown-funhouse'}}]){
  const display=funhouseCharacterAppearance(environment,peer);
  assert.notEqual(display,peer);assert.ok(FUNHOUSE_CLOWN_AVATARS.includes(display.avatarBuildAssetId));assert.equal(display.modelUrl,null);assert.equal(display.funhouseClownAppearance,true);
  assert.equal(display.id,peer.id);assert.equal(display.funhouse,peer.funhouse);assert.equal(JSON.stringify(peer),saved);
 }
 for(const environment of [{id:'muzikaz-main'},{game:'casino'},{builderScene:{layout:'fitness-centre'}},null])assert.equal(funhouseCharacterAppearance(environment,peer),peer);
 assert.equal(funhouseCharacterAppearance({game:'funhouse'},null),null);
});

test('each visitor keeps a stable clown variant and an already chosen clown is honored',()=>{
 const map={game:'funhouse'},first=funhouseCharacterAppearance(map,{id:'stable-account',username:'Old name'});
 assert.equal(funhouseCharacterAppearance(map,{id:'stable-account',username:'New name'}).avatarBuildAssetId,first.avatarBuildAssetId);
 for(const id of FUNHOUSE_CLOWN_AVATARS)assert.equal(funhouseCharacterAppearance(map,{id:'stable-account',avatarBuildAssetId:id}).avatarBuildAssetId,id);
 const variants=new Set(Array.from({length:100},(_,id)=>funhouseCharacterAppearance(map,{id:'guest-'+id}).avatarBuildAssetId));
 assert.equal(variants.size,5);
});

test('shared player presentation swaps to a clown in the funhouse and restores the selected GLB after travel',()=>{
 const peer={id:'account:guest',modelUrl:'/public/models/avatars/DAX.glb'},root=new THREE.Group(),body=new THREE.Group(),pending=[];
 root.add(body);root.userData.serverBody=body;
 const loader={load(url,success){pending.push({url,success});}},created=[];
 const sync=environment=>syncServerAvatar({THREE,root,peer:funhouseCharacterAppearance(environment,peer),loader,isCurrent:()=>true,prepare:value=>value,createNative:id=>{const model=new THREE.Group();model.userData.modelId=id;model.add(new THREE.Mesh(new THREE.BoxGeometry(.5,1.8,.5),new THREE.MeshStandardMaterial()));created.push(model);return model;}});
 sync({game:'funhouse'});assert.equal(pending.length,0);assert.equal(created.length,1);assert.equal(body.visible,false);assert.ok(root.userData.serverAvatarModel.userData.nativeAvatar);
 sync({game:'funhouse'});assert.equal(created.length,1,'identical snapshots reuse the current display model');
 sync({id:'muzikaz-main'});assert.equal(created[0].parent,null);assert.equal(body.visible,true);assert.equal(pending[0].url,peer.modelUrl);
 const original=new THREE.Group();pending[0].success({scene:original});assert.equal(root.userData.serverAvatarModel,original);assert.equal(body.visible,false);assert.equal(original.userData.nativeAvatar,undefined);
 assert.deepEqual(peer,{id:'account:guest',modelUrl:'/public/models/avatars/DAX.glb'});disposeProjection(root);
});
