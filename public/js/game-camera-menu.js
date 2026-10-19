import {normalizeGameCameraMode,normalizeGameCameraScale} from './game-camera.js';

export const GAME_CAMERA_ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/></svg>';
const views=[['broadcast','Broadcast','Watch the whole play'],['first-person','First person','See through your player'],['top-down','Top down','Look straight down']];

/** One icon keeps view choices and independent camera zoom out of the playing field. */
export function mountGameCameraMenu({button,parent=document.body,getState,onMode,onScale,onOpenChange=()=>{},onClose=()=>{}}){
 if(!document.querySelector('[data-game-camera-menu-style]')){
  const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('../assets/game-camera-menu.css',import.meta.url).href;link.dataset.gameCameraMenuStyle='';document.head.append(link);
 }
 button.type='button';button.classList.add('game-camera-menu-button');button.dataset.gameCameraMenu='';button.innerHTML=GAME_CAMERA_ICON;
 button.setAttribute('aria-label','Camera views and zoom');button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-expanded','false');
 const dialog=document.createElement('dialog');dialog.className='game-camera-dialog';dialog.setAttribute('aria-label','Camera views and zoom');
 dialog.innerHTML='<header><div><small>YOUR VIEW</small><h2>Camera</h2></div><button type="button" data-camera-close aria-label="Close camera settings">×</button></header><p>Choose your view and adjust its zoom.</p><div class="game-camera-views"></div><footer><span>V switches player views</span><button type="button" data-camera-reset>Reset zoom</button></footer>';
 const choices=dialog.querySelector('.game-camera-views');
 for(const [mode,name,hint]of views){
  const row=document.createElement('section');row.className='game-camera-view';row.dataset.cameraView=mode;
  row.innerHTML=`<button type="button" data-camera-mode="${mode}" aria-pressed="false"><span>${name}<small>${hint}</small></span><span class="game-camera-selected" aria-hidden="true">✓</span></button><label><span>${name==='First person'?'Lens zoom':'View scale'}</span><output></output><input type="range" min="0.6" max="1.6" step="0.05" value="1" data-camera-scale="${mode}" aria-label="${name} zoom scale"></label>`;
  row.querySelector('button').onclick=()=>{if(getState().disabled)return;onMode(mode);sync();};
  const input=row.querySelector('input');input.oninput=()=>{if(getState().disabled)return;onScale(mode,normalizeGameCameraScale(input.value));sync();};
  choices.append(row);
 }
 parent.append(dialog);
 let disposed=false,notifiedOpen=false;
 function sync(){
  if(disposed)return;
  const state=getState(),mode=normalizeGameCameraMode(state.mode);
  button.disabled=!!state.disabled;button.dataset.gameCameraMode=mode;button.title='Camera: '+(views.find(view=>view[0]===mode)?.[1]||'First person');
  button.setAttribute('aria-expanded',String(dialog.open));
  for(const [key]of views){
   const row=dialog.querySelector(`[data-camera-view="${key}"]`),input=row.querySelector('input'),value=String(normalizeGameCameraScale(state.scales?.[key]));
   row.dataset.selected=String(mode===key);row.querySelector('button').setAttribute('aria-pressed',String(mode===key));
   if(input.value!==value)input.value=value;input.disabled=!!state.disabled;row.querySelector('button').disabled=!!state.disabled;
   const output=row.querySelector('output'),label=Math.round(Number(value)*100)+'%';if(output.textContent!==label)output.textContent=label;
  }
  if(state.disabled&&dialog.open)dialog.close();
 }
 function close(){if(dialog.open)dialog.close();}
 function notifyClose(){if(!notifiedOpen)return;notifiedOpen=false;button.setAttribute('aria-expanded','false');onOpenChange(false);onClose();}
 function toggle(){
  if(dialog.open){close();return;}if(getState().disabled)return;
  sync();if(document.pointerLockElement)document.exitPointerLock?.();
  dialog.showModal();notifiedOpen=true;button.setAttribute('aria-expanded','true');onOpenChange(true);
  dialog.querySelector(`[data-camera-mode="${normalizeGameCameraMode(getState().mode)}"]`)?.focus({preventScroll:true});
 }
 button.addEventListener('click',toggle);dialog.querySelector('[data-camera-close]').onclick=close;
 dialog.querySelector('[data-camera-reset]').onclick=()=>{for(const [mode]of views)onScale(mode,1);sync();};
 dialog.addEventListener('close',notifyClose);
 dialog.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();close();}});
 dialog.addEventListener('pointerdown',event=>event.stopPropagation());
 dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)close();}});
 sync();return {dialog,sync,toggle,close,get open(){return dialog.open;},dispose(){if(disposed)return;close();notifyClose();disposed=true;button.removeEventListener('click',toggle);dialog.remove();}};
}
