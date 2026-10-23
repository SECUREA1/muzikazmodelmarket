export const ALPINE_MOUNTAIN_MODEL_INFO=Object.freeze({
 'alpine-mountain':['Alpine Snow Mountain','A grounded, pointed rock ridge with irregular stone faces and a broad snowy upper third.',[6,5,5.5]]
});

// The snow and rock meet along the same jagged ring: the white summit is part
// of the mountain surface, with no floating cap or duplicated collision shell.
export function createAlpineMountain(THREE){
 const root=new THREE.Group(),segments=12,rock=[],snow=[];
 const baseFactors=[1,.92,.87,1,.88,.96,1,.91,.9,1,.93,.89];
 const ring=(level)=>Array.from({length:segments},(_,i)=>{
  const angle=i*Math.PI*2/segments,variation=Math.sin(i*2.3+.4),radius=level===0?baseFactors[i]:level===1?.72+variation*.12:level===2?.52+variation*.08:.13+variation*.055;
  const y=level===0?0:level===1?1.65+Math.sin(i*1.8)*.24:level===2?3.2+Math.sin(i*2.1)*.24:4.36+Math.sin(i*1.7)*.12;
  return [Math.cos(angle)*3*radius-(level?level*.075:0),y,Math.sin(angle)*2.75*radius-(level?level*.025:0)];
 });
 const rings=[ring(0),ring(1),ring(2),ring(3)],summit=[-.3,5,-.1];
 const triangle=(target,a,b,c)=>target.push(...a,...b,...c);
 for(let band=0;band<3;band++)for(let i=0;i<segments;i++){
  const next=(i+1)%segments,target=band<2?rock:snow;
  triangle(target,rings[band][i],rings[band+1][i],rings[band][next]);
  triangle(target,rings[band][next],rings[band+1][i],rings[band+1][next]);
 }
 for(let i=0;i<segments;i++){
  const next=(i+1)%segments;
  triangle(snow,rings[3][i],summit,rings[3][next]);
  triangle(rock,[0,0,0],rings[0][i],rings[0][next]);
 }
 const surface=(name,positions,bottom,top)=>{
  const geometry=new THREE.BufferGeometry(),colors=[],low=new THREE.Color(bottom),high=new THREE.Color(top);
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  for(let i=0;i<positions.length;i+=3){
   const shade=(Math.sin(Math.floor(i/9)*1.9)+1)*.06,height=positions[i+1]/5,color=low.clone().lerp(high,Math.min(1,height*.75+shade));
   colors.push(color.r,color.g,color.b);
  }
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:1,metalness:0}));
  mesh.name=name;root.add(mesh);return mesh;
 };
 surface('ALPINE_ROCK_RIDGES',rock,0x3e4a48,0x8d9690);
 surface('ALPINE_SNOW_CAP',snow,0xc4dce4,0xffffff).userData.alpineSnow=true;
 root.userData.alpineMountain=true;
 return root;
}
