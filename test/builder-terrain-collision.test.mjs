import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createBuilderLand} from '../public/js/environments/builder-land.js';

const three = new URL('../public/vendor/three/three.module.min.js', import.meta.url).href;
const source = (await readFile(new URL('../public/js/environments/environment-collision.js', import.meta.url), 'utf8'))
  .replace("'../walking-triangles.js'", JSON.stringify(new URL('../public/js/walking-triangles.js', import.meta.url).href))
  .replace("'./layout-terrain.js'",JSON.stringify(new URL('../public/js/environments/layout-terrain.js',import.meta.url).href)).replace("'../../vendor/three/three.module.min.js'", JSON.stringify(three))
  .replace(/import \{ Octree \} from [^;]+;/, 'class Octree { fromGraphNode(root) { this.source = root; } }');
const {buildCollision, resolveSafeSpawn, FLOOR_ENTRY_OFFSET} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

function disposeRoots(...roots) {
  const resources = new Set();
  roots.filter(Boolean).forEach((root) => root.traverse((object) => {
    if (object.geometry) resources.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material) resources.add(material);
    }
  }));
  resources.forEach((resource) => resource.dispose());
}

for (const layout of ['grand-floor', 'loft', 'suite', 'courtyard']) {
  test(`empty ${layout} Builder terrain remains renderable and walkable in solo and server maps`, () => {
    const root = createBuilderLand({id: `empty-${layout}`, builderScene: {layout}});
    root.updateMatrixWorld(true);
    const terrain = root.getObjectByName(`BUILDER_WALKABLE_FLOOR_${layout}`);
    assert.equal(terrain.userData.colliderShape, 'mesh');
    for (const buildOctree of [true, false]) {
      const collision = buildCollision(root, 'auto', [], {buildOctree});
      assert.deepEqual(collision.visibleMeshes, [terrain], 'a terrain-only map passes the loader renderable-world check');
      assert.ok(collision.collisionMeshes.includes(terrain), 'rendered terrain retains physical collision');
      assert.ok(collision.floorMeshes.includes(terrain), 'spawn and floor queries retain the authored terrain');
      assert.equal(Boolean(collision.octree.source), buildOctree, 'server maps still avoid duplicate client physics');
      assert.ok(collision.containment.floor);
      assert.ok(!collision.visibleMeshes.includes(collision.containment.floor), 'the safety floor stays invisible');
      const spawn = resolveSafeSpawn(root, collision.floorMeshes, {x: 2, y: 0, z: 3});
      const ray = new THREE.Raycaster(new THREE.Vector3(2, 10, 3), new THREE.Vector3(0, -1, 0));
      const terrainHit = ray.intersectObject(terrain)[0];
      assert.ok(terrainHit, 'the authored floor supports a physical downward ray');
      assert.ok(Math.abs(spawn.position.y - terrainHit.point.y - FLOOR_ENTRY_OFFSET) < 1e-6, 'the spawn rests on the visible terrain');
      disposeRoots(collision.containment.root);
    }
    disposeRoots(root);
  });
}

test('visible explicit colliders can render while helper and hidden colliders stay excluded', () => {
  const root = new THREE.Group();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const visibleMaterial = new THREE.MeshBasicMaterial();
  const hiddenMaterial = new THREE.MeshBasicMaterial({visible: false});
  const mesh = (name, data = {}, material = visibleMaterial) => {
    const object = new THREE.Mesh(geometry, material);
    object.name = name;
    Object.assign(object.userData, data);
    root.add(object);
    return object;
  };
  const rendered = [
    mesh('AUTHORED_FLOOR', {colliderShape: 'mesh'}),
    mesh('AUTHORED_WALL', {collider: true}),
    mesh('AUTHORED_RAMP', {collision: true}),
    mesh('AUTHORED_MULTI_MATERIAL', {colliderShape: 'mesh'}, [hiddenMaterial, visibleMaterial])
  ];
  const namedHelpers = ['COLLIDER_FLOOR', 'WORLD_COLLISION_WALL', 'NAVMESH'].map((name) => mesh(name));
  const hiddenMesh = mesh('HIDDEN_PHYSICS', {collider: true});
  hiddenMesh.visible = false;
  const hiddenByMaterial = mesh('HIDDEN_PHYSICAL_MATERIAL', {colliderShape: 'mesh'}, hiddenMaterial);
  const hiddenByParent = mesh('HIDDEN_PHYSICAL_CHILD', {collision: true});
  const hiddenGroup = new THREE.Group();
  hiddenGroup.visible = false;
  hiddenGroup.add(hiddenByParent);
  root.add(hiddenGroup);
  root.updateMatrixWorld(true);

  const collision = buildCollision(root, 'auto', [], {buildOctree: false});
  assert.deepEqual(collision.visibleMeshes, rendered);
  for (const object of [...rendered, ...namedHelpers, hiddenMesh, hiddenByMaterial, hiddenByParent]) {
    assert.ok(collision.collisionMeshes.includes(object), `${object.name} retains its explicit physical surface`);
  }
  assert.ok(namedHelpers.every((object) => object.visible === false), 'named collider helpers remain forcibly hidden');
  assert.ok(!collision.visibleMeshes.includes(collision.containment.floor));
  disposeRoots(root, collision.containment.root);
});
test('flat terrain retains detailed artwork while collision uses an exact two-triangle floor',async()=>{
 const {createLayoutTerrain,layoutCollisionGeometry}=await import('../public/js/environments/layout-terrain.js');
 const geometry=createLayoutTerrain('grand-floor',256),root=new THREE.Group(),mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());mesh.name='BUILDER_WALKABLE_FLOOR_test';mesh.rotation.x=-Math.PI/2;root.add(mesh);
 const count=geometry.index.count,collision=buildCollision(root,undefined,[],{buildOctree:true,maxTriangles:10});assert.equal(collision.triangleCount,2);assert.equal(collision.octreeBuilt,true);assert.equal(mesh.geometry,geometry);assert.equal(geometry.index.count,count);assert.ok(count>1000);
 const proxy=layoutCollisionGeometry(geometry);assert.equal(proxy.index.count,6);assert.equal(proxy.parameters.width,256);assert.equal(proxy.parameters.height,256);
 const mountain=createLayoutTerrain('mountain-pass',128);assert.equal(layoutCollisionGeometry(mountain),mountain,'non-flat terrain keeps its exact slopes');geometry.dispose();mountain.dispose();mesh.material.dispose();proxy.dispose();
});
