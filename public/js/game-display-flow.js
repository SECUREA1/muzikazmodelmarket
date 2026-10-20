// A single bottom anchor owns gameplay overlays. Panels and nearby actions
// participate in normal layout instead of competing for the same pixels.
export function mountGameDisplayFlow(stage){
 const stylesheet=document.createElement('link');stylesheet.rel='stylesheet';stylesheet.href=new URL('../assets/game-display-flow.css',import.meta.url).href;document.head.append(stylesheet);
 const root=document.createElement('div');root.className='game-display-flow';
 const actions=document.createElement('div');actions.className='game-display-flow-actions';root.append(actions);stage.append(root);
 const selectors='.owned-placement-controls,.basketball-hud,.firing-range-hud,.hockey-sports-bar,.nearby-gameplay-actions,.rad-tox-fire-trigger,.game-live-connection';
 const collect=()=>{for(const child of [...stage.children]){if(child===root||!child.matches(selectors))continue;if(child.matches('.nearby-gameplay-actions,.rad-tox-fire-trigger'))actions.append(child);else root.insertBefore(child,actions);}};
 collect();const observer=new MutationObserver(collect);observer.observe(stage,{childList:true});
 return {root,dispose(){observer.disconnect();for(const child of [...root.children]){if(child===actions)stage.append(...actions.children);else stage.append(child);}root.remove();stylesheet.remove();}};
}
