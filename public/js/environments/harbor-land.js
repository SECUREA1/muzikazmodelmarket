import * as THREE from '../../vendor/three/three.module.min.js';
export function createHarborLand(environment){
 const harbor=environment.builderScene.layoutMeta.harbor,root=new THREE.Group();root.name='PROCEDURAL_NEON_HARBOR';root.userData={proceduralLand:true,layout:'neon-harbor',streetHeightAt:()=>0};
 const surface=(name,width,depth,x,y,z,color)=>{const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,depth),new THREE.MeshStandardMaterial({color,roughness:.92}));mesh.rotation.x=-Math.PI/2;mesh.position.set(x,y,z);mesh.name='BUILDER_WALKABLE_FLOOR_'+name;mesh.userData.colliderShape='mesh';mesh.receiveShadow=true;root.add(mesh);return mesh;};
 // Physics retains flat land and a lower swim floor; visible waves never move collision geometry.
 surface('HARBOR_SWIM',harbor.extent*2,harbor.extent*2,0,-.65,0,0x123d4c);
 surface('HARBOR_MAIN_ISLAND',256,256,0,0,0,0x415d53);
 for(const island of harbor.islands)surface(island.id,island.width,island.depth,island.x,0,island.z,0x839069);
 const sandMaterial=new THREE.MeshStandardMaterial({color:0xc8bb8d,roughness:1});
 const shoreline=(name,x,z,width,depth)=>{
  for(const [side,px,pz,w,d]of [['north',x,z-depth/2+1.2,width,2.4],['south',x,z+depth/2-1.2,width,2.4],['west',x-width/2+1.2,z,2.4,depth-4.8],['east',x+width/2-1.2,z,2.4,depth-4.8]]){
   const strip=new THREE.Mesh(new THREE.PlaneGeometry(w,d),sandMaterial);strip.name='HARBOR_SHORELINE_'+name+'_'+side;strip.rotation.x=-Math.PI/2;strip.position.set(px,.003,pz);strip.receiveShadow=true;strip.userData={collisionDisabled:true,collider:false,shoreline:true};root.add(strip);
  }
 };
 shoreline('MAIN',0,0,256,256);for(const island of harbor.islands)shoreline(island.id,island.x,island.z,island.width,island.depth);
 const time={value:0},islands={value:harbor.islands.slice(0,3).map(island=>new THREE.Vector4(island.x,island.z,island.width/2,island.depth/2))};
 while(islands.value.length<3)islands.value.push(new THREE.Vector4(10000,10000,0,0));
 const waterMaterial=new THREE.MeshStandardMaterial({color:0x16798d,roughness:.25,metalness:.28,transparent:true,opacity:.9});
 waterMaterial.onBeforeCompile=shader=>{
  shader.uniforms.harborTime=time;shader.uniforms.harborIslands=islands;
  shader.vertexShader='varying vec3 vHarborWorld;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvHarborWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
  shader.fragmentShader=`uniform float harborTime;uniform vec4 harborIslands[3];varying vec3 vHarborWorld;
   float harborShore(vec2 p,vec2 center,vec2 halfSize){vec2 d=abs(p-center)-halfSize;return length(max(d,0.))+min(max(d.x,d.y),0.);}
  `+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   vec2 harborUV=vHarborWorld.xz;
   float harborWave=sin(harborUV.x*.33+harborTime*.75)+sin(harborUV.y*.41-harborTime*.53)+.45*sin((harborUV.x+harborUV.y)*.83+harborTime*.9);
   float harborEdge=harborShore(harborUV,vec2(0.),vec2(128.));
   for(int island=0;island<3;island++)harborEdge=min(harborEdge,harborShore(harborUV,harborIslands[island].xy,harborIslands[island].zw));
   float harborFoam=(1.-smoothstep(.15,2.8,harborEdge))*smoothstep(-.6,.8,harborWave)*.42;
   diffuseColor.rgb=mix(diffuseColor.rgb*(.83+harborWave*.055),vec3(.66,.85,.83),harborFoam);
  `).replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(.24+harborWave*.035,.15,.34);');
 };
 waterMaterial.customProgramCacheKey=()=> 'neon-harbor-waves-and-shoreline-v2';
 const sea=new THREE.Mesh(new THREE.PlaneGeometry(harbor.extent*2,harbor.extent*2,48,48),waterMaterial);sea.name='HARBOR_WATER_VISUAL';sea.rotation.x=-Math.PI/2;sea.position.y=-.18;sea.userData={collisionDisabled:true,collider:false,waterSurface:true};root.add(sea);
 root.userData.updateHarborEffects=(elapsed,reducedMotion=false)=>{time.value=reducedMotion?0:Math.max(0,Number(elapsed)||0);};root.userData.harborWaterTime=time;
 return root;
}
