// Weathered mountain silhouettes stay inside the authored primitive envelope.
// Existing mesh objects, placements and collider flags are the gameplay contract;
// only their visual surface geometry changes. Snow UVs never resample the terrain.
const VERSION=1;
const noise=(a,b,seed)=>{const value=Math.sin(a*127.1+b*311.7+seed*71.9)*43758.5453;return value-Math.floor(value);};

export function createMountainRidgeGeometry(T,original,{seed=0,style='ridge'}={}){
 if(!original?.getAttribute('position'))return original;
 original.computeBoundingBox();const bounds=original.boundingBox,min=bounds.min,max=bounds.max,span=max.clone().sub(min),positions=[],uvs=[];
 if(![span.x,span.y,span.z].every(n=>Number.isFinite(n)&&n>0))return original;
 function triangle(a,b,c,up=true){
  const normal=new T.Vector3().subVectors(new T.Vector3(...b),new T.Vector3(...a)).cross(new T.Vector3().subVectors(new T.Vector3(...c),new T.Vector3(...a)));
  if(up?normal.y<0:normal.y>0)[b,c]=[c,b];
  const axis=Math.abs(normal.x)>Math.abs(normal.y)?Math.abs(normal.x)>Math.abs(normal.z)?0:2:Math.abs(normal.y)>Math.abs(normal.z)?1:2;
  for(const p of [a,b,c]){positions.push(...p);uvs.push(axis===0?p[2]/8:p[0]/8,axis===1?p[2]/8:p[1]/8);}
 }
 const parameters=original.parameters||{};
 if(original.type==='ConeGeometry'||Number.isFinite(parameters.radius)){
  const source=original.getAttribute('position'),base=[],seen=new Set();let peak=null;
  for(let i=0;i<source.count;i++){
   const x=source.getX(i),y=source.getY(i),z=source.getZ(i);
   if(y===max.y&&!peak)peak=[x,y,z];
   if(y!==min.y||Math.hypot(x,z)<1e-6)continue;
   const key=Math.round(x*1e5)+':'+Math.round(z*1e5);if(!seen.has(key)){seen.add(key);base.push([x,y,z]);}
  }
  if(base.length<3||!peak)return original;
  base.sort((a,b)=>Math.atan2(a[2]-peak[2],a[0]-peak[0])-Math.atan2(b[2]-peak[2],b[0]-peak[0]));
  // Retain every original base-polygon corner and the original apex. Every new
  // vertex is a convex combination inside that cone, including rotated bounds.
  const perimeter=[];
  for(let i=0;i<base.length;i++)for(let j=0;j<4;j++){const a=base[i],b=base[(i+1)%base.length],t=j/4;perimeter.push([a[0]+(b[0]-a[0])*t,min.y,a[2]+(b[2]-a[2])*t]);}
  const rings=[perimeter],radii=[.84,.64,.44,.26,.11],direction=seed*.79;
  for(const [level,nominal]of radii.entries())rings.push(perimeter.map((p,index)=>{
   const angle=Math.atan2(p[2]-peak[2],p[0]-peak[0]),r=nominal*(.91+.09*noise(index,level,seed));
   const crest=Math.pow(Math.abs(Math.cos(angle-direction)),1.35),weather=.80+crest*.18+noise(index,level+8,seed)*.02;
   return [peak[0]+(p[0]-peak[0])*r,min.y+span.y*(1-r)*weather,peak[2]+(p[2]-peak[2])*r];
  }));
  for(let ring=0;ring<rings.length-1;ring++)for(let i=0;i<perimeter.length;i++){
   const j=(i+1)%perimeter.length,a=rings[ring][i],b=rings[ring][j],c=rings[ring+1][i],d=rings[ring+1][j];
   // Alternate erosion-face diagonals so the ridge has irregular shoulders.
   if((i+ring+seed)%2){triangle(a,b,c);triangle(b,d,c);}else{triangle(a,b,d);triangle(a,d,c);}
  }
  const top=rings[rings.length-1],floor=[peak[0],min.y,peak[2]];
  for(let i=0;i<perimeter.length;i++){const j=(i+1)%perimeter.length;triangle(top[i],top[j],peak);triangle(perimeter[i],floor,perimeter[j],false);}
 }else{
  // A long fractured crest replaces the mountain-pass rectangular walls. The
  // original four basal corners keep the exact local footprint and approaches.
  const columns=8,rows=14,grid=[];
  for(let z=0;z<=rows;z++){
   const nz=z/rows*2-1,row=[];
   for(let x=0;x<=columns;x++){
    const nx=x/columns*2-1,crest=.24*Math.sin(nz*5.2+seed*.7)*Math.abs(nz),side=nx>=crest?1-crest:1+crest;
    const flank=Math.pow(Math.max(0,1-Math.abs(nx-crest)/side),.7),length=Math.pow(Math.max(0,1-Math.abs(nz)),.30);
    const shoulder=.84+.10*Math.cos(nz*9+seed)+.06*noise(x,z,seed),height=x===columns/2&&z===rows/2?1:flank*length*shoulder;
    row.push([min.x+x/columns*span.x,min.y+height*span.y,min.z+z/rows*span.z]);
   }
   grid.push(row);
  }
  for(let z=0;z<rows;z++)for(let x=0;x<columns;x++){
   const a=grid[z][x],b=grid[z][x+1],c=grid[z+1][x],d=grid[z+1][x+1];
   if((x+z)%2){triangle(a,b,c);triangle(b,d,c);}else{triangle(a,b,d);triangle(a,d,c);}
  }
  const perimeter=[];
  for(let x=0;x<=columns;x++)perimeter.push(grid[0][x]);
  for(let z=1;z<=rows;z++)perimeter.push(grid[z][columns]);
  for(let x=columns-1;x>=0;x--)perimeter.push(grid[rows][x]);
  for(let z=rows-1;z>0;z--)perimeter.push(grid[z][0]);
  const floor=[(min.x+max.x)/2,min.y,(min.z+max.z)/2];
  // Match every subdivided perimeter edge, avoiding a T-junction between the
  // detailed upper surface and its closed, downward-facing underside.
  for(let i=0;i<perimeter.length;i++)triangle(perimeter[i],floor,perimeter[(i+1)%perimeter.length],false);
 }
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();geometry.name='WEATHERED_MOUNTAIN_RIDGE';geometry.userData={mountainTerrainDesign:VERSION,style,seed};return geometry;
}

