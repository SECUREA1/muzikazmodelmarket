const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function safePreviewUrl(value){
 if(typeof value!=='string'||!value.trim())return '';
 const url=value.trim();if(/[\\\x00-\x1f]/.test(url))return '';
 if(!/^[a-z][a-z\d+.-]*:/i.test(url)&&!url.startsWith('//'))return url;
 if(/^(?:https?:\/\/|\/(?!\/)|\.\.?\/|public\/|uploads\/)/i.test(url)||/^data:image\/(?:png|jpeg|webp|gif|svg\+xml)[;,]/i.test(url))return url;
 return '';
}
export function previewDescriptor(record={}){
 const item=record.asset||record.model||record,config=item.function_data||{},name=item.name||item.itemName||record.name||'Market item';
 const modelUrl=item.modelUrl||item.glb_url;
 const descriptor={name,environment:item.environment,image:safePreviewUrl(item.thumbnailUrl||item.thumbnail_url||item.thumbnail||item.previewUrl||item.imageUrl||item.image_url||item.image||record.preview||(/\.(?:png|jpe?g|webp|gif|svg)(?:[?#]|$)/i.test(modelUrl||'')?modelUrl:'')),model:safePreviewUrl(/\.(?:png|jpe?g|webp|gif|svg)(?:[?#]|$)/i.test(modelUrl||'')?'':modelUrl),buildAssetId:item.buildAssetId||config.buildAssetId||config.modelId,materialId:item.materialId,toolId:item.toolId,category:item.builder_category||item.category||item.itemType||item.type||item.kind||'Item',icon:item.icon||'',color:/^#[\da-f]{6}$/i.test(item.color)?item.color:'#9cff69',entries:item.entries?.slice(0,8).map(entry=>({name:entry.name,quantity:entry.quantity||1}))};
 if(descriptor.model&&/brand_name|logo|placeholder/i.test(descriptor.image))descriptor.image='';
 return descriptor;
}
function illustration(item){
 const type=(item.toolId||item.category||'').toLowerCase(),color=item.color;
 const shape=/health|medkit|recovery/.test(type)?'<rect x="40" y="25" width="80" height="70" rx="12"/><path d="M70 45h20v12h12v18H90v12H70V75H58V57h12z" fill="#101e17"/>':/weapon|laser|blaster|rifle|pistol|taser|gun|igniter/.test(type)?'<path d="M24 40h86l23 10v18H88L74 94H56l5-26H24z"/><path d="M38 34h45v9H38z"/>':/land|world|map|terrain/.test(type)?'<path d="M15 82l33-54 25 32 22-24 50 46-65 27z"/><path d="M48 28l-6 29 21-10M95 36l-6 24 20-8" fill="none" stroke="#173a25" stroke-width="5"/>':/audio/.test(type)?'<path d="M35 48h24l32-25v74L59 72H35z"/><path d="M105 40q25 20 0 40" fill="none" stroke="currentColor" stroke-width="8"/>':'<path d="M80 20l47 25v49l-47 25-47-25V45z"/><path d="M33 45l47 25 47-25M80 70v49" fill="none" stroke="#173a25" stroke-width="5"/>';
 return `<svg viewBox="0 0 160 130" role="img" aria-label="${escape(item.name)} illustration" style="color:${color};fill:currentColor">${shape}</svg>`;
}
export function marketItemPreview(record){
 const item=previewDescriptor(record),data=escape(JSON.stringify(item));
 return `<figure class="market-item-preview" data-item-preview="${data}">${illustration(item)}<figcaption>${item.entries?'Bundle · '+item.entries.map(entry=>escape(entry.quantity+' × '+entry.name)).join(' · '):item.environment||item.model||item.buildAssetId||item.materialId?'Loading item preview…':item.image?'Item artwork':'Illustration · '+escape(item.category)}</figcaption></figure>`;
}
let queue=Promise.resolve(),modules;
const snapshots=new Map();
async function modelSnapshot(item){
 modules ||= Promise.all([import('../vendor/three/three.module.min.js'),import('../vendor/three/addons/loaders/GLTFLoader.js'),import('./builder-models-3d.js'),import('./building-materials.js')]);
 const [THREE,{GLTFLoader},{createBuilderModel},{createBuildingBlock}]=await modules;
 let root,renderer,loadTimer;
 try{
  if(item.environment){const env=item.environment;if(env.proceduralLand||env.builderScene){const {createBuilderLand}=await import('./environments/builder-land.js');root=createBuilderLand(env);}else{root=new THREE.Group();const loader=new GLTFLoader();const urls=env.modelUrls?.length?env.modelUrls:[env.modelUrl].filter(Boolean);if(!urls.length)throw Error('No world model');const models=await Promise.race([Promise.all(urls.map(url=>loader.loadAsync(url))),new Promise((_,reject)=>loadTimer=setTimeout(()=>reject(Error('Preview timed out')),12000))]);models.forEach(model=>root.add(model.scene));}root.rotation.set(env.rotation?.x||0,env.rotation?.y||0,env.rotation?.z||0);}
  else if(item.materialId)root=createBuildingBlock(THREE,item.materialId);else if(item.buildAssetId)root=createBuilderModel(item.buildAssetId);else if(item.model){const loader=new GLTFLoader();root=(await Promise.race([loader.loadAsync(item.model),new Promise((_,reject)=>loadTimer=setTimeout(()=>reject(Error('Preview timed out')),12000))])).scene;}
  if(!root)throw Error('No visual model');
  const scene=new THREE.Scene();scene.background=new THREE.Color('#10221b');scene.add(root);scene.add(new THREE.HemisphereLight(0xffffff,0x45624b,2.5));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(3,5,4);scene.add(light);
  root.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(root),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3()),span=Math.max(size.x,size.y,size.z)||1;
  const camera=new THREE.PerspectiveCamera(35,1.4,.001,span*100+100);camera.position.copy(center).add(new THREE.Vector3(1,.65,1.5).normalize().multiplyScalar(span*2.3));camera.lookAt(center);
  renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(420,300);renderer.setPixelRatio(1);renderer.render(scene,camera);return renderer.domElement.toDataURL('image/png');
 }finally{clearTimeout(loadTimer);renderer?.dispose();renderer?.forceContextLoss();root?.traverse(node=>{node.geometry?.dispose();for(const material of [].concat(node.material||[])){for(const value of Object.values(material))if(value?.isTexture&&!value.userData.sportsSurfaceShared)value.dispose();material.dispose();}});}
}
function displayImage(figure,url,label,onError){
 const img=new Image();let settled=false;const timer=setTimeout(()=>{if(!settled){settled=true;onError();}},8000);
 img.alt=label;img.decoding='async';img.onload=()=>{clearTimeout(timer);if(settled)return;settled=true;if(figure.isConnected){figure.querySelector('svg,img')?.replaceWith(img);figure.querySelector('figcaption').textContent=label;}};
 img.onerror=()=>{clearTimeout(timer);if(!settled){settled=true;onError();}};img.src=url;
}
function loadPreview(figure){
 if(figure.dataset.previewMounted)return;figure.dataset.previewMounted='true';const item=JSON.parse(figure.dataset.itemPreview);if(item.entries?.length&&!item.image)return;
 const model=()=>{if(!(item.environment||item.model||item.buildAssetId||item.materialId)){figure.querySelector('figcaption').textContent='Illustration · '+item.category;return;}
  const key=JSON.stringify([item.model,item.buildAssetId,item.materialId,item.environment]);let task=snapshots.get(key);if(!task){task=queue.then(()=>modelSnapshot(item));snapshots.set(key,task);queue=task.catch(()=>{});if(snapshots.size>150)snapshots.delete(snapshots.keys().next().value);}
  task.then(url=>{if(figure.isConnected)displayImage(figure,url,item.name+' · 3D preview',()=>{});}).catch(()=>{if(figure.isConnected)figure.querySelector('figcaption').textContent='3D preview unavailable · illustration shown';snapshots.delete(key);});
 };
 if(item.image)displayImage(figure,item.image,item.name+' · item artwork',model);else model();
}
let observer;const observed=new Set();
export function hydrateMarketPreviews(root){
 if(!document.querySelector('[data-market-preview-style]')){const style=document.createElement('style');style.dataset.marketPreviewStyle='';style.textContent='.user-market-card>.market-item-preview,.user-market-card>div{grid-column:1/-1;width:100%}.shared-market-row{display:grid;grid-template-columns:170px minmax(0,1fr) auto auto;align-items:center;gap:12px}.world-map-detail .market-item-preview{width:100%;min-height:210px}.world-map-detail .market-item-preview img,.world-map-detail .market-item-preview svg{height:180px}.market-item-preview{box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;flex:0 0 170px;width:170px;min-height:145px;margin:0;padding:8px;border:1px solid #42634b;border-radius:10px;background:#10221b;color:#d6f5d6;overflow:hidden}.market-item-preview img,.market-item-preview svg{display:block;width:100%;height:115px;object-fit:contain}.market-item-preview figcaption{width:100%;font:11px/1.4 system-ui;text-align:center;overflow-wrap:anywhere}.builder-card>.market-item-preview{width:100%;min-height:180px}.builder-card>.market-item-preview img,.builder-card>.market-item-preview svg{height:150px}.market-preview-dialog{max-width:calc(100vw - 24px);border:1px solid #9cff69;border-radius:12px;background:#10221b;color:#fff;padding:20px}.market-preview-dialog::backdrop{background:#000b}.market-preview-dialog .market-item-preview{width:min(540px,75vw)}.market-preview-dialog .market-item-preview img,.market-preview-dialog .market-item-preview svg{height:300px}.market-preview-dialog button{min-height:44px}@media(max-width:650px){.market-item-preview{width:100%;flex-basis:auto}.shared-market-row{grid-template-columns:minmax(0,1fr)}.user-market-card{flex-wrap:wrap}}';document.head.append(style);}
 if(typeof IntersectionObserver==='undefined'){root.querySelectorAll('[data-item-preview]').forEach(loadPreview);return;}
 observer ||= new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){observer.unobserve(entry.target);observed.delete(entry.target);loadPreview(entry.target);}}, {rootMargin:'100px'});
 for(const figure of observed)if(!figure.isConnected){observer.unobserve(figure);observed.delete(figure);}
 root.querySelectorAll('[data-item-preview]:not([data-preview-mounted])').forEach(figure=>{observed.add(figure);observer.observe(figure);});
}
export function openMarketPreview(item){const dialog=document.createElement('dialog');dialog.className='market-preview-dialog';dialog.innerHTML='<button type="button">Close preview ×</button><h2>'+escape(previewDescriptor(item).name)+'</h2><p>'+escape(item.description||item.asset?.description||'')+'</p>'+marketItemPreview(item);dialog.querySelector('button').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());(document.fullscreenElement||document.body).append(dialog);dialog.showModal();hydrateMarketPreviews(dialog);}
