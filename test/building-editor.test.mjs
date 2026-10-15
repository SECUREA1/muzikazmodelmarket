import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import { BuildingEditor } from '../public/js/building-editor.js';
import { createBuildingBlock, buildingIcon, BUILDING_MATERIALS } from '../public/js/building-materials.js';

test('axis dragging changes all translations, rotations and scale before confirmation',()=>{
 const editor=new BuildingEditor(THREE),root=createBuildingBlock(THREE,'window');root.position.set(2,3,4);editor.begin(root,true);
 for(const [key,value]of Object.entries({x:1,y:-1,z:2,rx:45,ry:90,rz:-30,scale:2}))editor.set(key,value);
 assert.deepEqual(root.position.toArray(),[3,2,6]);
 assert.ok(Math.abs(root.rotation.x-Math.PI/4)<1e-9);
 assert.ok(Math.abs(root.rotation.y-Math.PI/2)<1e-9);
 assert.ok(Math.abs(root.rotation.z+Math.PI/6)<1e-9);
 assert.deepEqual(root.scale.toArray(),[2,2,2]);
 const edit=editor.confirm();assert.equal(edit.root,root);assert.equal(edit.isNew,true);assert.equal(editor.pending,null);
 root.traverse(m=>{m.geometry?.dispose();m.material?.dispose();});
});

test('cancel restores a placed object including paint and removes an unconfirmed new piece',()=>{
 const editor=new BuildingEditor(THREE),scene=new THREE.Scene(),root=createBuildingBlock(THREE,'door');scene.add(root);
 const color=root.children[0].material.color.getHex();editor.begin(root);editor.set('x',4);editor.paint(0xff0000);editor.cancel();
 assert.equal(root.position.x,0);assert.equal(root.children[0].material.color.getHex(),color);assert.equal(root.parent,scene);
 editor.begin(root,true);editor.cancel();assert.equal(root.parent,null);
});

test('spin is delta-based, bounded controls ignore invalid values and cancel stops it',()=>{
 const editor=new BuildingEditor(THREE),root=createBuildingBlock(THREE,'studs');editor.begin(root);editor.spin=true;
 editor.update(1);assert.equal(editor.values.ry,45);editor.set('scale',100);assert.equal(editor.values.scale,3);
 editor.set('x',NaN);assert.equal(editor.values.x,0);editor.cancel();assert.equal(editor.spin,false);
 root.traverse(m=>{m.geometry?.dispose();m.material?.dispose();});
});

test('every building item has finite model-derived SVG artwork and structures differ',()=>{
 for(const material of BUILDING_MATERIALS){const svg=buildingIcon(THREE,material.id);assert.ok(svg.startsWith('<svg'));assert.ok(svg.includes('<path'));assert.ok(!/NaN|Infinity/.test(svg));}
 assert.notEqual(buildingIcon(THREE,'window'),buildingIcon(THREE,'wall'));
 assert.notEqual(buildingIcon(THREE,'market'),buildingIcon(THREE,'steps'));
});
