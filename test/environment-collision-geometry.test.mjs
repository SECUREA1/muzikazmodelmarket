import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {isCollisionMesh} from '../public/js/environments/collision-policy.js';

const three=new URL('../public/vendor/three/three.module.min.js',import.meta.url).href;
const policy=new URL('../public/js/environments/collision-policy.js',import.meta.url).href;
const source=(await readFile(new URL('../public/js/environments/environment-collision.js',import.meta.url),'utf8'))
 .replace("'https://cdn.jsdelivr.net/npm/three@0.160.0/+esm'",JSON.stringify(three))
 .replace("'./collision-policy.js'",JSON.stringify(policy))
 .replace(/import \{ Octree \} from [^;]+;/,'class Octree {fromGraphNode(root){root.updateMatrixWorld(true);this.source=root;}}');
const {buildCollision,alignPointAboveFloor,FLOOR_ENTRY_OFFSET}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const box=(name,size=[1,1,1])=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),new THREE.MeshBasicMaterial());mesh.name=name;return mesh;};
function dispose(...roots){const geometry=new Set(),materials=new Set();for(const root of roots.filter(Boolean))root.traverse(mesh=>{if(mesh.geometry)geometry.add(mesh.geometry);for(const material of [].concat(mesh.material||[]))materials.add(material);});for(const resource of [...geometry,...materials])resource.dispose();}

test('collision clones match translated, rotated and scaled authored walls and tables exactly',()=>{
 const root=new THREE.Group();root.position.set(7,1,-3);root.rotation.y=.4;root.scale.set(1.5,2,.75);
 const group=new THREE.Group();group.position.set(-2,.5,4);group.rotation.z=.2;root.add(group);
 const wall=box('WALL',[5,3,.3]);wall.position.set(2,1,-4);wall.rotation.y=.7;wall.scale.set(.8,1.2,1.5);group.add(wall);
 const table=box('TABLE',[2,.15,1]);table.position.set(-4,.8,3);root.add(table);root.updateMatrixWorld(true);
 const collision=buildCollision(root);
 for(const mesh of [wall,table]){
  const clone=collision.octree.source.children.find(child=>child.name===mesh.name);assert.ok(clone);
  for(let i=0;i<16;i++)assert.ok(Math.abs(clone.matrixWorld.elements[i]-mesh.matrixWorld.elements[i])<1e-9,`${mesh.name} matrix element ${i}`);
  const expected=new THREE.Box3().setFromObject(mesh),actual=new THREE.Box3().setFromObject(clone);
  assert.ok(expected.min.distanceTo(actual.min)<1e-8&&expected.max.distanceTo(actual.max)<1e-8,'the collider occupies the visible surface rather than a displaced ghost surface');
 }
 dispose(root,collision.containment.root);
});

test('invisible ordinary props cannot create ghost collision and transparent glass remains solid',()=>{
 const root=new THREE.Group(),floor=box('FLOOR',[10,.2,10]);root.add(floor);
 const hiddenParent=new THREE.Group();hiddenParent.visible=false;root.add(hiddenParent);const hiddenChild=box('TABLE_HIDDEN_BY_PARENT');hiddenParent.add(hiddenChild);
 const invisible=box('INVISIBLE_PROP');invisible.material.transparent=true;invisible.material.opacity=0;root.add(invisible);
 const glass=box('GLASS');glass.material.transparent=true;glass.material.opacity=.3;root.add(glass);
 const multi=box('MULTI_MATERIAL_TABLE');multi.material=[new THREE.MeshBasicMaterial({visible:false}),new THREE.MeshBasicMaterial()];root.add(multi);
 const collider=box('COLLIDER_INVISIBLE_WALL');collider.material.visible=false;root.add(collider);
 const disabled=box('COLLIDER_DISABLED');disabled.userData.collisionDisabled=true;root.add(disabled);
 root.updateMatrixWorld(true);const collision=buildCollision(root,'auto',[],{buildOctree:false});
 for(const mesh of [floor,glass,multi,collider])assert.ok(collision.collisionMeshes.includes(mesh),mesh.name);
 for(const mesh of [hiddenChild,invisible,disabled])assert.ok(!collision.collisionMeshes.includes(mesh),mesh.name);
 assert.deepEqual(collision.visibleMeshes,[floor,glass,multi]);
 assert.ok(isCollisionMesh(glass));assert.equal(isCollisionMesh(invisible),false);
 dispose(root,collision.containment.root);
});

