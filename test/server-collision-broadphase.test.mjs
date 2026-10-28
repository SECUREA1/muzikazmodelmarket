import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';

test('floor and walking queries skip distant map and deployed meshes while keeping local support',()=>{
 const collision=new ServerBuilderCollision(),environment={id:'nearby-collision',proceduralLand:true,builderScene:{layout:'grand-floor',mapSize:256,objects:[{id:'remote-crate',modelId:'supply-crate',position:{x:70,y:0,z:70}}]}};
 const actors={crate:{id:'crate',spawned:true,active:true,asset:{buildAssetId:'supply-crate'},position:{x:-70,y:0,z:-70},rotation:{y:0}}};
 const world=collision.world(environment),deployed=collision.placedWorld(actors,{},environment);
 let distantRays=0;
 for(const mesh of [...world.floors.filter(mesh=>{for(let node=mesh;node;node=node.parent)if(node.userData.builderObjectId==='remote-crate')return true;return false;}),...deployed.meshes]){const original=mesh.raycast;mesh.raycast=function(...args){distantRays++;return original.apply(this,args);};}
 const floor=collision.groundAt(environment,{x:0,y:0,z:0},{actors});assert.ok(floor);
 const next=collision.resolve(environment,floor,{...floor,x:.4,y:floor.y-.1},actors);
 assert.ok(next.x>.39);assert.ok(Math.abs(next.y-floor.y)<.001);assert.equal(distantRays,0,'remote geometry must not be raycast for local AI/player queries');
});

test('moving a deployed solid updates floor candidates instead of leaving stale footprints',()=>{
 const collision=new ServerBuilderCollision(),environment={id:'moving-collision',proceduralLand:true,builderScene:{layout:'grand-floor',mapSize:100,objects:[]}},crate={id:'crate',spawned:true,active:true,asset:{buildAssetId:'supply-crate'},position:{x:0,y:0,z:0},rotation:{y:0}},actors={crate};
 const initial=collision.groundAt(environment,{x:0,y:4,z:0},{actors});assert.ok(initial.y>.5);
 crate.position.x=12;
 const old=collision.groundAt(environment,{x:0,y:4,z:0},{actors}),moved=collision.groundAt(environment,{x:12,y:4,z:0},{actors});
 assert.ok(old.y<.1);assert.ok(Math.abs(moved.y-initial.y)<.001);
});

test('accelerated procedural terrain rays preserve exact triangle heights and normals',()=>{
 const collision=new ServerBuilderCollision(),environment={id:'terrain-ray-equivalence',proceduralLand:true,builderScene:{layout:'grand-floor',mapSize:256,objects:[]}},world=collision.world(environment),terrain=world.floors.find(mesh=>mesh.name.startsWith('BUILDER_WALKABLE_FLOOR'));
 const reference=new THREE.Mesh(terrain.geometry,terrain.material);reference.matrixWorld.copy(terrain.matrixWorld);
 for(const [x,z]of [[0,0],[32.1,-19.4],[-72,74],[127.9,-127.9]])for(const direction of [-1,1]){
  const ray=new THREE.Raycaster(new THREE.Vector3(x,direction<0?20:-20,z),new THREE.Vector3(0,direction,0),0,100),expected=ray.intersectObject(reference,false),actual=ray.intersectObject(terrain,false);
  // Floor and ceiling queries must retain the original material's face culling.
  assert.equal(actual.length,expected.length);for(let i=0;i<actual.length;i++){assert.ok(actual[i].point.distanceTo(expected[i].point)<1e-8);assert.ok(actual[i].face.normal.distanceTo(expected[i].face.normal)<1e-8);}
 }
});

