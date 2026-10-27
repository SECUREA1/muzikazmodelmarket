import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/vendor/three/three.module.min.js';
import {createCreepyClownFace} from '../public/js/creepy-clown-face.js';
import {createFunhouseModel} from '../public/js/clown-funhouse-models.js';
import {createClownFunhouseLand} from '../public/js/environments/clown-funhouse-land.js';

function cleanup(t,root){t.after(()=>{const resources=new Set();root.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of [].concat(node.material||[])){resources.add(material);for(const value of Object.values(material))if(value?.isTexture)resources.add(value);}});for(const resource of resources)resource.dispose();root.clear();});return root;}
function geometryCount(root){let triangles=0;root.traverse(node=>{if(node.isMesh)triangles+=(node.geometry.index?.count||node.geometry.attributes.position.count)/3;});return triangles;}

test('creepy clown mask has pale makeup, angular eyes and a physical toothy grin without creating walking barriers',t=>{
 const root=cleanup(t,createCreepyClownFace({radius:.48}));
 assert.ok(root.userData.creepyClownFace);
 const pallor=root.getObjectByName('CREEPY_CLOWN_PALLID_FACE').material.color;
 assert.ok(pallor.r>.65&&pallor.g>.65&&pallor.b>.6,'pallid makeup is visibly distinct from the dark costume');
 assert.ok(geometryCount(root.getObjectByName('CREEPY_CLOWN_EYE_MAKEUP'))>0);
 assert.equal(root.getObjectByName('CREEPY_CLOWN_BROWS').children.length,2);
 const teeth=root.getObjectByName('CREEPY_CLOWN_TEETH');assert.equal(teeth.children.length,14);
 assert.ok(geometryCount(teeth)>100,'teeth are visible 3D geometry');
 root.traverse(node=>{if(node.isMesh)assert.equal(node.userData.collisionDisabled,true);});
});

test('all five playable clown avatars retain creepy eye makeup and teeth after decoration batching',t=>{
 const ids=['ringmaster','juggler','greeter','driver','scare-clown'];
 for(const role of ids){
  const id='funhouse-'+role+'-avatar',root=cleanup(t,createFunhouseModel(id));
  assert.ok(root.getObjectByName('CREEPY_CLOWN_FACE'),id);
  for(const name of ['CREEPY_CLOWN_EYE_MAKEUP','CREEPY_CLOWN_BROWS','CREEPY_CLOWN_GRIN','CREEPY_CLOWN_TEETH'])assert.ok(geometryCount(root.getObjectByName(name))>0,id+' retains '+name);
  const bounds=new T.Box3().setFromObject(root);assert.ok(Math.abs(bounds.max.y-bounds.min.y-1.8)<.001,id+' remains avatar scaled');
  root.userData.updateFunhouseEffects(3);
 }
});

test('midway performers, hidden car passengers, fright-box surprises, targets and facade share the creepy character theme',t=>{
 const root=cleanup(t,createClownFunhouseLand());
 for(const name of ['FUNHOUSE_MIDWAY_GREETER','FUNHOUSE_COSTUME_ASSISTANT','FUNHOUSE_BALLOON_CLOWN','FUNHOUSE_PLAYROOM_CLOWN','FUNHOUSE_POPUP_CLOWN_0','FUNHOUSE_POPUP_CLOWN_1',...Array.from({length:5},(_,index)=>'FUNHOUSE_CAR_SURPRISE_CLOWN_'+index)]){
  const character=root.getObjectByName(name);assert.ok(character,name);assert.ok(character.userData.creepyClownCharacter,name);assert.ok(character.getObjectByName('CREEPY_CLOWN_TEETH'),name+' uses the shared scary face');
 }
 for(const target of root.userData.funhouseTargets){assert.ok(target.root.userData.creepyClownCharacter);assert.ok(target.root.getObjectByName('CREEPY_CLOWN_EYE_MAKEUP'));assert.ok(target.root.getObjectByName('CREEPY_CLOWN_TEETH'));}
 assert.ok(root.getObjectByName('FUNHOUSE_GIANT_CLOWN_FACADE').userData.creepyClownFace);
 root.userData.animateFunhouseStation('funhouse-clown-car');root.userData.animateFunhouseStation('funhouse-jack-box');root.userData.updateFunhouseEffects(.3);
 assert.equal(root.getObjectByName('FUNHOUSE_CAR_SURPRISE_CLOWN_0').visible,true);
});
