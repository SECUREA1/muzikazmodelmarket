// One interactive product preview at a time. Graphics and model factories load
// only after an explicit preview action; opening a product page requests neither
// a camera stream nor an immersive session.
let activePreview;
export function openProductPreview(record,options){
 activePreview ||= createProductPreview({document:globalThis.document,window:globalThis.window,navigator:globalThis.navigator});
 return activePreview.open(record,options);
}
export function closeProductPreview(options){return activePreview?.close(options);}
export function getProductPreviewState(){return activePreview?.getState()||{mode:'closed',arSupported:null};}

async function loadDefaultModel(record,options){
 const {previewDescriptor,loadPreviewModel}=await import('./market-item-preview.js');
 return loadPreviewModel(previewDescriptor(record),options);
}

export async function createProductPreviewRuntime({canvas,stage,window,onXRState,onXREnd}){
 const [T,{OrbitControls},{disposeModelResources},{setGroundLandscapeProjectionScale}]=await Promise.all([
  import('../vendor/three/three.module.min.js'),import('../vendor/three/addons/controls/OrbitControls.js'),import('./game-graphics-resources.js'),import('./ground-landscape-design.js'),
 ]);
 const renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:false,powerPreference:'low-power'});
 renderer.setPixelRatio(Math.min(Number(window.devicePixelRatio)||1,1.5));renderer.outputColorSpace=T.SRGBColorSpace;
 renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1;renderer.xr.enabled=true;renderer.xr.setReferenceSpaceType('local');
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(42,1,.01,100);camera.position.set(.85,.6,1.05);
 scene.add(new T.HemisphereLight(0xf3f9ff,0x586354,2.3));const sun=new T.DirectionalLight(0xffedd8,2.7);sun.position.set(3,5,4);scene.add(sun);
 const placement=new T.Group(),fit=new T.Group();placement.add(fit);scene.add(placement);
 const reticle=new T.Mesh(new T.RingGeometry(.065,.085,32).rotateX(-Math.PI/2),new T.MeshBasicMaterial({color:0xb9ff88,side:T.DoubleSide}));
 reticle.matrixAutoUpdate=false;reticle.visible=false;scene.add(reticle);
 const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.minDistance=.15;controls.maxDistance=8;
 let loaded=null,mixer=null,disposed=false,paused=false,session=null,hitSource=null,lastTime=0,lastDraw=0,savedCamera=null;
 const disposeLoaded=value=>disposeModelResources(value?.root);
 const resize=()=>{if(disposed||renderer.xr.isPresenting)return;const rect=stage.getBoundingClientRect();const w=Math.max(1,rect.width||640),h=Math.max(1,rect.height||440);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();};
 const resizeObserver=window.ResizeObserver?new window.ResizeObserver(resize):null;resizeObserver?.observe(stage);window.addEventListener('resize',resize);resize();
 function draw(time,frame){
  if(disposed||paused)return;
  if(!frame&&time-lastDraw<30)return;lastDraw=time;
  if(frame&&session&&hitSource){const reference=renderer.xr.getReferenceSpace(),hit=reference&&frame.getHitTestResults(hitSource)[0],pose=hit?.getPose(reference);reticle.visible=Boolean(pose);if(pose)reticle.matrix.fromArray(pose.transform.matrix);}
  const delta=lastTime?Math.min(.1,(time-lastTime)/1000):0;lastTime=time;mixer?.update(delta);if(!session)controls.update();renderer.render(scene,camera);
 }
 const resume=()=>{if(disposed)return;paused=false;lastTime=0;renderer.setAnimationLoop(draw);};
 const pause=()=>{paused=true;renderer.setAnimationLoop(null);};
 function setViewMode(mode){scene.background=mode==='3d'?new T.Color(0x17242b):null;renderer.setClearColor(0x17242b,mode==='3d'?1:0);}
 function present(value){
  if(loaded)disposeLoaded(loaded);fit.clear();loaded=value;fit.add(value.root);value.root.updateMatrixWorld(true);
  const bounds=new T.Box3().setFromObject(value.root),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3()),span=Math.max(size.x,size.y,size.z);
  if(bounds.isEmpty()||!Number.isFinite(span)||span<=0)throw Error('This item has no visible model to preview.');
  fit.position.set(-center.x,-bounds.min.y,-center.z);const scale=.5/span;fit.position.multiplyScalar(scale);fit.scale.setScalar(scale);fit.userData.basePreviewScale=scale;setGroundLandscapeProjectionScale(value.root,scale);
  controls.target.set(0,size.y*scale*.45,0);camera.position.set(.85,.6,1.05);controls.update();
  if(value.animations?.length){mixer=new T.AnimationMixer(value.root);for(const clip of value.animations)mixer.clipAction(clip).play();}else mixer=null;
  placement.visible=true;placement.position.set(0,0,0);placement.quaternion.identity();placement.scale.setScalar(1);setViewMode('3d');resume();
 }
 function setScale(value){const previous=fit.scale.x,next=(fit.userData.basePreviewScale||1)*value;if(previous)fit.position.multiplyScalar(next/previous);fit.scale.setScalar(next);}
 function place(){if(!session||!reticle.visible)return false;reticle.matrix.decompose(placement.position,placement.quaternion,placement.scale);placement.visible=true;onXRState?.('ar-placed');return true;}
 const select=()=>place();
 async function startXR(value){
  session=value;savedCamera={position:camera.position.clone(),quaternion:camera.quaternion.clone(),target:controls.target.clone()};controls.enabled=false;placement.visible=false;setViewMode('ar');
  value.addEventListener('select',select);value.addEventListener('end',ended,{once:true});
  await renderer.xr.setSession(value);
  if(disposed||session!==value)return;
  const viewerSpace=await value.requestReferenceSpace('viewer');
  if(disposed||session!==value)return;
  const source=await value.requestHitTestSource({space:viewerSpace});
  if(disposed||session!==value){source?.cancel();return;}
  hitSource=source;resume();onXRState?.('ar-scanning');
 }
 function ended(){
  const old=session;session=null;hitSource?.cancel();hitSource=null;old?.removeEventListener('select',select);reticle.visible=false;controls.enabled=true;
  placement.visible=true;placement.position.set(0,0,0);placement.quaternion.identity();placement.scale.setScalar(1);if(savedCamera){camera.position.copy(savedCamera.position);camera.quaternion.copy(savedCamera.quaternion);controls.target.copy(savedCamera.target);savedCamera=null;controls.update();}setViewMode('3d');if(!disposed){resume();Promise.resolve().then(resize);}onXREnd?.();
 }
 function dispose(){
  if(disposed)return;disposed=true;pause();resizeObserver?.disconnect();window.removeEventListener('resize',resize);hitSource?.cancel();hitSource=null;
  session?.removeEventListener('select',select);session?.removeEventListener('end',ended);mixer?.stopAllAction();if(loaded){mixer?.uncacheRoot(loaded.root);disposeLoaded(loaded);}loaded=null;
  controls.dispose();reticle.geometry.dispose();reticle.material.dispose();renderer.dispose();renderer.forceContextLoss();
 }
 return {renderer,present,setScale,setViewMode,startXR,place,pause,resume,dispose,disposeLoaded,getPresentation:()=>loaded?.root?.userData?.previewPresentation||'actual-model'};
}

