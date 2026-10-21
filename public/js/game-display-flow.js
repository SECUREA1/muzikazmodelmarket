// A single bottom anchor owns gameplay overlays. Panels and nearby actions
// participate in normal layout instead of competing for the same pixels.
export function mountGameDisplayFlow(stage){
 const stylesheet=document.createElement('link');stylesheet.rel='stylesheet';stylesheet.href=new URL('../assets/game-display-flow.css',import.meta.url).href;document.head.append(stylesheet);
 const root=document.createElement('div');root.className='game-display-flow';
 const views=document.createElement('div');views.className='game-display-flow-views';root.append(views);
 const actions=document.createElement('div');actions.className='game-display-flow-actions';root.append(actions);stage.append(root);
 const selectors='.owned-placement-controls,.basketball-hud,.firing-range-hud,.hockey-sports-bar,.nearby-gameplay-actions,.rad-tox-fire-trigger,.game-live-connection,.game-camera-toggle,.broadcast-controls';
 const collect=()=>{const sport=stage.querySelector('.basketball-hud:not([hidden]) .sports-action-utilities');if(sport){for(const button of [...views.children])sport.prepend(button);for(const button of [...stage.children])if(button.matches('.game-camera-toggle,.broadcast-controls'))sport.prepend(button);}else{for(const button of stage.querySelectorAll('.sports-action-utilities>.game-camera-toggle,.sports-action-utilities>.broadcast-controls'))views.append(button);}for(const child of [...stage.children]){if(child===root||!child.matches(selectors))continue;if(child.matches('.game-camera-toggle,.broadcast-controls'))views.append(child);else if(child.matches('.nearby-gameplay-actions,.rad-tox-fire-trigger'))actions.append(child);else root.insertBefore(child,actions);}};
 collect();const observer=new MutationObserver(collect);observer.observe(stage,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
 return {root,dispose(){observer.disconnect();for(const child of [...root.children]){if(child===actions||child===views)stage.append(...child.children);else stage.append(child);}root.remove();stylesheet.remove();}};
}
