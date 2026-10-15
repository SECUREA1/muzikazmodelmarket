export class OwnedItemPlacement {
 constructor({THREE,scene,canvas,stage,createPreview,pointAt,save,announce=()=>{}}){
  Object.assign(this,{THREE,scene,canvas,createPreview,pointAt,save,announce});this.pending=null;this.last=null;this.generation=0;this.saving=false;
  this.panel=document.createElement('section');this.panel.className='owned-placement-controls';this.panel.hidden=true;this.panel.setAttribute('aria-label','Place owned item');
  this.panel.innerHTML='<strong data-placement-name></strong><p>Touch or drag on the scene to position. Rotate, then tap Lock or the trigger.</p><div><button type="button" data-place-action="left" aria-label="Rotate item left 15 degrees">↶ 15°</button><button type="button" data-place-action="right" aria-label="Rotate item right 15 degrees">↷ 15°</button><button type="button" data-place-action="smaller" aria-label="Make item smaller">− Size</button><button type="button" data-place-action="larger" aria-label="Make item larger">+ Size</button><button type="button" data-place-action="aim">Aim position</button><button type="button" data-place-action="lock">Lock item ✓</button><button type="button" data-place-action="cancel">Cancel</button></div><output data-placement-readout aria-live="polite"></output>';
  stage.append(this.panel);
  this.editButton=document.createElement('button');this.editButton.type='button';this.editButton.className='owned-placement-edit';this.editButton.textContent='Move / rotate last item';this.editButton.hidden=true;stage.append(this.editButton);
  this.editButton.addEventListener('click',()=>{if(this.last&&!this.active)this.start(this.last.asset,this.last);});
  this.panel.addEventListener('click',event=>{const action=event.target.closest('[data-place-action]')?.dataset.placeAction;if(!this.pending||this.saving)return;if(action==='lock'){this.confirm();return;}if(action==='cancel'){this.cancel();return;}if(action==='left')this.pending.yaw-=Math.PI/12;if(action==='right')this.pending.yaw+=Math.PI/12;if(action==='smaller')this.pending.scale=Math.max(.25,this.pending.scale-.1);if(action==='larger')this.pending.scale=Math.min(3,this.pending.scale+.1);if(action==='aim')this.pending.follow=true;this.apply();});
  const place=event=>{if(!this.pending||this.saving||event.isPrimary===false)return;event.preventDefault();event.stopImmediatePropagation();const rect=canvas.getBoundingClientRect(),point=this.pointAt({x:(event.clientX-rect.left)/rect.width*2-1,y:-(event.clientY-rect.top)/rect.height*2+1});if(point){this.pending.point=point.clone();this.pending.follow=false;this.apply();}};
  canvas.addEventListener('pointerdown',event=>{if(!this.pending)return;this.pointer=event.pointerId;try{canvas.setPointerCapture(event.pointerId);}catch{}place(event);},true);
  canvas.addEventListener('pointermove',event=>{if(this.pointer===event.pointerId)place(event);},true);
  for(const name of ['pointerup','pointercancel'])canvas.addEventListener(name,event=>{if(this.pointer!==event.pointerId)return;this.pointer=null;if(this.pending){event.preventDefault();event.stopImmediatePropagation();}},true);
  canvas.addEventListener('click',event=>{if(this.active){event.preventDefault();event.stopImmediatePropagation();}},true);
 }
 get active(){return Boolean(this.pending);}
 async start(asset,existing=null){
  if(this.saving)return false;document.exitPointerLock?.();this.cancel();const generation=this.generation;
  this.announce('Preparing '+asset.name+' for placement…');
  try{
   const root=await this.createPreview(asset);if(generation!==this.generation){this.dispose(root);return false;}
   root.traverse(object=>{for(const material of [].concat(object.material||[])){material.transparent=true;material.opacity=.55;material.depthWrite=false;}});
   const point=existing?new this.THREE.Vector3(...existing.placement.position):this.pointAt({x:0,y:0});
   if(!point){this.dispose(root);throw Error('Aim at a nearby floor to place this item.');}
   this.pending={root,asset,existing,point:point.clone(),yaw:existing?.placement.rotation[1]||0,scale:existing?.placement.scale[0]||1,follow:!existing,requestId:crypto.randomUUID(),baseScale:root.scale.clone()};
   this.scene.add(root);this.panel.hidden=false;this.editButton.hidden=true;this.panel.querySelector('[data-placement-name]').textContent=asset.name;this.apply();
   this.announce('Touch the scene to position '+asset.name+'. Rotate, then tap Lock or the trigger.');return true;
  }catch(error){this.announce(error.message);return false;}
 }
 update(){if(this.pending?.follow&&!this.saving){const point=this.pointAt({x:0,y:0});if(point){this.pending.point.copy(point);this.apply();}}}
 apply(){const p=this.pending;if(!p)return;p.yaw=Math.atan2(Math.sin(p.yaw),Math.cos(p.yaw));p.root.position.copy(p.point);p.root.rotation.set(0,p.yaw,0);p.root.scale.copy(p.baseScale).multiplyScalar(p.scale);p.root.updateMatrixWorld(true);this.panel.querySelector('[data-placement-readout]').textContent=`Rotation ${Math.round(p.yaw*180/Math.PI)}° · Size ${p.scale.toFixed(1)}×`;}
 async confirm(){
  if(!this.pending||this.saving)return false;this.saving=true;const p=this.pending,generation=this.generation;
  const placement={position:p.point.toArray(),rotation:[0,p.yaw,0],scale:[p.scale,p.scale,p.scale]};
  this.panel.querySelectorAll('button').forEach(button=>button.disabled=true);
  try{const result=await this.save(p.asset,placement,p.existing,p.root,p.requestId);if(generation!==this.generation)return false;this.last={asset:p.asset,placement,...result};this.cancel();this.announce(p.asset.name+' locked in place.');return true;}
  catch(error){this.announce(error.message||'Placement was not saved. Try Lock again.');return false;}
  finally{this.saving=false;this.panel.querySelectorAll('button').forEach(button=>button.disabled=false);}
 }
 cancel(){this.generation++;if(this.pending)this.dispose(this.pending.root);this.pending=null;this.pointer=null;this.panel.hidden=true;this.editButton.hidden=!this.last;}
 reset(){this.last=null;this.cancel();}
 dispose(root){root.removeFromParent();root.traverse(object=>{object.geometry?.dispose();for(const material of [].concat(object.material||[]))material.dispose();});}
}
