import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import { BUILDING_MATERIALS, buildingMaterial, buildingDimensions, createBuildingBlock, toggleBuildingObject } from '../public/js/building-materials.js';

const dispose = root => root.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });

test('all building materials create usable grid-sized meshes with unique identifiers', () => {
  assert.equal(new Set(BUILDING_MATERIALS.map(m => m.id)).size, BUILDING_MATERIALS.length);
  for (const id of ['water', 'rock', 'dirt', 'brick', 'cement', 'wood', 'metal', 'glass', 'grass', 'sand']) assert.ok(BUILDING_MATERIALS.some(m => m.id === id));
  for (const material of BUILDING_MATERIALS.filter(m => !m.shape)) {
    const root = createBuildingBlock(THREE, material.id);
    assert.equal(root.userData.materialId, material.id);
    const body = root.children[0];
    assert.deepEqual([body.geometry.parameters.width, body.geometry.parameters.height, body.geometry.parameters.depth], [1.2, .4, .6]);
    assert.equal(body.material.color.getHex(), material.color);
    assert.equal(root.userData.solid, material.id !== 'water');
    dispose(root);
  }
  assert.equal(buildingMaterial('unknown').id, 'studs');
});

test('water and glass use transparency; metal and wood have different finishes', () => {
  for (const id of ['water', 'glass']) {
    const root = createBuildingBlock(THREE, id);
    assert.equal(root.children[0].material.transparent, true);
    assert.ok(root.children[0].material.opacity < 1);
    assert.equal(root.children[0].material.depthWrite, false);
    dispose(root);
  }
  assert.ok(buildingMaterial('metal').metalness > buildingMaterial('wood').metalness);
});

test('painting a newly created block preserves its material and previously placed blocks', () => {
  const placed = createBuildingBlock(THREE, 'cement');
  const painted = createBuildingBlock(THREE, 'cement', { tint: 0xff0000 });
  assert.equal(painted.children[0].material.color.getHex(), 0xff0000);
  assert.equal(painted.children[0].material.roughness, buildingMaterial('cement').roughness);
  assert.equal(placed.children[0].material.color.getHex(), buildingMaterial('cement').color);
  dispose(placed); dispose(painted);
});


test('fort pieces and marketplace props have selected dimensions and usable openings', () => {
  for (const id of ['wall','floor','steps','ramp','window','door','fence','pillar','market','counter','bench','planter']) {
    const root=createBuildingBlock(THREE,id);
    assert.equal(root.userData.structure,true);
    const box=new THREE.Box3().setFromObject(root),size=box.getSize(new THREE.Vector3());
    const dimensions=buildingDimensions(id);
    for(let axis=0;axis<3;axis++)assert.ok(size.getComponent(axis)<=dimensions[axis]+.001, id);
    dispose(root);
  }
  const window=createBuildingBlock(THREE,'window');
  window.updateMatrixWorld(true);
  const ray=new THREE.Raycaster(new THREE.Vector3(0,.1,2),new THREE.Vector3(0,0,-1));
  assert.equal(ray.intersectObject(window,true).length,0,'window aperture remains empty');
  const steps=createBuildingBlock(THREE,'steps');
  assert.equal(steps.children.length,4);
  assert.ok(steps.children[0].geometry.parameters.height<steps.children[3].geometry.parameters.height);
  dispose(window);dispose(steps);
});

test('opening and closing a door updates visible and collision geometry', () => {
  const door=createBuildingBlock(THREE,'door');
  const leaf=door.children.find(mesh=>mesh.userData.buildDoorLeaf);
  assert.equal(toggleBuildingObject(door),true);
  assert.equal(leaf.visible,false);
  assert.equal(leaf.userData.collisionDisabled,true);
  assert.equal(toggleBuildingObject(door),true);
  assert.equal(leaf.visible,true);
  assert.equal(leaf.userData.collisionDisabled,false);
  const cement=createBuildingBlock(THREE,'cement');
  assert.equal(toggleBuildingObject(cement),false);dispose(cement);
  dispose(door);
});

test('expanded catalog adds 35 items and type filtering combines with search', async () => {
  const { BUILDING_TYPES, buildingType, matchesBuildingItem } = await import('../public/js/building-materials.js');
  assert.equal(BUILDING_MATERIALS.length,74);
  for(const material of BUILDING_MATERIALS){
    assert.ok(BUILDING_TYPES.some(type=>type.id===buildingType(material)),material.id);
    const root=createBuildingBlock(THREE,material.id);
    assert.ok(root.children.length>0);
    assert.equal(root.userData.materialId,material.id);
    if(material.shape){
      const size=new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
      for(let axis=0;axis<3;axis++)assert.ok(size.getComponent(axis)<=material.dimensions[axis]+.001,material.id+' dimensions');
    }
    dispose(root);
  }
  assert.equal(matchesBuildingItem(buildingMaterial('bridge'),'access','BRIDGE'),true);
  assert.equal(matchesBuildingItem(buildingMaterial('bridge'),'market','bridge'),false);
  assert.equal(matchesBuildingItem(buildingMaterial('kiosk'),'market','kiosk'),true);
  assert.equal(matchesBuildingItem(buildingMaterial('steel'),'blocks','stone'),false);
});
