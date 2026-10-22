const mountedViewports=new WeakMap();
let viewportSequence=0;
const icon=expanded=>'<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="'+(expanded?'M3 8h5V3m8 0v5h5M3 16h5v5m8 0v-5h5':'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5')+'"/></svg>';
const styleSnapshot=(element,names)=>names.map(name=>[name,element.style.getPropertyValue(name),element.style.getPropertyPriority(name)]);
const restoreStyle=(element,values)=>values.forEach(([name,value,priority])=>value?element.style.setProperty(name,value,priority):element.style.removeProperty(name));

// Keep the game usable when mobile browsers cannot grant native fullscreen.
// The page-sized mode uses the visible viewport, including Safari's toolbars.
export function mountGameViewport({stage,button=null,onChange=()=>{},onNeutralize=()=>{}}){
 if(!stage?.ownerDocument)throw new TypeError('A game stage is required.');
 if(mountedViewports.has(stage))return mountedViewports.get(stage);
 const document=stage.ownerDocument,window=document.defaultView,shell=stage.closest('.house-explorer-shell')||stage;
 const stylesheet=document.createElement('link');stylesheet.rel='stylesheet';stylesheet.href=new URL('../assets/game-viewport.css',import.meta.url).href;document.head.append(stylesheet);
 const originalButton=button?{parent:button.parentNode,next:button.nextSibling,html:button.innerHTML,attributes:[...button.attributes].map(attribute=>[attribute.name,attribute.value])}:null;
 button=button||document.createElement('button');button.type='button';button.classList.remove('house-bottom-control');button.classList.add('game-viewport-toggle');
 const addedId=!shell.id;if(addedId)shell.id='game-viewport-'+(++viewportSequence);button.setAttribute('aria-controls',shell.id);stage.append(button);
 const marker='viewport-'+(++viewportSequence),historyKey='__muzikazGameViewport';
 let expanded=false,disposed=false,saved=null,nativeEntered=false,generation=0,ownsHistory=false;
 const fullscreenElement=()=>document.fullscreenElement||document.webkitFullscreenElement;
 function setButton(){
  const label=expanded?'Exit full screen':'Full screen';button.innerHTML=icon(expanded)+'<span>'+label+'</span>';button.title=label;button.setAttribute('aria-label',label);button.setAttribute('aria-pressed',String(expanded));
  stage.dataset.viewportExpanded=String(expanded);
 }
 function dimensions(){const viewport=window.visualViewport;return {width:viewport?.width||window.innerWidth,height:viewport?.height||window.innerHeight,left:viewport?.offsetLeft||0,top:viewport?.offsetTop||0};}
 function notify(){
  const size=dimensions(),detail={expanded,mode:expanded?shell.dataset.viewportMode:'inline',width:size.width,height:size.height};
  onChange(detail);stage.dispatchEvent(new window.CustomEvent('muzikaz:game-viewport-change',{bubbles:true,detail}));
 }
 function resize(){
  if(!expanded)return;
  const size=dimensions();for(const [name,value]of Object.entries(size))shell.style.setProperty('--game-viewport-'+name,value+'px');
  notify();
 }
 function beginPageMode(){
  const placeholder=document.createComment('game viewport position');shell.before(placeholder);
  saved={placeholder,parent:shell.parentNode,next:shell.nextSibling,scrollX:window.scrollX,scrollY:window.scrollY,focus:document.activeElement,historyState:window.history.state,body:styleSnapshot(document.body,['position','top','left','right','width','overflow']),html:styleSnapshot(document.documentElement,['overflow','overscroll-behavior']),htmlClass:document.documentElement.classList.contains('game-viewport-open'),bodyClass:document.body.classList.contains('game-viewport-open'),background:[]};
  document.body.style.position='fixed';document.body.style.top=(-saved.scrollY)+'px';document.body.style.left=(-saved.scrollX)+'px';document.body.style.right='0';document.body.style.width='100%';document.body.style.overflow='hidden';
  document.documentElement.style.overflow='hidden';document.documentElement.style.overscrollBehavior='none';document.documentElement.classList.add('game-viewport-open');document.body.classList.add('game-viewport-open');
  document.body.append(shell);shell.classList.add('game-viewport-expanded');shell.dataset.viewportMode='page';
  // Existing modal dialogs remain usable when opened from the expanded game.
  // Everything else behind the game leaves keyboard and assistive-tech focus.
  for(const node of document.body.children)if(node!==shell&&!node.matches('dialog,script,style,link,[data-game-overlay]')){
   saved.background.push({node,inert:node.getAttribute('inert'),ariaHidden:node.getAttribute('aria-hidden')});node.setAttribute('inert','');node.setAttribute('aria-hidden','true');
  }
  try{window.history.pushState({...window.history.state,[historyKey]:marker},'',window.location.href);ownsHistory=true;}catch{ownsHistory=false;}
 }
 function restorePage({restoreHistory=true,restoreFocus=true}={}){
  if(!saved)return;
  const previous=saved;saved=null;shell.classList.remove('game-viewport-expanded');delete shell.dataset.viewportMode;
  for(const name of ['width','height','left','top'])shell.style.removeProperty('--game-viewport-'+name);
  if(previous.placeholder.isConnected){previous.placeholder.replaceWith(shell);}else if(previous.parent?.isConnected){previous.parent.insertBefore(shell,previous.next?.parentNode===previous.parent?previous.next:null);}
  restoreStyle(document.body,previous.body);restoreStyle(document.documentElement,previous.html);
  for(const {node,inert,ariaHidden}of previous.background){if(inert===null)node.removeAttribute('inert');else node.setAttribute('inert',inert);if(ariaHidden===null)node.removeAttribute('aria-hidden');else node.setAttribute('aria-hidden',ariaHidden);}
  if(!previous.htmlClass)document.documentElement.classList.remove('game-viewport-open');if(!previous.bodyClass)document.body.classList.remove('game-viewport-open');
  if(restoreFocus&&previous.focus?.isConnected)previous.focus.focus({preventScroll:true});window.scrollTo(previous.scrollX,previous.scrollY);
  if(ownsHistory&&window.history.state?.[historyKey]===marker){
   ownsHistory=false;
   if(restoreHistory)window.history.back();
   else try{window.history.replaceState(previous.historyState,'',window.location.href);}catch{}
  }else ownsHistory=false;
 }
 async function enter(){
  if(disposed||expanded)return;
  const token=++generation;onNeutralize();document.exitPointerLock?.();expanded=true;nativeEntered=false;beginPageMode();setButton();resize();button.focus({preventScroll:true});
  // Keep this call in the button's gesture. Awaiting setup first loses the
  // transient user activation required by Safari and other fullscreen APIs.
  if(typeof shell.requestFullscreen==='function'){
   try{
    await shell.requestFullscreen();
    if(disposed||!expanded||token!==generation){if(fullscreenElement()===shell)await document.exitFullscreen?.();return;}
    if(fullscreenElement()===shell){nativeEntered=true;shell.dataset.viewportMode='native';resize();}
   }catch{
    // Page mode is already active and keeps the same controls available.
    if(expanded&&token===generation){shell.dataset.viewportMode='page';resize();}
   }
  }
 }
 function exit({restoreHistory=true,restoreFocus=true}={}){
  if(!expanded&&!saved)return;
  expanded=false;generation++;nativeEntered=false;onNeutralize();
  if(fullscreenElement()===shell){try{const request=document.exitFullscreen?.()||document.webkitExitFullscreen?.();request?.catch?.(()=>{});}catch{}}
  restorePage({restoreHistory,restoreFocus});setButton();notify();
 }
 const toggle=()=>expanded?exit():enter();
 function handleClick(event){event.preventDefault();event.stopPropagation();toggle();}
 function fullscreenChanged(){
  if(fullscreenElement()===shell){if(!expanded){try{document.exitFullscreen?.();}catch{}return;}nativeEntered=true;shell.dataset.viewportMode='native';resize();}
  else if(expanded&&nativeEntered)exit();
 }
 function keydown(event){
  // An open dialog owns Escape before the outer game viewport does.
  if(!expanded||document.querySelector('dialog[open]'))return;
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();exit();return;}
  if(event.key!=='Tab')return;
  const controls=[...shell.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(node=>!node.closest('[hidden],[inert]')&&node.getClientRects().length);
  if(!controls.length){event.preventDefault();button.focus({preventScroll:true});return;}
  const first=controls[0],last=controls.at(-1),active=document.activeElement;
  if(!shell.contains(active)||event.shiftKey&&active===first||!event.shiftKey&&active===last){event.preventDefault();(event.shiftKey?last:first).focus({preventScroll:true});}
 }
 function popstate(){if(expanded&&window.history.state?.[historyKey]!==marker)exit({restoreHistory:false});}
 function pagehide(){exit({restoreHistory:false,restoreFocus:false});}
 button.addEventListener('click',handleClick);document.addEventListener('keydown',keydown);document.addEventListener('fullscreenchange',fullscreenChanged);document.addEventListener('webkitfullscreenchange',fullscreenChanged);
 window.addEventListener('resize',resize);window.addEventListener('orientationchange',resize);window.addEventListener('popstate',popstate);window.addEventListener('pagehide',pagehide);window.visualViewport?.addEventListener('resize',resize);window.visualViewport?.addEventListener('scroll',resize);
 setButton();
 const controller={button,enter,exit,toggle,get expanded(){return expanded;},dispose(){
  if(disposed)return;exit({restoreHistory:false,restoreFocus:false});disposed=true;generation++;
  button.removeEventListener('click',handleClick);document.removeEventListener('keydown',keydown);document.removeEventListener('fullscreenchange',fullscreenChanged);document.removeEventListener('webkitfullscreenchange',fullscreenChanged);
  window.removeEventListener('resize',resize);window.removeEventListener('orientationchange',resize);window.removeEventListener('popstate',popstate);window.removeEventListener('pagehide',pagehide);window.visualViewport?.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('scroll',resize);
  stylesheet.remove();delete stage.dataset.viewportExpanded;if(addedId)shell.removeAttribute('id');
  if(originalButton){for(const attribute of [...button.attributes])button.removeAttribute(attribute.name);for(const [name,value]of originalButton.attributes)button.setAttribute(name,value);button.innerHTML=originalButton.html;if(originalButton.parent)originalButton.parent.insertBefore(button,originalButton.next?.parentNode===originalButton.parent?originalButton.next:null);}else button.remove();
  mountedViewports.delete(stage);
 }};
 mountedViewports.set(stage,controller);return controller;
}
