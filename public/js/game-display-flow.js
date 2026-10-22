// A single bottom anchor owns gameplay overlays. Panels and nearby actions
// participate in normal layout instead of competing for the same pixels.
export function mountGameDisplayFlow(stage){
 const stylesheet=document.createElement('link');stylesheet.rel='stylesheet';stylesheet.href=new URL('../assets/game-display-flow.css',import.meta.url).href;document.head.append(stylesheet);
 const root=document.createElement('div');root.className='game-display-flow';
 const views=document.createElement('div');views.className='game-display-flow-views';stage.append(views);
 const actions=document.createElement('div');actions.className='game-display-flow-actions';root.append(actions);stage.append(root);
 const shell=stage.closest('.house-explorer-shell')||stage,previousVisibility=new Map([...new Set([stage,shell])].map(node=>[node,node.getAttribute('data-hud-hidden')]));
 const toggle=document.createElement('button');toggle.type='button';toggle.className='game-hud-toggle';
 const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');icon.innerHTML='<path d="M3 12s3-7 9-7 9 7 9 7-3 7-9 7-9-7-9-7Z"/><circle cx="12" cy="12" r="3"/><path data-hide-mark d="m4 4 16 16"/>';
 const label=document.createElement('span');toggle.append(icon,label);views.append(toggle);let hudHidden=false;
 function setHudHidden(hidden){
  hidden=!!hidden;const changed=hudHidden!==hidden;hudHidden=hidden;
  for(const node of previousVisibility.keys())node.dataset.hudHidden=String(hidden);
  const action=hidden?'Show game controls':'Hide game controls';label.textContent=hidden?'Show controls':'Hide controls';toggle.title=action;toggle.setAttribute('aria-label',action);toggle.setAttribute('aria-pressed',String(hidden));icon.querySelector('[data-hide-mark]').style.display=hidden?'none':'';
  if(!changed)return;
  // Hiding a held pad must publish neutral before its pointer target disappears.
  window.dispatchEvent(new Event('blur'));
  stage.dispatchEvent(new CustomEvent('muzikaz:game-hud-visibility',{bubbles:true,detail:{hidden,stage}}));
  toggle.focus({preventScroll:true});window.dispatchEvent(new Event('resize'));
 }
 toggle.onclick=()=>setHudHidden(!hudHidden);setHudHidden(false);
 const selectors='.game-viewport-toggle,.xr-enter-button,.construction-controls,.world-resident-ui,.road-vehicle-controls,.harbor-helm-controls,.harbor-ops-toggle,.airport-flight-controls,.owned-placement-controls,.basketball-hud,.firing-range-hud,.hockey-sports-bar,.nearby-gameplay-actions,.rad-tox-fire-trigger,.game-live-connection,.game-camera-toggle,.broadcast-controls,.sports-action-utilities,.district-map-toggle,.airport-ops-toggle,.ski-resort-toggle,.transport-activity';
 const collect=()=>{for(const child of [...stage.children]){if(child===root||child===views||!child.matches(selectors))continue;if(child.matches('.game-viewport-toggle,.xr-enter-button,.world-resident-ui,.harbor-ops-toggle,.game-camera-toggle,.broadcast-controls,.sports-action-utilities,.district-map-toggle,.airport-ops-toggle,.ski-resort-toggle,.transport-activity'))views.append(child);else if(child.matches('.nearby-gameplay-actions,.rad-tox-fire-trigger'))actions.append(child);else root.insertBefore(child,actions);}};
 // Only new direct children need collecting. Changes inside an existing panel
 // already participate in its layout and must not rescan the whole stage.
 collect();const observer=new MutationObserver(collect);observer.observe(stage,{childList:true});
 const resize=typeof ResizeObserver==='undefined'?null:new ResizeObserver(()=>stage.style.setProperty('--game-view-controls-height',views.getBoundingClientRect().height+'px'));resize?.observe(views);
 return {root,views,setHudHidden,get hudHidden(){return hudHidden;},dispose(){setHudHidden(false);observer.disconnect();resize?.disconnect();toggle.remove();for(const child of [...root.children]){if(child===actions||child===views)stage.append(...child.children);else stage.append(child);}stage.append(...views.children);views.remove();root.remove();stylesheet.remove();stage.style.removeProperty('--game-view-controls-height');for(const [node,value]of previousVisibility)if(value===null)node.removeAttribute('data-hud-hidden');else node.setAttribute('data-hud-hidden',value);}};
}
