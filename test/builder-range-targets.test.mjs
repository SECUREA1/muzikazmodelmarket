import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createBuilderLand} from '../public/js/environments/builder-land.js';
import {FIRING_RANGE_TARGETS} from '../public/js/firing-range.js';

const source=await readFile(new URL('../environment-builder.js',import.meta.url),'utf8');
const definition=prefix=>source.split('\n').find(line=>line.startsWith(prefix));

function editorRange(){
 const worldDressing=createBuilderLand({id:'range-editor-test',builderScene:{layout:'firing-range',mapSize:64,objects:[]}});
 const labels=new Map(),rangeState={playing:true,shots:0,hits:0,score:0,bullseyes:0,course:'qualification'},camera=new THREE.PerspectiveCamera();
 const context=vm.createContext({THREE,worldDressing,rangeState,camera,raycaster:new THREE.Raycaster(),$:(id)=>{if(!labels.has(id))labels.set(id,{});return labels.get(id);},scheduleRangeTarget(){},updateRangeHud(){}});
 vm.runInContext([definition('const rangeTargets='),definition('function setRangeTarget('),definition('function fireRangeShot('),'globalThis.controls={rangeTargets,setRangeTarget,fireRangeShot};'].join('\n'),context);
 return {worldDressing,labels,rangeState,camera,...context.controls};
}

test('editor qualification can select and hit every authored range target',()=>{
 const {worldDressing,labels,rangeState,camera,rangeTargets,setRangeTarget,fireRangeShot}=editorRange();
 const targets=rangeTargets();
 assert.equal(targets.length,FIRING_RANGE_TARGETS.length);
 for(const definition of FIRING_RANGE_TARGETS){
  const target=targets.find(node=>node.userData.rangeTargetId===definition.id);
  assert.ok(target,definition.id);
  setRangeTarget(target);
  assert.equal(rangeState.activeTarget,target);
  assert.equal(targets.filter(node=>node.userData.active).length,1);
  assert.equal(labels.get('#range-lane-label').textContent,`ACTIVE · LANE 0${definition.lane+1}`);
  const point=target.getWorldPosition(new THREE.Vector3());
  // Metal silhouettes put their scoring head above their group origin.
  if(definition.kind!=='paper')point.y+=2.18;
  camera.position.copy(point).add(new THREE.Vector3(0,0,1));camera.lookAt(point);camera.updateMatrixWorld();worldDressing.updateMatrixWorld(true);
  const hits=rangeState.hits,score=rangeState.score;
  fireRangeShot();
  assert.equal(rangeState.hits,hits+1,definition.id+' remains hittable in the editor');
  assert.ok(rangeState.score>score,definition.id+' awards qualification points');
 }
 setRangeTarget(null);
 assert.equal(targets.some(node=>node.userData.active),false);
});
