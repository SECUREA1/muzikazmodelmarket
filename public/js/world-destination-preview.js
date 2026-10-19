import {SharedGameInventory} from './shared-game-inventory.js';
import {worldPreviewData,previewWorldId} from './world-preview-data.js';
import {firingRangeLocations,rangeLocalToWorld} from './firing-range.js';
const records=new Map(),mounted=new WeakMap();let active=null;
function fetchWorld(world){
 if(world.builderScene||world.proceduralLand||world.modelUrl||world.modelUrls?.length)return Promise.resolve(world);
 const id=previewWorldId(world);if(!id)return Promise.resolve(world);
 const key=id+':'+(world.updatedAt||'');
 if(!records.has(key)){const pending=new SharedGameInventory().api('/api/environments/'+encodeURIComponent(id)).then(result=>({...world,...result})).catch(error=>{records.delete(key);throw error;});records.set(key,pending);if(records.size>24)records.delete(records.keys().next().value);}
 return records.get(key);
}
function overview(world){
 const data=worldPreviewData(world),ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 320 220');svg.setAttribute('role','img');svg.setAttribute('aria-label',data.name+' map overview');
 const add=(tag,attrs)=>{const node=document.createElementNS(ns,tag);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,String(value));svg.append(node);};
 add('rect',{width:320,height:220,rx:20,fill:'#102b2a'});add('rect',{x:30,y:12,width:260,height:196,rx:14,fill:'#244a3d',stroke:'#426e5c'});
 const scale=180/data.mapSize,px=x=>160+Number(x||0)*scale,pz=z=>110+Number(z||0)*scale;
 for(const street of data.streets.slice(0,32))add('line',{x1:px(street.from.x),y1:pz(street.from.z),x2:px(street.to.x),y2:pz(street.to.z),stroke:'#89a6a4','stroke-width':Math.max(2,(street.width||3)*scale),'stroke-linecap':'round'});
 for(const object of data.objects.slice(0,80)){const x=px(object.position?.x),z=pz(object.position?.z);if(x<30||x>290||z<12||z>208)continue;add(object.atlasDestination?'circle':'rect',object.atlasDestination?{cx:x,cy:z,r:4,fill:'#aef4ff'}:{x:x-3,y:z-3,width:6,height:6,rx:1.5,fill:object.materialSettings?.accent||data.color,stroke:'#d8f5e2','stroke-width':.5});}
 add('circle',{cx:px(world.spawn?.x),cy:pz(world.spawn?.z),r:4,fill:'#d5ff98',stroke:'#10241a','stroke-width':2});return svg;
}
function disposeObject(root){root?.traverse(node=>{node.geometry?.dispose();for(const material of Array.isArray(node.material)?node.material:[node.material]){if(!material)continue;for(const value of Object.values(material))if(value?.isTexture&&!value.userData.sportsSurfaceShared)value.dispose();material.dispose();}});}
export function mountWorldPreview(root,world,{resolve=true,auto3d=false}={}){
 const key=previewWorldId(world)+':'+(world.updatedAt||'');if(mounted.get(root)?.key===key)return mounted.get(root);
 mounted.get(root)?.dispose();root.replaceChildren();root.classList.add('world-destination-preview');
 root.classList.toggle('is-auto-preview',auto3d);
 if(!document.querySelector('[data-world-preview-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('../assets/world-destination-preview.css',import.meta.url).href;link.dataset.worldPreviewStyle='';document.head.append(link);}
 const viewport=document.createElement('div');viewport.className='world-preview-viewport';const poster=document.createElement('div');poster.className='world-preview-poster';viewport.append(poster);
 const footer=document.createElement('div');footer.className='world-preview-footer';const status=document.createElement('span');status.setAttribute('role','status');const button=document.createElement('button');button.type='button';button.textContent='View 3D';footer.append(status,button);root.append(viewport,footer);
 let current=world,destroyed=false,stop3d=null,loading=false,generation=0,paused=false,previewStatus='',autoObserver=null,autoVisible=false,autoReady=auto3d;
 const setButton=playing=>{
  if(!auto3d){button.textContent=playing?'Close 3D':'View 3D';return;}
  const label=playing?'Pause 3D preview':'Resume 3D preview';button.setAttribute('aria-label',label);button.title=label;
  button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">'+(playing?'<path d="M8 5v14M16 5v14"/>':'<path d="m8 5 11 7-11 7Z"/>')+'</svg>';
 };
 setButton(false);
 const setPoster=record=>{const data=worldPreviewData(record);poster.replaceChildren();if(data.image){const image=document.createElement('img');image.src=data.image;image.alt=data.name+' destination artwork';image.loading='lazy';image.addEventListener('error',()=>poster.replaceChildren(overview(record)),{once:true});poster.append(image);status.textContent='Destination artwork';}else{poster.append(overview(record));status.textContent=data.procedural?'Saved map overview':'Explore the destination in 3D';}};
 setPoster(current);
 const maybeStartAuto=()=>{
  if(!autoReady||!autoVisible||destroyed||document.hidden||!root.isConnected)return;
  const dialog=root.closest('dialog');if(dialog&&!dialog.open)return;
  autoReady=false;autoObserver?.disconnect();document.removeEventListener('visibilitychange',maybeStartAuto);void togglePreview();
 };
 const result={key,dispose(){if(destroyed)return;destroyed=true;autoObserver?.disconnect();if(auto3d)document.removeEventListener('visibilitychange',maybeStartAuto);stop3d?.();generation++;if(mounted.get(root)===result)mounted.delete(root);}};mounted.set(root,result);
 if(resolve)fetchWorld(world).then(record=>{if(!destroyed&&root.isConnected){current=record;if(!stop3d&&!loading)setPoster(record);}}).catch(()=>{if(!destroyed)status.textContent='Preview available when the server reconnects';});
 async function togglePreview(){
  if(loading||destroyed)return;
  if(stop3d){if(auto3d){paused=!paused;setButton(!paused);status.textContent=paused?'3D preview paused':previewStatus;}else stop3d();return;}
  paused=false;
  active?.();loading=true;button.disabled=true;status.textContent='Loading destination preview…';const request=++generation;const abort=new AbortController();const mixers=[],dialog=root.closest('dialog');let renderer,scene,controls,resizeObserver,visibilityObserver,lifecycleObserver,frame=0,visible=true;
  const onDialogClose=()=>{if(!dialog.open)stop();};
  const stop=()=>{if(request!==generation)return;generation++;abort.abort();cancelAnimationFrame(frame);resizeObserver?.disconnect();visibilityObserver?.disconnect();lifecycleObserver?.disconnect();dialog?.removeEventListener('close',onDialogClose);controls?.dispose();mixers.forEach(mixer=>mixer.stopAllAction());disposeObject(scene);renderer?.dispose();renderer?.forceContextLoss();renderer?.domElement.remove();poster.hidden=false;loading=false;stop3d=null;delete root.dataset.worldPreviewActive;if(active===stop)active=null;button.disabled=false;setButton(false);if(!destroyed)setPoster(current);};
  dialog?.addEventListener('close',onDialogClose);
  active=stop;stop3d=stop;root.dataset.worldPreviewActive='true';if(typeof MutationObserver!=='undefined'){lifecycleObserver=new MutationObserver(()=>{if(!root.isConnected)stop();});lifecycleObserver.observe(document.body,{childList:true,subtree:true});}
  try{
   current=await fetchWorld(current);const [THREE,{GLTFLoader},{OrbitControls},{createBuilderLand},{createBuilderModel,createGeneratedAsset},{animateArcadePark},{populateWorldPreviewContent}]=await Promise.all([import('../vendor/three/three.module.min.js'),import('../vendor/three/addons/loaders/GLTFLoader.js'),import('../vendor/three/addons/controls/OrbitControls.js'),import('./environments/builder-land.js'),import('./builder-models-3d.js'),import('./arcade-park.js'),import('./world-preview-scene.js')]);
   if(destroyed||request!==generation||!root.isConnected){stop();return;}
   scene=new THREE.Scene();scene.background=new THREE.Color(0x10201f);scene.add(new THREE.HemisphereLight(0xd9f5ff,0x435245,2.4));const sun=new THREE.DirectionalLight(0xffffff,2.5);sun.position.set(30,60,25);scene.add(sun);const content=new THREE.Group();scene.add(content);const data=worldPreviewData(current),rangeLocation=!data.base&&data.firingRange?firingRangeLocations(current).find(location=>location.id==='main'):null;
   const loader=new GLTFLoader(),loadModel=async url=>{
    const response=await fetch(url,{signal:abort.signal});if(!response.ok)throw Error('World model unavailable');const buffer=await response.arrayBuffer();if(request!==generation||!root.isConnected)throw new DOMException('Preview closed','AbortError');
    const gltf=await loader.parseAsync(buffer,new URL('.',new URL(url,location.href)).href);if(request!==generation||!root.isConnected){disposeObject(gltf.scene);throw new DOMException('Preview closed','AbortError');}
    // Stage loaded assets under the live scene before the assembler reparents
    // them, so cancellation also disposes an incomplete multi-model preview.
    content.add(gltf.scene);if(gltf.animations?.length){const mixer=new THREE.AnimationMixer(gltf.scene);gltf.animations.forEach(clip=>mixer.clipAction(clip).play());mixers.push(mixer);}return gltf.scene;
   };
   await populateWorldPreviewContent(content,THREE,current,{loadModel,createBuilderLand,createBuilderModel,createGeneratedAsset});
   if(destroyed||request!==generation||!root.isConnected){stop();return;}
   if(data.basketball)content.traverse(node=>{if(node.name==='ARENA_ROOF_CEILING'||node.name==='ARENA_EXTERIOR_WALL')node.visible=false;});
   const bounds=new THREE.Box3().setFromObject(content);if(bounds.isEmpty())throw Error('Empty world preview');const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3()),radius=Math.max(size.x,size.y,size.z,1),camera=new THREE.PerspectiveCamera(42,1,Math.max(.01,radius/1000),radius*30);camera.position.copy(center).add(new THREE.Vector3(radius*.9,radius*.75,radius*.9));if(data.basketball&&!data.base)camera.position.set(15,10,23);if(rangeLocation)camera.position.copy(rangeLocalToWorld(rangeLocation,{x:27,y:22,z:29}));
   renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.domElement.setAttribute('aria-label',data.name+' interactive 3D preview');renderer.domElement.setAttribute('role','img');viewport.append(renderer.domElement);poster.hidden=true;
   controls=new OrbitControls(camera,renderer.domElement);controls.target.copy(data.basketball&&!data.base?new THREE.Vector3(0,2,0):rangeLocation?rangeLocalToWorld(rangeLocation,{x:0,y:1,z:-2}):center);controls.enableDamping=true;controls.enablePan=false;controls.minDistance=radius*.2;controls.maxDistance=radius*4;controls.update();
   const resize=()=>{const width=Math.max(1,viewport.clientWidth),height=Math.max(1,viewport.clientHeight);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();};resize();resizeObserver=new ResizeObserver(resize);resizeObserver.observe(viewport);
   if(typeof IntersectionObserver!=='undefined'){visibilityObserver=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;});visibilityObserver.observe(root);}
   let last=0;const draw=time=>{if(request!==generation)return;if(!root.isConnected){stop();return;}frame=requestAnimationFrame(draw);if(paused||document.hidden||!visible||!viewport.clientWidth||root.closest('dialog')&&!root.closest('dialog').open||time-last<33)return;const delta=last?Math.min(.1,(time-last)/1000):0;last=time;controls.update();mixers.forEach(mixer=>mixer.update(delta));content.traverse(node=>{if(data.basketball)node.userData.updateBasketballEffects?.(time/1000);if(data.firingRange)node.userData.updateFiringRangeEffects?.(time);if(node.userData.arcadePark)animateArcadePark(node,time/1000);});renderer.render(scene,camera);};frame=requestAnimationFrame(draw);
   loading=false;button.disabled=false;setButton(true);previewStatus=(data.models.length>1?`${data.models.length} GLB models`:data.model?'GLB sample':'3D scene sample')+' · drag to orbit · pinch to zoom';status.textContent=previewStatus;
  }catch(error){if(request===generation){stop();status.textContent='3D preview unavailable · you can still enter this world';}}
 }
 button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();autoReady=false;autoObserver?.disconnect();if(auto3d)document.removeEventListener('visibilitychange',maybeStartAuto);void togglePreview();});
 if(auto3d){
  document.addEventListener('visibilitychange',maybeStartAuto);
  if(typeof IntersectionObserver!=='undefined'){autoObserver=new IntersectionObserver(([entry])=>{autoVisible=entry.isIntersecting;maybeStartAuto();});autoObserver.observe(root);}
  else Promise.resolve().then(()=>{autoVisible=true;maybeStartAuto();});
 }
 return result;
}
