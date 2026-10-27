import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/vendor/three/three.module.min.js';
import {updateFunhouseCostume,clearFunhouseCostume} from '../public/js/clown-funhouse-costume.js';

test('funhouse costume toggles and animates without rebuilding or modifying an avatar',()=>{
 const avatar=new T.Group(),body=new T.Mesh(new T.BoxGeometry(.5,1.8,.3),new T.MeshStandardMaterial({color:'#897bbc'}));avatar.add(body);
 assert.equal(updateFunhouseCostume(avatar,{},0),null);assert.equal(avatar.children.length,1);
 const outfit=updateFunhouseCostume(avatar,{hat:true,shoes:true},1);
 assert.ok(outfit.userData.hat.visible&&outfit.userData.shoes.visible);assert.equal(avatar.children.length,2);
 assert.ok(outfit.getObjectByName('FUNHOUSE_LEFT_SHOE'));assert.ok(outfit.getObjectByName('FUNHOUSE_RIGHT_SHOE'));
 const spinner=outfit.userData.spinner,rotation=spinner.rotation.y;
 assert.equal(updateFunhouseCostume(avatar,{hat:true},2),outfit);assert.notEqual(spinner.rotation.y,rotation);assert.equal(outfit.userData.shoes.visible,false);
 assert.equal(body.material.color.getHexString(),'897bbc');assert.equal(body.position.y,0);
 updateFunhouseCostume(avatar,{hat:true},3,{reducedMotion:true});const stopped=spinner.rotation.y;
 updateFunhouseCostume(avatar,{hat:true},4,{reducedMotion:true});assert.equal(spinner.rotation.y,stopped);
 outfit.traverse(node=>{assert.equal(node.userData.collisionDisabled,true);if(node.isMesh)assert.deepEqual(node.raycast(),undefined);});
 updateFunhouseCostume(avatar,{},5);assert.equal(outfit.visible,false);assert.equal(avatar.children.length,2);
 clearFunhouseCostume(avatar);body.geometry.dispose();body.material.dispose();
});

test('costume cleanup disposes shared resources exactly once and keeps authored meshes',()=>{
 const avatar=new T.Group(),body=new T.Mesh(new T.BoxGeometry(1,1,1),new T.MeshBasicMaterial());avatar.add(body);
 let authoredDisposals=0;body.geometry.addEventListener('dispose',()=>authoredDisposals++);
 const outfit=updateFunhouseCostume(avatar,{hat:true,shoes:true},0,{height:.9});assert.equal(outfit.scale.y,.5);
 const counts=new Map();outfit.traverse(node=>{for(const resource of [node.geometry,...[].concat(node.material||[])].filter(Boolean))if(!counts.has(resource)){counts.set(resource,0);resource.addEventListener('dispose',()=>counts.set(resource,counts.get(resource)+1));}});
 clearFunhouseCostume(avatar);clearFunhouseCostume(avatar);
 assert.equal(avatar.children.length,1);assert.equal(avatar.children[0],body);assert.equal(authoredDisposals,0);
 assert.ok(counts.size>10);for(const count of counts.values())assert.equal(count,1);
 body.geometry.dispose();body.material.dispose();
});
