import test from 'node:test';
import assert from 'node:assert/strict';
import {createEarthworks,earthworksTake} from '../public/js/construction-earthworks.js';
import {constructionGroundWorld} from '../server-construction-ground.mjs';

const config={excavation:{x:0,z:0,radius:4},stockpile:{x:20,z:0,width:8,depth:8}};
test('transaction-cloned earth state reuses immutable collision surfaces without sharing different room cuts',()=>{
 const earth=createEarthworks(config),original=constructionGroundWorld(earth),copy=structuredClone(earth),cloned=constructionGroundWorld(copy);
 assert.equal(cloned.meshes[0],original.meshes[0],'unchanged patches survive the room store transaction clone');
 assert.equal(cloned.meshes[1],original.meshes[1]);
 earthworksTake(copy,{x:1,z:1},4,{radius:0});
 const changed=constructionGroundWorld(copy);
 assert.notEqual(changed.meshes[0],original.meshes[0],'a cut replaces only the changed physical patch');
 assert.equal(changed.meshes[1],original.meshes[1],'the unchanged pile remains cached');
 assert.deepEqual(earth.patches[0].heights,Array(earth.patches[0].heights.length).fill(0),'a separate room retains its own uncut earth state');
 assert.equal(constructionGroundWorld(structuredClone(earth)).meshes[0],original.meshes[0]);
 const other=structuredClone(copy);other.revision=earth.revision;
 assert.equal(constructionGroundWorld(other).meshes[0],changed.meshes[0],'full shape content distinguishes rooms even at an identical revision');
 const moved=structuredClone(earth);moved.patches[0].origin.x+=100;
 assert.notEqual(constructionGroundWorld(moved).meshes[0],original.meshes[0],'patch placement is part of the physical cache key');
});
