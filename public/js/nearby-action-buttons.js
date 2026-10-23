import {bindGameActionButton} from './game-action-button.js';
/** Portal travel and local item use remain independent, flowing controls. */
export function mountNearbyActionButtons({stage,itemButton,onPortal}){
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('../assets/nearby-action-buttons.css',import.meta.url).href;document.head.append(style);
 const root=document.createElement('div');root.className='nearby-gameplay-actions';root.setAttribute('role','group');root.setAttribute('aria-label','Nearby actions');
 const portal=document.createElement('button');portal.type='button';portal.className='builder-nearby-action builder-portal-action';portal.hidden=true;
 portal.innerHTML='<span class="builder-nearby-action__icon" aria-hidden="true">↗</span><strong>ENTER WORLD</strong><small></small>';
 let target=null,busy=false;
 const activate=async event=>{event.preventDefault();event.stopPropagation();if(!target||busy)return;const id=target.entityId;busy=true;portal.disabled=true;try{await onPortal(id);}finally{busy=false;portal.disabled=false;}};
 bindGameActionButton(portal,event=>void activate(event));
 root.append(itemButton,portal);stage.append(root);
 return {root,portal,renderPortal(action){target=action||null;portal.hidden=!target;if(target){portal.setAttribute('aria-label','Enter world: '+(target.hint||target.label));portal.querySelector('small').textContent=target.hint||target.label;}root.hidden=itemButton.hidden&&portal.hidden;}};
}
