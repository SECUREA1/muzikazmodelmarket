// Render the same server projectiles on desktop and mobile without local damage.
export function createSharedEnemyEffects({THREE,scene,resources,now=()=>performance.now()}){
 const roots=new Map();let receivedAt=0;
 function clear(){for(const root of roots.values()){root.removeFromParent();root.material.dispose();}roots.clear();}
 return {clear,sync(snapshot){
  receivedAt=now();const active=new Set();
  for(const projectile of Object.values(snapshot.projectiles||{})){
   active.add(projectile.id);let root=roots.get(projectile.id);
   if(!root){const color=projectile.kind==='ghost'?0x55ddff:projectile.kind==='brain'?0xff55bb:0xffb52e;
    root=new THREE.Sprite(new THREE.SpriteMaterial({map:resources().ghostGas||resources().gas||null,color,transparent:true,depthWrite:false,toneMapped:false}));root.scale.setScalar(projectile.kind==='boss'?.65:.42);root.userData.target=new THREE.Vector3();root.userData.predicted=new THREE.Vector3();root.userData.velocity=new THREE.Vector3();root.position.set(projectile.position.x,projectile.position.y,projectile.position.z);scene.add(root);roots.set(projectile.id,root);
   }
   const texture=resources().ghostGas||resources().gas;if(texture&&!root.material.map){root.material.map=texture;root.material.needsUpdate=true;}
   root.userData.target.set(projectile.position.x,projectile.position.y,projectile.position.z);root.userData.velocity.fromArray(projectile.velocity);
  }
  for(const [id,root]of roots)if(!active.has(id)){root.removeFromParent();root.material.dispose();roots.delete(id);}
 },update(delta){
  const elapsed=Math.min(.15,Math.max(0,(now()-receivedAt)/1000));
  for(const root of roots.values()){const data=root.userData;data.predicted.copy(data.target).addScaledVector(data.velocity,elapsed);root.position.lerp(data.predicted,1-Math.exp(-30*delta));}
 }};
}
