import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/vendor/three/three.module.min.js';
import {createCraftedLandscapeModel} from '../public/js/crafted-landscape-models.js';

function triangles(mesh){
 const p=mesh.geometry.attributes.position,index=mesh.geometry.index,faces=[];
 for(let i=0;i<(index?.count||p.count);i+=3)faces.push([0,1,2].map(j=>new T.Vector3().fromBufferAttribute(p,index?index.getX(i+j):i+j)));
 return faces;
}
function dispose(root){const resources=new Set();root.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of [].concat(node.material||[]))resources.add(material);});for(const resource of resources)resource.dispose();}
const pointKey=point=>point.toArray().map(v=>Math.round(v*1e6)).join(',');

test('cliff sediment forms one closed outward-facing surface across every shared layer boundary',()=>{
 const root=createCraftedLandscapeModel('terrain-cliff'),layers=root.children.filter(node=>node.name==='CLIFF_SEDIMENT_LAYER'),edges=new Map();
 try{
  assert.equal(layers.length,4);
  for(const layer of layers){
   const positions=layer.geometry.attributes.position,uv=layer.geometry.attributes.uv;assert.equal(uv.count,positions.count);assert.ok([...uv.array].every(Number.isFinite));
   for(const face of triangles(layer)){
    const [a,b,c]=face,normal=b.clone().sub(a).cross(c.clone().sub(a));assert.ok(normal.lengthSq()>1e-12,'sediment faces have a real area');normal.normalize();
    if(Math.abs(normal.y)<.9){const center=a.clone().add(b).add(c).multiplyScalar(1/3);assert.ok(normal.dot(new T.Vector3(center.x,0,center.z))>0,'cliff sides face away from the rock core');}
    for(let j=0;j<3;j++){const pair=[pointKey(face[j]),pointKey(face[(j+1)%3])].sort(),key=pair.join('|');edges.set(key,(edges.get(key)||0)+1);}
   }
  }
  assert.ok(edges.size>100);for(const [edge,count]of edges)assert.equal(count,2,'no open sediment seam or duplicate internal cap at '+edge);
 }finally{dispose(root);}
});

test('exposed mineral veins remain embedded in the actual tapered cliff faces',()=>{
 const root=createCraftedLandscapeModel('terrain-cliff');root.updateMatrixWorld(true);
 try{
  const layers=root.children.filter(node=>node.name==='CLIFF_SEDIMENT_LAYER'),veins=root.children.filter(node=>node.name==='CLIFF_MINERAL_SEAM');assert.equal(veins.length,5);
  for(const vein of veins)for(let i=0;i<=24;i++){
   const point=vein.geometry.parameters.path.getPoint(i/24).add(vein.position),ray=new T.Raycaster(new T.Vector3(point.x,point.y,-4),new T.Vector3(0,0,1)),hit=ray.intersectObjects(layers)[0];
   assert.ok(hit,'each mineral exposure has a supporting cliff face');assert.ok(Math.abs(point.z-hit.point.z)<.016,'the mineral tube intersects the rock instead of hanging in the air');
  }
 }finally{dispose(root);}
});

test('crater centre is a real upward-facing triangle fan and the cleaned terrain has no collapsed faces',()=>{
 for(const id of ['terrain-cliff','terrain-crater','terrain-snowbank']){
  const root=createCraftedLandscapeModel(id);
  try{
   root.traverse(node=>{
    if(!node.isMesh)return;const uv=node.geometry.attributes.uv;assert.ok(uv,id+' surface has UVs');assert.ok([...uv.array].every(Number.isFinite));
    for(const [a,b,c]of triangles(node))assert.ok(b.clone().sub(a).cross(c.clone().sub(a)).lengthSq()>1e-18,id+' / '+node.name+' has no zero-area faces');
   });
   if(id==='terrain-crater'){
    const bowl=root.getObjectByName('FRACTURED_IMPACT_BOWL'),faces=triangles(bowl);assert.equal(faces.length,616);
    const centreFaces=faces.filter(face=>face.some(point=>Math.abs(point.x)<1e-8&&Math.abs(point.z)<1e-8));assert.equal(centreFaces.length,56,'one useful triangle for each segment around the floor centre');
    for(const [a,b,c]of faces)assert.ok(b.clone().sub(a).cross(c.clone().sub(a)).y>0,'the crater surface faces upward');
   }
  }finally{dispose(root);}
 }
});

test('the swept snow ridge physically joins the previously hovering crest to the drift surface',()=>{
 const root=createCraftedLandscapeModel('terrain-snowbank');root.updateMatrixWorld(true);
 try{
  const crest=root.getObjectByName('WINDSWEPT_DRIFT_CREST'),ridge=root.getObjectByName('GROUNDED_WINDSWEPT_SNOW_RIDGE'),drifts=root.children.filter(node=>node.name==='SCULPTED_SNOW_DRIFT');
  assert.ok(ridge);assert.equal(ridge.userData.collisionDisabled,true);assert.equal(ridge.userData.collider,false);assert.equal(drifts.length,4);
  let supported=0;
  for(const t of [.1,.2,.3,.4,.5,.6,.7,.8,.9]){
   const point=crest.geometry.parameters.path.getPoint(t).add(crest.position),ray=new T.Raycaster(new T.Vector3(point.x,point.y+1,point.z),new T.Vector3(0,-1,0)),original=ray.intersectObjects(drifts)[0];
   if(!original||point.y-original.point.y<.035)continue;
   const support=ray.intersectObject(ridge)[0];assert.ok(support,'the ridge covers each former air gap');assert.ok(point.y-support.point.y<.025,'the ridge intersects the underside of the2.5 cm crest');supported++;
  }
  assert.ok(supported>=4,'the test samples the actual unsupported stretch of the crest');
  const bounds=new T.Box3().setFromObject(root,true);assert.ok(Math.abs(bounds.min.y)<1e-8);assert.ok(Math.abs(bounds.max.y-1.2619497994232314)<1e-8,'the ridge keeps the original canonical snow silhouette');
 }finally{dispose(root);}
});
