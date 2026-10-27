export const ALPINE_MOUNTAIN_MODEL_INFO=Object.freeze({
 'alpine-mountain':['Alpine Snow Mountain','A sculpted alpine ridge with flared stone foothills, branching rock buttresses and snow-filled gullies beneath a pointed summit.',[6,5,5.5]]
});

// One closed landform is split at its snowline, rather than assembling cones,
// ledges or a second snow shell. Every snow/stone boundary uses the same cached
// edge intersections, including where a snow tongue crosses a diagonal face.
export function createAlpineMountain(THREE){
 const root=new THREE.Group(),segments=56,peak=[-.3,5,-.1],rock=[],snow=[];
 const levels=[
  [1,0],[.945,.10],[.87,.40],[.785,.85],[.70,1.35],
  [.615,1.95],[.53,2.60],[.45,3.10],[.37,3.50],
  [.29,3.82],[.215,4.10],[.15,4.36],[.095,4.57],[.045,4.70]
 ];
 const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
 const angularDistance=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
 const buttresses=[[-.64,.66,.28],[1.37,.53,.28],[2.85,.68,.34],[4.55,.55,.30]];
 const ridgeAt=(angle,radius)=>buttresses.reduce((sum,[direction,height,width])=>{
  const offset=angularDistance(angle,direction+Math.sin(radius*Math.PI)*.12);
  return sum+height*Math.exp(-offset*offset/(width*width));
 },0);
 let vertexId=0;
 const vertex=(position)=>{
  const angle=Math.atan2((position[2]-peak[2])/2.75,(position[0]-peak[0])/3);
  // Wind-scoured shoulders and snow-filled channels alternate around the ridge.
  // This is a colour/material cut of the rock, with no surface gap.
  const snowline=3.015+.24*(.5+.5*Math.sin(angle*3+1.7))**2+.34*(.5+.5*Math.sin(angle*7-.4))**6;
  return {id:vertexId++,position,snow:position[1]-snowline};
 };
 const rings=levels.map(([radius,height])=>Array.from({length:segments},(_,i)=>{
  const angle=i*Math.PI*2/segments,sine=Math.sin(angle*2);
  // Cardinal base vertices retain the precise published footprint. Between
  // them, shallow embayments give the foothills a grounded, irregular outline.
  const outline=1-.075*sine*sine-.055*Math.sin(angle*4)**2*(.5+.5*Math.sin(angle*3+.6));
  const bend=Math.sin(radius*Math.PI),ridge=ridgeAt(angle,radius);
  const foldedRadius=radius*(1-.33*bend*(1-clamp(ridge/.58)));
  const x=peak[0]*(1-radius)+Math.cos(angle)*3*foldedRadius*outline+bend*(.56+.11*Math.sin(angle*2+radius));
  const z=peak[2]*(1-radius)+Math.sin(angle)*2.75*foldedRadius*outline+bend*(-.22+.075*Math.cos(angle*3-radius));
  const footTaper=Math.min(1,(1-radius)/.3);
  const relief=((ridge-.18)*2.8*bend*Math.sqrt(radius)*Math.min(1,(radius/.55)**2)+.035*Math.sin(angle*11+radius*8)*bend*bend)*footTaper;
  return vertex([clamp(x,-3,3),radius===1?0:Math.min(4.75,height+relief),clamp(z,-2.75,2.75)]);
 }));
 const summit=vertex(peak),bottom=vertex([0,0,0]),intersections=new Map();
 function crossing(a,b){
  const key=a.id<b.id?a.id+':'+b.id:b.id+':'+a.id;
  if(!intersections.has(key)){
   const t=a.snow/(a.snow-b.snow);
   intersections.set(key,{id:vertexId++,position:a.position.map((value,axis)=>value+(b.position[axis]-value)*t),snow:0});
  }
  return intersections.get(key);
 }
 function clip(vertices,snowSide){
  const result=[];
  for(let i=0;i<vertices.length;i++){
   const a=vertices[i],b=vertices[(i+1)%vertices.length],insideA=snowSide?a.snow>=0:a.snow<=0,insideB=snowSide?b.snow>=0:b.snow<=0;
   if(insideA)result.push(a);
   if(insideA!==insideB)result.push(crossing(a,b));
  }
  return result;
 }
 function triangle(a,b,c){
  for(const [target,snowSide] of [[rock,false],[snow,true]]){
   const polygon=clip([a,b,c],snowSide);
   for(let i=1;i<polygon.length-1;i++)target.push(polygon[0],polygon[i],polygon[i+1]);
  }
 }
 for(let row=0;row<rings.length-1;row++)for(let i=0;i<segments;i++){
  const next=(i+1)%segments;
  triangle(rings[row][i],rings[row+1][i],rings[row][next]);
  triangle(rings[row][next],rings[row+1][i],rings[row+1][next]);
 }
 for(let i=0;i<segments;i++){
  const next=(i+1)%segments;
  triangle(rings.at(-1)[i],summit,rings.at(-1)[next]);
  // The underside closes the same base outline; it never adds a visible plinth.
  triangle(bottom,rings[0][i],rings[0][next]);
 }
 function surface(name,vertices,isSnow){
  const geometry=new THREE.BufferGeometry(),positions=[],colors=[],uv=[];
  const low=new THREE.Color(isSnow?0xbcd3df:0x59635e),high=new THREE.Color(isSnow?0xf5fbff:0x93958a),warm=new THREE.Color(0x8b8270);
  for(const {position:[x,y,z]} of vertices){
   positions.push(x,y,z);uv.push((x+3)/6,(z+2.75)/5.5);
   const angle=Math.atan2((z-peak[2])/2.75,(x-peak[0])/3),rib=clamp(ridgeAt(angle,.5)/.68);
   const color=low.clone().lerp(high,isSnow?clamp(.36+y*.115):clamp(y*.12+rib*.21));
   if(!isSnow){
    // Broad tilted sediment beds and pale exposed ridge edges are part of the
    // stone colour field, so no separate rings or floating mineral strips occur.
    const bed=.5+.5*Math.sin(y*8.5+x*.8+z*.6);
    color.lerp(warm,.10+bed*.045).multiplyScalar(.91+rib*.10+bed*.02);
   }
   colors.push(color.r,color.g,color.b);
  }
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const material=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,flatShading:true,roughness:isSnow?.93:.97,metalness:0});
  material.name=isSnow?'ALPINE_POWDER_SNOW':'ALPINE_WEATHERED_STONE';
  const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);return mesh;
 }
 surface('ALPINE_ROCK_RIDGES',rock,false);
 surface('ALPINE_SNOW_CAP',snow,true).userData.alpineSnow=true;
 root.userData.alpineMountain=true;
 root.userData.alpineMountainDesign='crafted-alpine-v1';
 return root;
}
