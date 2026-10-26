import {isAircraft} from './aircraft-flight.js';
import {isWatercraft} from './harbor-water.js';
// Shared physical silhouettes for AI craft, independent of detailed moving artwork.
export function createTrafficCollisionProxy(THREE,actor){
 if(!isAircraft(actor)&&!isWatercraft(actor))return null;
 const root=new THREE.Group();root.userData.builderObjectId=actor.id;
 const parts=isAircraft(actor)?[[1.6,2.7,7.6,0,.95,0],[10.5,.8,2.5,0,.5,-.45],[4.2,.9,1.6,0,.95,3.3]]:actor.modelId==='harbor-yacht'?[[12,5,42,0,2.5,0]]:actor.modelId==='harbor-fishing-boat'?[[2.7,1.5,6.3,0,.5,0]]:actor.modelId==='harbor-patrol'?[[3,2,7.8,0,.7,0]]:[[2,1.5,4.8,0,.5,0],...(actor.modelId==='harbor-sailboat'?[[.18,5.2,.18,0,2.6,.15]]:[])];
 for(const [w,h,d,x,y,z]of parts){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshBasicMaterial());mesh.position.set(x,y,z);root.add(mesh);}return root;
}
