const basketballHooks=new WeakMap();
function hooksFor(root){
 if(!root||typeof root!=='object')return [];
 const children=root.children||[],cached=basketballHooks.get(root);
 if(cached&&cached.children.length===children.length&&cached.children.every((child,index)=>child===children[index]))return cached.hooks;
 const hooks=[],visit=node=>{
  const state=node.userData?.setBasketballState,effects=node.userData?.updateBasketballEffects;
  if(typeof state==='function'||typeof effects==='function'){
   hooks.push({state,effects});return; // An arena root already updates its own hoops and screens.
  }
  for(const child of node===root?children:node.children||[])visit(child);
 };
 visit(root);basketballHooks.set(root,{children:[...children],hooks});return hooks;
}

// Caller passes individual placed assets, including server anchoring wrappers.
// Their hook discovery is cached so a full stadium is not traversed each frame.
export function updateBasketballBuilderAssets(roots,state,elapsed,reducedMotion=false){
 const states=new Set(),effects=new Set();
 for(const root of roots||[])for(const hook of hooksFor(root)){
  if(typeof hook.state==='function'&&!states.has(hook.state)){states.add(hook.state);hook.state(state);}
  if(typeof hook.effects==='function'&&!effects.has(hook.effects)){effects.add(hook.effects);hook.effects(elapsed,reducedMotion);}
 }
}
