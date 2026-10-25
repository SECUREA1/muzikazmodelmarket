import {previewDescriptor,loadPreviewModel,disposePreviewModel} from './market-item-preview.js';
// Preview settings never change the product, ownership or settlement price.
export function mountMarketPreviewTuner(row,record){
 const item=previewDescriptor(record),figure=row.querySelector('[data-item-preview]');
 if(!figure||!(item.model||item.materialId||item.buildAssetId))return {dispose(){}};
 const controls=document.createElement('details');controls.className='market-preview-tuning';controls.innerHTML='<summary>Preview · rotate and zoom</summary><p>Preview only. Place an owned item in the builder to edit it.</p><label>Rotation<input type="range" min="-180" max="180" step="1" value="0" aria-label="Preview rotation"></label><label>Zoom<input type="range" min="0.6" max="2" step="0.1" value="1" aria-label="Preview zoom"></label><p data-preview-state>Open to load the interactive 3D preview.</p>';
 figure.after(controls);let disposed=false,renderer,root,scene,camera,resize,baseDistance=1,center,THREE;
 const release=()=>{resize?.disconnect();renderer?.domElement.remove();figure.classList.remove('market-live-preview');renderer?.dispose();renderer?.forceContextLoss();disposePreviewModel(root);root=null;};
 const render=()=>{if(disposed||!renderer)return;const width=Math.max(100,figure.clientWidth),height=Math.max(120,Math.min(300,width*.8));renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();root.rotation.y=Number(controls.querySelector('[aria-label="Preview rotation"]').value)*Math.PI/180;const zoom=Number(controls.querySelector('[aria-label="Preview zoom"]').value);camera.position.copy(center).add(new THREE.Vector3(1,.65,1.5).normalize().multiplyScalar(baseDistance/zoom));camera.lookAt(center);renderer.render(scene,camera);};
 controls.querySelectorAll('input').forEach(input=>input.addEventListener('input',render));
 let loading=false;
 controls.addEventListener('toggle',async()=>{if(!controls.open||loading)return;loading=true;const status=controls.querySelector('[data-preview-state]');status.textContent='Loading 3D preview…';
  try{
   const loaded=await loadPreviewModel(item);THREE=loaded.THREE;root=loaded.root;
   if(disposed){release();return;}if(!root)throw Error('No model');scene=new THREE.Scene();scene.background=new THREE.Color('#10221b');scene.add(root);scene.add(new THREE.HemisphereLight(0xffffff,0x45624b,2.5));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(3,5,4);scene.add(light);root.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(root);center=bounds.getCenter(new THREE.Vector3());root.position.sub(center);center.set(0,0,0);baseDistance=Math.max(.1,bounds.getSize(new THREE.Vector3()).length())*1.7;camera=new THREE.PerspectiveCamera(35,1,.001,baseDistance*100+100);
   renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.domElement.setAttribute('aria-label',item.name+' interactive 3D preview');figure.append(renderer.domElement);figure.classList.add('market-live-preview');resize=new ResizeObserver(render);resize.observe(figure);render();status.textContent='Drag the sliders to inspect this item.';
  }catch{release();status.textContent='Interactive preview unavailable. The item artwork and sale details remain available.';controls.querySelectorAll('input').forEach(input=>input.disabled=true);}
 });
 return {dispose(){disposed=true;release();controls.remove();}};
}
