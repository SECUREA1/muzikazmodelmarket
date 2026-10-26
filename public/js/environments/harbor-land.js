import * as THREE from '../../vendor/three/three.module.min.js';
import {harborLandPatches} from '../harbor-water.js';
export function createHarborLand(environment){
 const harbor=environment.builderScene.layoutMeta.harbor,root=new THREE.Group();root.name='PROCEDURAL_NEON_HARBOR';root.userData={proceduralLand:true,layout:'neon-harbor',streetHeightAt:()=>0};
 const surface=(name,width,depth,x,y,z,color)=>{const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,depth),new THREE.MeshStandardMaterial({color,roughness:.92}));mesh.rotation.x=-Math.PI/2;mesh.position.set(x,y,z);mesh.name='BUILDER_WALKABLE_FLOOR_'+name;mesh.userData.colliderShape='mesh';mesh.receiveShadow=true;root.add(mesh);return mesh;};
 // Physics retains flat land and a lower swim floor; visible waves never move collision geometry.
 surface('HARBOR_SWIM',harbor.extent*2,harbor.extent*2,0,-.65,0,0x123d4c);
 if(harbor.mainIsland!==false)surface('HARBOR_MAIN_ISLAND',256,256,0,0,0,0x415d53);
 for(const island of harbor.islands||[]){
  let pieces=[island];
  for(const lake of harbor.lakes||[])pieces=pieces.flatMap(piece=>{
   const left=piece.x-piece.width/2,right=piece.x+piece.width/2,near=piece.z-piece.depth/2,far=piece.z+piece.depth/2,x1=Math.max(left,lake.x-lake.width/2),x2=Math.min(right,lake.x+lake.width/2),z1=Math.max(near,lake.z-lake.depth/2),z2=Math.min(far,lake.z+lake.depth/2);
   if(x1>=x2||z1>=z2)return [piece];
   return [[left,right,near,z1],[left,right,z2,far],[left,x1,z1,z2],[x2,right,z1,z2]].filter(([a,b,c,d])=>b>a&&d>c).map(([a,b,c,d])=>({x:(a+b)/2,z:(c+d)/2,width:b-a,depth:d-c}));
  });
  pieces.forEach((piece,index)=>surface(island.id+(index?'-'+index:''),piece.width,piece.depth,piece.x,0,piece.z,harbor.mainIsland===false?0xbca583:0x839069));
 }
 const sandMaterial=new THREE.MeshStandardMaterial({color:0xc8bb8d,roughness:1});
 const shoreline=(name,x,z,width,depth)=>{
  for(const [side,px,pz,w,d]of [['north',x,z-depth/2+1.2,width,2.4],['south',x,z+depth/2-1.2,width,2.4],['west',x-width/2+1.2,z,2.4,depth-4.8],['east',x+width/2-1.2,z,2.4,depth-4.8]]){
   const strip=new THREE.Mesh(new THREE.PlaneGeometry(w,d),sandMaterial);strip.name='HARBOR_SHORELINE_'+name+'_'+side;strip.rotation.x=-Math.PI/2;strip.position.set(px,.003,pz);strip.receiveShadow=true;strip.userData={collisionDisabled:true,collider:false,shoreline:true};root.add(strip);
  }
 };
 if(harbor.mainIsland!==false)shoreline('MAIN',0,0,256,256);for(const island of harbor.islands||[])shoreline(island.id,island.x,island.z,island.width,island.depth);for(const lake of harbor.lakes||[])shoreline(lake.id,lake.x,lake.z,lake.width+4.8,lake.depth+4.8);
 const patches=harborLandPatches(harbor),islandCount=Math.max(1,patches.length),lakeCount=Math.max(1,(harbor.lakes||[]).length);
 const lakes={value:(harbor.lakes||[]).map(lake=>new THREE.Vector4(lake.x,lake.z,lake.width/2,lake.depth/2))};if(!lakes.value.length)lakes.value.push(new THREE.Vector4(10000,10000,0,0));
 const time={value:0},islands={value:patches.map(island=>new THREE.Vector4(island.x,island.z,island.width/2,island.depth/2))};
 while(islands.value.length<islandCount)islands.value.push(new THREE.Vector4(10000,10000,0,0));
 const waterMaterial=new THREE.MeshStandardMaterial({color:0x16798d,roughness:.25,metalness:.28,transparent:true,opacity:.9});
 waterMaterial.onBeforeCompile=shader=>{
  shader.uniforms.harborTime=time;shader.uniforms.harborIslands=islands;shader.uniforms.harborLakes=lakes;
  shader.vertexShader='varying vec3 vHarborWorld;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvHarborWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
  shader.fragmentShader=`uniform float harborTime;uniform vec4 harborIslands[${islandCount}];uniform vec4 harborLakes[${lakeCount}];varying vec3 vHarborWorld;
   float harborShore(vec2 p,vec2 center,vec2 halfSize){vec2 d=abs(p-center)-halfSize;return length(max(d,0.))+min(max(d.x,d.y),0.);}
  `+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   vec2 harborUV=vHarborWorld.xz;
   float harborWave=sin(harborUV.x*.33+harborTime*.75)+sin(harborUV.y*.41-harborTime*.53)+.45*sin((harborUV.x+harborUV.y)*.83+harborTime*.9);
   float harborEdge=100000.;
   for(int island=0;island<${islandCount};island++)harborEdge=min(harborEdge,abs(harborShore(harborUV,harborIslands[island].xy,harborIslands[island].zw)));
   for(int lake=0;lake<${lakeCount};lake++)harborEdge=min(harborEdge,abs(harborShore(harborUV,harborLakes[lake].xy,harborLakes[lake].zw)));
   float harborFoam=(1.-smoothstep(.15,2.8,harborEdge))*smoothstep(-.6,.8,harborWave)*.42;
   diffuseColor.rgb=mix(diffuseColor.rgb*(.83+harborWave*.055),vec3(.66,.85,.83),harborFoam);
  `).replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(.24+harborWave*.035,.15,.34);');
 };
 waterMaterial.customProgramCacheKey=()=> 'neon-harbor-waves-and-shoreline-v4-'+islandCount+'-'+lakeCount;
 const sea=new THREE.Mesh(new THREE.PlaneGeometry(harbor.extent*2,harbor.extent*2,48,48),waterMaterial);sea.name='HARBOR_WATER_VISUAL';sea.rotation.x=-Math.PI/2;sea.position.y=-.18;sea.userData={collisionDisabled:true,collider:false,waterSurface:true};root.add(sea);
 root.userData.updateHarborEffects=(elapsed,reducedMotion=false)=>{time.value=reducedMotion?0:Math.max(0,Number(elapsed)||0);};root.userData.harborWaterTime=time;
 return root;
}