test('a long diagonal wall slide retains elevated support outside the intended movement rectangle',()=>{
 const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),box=(w,h,d,x,y,z)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);return mesh;};
 const ground=box(100,.2,100,0,-.1,0),start=box(30,.2,2,0,1.9,0),landing=box(30,.2,8,0,1.9,5),wall=box(.2,5,30,1,2.5,0);wall.rotation.y=Math.PI/4;
 const root=new THREE.Group();root.add(ground,start,landing,wall);root.updateMatrixWorld(true);
 const positions=wall.geometry.attributes.position,index=wall.geometry.index,triangles=[];
 for(let offset=0;offset<index.count;offset+=3){
  const [a,b,c]=[0,1,2].map(corner=>new THREE.Vector3().fromBufferAttribute(positions,index.getX(offset+corner)).applyMatrix4(wall.matrixWorld));
  if(Math.abs(new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a)).normalize().y)>.55)continue;
  const bounds=new THREE.Box3().setFromPoints([a,b,c]);triangles.push({a,b,c,mesh:wall,minX:bounds.min.x,maxX:bounds.max.x,minY:bounds.min.y,maxY:bounds.max.y,minZ:bounds.min.z,maxZ:bounds.max.z});
 }
 const collision=new ServerBuilderCollision();collision.world=()=>({root,floors:[ground,start,landing,wall],triangles,bounds:new THREE.Box3().setFromObject(root)});
 const resolved=collision.resolve({proceduralLand:true},{x:0,y:2.02,z:0},{x:5,y:2,z:0});
 assert.ok(resolved.z>2,'wall projects movement onto the adjoining elevated slab');assert.ok(Math.abs(resolved.floorY-2.02)<1e-6);assert.ok(Math.abs(resolved.y-2.02)<1e-6);
});

const triangleIn=(triangle,[minX,maxX,minZ,maxZ])=>triangle.maxX>=minX&&triangle.minX<=maxX&&triangle.maxZ>=minZ&&triangle.minZ<=maxZ;
const triangleShape=triangle=>({mesh:triangle.mesh.uuid,id:triangle.objectId,a:triangle.a.toArray(),b:triangle.b.toArray(),c:triangle.c.toArray()});
function equivalentTriangles(view,bounds){
 const expected=view.triangles.filter(triangle=>triangleIn(triangle,bounds));
 const actual=view.nearbyTriangles(...bounds);
 assert.deepEqual(actual.map(triangleShape),expected.map(triangleShape),'indexed triangles retain exact full-query geometry and order');
 return actual;
}
const physicalActor=(id,modelId,x,z,extra={})=>({id,modelId,spawned:true,active:true,asset:{buildAssetId:modelId},position:{x,y:0,z},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},...extra});

test('bounded deployed triangle queries equal the full query for dense rotated pieces and moving hulls',()=>{
 const collision=new ServerBuilderCollision(),environment={id:'triangle-bounds',proceduralLand:true,builderScene:{layout:'grand-floor',mapSize:256,objects:[]}};
 const actors=Object.fromEntries(Array.from({length:40},(_,index)=>{const actor=physicalActor('crate-'+index,'supply-crate',(index%8-4)*12,(Math.floor(index/8)-2)*12);actor.rotation.y=index*.23;actor.scale={x:1+(index%3)*.2,y:1,z:.8};return [actor.id,actor];}));
 actors.yacht=physicalActor('yacht','harbor-yacht',12,12,{holderId:'captain'});
 actors.traffic=physicalActor('traffic','harbor-skiff',-12,0,{trafficAI:true});
 actors.machine=physicalActor('machine','site-excavator',0,12,{construction:{kind:'excavator',boom:.3,stick:-.3,bucket:.5,swing:.4}});
 const objects={wall:{id:'wall',materialId:'wall',position:[3,1,0],rotation:[0,.6,0],scale:[1,1,1],revision:1}};
 const bounds=[[-.5,.5,-.5,.5],[2,5,-2,2],[-16,-8,-4,4],[4,20,4,20],[-80,80,-80,80],[90,91,90,91]];
 for(let pose=0;pose<3;pose++){
  const view=collision.placedWorld(actors,objects,environment);
  for(const query of bounds)equivalentTriangles(view,query);
  actors.yacht.position.x+=7;actors.yacht.rotation.y+=.45;actors.yacht.scale.x+=.1;
  actors.traffic.position.z+=5;actors.traffic.rotation.y+=.8;
  actors.machine.position.x+=2;actors.machine.construction.boom+=.2;actors.machine.construction.swing+=.4;
  objects.wall.position[2]+=3;objects.wall.revision++;
 }
 actors.traffic.active=false;actors.yacht.holderId=null;objects.wall.open=true;
 const view=collision.placedWorld(actors,objects,environment);
 for(const query of bounds)equivalentTriangles(view,query);
 assert.ok(!view.triangles.some(triangle=>triangle.objectId==='traffic'||triangle.objectId==='wall'));
 collision.clearWorlds();
});

