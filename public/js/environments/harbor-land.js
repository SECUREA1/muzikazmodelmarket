import * as THREE from '../../vendor/three/three.module.min.js';
export function createHarborLand(environment){
 const harbor=environment.builderScene.layoutMeta.harbor,root=new THREE.Group();root.name='PROCEDURAL_NEON_HARBOR';root.userData={proceduralLand:true,layout:'neon-harbor',streetHeightAt:()=>0};
 const surface=(name,width,depth,x,y,z,color)=>{const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,depth),new THREE.MeshStandardMaterial({color,roughness:.92}));mesh.rotation.x=-Math.PI/2;mesh.position.set(x,y,z);mesh.name='BUILDER_WALKABLE_FLOOR_'+name;mesh.userData.colliderShape='mesh';mesh.receiveShadow=true;root.add(mesh);return mesh;};
 // Low support plane gives swimmers a stable waterline without a hidden land slab at sea level.
 surface('HARBOR_SWIM',harbor.extent*2,harbor.extent*2,0,-.65,0,0x123d4c);
 surface('HARBOR_MAIN_ISLAND',256,256,0,0,0,0x415d53);
 for(const island of harbor.islands)surface(island.id,island.width,island.depth,island.x,0,island.z,0x839069);
 const sea=new THREE.Mesh(new THREE.PlaneGeometry(harbor.extent*2,harbor.extent*2,48,48),new THREE.MeshStandardMaterial({color:0x127b9a,roughness:.2,metalness:.28,transparent:true,opacity:.85}));sea.name='HARBOR_WATER_VISUAL';sea.rotation.x=-Math.PI/2;sea.position.y=-.18;sea.userData={collisionDisabled:true,collider:false,waterSurface:true};root.add(sea);
 return root;
}
