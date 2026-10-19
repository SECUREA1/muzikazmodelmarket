import {EnvironmentRegistry} from './environments/environment-registry.js';
import {mountWorldMapPicker} from './world-map-picker.js';
import {canonicalWorldId,sportsEnvironmentKind} from './sports-worlds.js';
import {readRadToxEnabled,setRadToxEnabled,watchRadToxEnabled} from './rad-tox-preference.js';

const mapIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z"/></svg>';
const radIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v8"/><path d="M7 5a9 9 0 1 0 10 0"/></svg>';

function loadAccessStyles(){
 if(document.querySelector('[data-game-page-access-style]'))return;
 const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('../assets/game-page-access.css',import.meta.url).href;link.dataset.gamePageAccessStyle='';document.head.append(link);
}

/** Reuse this button in the existing world dock; it never creates another map menu. */
export function mountRadToxToggle({parent,button=document.createElement('button'),className='',onChange=()=>{}}={}){
 loadAccessStyles();button.type='button';button.classList.add('game-rad-toggle');if(className)button.classList.add(...className.split(/\s+/).filter(Boolean));button.dataset.radToxToggle='';button.innerHTML='<b aria-hidden="true">'+radIcon+'</b><span>RAD-TOX encounters</span>';
 const sync=()=>{const enabled=readRadToxEnabled();button.dataset.radToxEnabled=String(enabled);button.setAttribute('aria-pressed',String(enabled));button.setAttribute('aria-label','RAD-TOX '+(enabled?'on. Turn encounters off':'off. Turn encounters on'));button.title='RAD-TOX '+(enabled?'on':'off')+' · Encounter preference for world exploration. Sports matches keep their own rules.';};
 const click=()=>{const enabled=setRadToxEnabled(!readRadToxEnabled());onChange(enabled);};
 button.addEventListener('click',click);const unwatch=watchRadToxEnabled(sync);parent?.append(button);sync();
 return {button,sync,dispose(){unwatch();button.removeEventListener('click',click);button.remove();}};
}

/** Native game pages use the same complete pie, live presence and real model preview. */
export function gameWorldDestination(environment,{base=globalThis.location?.href||'https://muzikaz.com/',mode}={}){
 const id=canonicalWorldId(environment.id),kind=sportsEnvironmentKind(environment),url=new URL(kind==='hockey'?'hockey.html':kind==='arcade'?'arcade.html':'model-explorer.html',base);
 url.searchParams.set('environment',id);
 const preferred=environment.multiplayer===false?'solo':['solo','ai','multiplayer','spectator'].includes(mode)?mode:'multiplayer';
 url.searchParams.set('mode',preferred);
 if(!['hockey','arcade'].includes(kind)){url.searchParams.set('house',id);url.searchParams.set('autoplay','1');}
 if(environment.meetingId)url.searchParams.set('meet',environment.meetingId);
 const enabled=environment.arcade?.enabled;if(kind==='arcade'&&enabled?.length===1)url.searchParams.set('attraction',enabled[0]);
 return url.href;
}

