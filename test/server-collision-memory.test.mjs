import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';

// Reference the original full-scene grid so laziness cannot alter candidate
// membership or contact order at cell boundaries and very large walls.
function fullGridQuery(triangles,[minX,maxX,minZ,maxZ]){
 const cells=new Map(),large=[];
 for(const triangle of triangles){
  const x1=Math.floor(triangle.minX/2),x2=Math.floor(triangle.maxX/2),z1=Math.floor(triangle.minZ/2),z2=Math.floor(triangle.maxZ/2);
  if((x2-x1+1)*(z2-z1+1)>256){large.push(triangle);continue;}
  for(let x=x1;x<=x2;x++)for(let z=z1;z<=z2;z++){const key=x+':'+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(triangle);}
 }
 const found=new Set(large);
 for(let x=Math.floor(minX/2);x<=Math.floor(maxX/2);x++)for(let z=Math.floor(minZ/2);z<=Math.floor(maxZ/2);z++)for(const triangle of cells.get(x+':'+z)||[])found.add(triangle);
 return [...found];
}

test('lazy static walls retain the exact full-grid faces and contact order',()=>{
 const collision=new ServerBuilderCollision(),environment={id:'lazy-static-faces',proceduralLand:true,builderScene:{layout:'grand-floor',mapSize:256,objects:[
  {id:'near-wall',modelId:'material:wall',position:{x:1,y:0,z:0},rotation:{y:.3},scale:{x:4,y:4,z:1}},
  {id:'crossing-wall',modelId:'material:wall',position:{x:-2,y:0,z:2},rotation:{y:Math.PI/4},scale:{x:4,y:3,z:1}},
  {id:'wide-wall',modelId:'material:wall',position:{x:80,y:0,z:80},rotation:{y:Math.PI/4},scale:{x:80,y:5,z:1}},
  {id:'remote-crate',modelId:'supply-crate',position:{x:-70,y:0,z:70},rotation:{y:.6}}
 ]}};
 try{
  const world=collision.world(environment),all=world.triangles;
  assert.ok(all.length>0);
  assert.ok(all.some(triangle=>(Math.floor(triangle.maxX/2)-Math.floor(triangle.minX/2)+1)*(Math.floor(triangle.maxZ/2)-Math.floor(triangle.minZ/2)+1)>256),'the fixture must exercise always-candidate large faces');
  for(const area of [[-.3,.3,-.3,.3],[-2,2,-2,2],[2,2,2,2],[79,81,79,81],[-100,-99,-100,-99],[-72,-68,68,72],[-256,256,-256,256]])assert.deepEqual(world.nearbyTriangles(...area),fullGridQuery(all,area),JSON.stringify(area));
 }finally{collision.releaseWorld(environment.id);}
});

test('room release disposes its collision resources without clearing another room',()=>{
 const collision=new ServerBuilderCollision(),a={id:'release-a',proceduralLand:true,builderScene:{layout:'grand-floor',mapSize:40}},b={...a,id:'release-b'},actor={id:'crate',spawned:true,active:true,asset:{buildAssetId:'supply-crate'},position:{x:4,y:0,z:4},rotation:{y:0}};
 const first=collision.world(a),second=collision.world(b);let staticDisposals=0,placedDisposals=0;
 first.floors[0].geometry.addEventListener('dispose',()=>staticDisposals++);
 const placedA=collision.placedWorld({crate:actor},{},a);placedA.meshes[0].geometry.addEventListener('dispose',()=>placedDisposals++);
 const placedB=collision.placedWorld({crate:actor},{},b),current=collision.placedCache;
 collision.releaseWorld(a.id);
 assert.ok(staticDisposals>0);assert.ok(placedDisposals>0);
 assert.equal(collision.placedWorlds.has(a.id),false);assert.equal(collision.placedCache,current);
 assert.equal(collision.world(b),second);assert.equal(collision.placedCombinedRoot,placedB.root);
 const restored=collision.world(a);assert.notEqual(restored,first);
 const revised=collision.world({...a,updatedAt:'renovated'});assert.notEqual(revised,restored);
 assert.equal([...collision.cache.values()].filter(world=>world.environmentId===a.id).length,1,'old environment revisions cannot accumulate full scenes');
 collision.releaseWorld(b.id);assert.equal(collision.placedCache,null);assert.equal(collision.trafficCollision,null);assert.equal(collision.constructionCollision,null);assert.equal(collision.placedCombinedRoot,null);
 collision.releaseWorld(a.id);collision.releaseWorld('already-released');assert.equal(collision.cache.size,0);assert.equal(collision.placedWorlds.size,0);
});

test('ordinary Commons walking does not retain the full scene wall-face expansion',()=>{
 const collisionURL=new URL('../server-builder-collision.mjs',import.meta.url).href,commonsURL=new URL('../commons-neighborhood.mjs',import.meta.url).href,atlasURL=new URL('../world-atlas.mjs',import.meta.url).href;
 const source=`
  import {ServerBuilderCollision} from ${JSON.stringify(collisionURL)};
  import {commonsNeighborhood} from ${JSON.stringify(commonsURL)};
  import {landscapedEnvironment} from ${JSON.stringify(atlasURL)};
  const collision=new ServerBuilderCollision(),environment=landscapedEnvironment('public-commons','Public Commons');
  environment.builderScene.objects=commonsNeighborhood().objects;
  const world=collision.world(environment);
  const spawn=collision.safeSpawn(environment,environment.spawn);
  collision.resolve(environment,spawn,{...spawn,z:spawn.z-.1});
  global.gc();const localHeap=process.memoryUsage().heapUsed;
  const faceCount=world.triangles.length;
  global.gc();const fullHeap=process.memoryUsage().heapUsed;
  console.log(JSON.stringify({localHeap,fullHeap,faceCount}));
  collision.releaseWorld(environment.id);
 `;
 const result=JSON.parse(execFileSync(process.execPath,['--expose-gc','--input-type=module','-e',source],{encoding:'utf8',timeout:60000}));
 assert.ok(result.faceCount>100000,'exercise the actual detailed Commons scenery');
 assert.ok(result.fullHeap-result.localHeap>32*1024*1024,'local walking must leave distant physical faces unexpanded: '+JSON.stringify(result));
});
