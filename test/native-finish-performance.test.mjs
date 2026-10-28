import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/vendor/three/three.module.min.js';
import {finishNativeSurfaces} from '../public/js/native-surface-finish.js';
import {nativeSurfaceTextures} from '../public/js/material-design-finish.js';
import {createVehicleDesignKit} from '../public/js/vehicle-design-kit.js';

test('surface passes reuse immutable maps and visit a finished assembly only once',()=>{
 const root=new T.Group(),other=new T.Group(),geometry=new T.BoxGeometry();
 const wood=new T.MeshStandardMaterial({color:0x8a633f,roughness:.8}),wall=new T.Mesh(geometry,wood);
 wall.name='TIMBER_PANEL';root.add(wall);
 const copiedMaterial=wood.clone(),copy=new T.Mesh(geometry,copiedMaterial);copy.name=wall.name;other.add(copy);
 let traversals=0;const traverse=root.traverse.bind(root);root.traverse=callback=>{traversals++;return traverse(callback);};
 finishNativeSurfaces(T,root,'test-cabinet');
 assert.equal(traversals,1,'screen protection and unique-material work share one traversal');
 const summary=root.userData.nativeSurfaceFinish;
 finishNativeSurfaces(T,root,'test-cabinet');
 assert.equal(traversals,2,'the unchanged root needs one validation walk, rather than two');
 assert.equal(root.userData.nativeSurfaceFinish,summary,'a repeated pass does not allocate a new finish summary');
 finishNativeSurfaces(T,other,'test-cabinet');
 assert.notEqual(copiedMaterial,wood,'paint materials remain independent');
 for(const key of ['map','bumpMap','roughnessMap']){
  assert.equal(wood[key],copiedMaterial[key],key+' shares its immutable library resource across roots');
  assert.equal(wood[key],nativeSurfaceTextures(T,'timber')[key]);
  assert.equal(wood[key].userData.nativeSurfaceShared,true,key+' has an explicit cache lifetime');
 }
 geometry.dispose();wood.dispose();copiedMaterial.dispose();
});

test('incremental surface passes still finish new parts and protect a shared live-screen material',()=>{
 const root=new T.Group(),geometry=new T.BoxGeometry(),original=new T.MeshStandardMaterial({color:0x507080});
 root.add(new T.Mesh(geometry,original));finishNativeSurfaces(T,root,'test-device');
 const added=new T.MeshStandardMaterial({color:0x8a653f,roughness:.8}),panel=new T.Mesh(geometry,added);panel.name='TIMBER_EXTENSION';root.add(panel);
 const protectedMaterial=new T.MeshStandardMaterial({color:0x386070}),frame=new T.Mesh(geometry,protectedMaterial),screen=new T.Mesh(geometry,protectedMaterial);screen.userData.mediaScreen=true;
 root.add(frame,screen);finishNativeSurfaces(T,root,'test-device');
 assert.ok(added.map,'parts added after the first pass receive the same authored finish');
 assert.equal(protectedMaterial.map,null,'a display palette shared with an ordinary mesh remains untouched');
 assert.equal(screen.material,protectedMaterial);assert.equal(frame.material,protectedMaterial);
 const image=new T.DataTexture(new Uint8Array([255,200,100,255]),1,1),authored=new T.MeshStandardMaterial({map:image});
 const face=new T.Mesh(geometry,authored);face.name='AUTHORED_PANEL';root.add(face);finishNativeSurfaces(T,root,'test-device');
 assert.equal(authored.map,image,'existing authored imagery is retained');
 for(const material of [original,added,protectedMaterial,authored])material.dispose();image.dispose();geometry.dispose();
});

test('vehicle cosmetic fitting updates only the candidate ancestor chain',()=>{
 const root=new T.Group(),boundsGeometry=new T.BoxGeometry(20,20,20),material=new T.MeshStandardMaterial();
 root.position.set(4,2,-7);root.rotation.y=.4;
 root.add(new T.Mesh(boundsGeometry,material));
 const unrelated=[];
 for(let i=0;i<250;i++){const node=new T.Object3D();node.position.set(i%5,0,0);root.add(node);unrelated.push(node);}
 const rig=new T.Group(),arm=new T.Group();root.add(rig);rig.add(arm);
 const kit=createVehicleDesignKit(T,root,'test-vehicle');
 let siblingUpdates=0;
 for(const node of unrelated){const update=node.updateMatrix;node.updateMatrix=function(){siblingUpdates++;return update.call(this);};}
 rig.rotation.z=.3;arm.position.set(1,.5,0);
 const accepted=kit.box(arm,[.2,.3,.4],[.5,.25,.1],material,'TEST_FITTING');
 assert.ok(accepted,'a fitting is accepted under a moved, rotated rig parent');
 assert.equal(siblingUpdates,0,'adding one fitting does not recompute unrelated hull/rig nodes');
 const actual=new T.Box3().setFromObject(accepted,true),expected=actual.clone();
 root.updateMatrixWorld(true);
 assert.ok(new T.Box3().setFromObject(accepted,true).min.distanceTo(expected.min)<1e-8);
 assert.ok(new T.Box3().setFromObject(accepted,true).max.distanceTo(expected.max)<1e-8,'the incremental and complete matrix updates produce identical bounds');
 assert.ok(kit.bounds.containsBox(actual));
 assert.equal(kit.box(arm,[.2,.3,.4],[100,0,0],material,'OUTSIDE_FITTING'),null,'out-of-envelope details remain rejected');
 boundsGeometry.dispose();accepted.geometry.dispose();material.dispose();
});

test('small vehicle trim curves stay below the cosmetic triangle budget',()=>{
 const root=new T.Group(),geometry=new T.BoxGeometry(10,10,10),material=new T.MeshStandardMaterial();root.add(new T.Mesh(geometry,material));
 const kit=createVehicleDesignKit(T,root,'test-vehicle'),ring=kit.torus(root,.5,.025,[0,0,0],material,'THIN_RING'),cylinder=kit.cylinder(root,.1,.1,.6,[0,0,0],material,'SMALL_CAP'),tube=kit.tube(root,[-.2,0,0],[.2,0,0],.025,material,'THIN_TUBE');
 const triangles=node=>(node.geometry.index?.count||node.geometry.attributes.position.count)/3;
 assert.equal(triangles(ring),160,'a thin trim ring uses four radial by twenty circular segments');
 assert.equal(triangles(cylinder),48,'a small detail cap uses twelve sides');
 assert.equal(triangles(tube),32,'a thin protective tube uses eight sides');
 for(const node of [ring,cylinder,tube])node.geometry.dispose();geometry.dispose();material.dispose();
});

test('direct constructors fit nested vehicles before their enclosing world has updated',()=>{
 const world=new T.Group(),root=new T.Group(),material=new T.MeshStandardMaterial(),geometry=new T.BoxGeometry(4,4,4);
 world.position.set(30,0,40);root.position.set(-2,0,3);world.add(root);root.add(new T.Mesh(geometry,material));
 const kit=createVehicleDesignKit(T,root,'nested-vehicle');
 assert.deepEqual(kit.bounds.getCenter(new T.Vector3()).toArray(),[28,0,43],'initial envelope includes the previously uncomputed world ancestor');
 const detail=kit.box(root,[.2,.2,.2],[0,0,0],material,'NESTED_FITTING');
 assert.ok(detail,'the fitting uses the same coordinate space as the source envelope');
 assert.ok(kit.bounds.containsBox(new T.Box3().setFromObject(detail,true)));
 geometry.dispose();detail.geometry.dispose();material.dispose();
});
