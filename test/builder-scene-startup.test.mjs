import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createLayoutTerrain,createLayoutMaterial,layoutHeight} from '../public/js/environments/layout-terrain.js';
import {createBuilderLand} from '../public/js/environments/builder-land.js';
import {applyBuilderBaseTransform} from '../public/js/environments/builder-base.js';
import {isSharedGraphicsTexture} from '../public/js/game-graphics-resources.js';

test('actual builder scene setup initializes and populates every procedural template',async()=>{
 const source=await readFile(new URL('../environment-builder.js',import.meta.url),'utf8');
 assert.ok(!source.includes('await refreshMemberModels();watchInventoryChange'), 'optional backpack requests cannot block initial map population');
 const setup=source.slice(source.indexOf('const worldDressing='),source.indexOf('let preview=null'));
 assert.ok(setup.length>1000);
 const world=new THREE.Scene();world.background=new THREE.Color();world.fog=new THREE.Fog(0,1,100);
 const sceneData={layout:'grand-floor',mapSize:40,objects:[]};
 const ids=['grand-floor','community-park','loft','suite','courtyard','hedge-maze','neon-maze','dungeon-maze','vendor-street','creator-studios','market-square','mountain-pass','crystal-cavern','railroad-world','skyport','dune-sea','deep-mine','sunrise-farm','coastal-cliffs','ancient-forest','neon-wetlands','blacksite','cargo-yard','neon-arena','desert-outpost','mega-mall','office-tower','firing-range','movie-studio','desert-airfield','urban-downtown','urban-civic-quarter'];
 const layouts=Object.fromEntries(ids.map(id=>[id,{color:0x315b32,sky:0x17252d}]));
 const badge={classList:{add(){}},querySelector:()=>({textContent:''})};
 const create=new Function('THREE','world','createGameModelLoader','renderer','sceneData','layouts','$','applyWeather','createLayoutTerrain','createLayoutMaterial','layoutHeight','createBuilderLand','applyBuilderBaseTransform','isSharedGraphicsTexture','const baseWorld=null,applyBuilderLayerVisibility=()=>{};'+setup+';return {shapeTerrain,terrain,worldDressing,proceduralWorld,placedGroup};');
 const editor=create(THREE,world,()=>({}),null,sceneData,layouts,()=>badge,()=>{},createLayoutTerrain,createLayoutMaterial,layoutHeight,createBuilderLand,applyBuilderBaseTransform,isSharedGraphicsTexture);
 assert.equal(editor.worldDressing.parent,editor.proceduralWorld);
 assert.equal(editor.placedGroup.parent,world);
 for(const id of ids){sceneData.layout=id;editor.shapeTerrain();assert.ok(editor.terrain.geometry.attributes.position.count>0,id);assert.equal(editor.worldDressing.getObjectsByProperty('name','SERVER_STREETS').length,id==='firing-range'?0:1,id);if(['creator-studios','firing-range','hedge-maze'].includes(id))assert.ok(editor.worldDressing.children.length>5,id);}
 sceneData.layout='grand-floor';sceneData.mapSize=160;sceneData.baseTransform={x:100};editor.shapeTerrain();assert.equal(editor.terrain.geometry.parameters.width,160);assert.equal(editor.proceduralWorld.position.x,100);assert.equal(editor.placedGroup.position.x,0);
 world.traverse(node=>{node.geometry?.dispose();[].concat(node.material||[]).forEach(material=>{if(!isSharedGraphicsTexture(material?.map))material?.map?.dispose();material?.dispose();});});
});
