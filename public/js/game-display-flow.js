// A single bottom anchor owns gameplay overlays. Panels and nearby actions
// participate in normal layout instead of competing for the same pixels.
// Programmatic panel openings must also reveal their toolbar overflow group.
// Fixed-position descendants still inherit a hidden ancestor's visibility.
export function revealGameViewControl(control){
 const overflow=control?.closest?.('.game-view-overflow');
 if(!overflow?.hidden)return false;
 overflow.hidden=false;
 const more=[...(overflow.parentElement?.children||[])].find(node=>node.classList.contains('game-view-more'));
 more?.setAttribute('aria-expanded','true');
 return true;
}
export function mountGameDisplayFlow(stage){
 const stylesheet=document.createElement('link');stylesheet.rel='stylesheet';stylesheet.href=new URL('../assets/game-display-flow.css',import.meta.url).href;document.head.append(stylesheet);
 const root=document.createElement('div');root.className='game-display-flow';
 const views=document.createElement('div');views.className='game-display-flow-views';views.setAttribute('role','toolbar');views.setAttribute('aria-label','Game view controls');stage.append(views);
 const overflow=document.createElement('div');overflow.className='game-view-overflow';overflow.hidden=true;overflow.dataset.gameplayBlocking='false';overflow.setAttribute('role','group');overflow.setAttribute('aria-label','More view controls');
 const more=document.createElement('button');more.type='button';more.className='game-view-more';more.hidden=true;more.setAttribute('aria-label','More view controls');more.setAttribute('aria-expanded','false');more.innerHTML='<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';views.append(more,overflow);
 const closeOverflow=()=>{overflow.hidden=true;more.setAttribute('aria-expanded','false');};more.onclick=()=>{const open=overflow.hidden;overflow.hidden=!open;more.setAttribute('aria-expanded',String(open));};
 const groups=[];let fitting=false,frame=null,lastLayout=null;
 const visible=node=>!node.hidden&&!node.closest('[hidden]')&&getComputedStyle(node).display!=='none';
 const panelControls='.world-resident-panel,.transport-radio-panel,.live-local-map [data-body]';
 function layoutState(){
  const state=[views.clientWidth];
  for(const group of groups){
   state.push(group,group.hidden);
   const controls=group.matches('button')?[group]:[...group.querySelectorAll('button')].filter(button=>!button.closest(panelControls));
   for(const button of controls){
    let hidden=false;
    for(let node=button;node&&node!==views&&node!==overflow;node=node.parentElement)if(node.hidden){hidden=true;break;}
    state.push(button,hidden);
   }
  }
  return state;
 }
 function fit(){
  frame=null;if(fitting)return;fitting=true;
  // Keep original components and their handlers intact while fitting one row.
  for(let i=groups.length-1;i>=0;i--)if(!groups[i].isConnected)groups.splice(i,1);
  const priority=node=>{const i=['game-camera-toggle','map-quest-launcher','district-map-toggle','factory-toggle','transport-activity','world-resident-ui'].findIndex(name=>node.classList.contains(name));return i<0?6:i;};groups.sort((a,b)=>priority(a)-priority(b));
  // Status badges and repeated snapshots do not change the toolbar footprint.
  // Reparenting an unchanged overflow group drops focus and pointer capture.
  const layout=layoutState();
  if(lastLayout&&layout.length===lastLayout.length&&layout.every((value,index)=>value===lastLayout[index])){fitting=false;return;}
  lastLayout=layout;
  // The marker popup keeps a permanent right-hand slot beside overflow controls.
  const pinned=groups.filter(node=>node.classList.contains('live-local-map')),ordinary=groups.filter(node=>!pinned.includes(node));
  let anchor=more;for(let i=ordinary.length-1;i>=0;i--){const node=ordinary[i];if(node.parentElement!==views||node.nextSibling!==anchor)views.insertBefore(node,anchor);anchor=node;}
  for(const node of pinned)if(node.parentElement!==views||node.nextSibling!==overflow)views.insertBefore(node,overflow);
  more.hidden=true;let used=0;const gap=4,pinnedWidth=pinned.filter(visible).length*(44+gap),width=Math.max(0,views.clientWidth-pinnedWidth);
  const items=ordinary.filter(visible).map(node=>({node,width:Math.max(44,[...node.querySelectorAll('button')].filter(button=>visible(button)&&button.getClientRects().length>0&&!button.closest('.world-resident-panel,.transport-radio-panel')).reduce((sum,button)=>sum+Math.max(44,button.getBoundingClientRect().width)+gap,0)-gap)}));
  const total=items.reduce((sum,item)=>sum+item.width+gap,0)-gap,budget=total>width?Math.max(0,width-44-gap):width;
  for(const item of items){const needed=item.width+(used?gap:0);if(used+needed>budget){overflow.append(item.node);}else used+=needed;}
  more.hidden=!overflow.children.length;if(more.hidden)closeOverflow();
  stage.style.setProperty('--game-view-controls-height','44px');fitting=false;
 }
 const schedule=()=>{if(frame===null)frame=requestAnimationFrame(fit);};
 stylesheet.addEventListener('load',()=>{lastLayout=null;schedule();});
 const outside=event=>{if(!views.contains(event.target))closeOverflow();};stage.ownerDocument.addEventListener('pointerdown',outside,true);
 views.addEventListener('keydown',event=>{if(event.key==='Escape'&&!overflow.hidden){event.preventDefault();event.stopPropagation();closeOverflow();more.focus();}});
 overflow.addEventListener('click',()=>{if(document.querySelector('dialog:modal'))closeOverflow();});
 const actions=document.createElement('div');actions.className='game-display-flow-actions';root.append(actions);stage.append(root);
 const selectors='.live-local-map,.game-viewport-toggle,.xr-enter-button,.construction-controls,.world-resident-ui,.road-vehicle-controls,.harbor-helm-controls,.harbor-ops-toggle,.airport-flight-controls,.owned-placement-controls,.basketball-hud,.fishing-hud,.shipping-hud,.firing-range-hud,.hockey-sports-bar,.nearby-gameplay-actions,.rad-tox-fire-trigger,.game-live-connection,.game-camera-toggle,.broadcast-controls,.sports-action-utilities,.district-map-toggle,.airport-ops-toggle,.ski-resort-toggle,.fitness-toggle,.fishing-toggle,.shipping-toggle,.factory-toggle,.transport-activity,.map-quest-launcher';
 const collect=()=>{for(const child of [...stage.children,...views.children,...overflow.children]){if(child===root||child===views||!child.matches(selectors))continue;if(child.matches('.live-local-map,.game-viewport-toggle,.xr-enter-button,.world-resident-ui,.harbor-ops-toggle,.game-camera-toggle,.broadcast-controls,.sports-action-utilities,.district-map-toggle,.airport-ops-toggle,.ski-resort-toggle,.fitness-toggle,.fishing-toggle,.shipping-toggle,.factory-toggle,.transport-activity,.map-quest-launcher')){if(!groups.includes(child)){groups.push(child);views.insertBefore(child,more);}}else if(child.matches('.nearby-gameplay-actions,.rad-tox-fire-trigger'))actions.append(child);else root.insertBefore(child,actions);}schedule();};
 // Only new direct children need collecting. Changes inside an existing panel
 // already participate in its layout and must not rescan the whole stage.
 collect();const observer=new MutationObserver(collect);observer.observe(stage,{childList:true});
 const changes=new MutationObserver(records=>{if(records.some(({target,oldValue})=>oldValue!==target.getAttribute('hidden')&&target!==more&&target!==overflow&&!target.closest(panelControls)))schedule();});changes.observe(views,{subtree:true,attributes:true,attributeFilter:['hidden'],attributeOldValue:true});
 const resize=typeof ResizeObserver==='undefined'?null:new ResizeObserver(schedule);resize?.observe(views);
 return {root,views,dispose(){observer.disconnect();changes.disconnect();resize?.disconnect();if(frame!==null)cancelAnimationFrame(frame);stage.ownerDocument.removeEventListener('pointerdown',outside,true);for(const child of [...root.children]){if(child===actions||child===views)stage.append(...child.children);else stage.append(child);}for(const child of groups)if(child.isConnected)stage.append(child);views.remove();root.remove();stylesheet.remove();stage.style.removeProperty('--game-view-controls-height');}};
}
