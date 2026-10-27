// The rendered cut, walking surface and machine ground share these triangles.
// Coordinates are world metres; construction land itself stays unscaled.
export function constructionPatchBounds(patch){
 const cell=Number(patch.cellSize)||2;
 const width=Number(patch.columns)*cell||Math.ceil((Number(patch.width)||24)/cell)*cell;
 const depth=Number(patch.rows)*cell||Math.ceil((Number(patch.depth)||24)/cell)*cell;
 const minX=Number.isFinite(patch.origin?.x)?patch.origin.x:(Number(patch.x)||0)-width/2;
 const minZ=Number.isFinite(patch.origin?.z)?patch.origin.z:(Number(patch.z)||0)-depth/2;
 return {minX,maxX:minX+width,minZ,maxZ:minZ+depth};
}

export function constructionCutoutPatches(environment){
 const site=environment?.construction||environment?.builderScene?.layoutMeta?.construction;
 if(!site?.enabled)return [];
 const cut=site.excavation||{x:25,z:17,radius:12},spoil=site.stockpile||{x:30,z:39};
 const definitions=[{id:'excavation',x:cut.x,z:cut.z,width:cut.width||(cut.radius||12)*2,depth:cut.width?cut.depth:(cut.radius||12)*2,maxDepth:8},
  {id:'spoil',x:spoil.x,z:spoil.z,width:spoil.width||28,depth:spoil.depth||16,maxDepth:0},...(site.earthworks?.patches||[])],seen=new Set();
 return definitions.filter(patch=>{if(seen.has(patch.id))return false;seen.add(patch.id);return true;}).map(patch=>({...patch,cellSize:patch.cellSize||site.earthworks?.cellSize||2}));
}

export function createConstructionBaseGeometry(THREE,size,patches,{color=0x88745b,heightAt=()=>0}={}){
 const half=size/2,rects=patches.map(constructionPatchBounds),xs=new Set([-half,half]),zs=new Set([-half,half]);
 // Flat land needs few triangles. Extra grid lines exactly follow the cuts,
 // retaining a closed seam without a full-map, fine terrain tessellation.
 for(let value=-half;value<half;value+=16){xs.add(value);zs.add(value);}
 for(const r of rects){for(const x of [r.minX,r.maxX])if(x>-half&&x<half)xs.add(x);for(const z of [r.minZ,r.maxZ])if(z>-half&&z<half)zs.add(z);}
 const xValues=[...xs].sort((a,b)=>a-b),zValues=[...zs].sort((a,b)=>a-b),positions=[],uv=[],colors=[],indices=[];
 const base=new THREE.Color(color),tint=new THREE.Color();
 for(const z of zValues)for(const x of xValues){
  positions.push(x,-z,heightAt(x,z));uv.push((x+half)/size,(half-z)/size);
  tint.copy(base).multiplyScalar(1+Math.sin(x*.09)*Math.cos(z*.11)*.065);colors.push(tint.r,tint.g,tint.b);
 }
 for(let row=0;row<zValues.length-1;row++)for(let col=0;col<xValues.length-1;col++){
  const x=(xValues[col]+xValues[col+1])/2,z=(zValues[row]+zValues[row+1])/2;
  if(rects.some(r=>x>r.minX&&x<r.maxX&&z>r.minZ&&z<r.maxZ))continue;
  const a=row*xValues.length+col,b=a+xValues.length,c=b+1,d=a+1;indices.push(a,b,d,b,c,d);
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingBox();
 geometry.userData.constructionCutouts=rects;geometry.userData.planarCollision=false;return geometry;
}

export function createConstructionEarthGeometry(THREE,patch){
 const cell=Number(patch.cellSize)||2,cols=patch.columns|0,rows=patch.rows|0,bounds=constructionPatchBounds(patch),base=Number(patch.baseY)||0;
 const positions=[],colors=[],soil=new THREE.Color(0x866346),gravel=new THREE.Color(0x92948b),asphalt=new THREE.Color(0x343b40),tint=new THREE.Color();
 const height=(x,z)=>x<0||z<0||x>=cols||z>=rows?base:Number(patch.heights?.[z*cols+x]??base);
 function face(points,color,shade=1){
  for(const i of [0,1,2,0,2,3]){positions.push(...points[i]);colors.push(color.r*shade,color.g*shade,color.b*shade);}
 }
 for(let z=0;z<rows;z++)for(let x=0;x<cols;x++){
  const i=z*cols+x,y=height(x,z),x0=bounds.minX+x*cell,x1=x0+cell,z0=bounds.minZ+z*cell,z1=z0+cell;
  const gravelVolume=Number(patch.gravel?.[i])||0;
  const intactPavement=patch.surface==='asphalt'&&y>base+.01&&gravelVolume>1e-8;
  tint.copy(intactPavement?asphalt:gravelVolume>1e-8?gravel:soil).multiplyScalar(.96+((x*17+z*31)%13)/160);
  face([[x0,y,z0],[x0,y,z1],[x1,y,z1],[x1,y,z0]],tint);
  for(const [dx,dz,edge]of [[-1,0,[[x0,z1],[x0,z0]]],[1,0,[[x1,z0],[x1,z1]]],[0,-1,[[x0,z0],[x1,z0]]],[0,1,[[x1,z1],[x0,z1]]]]){
   const other=height(x+dx,z+dz),outside=x+dx<0||z+dz<0||x+dx>=cols||z+dz>=rows;
   // Interior walls are emitted once, by the high cell. At a patch boundary
   // the outside ground can be higher, so also seal an excavated edge upward.
   if(y>other+.00001||outside&&y<other-.00001){const [[ax,az],[bx,bz]]=edge;face([[ax,Math.min(y,other),az],[bx,Math.min(y,other),bz],[bx,Math.max(y,other),bz],[ax,Math.max(y,other),az]],tint,.78);}
  }
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();geometry.computeBoundingBox();return geometry;
}