export function finishMountainTerrainDesign(T,root,{ridgeNames=[],rockNames=[],walkableSkiUvs=false}={}){
 if(!root||root.userData.mountainTerrainDesign?.version===VERSION)return root;
 const ridges=new Set(ridgeNames),rocks=new Set(rockNames);let ridgeCount=0,uvTileCount=0,rockFaces=0;
 root.traverse(node=>{
  if(!node.isMesh)return;
  if(ridges.has(node.name)){
   const original=node.geometry,replacement=createMountainRidgeGeometry(T,original,{seed:ridgeCount+13});
   if(replacement!==original){node.geometry=replacement;ridgeCount++;}
  }
  if(ridges.has(node.name)||rocks.has(node.name)){
   for(const material of [].concat(node.material||[]))material.name='WEATHERED_MOUNTAIN_ROCK';
   rockFaces++;
  }
  if(walkableSkiUvs&&node.name.startsWith('BUILDER_WALKABLE_FLOOR_SKI_MOUNTAIN_')){
   const position=node.geometry.getAttribute('position'),uv=new Float32Array(position.count*2);
   // A single metre-aligned projection across all tiles prevents visible seams.
   // Local -Y becomes world +Z under the original -PI/2 terrain rotation.
   for(let i=0;i<position.count;i++){uv[i*2]=position.getX(i)/64;uv[i*2+1]=-position.getY(i)/64;}
   node.geometry.setAttribute('uv',new T.BufferAttribute(uv,2));
   for(const material of [].concat(node.material||[]))material.name='MOUNTAIN_POWDER_SNOW';
   uvTileCount++;
  }
 });
 root.userData.mountainTerrainDesign={version:VERSION,ridgeCount,uvTileCount,rockFaces};return root;
}
