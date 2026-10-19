// Optional CPU benchmark using the real shipped GLB collision geometry.
// node scripts/benchmark-static-mesh-queries.mjs [muzikaz-main ...]
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {environmentGeometry} from '../server-glb-geometry.mjs';
import {isCollisionMesh} from '../public/js/environments/collision-policy.js';
import {accelerateStaticMeshes,MeshContactQueries} from '../public/js/static-mesh-queries.js';

const environments=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url),'utf8'));
const ids=process.argv.slice(2);if(!ids.length)ids.push('muzikaz-main','muzikaz-upper','sheepbase');
const median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
function timed(fn,iterations=3){fn();const times=[];for(let i=0;i<iterations;i++){const start=performance.now();fn();times.push(performance.now()-start);}return median(times);}
for(const id of ids){
  const environment=environments.find(record=>record.id===id||record.modelUrl?.includes(id));assert.ok(environment,`Unknown environment ${id}`);
  const root=environmentGeometry(environment,{accelerate:false}),meshes=[];root.traverse(mesh=>{if(mesh.isMesh&&isCollisionMesh(mesh))meshes.push(mesh);});
  const bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3()),rays=[];
  for(let i=0;i<256;i++){
    const x=bounds.min.x+size.x*((i%16+.5)/16),z=bounds.min.z+size.z*((Math.floor(i/16)+.5)/16);
    rays.push(new THREE.Raycaster(new THREE.Vector3(x,bounds.max.y+4,z),new THREE.Vector3(0,-1,0),0,size.y+12));
    const origin=new THREE.Vector3(center.x,center.y,z),direction=new THREE.Vector3(x,center.y+Math.sin(i)*2,center.z).sub(origin).normalize();
    rays.push(new THREE.Raycaster(origin,direction,0,size.length()));
  }
  const run=()=>rays.map(ray=>ray.intersectObjects(meshes,false));
  const reference=run(),nativeMs=timed(run),begin=performance.now();accelerateStaticMeshes(meshes);const buildMs=performance.now()-begin;
  const acceleratedMs=timed(run),actual=run();
  for(let ray=0;ray<reference.length;ray++){
    assert.equal(actual[ray].length,reference[ray].length);
    for(let hit=0;hit<reference[ray].length;hit++)assert.ok(Math.abs(actual[ray][hit].distance-reference[ray][hit].distance)<1e-6,'accelerated ray parity');
  }
  const dense=meshes.reduce((best,mesh)=>(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)>(best.geometry.index?.count??best.geometry.attributes.position.count)?mesh:best),queries=new MeshContactQueries();
  const triangle=new THREE.Triangle(),point=new THREE.Vector3(),positions=dense.geometry.attributes.position,index=dense.geometry.index;
  const denseBox=new THREE.Box3().setFromObject(dense),probe=denseBox.getCenter(new THREE.Vector3());
  const radius=Math.max(.001,denseBox.getSize(new THREE.Vector3()).length()*.00001);
  function linearTouch(){for(let i=0;i<(index?.count??positions.count);i+=3){for(let corner=0;corner<3;corner++)dense.getVertexPosition(index?index.getX(i+corner):i+corner,[triangle.a,triangle.b,triangle.c][corner]).applyMatrix4(dense.matrixWorld);triangle.closestPointToPoint(probe,point);if(point.distanceToSquared(probe)<=radius*radius)return true;}return false;}
  const flameLinearMs=timed(linearTouch,5),flameTreeMs=timed(()=>queries.touching(dense,probe,radius,true),5);
  assert.equal(queries.touching(dense,probe,radius,true),linearTouch());
  const triangles=meshes.reduce((total,mesh)=>total+(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3,0);
  console.log(JSON.stringify({environment:environment.id,meshes:meshes.length,triangles,queries:rays.length,buildMs:+buildMs.toFixed(2),nativeMs:+nativeMs.toFixed(2),acceleratedMs:+acceleratedMs.toFixed(2),speedup:+(nativeMs/acceleratedMs).toFixed(2),flameTriangles:(index?.count??positions.count)/3,flameLinearMs:+flameLinearMs.toFixed(3),flameTreeMs:+flameTreeMs.toFixed(3),flameSpeedup:+(flameLinearMs/flameTreeMs).toFixed(2)}));
  const geometries=new Set(),materials=new Set();root.traverse(mesh=>{if(mesh.geometry)geometries.add(mesh.geometry);[].concat(mesh.material||[]).forEach(material=>materials.add(material));});for(const resource of [...geometries,...materials])resource.dispose();
}
