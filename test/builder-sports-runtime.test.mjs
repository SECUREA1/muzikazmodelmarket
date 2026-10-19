import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
import {updateBasketballBuilderAssets} from '../public/js/builder-sports-runtime.js';
import {anchorServerAsset} from '../public/js/server-scene-projection.js';

test('placed basketball shot clocks receive the current match clock through server anchoring wrappers',()=>{
 const clock=createBuilderModel('basketball-shot-clock'),wrapper=new THREE.Group();wrapper.add(clock);
 updateBasketballBuilderAssets([wrapper],{homeScore:22,awayScore:19,shotClockMs:7100},10);
 assert.equal(clock.userData.shotClockSeconds,8);
 updateBasketballBuilderAssets([wrapper],{homeScore:22,awayScore:19,shotClockMs:5900},11);
 assert.equal(clock.userData.shotClockSeconds,6);
});

test('whole arenas update once, independent deployed displays stay live, and decorative meshes are traversed once',()=>{
 let stateCalls=0,effectCalls=0,childCalls=0,traversals=0;
 const state={shotClockMs:18000},arena={userData:{setBasketballState:value=>{assert.equal(value,state);stateCalls++;},updateBasketballEffects:time=>{assert.equal(time,12);effectCalls++;}},children:[{userData:{setBasketballState:()=>childCalls++}}]},wrapper={userData:{},children:[arena]};
 const leaf={userData:{},get children(){traversals++;return [];}},decor={userData:{},children:[leaf]};
 updateBasketballBuilderAssets([wrapper,arena,decor],state,12);
 updateBasketballBuilderAssets([wrapper,arena,decor],state,12);
 assert.equal(stateCalls,2);assert.equal(effectCalls,2);assert.equal(childCalls,0);assert.equal(traversals,1);
 let addedCalls=0;const added={userData:{setBasketballState:()=>addedCalls++}};
 updateBasketballBuilderAssets([wrapper,added],state,12);assert.equal(addedCalls,1);
});

test('a display installed after its anchoring wrapper was first seen receives the next update',()=>{
 const wrapper=new THREE.Group();updateBasketballBuilderAssets([wrapper],null,0);
 const clock=createBuilderModel('basketball-shot-clock');wrapper.add(clock);
 updateBasketballBuilderAssets([wrapper],{shotClockMs:3200},1);assert.equal(clock.userData.shotClockSeconds,4);
});

test('server anchoring preserves the authored playing surface and regulation hoop heights',()=>{
 for(const id of ['basketball-stadium','basketball-court','hockey-arena','hockey-rink']){
  const content=createBuilderModel(id);assert.equal(content.userData.preservePlacementOrigin,true,id);
  const original=new THREE.Box3().setFromObject(content),wrapper=anchorServerAsset(THREE,content);
  assert.equal(content.position.y,0,id);assert.equal(wrapper.userData.preservePlacementOrigin,true);
  assert.ok(new THREE.Box3().setFromObject(wrapper).equals(original),`${id} retains its playing floor origin`);
  if(id.startsWith('basketball-'))wrapper.traverse(node=>{if(node.name==='BASKETBALL_RIM')assert.ok(Math.abs(node.getWorldPosition(new THREE.Vector3()).y-3.05)<.000001);});
 }
 const content=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial()),wrapper=anchorServerAsset(THREE,content);
 assert.equal(new THREE.Box3().setFromObject(wrapper).min.y,0,'ordinary props still rest on the ground');
});