export function createProductPreview({document,window,navigator,loadModel=loadDefaultModel,createRuntime=createProductPreviewRuntime}={}){
 let dialog,title,stage,canvas,video,status,kindLabel,arButton,cameraButton,backButton,placeButton,sizeInput,runtime=null,stream=null,xrSession=null,abort=null,generation=0,cameraGeneration=0,previousFocus=null,capability;
 let state={mode:'closed',arSupported:null,presentation:null,name:'',id:null,recordId:null,owner:null};
 const getState=()=>({...state});
 const current=token=>token===generation&&state.mode!=='closed';
 function message(value){if(status)status.textContent=value;}
 function setMode(mode){state.mode=mode;if(dialog)dialog.dataset.previewMode=mode;if(backButton)backButton.hidden=!['camera-preview','ar-starting','ar-scanning','ar-placed'].includes(mode);if(placeButton)placeButton.hidden=!['ar-scanning','ar-placed'].includes(mode);}
 function stopCamera(){cameraGeneration++;stream?.getTracks().forEach(track=>track.stop());stream=null;if(video){video.pause();video.srcObject=null;video.hidden=true;}}
 async function releaseRuntime(){
  const old=runtime,session=xrSession;runtime=null;xrSession=null;old?.pause();
  if(session)try{await session.end();}catch{}
  old?.dispose();
 }
 function ensure(){
  if(dialog)return;
  const style=document.createElement('style');style.textContent='.product-preview-dialog{box-sizing:border-box;width:min(860px,calc(100vw - 24px));padding:0;max-height:94dvh;overflow:auto;border:1px solid #86cfa7;border-radius:18px;background:#101b20;color:#effaf5;font:14px/1.5 system-ui}.product-preview-dialog::backdrop{background:#000b}.product-preview-dialog header,.product-preview-dialog footer{padding:12px 16px}.product-preview-dialog header{display:flex;align-items:center;justify-content:space-between;gap:12px}.product-preview-dialog h2{margin:0;font-size:18px}.product-preview-stage{position:relative;height:min(58dvh,560px);min-height:250px;background:#17242b;overflow:hidden;isolation:isolate}.product-preview-stage canvas,.product-preview-stage video{position:absolute;inset:0;width:100%;height:100%;display:block}.product-preview-stage video{object-fit:cover}.product-preview-stage video[hidden]{display:none}.product-preview-stage canvas{touch-action:none}.product-preview-actions{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.product-preview-dialog button{min-height:44px;border:1px solid #85d4a8;border-radius:10px;padding:8px 14px;background:#203c30;color:#effaf5;font:inherit;cursor:pointer}.product-preview-dialog button:disabled{opacity:.5;cursor:default}.product-preview-dialog button[hidden]{display:none}.product-preview-dialog label{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.product-preview-dialog input{max-width:100%}.product-preview-dialog p{margin:6px 0}.product-preview-dialog [data-preview-presentation]{color:#b2d6c6;font-size:12px}';document.head.append(style);
  dialog=document.createElement('dialog');dialog.className='product-preview-dialog';dialog.setAttribute('aria-label','3D product and AR preview');dialog.setAttribute('data-product-preview','');dialog.setAttribute('data-render-gameplay','suspend');
  const header=document.createElement('header');title=document.createElement('h2');const exit=document.createElement('button');exit.type='button';exit.textContent='Close preview';exit.addEventListener('click',()=>close());header.append(title,exit);
  stage=document.createElement('div');stage.className='product-preview-stage';video=document.createElement('video');video.autoplay=true;video.muted=true;video.playsInline=true;video.hidden=true;canvas=document.createElement('canvas');canvas.setAttribute('aria-label','Interactive 3D product');stage.append(video,canvas);
  const footer=document.createElement('footer');status=document.createElement('p');status.setAttribute('role','status');kindLabel=document.createElement('p');kindLabel.setAttribute('data-preview-presentation','');
  const actions=document.createElement('div');actions.className='product-preview-actions';
  function action(label,listener){const button=document.createElement('button');button.type='button';button.textContent=label;button.addEventListener('click',listener);actions.append(button);return button;}
  arButton=action('Place in AR',()=>startAR());cameraButton=action('Open camera preview',()=>startCamera());backButton=action('Back to 3D',()=>backTo3D());backButton.hidden=true;placeButton=action('Place on detected surface',()=>{if(runtime?.place())message('Placed on the detected surface. Scan and tap to move it.');else message('Move your device slowly until a surface marker appears.');});placeButton.hidden=true;
  const sizeLabel=document.createElement('label');sizeLabel.textContent='Preview size';sizeInput=document.createElement('input');sizeInput.type='range';sizeInput.min='.25';sizeInput.max='4';sizeInput.step='.05';sizeInput.value='1';sizeInput.setAttribute('aria-label','Product preview size');sizeInput.addEventListener('input',()=>runtime?.setScale(Number(sizeInput.value)));sizeLabel.append(sizeInput);
  footer.append(status,kindLabel,actions,sizeLabel);dialog.append(header,stage,footer);document.body.append(dialog);
  dialog.addEventListener('cancel',event=>{event.preventDefault();void close();});dialog.addEventListener('close',()=>{if(state.mode!=='closed')void close();});
  dialog.addEventListener('beforexrselect',event=>{if(event.target.closest?.('button,input,label'))event.preventDefault();});
  window.addEventListener('pagehide',()=>void close());document.addEventListener('visibilitychange',()=>{if(document.hidden&&!xrSession&&state.mode!=='closed'){stopCamera();runtime?.pause();setMode('3d');message('Preview paused. Return to this tab to resume.');}else if(!document.hidden&&state.mode!=='closed')runtime?.resume();});
 }
 function supportedAR(){
  capability ||= (async()=>{try{return Boolean(navigator.xr?.isSessionSupported&&await navigator.xr.isSessionSupported('immersive-ar'));}catch{return false;}})();return capability;
 }
 async function backTo3D(){
  stopCamera();const session=xrSession;xrSession=null;if(session)try{await session.end();}catch{}
  if(state.mode==='closed')return;runtime?.setViewMode('3d');setMode('3d');message(state.presentation==='product-card'?'Product artwork preview. Drag to rotate and use Preview size to resize.':'3D preview. Drag to rotate and scroll or pinch to zoom.');
 }
 async function startCamera(){
  if(!runtime||state.mode==='closed')return;const token=generation;await backTo3D();if(!current(token))return;stopCamera();const cameraToken=cameraGeneration;
  if(!navigator.mediaDevices?.getUserMedia){message('Camera preview requires HTTPS and camera access in a supported browser. The 3D preview is available.');return;}
  message('Allow camera access for an overlay preview. This preview is not world-tracked.');
  try{
   const captured=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}});
   if(!current(token)||cameraToken!==cameraGeneration){captured.getTracks().forEach(track=>track.stop());return;}
   stream=captured;video.srcObject=captured;video.hidden=false;await video.play();
   if(!current(token)||cameraToken!==cameraGeneration)return;runtime.setViewMode('camera');setMode('camera-preview');message('Camera overlay preview · not world-tracked. Drag to rotate and change Preview size to resize.');
  }catch(error){if(current(token)&&cameraToken===cameraGeneration){stopCamera();setMode('3d');runtime?.setViewMode('3d');message(error.name==='NotAllowedError'?'Camera permission was declined. The 3D preview remains available.':'Camera unavailable. The 3D preview remains available.');}}
 }
 async function startAR(){
  if(!runtime||state.mode==='closed'||state.mode==='ar-starting'||xrSession)return;const token=generation;
  if(!(await supportedAR())){if(!current(token))return;state.arSupported=false;await startCamera();return;}
  if(!current(token)||state.mode==='ar-starting'||xrSession)return;
  // Some browsers expire the initiating gesture while a large model loads.
  // Keep the explicit AR control ready instead of requesting a second permission
  // or claiming a session started when that gesture is no longer active.
  if(navigator.userActivation&&!navigator.userActivation.isActive){message('Ready for AR. Tap Place in AR to scan a surface.');return;}
  stopCamera();const requestToken=cameraGeneration;setMode('ar-starting');message('Starting surface-tracked AR…');let session;
  try{
   session=await navigator.xr.requestSession('immersive-ar',{requiredFeatures:['hit-test'],optionalFeatures:['local-floor','dom-overlay'],domOverlay:{root:dialog}});
   if(!current(token)||requestToken!==cameraGeneration){await session.end();return;}
   xrSession=session;await runtime.startXR(session);
  }catch(error){
   if(session)try{await session.end();}catch{}
   if(!current(token)||requestToken!==cameraGeneration)return;xrSession=null;runtime?.setViewMode('3d');setMode('3d');message(error.name==='NotAllowedError'?'AR permission was declined or the session was cancelled. Use 3D or choose Camera preview.':'Surface-tracked AR could not start. Use 3D or choose Camera preview.');
  }
 }
 async function open(record,{mode='3d',owner=null}={}){
  ensure();const token=++generation;abort?.abort();stopCamera();if(!dialog.open)previousFocus=document.activeElement;setMode('loading');state.presentation=null;state.owner=owner;state.id=state.recordId=record?.id||record?.asset?.id||record?.model?.id||record?.sku||record?.buildAssetId||null;state.name=record?.name||record?.itemName||record?.asset?.name||record?.model?.name||'Product preview';title.textContent=state.name;kindLabel.textContent='';message('Loading product preview…');arButton.disabled=cameraButton.disabled=sizeInput.disabled=true;sizeInput.value='1';
  if(!dialog.open)dialog.showModal();await releaseRuntime();if(!current(token))return getState();
  canvas=document.createElement('canvas');canvas.setAttribute('aria-label','Interactive 3D product');stage.replaceChildren(video,canvas);
  const cancellation=new AbortController();abort=cancellation;let value,candidate;
  try{
   candidate=await createRuntime({canvas,stage,window,onXRState:next=>{if(!current(token))return;setMode(next);message(next==='ar-placed'?'Placed on the detected surface. Scan and tap to move it.':'Move your device slowly to detect a surface, then tap its marker to place the preview.');},onXREnd:()=>{if(!current(token))return;xrSession=null;setMode('3d');message('AR ended. The 3D preview is available.');}});
   if(!current(token)){candidate.dispose();return getState();}runtime=candidate;
   value=await loadModel(record,{renderer:candidate.renderer,signal:cancellation.signal});
   if(!current(token)){candidate.disposeLoaded(value);return getState();}
   const ready=value;value=null;candidate.present(ready);state.presentation=ready.root?.userData?.previewPresentation||record?.previewPresentation||candidate.presentation||'actual-model';
   // The loader marks 2D artwork cards explicitly so they cannot masquerade as
   // an authored model in either the 3D dialog or a camera/XR view.
   state.presentation=candidate.getPresentation?.()||state.presentation;
   setMode('3d');cameraButton.disabled=sizeInput.disabled=false;
   kindLabel.textContent=state.presentation==='product-card'?'Product artwork · tabletop preview':'3D model · tabletop preview';
   message(state.presentation==='product-card'?'This item has no 3D model. Showing its product artwork.':'3D preview. Drag to rotate and scroll or pinch to zoom.');
   const supported=await supportedAR();if(!current(token))return getState();state.arSupported=supported;arButton.disabled=!supported;arButton.textContent=supported?'Place in AR':'AR unavailable on this device';
   if(mode==='camera')await startCamera();else if(mode==='ar')await startAR();
  }catch(error){
   if(value)candidate?.disposeLoaded(value);if(!current(token))return getState();candidate?.dispose();if(runtime===candidate)runtime=null;setMode('error');arButton.disabled=cameraButton.disabled=sizeInput.disabled=true;message(error.name==='AbortError'?'Product preview cancelled.':error.message||'This product preview is unavailable.');
  }
  return getState();
 }
 async function close({owner}={}){
  if(owner!==undefined&&owner!==state.owner)return getState();
  generation++;abort?.abort();abort=null;stopCamera();setMode('closed');if(dialog?.open)dialog.close();await releaseRuntime();previousFocus?.focus?.();
 }
 return {open,close,startCamera,startAR,backTo3D,getState};
}
