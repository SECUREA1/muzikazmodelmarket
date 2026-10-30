import {GAME_HEADER_SELECTORS,gameHeaderControlFor} from './game-header-controls.js';
import {mountGamePanelVisibility} from './game-panel-visibility.js';
// Keep runtime visibility flags intact: incoming controls inherit the preference.
export function setGameActionBarsHidden(stage,hidden){
 const changed=stage.classList.contains('player-hide-action-bars')!==!!hidden;
 stage.classList.toggle('player-hide-action-bars',!!hidden);
 stage.closest('.house-explorer-shell')?.classList.toggle('player-hide-action-bars',!!hidden);
 if(changed)stage.dispatchEvent(new CustomEvent('muzikaz:action-bars-visibility'));
}
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
 const more=document.createElement('button');more.type='button';more.className='game-view-more';more.hidden=true;more.setAttribute('aria-label','More view controls');more.setAttribute('aria-expanded','false');more.title='Game controls and emergency response flow';more.innerHTML='<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';views.append(more,overflow);
 const closeOverflow=()=>{overflow.hidden=true;more.setAttribute('aria-expanded','false');};more.onclick=()=>{const open=overflow.hidden;overflow.hidden=!open;more.setAttribute('aria-expanded',String(open));};
 const groups=[],panelVisibility=new Map();let fitting=false,frame=null,lastLayout=null;
 const available=node=>!node.hidden&&getComputedStyle(node).display!=='none';
 const visible=node=>available(node)&&!node.closest('[hidden]');
 const panelControls='.world-resident-panel,.transport-radio-panel,.live-local-map [data-body]';
 function layoutState(){
  const state=[views.clientWidth,stage.clientHeight];
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
  const priority=node=>{const i=['game-camera-toggle','map-quest-launcher','district-map-toggle','factory-toggle','prison-toggle','factory-testing-toggle','factory-logistics-toggle','transport-activity','world-resident-ui'].findIndex(name=>node.classList.contains(name));return i<0?9:i;};groups.sort((a,b)=>priority(a)-priority(b));
  // Status badges and repeated snapshots do not change the toolbar footprint.
  // Reparenting an unchanged overflow group drops focus and pointer capture.
  const layout=layoutState();
  if(lastLayout&&layout.length===lastLayout.length&&layout.every((value,index)=>value===lastLayout[index])){fitting=false;return;}
  lastLayout=layout;
  // Every secondary control belongs to the same header extension on every
  // screen width. Keep nodes and their live handlers intact when fitting.
  for(const node of groups)if(node.parentElement!==overflow)overflow.append(node);
  more.hidden=!groups.some(available);if(more.hidden)closeOverflow();
  stage.style.setProperty('--game-view-controls-height','44px');stage.style.setProperty('--game-header-menu-height',Math.max(100,stage.clientHeight-180)+'px');fitting=false;
 }
 const schedule=()=>{if(frame===null)frame=requestAnimationFrame(fit);};
 const refit=()=>{lastLayout=null;schedule();};
 stage.addEventListener('muzikaz:action-bars-visibility',refit);
 stylesheet.addEventListener('load',()=>{lastLayout=null;schedule();});
 const outside=event=>{if(!views.contains(event.target))closeOverflow();};stage.ownerDocument.addEventListener('pointerdown',outside,true);
 views.addEventListener('keydown',event=>{if(event.key==='Escape'&&!overflow.hidden){event.preventDefault();event.stopPropagation();closeOverflow();more.focus();}});
 overflow.addEventListener('click',()=>{if(document.querySelector('dialog:modal'))closeOverflow();});
 const actions=document.createElement('div');actions.className='game-display-flow-actions';root.append(actions);stage.append(root);
 const selectors=GAME_HEADER_SELECTORS+',.casino-use,.funhouse-use,.funhouse-passport-hud,.funhouse-experience-hud,.funhouse-adventure-hud,.construction-controls,.road-vehicle-controls,.harbor-helm-controls,.airport-flight-controls,.owned-placement-controls,.basketball-hud,.fishing-hud,.shipping-hud,.firing-range-hud,.hockey-sports-bar,.nearby-gameplay-actions,.rad-tox-fire-trigger,.game-live-connection';
 const dock=stage.closest('.house-explorer-shell')?.querySelector('.game-dock-actions'),dockParent=dock?.parentElement,dockNext=dock?.nextSibling;
 if(dock){dock.dataset.headerControl='dock-actions';groups.push(dock);overflow.append(dock);}
 const collect=()=>{for(const child of [...stage.children,...views.children,...overflow.children]){if(child===root||child===views||!child.matches(selectors))continue;if(child.matches(GAME_HEADER_SELECTORS)){if(!groups.includes(child)){const definition=gameHeaderControlFor(child);if(definition){child.dataset.headerControl=definition.id;if(!child.getAttribute('aria-label')&&!child.matches('button'))child.setAttribute('aria-label',definition.label);}groups.push(child);views.insertBefore(child,more);}}else if(child.matches('.casino-use,.funhouse-use,.nearby-gameplay-actions,.rad-tox-fire-trigger'))actions.append(child);else{if(!child.classList.contains('game-panel')){const visibility=mountGamePanelVisibility(child);if(visibility)panelVisibility.set(child,visibility);}root.insertBefore(child,actions);}}schedule();};
 // Only new direct children need collecting. Changes inside an existing panel
 // already participate in its layout and must not rescan the whole stage.
 collect();const observer=new MutationObserver(collect);observer.observe(stage,{childList:true});
 const changes=new MutationObserver(records=>{if(records.some(({target,oldValue})=>oldValue!==target.getAttribute('hidden')&&target!==more&&target!==overflow&&!target.closest(panelControls)))schedule();});changes.observe(views,{subtree:true,attributes:true,attributeFilter:['hidden'],attributeOldValue:true});
 const resize=typeof ResizeObserver==='undefined'?null:new ResizeObserver(schedule);resize?.observe(views);resize?.observe(stage);
 return {root,views,dispose(){for(const visibility of panelVisibility.values())visibility.dispose();panelVisibility.clear();observer.disconnect();changes.disconnect();resize?.disconnect();if(frame!==null)cancelAnimationFrame(frame);stage.removeEventListener('muzikaz:action-bars-visibility',refit);stage.ownerDocument.removeEventListener('pointerdown',outside,true);for(const child of [...root.children]){if(child===actions||child===views)stage.append(...child.children);else stage.append(child);}for(const child of groups)if(child.isConnected)stage.append(child);views.remove();root.remove();stylesheet.remove();stage.style.removeProperty('--game-view-controls-height');stage.style.removeProperty('--game-header-menu-height');if(dock&&dockParent){if(dockNext?.parentElement===dockParent)dockParent.insertBefore(dock,dockNext);else dockParent.append(dock);}}};
}
