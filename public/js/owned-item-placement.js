import {placementBounds} from './placed-item-collision.js';
import {meshStackPlacementOffset,stackPlacementOffset} from './stack-placement.js';
import {normalizeCatalogModel} from './builder-catalog.js';
import {compileBuilderScene} from './builder-gameplay-pipeline.js';

// Reuse the same scene contract for locally dropped market items. Moving an
// existing placement replaces its actor so interactions never target a ghost.
export function registerOwnedPlacement(runtime,asset,placement,id){
 const model=normalizeCatalogModel(asset,0);
 if(!model)return null;
 const vector=values=>Object.fromEntries(['x','y','z'].map((axis,index)=>[axis,values[index]]));
 const item={id:String(id),modelId:model.buildAssetId||model.id,objectType:model.type,
  asset:{buildAssetId:model.buildAssetId,modelUrl:model.modelUrl,basketballTeam:model.basketballTeam,attachment:model.attachment},
  position:vector(placement.position),rotation:vector(placement.rotation),scale:vector(placement.scale),
  functionalSettings:{behavior:model.behavior,action:model.action||'none',...model.function_data},
  animationState:model.animationState,vehicleSettings:model.vehicleSettings,movementSettings:model.movementSettings,
  aiSettings:model.aiSettings,questSettings:model.questSettings,dialogueSettings:model.dialogueSettings,environmentSettings:model.environmentSettings};
 const compiled=compileBuilderScene({objects:[item]}),manifest=runtime.manifest;
 manifest.objects=manifest.objects.filter(object=>object.objectId!==item.id).concat(compiled.objects);
 manifest.actors=manifest.actors.filter(actor=>actor.objectId!==item.id).concat(compiled.actors);
 manifest.objectCount=manifest.objects.length;manifest.actorCount=manifest.actors.length;
 runtime.instances.delete(item.id);runtime.cooldowns.delete(item.id);
 return item;
}
export class OwnedItemPlacement {
 constructor({THREE,scene,canvas,inputCanvases=[],stage,createPreview,pointAt,save,solids=()=>[],surfaces=null,canPlace=()=>true,announce=()=>{}}){
  Object.assign(this,{THREE,scene,canvas,createPreview,pointAt,save,solids,surfaces,canPlace,announce});this.pending=null;this.last=null;this.generation=0;this.saving=false;this.quickSettings={};try{this.quickSettings=JSON.parse(localStorage.getItem('muzikazQuickBricks')||'{}')||{};}catch{}
  this.panel=document.createElement('section');this.panel.className='owned-placement-controls';this.panel.hidden=true;this.panel.setAttribute('aria-label','Place owned item');
  this.panel.innerHTML='<strong data-placement-name></strong><p>Tap to drop, or drag to position without dropping. Open these settings to adjust, then Lock item. Escape cancels.</p><div><button type="button" data-place-action="left" aria-label="Rotate item left 15 degrees"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/></svg><span>15°</span></button><button type="button" data-place-action="right" aria-label="Rotate item right 15 degrees"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10a8 8 0 1 0-1 8M20 4v6h-6"/></svg><span>15°</span></button><button type="button" data-place-action="smaller" aria-label="Make item smaller">− Size</button><button type="button" data-place-action="larger" aria-label="Make item larger">+ Size</button><button type="button" data-place-action="lower" aria-label="Lower item 25 centimetres">− Height</button><button type="button" data-place-action="raise" aria-label="Raise item 25 centimetres">+ Height</button><button type="button" data-place-action="snap" aria-pressed="false">Grid · off</button><button type="button" data-place-action="reset">Reset changes</button><button type="button" data-place-action="aim">Follow aim</button><button type="button" data-place-action="lock">Lock item ✓</button><button type="button" data-place-action="quick">Set now — place per click</button><button type="button" data-place-action="single" hidden>Use placement panel each time</button><button type="button" data-place-action="cancel">Cancel</button></div><output data-placement-readout aria-live="polite"></output>';
  stage.append(this.panel);
  this.editButton=document.createElement('button');this.editButton.type='button';this.editButton.className='owned-placement-edit';this.setEditLabel('Move / rotate last item');this.editButton.hidden=true;stage.append(this.editButton);
  this.editButton.setAttribute('aria-expanded','false');
  this.editButton.addEventListener('click',async()=>{if(this.pending){this.panel.hidden=!this.panel.hidden;this.editButton.setAttribute('aria-expanded',String(!this.panel.hidden));this.apply();}else if(this.last&&!this.active){if(await this.start(this.last.asset,this.last)){this.panel.hidden=false;this.editButton.setAttribute('aria-expanded','true');}}});
  this.panel.addEventListener('click',event=>{const action=event.target.closest('[data-place-action]')?.dataset.placeAction;if(!this.pending||this.saving)return;if(action==='quick'){this.setQuickMode(true);this.confirm();return;}if(action==='single'){this.setQuickMode(false);return;}if(action==='lock'){this.confirm();return;}if(action==='cancel'){this.cancel();return;}this.adjust(action);});
  const place=event=>{if(!this.pending||this.saving||event.isPrimary===false)return;event.preventDefault();event.stopImmediatePropagation();const rect=canvas.getBoundingClientRect(),point=this.pointAt({x:(event.clientX-rect.left)/rect.width*2-1,y:-(event.clientY-rect.top)/rect.height*2+1});if(point){this.pending.point=point.clone();this.pending.follow=false;this.apply();}};
  this.inputCanvases=new Set([canvas,...inputCanvases]);
  for(const inputCanvas of this.inputCanvases){
  inputCanvas.addEventListener('pointerdown',event=>{if(!this.pending)return;this.pointer=event.pointerId;this.pointerStart={x:event.clientX,y:event.clientY};this.pointerDragged=false;try{canvas.setPointerCapture(event.pointerId);}catch{}place(event);},true);
  inputCanvas.addEventListener('pointermove',event=>{if(this.pointer===event.pointerId){this.pointerDragged ||= Math.hypot(event.clientX-this.pointerStart.x,event.clientY-this.pointerStart.y)>8;place(event);}},true);
  for(const name of ['pointerup','pointercancel'])inputCanvas.addEventListener(name,event=>{if(this.pointer!==event.pointerId)return;this.pointer=null;if(this.pending){event.preventDefault();event.stopImmediatePropagation();if(name==='pointerup'&&(this.pending.quick||this.panel.hidden)&&!this.pointerDragged)this.confirm();}},true);
  inputCanvas.addEventListener('click',event=>{if(this.active){event.preventDefault();event.stopImmediatePropagation();}},true);
  }
 }
 setEditLabel(label){this.editButton.setAttribute('aria-label',label);this.editButton.title=label;this.editButton.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 7 4v8l-7 4-7-4V7l7-4Zm-7 4 7 4 7-4m-7 4v8M3 20h5m-5 0v-5m0 5 4-4M21 4h-4m4 0v4"/></svg>';}
 releaseInputs(){const pointer=this.pointer;this.pointer=null;this.pointerStart=null;this.pointerDragged=false;for(const canvas of this.inputCanvases){try{if(pointer!=null&&canvas.hasPointerCapture?.(pointer))canvas.releasePointerCapture(pointer);}catch{}}}
 get active(){return Boolean(this.pending);}
 async start(asset,existing=null){
  if(this.saving)return false;document.exitPointerLock?.();this.cancel();const generation=this.generation;
  this.announce('Preparing '+asset.name+' for placement…');
  try{
   if(!await this.canPlace(asset,existing)||generation!==this.generation)return false;
   const root=await this.createPreview(asset);if(generation!==this.generation){this.dispose(root);return false;}
   root.traverse(object=>{for(const material of [].concat(object.material||[])){material.transparent=true;material.opacity=.55;material.depthWrite=false;}});
   const preset=!existing?this.quickSettings[asset.materialId||asset.id]:null;
   const point=existing?new this.THREE.Vector3(...existing.placement.position):this.pointAt({x:0,y:0});
   if(!point){this.dispose(root);throw Error('Aim at a nearby floor to place this item.');}
   this.pending={root,asset,existing,point:point.clone(),yaw:existing?.placement.rotation[1]??preset?.yaw??0,scale:existing?.placement.scale[0]??preset?.scale??1,height:preset?.height??0,snap:Boolean(preset?.snap),quick:Boolean(preset),follow:!existing,requestId:crypto.randomUUID(),baseScale:root.scale.clone()};
   this.pending.initial={point:this.pending.point.clone(),yaw:this.pending.yaw,scale:this.pending.scale,height:this.pending.height,snap:this.pending.snap};
   this.scene.add(root);this.panel.hidden=true;this.editButton.hidden=false;this.editButton.setAttribute('aria-expanded','false');this.setEditLabel('Placement settings');this.panel.querySelector('[data-placement-name]').textContent=asset.name;this.apply();
   if(preset)return this.confirm();
   this.announce('Touch the scene or use the trigger to place '+asset.name+'. Open the placement icon to rotate or resize.');return true;
  }catch(error){this.announce(error.message);return false;}
 }
 adjust(action){
  const p=this.pending;if(!p||this.saving)return false;
  if(action==='left')p.yaw-=Math.PI/12;
  else if(action==='right')p.yaw+=Math.PI/12;
  else if(action==='smaller')p.scale=Math.max(.25,Math.round((p.scale-.1)*100)/100);
  else if(action==='larger')p.scale=Math.min(3,Math.round((p.scale+.1)*100)/100);
  else if(action==='lower')p.height=Math.max(-10,p.height-.25);
  else if(action==='raise')p.height=Math.min(10,p.height+.25);
  else if(action==='snap')p.snap=!p.snap;
  else if(action==='aim')p.follow=true;
  else if(action==='reset'){p.point.copy(p.initial.point);Object.assign(p,{yaw:p.initial.yaw,scale:p.initial.scale,height:p.initial.height,snap:p.initial.snap,follow:false});}
  else return false;
  this.apply();return true;
 }
 rememberQuickSettings(){const p=this.pending;if(!p)return;this.quickSettings[p.asset.materialId||p.asset.id]={yaw:p.yaw,scale:p.scale,height:p.height,snap:p.snap};try{localStorage.setItem('muzikazQuickBricks',JSON.stringify(this.quickSettings));}catch{}}
 setQuickMode(enabled){
  const p=this.pending;if(!p||p.existing)return false;
  if(enabled)this.rememberQuickSettings();
  else delete this.quickSettings[p.asset.materialId||p.asset.id];
  try{localStorage.setItem('muzikazQuickBricks',JSON.stringify(this.quickSettings));}catch{}
  p.quick=enabled;this.panel.hidden=enabled;this.editButton.hidden=!enabled;this.setEditLabel('Placement settings');this.apply();return true;
 }
 update(){if(this.pending?.follow&&!this.saving){const point=this.pointAt({x:0,y:0});if(point){this.pending.point.copy(point);this.apply();}}}
 apply(){const p=this.pending;if(!p)return;this.panel.querySelector('[data-place-action=quick]').hidden=!!p.existing;this.panel.querySelector('[data-place-action=single]').hidden=!this.quickSettings[p.asset.materialId||p.asset.id]||!!p.existing;p.yaw=Math.atan2(Math.sin(p.yaw),Math.cos(p.yaw));p.root.position.copy(p.point);if(p.snap){p.root.position.x=Math.round(p.point.x*2)/2;p.root.position.z=Math.round(p.point.z*2)/2;}p.root.rotation.set(0,p.yaw,0);p.root.scale.copy(p.baseScale).multiplyScalar(p.scale);p.root.updateMatrixWorld(true);if(!p.existing){let bounds=placementBounds(this.THREE,p.root);if(!bounds.isEmpty()){p.root.position.y+=p.point.y-bounds.min.y;p.root.updateMatrixWorld(true);bounds=placementBounds(this.THREE,p.root);p.root.position.y+=this.surfaces?meshStackPlacementOffset(bounds,this.surfaces(p)):stackPlacementOffset(bounds,this.solids(p));}p.root.updateMatrixWorld(true);}p.root.position.y+=p.height;p.root.updateMatrixWorld(true);const snap=this.panel.querySelector('[data-place-action=snap]');snap.setAttribute('aria-pressed',String(p.snap));snap.textContent=p.snap?'Grid · 0.5 m':'Grid · off';this.panel.querySelector('[data-place-action=aim]').setAttribute('aria-pressed',String(p.follow));this.panel.querySelector('[data-placement-readout]').textContent=`X ${p.root.position.x.toFixed(2)} · Y ${p.root.position.y.toFixed(2)} · Z ${p.root.position.z.toFixed(2)} m · Rotation ${Math.round(p.yaw*180/Math.PI)}° · Size ${p.scale.toFixed(2)}×`;}
 async confirm(){
  if(!this.pending||this.saving)return false;this.apply();if(this.pending.quick)this.rememberQuickSettings();this.saving=true;this.panel.setAttribute('aria-busy','true');const p=this.pending,generation=this.generation;
  const placement={position:p.root.position.toArray(),rotation:[0,p.yaw,0],scale:[p.scale,p.scale,p.scale]};
  this.panel.querySelectorAll('button').forEach(button=>button.disabled=true);
  try{if(!await this.canPlace(p.asset,p.existing)){this.cancel();return false;}if(generation!==this.generation)return false;const result=await this.save(p.asset,placement,p.existing,p.root,p.requestId);if(generation!==this.generation)return false;this.last={asset:p.asset,placement,...result};
   if(p.quick){
    p.requestId=crypto.randomUUID();p.existing=null;p.follow=true;this.panel.hidden=true;this.editButton.hidden=false;this.setEditLabel('Placement settings');
    this.announce(p.asset.name+' placed. Tap or click to place another. Open Placement settings to change this mode.');
   }else{this.cancel();this.setEditLabel('Move / rotate last item');this.announce(p.asset.name+' locked in place.');}
   return true;}
  catch(error){if(generation===this.generation&&this.pending){this.panel.hidden=true;this.editButton.hidden=false;this.editButton.setAttribute('aria-expanded','false');}this.announce(error.message||'Placement was not saved. Try Lock again.');return false;}
  finally{this.saving=false;this.panel.setAttribute('aria-busy','false');this.panel.querySelectorAll('button').forEach(button=>button.disabled=false);}
 }
 cancel(){this.generation++;if(this.pending)this.dispose(this.pending.root);this.pending=null;this.releaseInputs();this.panel.hidden=true;this.editButton.hidden=!this.last;this.editButton.setAttribute('aria-expanded','false');}
 reset(){this.last=null;this.cancel();}
 dispose(root){root.removeFromParent();root.traverse(object=>{object.geometry?.dispose();for(const material of [].concat(object.material||[]))material.dispose();});}
}
