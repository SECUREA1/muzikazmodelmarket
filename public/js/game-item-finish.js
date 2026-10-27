import {finishNativeSurfaces} from './native-surface-finish.js';

// A small, deterministic chamfer gives procedural props readable highlights.
// Forty-four triangles per box; no subdivision, external textures or new lights.
export function bevelledBoxGeometry(THREE,width,height,depth,radius=.035){
 const half=[width/2,height/2,depth/2],r=Math.min(radius,...half.map(value=>value*.22)),inner=half.map(value=>value-r),positions=[],normals=[],uvs=[],groups=[];
 function patch(points){
  const a=new THREE.Vector3(...points[0]),b=new THREE.Vector3(...points[1]),c=new THREE.Vector3(...points[2]);
  const normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize(),center=points.reduce((sum,p)=>sum.add(new THREE.Vector3(...p)),new THREE.Vector3());
  if(normal.dot(center)<0){points=[...points].reverse();normal.negate();}
  const start=positions.length/3;
  for(const index of points.length===4?[0,1,2,0,2,3]:[0,1,2]){positions.push(...points[index]);normals.push(...normal.toArray());uvs.push(index===1||index===2?1:0,index>=2?1:0);}
  const axis=Math.abs(normal.x)>=Math.abs(normal.y)&&Math.abs(normal.x)>=Math.abs(normal.z)?0:Math.abs(normal.y)>=Math.abs(normal.z)?1:2;
  groups.push({start,count:positions.length/3-start,materialIndex:axis*2+(normal.getComponent(axis)<0?1:0)});
 }
 for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){const other=[0,1,2].filter(value=>value!==axis);patch([[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>{const p=[0,0,0];p[axis]=sign*half[axis];p[other[0]]=a*inner[other[0]];p[other[1]]=b*inner[other[1]];return p;}));}
 for(let axis=0;axis<3;axis++){const [a,b]=[0,1,2].filter(value=>value!==axis);for(const sa of [-1,1])for(const sb of [-1,1])patch([[-1,0],[1,0],[1,1],[-1,1]].map(([end,face])=>{const p=[0,0,0];p[axis]=end*inner[axis];p[a]=sa*(face?inner[a]:half[a]);p[b]=sb*(face?half[b]:inner[b]);return p;}));}
 for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){const signs=[x,y,z];patch([0,1,2].map(axis=>inner.map((value,index)=>signs[index]*(axis===index?half[index]:value))));}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
 for(const group of groups)geometry.addGroup(group.start,group.count,group.materialIndex);
 geometry.parameters={width,height,depth};geometry.name='MZK_BEVELLED_BOX';geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

export function finishGameItem(THREE,root){
 const replacements=new Map(),materials=new Set();
 const constructionPiece=node=>{for(let parent=node;parent;parent=parent.parent){if(parent.userData.materialId||parent.userData.materialDesignFinish)return true;if(parent===root)break;}return false;};
 root.traverse(node=>{
  if(!node.isMesh||node.userData.collisionOnly)return;
  const original=node.geometry,p=original?.parameters;
  // Screens keep their exact dimensions and local axes for shared video/game feeds.
  if(original?.type==='BoxGeometry'&&p&&!node.userData.mediaScreen&&!constructionPiece(node)&&Math.min(p.width,p.height,p.depth)>=.045){
   if(!replacements.has(original))replacements.set(original,bevelledBoxGeometry(THREE,p.width,p.height,p.depth));node.geometry=replacements.get(original);
  }
  node.frustumCulled=true;node.castShadow=!node.userData.collisionDisabled;node.receiveShadow=true;
  for(const mat of [].concat(node.material||[])){if(materials.has(mat))continue;materials.add(mat);if(mat.isMeshStandardMaterial){mat.roughness=Math.max(.18,Math.min(1,mat.roughness));mat.metalness=Math.max(0,Math.min(.88,mat.metalness));}if(mat.transparent)mat.depthWrite=false;}
 });
 root.userData.visualFinish='mzk-game-items-v2';finishNativeSurfaces(THREE,root,root.userData.modelId||root.name||'');return root;
}
