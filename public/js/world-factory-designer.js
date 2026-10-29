import {drawingCollisionMask} from './placed-item-collision.js';
import {signalInventoryChange} from './shared-game-inventory.js';

const materials=['original','metal','wood','plastic','glass','neon','stone','matte'];
const behaviors=['decor','pickup','talk','quest','heal','seat','switch','door'];
const clamp=(value,fallback,min,max)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Number(value))):fallback;
const safeModelUrl=value=>typeof value==='string'&&!/[\\\x00-\x1f]/.test(value)&&!/^\/\//.test(value)&&(!/^[a-z][a-z\d+.-]*:/i.test(value)||/^https?:\/\//i.test(value))&&/\.(?:glb|gltf)(?:[?#]|$)/i.test(value);

/** Only server-owned models are offered; the save endpoint rechecks ownership. */
export function factoryDesignerModels(items=[]){
 const seen=new Set();
 return items.filter(item=>{
  if(!item||!item.id||item.earnedOnly||item.tradable===false||item.shippingSupplyId||!safeModelUrl(item.modelUrl)||seen.has(item.modelUrl))return false;
  seen.add(item.modelUrl);return true;
 });
}
export function factoryDesignerConfiguration(values={},glb=false){
 return {material:materials.includes(values.material)?values.material:'original',color:/^#[a-f\d]{6}$/i.test(values.color||'')?values.color:'#89dac6',colorBlend:clamp(values.colorBlend,35,0,100),scale:glb?clamp(values.scale,1,.1,5):1,orientation:clamp(values.orientation,0,-360,360),depth:clamp(values.depth,28,1,100),bevel:clamp(values.bevel,6,0,30),behavior:behaviors.includes(values.behavior)?values.behavior:'decor',extruded:true,groundAligned:true,tilt:0,yaw:0,depthMode:'uniform',mirrored:false};
}

async function createLivePreview(host){
 const [THREE,{OrbitControls},{GLTFLoader},{extrudeArtwork},{prepareAuthoredBuilderModel}]=await Promise.all([import('../vendor/three/three.module.min.js'),import('../vendor/three/addons/controls/OrbitControls.js'),import('../vendor/three/addons/loaders/GLTFLoader.js'),import('./drawn-item-3d.js'),import('./authored-builder-models.js')]);
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));host.append(renderer.domElement);
 renderer.domElement.setAttribute('aria-label','Live custom-item 3D preview. Drag to orbit, scroll or pinch to zoom.');renderer.domElement.setAttribute('role','img');
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,.01,1000),controls=new OrbitControls(camera,renderer.domElement);
 controls.enablePan=false;scene.add(new THREE.HemisphereLight(0xffffff,0x35415b,2));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(2,4,4);scene.add(light);
 let root=null,loadedUrl='',loadingUrl='',modelTask=null,generation=0,disposed=false,settings={},framed=false;
 const render=()=>{if(!disposed)renderer.render(scene,camera);};
 const release=model=>model?.traverse(node=>{node.geometry?.dispose();for(const material of [].concat(node.material||[])){for(const value of Object.values(material))if(value?.isTexture)value.dispose();material.dispose();}});
 function replace(model){if(root){scene.remove(root);release(root);}root=model;scene.add(root);}
 function frame(){if(!root)return;root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(root),center=box.getCenter(new THREE.Vector3()),span=Math.max(...box.getSize(new THREE.Vector3()).toArray(),.1);camera.near=Math.max(.001,span/1000);camera.far=Math.max(100,span*50);camera.updateProjectionMatrix();camera.position.copy(center).add(new THREE.Vector3(1,.6,1.5).normalize().multiplyScalar(span*2.4));controls.target.copy(center);controls.minDistance=span*.6;controls.maxDistance=span*7;controls.update();render();framed=true;}
 function configure(){if(root){prepareAuthoredBuilderModel(root,{configuration:settings});render();}}
 controls.addEventListener('change',render);
 const observer=new ResizeObserver(()=>{if(disposed)return;const width=host.clientWidth,height=host.clientHeight;if(!width||!height)return;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();render();});observer.observe(host);
 camera.position.set(0,1.3,3.3);controls.target.set(0,.75,0);controls.update();
 return {
  async update(artwork,model,configuration){
   settings=configuration;
   if(!model){generation++;loadingUrl='';modelTask=null;loadedUrl='';replace(extrudeArtwork(THREE,artwork,{...settings,orientation:0}));root.rotation.z=(Number(settings.orientation)||0)*Math.PI/180;if(!framed)frame();else render();return;}
   if(loadedUrl===model.modelUrl&&root){configure();return;}
   if(loadingUrl===model.modelUrl&&modelTask)return modelTask;
   const request=++generation;loadingUrl=model.modelUrl;
   modelTask=(async()=>{try{const gltf=await new GLTFLoader().loadAsync(model.modelUrl);if(disposed||request!==generation){release(gltf.scene);return;}loadedUrl=model.modelUrl;replace(prepareAuthoredBuilderModel(gltf.scene,{configuration:settings}));frame();}finally{if(request===generation){loadingUrl='';modelTask=null;}}})();return modelTask;
  },
  reset:frame,
  dispose(){if(disposed)return;disposed=true;generation++;observer.disconnect();controls.removeEventListener('change',render);controls.dispose();release(root);root=null;renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();}
 };
}

