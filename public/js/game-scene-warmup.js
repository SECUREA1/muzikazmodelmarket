import * as THREE from '../vendor/three/three.module.min.js';

// Three's compileAsync traverses invisible and off-camera objects as well as
// the entry view. Compile that view against the real scene's lights/fog without
// cloning or reparenting authored meshes, skeletons or their circular rig data.
export async function compileVisibleGameScene(renderer,scene,camera){
 if(!renderer.compileAsync)return {meshCount:0};
 scene.updateMatrixWorld(true);camera.updateWorldMatrix(true,false);
 const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
 const visible=[];
 scene.traverseVisible(node=>{
  if(!node.material||!node.layers.test(camera.layers)||![].concat(node.material).some(material=>material?.visible))return;
  if(node.frustumCulled){
   if(node.isSprite?!frustum.intersectsSprite(node):node.geometry&&!frustum.intersectsObject(node))return;
  }
  visible.push(node);
 });
 const preparation=new THREE.Group();
 preparation.traverse=callback=>{for(const node of visible)callback(node);};
 await renderer.compileAsync(preparation,camera,scene);
 return {meshCount:visible.length};
}
