export function previewModelUrl(value,base=globalThis.location?.href||'https://local.invalid/'){
 const url=new URL(String(value||''),base);
 if(!['http:','https:','blob:'].includes(url.protocol))throw Error('Choose a valid GLB or GLTF model to preview.');
 if(url.protocol!=='blob:'&&!/\.(glb|gltf)$/i.test(url.pathname))throw Error('This file needs a GLB or GLTF preview model.');
 return url.href;
}
export function cameraControlVisible(viewer){
 if(!viewer.hasAttribute('data-camera-preview-enabled')||!viewer.isConnected||viewer.closest('[hidden],.is-collapsed')||!viewer.getClientRects().length)return false;
 const dialog=viewer.closest('dialog');if(dialog&&!dialog.open)return false;
 try{previewModelUrl(viewer.getAttribute('src'));return true;}catch{return false;}
}
export function createCameraPreview({document,window,navigator}){
 let dialog,video,viewer,status,stream=null,generation=0,previousFocus;
 function stopCamera(){generation++;stream?.getTracks().forEach(track=>track.stop());stream=null;if(video){video.pause();video.srcObject=null;}}
 function close(){stopCamera();if(dialog?.open)dialog.close();viewer?.removeAttribute('src');previousFocus?.focus?.();}
 function ensure(){if(dialog)return;
  const style=document.createElement('style');style.textContent='.muzikaz-camera-preview{width:min(820px,calc(100vw - 24px));padding:0;border:1px solid #91df65;border-radius:20px;background:#09100e;color:#fff;max-height:94dvh;overflow:auto}.muzikaz-camera-preview::backdrop{background:#000c}.muzikaz-camera-preview header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px}.muzikaz-camera-preview h2{font:700 18px system-ui;margin:0}.muzikaz-camera-preview button{min-height:44px;padding:8px 16px;border-radius:12px;border:1px solid #91df65;background:#162719;color:#fff}.muzikaz-camera-preview .camera-stage{position:relative;height:min(65dvh,620px);min-height:260px;isolation:isolate;background:#18241f}.muzikaz-camera-preview video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.muzikaz-camera-preview model-viewer{position:absolute;inset:0;width:100%;height:100%;background:transparent;--poster-color:transparent}.muzikaz-camera-preview footer{padding:12px 16px;font:14px/1.5 system-ui}.muzikaz-camera-preview footer p{margin:4px 0 10px}';document.head.append(style);
  dialog=document.createElement('dialog');dialog.className='muzikaz-camera-preview';dialog.setAttribute('aria-label','Camera model preview');
  const header=document.createElement('header'),title=document.createElement('h2'),exit=document.createElement('button');title.textContent='Camera model preview';exit.type='button';exit.textContent='Close camera';exit.addEventListener('click',close);header.append(title,exit);
  const stage=document.createElement('div');stage.className='camera-stage';video=document.createElement('video');video.autoplay=true;video.playsInline=true;video.muted=true;viewer=document.createElement('model-viewer');viewer.setAttribute('camera-controls','');viewer.setAttribute('touch-action','pan-y');viewer.setAttribute('shadow-intensity','1');viewer.setAttribute('exposure','1');viewer.setAttribute('reveal','auto');viewer.setAttribute('loading','eager');stage.append(video,viewer);
  const footer=document.createElement('footer');status=document.createElement('p');status.setAttribute('role','status');const tip=document.createElement('p');tip.textContent='Drag to rotate and pinch to zoom. Camera overlay preview; placement is not world-tracked. Downloads are available only for owned items in your Backpack.';
  const retry=document.createElement('button');retry.type='button';retry.textContent='Enable / retry camera';retry.addEventListener('click',()=>startCamera());footer.append(status,tip,retry);dialog.append(header,stage,footer);document.body.append(dialog);
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});dialog.addEventListener('close',()=>{stopCamera();viewer.removeAttribute('src');});viewer.addEventListener('error',()=>{status.textContent='This model could not load. Choose another model or retry; no file was downloaded.';});window.addEventListener('pagehide',close);document.addEventListener('visibilitychange',()=>{if(document.hidden){stopCamera();if(dialog.open)status.textContent='Camera paused. Tap Enable / retry camera to resume.';}});
 }
 async function startCamera(){stopCamera();const token=generation;
  if(!navigator.mediaDevices?.getUserMedia){status.textContent='Camera access requires HTTPS and a supported browser. The 3D preview remains available.';return;}
  status.textContent='Allow camera access to preview this model in your space…';
  try{const captured=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}});if(token!==generation||!dialog.open){captured.getTracks().forEach(track=>track.stop());return;}stream=captured;video.srcObject=captured;await video.play();if(token===generation)status.textContent='Camera live · rotate and resize the model over your surroundings.';}catch(error){if(token===generation){stopCamera();status.textContent=error.name==='NotAllowedError'?'Camera permission was declined. Allow it in browser settings and tap Enable / retry camera.':'Camera unavailable. The 3D model remains available; tap Enable / retry camera to try again.';}}
 }
 async function open({modelUrl,name='Selected model'}={}){ensure();stopCamera();previousFocus=document.activeElement;if(!dialog.open)dialog.showModal();dialog.querySelector('h2').textContent=name;viewer.setAttribute('alt',name);try{viewer.setAttribute('src',previewModelUrl(modelUrl));}catch(error){viewer.removeAttribute('src');status.textContent=error.message;return;}await startCamera();}
 return {open,close};
}
if(typeof window!=='undefined'&&typeof document!=='undefined'){
 const camera=createCameraPreview({document,window,navigator});window.MuzikazAR=camera;
 const controls=new Map(),sources=new WeakMap();
 function syncControls(){
  for(const [viewer,button]of controls)if(!viewer.isConnected||!cameraControlVisible(viewer)){button.remove();controls.delete(viewer);}
  for(const viewer of document.querySelectorAll('model-viewer')){
   // Native phone viewers may save an unowned source file as their fallback.
   // Use our camera preview controls on every browser instead.
   viewer.removeAttribute('ar');viewer.removeAttribute('ios-src');
   if(controls.has(viewer)||!cameraControlVisible(viewer)||viewer.closest('.muzikaz-camera-preview,button'))continue;
   const button=document.createElement('button');button.type='button';button.className='ar-button';button.dataset.cameraPreview='';button.textContent='Open camera preview';button.setAttribute('aria-label','Open camera preview: '+(viewer.getAttribute('alt')||'selected model'));viewer.insertAdjacentElement('afterend',button);controls.set(viewer,button);sources.set(button,viewer);
  }
 }
 syncControls();let scheduled=false;
 const hasViewer=node=>node?.nodeType===1&&(node.localName==='model-viewer'||node.childElementCount&&!!node.querySelector('model-viewer'));
 const scheduleControls=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;syncControls();});};
 new MutationObserver(records=>{if(records.some(record=>record.type==='attributes'?hasViewer(record.target):[...record.addedNodes,...record.removedNodes].some(hasViewer)))scheduleControls();}).observe(document.body||document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['ar','ios-src','src','hidden','open','class','style','data-camera-preview-enabled']});
 window.addEventListener('resize',scheduleControls);
 document.addEventListener('click',event=>{
  const button=event.composedPath().find(node=>node?.matches?.('[slot="ar-button"],[data-ar-launch],[data-camera-preview]'));if(!button)return;
  const viewer=sources.get(button)||button.closest('model-viewer')||button.closest('article')?.querySelector('model-viewer');if(!viewer)return;
  event.preventDefault();event.stopImmediatePropagation();camera.open({modelUrl:viewer.getAttribute('src'),name:viewer.getAttribute('alt')||'Selected model'});
 },true);
}