/** A factory prototype is separate from bulk output. onSaved registers the
 * saved server blueprint and selects it for the normal four-stage order flow. */
export function mountWorldFactoryDesigner(root,{inventory,onSaved=async()=>{},announce=()=>{}}={}){
 if(!root||!inventory)throw Error('A factory designer root and inventory are required.');
 if(!document.querySelector('[data-world-factory-designer-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('../css/world-factory-designer.css',import.meta.url).href;link.dataset.worldFactoryDesignerStyle='';document.head.append(link);}
 root.classList.add('world-factory-designer');
 root.innerHTML=`<details data-factory-workshop><summary><span>Custom development workshop</span><small>Draw a part or refine an owned GLB · live 3D preview</small></summary><div class="factory-designer-body"><p>Create a saved prototype, then order a batch for your deed or world inventory. Bulk units still pass through four production stages and a verified sea delivery.</p><div class="factory-designer-grid"><section><label>Design source<select data-design-source><option value="drawing">New drawing</option></select></label><button type="button" data-design-refresh>Refresh owned models</button><p data-design-owned class="factory-designer-muted">Open the workshop to load your owned models.</p><div data-design-drawing><div class="factory-designer-tools"><button type="button" data-design-tool="draw" aria-pressed="true">Draw</button><button type="button" data-design-tool="erase" aria-pressed="false">Erase</button><button type="button" data-design-undo>Undo</button><button type="button" data-design-clear>Clear</button></div><label>Brush size<input data-design-brush type="range" min="2" max="48" value="18"></label><canvas data-design-canvas width="512" height="384" aria-label="Draw your custom item with a mouse, pen or touch. Keyboard users can add a starter shape with the buttons below."></canvas><div class="factory-designer-tools" aria-label="Starter shapes"><button type="button" data-design-shape="crate">Add crate</button><button type="button" data-design-shape="star">Add star</button><button type="button" data-design-shape="heart">Add heart</button></div></div><label>Item name<input data-design-name maxlength="140" value="My factory prototype" autocomplete="off"></label><div class="factory-designer-fields"><label>Color<input data-design-color type="color" value="#89dac6"></label><label>Finish<select data-design-material>${materials.map(material=>'<option value="'+material+'">'+material[0].toUpperCase()+material.slice(1)+'</option>').join('')}</select></label><label>Color blend <output data-design-blend-output>35%</output><input data-design-blend type="range" min="0" max="100" value="35"></label><label>Behavior<select data-design-behavior>${behaviors.map(behavior=>'<option value="'+behavior+'">'+behavior+'</option>').join('')}</select></label><label data-design-depth-control>Depth (mm)<input data-design-depth type="number" min="1" max="100" value="28"></label><label data-design-scale-control hidden>Scale<input data-design-scale type="number" min="0.1" max="5" step="0.1" value="1"></label><label>Rotation (degrees)<input data-design-orientation type="number" min="-360" max="360" value="0"></label></div></section><section><div class="factory-designer-preview" data-design-preview></div><p class="factory-designer-muted">Live 3D preview · drag to orbit, pinch or scroll to zoom.</p><button type="button" data-design-reset>Reset preview</button><p class="factory-designer-note">Saving records your prototype. Production uses the server’s MZK quote; no bulk stock reaches stores before shipping.</p><button class="factory-designer-save" type="button" data-design-save>Save blueprint & select for production</button><p data-design-status role="status" aria-live="polite">Draw a silhouette, add a starter shape, or choose an owned model.</p></section></div></div></details>`;
 const $=selector=>root.querySelector(selector),canvas=$('[data-design-canvas]'),context=canvas.getContext('2d',{willReadFrequently:true}),details=$('[data-factory-workshop]');
 let disposed=false,busy=false,tool='draw',paths=[],stroke=null,models=[],loading=null,preview=null,previewTask=null,previewFrame=0,previewGeneration=0,revision=0,pending=null,savedPrototype=null;
 const listeners=[];
 const listen=(node,event,handler)=>{node.addEventListener(event,handler);listeners.push(()=>node.removeEventListener(event,handler));};
 const status=message=>{if(disposed)return;$('[data-design-status]').textContent=message;announce(message);};
 const base=()=>models.find(item=>String(item.id)===$('[data-design-source]').value)||null;
 const settings=()=>factoryDesignerConfiguration({material:$('[data-design-material]').value,color:$('[data-design-color]').value,colorBlend:$('[data-design-blend]').value,scale:$('[data-design-scale]').value,orientation:$('[data-design-orientation]').value,depth:$('[data-design-depth]').value,bevel:6,behavior:$('[data-design-behavior]').value},!!base());
 function changed(){revision++;pending=null;savedPrototype=null;$('[data-design-save]').textContent='Save blueprint & select for production';}
 function controls(){for(const input of root.querySelectorAll('input,select,button'))input.disabled=busy;$('[data-design-save]').textContent=savedPrototype?'Retry blueprint registration':'Save blueprint & select for production';}
 async function updatePreview(){
  if(disposed)return;$('[data-design-preview]').dataset.ready='false';
  cancelAnimationFrame(previewFrame);previewFrame=requestAnimationFrame(async()=>{
   if(disposed||!details.open)return;
   const request=++previewGeneration;
   try{previewTask ||= createLivePreview($('[data-design-preview]'));const view=await previewTask;if(disposed){view.dispose();return;}preview=view;await view.update(canvas,base(),settings());if(request===previewGeneration)$('[data-design-preview]').dataset.ready='true';}
   catch(error){if(!disposed&&request===previewGeneration){$('[data-design-preview]').dataset.ready='false';status('3D preview unavailable. Your saved artwork or owned model can still be produced.');}}
  });
 }
 function redraw(){
  context.clearRect(0,0,canvas.width,canvas.height);context.lineCap='round';context.lineJoin='round';
  for(const path of paths){context.globalCompositeOperation=path.tool==='erase'?'destination-out':'source-over';context.fillStyle=context.strokeStyle=path.color;context.lineWidth=path.size;context.beginPath();if(path.shape==='crate'){context.roundRect(136,72,240,240,18);context.fill();context.globalCompositeOperation='destination-out';context.fillRect(164,112,184,12);context.fillRect(164,256,184,12);}else if(path.shape==='heart'){context.moveTo(256,310);context.bezierCurveTo(70,190,118,28,256,128);context.bezierCurveTo(394,28,442,190,256,310);context.fill();}else if(path.shape==='star'){for(let index=0;index<10;index++){const angle=index*Math.PI/5-Math.PI/2,radius=index%2?63:145,x=256+Math.cos(angle)*radius,y=192+Math.sin(angle)*radius;index?context.lineTo(x,y):context.moveTo(x,y);}context.closePath();context.fill();}else{const points=path.points;if(points.length===1){context.arc(points[0].x,points[0].y,path.size/2,0,Math.PI*2);context.fill();}else{context.moveTo(points[0].x,points[0].y);for(const point of points.slice(1))context.lineTo(point.x,point.y);context.stroke();}}}
  context.globalCompositeOperation='source-over';void updatePreview();
 }
 const point=event=>{const rect=canvas.getBoundingClientRect();return{x:(event.clientX-rect.left)*canvas.width/rect.width,y:(event.clientY-rect.top)*canvas.height/rect.height};};
 listen(canvas,'pointerdown',event=>{if(busy)return;event.preventDefault();changed();canvas.setPointerCapture(event.pointerId);stroke={tool,color:$('[data-design-color]').value,size:Number($('[data-design-brush]').value),points:[point(event)]};paths.push(stroke);redraw();});
 listen(canvas,'pointermove',event=>{if(!stroke||busy)return;stroke.points.push(point(event));redraw();});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])listen(canvas,event,()=>{stroke=null;});
 listen(root,'click',event=>{
  const button=event.target.closest('button');if(!button||busy)return;
  if(button.dataset.designTool){tool=button.dataset.designTool;for(const node of root.querySelectorAll('[data-design-tool]'))node.setAttribute('aria-pressed',String(node===button));}
  if(button.hasAttribute('data-design-undo')){changed();paths.pop();redraw();}
  if(button.hasAttribute('data-design-clear')){changed();paths=[];redraw();}
  if(button.dataset.designShape){changed();paths.push({shape:button.dataset.designShape,color:$('[data-design-color]').value,tool:'draw'});redraw();}
  if(button.hasAttribute('data-design-reset'))preview?.reset();
 });
 listen(root,'input',event=>{if(event.target.matches('input,select')){changed();$('[data-design-blend-output]').textContent=$('[data-design-blend]').value+'%';void updatePreview();}});
 listen($('[data-design-source]'),'change',()=>{
  changed();const model=base();$('[data-design-drawing]').hidden=!!model;$('[data-design-scale-control]').hidden=!model;for(const node of root.querySelectorAll('[data-design-depth-control]'))node.hidden=!!model;
  if(model){$('[data-design-name]').value=model.name+' · Factory edition';const config=factoryDesignerConfiguration(model.configuration||{},true);for(const name of ['material','color','scale','orientation','behavior'])$('[data-design-'+name+']').value=config[name];$('[data-design-blend]').value=config.colorBlend;}
  void updatePreview();
 });
 function refresh(){
  if(disposed||loading)return loading||Promise.resolve();
  $('[data-design-owned]').textContent='Loading owned GLB models…';
  loading=(async()=>{try{const wallet=typeof inventory.backpack==='function'?await inventory.backpack():await inventory.api('/api/wallet/state');if(disposed)return;const selected=$('[data-design-source]').value;models=factoryDesignerModels(wallet?.items||[]);const select=$('[data-design-source]');select.replaceChildren(new Option('New drawing','drawing'));for(const model of models)select.add(new Option(model.name||model.id,String(model.id)));if(models.some(item=>String(item.id)===selected))select.value=selected;else if(selected!=='drawing'){select.value='drawing';select.dispatchEvent(new Event('change'));}$('[data-design-owned]').textContent=models.length?models.length+' owned model'+(models.length===1?'':'s')+' ready to customize.':'No owned GLB models yet. Draw a part here or acquire a model in the Marketplace.';}catch(error){if(!disposed)$('[data-design-owned]').textContent=error.message;}finally{loading=null;}})();return loading;
 }
 async function save(){
  if(busy||disposed)return;
  const model=base(),configuration=settings(),name=$('[data-design-name]').value.trim();
  if(!name){status('Name your custom item.');$('[data-design-name]').focus();return;}
  if(!model&&!context.getImageData(0,0,canvas.width,canvas.height).data.some((value,index)=>index%4===3&&value>=96)){status('Draw a silhouette or add a starter shape first.');return;}
  const currentRevision=revision;busy=true;controls();status(savedPrototype?'Registering your saved blueprint…':'Saving your prototype…');
  try{
   if(!savedPrototype){
    pending ||= {requestId:crypto.randomUUID(),name,format:model?'glb':'svg',modelUrl:model?.modelUrl||'',thumbnailUrl:model?.thumbnailUrl||canvas.toDataURL('image/png'),configuration:{...configuration,...(!model?{collisionMask:drawingCollisionMask(canvas)}:{})}};
    const session=await inventory.session();savedPrototype=await inventory.api('/api/custom-items',{method:'POST',headers:{'X-CSRF-Token':session.csrfToken},body:JSON.stringify(pending)});
    if(disposed)return;signalInventoryChange();
   }
   await onSaved(savedPrototype);if(disposed||currentRevision!==revision)return;
   status('Blueprint selected for production. Review the MZK quote, then build and ship a batch.');savedPrototype=null;pending=null;
  }catch(error){if(!disposed)status(error.message+(savedPrototype?' Your prototype is saved; retry to register it without creating another copy.':''));}
  finally{if(!disposed){busy=false;controls();}}
 }
 listen($('[data-design-save]'),'click',()=>{void save();});listen($('[data-design-refresh]'),'click',()=>{void refresh();});
 listen(details,'toggle',()=>{if(details.open){void refresh();void updatePreview();}});
 return {open(){details.open=true;void refresh();void updatePreview();},refresh,dispose(){if(disposed)return;disposed=true;previewGeneration++;cancelAnimationFrame(previewFrame);for(const unlisten of listeners)unlisten();preview?.dispose();root.replaceChildren();}};
}