export function mountGamePageAccess({parent=document.body,currentId=()=>null,onOpenChange=()=>{},onClose=()=>{},onNavigate=url=>location.assign(url)}={}){
 loadAccessStyles();
 // The picker base rules are already present in the main explorer, and are
 // loaded here only for native pages that can open the same picker themselves.
 if(![...document.querySelectorAll('link[rel="stylesheet"]')].some(link=>link.href===new URL('../assets/game-menus.css',import.meta.url).href)){
  const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('../assets/game-menus.css',import.meta.url).href;document.head.append(link);
 }
 const root=document.createElement('div');root.className='game-page-access';root.setAttribute('role','group');root.setAttribute('aria-label','Maps and RAD-TOX encounters');
 const mapsButton=document.createElement('button');mapsButton.type='button';mapsButton.className='game-page-maps-button';mapsButton.innerHTML=mapIcon+'<span>Game maps</span>';mapsButton.setAttribute('aria-label','Game maps, 3D previews and enter destination');mapsButton.setAttribute('aria-haspopup','dialog');mapsButton.setAttribute('aria-expanded','false');mapsButton.title='Game maps · Pie, 3D preview and enter';root.append(mapsButton);
 const toggle=mountRadToxToggle({parent:root});parent.append(root);
 const dialog=document.createElement('dialog');dialog.className='game-page-map-dialog';dialog.setAttribute('aria-label','Game maps and 3D destination previews');const content=document.createElement('div');dialog.append(content);document.body.append(dialog);
 const registry=new EnvironmentRegistry();let picker=null,generation=0,disposed=false,notifiedOpen=false,presenceTimer=null;
 let worlds=[],presence=[];
 const counts=()=>worlds.map(env=>({env,count:Math.max(Number(env.playerCount)||0,presence.filter(user=>(user.roomId||'rad-tox')===env.id).length)}));
 const id=()=>typeof currentId==='function'?currentId():currentId;
 const options=()=>({currentId:id(),onClose:close,onJoin:async env=>{if(env.id===id()&&!env.meetingId){close();return;}await onNavigate(gameWorldDestination(env,{mode:new URL(location.href).searchParams.get('mode')}));close();}});
 function render(){if(disposed||!dialog.open||!worlds.length)return;picker=mountWorldMapPicker(content,counts(),options());}
 async function refreshPresence(request){
  try{const response=await (window.MUZIKAZ_API?.fetch?.bind(window.MUZIKAZ_API)||window.fetch.bind(window))('/api/houses/ioncore-house/presence',{headers:{Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(5000)});if(!response.ok)return;const payload=await response.json();if(disposed||request!==generation||!dialog.open)return;presence=Array.isArray((payload?.data??payload)?.users)?(payload.data??payload).users:[];render();}catch{/* Travel remains available when presence reconnects. */}
 }
 function notifyClose(){
  if(!notifiedOpen)return;notifiedOpen=false;generation++;clearInterval(presenceTimer);presenceTimer=null;picker?.dispose();picker=null;mapsButton.setAttribute('aria-expanded','false');onOpenChange(false);mapsButton.focus({preventScroll:true});onClose();
 }
 function close(){if(dialog.open)dialog.close();notifyClose();}
 async function openMaps(){
  if(disposed||dialog.open)return;
  const request=++generation;if(document.pointerLockElement)document.exitPointerLock?.();dialog.showModal();notifiedOpen=true;mapsButton.setAttribute('aria-expanded','true');onOpenChange(true);
  if(worlds.length)render();else content.innerHTML='<div class="game-page-map-loading"><button type="button" data-map-loading-close aria-label="Close game maps">×</button><p role="status">Loading game maps…</p></div>';
  content.querySelector('[data-map-loading-close]')?.addEventListener('click',close);
  try{const records=await registry.refresh();if(disposed||request!==generation||!dialog.open)return;worlds=records;render();void refreshPresence(request);presenceTimer=setInterval(()=>void refreshPresence(request),10000);}
  catch(error){if(disposed||request!==generation||!dialog.open)return;const status=content.querySelector('[role="status"]');if(status){status.textContent=error.message||'Game maps could not load.';const retry=document.createElement('button');retry.type='button';retry.textContent='Try again';retry.onclick=()=>{close();void openMaps();};status.after(retry);}}
 }
 mapsButton.addEventListener('click',openMaps);dialog.addEventListener('close',notifyClose);
 dialog.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();close();}});
 dialog.addEventListener('pointerdown',event=>event.stopPropagation());
 return {root,dialog,mapsButton,toggleButton:toggle.button,openMaps,close,get open(){return dialog.open;},dispose(){if(disposed)return;close();disposed=true;mapsButton.removeEventListener('click',openMaps);toggle.dispose();dialog.remove();root.remove();}};
}
