import * as T from '../vendor/three/three.module.min.js';
import {createFunhouseModel} from './clown-funhouse-models.js';

export function updateFunhouseWaterGun(root,state,{firstPerson=false}={}){
 let gun=root.getObjectByName('CARRIED_FUNHOUSE_WATER_GUN');
 if(state?.tool!=='water'){if(gun)gun.visible=false;return;}
 if(!gun){gun=createFunhouseModel('funhouse-water-gun');if(!gun)return;gun.name='CARRIED_FUNHOUSE_WATER_GUN';gun.traverse(node=>{node.userData.collisionDisabled=true;node.raycast=()=>{};});root.add(gun);}
 gun.visible=true;gun.scale.setScalar(firstPerson?.6:.65);gun.position.set(...(firstPerson?[.3,-.42,-.72]:[.42,.88,-.25]));
}
export function createFunhouseWaterEffects(scene){
 const geometry=new T.SphereGeometry(.04,6,4),material=new T.MeshBasicMaterial({color:'#84f5ff',transparent:true,opacity:.8}),mesh=new T.InstancedMesh(geometry,material,128),matrix=new T.Matrix4(),rotation=new T.Quaternion(),scale=new T.Vector3(1,1,1),point=new T.Vector3();
 mesh.name='HARMLESS_FUNHOUSE_WATER';mesh.userData.collisionDisabled=true;mesh.frustumCulled=false;mesh.count=0;scene.add(mesh);
 const shots=[],seen=new Set();
 return {receive(snapshot){for(const event of snapshot?.events||[]){const effect=event.funhouseEffect;if(effect?.kind!=='water-spray'||seen.has(event.id))continue;seen.add(event.id);if(seen.size>128)seen.delete(seen.values().next().value);if(snapshot.serverTime-event.at>700)continue;shots.push({...effect,age:0});if(shots.length>8)shots.shift();}},update(delta){let index=0;for(let i=shots.length-1;i>=0;i--){const shot=shots[i];shot.age+=delta;if(shot.age>.55){shots.splice(i,1);continue;}for(let drop=0;drop<16;drop++){const t=Math.max(0,shot.age-drop*.008),travel=t*12;point.set(shot.origin.x+shot.direction[0]*travel,shot.origin.y+shot.direction[1]*travel-t*t*3,shot.origin.z+shot.direction[2]*travel);point.x+=Math.sin(drop*2)*t*.12;point.z+=Math.cos(drop*2)*t*.12;matrix.compose(point,rotation,scale);mesh.setMatrixAt(index++,matrix);}}mesh.count=index;mesh.instanceMatrix.needsUpdate=true;},reset(){shots.length=0;seen.clear();mesh.count=0;},dispose(){mesh.removeFromParent();geometry.dispose();material.dispose();}};
}