test('repeated and nested supplemental roots do not duplicate physical meshes in the octree',()=>{
 const root=new THREE.Group(),floor=box('FLOOR',[10,.2,10]),decor=new THREE.Group(),table=box('TABLE');root.add(floor,decor);decor.add(table);root.updateMatrixWorld(true);
 const collision=buildCollision(root,'auto',[decor,table,decor]);
 assert.equal(collision.collisionMeshes.filter(mesh=>mesh===table).length,1);
 assert.equal(collision.octree.source.children.filter(mesh=>mesh.name==='TABLE').length,1);
 dispose(root,collision.containment.root);
});

test('instanced props collide at each rendered instance rather than at their empty base origin',()=>{
 const root=new THREE.Group();root.position.set(3,0,-2);
 const props=new THREE.InstancedMesh(new THREE.BoxGeometry(2,1,2),new THREE.MeshBasicMaterial(),2);props.name='INSTANCED_TABLES';
 const transforms=[new THREE.Matrix4().makeTranslation(5,.5,0),new THREE.Matrix4().makeTranslation(-6,.5,4)];
 transforms.forEach((matrix,index)=>props.setMatrixAt(index,matrix));root.add(props);root.updateMatrixWorld(true);
 const collision=buildCollision(root),clones=collision.octree.source.children.filter(mesh=>mesh.name===props.name);
 assert.equal(clones.length,2);
 clones.forEach((clone,index)=>{assert.equal(clone.isInstancedMesh,undefined);const expected=new THREE.Matrix4().multiplyMatrices(props.matrixWorld,transforms[index]);assert.deepEqual(clone.matrixWorld.elements,expected.elements);});
 dispose(root,collision.containment.root);
});

test('floor alignment ignores disabled child meshes and respects nonuniform ramp normals',()=>{
 const root=new THREE.Group(),floor=box('FLOOR',[20,.2,20]);floor.position.y=-.1;root.add(floor);
 const child=box('DISABLED_PICKUP');child.position.y=2;child.userData.collisionDisabled=true;floor.add(child);root.updateMatrixWorld(true);
 const remoteChild=box('DISABLED_REMOTE_PROP');remoteChild.position.x=80;remoteChild.userData.collisionDisabled=true;floor.add(remoteChild);root.updateMatrixWorld(true);
 const collision=buildCollision(root,'auto',[],{buildOctree:false});
 assert.equal(collision.containment.bounds.max.x,10,'disabled descendants of a solid mesh cannot stretch the map collision boundary');
 const aligned=alignPointAboveFloor(new THREE.Vector3(0,0,0),collision.floorMeshes,new THREE.Box3().setFromObject(root));assert.ok(Math.abs(aligned.y-FLOOR_ENTRY_OFFSET)<1e-8,'a disabled child above the floor cannot become a spawn surface');
 const ramp=new THREE.Mesh(new THREE.PlaneGeometry(10,10).rotateX(-Math.PI/4),new THREE.MeshBasicMaterial());ramp.name='FLOOR_RAMP';ramp.scale.y=.2;ramp.position.y=1;ramp.updateMatrixWorld(true);
 const bounds=new THREE.Box3().setFromObject(ramp),onRamp=alignPointAboveFloor(new THREE.Vector3(),[ramp],bounds);
 assert.ok(Math.abs(onRamp.y-1-FLOOR_ENTRY_OFFSET)<1e-8,'a compressed ramp is walkable using the inverse-transpose world normal');
 dispose(root,ramp,collision.containment.root);
});
