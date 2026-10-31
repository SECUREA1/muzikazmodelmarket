import {mountGamePanelVisibility} from './game-panel-visibility.js';
import {gameHeaderControlFor} from './game-header-controls.js';
const mountedFlows=new WeakMap();
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
 const existing=mountedFlows.get(stage);if(existing)return existing;
 const stylesheet=document.createElement('link');stylesheet.rel='stylesheet';stylesheet.href=new URL('../assets/game-display-flow.css',import.meta.url).href;document.head.append(stylesheet);
 const root=document.createElement('div');root.className='game-display-flow';
 const views=document.createElement('div');views.className='game-display-flow-views';views.setAttribute('role','toolbar');views.setAttribute('aria-label','Game view controls');stage.append(views);
 const overflow=document.createElement('div');overflow.className='game-view-overflow';overflow.hidden=true;overflow.dataset.gameplayBlocking='false';overflow.setAttribute('role','group');overflow.setAttribute('aria-label','More view controls');
 const more=document.createElement('button');more.type='button';more.className='game-view-more';more.hidden=true;more.title='More controls';more.setAttribute('aria-label','More view controls');more.setAttribute('aria-expanded','false');more.innerHTML='<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';views.append(more,overflow);
 const closeOverflow=()=>{overflow.hidden=true;more.setAttribute('aria-expanded','false');};more.onclick=()=>{const open=overflow.hidden;overflow.hidden=!open;more.setAttribute('aria-expanded',String(open));};
 const groups=[],panelVisibility=new Map(),menuButtons=new Map();let fitting=false,frame=null,lastLayout=null,disposed=false;
 const available=node=>!node.hidden&&getComputedStyle(node).display!=='none';
 const panelControls='.world-resident-panel,.transport-radio-panel,.live-local-map [data-body],.doomsday-panel';
 const launchers=group=>group.matches('button')?[group]:[...group.querySelectorAll('button')].filter(button=>!button.closest(panelControls));
 function labelButton(button,group){
  if(!menuButtons.has(button))menuButtons.set(button,{label:button.getAttribute('data-game-control-label'),decorated:button.classList.contains('game-view-menu-control'),addedAria:null});
  const label=button.getAttribute('aria-label')||button.textContent.trim()||button.title||gameHeaderControlFor(button)?.label||gameHeaderControlFor(group)?.label||'Game control';
  // Generated visual text must not append a second name to text-only controls.
  if(!button.hasAttribute('aria-label')&&!button.hasAttribute('aria-labelledby')){button.setAttribute('aria-label',label);menuButtons.get(button).addedAria=label;}
  button.dataset.gameControlLabel=label;button.classList.add('game-view-menu-control');
 }
 function layoutState(){
  const state=[views.clientWidth,stage.clientHeight];
  for(const group of groups){
   state.push(group,group.hidden);
   const controls=launchers(group);
   for(const button of controls){
    let hidden=false;
    for(let node=button;node&&node!==views&&node!==overflow;node=node.parentElement)if(node.hidden){hidden=true;break;}
    state.push(button,hidden,!!button.querySelector('svg'));
   }
  }
  return state;
 }
 function measureHeader(){
  const height=Math.max(44,Math.ceil(views.getBoundingClientRect().height));
  const set=(name,value)=>{if(stage.style.getPropertyValue(name)!==value)stage.style.setProperty(name,value);};
  set('--game-view-controls-height',height+'px');set('--game-header-menu-height',Math.max(100,stage.clientHeight-height-136)+'px');
 }
 function fit(){
  frame=null;if(fitting)return;fitting=true;
  // Every available SVG launcher stays across the top. Keep original grouped
  // components intact so their companion panels and input handlers still work.
  for(let i=groups.length-1;i>=0;i--)if(!groups[i].isConnected)groups.splice(i,1);
  const priority=node=>{const i=['game-flashlight-toggle','game-camera-toggle','map-quest-launcher','emergency-radio-toggle','emergency-nuclear-toggle','district-map-toggle','live-local-map','doomsday-menu','game-viewport-toggle','factory-toggle','prison-toggle','factory-testing-toggle','factory-logistics-toggle','transport-activity','world-resident-ui'].findIndex(name=>node.classList.contains(name));return i<0?20:i;};groups.sort((a,b)=>priority(a)-priority(b));
  // Status badges and repeated snapshots do not change the toolbar footprint.
  // Reparenting an unchanged overflow group drops focus and pointer capture.
  const layout=layoutState();
  if(lastLayout&&layout.length===lastLayout.length&&layout.every((value,index)=>value===lastLayout[index])){measureHeader();fitting=false;return;}
  lastLayout=layout;
  const pinned=groups.filter(node=>node.dataset.gameViewOverflow!=='true'&&launchers(node).some(button=>button.querySelector('svg'))),secondary=groups.filter(node=>!pinned.includes(node));
  let pinnedAnchor=more;for(let i=pinned.length-1;i>=0;i--){const node=pinned[i];if(node.parentElement!==views||node.nextSibling!==pinnedAnchor)views.insertBefore(node,pinnedAnchor);pinnedAnchor=node;}
  let menuAnchor=null;for(let i=secondary.length-1;i>=0;i--){const node=secondary[i];if(node.parentElement!==overflow||node.nextSibling!==menuAnchor)overflow.insertBefore(node,menuAnchor);menuAnchor=node;for(const button of launchers(node))labelButton(button,node);}
  more.hidden=![...overflow.children].some(available);if(more.hidden)closeOverflow();
  measureHeader();fitting=false;
 }
 const schedule=()=>{if(disposed)return;if(frame===null)frame=requestAnimationFrame(fit);};
 const refit=()=>{lastLayout=null;schedule();};
 stage.addEventListener('muzikaz:action-bars-visibility',refit);
 stylesheet.addEventListener('load',()=>{lastLayout=null;schedule();});
 const outside=event=>{if(!views.contains(event.target))closeOverflow();};stage.ownerDocument.addEventListener('pointerdown',outside,true);
 views.addEventListener('keydown',event=>{if(event.key==='Escape'&&!overflow.hidden){event.preventDefault();event.stopPropagation();closeOverflow();more.focus();}});
 overflow.addEventListener('click',()=>{if(document.querySelector('dialog:modal'))closeOverflow();});
 const actions=document.createElement('div');actions.className='game-display-flow-actions';root.append(actions);stage.append(root);
 const selectors='.emergency-radio-toggle,.emergency-nuclear-toggle,.doomsday-menu,.game-flashlight-toggle,.casino-use,.funhouse-use,.funhouse-audio-toggle,.funhouse-passport-hud,.funhouse-experience-hud,.funhouse-adventure-hud,.live-local-map,.game-viewport-toggle,.xr-enter-button,.construction-controls,.world-resident-ui,.road-vehicle-controls,.harbor-helm-controls,.harbor-ops-toggle,.airport-flight-controls,.owned-placement-controls,.basketball-hud,.fishing-hud,.shipping-hud,.firing-range-hud,.hockey-sports-bar,.nearby-gameplay-actions,.rad-tox-fire-trigger,.game-live-connection,.game-camera-toggle,.broadcast-controls,.sports-action-utilities,.district-map-toggle,.airport-ops-toggle,.ski-resort-toggle,.forge-toggle,.forest-toggle,.fitness-toggle,.fishing-toggle,.shipping-toggle,.factory-toggle,.prison-toggle,.factory-testing-toggle,.factory-logistics-toggle,.transport-activity,.map-quest-launcher';
 const collect=()=>{for(const child of [...stage.children,...views.children,...overflow.children]){if(child===root||child===views||!child.matches(selectors))continue;if(child.matches('.emergency-radio-toggle,.emergency-nuclear-toggle,.doomsday-menu,.game-flashlight-toggle,.funhouse-audio-toggle,.live-local-map,.game-viewport-toggle,.xr-enter-button,.world-resident-ui,.harbor-ops-toggle,.game-camera-toggle,.broadcast-controls,.sports-action-utilities,.district-map-toggle,.airport-ops-toggle,.ski-resort-toggle,.forge-toggle,.forest-toggle,.fitness-toggle,.fishing-toggle,.shipping-toggle,.factory-toggle,.prison-toggle,.factory-testing-toggle,.factory-logistics-toggle,.transport-activity,.map-quest-launcher')){if(!groups.includes(child)){groups.push(child);views.insertBefore(child,more);}}else if(child.matches('.casino-use,.funhouse-use,.nearby-gameplay-actions,.rad-tox-fire-trigger'))actions.append(child);else{if(!child.classList.contains('game-panel')){const visibility=mountGamePanelVisibility(child);if(visibility)panelVisibility.set(child,visibility);}root.insertBefore(child,actions);}}schedule();};
 // Only new direct children need collecting. Changes inside an existing panel
 // already participate in its layout and must not rescan the whole stage.
 collect();const observer=new MutationObserver(collect);observer.observe(stage,{childList:true});
 const changes=new MutationObserver(records=>{let refit=false;for(const {type,target,attributeName,oldValue}of records){if(type==='childList'){if(!target.closest(panelControls))refit=true;}else if(attributeName==='hidden'){if(oldValue!==target.getAttribute('hidden')&&target!==more&&target!==overflow&&!target.closest(panelControls))refit=true;if(!target.hidden&&target.matches(panelControls))requestAnimationFrame(()=>{if(!disposed&&!overflow.hidden&&!target.hidden&&overflow.contains(target))overflow.scrollTop+=target.getBoundingClientRect().top-overflow.getBoundingClientRect().top-6;});}else if(menuButtons.has(target)){const group=groups.find(group=>group===target||group.contains(target));if(group)labelButton(target,group);}}if(refit)schedule();});changes.observe(views,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','aria-label','title'],attributeOldValue:true});
 const resize=typeof ResizeObserver==='undefined'?null:new ResizeObserver(schedule);resize?.observe(views);resize?.observe(stage);
 const api={root,views,dispose(){if(disposed)return;disposed=true;mountedFlows.delete(stage);for(const visibility of panelVisibility.values())visibility.dispose();panelVisibility.clear();observer.disconnect();changes.disconnect();resize?.disconnect();if(frame!==null)cancelAnimationFrame(frame);stage.removeEventListener('muzikaz:action-bars-visibility',refit);stage.ownerDocument.removeEventListener('pointerdown',outside,true);for(const [button,original]of menuButtons){if(original.label===null)button.removeAttribute('data-game-control-label');else button.setAttribute('data-game-control-label',original.label);if(!original.decorated)button.classList.remove('game-view-menu-control');if(original.addedAria!==null&&button.getAttribute('aria-label')===original.addedAria)button.removeAttribute('aria-label');}menuButtons.clear();for(const child of [...root.children]){if(child===actions||child===views)stage.append(...child.children);else stage.append(child);}for(const child of groups)if(child.isConnected)stage.append(child);views.remove();root.remove();stylesheet.remove();stage.style.removeProperty('--game-view-controls-height');stage.style.removeProperty('--game-header-menu-height');}};
 mountedFlows.set(stage,api);return api;
}
