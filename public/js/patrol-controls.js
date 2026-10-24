import {isCombatBoat} from './patrol-combat.js';
import {gameplayOverlayOpen} from './game-menu-controls.js';
export function mountPatrolControls({stage,command,getAim}){
 const shell=document.createElement('section');shell.className='patrol-cannon';shell.hidden=true;shell.setAttribute('aria-label','Patrol cannon');shell.innerHTML='<button type="button" aria-label="Fire patrol cannon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v6m0 10v6M1 12h6m10 0h6"/></svg></button><output></output>';stage.append(shell);
 const button=shell.querySelector('button'),ammo=shell.querySelector('output');let timer=null,busy=false,active=false,pointerId=null;
 const stop=()=>{const pointer=pointerId;pointerId=null;clearInterval(timer);timer=null;button.classList.remove('is-active');button.setAttribute('aria-pressed','false');try{if(pointer!==null&&button.hasPointerCapture?.(pointer))button.releasePointerCapture(pointer);}catch{}};
 async function fire(){if(!active||busy||document.hidden||gameplayOverlayOpen()){stop();return;}busy=true;try{await command('fire',{tool:'laser',direction:getAim().direction});}finally{busy=false;}}
 button.onpointerdown=event=>{if(event.button!==0||pointerId!==null||!active)return;event.preventDefault();event.stopPropagation();stop();pointerId=event.pointerId;try{button.setPointerCapture(event.pointerId);}catch{}button.classList.add('is-active');button.setAttribute('aria-pressed','true');void fire();timer=setInterval(fire,280);};
 const release=event=>{if(event.pointerId===pointerId)stop();};button.onpointerup=button.onpointercancel=button.onlostpointercapture=release;
 button.onclick=event=>{if(event.detail===0)void fire();};button.onblur=stop;shell.onclick=event=>event.stopPropagation();
 for(const name of ['pointerup','pointercancel'])window.addEventListener(name,release,true);
 window.addEventListener('blur',stop);document.addEventListener('visibilitychange',stop);document.addEventListener('muzikaz:release-game-input',stop);
 return {releaseInputs:stop,update(snapshot,id){const player=snapshot.players?.[id],boat=snapshot.actors?.[player?.vehicleId];active=isCombatBoat(boat)&&boat.active!==false&&boat.health>0;shell.hidden=!active;ammo.textContent=(player?.ammo??0)+' rounds';button.disabled=!active||(player?.ammo??0)<=0;if(!active)stop();},dispose(){stop();for(const name of ['pointerup','pointercancel'])window.removeEventListener(name,release,true);window.removeEventListener('blur',stop);document.removeEventListener('visibilitychange',stop);document.removeEventListener('muzikaz:release-game-input',stop);shell.remove();}};
}
