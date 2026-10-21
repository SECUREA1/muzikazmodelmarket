import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {alignStackableObject} from '../public/js/stack-placement.js';

const collisionPath = new URL('../public/js/environments/environment-collision.js', import.meta.url);
const explorerPath = new URL('../public/js/house-explorer-glb.js', import.meta.url);

test('all loaded worlds receive an invisible floor and perimeter collision shell', async () => {
  const source = await readFile(collisionPath, 'utf8');
  assert.match(source, /createMapContainment\(collisionMeshes\)/);
  assert.match(source, /COLLIDER_MAP_SAFETY_FLOOR/);
  assert.match(source, /COLLIDER_MAP_BOUNDARY/);
  assert.match(source, /source\.add\(containment\.root\)/);
  assert.match(source, /floorMeshes\.push\(containment\.floor\)/);
  assert.match(source, /FLOOR_ENTRY_OFFSET = 0\.02/, 'spawn clearance is exactly two centimetres above the collider');
  assert.ok(source.indexOf('createMapContainment(collisionMeshes)') < source.indexOf('supplementalRoots.filter'), 'movable items cannot expand the fixed map guides');
});

test('builder item collision follows visibility, pickup, drop, and door state', async () => {
  const source = await readFile(explorerPath, 'utf8');
  assert.match(source, /setActive:active=>\{object\.visible=active;object\.traverse\(child=>\{if\(child\.isMesh\)child\.userData\.collisionDisabled=!active;/);
  assert.match(source, /setHeld:held=>\{if\(held\)[\s\S]{0,350}collisionDisabled=true;[\s\S]{0,350}else\{object\.traverse\(child=>\{if\(child\.isMesh\)child\.userData\.collisionDisabled=false;/);
  assert.match(source, /setDoorOpen:open=>[\s\S]{0,220}collisionDisabled=open;[\s\S]{0,80}refreshBuilderCollision/);
});

test('avatars, objects, land layouts, and photo props load from their collider bottom', async () => {
  const source = await readFile(explorerPath, 'utf8');
  const helper=source.match(/  function liftObjectAboveFloor\([^\n]+/)[0];
  const context=vm.createContext({THREE,alignStackableObject,buildingSolids:()=>[]});
  vm.runInContext(helper,context);
  for(const offset of [-3,0,2]){
    const geometry=new THREE.BoxGeometry(1,2,1).translate(0,offset,0),root=new THREE.Mesh(geometry),point=new THREE.Vector3(1,4,3);
    context.liftObjectAboveFloor(root,point);
    assert.ok(Math.abs(new THREE.Box3().setFromObject(root).min.y-point.y)<1e-8,'the collider bottom rests on the requested floor');
    assert.deepEqual(point.toArray(),[1,4,3]);
  }
  assert.match(source, /toneMapped:false/);
  assert.match(source, /face\.renderOrder=2/);
  assert.ok((source.match(/liftObjectAboveFloor\(root,\s*(?:floorPoint|dropPoint)\)/g) || []).length >= 4);
});