test('bounded triangle extraction retains every transformed instance without reading distant mesh vertices',()=>{
 const collision=new ServerBuilderCollision(),environment={id:'instanced-triangle-bounds'};
 let view=collision.placedWorld({}, {},environment),world=collision.placedCache.world;
 const root=new THREE.Group();root.userData.builderObjectId='instanced-solid';root.position.set(12,0,-7);root.rotation.y=.37;
 const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,2,1),new THREE.MeshBasicMaterial(),3);
 for(let index=0;index<3;index++)mesh.setMatrixAt(index,new THREE.Matrix4().compose(new THREE.Vector3(index*8,1,index*3),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),index*.4),new THREE.Vector3(1+index*.2,1,.8)));
 mesh.instanceMatrix.needsUpdate=true;root.add(mesh);world.root.add(root);root.updateMatrixWorld(true);world.meshes.push(mesh);
 for(const query of [[10,15,-10,-3],[18,30,-12,8],[-1,1,-1,1]])equivalentTriangles(view,query);
 // A normal actor pose update clears the spatial index before the next query.
 root.position.x=-20;root.rotation.y=-.8;root.updateMatrixWorld(true);delete world.meshIndex;delete world.wallTriangles;
 for(const query of [[-23,-17,-10,-3],[-16,0,-2,22],[10,15,-10,-3]])equivalentTriangles(view,query);
 const distant=new THREE.Mesh(new THREE.BoxGeometry(1,2,1),new THREE.MeshBasicMaterial());distant.position.set(90,1,90);distant.updateMatrixWorld(true);world.root.add(distant);world.meshes.push(distant);delete world.meshIndex;
 view.nearbyMeshes(-23,-17,-10,-3); // Build the broad phase while its bounds are available.
 const positions=distant.geometry.attributes.position,original=positions.getX;positions.getX=()=>{throw Error('distant triangle vertices were read');};
 assert.doesNotThrow(()=>view.nearbyTriangles(-23,-17,-10,-3));positions.getX=original;
 collision.clearWorlds();
});

test('indexed clearance and walking sweeps keep full-query results after pose and live-state changes',()=>{
 const collision=new ServerBuilderCollision(),reference=new ServerBuilderCollision(),original=reference.placedWorld.bind(reference);
 reference.placedWorld=(...args)=>{const view=original(...args);view.nearbyTriangles=(...bounds)=>view.triangles.filter(triangle=>triangleIn(triangle,bounds));return view;};
 const environment={id:'triangle-result-equivalence',proceduralLand:true,builderScene:{layout:'grand-floor',mapSize:100,objects:[]}},actors={crate:physicalActor('crate','supply-crate',0,0),boat:physicalActor('boat','harbor-skiff',12,0,{trafficAI:true}),machine:physicalActor('machine','site-excavator',0,12,{construction:{kind:'excavator',boom:.2,stick:-.3,bucket:.5,swing:0}})};
 const objects={wall:{id:'wall',materialId:'wall',position:[4,1,0],rotation:[0,.7,0],scale:[1,1,1],revision:1}},points=[{x:0,y:.02,z:0},{x:3,y:.02,z:1},{x:12,y:.02,z:0},{x:0,y:.02,z:12},{x:-8,y:.02,z:-8}];
 for(let phase=0;phase<4;phase++){
  for(const point of points){
   assert.equal(collision.hasBodyClearance(environment,point,.42,{actors,objects}),reference.hasBodyClearance(environment,point,.42,{actors,objects}));
   for(const delta of [{x:1,z:.4},{x:-.5,z:.8}]){
    const next={x:point.x+delta.x,y:point.y-.1,z:point.z+delta.z};
    assert.deepEqual(collision.resolve(environment,point,next,actors,objects),reference.resolve(environment,point,next,actors,objects));
   }
  }
  if(phase===0){actors.crate.position.x+=4;actors.boat.position.z+=6;actors.boat.rotation.y=.7;actors.machine.construction.boom=.8;}
  if(phase===1){actors.crate.open=true;actors.boat.active=false;actors.machine.holderId='operator';objects.wall.open=true;}
  if(phase===2){actors.crate.holderId='carrier';actors.machine.active=false;objects.wall.open=false;objects.wall.revision++;}
 }
 collision.clearWorlds();reference.clearWorlds();
});

function triangleCacheFixture(t,mesh){
 const collision=new ServerBuilderCollision(),view=collision.placedWorld({}, {},{id:'triangle-cache'}),world=collision.placedCache.world;
 const wrapper=new THREE.Group();wrapper.userData.builderObjectId='cached-hull';wrapper.add(mesh);world.root.add(wrapper);world.meshes.push(mesh);world.root.updateMatrixWorld(true);
 t.after(()=>collision.clearWorlds());
 // Broad bounds isolate transformed-triangle caching from spatial cell changes.
 const query=()=>view.nearbyTriangles(-1000,1000,-1000,1000);
 return {view,world,wrapper,query};
}
function watchVertexReads(attribute){
 let reads=0;const original=attribute.getX;attribute.getX=function(index){reads++;return original.call(this,index);};
 return {reset(){reads=0;},get reads(){return reads;}};
}

