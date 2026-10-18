import {EnemySnapshotMotion} from './enemy-snapshot-motion.js';
// Render the same server projectiles on desktop and mobile without local damage.
export function createSharedEnemyEffects({THREE,scene,resources,now=()=>performance.now()}){
 const roots=new Map();let lastTime=null;
 function remove(id,root){root.removeFromParent();root.material.dispose();roots.delete(id);}
 function clear(){for(const [id,root]of roots)remove(id,root);lastTime=null;}
 return {clear,sync(snapshot){
  const receivedAt=now(),time=snapshot.simulationTime,stamped=Number.isFinite(time);
  if(stamped&&lastTime!==null&&time<lastTime)return;
  if(stamped)lastTime=time;
  const active=new Set();
  for(const projectile of Object.values(snapshot.projectiles||{})){
   active.add(projectile.id);let root=roots.get(projectile.id);
   if(!root){const color=projectile.kind==='ghost'?0x55ddff:projectile.kind==='brain'?0xff55bb:0xffb52e;
    root=new THREE.Sprite(new THREE.SpriteMaterial({map:resources().ghostGas||resources().gas||null,color,transparent:true,depthWrite:false,toneMapped:false}));root.scale.setScalar(projectile.kind==='boss'?.65:.42);root.userData.motion=new EnemySnapshotMotion({maxExtrapolation:80});root.position.set(projectile.position.x,projectile.position.y,projectile.position.z);scene.add(root);roots.set(projectile.id,root);
   }
   const texture=resources().ghostGas||resources().gas;if(texture&&!root.material.map){root.material.map=texture;root.material.needsUpdate=true;}
   const data=root.userData;data.motion.push(projectile.position,receivedAt,stamped?time:receivedAt);data.expiresAt=projectile.expiresAt;data.velocity=projectile.velocity;data.stamped=stamped;delete data.removeAt;
  }
  for(const [id,root]of roots)if(!active.has(id)){if(!stamped)remove(id,root);else root.userData.removeAt ??= time;}
 },update(delta){
  const at=now();
  for(const [id,root]of roots){
   const data=root.userData,time=data.motion.renderTime(at);
   if(Number.isFinite(data.expiresAt)&&time>=data.expiresAt||Number.isFinite(data.removeAt)&&time>=data.removeAt){remove(id,root);continue;}
   data.motion.sample(at,root.position);
   // Compatibility with unstamped callers; network snapshots use the buffer.
   if(!data.stamped&&data.motion.motion.snapshots.length===1&&Array.isArray(data.velocity)){
    const elapsed=Math.max(0,Math.min(.15,(at-data.motion.motion.receivedAt)/1000));root.position.addScaledVector(new THREE.Vector3(...data.velocity),elapsed);
   }
  }
 }};
}
