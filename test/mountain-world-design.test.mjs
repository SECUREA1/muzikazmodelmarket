import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../public/vendor/three/three.module.min.js';
import {createMountainRidgeGeometry,finishMountainTerrainDesign} from '../public/js/mountain-terrain-design.js';
import {createBuilderLand} from '../public/js/environments/builder-land.js';
import {createSkiResortLand} from '../public/js/environments/ski-resort-land.js';
import {createFactoryProvingGroundsLand} from '../public/js/factory-testing-model.js';
import {createMountainCompoundLand} from '../public/js/mountain-compound-model.js';
import {skiHeight} from '../public/js/ski-resort.js';

const pose=node=>[...node.position,...node.quaternion,...node.scale];
const boxOf=geometry=>{geometry.computeBoundingBox();return geometry.boundingBox.clone();};
function assertBox(actual,expected,label){
 for(const end of ['min','max'])for(const axis of ['x','y','z'])assert.ok(Math.abs(actual[end][axis]-expected[end][axis])<1e-6,label+' keeps local '+end+'.'+axis+': '+actual[end][axis]+' vs '+expected[end][axis]);
}
function attributes(geometry){return new Map(Object.entries(geometry.attributes).map(([name,attribute])=>[name,attribute.array.slice()]));}
function assertAttributes(geometry,original,label,{ignoreUv=false}={}){
 for(const [name,array]of original){if(ignoreUv&&name==='uv')continue;assert.deepEqual(geometry.attributes[name]?.array,array,label+' keeps '+name);}
}
function nodes(root){const result=[];root.traverse(node=>result.push(node));return result;}
function dispose(root){const resources=new Set();root.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of [].concat(node.material||[]))if(material)resources.add(material);});for(const resource of resources)resource.dispose();}