test('repeated nearby stable hull queries reuse transformed triangles and refresh changed geometry and ownership',t=>{
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(2,4,2,16,16,16),new THREE.MeshBasicMaterial()),f=triangleCacheFixture(t,mesh);
 let watched=watchVertexReads(mesh.geometry.attributes.position),first=f.query();assert.ok(first.length);assert.ok(watched.reads>0);
 watched.reset();const repeated=f.query();assert.equal(watched.reads,0,'a nearby stable hull must not transform every vertex again');assert.ok(repeated.every((triangle,index)=>triangle===first[index]));
 const firstX=first[0].a.x;f.wrapper.position.x=7;f.wrapper.updateMatrixWorld(true);watched.reset();first=f.query();
 assert.ok(watched.reads>0);assert.equal(first[0].a.x,firstX+7,'parent transforms refresh physical triangle coordinates');
 watched.reset();f.query();assert.equal(watched.reads,0);
 f.wrapper.userData.builderObjectId='new-hull-owner';watched.reset();first=f.query();assert.ok(watched.reads>0);assert.ok(first.every(triangle=>triangle.objectId==='new-hull-owner'));
 const replaced=mesh.geometry.attributes.position.clone();replaced.setX(0,replaced.getX(0)+.25);mesh.geometry.setAttribute('position',replaced);watched=watchVertexReads(replaced);
 first=f.query();assert.ok(watched.reads>0,'a replacement attribute with the same version refreshes triangles');
 const before=triangleShape(first[0]);replaced.setY(0,replaced.getY(0)+.25);replaced.needsUpdate=true;watched.reset();first=f.query();assert.ok(watched.reads>0);assert.notDeepEqual(triangleShape(first[0]),before);
 mesh.geometry.setIndex(mesh.geometry.index.clone());watched.reset();f.query();assert.ok(watched.reads>0,'a same-version replacement index refreshes triangles');
 const index=mesh.geometry.index,a=index.getX(0),b=index.getX(1);index.setX(0,b);index.setX(1,a);index.needsUpdate=true;watched.reset();f.query();assert.ok(watched.reads>0,'in-place indexed geometry updates refresh triangles');
 mesh.geometry=mesh.geometry.clone();watched=watchVertexReads(mesh.geometry.attributes.position);f.query();assert.ok(watched.reads>0,'a new geometry owner refreshes triangles');
});

test('cached nearby triangles follow instance matrices and active instance count',t=>{
 const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(2,4,2),new THREE.MeshBasicMaterial(),2);
 mesh.setMatrixAt(0,new THREE.Matrix4());mesh.setMatrixAt(1,new THREE.Matrix4().makeTranslation(10,0,0));mesh.instanceMatrix.needsUpdate=true;
 const f=triangleCacheFixture(t,mesh),watched=watchVertexReads(mesh.geometry.attributes.position),first=f.query();watched.reset();f.query();assert.equal(watched.reads,0);
 mesh.setMatrixAt(1,new THREE.Matrix4().makeTranslation(18,0,0));mesh.instanceMatrix.needsUpdate=true;watched.reset();let next=f.query();
 assert.ok(watched.reads>0);assert.equal(Math.max(...next.map(triangle=>triangle.maxX)),19);assert.notDeepEqual(next.map(triangleShape),first.map(triangleShape));
 mesh.count=1;watched.reset();next=f.query();assert.ok(watched.reads>0);assert.equal(next.length,first.length/2);assert.ok(next.every(triangle=>triangle.maxX<=1));
});

test('cached nearby triangles observe interleaved position updates',t=>{
 const geometry=new THREE.BufferGeometry(),data=new THREE.InterleavedBuffer(new Float32Array([0,0,0,1,0,2,0,1,1,0,0,1]),4),position=new THREE.InterleavedBufferAttribute(data,3,0,false);
 geometry.setAttribute('position',position);
 const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial()),f=triangleCacheFixture(t,mesh),watched=watchVertexReads(position),first=f.query();assert.equal(first.length,1);watched.reset();f.query();assert.equal(watched.reads,0);
 position.setX(2,2);data.needsUpdate=true;watched.reset();const next=f.query();assert.ok(watched.reads>0);assert.equal(next[0].c.x,2);assert.notDeepEqual(triangleShape(next[0]),triangleShape(first[0]));
});
