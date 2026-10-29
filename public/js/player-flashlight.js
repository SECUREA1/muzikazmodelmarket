import * as THREE from '../vendor/three/three.module.min.js';
import {requestGameInputRelease} from './game-input-release.js';

export function flashlightAvailable(state){return state?.outdoors===true&&Number.isFinite(state.daylight)&&state.daylight<.55;}

export function createPlayerFlashlight({scene,stage,getCamera,isReady=()=>true}){
 const document=stage.ownerDocument;
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('../assets/night-play.css',import.meta.url).href;document.head.append(style);
 const button=document.createElement('button');button.type='button';button.className='game-flashlight-toggle';button.hidden=true;
 button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 17 3 3 7-7-3-3-7 7Zm6-8 5-2 2 2-2 5-5-5Zm6-5 1-2m3 6 2-1m-3-2 2-2"/></svg>';
 button.setAttribute('aria-label','Turn flashlight on');button.setAttribute('aria-pressed','false');stage.append(button);
 // Keep one shadowless light in the scene even when switched off. Its light
 // count stays stable, so dusk and user toggles do not recompile scene shaders.
 const light=new THREE.SpotLight(0xfff1d0,0,42,Math.PI/7,.55,1.6);light.name='PLAYER_FLASHLIGHT';light.castShadow=false;
 const target=new THREE.Object3D();target.name='PLAYER_FLASHLIGHT_TARGET';light.target=target;scene.add(light,target);
 const origin=new THREE.Vector3(),direction=new THREE.Vector3();let requested=false,lastState=null,uiKey='',disposed=false;
 try{requested=document.defaultView.localStorage.getItem('muzikaz.flashlight.enabled')==='true';}catch{}
 function update(state=lastState){
  if(disposed)return;lastState=state;
  const available=flashlightAvailable(state),ready=!!isReady(),active=available&&ready&&requested&&!document.hidden;
  const nextKey=available+':'+ready+':'+requested;if(nextKey!==uiKey){uiKey=nextKey;button.hidden=!available;button.disabled=!ready;button.setAttribute('aria-pressed',String(available&&requested));button.setAttribute('aria-label',requested?'Turn flashlight off':'Turn flashlight on');button.title='Flashlight · '+(requested?'On':'Off');}
  light.intensity=active?100:0;
  if(active){const camera=getCamera();if(!camera){light.intensity=0;return;}camera.getWorldPosition(origin);camera.getWorldDirection(direction);light.position.copy(origin).addScaledVector(direction,.15);target.position.copy(origin).addScaledVector(direction,30);target.updateMatrixWorld();}
 }
 const stop=event=>event.stopPropagation();for(const type of ['pointerdown','pointerup','pointercancel','dblclick'])button.addEventListener(type,stop);
 button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();if(!flashlightAvailable(lastState)||!isReady())return;requestGameInputRelease('flashlight-toggle',document);requested=!requested;try{document.defaultView.localStorage.setItem('muzikaz.flashlight.enabled',String(requested));}catch{}update();});
 const visibility=()=>update();document.addEventListener('visibilitychange',visibility);
 return {button,update,reset(){lastState=null;uiKey='';light.intensity=0;button.hidden=true;},snapshot(){return {available:!button.hidden,requested,enabled:light.intensity>0,intensity:light.intensity,position:light.position.toArray(),target:target.position.toArray()};},dispose(){if(disposed)return;disposed=true;document.removeEventListener('visibilitychange',visibility);light.removeFromParent();target.removeFromParent();button.remove();style.remove();}};
}