// Load the real current constructors with only the mountain finish made an
// identity function. No frozen copy of the world or runtime git checkout is used.
async function unfinishedModule(path){
 const url=new URL(path,import.meta.url);let source=await readFile(url,'utf8');
 source=source.replace(/import\s+[^;]*\bfinishMountainTerrainDesign\b[^;]*;/g,'');
 source=source.replace(/from\s+(['"])(\.[^'"]+)\1/g,(_match,_quote,specifier)=>'from '+JSON.stringify(new URL(specifier,url).href));
 source='const finishMountainTerrainDesign=(_T,root)=>root;\n'+source;
 return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
function compareWorld(original,finished,ridgeName,{ski=false}={}){
 const before=nodes(original),after=nodes(finished);assert.equal(after.length,before.length,'the finish retains every gameplay node without adding collision objects');
 for(let i=0;i<before.length;i++){
  const a=before[i],b=after[i],label=b.name||b.type;
  assert.equal(b.type,a.type,label+' keeps its object type');assert.equal(b.name,a.name,label+' keeps its identifier');assert.deepEqual(pose(b),pose(a),label+' keeps its authored pose');assert.equal(b.visible,a.visible,label+' keeps visibility');
  for(const key of ['collider','collisionDisabled','collisionOnly','colliderShape','walkableFloor','feetLockedToFloor'])assert.equal(b.userData[key],a.userData[key],label+' keeps '+key);
  if(!a.geometry)continue;
  if(a.name===ridgeName){assertBox(boxOf(b.geometry),boxOf(a.geometry),label);assert.notDeepEqual(b.geometry.attributes.position.array,a.geometry.attributes.position.array,label+' receives actual ridge geometry');}
  else{
   assertAttributes(b.geometry,attributes(a.geometry),label,{ignoreUv:ski&&a.name.startsWith('BUILDER_WALKABLE_FLOOR_SKI_MOUNTAIN_')});
   assert.deepEqual(b.geometry.index?.array,a.geometry.index?.array,label+' keeps face topology');
  }
 }
}

test('ridge generation changes the surface while preserving exact source envelopes and source geometry',()=>{
 for(const original of [new T.BoxGeometry(3,5,9),new T.BoxGeometry(3,7,9),new T.ConeGeometry(16,29,7),new T.ConeGeometry(12,22,5)]){
  const saved=attributes(original),index=original.index?.array.slice(),bounds=boxOf(original),ridge=createMountainRidgeGeometry(T,original,{seed:7,style:'ridge'}),repeat=createMountainRidgeGeometry(T,original,{seed:7,style:'ridge'}),variant=createMountainRidgeGeometry(T,original,{seed:8,style:'ridge'});
  assert.notEqual(ridge,original);assertAttributes(original,saved,'source');assert.deepEqual(original.index?.array,index);assertBox(boxOf(ridge),bounds,original.type);
  assert.deepEqual(ridge.attributes.position.array,repeat.attributes.position.array,'the same seed produces deterministic ridges');assert.notDeepEqual(ridge.attributes.position.array,variant.attributes.position.array,'different seeds produce distinct silhouettes');
  for(const name of ['position','normal','uv']){const attribute=ridge.getAttribute(name);assert.ok(attribute,name+' is present');assert.ok([...attribute.array].every(Number.isFinite),name+' is finite');}
  assert.ok((ridge.index?.count||ridge.attributes.position.count)/3<=1000,'ridge geometry stays within its terrain budget');
  for(const geometry of [original,ridge,repeat,variant])geometry.dispose();
 }
});

test('box and five/seven-sided cone ridges form closed nondegenerate outward-wound surfaces',()=>{
 const key=point=>point.toArray().map(value=>Math.round(value*1e6)).join(',');
 for(const original of [new T.BoxGeometry(3,5,9),new T.BoxGeometry(3,7,9),new T.ConeGeometry(12,22,5),new T.ConeGeometry(16,29,7)]){
  for(const seed of [0,7,13]){
  const geometry=createMountainRidgeGeometry(T,original,{seed}),position=geometry.attributes.position,normal=geometry.attributes.normal,index=geometry.index,edges=new Map(),triangles=(index?.count||position.count)/3;
  assert.ok(triangles<=1000,original.type+' retains the terrain triangle budget');let volume=0;
  for(let triangle=0;triangle<triangles;triangle++){
   const vertices=[0,1,2].map(offset=>index?index.getX(triangle*3+offset):triangle*3+offset),points=vertices.map(vertex=>new T.Vector3().fromBufferAttribute(position,vertex)),[a,b,c]=points;
   const winding=new T.Vector3().subVectors(b,a).cross(new T.Vector3().subVectors(c,a));assert.ok(winding.lengthSq()>1e-14,original.type+' seed '+seed+' triangle '+triangle+' has nonzero area');winding.normalize();
   for(const vertex of vertices){const n=new T.Vector3().fromBufferAttribute(normal,vertex);assert.ok(n.dot(winding)>.9999,original.type+' seed '+seed+' triangle '+triangle+' normals align with winding');}
   volume+=a.dot(new T.Vector3().crossVectors(b,c))/6;
   for(let side=0;side<3;side++){
    const from=key(points[side]),to=key(points[(side+1)%3]);assert.notEqual(from,to,'quantized edge retains distinct endpoints');const edgeKey=from<to?from+'|'+to:to+'|'+from;
    if(!edges.has(edgeKey))edges.set(edgeKey,[]);edges.get(edgeKey).push({from,to,triangle});
   }
  }
  for(const [edge,uses]of edges){
   const label=original.type+' seed '+seed+' edge '+edge;assert.equal(uses.length,2,label+' belongs to exactly two faces');assert.equal(uses[0].from,uses[1].to,label+' has opposite face orientation');assert.equal(uses[0].to,uses[1].from,label+' has opposite face orientation');
  }
  assert.ok(volume>1e-6,original.type+' seed '+seed+' has positive signed volume');geometry.dispose();
  }
  original.dispose();
 }
});

test('finishing keeps the original mesh objects, gameplay flags, local bounds and callbacks',()=>{
 const root=new T.Group(),ridge=new T.Mesh(new T.ConeGeometry(16,29,7),new T.MeshStandardMaterial()),untouched=new T.Mesh(new T.BoxGeometry(4,.2,4),new T.MeshStandardMaterial());
 ridge.name='MOUNTAIN_RIDGE';ridge.position.set(12,14.5,-18);ridge.rotation.set(.1,.35,-.04);ridge.scale.set(1.2,.9,1.1);ridge.userData={collider:true,colliderShape:'mesh',customGameplayId:'retained-ridge'};root.add(ridge,untouched);
 const callback=()=>42;root.userData.streetHeightAt=callback;root.userData.updateTestingEffects=callback;
 const before=nodes(root),state=new Map(before.map(node=>[node,{name:node.name,geometry:node.geometry,bounds:node.geometry?boxOf(node.geometry):null,pose:pose(node),userData:new Map(Object.entries(node.userData))}]));
 assert.equal(finishMountainTerrainDesign(T,root,{ridgeNames:['MOUNTAIN_RIDGE']}),root);assert.deepEqual(nodes(root),before);
 for(const [node,saved]of state){assert.equal(node.name,saved.name);assert.deepEqual(pose(node),saved.pose);for(const [key,value]of saved.userData)assert.equal(node.userData[key],value);if(node.geometry)assertBox(boxOf(node.geometry),saved.bounds,node.name);}
 assert.notEqual(ridge.geometry,state.get(ridge).geometry);assert.equal(untouched.geometry,state.get(untouched).geometry);assert.equal(root.userData.streetHeightAt,callback);assert.equal(root.userData.updateTestingEffects,callback);
 const geometry=ridge.geometry,marker=root.userData.mountainTerrainDesign;assert.ok(marker);finishMountainTerrainDesign(T,root,{ridgeNames:['MOUNTAIN_RIDGE']});assert.equal(ridge.geometry,geometry);assert.equal(root.userData.mountainTerrainDesign,marker);dispose(root);state.get(ridge).geometry.dispose();
});

test('all mountain-pass ridges and proving ridges preserve their original authored envelopes and world structure',async()=>{
 const baselineBuilder=await unfinishedModule('../public/js/environments/builder-land.js'),baselineProving=await unfinishedModule('../public/js/factory-testing-model.js');
 const environment={id:'mountain-design-regression',source:'repository',builderScene:{layout:'mountain-pass',mapSize:40,objects:[]}},pass=createBuilderLand(environment),oldPass=baselineBuilder.createBuilderLand(environment),proving=createFactoryProvingGroundsLand(),oldProving=baselineProving.createFactoryProvingGroundsLand();
 try{
  const passName='BUILDER_TEMPLATE_mountain-pass',ridges=nodes(pass).filter(node=>node.name===passName);assert.equal(ridges.length,4);compareWorld(oldPass,pass,passName);
  ridges.forEach((ridge,index)=>{const old=new T.BoxGeometry(3,index%2?7:5,9);assertBox(boxOf(ridge.geometry),boxOf(old),'mountain-pass '+index);old.dispose();});
  assert.equal(nodes(proving).filter(node=>node.name==='PROVING_MOUNTAIN_RIDGE').length,5);compareWorld(oldProving,proving,'PROVING_MOUNTAIN_RIDGE');
 }finally{for(const root of [pass,oldPass,proving,oldProving])dispose(root);}
});

test('all 17 ski summit rocks upgrade while all 100 walkable tiles retain exact skiing geometry and continuous planar UVs',async()=>{
 const baseline=await unfinishedModule('../public/js/environments/ski-resort-land.js'),resort=createSkiResortLand(),original=baseline.createSkiResortLand();
 try{
  const rocks=nodes(resort).filter(node=>node.name==='SUMMIT_ROCK_OUTCROP');assert.equal(rocks.length,17);compareWorld(original,resort,'SUMMIT_ROCK_OUTCROP',{ski:true});
  rocks.forEach((rock,index)=>{const old=new T.ConeGeometry(12+(index%3)*4,22+(index%4)*6,5);assertBox(boxOf(rock.geometry),boxOf(old),'ski summit '+index);old.dispose();});
  const tiles=nodes(resort).filter(node=>node.name.startsWith('BUILDER_WALKABLE_FLOOR_SKI_MOUNTAIN_'));assert.equal(tiles.length,100);
  const vertices=new Map();let sharedAcrossTiles=0;
  for(const tile of tiles){
   const position=tile.geometry.attributes.position,uv=tile.geometry.attributes.uv;assert.ok(uv,tile.name+' has snow-surface UVs');assert.equal(uv.count,position.count);
   for(let i=0;i<position.count;i++){
    const x=position.getX(i),z=-position.getY(i),u=uv.getX(i),v=uv.getY(i);assert.ok(Math.abs(u-x/64)<1e-6);assert.ok(Math.abs(v-z/64)<1e-6);assert.ok(Math.abs(position.getZ(i)-skiHeight(x,z))<4e-5,'all physical snow heights retain skiHeight');
    const key=x+':'+z,previous=vertices.get(key);if(previous){assert.equal(u,previous.u);assert.equal(v,previous.v);if(previous.tile!==tile.name)sharedAcrossTiles++;}else vertices.set(key,{u,v,tile:tile.name});
   }
  }
  assert.ok(sharedAcrossTiles>1000,'neighboring snow tiles share the same UV coordinates at their boundary vertices');
 }finally{dispose(resort);dispose(original);}
});

test('the 19 compound rock faces keep their original excavation geometry and collision',async()=>{
 const baseline=await unfinishedModule('../public/js/mountain-compound-model.js'),compound=createMountainCompoundLand(),original=baseline.createMountainCompoundLand();
 try{
  const rockNames=new Set(['COMPOUND_MOUNTAIN_ROCK_FACE','COMPOUND_BACK_ROCK_CUT']),rocks=nodes(compound).filter(node=>rockNames.has(node.name));assert.equal(rocks.length,19);compareWorld(original,compound,null);
 }finally{dispose(compound);dispose(original);}
});
