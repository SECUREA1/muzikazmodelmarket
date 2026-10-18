export function createSolidPaint(THREE,asset){
 const delta=new THREE.Vector3(asset.strokeDelta.x,asset.strokeDelta.y,asset.strokeDelta.z),length=delta.length(),radius=.18;
 const mesh=new THREE.Mesh(new THREE.CapsuleGeometry(radius,length,4,8),new THREE.MeshStandardMaterial({color:asset.color,roughness:.58}));
 if(length>.001)mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());
 mesh.position.y=Math.abs(asset.strokeDelta.y)/2+radius;mesh.castShadow=true;mesh.receiveShadow=true;return mesh;
}
